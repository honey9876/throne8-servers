// src/jobs/queryReminder.ts

import { schedule } from 'node-cron';
import { Query } from '@/Mentorship/models';
import { logger } from '@/shared/logger.util';
import { notificationService } from '@/Mentorship/services';
import  { NotificationChannel, NotificationType } from '@/Mentorship/services/notification.service';

class QueryReminderJob {
  /**
   * Send reminders for unanswered queries
   * Runs daily at 10 AM
   */
  static startReminders(): void {
    schedule('0 10 * * *', async () => {
      logger.info('📬 Starting query reminder job...');
      
      try {
        await this.sendPendingQueryReminders();
        await this.sendStaleQueryReminders();
        
        logger.info('✅ Query reminders sent successfully');
      } catch(error : any) {
        logger.error(`❌ Query reminder job failed:${error}`);
      }
    });

    logger.info('📅 Query reminder job scheduled (runs daily at 10 AM)');
  }

  /**
   * Send reminders for queries pending for 24 hours
   */
  private static async sendPendingQueryReminders(): Promise<void> {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const pendingQueries = await Query.find({
      status: 'pending',
      createdAt: { $lt: twentyFourHoursAgo },
      reminderSent: { $ne: true },
    }).lean();

    logger.info(`Found ${pendingQueries.length} pending queries needing reminders`);

    for (const query of pendingQueries) {
      try {
        await notificationService.sendNotification({
          userId: query.mentorId,
          type: NotificationType.BOOKING_CONFIRMED, // Reusing closest type
          channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
          data: {
            queryId: query._id,
            menteeId: query.menteeId,
            message: 'You have an unanswered query from 24 hours ago',
          },
          priority: 'normal',
        });

        // Mark reminder as sent
        await Query.findByIdAndUpdate(query._id, {
          $set: { reminderSent: true },
        });

        logger.info(`Sent reminder for query ${query._id}`);
      } catch(error : any) {
        logger.error(`Failed to send reminder for query ${query._id}:`, error);
      }
    }
  }

  /**
   * Send reminders for queries older than 3 days
   */
  private static async sendStaleQueryReminders(): Promise<void> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const staleQueries = await Query.find({
      status: 'pending',
      createdAt: { $lt: threeDaysAgo },
      escalated: { $ne: true },
    }).lean();

    logger.info(`Found ${staleQueries.length} stale queries needing escalation`);

    for (const query of staleQueries) {
      try {
        // Notify mentee about delay
        await notificationService.sendNotification({
          userId: query.menteeId,
          type: NotificationType.BOOKING_CONFIRMED,
          channels: [NotificationChannel.EMAIL],
          data: {
            queryId: query._id,
            message: 'Your query is taking longer than expected. We have escalated it.',
          },
          priority: 'high',
        });

        // Mark as escalated
        await Query.findByIdAndUpdate(query._id, {
          $set: { escalated: true, status: 'escalated' },
        });

        logger.info(`Escalated stale query ${query._id}`);
      } catch(error : any) {
        logger.error(`Failed to escalate query ${query._id}:`, error);
      }
    }
  }

  /**
   * Manual reminder trigger
   */
  static async sendRemindersNow(): Promise<void> {
    logger.info('🔄 Sending query reminders manually...');
    
    await this.sendPendingQueryReminders();
    await this.sendStaleQueryReminders();
    
    logger.info('✅ Manual reminders sent');
  }
}

export default QueryReminderJob;