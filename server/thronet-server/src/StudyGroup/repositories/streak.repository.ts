/**
 * ====================================
 * STREAK REPOSITORY - FIXED
 * ====================================
 */

import { BaseRepository } from './base.repository';
import Streak from '../models/Streak.model';
import { IStreak } from '../interfaces/IStreak';
import mongoose from 'mongoose';

export class StreakRepository extends BaseRepository<IStreak> {
  constructor() {
    super(Streak);
  }

  /**
   * Find streak by user
   */
  async findByUser(userId: string): Promise<IStreak | null> {
    try {
      return await this.model.findOne({ user: userId }).exec();
    } catch (error: any) {
      throw new Error(`Error finding streak by user: ${error}`);
    }
  }

  /**
   * Get or create streak - FIXED
   */
  async getOrCreate(userId: string): Promise<IStreak> {
    try {
      let streak = await this.findByUser(userId);

      if (!streak) {
        // ✅ FIX: Convert userId to ObjectId
        streak = await this.create({
          user: userId,
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: null, // ✅ FIX: Correct field name
        } as Partial<IStreak>);
      }

      return streak;
    } catch (error: any) {
      throw new Error(`Error getting or creating streak: ${error}`);
    }
  }

  /**
   * Update streak (increment) - FIXED
   */
  async incrementStreak(userId: string): Promise<IStreak> {
    try {
      const streak = await this.getOrCreate(userId);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // ✅ FIX: Use correct field name
      const lastActive = streak.lastActivityDate
        ? new Date(streak.lastActivityDate)
        : null;

      if (lastActive) {
        lastActive.setHours(0, 0, 0, 0);
        const diffDays = Math.floor(
          (today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays === 0) {
          // Same day, no change
          return streak;
        } else if (diffDays === 1) {
          // Consecutive day, increment
          streak.currentStreak += 1;
        } else {
          // Streak broken, reset
          streak.currentStreak = 1;
        }
      } else {
        // First time
        streak.currentStreak = 1;
      }

      // Update longest streak
      if (streak.currentStreak > streak.longestStreak) {
        streak.longestStreak = streak.currentStreak;
      }

      // ✅ FIX: Use correct field name
      streak.lastActivityDate = today;

      return await streak.save();
    } catch (error: any) {
      throw new Error(`Error incrementing streak: ${error}`);
    }
  }

  /**
   * Reset streak - FIXED
   */
  async resetStreak(userId: string): Promise<IStreak> {
    try {
      const streak = await this.getOrCreate(userId);

      streak.currentStreak = 0;
      streak.lastActivityDate = null; // ✅ FIX: Correct field name

      return await streak.save();
    } catch (error: any) {
      throw new Error(`Error resetting streak: ${error}`);
    }
  }

  /**
   * Check if streak is at risk (no activity yesterday) - FIXED
   */
  async isStreakAtRisk(userId: string): Promise<boolean> {
    try {
      const streak = await this.findByUser(userId);
      // ✅ FIX: Use correct field name
      if (!streak || !streak.lastActivityDate) return false;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // ✅ FIX: Use correct field name
      const lastActive = new Date(streak.lastActivityDate);
      lastActive.setHours(0, 0, 0, 0);

      const diffDays = Math.floor(
        (today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
      );

      // If last active was 1 day ago and today has no activity
      return diffDays === 1;
    } catch (error: any) {
      throw new Error(`Error checking streak risk: ${error}`);
    }
  }

  /**
   * Get users with streaks at risk - FIXED
   */
  async getUsersWithStreakAtRisk(): Promise<IStreak[]> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);

      // ✅ FIX: Use correct field name
      const result = await this.model
        .find({
          currentStreak: { $gt: 0 },
          lastActivityDate: { $gte: yesterday, $lte: yesterdayEnd },
        })
        .populate('user', 'name email')
        .exec();

      return result as IStreak[];
    } catch (error: any) {
      throw new Error(`Error getting users with streak at risk: ${error}`);
    }
  }

  /**
   * Get top streaks (leaderboard)
   */
  async getTopStreaks(limit: number = 10): Promise<IStreak[]> {
    try {
      const result = await this.model
        .find({ currentStreak: { $gt: 0 } })
        .sort({ currentStreak: -1 })
        .limit(limit)
        .populate('user', 'name email avatar')
        .exec();

      return result as IStreak[];
    } catch (error: any) {
      throw new Error(`Error getting top streaks: ${error}`);
    }
  }

  /**
   * Get longest streaks (all-time)
   */
  async getLongestStreaks(limit: number = 10): Promise<IStreak[]> {
    try {
      const result = await this.model
        .find({ longestStreak: { $gt: 0 } })
        .sort({ longestStreak: -1 })
        .limit(limit)
        .populate('user', 'name email avatar')
        .exec();

      return result as IStreak[];
    } catch (error: any) {
      throw new Error(`Error getting longest streaks: ${error}`);
    }
  }

  // ADD: findByUserWithPopulate — leaderboard ke liye
  async findByUserWithPopulate(userId: string): Promise<IStreak | null> {
    try {
      return await this.model
        .findOne({ user: userId })
        .populate('user', 'name avatar')
        .lean()
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding streak with populate: ${error}`);
    }
  }

  // ADD: getLeaderboard — global leaderboard
  async getLeaderboard(limit: number = 100): Promise<IStreak[]> {
    try {
      return await this.model
        .find({ isActive: true })
        .sort({ currentStreak: -1, longestStreak: -1 })
        .limit(limit)
        .populate('user', 'name avatar')
        .lean()
        .exec() as unknown as IStreak[];
    } catch (error: any) {
      throw new Error(`Error getting leaderboard: ${error}`);
    }
  }

  // ADD: getLeaderboardForUsers — group leaderboard
  async getLeaderboardForUsers(userIds: string[], limit: number = 50): Promise<IStreak[]> {
    try {
      return await this.model
        .find({ user: { $in: userIds }, isActive: true })
        .sort({ currentStreak: -1, longestStreak: -1 })
        .limit(limit)
        .populate('user', 'name avatar')
        .lean()
        .exec() as unknown as IStreak[];
    } catch (error: any) {
      throw new Error(`Error getting group leaderboard: ${error}`);
    }
  }

  // ADD: countActiveStreaks
  async countActiveStreaks(): Promise<number> {
    try {
      return await this.model.countDocuments({ isActive: true }).exec();
    } catch (error: any) {
      throw new Error(`Error counting active streaks: ${error}`);
    }
  }

  // ADD: getUserRank — leaderboard mein user ki rank
  async getUserRank(userId: string): Promise<number> {
    try {
      const allStreaks = await this.model
        .find({ isActive: true })
        .sort({ currentStreak: -1, longestStreak: -1 })
        .select('user')
        .lean()
        .exec();
      const index = allStreaks.findIndex((s: any) => s.user === userId);
      return index >= 0 ? index + 1 : 0;
    } catch (error: any) {
      throw new Error(`Error getting user rank: ${error}`);
    }
  }

  // ADD: breakExpiredStreaks — cron job ke liye
  async breakExpiredStreaks(): Promise<number> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const result = await this.model.updateMany(
        {
          isActive: true,
          currentStreak: { $gt: 0 },
          lastActivityDate: { $lt: yesterday },
        },
        {
          $set: { currentStreak: 0, isActive: false, currentStreakStartDate: null },
          $inc: { streakBreaks: 1 },
          $currentDate: { lastBreakDate: true },
        }
      ).exec();

      return result.modifiedCount;
    } catch (error: any) {
      throw new Error(`Error breaking expired streaks: ${error}`);
    }
  }
}

export default new StreakRepository();