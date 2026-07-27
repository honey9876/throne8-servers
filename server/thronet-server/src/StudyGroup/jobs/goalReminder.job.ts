/**
 * ====================================
 * GOAL REMINDER CRON JOB (FIXED)
 * ====================================
 * Runs daily to send goal reminders
 */

import cron from 'node-cron';
import { User } from '@/auth/models';
import Goal from '../models/Goal.model';
import { LoggerUtil } from '@/shared/logger.util';
import { NotificationType } from '../enums';
import notificationService from '../services/notification.service';
import { getStartOfDay, getEndOfDay } from '../utils/dateHelper';
import Progress from '../models/Progress.model';

/**
 * Get user's goal progress for today
 */
const getTodayProgress = async (userId: any): Promise<{
  goalHours: number;
  completedHours: number;
  percentage: number;
}> => {
  try {
    const today = new Date();
    const startOfToday = getStartOfDay(today);
    const endOfToday = getEndOfDay(today);

    // Get active goal
    const goal = await Goal.findOne({
      user: userId,
      startDate: { $lte: endOfToday },
      endDate: { $gte: startOfToday },
    });

    if (!goal) {
      return { goalHours: 0, completedHours: 0, percentage: 0 };
    }

    // Get today's progress
    const progress = await Progress.findOne({
      user: userId,
      date: {
        $gte: startOfToday,
        $lte: endOfToday,
      },
    });

    const completedHours = progress?.dailyStudyHours || 0;
    const goalHours = goal.targetHours || 0;
    const percentage = goalHours > 0 ? (completedHours / goalHours) * 100 : 0;

    return {
      goalHours,
      completedHours,
      percentage: Math.round(percentage),
    };
  } catch (error : any) {
    LoggerUtil.error(`Error getting progress for user ${userId}:`, error);
    return { goalHours: 0, completedHours: 0, percentage: 0 };
  }
};

/**
 * Morning goal reminder (9 AM)
 */
 const morningGoalReminderJob = async (): Promise<void> => {
  const startTime = Date.now();
  LoggerUtil.info('☀️ Starting morning goal reminder job...');

  try {
    const users = await User.find({ isActive: true }).select('_id name');
    let sent = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const progress = await getTodayProgress(user._id);

        if (progress.goalHours > 0) {
          await notificationService.createNotification({
            recipient: user._id,
            type: NotificationType.GOAL_REMINDER,
            title: '🌅 Good Morning! Start Your Study Session',
            message: `Today's goal: ${progress.goalHours} hours. Let's make it happen!`,
            data: {
              goalHours: progress.goalHours,
              timeOfDay: 'morning',
            },
          });

          sent++;
        }
      } catch (error : any) {
        errors++;
        LoggerUtil.error(`Failed to send morning reminder to user ${user._id}:`, error);
      }
    }

    const timeTaken = Date.now() - startTime;
    LoggerUtil.info(
      `✅ Morning reminders sent: ${sent}, Errors: ${errors}, Time: ${timeTaken}ms`
    );
  } catch (error : any) {
    LoggerUtil.error('❌ Morning goal reminder job failed:', error);
  }
};

/**
 * Evening goal reminder (6 PM)
 */
 const eveningGoalReminderJob = async (): Promise<void> => {
  const startTime = Date.now();
  LoggerUtil.info('🌆 Starting evening goal reminder job...');

  try {
    const users = await User.find({ isActive: true }).select('_id name');
    let sent = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const progress = await getTodayProgress(user._id);

        if (progress.goalHours > 0) {
          const remaining = progress.goalHours - progress.completedHours;

          if (remaining > 0) {
            await notificationService.createNotification({
              recipient: user._id,
              type: NotificationType.GOAL_REMINDER,
              title: '🎯 Evening Reminder: Complete Your Goal',
              message: `You have ${remaining.toFixed(1)} hours remaining to reach today's goal!`,
              data: {
                goalHours: progress.goalHours,
                completedHours: progress.completedHours,
                remainingHours: remaining,
                percentage: progress.percentage,
                timeOfDay: 'evening',
              },
            });

            sent++;
          } else if (progress.percentage >= 100) {
            await notificationService.createNotification({
              recipient: user._id,
              type: NotificationType.GOAL_ACHIEVED,
              title: '🎉 Goal Completed!',
              message: `Awesome! You've completed today's ${progress.goalHours}-hour study goal!`,
              data: {
                goalHours: progress.goalHours,
                completedHours: progress.completedHours,
                percentage: progress.percentage,
              },
            });

            sent++;
          }
        }
      } catch (error : any) {
        errors++;
        LoggerUtil.error(`Failed to send evening reminder to user ${user._id}:`, error);
      }
    }

    const timeTaken = Date.now() - startTime;
    LoggerUtil.info(
      `✅ Evening reminders sent: ${sent}, Errors: ${errors}, Time: ${timeTaken}ms`
    );
  } catch (error : any) {
    LoggerUtil.error('❌ Evening goal reminder job failed:', error);
  }
};

