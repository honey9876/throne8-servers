import * as cron from 'node-cron';
import { Job } from '@/Job-Service/models';
import { JobStatus } from '@/company/interfaces';
import logger from '@/shared/logger.util';

interface JobDocument {
  _id: string;
  title: string;
  company: {
    _id: string;
    name: string;
    email: string;
  };
  closingDate?: Date;
  applicationsCount: number;
  close(): Promise<JobDocument>;
}

class JobExpiryJob {
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  start(): void {
    if (this.cronJob) {
      logger.warn('Job expiry cron job is already running');
      return;
    }

    this.cronJob = cron.schedule('0 2 * * *', async () => {
      await this.run();
    });

    logger.info('✅ Job expiry cron job started (runs daily at 2:00 AM)');
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Job expiry cron job stopped');
    }
  }

  async run(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Job expiry job is already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('🔄 Starting job expiry check...'); 

      const expiredJobs = await Job.find({
        status: JobStatus.OPEN,
        isActive: true,
        closingDate: { $lte: new Date() },
      }).populate('company', 'name email');

      if (expiredJobs.length === 0) {
        logger.info('No expired jobs found');
        this.isRunning = false;
        return;
      }

      logger.info(`Found ${expiredJobs.length} expired jobs to close`);

      let closedCount = 0;
      let failedCount = 0;

      for (const job of expiredJobs) {
        try {
          await job.close();
          closedCount++;
          logger.info(`Closed expired job: ${job.title} (${job._id})`);
          await this.notifyCompany(job as unknown as JobDocument);
        } catch (error : any) {
          failedCount++;
          logger.error(`Failed to close job ${job._id}:`, error);
        }
      }

      const duration = Date.now() - startTime;

      logger.info('✅ Job expiry check completed', {
        totalExpired: expiredJobs.length,
        closed: closedCount,
        failed: failedCount,
        duration: `${duration}ms`,
      });
    } catch (error : any) {
      logger.error('❌ Job expiry check failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  async sendExpiryReminders(days: number): Promise<void> {
    try {
      logger.info(`Sending expiry reminders for jobs closing in ${days} days`);

      const expiringJobs = await Job.getExpiringJobs(days);

      if (expiringJobs.length === 0) {
        logger.info(`No jobs expiring in ${days} days`);
        return;
      }

      logger.info(`Found ${expiringJobs.length} jobs expiring in ${days} days`);

      for (const job of expiringJobs) {
        try {
          await this.sendReminderEmail(job as unknown as JobDocument, days);
          logger.info(`Sent reminder for job: ${job.title} (${job._id})`);
        } catch (error : any) {
          logger.error(`Failed to send reminder for job ${job._id}:`, error);
        }
      }

      logger.info('✅ Expiry reminders sent successfully');
    } catch (error : any) {
      logger.error('❌ Failed to send expiry reminders:', error);
    }
  }

  private async notifyCompany(job: JobDocument): Promise<void> {
    try {
      const companyEmail = job.company?.email;
      if (!companyEmail) {
        logger.warn(`No email found for company: ${job.company?._id}`);
        return;
      }

      logger.info(`Notification sent to ${companyEmail} for job: ${job.title}`);

      const notificationData = {
        to: companyEmail,
        subject: `Job Posting Expired: ${job.title}`,
        template: 'job-expired',
        data: {
          jobTitle: job.title,
          jobId: job._id,
          closingDate: job.closingDate,
          applicationsCount: job.applicationsCount,
        },
      };

      logger.debug('Notification payload:', notificationData);
    } catch (error : any) {
      logger.error('Failed to notify company:', error);
    }
  }

  private async sendReminderEmail(job: JobDocument, daysRemaining: number): Promise<void> {
    try {
      const companyEmail = job.company?.email;
      if (!companyEmail) {
        logger.warn(`No email found for company: ${job.company?._id}`);
        return;
      }

      logger.info(`Reminder sent to ${companyEmail} - ${daysRemaining} days remaining`);

      const reminderData = {
        to: companyEmail,
        subject: `Job Posting Expiring Soon: ${job.title}`,
        template: 'job-expiring-reminder',
        data: {
          jobTitle: job.title,
          jobId: job._id,
          daysRemaining,
          closingDate: job.closingDate,
          applicationsCount: job.applicationsCount,
        },
      };

      logger.debug('Reminder payload:', reminderData);
    } catch (error : any) {
      logger.error('Failed to send reminder email:', error);
    }
  }

  getStatus(): { running: boolean; nextRun: string | null } {
    return {
      running: this.isRunning,
      nextRun: this.cronJob ? new Date().toISOString() : null,
    };
  }
}

export default new JobExpiryJob();  