// src/jobs/deadlineReminderCron.ts
import cron from 'node-cron';
import { UserInteractionModel } from '@/Job-Service/models';
import { logger } from '@/shared/logger.util';
import { emailService } from '@/Mentorship/services';
import { AppError } from '@/shared/errors/app.error';
import { User } from '@/auth/models';

/**
 * Cron job for sending application deadline reminders
 * Runs every hour
 */
class DeadlineReminderCron {
  static init(): void {
    // Every hour at minute 0
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('🔔 Running application deadline reminder cron');

        await this.sendUpcomingDeadlineReminders();

        logger.info('✅ Deadline reminder cron completed');
      } catch (error: any) {
        logger.error('❌ Error in deadline reminder cron:', error);
      }
    }, {
      timezone: "Asia/Kolkata"
    });

    logger.info('🔔 Deadline reminder cron initialized');
  }

  private static async sendUpcomingDeadlineReminders(): Promise<void> {
    const now = new Date();

    // Define reminder windows (e.g., 7 days, 3 days, 24 hours, 1 hour)
    const windows = [
      { days: 7, label: 'in 7 days' },
      { days: 3, label: 'in 3 days' },
      { days: 1, label: 'tomorrow' },
      { hours: 1, label: 'in 1 hour' },
    ];

    for (const window of windows) {
      let targetTime: Date;

      if (window.days) {
        targetTime = new Date(now);
        targetTime.setDate(targetTime.getDate() + window.days);
      } else if (window.hours) {
        targetTime = new Date(now.getTime() + window.hours * 60 * 60 * 1000);
      } else continue;

      // Small window to avoid missing (e.g. ±15 minutes)
      const start = new Date(targetTime.getTime() - 15 * 60 * 1000);
      const end = new Date(targetTime.getTime() + 15 * 60 * 1000);

      // Find users with active deadline reminders in this window
      const usersWithReminders = await UserInteractionModel.find({
        'notificationSettings.deadlineReminders': {
          $elemMatch: {
            status: 'active',
            applicationDeadline: { $gte: start, $lt: end },
            // Optional: remindersSent se check kar sakte ho ki pehle bheja ya nahi
          }
        }
      }).lean();

      logger.info(`Found ${usersWithReminders.length} users with deadlines ${window.label}`);

      for (const userDoc of usersWithReminders) {
        try {
          const reminders = userDoc.notificationSettings?.deadlineReminders || [];
          // const dueReminders = reminders.filter(r =>
          //   r.status === 'active' &&
          //   new Date(r.applicationDeadline) >= start &&
          //   new Date(r.applicationDeadline) < end
          // );

          const dueReminders = reminders.filter(r =>
            r.status === 'active' &&
            r.applicationDeadline && new Date(r.applicationDeadline) >= start &&
            r.applicationDeadline && new Date(r.applicationDeadline) < end
          );
          // Then in the loop (around line 71):
          const user = await User.findOne({ userId: userDoc.userId }).select('email').lean();
          if (!user?.email) continue;

          for (const reminder of dueReminders) {
            // Send email (customize as per your template)
            await emailService.sendEmail({
              to: user.email || 'user@example.com', // add email field if not there
              subject: `📅 Job Application Deadline Reminder - ${reminder.jobTitle}`,
              html: `
                <h2>Application Deadline Approaching!</h2>
                <p>Hi,</p>
                <p>Your application for <strong>${reminder.jobTitle}</strong> at <strong>${reminder.companyName}</strong> is due ${window.label}.</p>
                <p><strong>Deadline:</strong> ${reminder.applicationDeadline ? new Date(reminder.applicationDeadline).toLocaleString() : 'N/A'}</p>
                <p>Don't miss it! Apply now if you haven't.</p>
                <p>Best of luck! 🚀</p>
              `,
            });

            logger.info(`Deadline reminder sent for user ${userDoc.userId}, reminder ${reminder.reminderId}`);
          }
        } catch (err: any) {
          logger.error(`Failed to process reminders for user ${userDoc.userId}:`, err);
        }
      }
    }
  }

  static async triggerManually(): Promise<void> {
    logger.info('🔔 Manually triggering deadline reminder cron');
    await this.sendUpcomingDeadlineReminders();
  }
}

export default DeadlineReminderCron;