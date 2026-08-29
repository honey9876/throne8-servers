/**
 * ====================================
 * PROGRESS REPOSITORY - FINAL FIXED VERSION
 * ====================================
 */

import { BaseRepository } from './base.repository';
import Progress from '../models/Progress.model';
import { IProgress } from '../interfaces/IProgress';

export class ProgressRepository extends BaseRepository<IProgress> {
  constructor() {
    super(Progress);
  }

  /**
   * Find progress by user
   */
  async findByUser(userId: string, limit: number = 30): Promise<IProgress[]> {
  try {
    return await this.model
      .find({ user: userId })   // was: new mongoose.Types.ObjectId(userId)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec() as IProgress[];
  } catch (error: any) {
    throw new Error(`Error finding progress by user: ${error}`);
  }
}

  /**
   * Find progress by date
   */
  // UPDATE: findByDate — string userId
async findByDate(userId: string, date: Date): Promise<IProgress | null> {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return await this.model.findOne({
      user: userId,   // was: new mongoose.Types.ObjectId(userId)
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }).exec();
  } catch (error: any) {
    throw new Error(`Error finding progress by date: ${error}`);
  }
}

  /**
   * Find today's progress
   */
  async findTodaysProgress(userId: string): Promise<IProgress | null> {
    try {
      const today = new Date();
      return await this.findByDate(userId, today);
    } catch (error : any) {
      throw new Error(`Error finding today's progress: ${error}`);
    }
  }

  /**
   * Find progress by date range
   */
  // UPDATE: findByDateRange — string userId
async findByDateRange(userId: string, startDate: Date, endDate: Date): Promise<IProgress[]> {
  try {
    return await this.model.find({
      user: userId,   // string
      createdAt: { $gte: startDate, $lte: endDate },
    }).sort({ createdAt: 1 }).exec() as IProgress[];
  } catch (error: any) {
    throw new Error(`Error finding progress by date range: ${error}`);
  }
}

  /**
   * Get weekly progress
   */
  async getWeeklyProgress(userId: string): Promise<IProgress[]> {
    try {
      const today = new Date();
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      return await this.findByDateRange(userId, weekAgo, today);
    } catch (error : any) {
      throw new Error(`Error getting weekly progress: ${error}`);
    }
  }

  /**
   * Get monthly progress
   */
  async getMonthlyProgress(userId: string): Promise<IProgress[]> {
    try {
      const today = new Date();
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);

      return await this.findByDateRange(userId, monthAgo, today);
    } catch (error : any) {
      throw new Error(`Error getting monthly progress: ${error}`);
    }
  }

  /**
   * Update or create today's progress - FINAL FIX
   */
 async updateTodaysProgress(userId: string, updates: Partial<IProgress>): Promise<IProgress> {
  try {
    const progress = await this.model.findOneAndUpdate(
      { user: userId },
      { $set: { ...updates, lastUpdated: new Date() } },
      { new: true, upsert: true }   // upsert: nahi mila to create karo
    ).exec();
    return progress as IProgress;
  } catch (error: any) {
    throw new Error(`Error updating progress: ${error}`);
  }
}

  /**
   * Get total study hours
   */
  async getTotalStudyHours(userId: string): Promise<number> {
  try {
    const result = await this.model.aggregate([
      { $match: { user: userId } },    // string, no ObjectId
      { $group: { _id: null, totalHours: { $sum: '$totalStudyHours' } } },
    ]);
    return result[0]?.totalHours || 0;
  } catch (error: any) {
    throw new Error(`Error getting total study hours: ${error}`);
  }
}

  /**
   * Helper: Get the correct field name for study hours
   */
  private getStudyHoursFieldName(): string {
    // Check which field exists in the schema
    if ('totalStudyTime' in this.model.schema.paths) {
      return 'totalStudyTime';
    } else if ('studyHours' in this.model.schema.paths) {
      return 'studyHours';
    } else if ('hoursStudied' in this.model.schema.paths) {
      return 'hoursStudied';
    }
    return 'totalStudyTime'; // default fallback
  }

  /**
   * Get progress statistics
   */
  async getProgressStats(userId: string, days: number = 30): Promise<any> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.model.aggregate([
      { $match: { user: userId, createdAt: { $gte: startDate } } },   // string
      {
        $group: {
          _id: null,
          totalHours: { $sum: '$totalStudyHours' },
          avgHoursPerDay: { $avg: '$dailyStudyHours' },
          maxHoursInDay: { $max: '$dailyStudyHours' },
        },
      },
    ]);
    return stats[0] || {};
  } catch (error: any) {
    throw new Error(`Error getting progress stats: ${error}`);
  }
}

  /**
   * Get progress graph data
   */
async getGraphData(userId: string, days: number = 7): Promise<any[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await this.model.find({
      user: userId,    // string
      createdAt: { $gte: startDate },
    }).sort({ createdAt: 1 }).lean().exec();
  } catch (error: any) {
    throw new Error(`Error getting graph data: ${error}`);
  }
}

  // ADD: findOrCreate — getTotalProgress ke liye
async findOrCreate(userId: string): Promise<IProgress> {
  try {
    let progress = await this.model.findOne({ user: userId }).exec();
    if (!progress) {
      progress = await this.model.create({ user: userId });
    }
    return progress as IProgress;
  } catch (error: any) {
    throw new Error(`Error finding or creating progress: ${error}`);
  }
}
}

export default new ProgressRepository();
