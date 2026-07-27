// src/services/cron.service.ts
import { Coupon, Notification, Package, SessionMentor, Waitlist } from "../models";
import { logger } from "@/shared/logger.util";
import cron, { ScheduledTask } from "node-cron";
import emailService from "./email.service";

class CronService {
  private jobs: Map<string, ScheduledTask> = new Map();

  /**
   * Initialize all cron jobs
   */
  initializeJobs(): void {
    logger.info('🕐 Initializing cron jobs...');

    // Session reminders - every 5 minutes
    this.scheduleJob(
      'session-reminders',
      '*/5 * * * *',
      this.sendSessionReminders.bind(this)
    );

    // Expired coupons cleanup - daily at 2 AM
    this.scheduleJob(
      'expired-coupons',
      '0 2 * * *',
      this.cleanupExpiredCoupons.bind(this)
    );

    // Old notifications cleanup - daily at 3 AM
    this.scheduleJob(
      'old-notifications',
      '0 3 * * *',
      this.cleanupOldNotifications.bind(this)
    );

    // Package expiry notifications - daily at 9 AM
    this.scheduleJob(
      'package-expiry',
      '0 9 * * *',
      this.sendPackageExpiryNotifications.bind(this)
    );

    // Waitlist cleanup - daily at 4 AM
    this.scheduleJob(
      'waitlist-cleanup',
      '0 4 * * *',
      this.cleanupExpiredWaitlist.bind(this)
    );

    // Session status update - every 10 minutes
    this.scheduleJob(
      'session-status',
      '*/10 * * * *',
      this.updateSessionStatus.bind(this)
    );

    logger.info(`✅ ${this.jobs.size} cron jobs initialized`);
  }

  /**
   * Schedule a cron job
   */
  private scheduleJob(
    name: string,
    schedule: string,
    task: () => Promise<void>
  ): void {
    try {
      const job = cron.schedule(schedule, async () => {
        logger.info(`⏰ Running cron job: ${name}`);
        const startTime = Date.now();

        try {
          await task();
          const duration = Date.now() - startTime;
          logger.info(`✅ Cron job ${name} completed in ${duration}ms`);
        } catch(error : any) {
          logger.error(`❌ Cron job ${name} failed:$ {error}`);
        }
      });

      this.jobs.set(name, job);
      logger.info(`📅 Scheduled job: ${name} (${schedule})`);
    } catch(error : any) {
      logger.error(`Failed to schedule job ${name}: ${error}`);
    }
  }

  /**
   * Send session reminders
   */
  private async sendSessionReminders(): Promise<void> {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    // Find sessions starting in 1 hour
    const upcomingSessions = await SessionMentor.find({
      scheduledAt: {
        $gte: now,
        $lte: oneHourLater,
      },
      status: 'confirmed',
    }).lean();

    logger.info(`Found ${upcomingSessions.length} upcoming sessions`);

    for (const session of upcomingSessions) {
      try {
        // Send email reminder
        await emailService.sendEmail({
          to: session.menteeId,
          subject: 'Session Reminder - Starting in 1 hour',
          html: `<p>Your session is starting in 1 hour. Session ID: ${session._id}</p>`,
        });

        logger.info(`Sent reminder for session ${session._id}`);
      } catch(error : any) {
        logger.error(`Failed to send reminder for session ${session._id}: ${error}`);
      }
    }
  }

  /**
   * Cleanup expired coupons
   */
  private async cleanupExpiredCoupons(): Promise<void> {
    try {
      const now = new Date();
      const result = await Coupon.updateMany(
        {
          isActive: true,
          validUntil: { $lt: now },
        },
        {
          $set: { isActive: false },
        }
      );

      logger.info(`Deactivated ${result.modifiedCount} expired coupons`);
    } catch(error : any) {
      logger.error( `Failed to cleanup expired coupons:${error}`);
    }
  }

  /**
   * Cleanup old notifications
   */
  private async cleanupOldNotifications(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await Notification.deleteMany({
        'status.read': true,
        createdAt: { $lt: thirtyDaysAgo },
      });

      logger.info(`Deleted ${result.deletedCount} old notifications`);
    } catch(error : any) {
      logger.error(`Failed to cleanup old notifications:${error}`);
    }
  }

  /**
   * Send package expiry notifications
   */
  private async sendPackageExpiryNotifications(): Promise<void> {
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    const expiringPackages = await Package.find({
      status: 'active',
      expiresAt: {
        $lte: sevenDaysLater,
        $gte: new Date(),
      },
    }).lean();

    logger.info(`Found ${expiringPackages.length} expiring packages`);

    for (const pkg of expiringPackages) {
      try {
        const sessionsRemaining = pkg.remainingSessions;

        await Notification.create({
          userId: pkg.userId,
          type: 'package_expiring_soon',
          category: 'reminder',
          title: 'Package Expiring Soon',
          message: `Your package expires in 7 days. You have ${sessionsRemaining} sessions remaining.`,
          priority: 'medium',
          channels: {
            inApp: true,
            email: true,
            sms: false,
            push: true,
          },
          status: {
            sent: false,
            read: false,
            clicked: false,
          },
        });

        logger.info(`Sent expiry notification for package ${pkg._id}`);
      } catch(error : any) {
        logger.error(`Failed to send expiry notification for package ${pkg._id}: ${error}`);
      }
    }
  }

  /**
   * Cleanup expired waitlist entries
   */
  private async cleanupExpiredWaitlist(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await Waitlist.deleteMany({
      status: 'notified',
      notifiedAt: { $lt: sevenDaysAgo },
    });

    logger.info(`Deleted ${result.deletedCount} expired waitlist entries`);
  }

  /**
   * Update session status
   */
  private async updateSessionStatus(): Promise<void> {
    const now = new Date();

    // Mark past sessions as completed
    const result = await SessionMentor.updateMany(
      {
        scheduledAt: { $lt: now },
        status: 'confirmed',
      },
      {
        $set: { status: 'completed' },
      }
    );

    if (result.modifiedCount > 0) {
      logger.info(`Updated ${result.modifiedCount} sessions to completed`);
    }
  }

  /**
   * Stop a specific job
   */
  stopJob(name: string): boolean {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      this.jobs.delete(name);
      logger.info(`🛑 Stopped cron job: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Stop all jobs
   */
  stopAllJobs(): void {
    logger.info('🛑 Stopping all cron jobs...');
    for (const [name, job] of this.jobs.entries()) {
      job.stop();
      logger.info(`Stopped job: ${name}`);
    }
    this.jobs.clear();
    logger.info('✅ All cron jobs stopped');
  }

  /**
   * Get job status
   */
  getJobStatus(): Array<{ name: string; running: boolean }> {
    return Array.from(this.jobs.entries()).map(([name]) => ({
      name,
      running: true,
    }));
  }
}

export default new CronService();