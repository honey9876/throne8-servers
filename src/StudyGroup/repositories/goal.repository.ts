/**
 * ====================================
 * GOAL REPOSITORY
 * ====================================
 */

import { BaseRepository } from './base.repository';
import Goal from '../models/Goal.model';
import { IGoal } from '../interfaces/IGoal';
import mongoose from 'mongoose';

export class GoalRepository extends BaseRepository<IGoal> {
  constructor() {
    super(Goal);
  }

  // service mein Goal.findOne() use ho raha tha daily/weekly goal ke liye
  async findOne(query: any): Promise<IGoal | null> {
    try {
      return await this.model.findOne(query).lean().exec();
    } catch (error: any) {
      throw new Error(`Error finding goal: ${error}`);
    }
  }

  // ADD: findByGoalId — UUID se fetch (lean)
  async findByGoalId(goalId: string): Promise<IGoal | null> {
    try {
      return await this.model.findOne({ goalId }).lean().exec();
    } catch (error: any) {
      throw new Error(`Error finding goal by goalId: ${error}`);
    }
  }

  // ADD: findRawByGoalId — save() ke liye
  async findRawByGoalId(goalId: string, userId: string): Promise<IGoal | null> {
    try {
      return await this.model.findOne({ goalId, user: userId }).exec();
    } catch (error: any) {
      throw new Error(`Error finding raw goal: ${error}`);
    }
  }

  // ADD: findWithPagination
  async findWithPagination(
    filter: any,
    sort: any,
    skip: number,
    limit: number
  ): Promise<IGoal[]> {
    try {
      return await this.model
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec() as unknown as IGoal[];
    } catch (error: any) {
      throw new Error(`Error finding goals with pagination: ${error}`);
    }
  }

  // ADD: count
  async count(filter: any): Promise<number> {
    try {
      return await this.model.countDocuments(filter).exec();
    } catch (error: any) {
      throw new Error(`Error counting goals: ${error}`);
    }
  }

