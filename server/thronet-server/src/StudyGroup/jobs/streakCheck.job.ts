/**
 * ====================================
 * STREAK CHECK CRON JOB (FIXED)
 * ====================================
 * Runs daily at 12:00 AM to check and update streaks
 */

import cron from 'node-cron';
import Streak from '../models/Streak.model';
import { User } from '@/auth/models';
import Attendance from '../models/Attendance.model';
import StudySession from '../models/StudySession.model';
import { LoggerUtil } from '@/shared/logger.util';
import { NotificationType } from '../enums/NotificationType.enum';
import notificationService from '../services/notification.service';
import { STREAK_CONSTANTS } from '../utils/constants';
import { addDays, getEndOfDay, getStartOfDay, isSameDay } from '../utils/dateHelper';

/**
 * Check if user was active yesterday
 */
const wasUserActiveYesterday = async (userId: any): Promise<boolean> => {
  try {
    const yesterday = addDays(new Date(), -1);
    const startOfYesterday = getStartOfDay(yesterday);
    const endOfYesterday = getEndOfDay(yesterday);

    // Check attendance
    const attendance = await Attendance.findOne({
      user: userId,
      date: {
        $gte: startOfYesterday,
        $lte: endOfYesterday,
      },
      status: 'present',
    });

    if (attendance) return true;

    // Check study sessions
    const session = await StudySession.findOne({
      user: userId,
      createdAt: {
        $gte: startOfYesterday,
        $lte: endOfYesterday,
      },
      status: 'completed',
    });

    return !!session;
  } catch (error : any) {
    LoggerUtil.error(`Error checking activity for user ${userId}:`, error);
    return false;
  }
};

/**
 * Process streak for a single user
 */
const processUserStreak = async (userId: any): Promise<void> => {
  try {
    let streak = await Streak.findOne({ user: userId });

    if (!streak) {
      streak = await Streak.create({
        user: userId,
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
      });
    }

    const wasActive = await wasUserActiveYesterday(userId);

    if (wasActive) {
      // User was active - increment streak
      streak.currentStreak += 1;
      streak.lastActivityDate = addDays(new Date(), -1);

      // Update longest streak if needed
      if (streak.currentStreak > streak.longestStreak) {
        streak.longestStreak = streak.currentStreak;
      }

      // Check for milestone achievements
      if (STREAK_CONSTANTS.MILESTONES.includes(streak.currentStreak)) {
        await notificationService.createNotification({
          recipient: userId,
          type: NotificationType.STREAK_MILESTONE,
          title: `🔥 ${streak.currentStreak} Day Streak!`,
          message: `Congratulations! You've maintained a ${streak.currentStreak}-day study streak!`,
          data: {
            streakDays: streak.currentStreak,
            milestone: true,
          },
        });

        LoggerUtil.info(`User ${userId} achieved ${streak.currentStreak}-day streak milestone`);
      }

      await streak.save();
      LoggerUtil.info(`Streak incremented for user ${userId}: ${streak.currentStreak} days`);
    } else {
      // User was not active - check if streak should break
      const lastActivity = streak.lastActivityDate;

      if (lastActivity) {
        const yesterday = addDays(new Date(), -1);

        // If last activity was not yesterday, break streak
        if (!isSameDay(lastActivity, yesterday)) {
          const brokenStreak = streak.currentStreak;

          // Send notification about broken streak
          if (brokenStreak > 0) {
            await notificationService.createNotification({
              recipient: userId,
              type: NotificationType.STREAK_REMINDER,
              title: '💔 Streak Broken',
              message: `Your ${brokenStreak}-day streak was broken. Start fresh today!`,
              data: {
                brokenStreak,
              },
            });

            LoggerUtil.warn(`Streak broken for user ${userId}: ${brokenStreak} days lost`);
          }

          // Reset current streak
          streak.currentStreak = 0;
          await streak.save();
        }
      }
    }
  } catch (error : any) {
    LoggerUtil.error(`Error processing streak for user ${userId}:`, error);
  }
};

/**
 * Send warning notifications to users who might lose their streak
 */
const sendStreakWarnings = async (): Promise<void> => {
  try {
    const today = new Date();
    const startOfToday = getStartOfDay(today);
    const endOfToday = getEndOfDay(today);

    // Get all users with active streaks
    const activeStreaks = await Streak.find({
      currentStreak: { $gt: 0 },
    }).populate('user');

    for (const streak of activeStreaks) {
      const userId = (streak.user as any)._id;

      // Check if user has any activity today
      const hasActivityToday = await StudySession.exists({
        user: userId,
        createdAt: {
          $gte: startOfToday,
          $lte: endOfToday,
        },
      });

      // If no activity today and it's evening, send warning
      const currentHour = new Date().getHours();
      if (!hasActivityToday && currentHour >= 18 && currentHour < 23) {
        await notificationService.createNotification({
          recipient: userId,
          type: NotificationType.STREAK_WARNING,
          title: '⚠️ Streak About to Break!',
          message: `Your ${streak.currentStreak}-day streak will break at midnight if you don't study today!`,
          data: {
            currentStreak: streak.currentStreak,
            timeRemaining: `${23 - currentHour} hours`,
          },
        });

        LoggerUtil.info(`Sent streak warning to user ${userId}`);
      }
    }
  } catch (error : any) {
    LoggerUtil.error('Error sending streak warnings:', error);
  }
};

/**
 * Main streak check job
 */
 const streakCheckJob = async (): Promise<void> => {
  const startTime = Date.now();
  LoggerUtil.info('🔥 Starting streak check job...');

  try {
    const users = await User.find({ isActive: true }).select('_id');
    LoggerUtil.info(`Processing streaks for ${users.length} users...`);

    let processed = 0;
    let errors = 0;

    for (const user of users) {
      try {
        await processUserStreak(user._id);
        processed++;
      } catch (error : any) {
        errors++;
        LoggerUtil.error(`Failed to process streak for user ${user._id}:`, error);
      }
    }

    const timeTaken = Date.now() - startTime;
    LoggerUtil.info(
      `✅ Streak check job completed. Processed: ${processed}, Errors: ${errors}, Time: ${timeTaken}ms`
    );
  } catch (error : any) {
    LoggerUtil.error('❌ Streak check job failed:', error);
  }
};

/**
 * Warning job - runs at 6 PM to warn users about potential streak breaks
 */
 const streakWarningJob = async (): Promise<void> => {
  LoggerUtil.info('⚠️ Starting streak warning job...');

  try {
    await sendStreakWarnings();
    LoggerUtil.info('✅ Streak warning job completed');
  } catch (error : any) {
    LoggerUtil.error('❌ Streak warning job failed:', error);
  }
};

/**
 * Schedule streak check job
 */
 const scheduleStreakCheckJob = (): void => {
  // Main streak check at midnight
  cron.schedule('0 0 * * *', streakCheckJob, {
    timezone: 'Asia/Kolkata',
  });

  // Warning at 6 PM
  cron.schedule('0 18 * * *', streakWarningJob, {
    timezone: 'Asia/Kolkata',
  });

  LoggerUtil.info('📅 Streak check job scheduled: 12:00 AM daily');
  LoggerUtil.info('📅 Streak warning job scheduled: 6:00 PM daily');
};

export  {
  streakCheckJob,
  streakWarningJob,
  scheduleStreakCheckJob,
};