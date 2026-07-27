// src/jobs/cleanupCron.ts

import { schedule } from "node-cron";
import { logger } from "@/shared/logger.util";
import { Notification,SessionMentor, Waitlist } from "@/Mentorship/models";

class CleanupCronJob {
  /**
   * Start all cleanup jobs
   */
  static startCleanup(): void {
    // Clean old notifications - Daily at 2 AM
    schedule('0 2 * * *', async () => {
      await this.cleanOldNotifications();
    });

    // Clean expired waitlist entries - Daily at 3 AM
    schedule('0 3 * * *', async () => {
      await this.cleanExpiredWaitlist();
    });

    // Clean old session data - Weekly on Sunday at 4 AM
    schedule('0 4 * * 0', async () => {
      await this.cleanOldSessions();
    });

    logger.info('📅 Cleanup jobs scheduled');
  }

  /**
   * Clean old read notifications (older than 30 days)
   */
  private static async cleanOldNotifications(): Promise<void> {
    try {
      logger.info('🧹 Cleaning old notifications...');

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await Notification.deleteMany({
        'status.read': true,
        'status.readAt': { $lt: thirtyDaysAgo },
      });

      logger.info(`✅ Deleted ${result.deletedCount} old notifications`);
    } catch(error : any) {
      logger.error(`❌ Failed to clean old notifications:${error}`);
    }
  }

  /**
   * Clean expired waitlist entries (notified but not booked for 7 days)
   */
  private static async cleanExpiredWaitlist(): Promise<void> {
    try {
      logger.info('🧹 Cleaning expired waitlist entries...');

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const result = await Waitlist.deleteMany({
        status: 'notified',
        notifiedAt: { $lt: sevenDaysAgo },
      });

      logger.info(`✅ Deleted ${result.deletedCount} expired waitlist entries`);
    } catch(error : any) {
      logger.error(`❌ Failed to clean expired waitlist:${error}`);
    }
  }

  /**
   * Archive old completed/cancelled sessions (older than 6 months)
   */
  private static async cleanOldSessions(): Promise<void> {
    try {
      logger.info('🧹 Cleaning old session data...');

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      // Just mark as archived, don't delete
      const result = await SessionMentor.updateMany(
        {
          status: { $in: ['completed', 'cancelled'] },
          updatedAt: { $lt: sixMonthsAgo },
        },
        {
          $set: { archived: true },
        }
      );

      logger.info(`✅ Archived ${result.modifiedCount} old sessions`);
    } catch(error : any) {
      logger.error(`❌ Failed to clean old sessions:${error}`);
    }
  }

  /**
   * Manual cleanup trigger
   */
  static async runManualCleanup(): Promise<void> {
    logger.info('🔄 Running manual cleanup...');
    
    await this.cleanOldNotifications();
    await this.cleanExpiredWaitlist();
    await this.cleanOldSessions();
    
    logger.info('✅ Manual cleanup completed');
  }
}

export default CleanupCronJob;