  // ADD: deleteByGoalId
  async deleteByGoalId(goalId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.model
        .findOneAndDelete({ goalId, user: userId })
        .exec();
      return !!result;
    } catch (error: any) {
      throw new Error(`Error deleting goal: ${error}`);
    }
  }

  // ADD: updateByGoalId
  async updateByGoalId(goalId: string, userId: string, updates: any): Promise<IGoal | null> {
    try {
      const goal = await this.model.findOne({ goalId, user: userId }).exec();
      if (!goal) return null;
      Object.assign(goal, updates);
      await goal.save();
      return goal.toObject();
    } catch (error: any) {
      throw new Error(`Error updating goal: ${error}`);
    }
  }

  // ADD: updateProgressByGoalId — goalId UUID se
  async updateProgressByGoalId(goalId: string, userId: string, hoursToAdd: number): Promise<IGoal | null> {
    try {
      const goal = await this.model.findOne({ goalId, user: userId }).exec();
      if (!goal) return null;

      goal.currentHours += hoursToAdd;
      if (goal.currentHours < 0) goal.currentHours = 0;

      return await goal.save();  // pre-save middleware auto-complete handle karega ✅
    } catch (error: any) {
      throw new Error(`Error updating goal progress: ${error}`);
    }
  }

  // ADD: markAsCompleteByGoalId
  async markAsCompleteByGoalId(goalId: string, userId: string): Promise<IGoal | null> {
    try {
      return await this.model.findOneAndUpdate(
        { goalId, user: userId },
        { completed: true, completedAt: new Date() },
        { new: true }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error marking goal complete: ${error}`);
    }
  }

  // ADD: markAsIncompleteByGoalId
  async markAsIncompleteByGoalId(goalId: string, userId: string): Promise<IGoal | null> {
    try {
      return await this.model.findOneAndUpdate(
        { goalId, user: userId },
        { completed: false, completedAt: null },
        { new: true }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error marking goal incomplete: ${error}`);
    }
  }

  /**
   * Find goals by user
   */
  async findByUser(
    userId: string,
    filters: {
      completed?: boolean;
      category?: string;
      tags?: string[];
    } = {}
  ): Promise<IGoal[]> {
    try {
      const query: any = { user: userId };

      if (filters.completed !== undefined) query.completed = filters.completed;
      if (filters.category) query.category = filters.category;
      if (filters.tags && filters.tags.length > 0) {
        query.tags = { $in: filters.tags };
      }

      const result = await this.model.find(query).sort({ createdAt: -1 }).exec();
      return result as IGoal[];
    } catch (error: any) {
      throw new Error(`Error finding goals by user: ${error}`);
    }
  }

  /**
   * Find active goals
   */
  async findActiveGoals(userId: string): Promise<IGoal[]> {
    try {
      const now = new Date();
      const result = await this.model
        .find({
          user: userId,
          completed: false,
          startDate: { $lte: now },
          endDate: { $gte: now },
        })
        .sort({ endDate: 1 })
        .exec();

      return result as IGoal[];
    } catch (error: any) {
      throw new Error(`Error finding active goals: ${error}`);
    }
  }

  /**
   * Find upcoming goals
   */
  async findUpcomingGoals(userId: string): Promise<IGoal[]> {
    try {
      const now = new Date();
      const result = await this.model
        .find({
          user: userId,
          completed: false,
          startDate: { $gt: now },
        })
        .sort({ startDate: 1 })
        .exec();

      return result as IGoal[];
    } catch (error: any) {
      throw new Error(`Error finding upcoming goals: ${error}`);
    }
  }

  /**
   * Find completed goals
   */
  async findCompletedGoals(userId: string): Promise<IGoal[]> {
    try {
      const result = await this.model
        .find({ user: userId, completed: true })
        .sort({ completedAt: -1 })
        .exec();

      return result as IGoal[];
    } catch (error: any) {
      throw new Error(`Error finding completed goals: ${error}`);
    }
  }

  /**
   * Find overdue goals
   */
  async findOverdueGoals(userId: string): Promise<IGoal[]> {
    try {
      const now = new Date();
      const result = await this.model
        .find({
          user: userId,
          completed: false,
          endDate: { $lt: now },
        })
        .sort({ endDate: -1 })
        .exec();

      return result as IGoal[];
    } catch (error: any) {
      throw new Error(`Error finding overdue goals: ${error}`);
    }
  }

  /**
   * Update goal progress
   */
  async updateProgress(goalId: string, hoursToAdd: number): Promise<IGoal | null> {
    try {
      const goal = await this.model.findById(goalId).exec();
      if (!goal) return null;

      goal.currentHours += hoursToAdd;
      if (goal.currentHours < 0) goal.currentHours = 0;

      // Auto-complete if target reached
      if (goal.currentHours >= goal.targetHours && !goal.completed) {
        goal.completed = true;
        goal.completedAt = new Date();
      }

      return await goal.save();
    } catch (error: any) {
      throw new Error(`Error updating goal progress: ${error}`);
    }
  }

  /**
   * Mark goal as complete
   */
  async markAsComplete(goalId: string): Promise<IGoal | null> {
    try {
      return await this.model
        .findByIdAndUpdate(
          goalId,
          {
            completed: true,
            completedAt: new Date(),
          },
          { new: true }
        )
        .exec();
    } catch (error: any) {
      throw new Error(`Error marking goal as complete: ${error}`);
    }
  }

  /**
   * Get current goal for user
   */
  async getCurrentGoal(userId: string): Promise<IGoal | null> {
    try {
      const now = new Date();
      return await this.model
        .findOne({
          user: userId,
          completed: false,
          startDate: { $lte: now },
          endDate: { $gte: now },
        })
        .sort({ createdAt: -1 })
        .exec();
    } catch (error: any) {
      throw new Error(`Error getting current goal: ${error}`);
    }
  }

  /**
   * Get goal statistics
   */
  async getGoalStats(userId: string): Promise<any> {
    try {
      const [stats, byCategory] = await Promise.all([
        this.model.aggregate([
          { $match: { user: userId } },   // was: new mongoose.Types.ObjectId(userId)
          {
            $group: {
              _id: null,
              totalGoals: { $sum: 1 },
              completedGoals: { $sum: { $cond: [{ $eq: ['$completed', true] }, 1, 0] } },
              activeGoals: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$completed', false] },
                        { $lte: ['$startDate', new Date()] },
                        { $gte: ['$endDate', new Date()] },
                      ]
                    },
                    1, 0,
                  ],
                },
              },
              totalTargetHours: { $sum: '$targetHours' },
              totalCurrentHours: { $sum: '$currentHours' },
            },
          },
        ]),
        this.model.aggregate([
          { $match: { user: userId } },   // was: new mongoose.Types.ObjectId(userId)
          { $group: { _id: '$category', count: { $sum: 1 } } },
        ]),
      ]);

      const base = stats[0] || {
        totalGoals: 0, completedGoals: 0, activeGoals: 0,
        totalTargetHours: 0, totalCurrentHours: 0,
      };

      return {
        ...base,
        completionRate: base.totalGoals > 0
          ? Math.round((base.completedGoals / base.totalGoals) * 100)
          : 0,
        byCategory: byCategory.reduce((acc: any, item: any) => {
          acc[item._id || 'uncategorized'] = item.count;
          return acc;
        }, {}),
      };
    } catch (error: any) {
      throw new Error(`Error getting goal stats: ${error}`);
    }
  }

  /**
   * Get goals by date range
   */
  async findByDateRange(userId: string, startDate: Date, endDate: Date): Promise<IGoal[]> {
    try {
      const result = await this.model
        .find({
          user: userId,
          $or: [
            { startDate: { $gte: startDate, $lte: endDate } },
            { endDate: { $gte: startDate, $lte: endDate } },
            {
              $and: [
                { startDate: { $lte: startDate } },
                { endDate: { $gte: endDate } },
              ],
            },
          ],
        })
        .sort({ startDate: 1 })
        .exec();

      return result as IGoal[];
    } catch (error: any) {
      throw new Error(`Error finding goals by date range: ${error}`);
    }
  }
}

export default new GoalRepository();