/**
 * ====================================
 * STREAK SERVICE
 * ====================================
 * Business logic for streak management
 * Fixed: UTC timezone consistency
 */

import streakRepository from '../repositories/streak.repository';
import { IStreak } from '../interfaces/IStreak';
import { isSameDay } from '../utils/dateHelper';
import { NotFoundError } from '@/shared/errors/app.error';
import { LoggerUtil } from '@/shared/logger.util';

const MILESTONES = [7, 14, 30, 60, 90, 100, 180, 365];

/**
 * Get or create streak for user
 */
export const getOrCreateStreak = async (userId: string): Promise<IStreak> => {
  return await streakRepository.getOrCreate(userId);
};

/**
 * Update streak after user activity
 * FIX: UTC dates — server timezone pe dependent nahi rahega
 */
export const updateStreakAfterActivity = async (userId: string): Promise<IStreak> => {
  const streak = await streakRepository.getOrCreate(userId);

  // FIX: UTC midnight — consistent across all timezones
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Already updated today — return as-is
  if (streak.lastActivityDate && isSameDay(streak.lastActivityDate, today)) {
    return streak;
  }

  // FIX: UTC yesterday
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  if (streak.lastActivityDate && isSameDay(streak.lastActivityDate, yesterday)) {
    // Consecutive day — streak continue
    streak.currentStreak += 1;
  } else {
    // Streak broken ya fresh start
    if (streak.currentStreak > 0) {
      streak.streakBreaks += 1;
      streak.lastBreakDate = new Date();
    }
    streak.currentStreak = 1;
    streak.currentStreakStartDate = today;
  }

  streak.lastActivityDate = today;
  streak.isActive = true;

  // pre-save longestStreak aur milestones handle karega
  await streak.save();
  LoggerUtil.info(`Streak updated for user ${userId}: ${streak.currentStreak} days`);
  return streak;
};

/**
 * Get user streak
 */
export const getUserStreak = async (userId: string): Promise<IStreak> => {
  return await streakRepository.getOrCreate(userId);
};

/**
 * Get detailed streak statistics
 */
export const getStreakStats = async (userId: string): Promise<any> => {
  const streak = await streakRepository.getOrCreate(userId);

  const totalActiveDays = streak.currentStreak + streak.streakBreaks;

  const averageStreakLength = streak.streakBreaks > 0
    ? parseFloat((totalActiveDays / (streak.streakBreaks + 1)).toFixed(2))
    : streak.currentStreak;

  const daysSinceCreation = Math.ceil(
    (Date.now() - new Date(streak.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const consistencyRate = daysSinceCreation > 0
    ? parseFloat(((totalActiveDays / daysSinceCreation) * 100).toFixed(2))
    : 0;

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    totalActiveDays,
    totalStreakBreaks: streak.streakBreaks,
    averageStreakLength,
    consistencyRate,
    lastActivityDate: streak.lastActivityDate,
    isActive: streak.isActive,
    milestones: MILESTONES.map(m => ({
      days: m,
      achieved: streak.longestStreak >= m,
    })),
  };
};

/**
 * Global streak leaderboard
 */
export const getStreakLeaderboard = async (limit: number = 100): Promise<any[]> => {
  return await streakRepository.getLeaderboard(limit);
};

/**
 * Group-specific streak leaderboard
 */
export const getGroupStreakLeaderboard = async (
  userIds: string[],
  limit: number = 50
): Promise<any[]> => {
  return await streakRepository.getLeaderboardForUsers(userIds, limit);
};

/**
 * Reset user streak (admin/manual)
 */
export const resetUserStreak = async (userId: string): Promise<IStreak> => {
  const streak = await streakRepository.findByUser(userId);
  if (!streak) throw new NotFoundError('Streak record not found');

  streak.currentStreak = 0;
  streak.currentStreakStartDate = null;
  streak.isActive = false;
  streak.streakBreaks += 1;
  streak.lastBreakDate = new Date();

  await streak.save();
  LoggerUtil.info(`Streak reset for user ${userId}`);
  return streak;
};

/**
 * Cron job — break expired streaks (run daily at UTC midnight)
 */
export const checkAndBreakStreaks = async (): Promise<{ totalBroken: number }> => {
  const count = await streakRepository.breakExpiredStreaks();
  LoggerUtil.info(`Broke ${count} expired streaks`);
  return { totalBroken: count };
};

export default {
  getOrCreateStreak,
  updateStreakAfterActivity,
  getUserStreak,
  getStreakStats,
  getStreakLeaderboard,
  getGroupStreakLeaderboard,
  resetUserStreak,
  checkAndBreakStreaks,
};