/**
 * Weekly goal summary (Sunday 8 PM)
 */
 const weeklyGoalSummaryJob = async (): Promise<void> => {
  LoggerUtil.info('📊 Starting weekly goal summary job...');

  try {
    const users = await User.find({ isActive: true }).select('_id name');
    let sent = 0;

    for (const user of users) {
      try {
        // Get weekly goal
        const goal = await Goal.findOne({
          user: user._id,
          type: 'weekly',
          isActive: true,
        });

        if (goal) {
          // Calculate weekly progress
          const weekStart = new Date();
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          weekStart.setHours(0, 0, 0, 0);

          const progressRecords = await Progress.find({
            user: user._id,
            date: { $gte: weekStart },
          });

          const totalHours = progressRecords.reduce(
            (sum, p) => sum + (p.dailyStudyHours || 0),
            0
          );

          const percentage = goal.targetHours > 0 
            ? (totalHours / goal.targetHours) * 100 
            : 0;

          await notificationService.createNotification({
            recipient: user._id,
            type: NotificationType.GOAL_REMINDER,
            title: '📊 Weekly Goal Summary',
            message: `This week: ${totalHours.toFixed(1)}/${goal.targetHours} hours (${Math.round(percentage)}%)`,
            data: {
              weeklyHours: totalHours,
              goalHours: goal.targetHours,
              percentage: Math.round(percentage),
              daysActive: progressRecords.length,
            },
          });

          sent++;
        }
      } catch (error : any) {
        LoggerUtil.error(`Failed to send weekly summary to user ${user._id}:`, error);
      }
    }

    LoggerUtil.info(`✅ Weekly summaries sent: ${sent}`);
  } catch (error : any) {
    LoggerUtil.error('❌ Weekly goal summary job failed:', error);
  }
};

/**
 * Motivational message (Random times)
 */
 const sendMotivationalMessages = async (): Promise<void> => {
  LoggerUtil.info('💪 Sending motivational messages...');

  const motivationalQuotes = [
    'The expert in anything was once a beginner. Keep going!',
    'Success is the sum of small efforts repeated day in and day out.',
    'Don\'t watch the clock; do what it does. Keep going.',
    'The only way to do great work is to love what you do.',
    'Believe you can and you\'re halfway there.',
  ];

  try {
    // Send to random subset of users
    const users = await User.aggregate([
      { $match: { isActive: true } },
      { $sample: { size: 50 } },
    ]);

    for (const user of users) {
      const randomQuote = motivationalQuotes[
        Math.floor(Math.random() * motivationalQuotes.length)
      ] || 'Keep up the great work!';

      await notificationService.createNotification({
        recipient: user._id,
        type: NotificationType.SYSTEM_UPDATE,
        title: '💪 Stay Motivated!',
        message: randomQuote,
        data: {
          category: 'motivation',
        },
      });
    }

    LoggerUtil.info(`✅ Motivational messages sent to ${users.length} users`);
  } catch (error : any) {
    LoggerUtil.error('❌ Failed to send motivational messages:', error);
  }
};

/**
 * Schedule goal reminder jobs
 */
 const scheduleGoalReminderJobs = (): void => {
  cron.schedule('0 9 * * *', morningGoalReminderJob, {
    timezone: 'Asia/Kolkata',
  });

  cron.schedule('0 18 * * *', eveningGoalReminderJob, {
    timezone: 'Asia/Kolkata',
  });

  cron.schedule('0 20 * * 0', weeklyGoalSummaryJob, {
    timezone: 'Asia/Kolkata',
  });

  cron.schedule('0 14 * * *', sendMotivationalMessages, {
    timezone: 'Asia/Kolkata',
  });

  LoggerUtil.info('📅 Goal reminder jobs scheduled:');
  LoggerUtil.info('  - Morning reminder: 9:00 AM daily');
  LoggerUtil.info('  - Evening reminder: 6:00 PM daily');
  LoggerUtil.info('  - Weekly summary: Sunday 8:00 PM');
  LoggerUtil.info('  - Motivational messages: 2:00 PM daily');
};

export {
  morningGoalReminderJob,
  eveningGoalReminderJob,
  weeklyGoalSummaryJob,
  sendMotivationalMessages,
  scheduleGoalReminderJobs,
};