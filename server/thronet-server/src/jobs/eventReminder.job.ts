// ============================================
// FILE 5: eventReminder.job.ts
// ============================================
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { Event } from '@/company/models';
import notificationService from '@/company/services/notification.service';
import logger from '@/shared/logger.util';

interface IEventLeanForJob {
  _id: string;
  title: string;
  slug: string;
  company: {
    name: string;
    email: string;
  };
  startDate: Date;
  endDate?: Date;
  mode: string;
  type?: string;
  location?: {
    venue?: string;
    city?: string;
  };
  registrations?: Array<{
    email?: string;
    phone?: string;
  }>;
}

class EventReminderJob {
  private job?: ScheduledTask;
  private isRunning = false;

  start(): void {
    try {
      this.job = cron.schedule('0,30 * * * *', async () => {
        if (this.isRunning) {
          logger.warn('Event reminder job already running, skipping...');
          return;
        }

        this.isRunning = true;
        try {
          await this.execute();
        } catch (error : any) {
          logger.error('Error in event reminder job', error);
        } finally {
          this.isRunning = false;
        }
      });

      logger.info('Event reminder job started (runs every 30 minutes)');
    } catch (error : any) {
      logger.error('Failed to start event reminder job', error);
      throw error;
    }
  }

  stop(): void {
    if (this.job) {
      this.job.stop();
      logger.info('Event reminder job stopped');
    }
  }

  private async execute(): Promise<void> {
    const startTime = Date.now();
    logger.info('Event reminder job executing...');

    try {
      await this.send1DayReminders();
      await this.send1HourReminders();
      await this.sendPostEventFeedback();
      await this.updateEventStatuses();

      const duration = Date.now() - startTime;
      logger.info(`Event reminder job completed in ${duration}ms`);
    } catch (error : any) {
      logger.error('Error executing event reminder job', error);
    }
  }

  private async send1DayReminders(): Promise<void> {
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const nextDay = new Date(tomorrow);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);

      const events = await Event.find({
        startDate: { $gte: tomorrow, $lt: nextDay },
        status: 'Upcoming',
        registrations: { $exists: true, $ne: [] },
      })
        .populate('company', 'name email')
        .lean<IEventLeanForJob[]>();

      logger.info(`Found ${events.length} events starting tomorrow`);

      for (const event of events) {
        try {
          await notificationService.sendEventReminder1Day(event);
        } catch (error : any) {
          logger.error(`Error sending 1-day reminder for event ${event._id}`, error);
        }
      }
    } catch (error : any) {
      logger.error('Error in send1DayReminders', error);
    }
  }

  private async send1HourReminders(): Promise<void> {
    try {
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      const thirtyMinLater = new Date(now.getTime() + 30 * 60 * 1000);

      const events = await Event.find({
        startDate: { $gte: thirtyMinLater, $lte: oneHourLater },
        status: { $in: ['Upcoming', 'Ongoing'] },
        registrations: { $exists: true, $ne: [] },
      })
        .populate('company', 'name email')
        .lean<IEventLeanForJob[]>();

      logger.info(`Found ${events.length} events starting in next hour`);

      for (const event of events) {
        try {
          await notificationService.sendEventReminder1Hour(event);
        } catch (error : any) {
          logger.error(`Error sending 1-hour reminder for event ${event._id}`, error);
        }
      }
    } catch (error : any) {
      logger.error('Error in send1HourReminders', error);
    }
  }

  private async sendPostEventFeedback(): Promise<void> {
    try {
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      const events = await Event.find({
        endDate: { $lte: threeHoursAgo },
        status: 'Completed',
        registrations: { $exists: true, $ne: [] },
        feedbackSentAt: { $exists: false },
      })
        .populate('company', 'name email')
        .lean<IEventLeanForJob[]>();

      logger.info(`Found ${events.length} events needing feedback`);

      for (const event of events) {
        try {
          await notificationService.sendEventFeedback(event);

          await Event.updateOne(
            { _id: event._id },
            { $set: { feedbackSentAt: new Date() } }
          );
        } catch (error : any) {
          logger.error(`Error sending feedback for event ${event._id}`, error);
        }
      }
    } catch (error : any) {
      logger.error('Error in sendPostEventFeedback', error);
    }
  }

  private async updateEventStatuses(): Promise<void> {
    try {
      const now = new Date();

      const upcomingToOngoing = await Event.updateMany(
        {
          status: 'Upcoming',
          startDate: { $lte: now },
          endDate: { $gte: now },
        },
        { $set: { status: 'Ongoing' } }
      );

      if (upcomingToOngoing.modifiedCount > 0) {
        logger.info(`Updated ${upcomingToOngoing.modifiedCount} events from Upcoming to Ongoing`);
      }

      const ongoingToCompleted = await Event.updateMany(
        {
          status: 'Ongoing',
          endDate: { $lt: now },
        },
        { $set: { status: 'Completed' } }
      );

      if (ongoingToCompleted.modifiedCount > 0) {
        logger.info(`Updated ${ongoingToCompleted.modifiedCount} events from Ongoing to Completed`);
      }

      const upcomingToCompleted = await Event.updateMany(
        {
          status: 'Upcoming',
          startDate: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          endDate: { $exists: false },
        },
        { $set: { status: 'Completed' } }
      );

      if (upcomingToCompleted.modifiedCount > 0) {
        logger.info(`Updated ${upcomingToCompleted.modifiedCount} events from Upcoming to Completed (no end date)`);
      }
    } catch (error : any) {
      logger.error('Error in updateEventStatuses', error);
    }
  }

  async forceRun(): Promise<void> {
    logger.info('Forcing event reminder job to run...');
    if (this.isRunning) {
      logger.warn('Job already running');
      return;
    }
    this.isRunning = true;
    try {
      await this.execute();
    } finally {
      this.isRunning = false;
    }
  }

  getStatus(): Record<string, unknown> {
    return {
      running: this.isRunning,
      active: this.job ? true : false,
      nextRun: this.job ? 'Every 30 minutes' : 'Stopped',
    };
  }
}

export default new EventReminderJob();