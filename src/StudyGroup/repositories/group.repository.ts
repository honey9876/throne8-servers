/**
 * ====================================
 * GROUP REPOSITORY
 * ====================================
 */

import { BaseRepository } from './base.repository';
import Group from '../models/Group.model';
import { IGroup } from '../interfaces/IGroup';
import { GroupCategory } from '../enums/GroupCategory.enum';
import { GroupVisibility } from '../enums/GroupVisibility.enum';
import mongoose from 'mongoose';
import { logger } from '@/shared/logger.util';

class GroupRepository extends BaseRepository<IGroup> {
  constructor() {
    super(Group);
  }

  /**
   * Find groups by leader
   */
  async findByLeader(leaderId: string): Promise<IGroup[]> {
    try {
      return await this.model
        .find({ leaderId: leaderId, isActive: true })
        .sort({ createdAt: -1 })
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding groups by leader: ${error}`);
    }
  }

  /**
   * Find public groups
   */
  async findPublicGroups(limit: number = 50): Promise<IGroup[]> {
    try {
      return await this.model
        .find({ visibility: GroupVisibility.PUBLIC, isActive: true })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('leader', 'name email avatar')
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding public groups: ${error}`);
    }
  }

  /**
   * Find groups by category
   */
  async findByCategory(category: GroupCategory): Promise<IGroup[]> {
    try {
      return await this.model
        .find({ category, isActive: true })
        .sort({ createdAt: -1 })
        .populate('leader', 'name email avatar')
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding groups by category: ${error}`);
    }
  }

  /**
   * Find group by join code
   */
  async findByJoinCode(joinCode: string): Promise<IGroup | null> {
    try {
      return await this.model
        .findOne({ joinCode, isActive: true })
        .populate('leader', 'name email avatar')
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding group by join code: ${error}`);
    }
  }

  /**
   * Search groups by title
   */
  async searchGroups(query: string, limit: number = 20): Promise<IGroup[]> {
    try {
      return await this.model
        .find({
          $text: { $search: query },
          isActive: true,
        })
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .populate('leader', 'name email avatar')
        .exec();
    } catch (error: any) {
      throw new Error(`Error searching groups: ${error}`);
    }
  }

  /**
   * Increment member count
   */
  async incrementMemberCount(groupId: string): Promise<IGroup | null> {
    try {
      return await this.model
        .findByIdAndUpdate(
          groupId,
          { $inc: { currentMemberCount: 1 } },
          { new: true }
        )
        .exec();
    } catch (error: any) {
      throw new Error(`Error incrementing member count: ${error}`);
    }
  }

  /**
   * Decrement member count
   */
  async decrementMemberCount(groupId: string): Promise<IGroup | null> {
    try {
      return await this.model
        .findByIdAndUpdate(
          groupId,
          { $inc: { currentMemberCount: -1 } },
          { new: true }
        )
        .exec();
    } catch (error: any) {
      throw new Error(`Error decrementing member count: ${error}`);
    }
  }

  /**
   * Check if user is banned
   */
  async isUserBanned(groupId: string, userId: string): Promise<boolean> {
    try {
      const group = await this.model.findById(groupId).exec();
      if (!group) return false;

      return (group.bannedUsers || []).some(
        (ban: any) => ban.user.toString() === userId
      );
    } catch (error: any) {
      throw new Error(`Error checking if user is banned: ${error}`);
    }
  }

  /**
   * Get groups with pending reports
   */
  async getGroupsWithPendingReports(): Promise<IGroup[]> {
    try {
      return await this.model
        .find({
          $or: [
            { 'reports.status': 'pending' },
            { 'messageReports.status': 'pending' },
          ],
        })
        .populate('leader', 'name email')
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding groups with pending reports: ${error}`);
    }
  }

  /**
   * Get top groups by member count
   */
  async getTopGroups(limit: number = 10): Promise<IGroup[]> {
    try {
      return await this.model
        .find({ isActive: true })
        .sort({ currentMemberCount: -1 })
        .limit(limit)
        .populate('leader', 'name email avatar')
        .exec();
    } catch (error: any) {
      throw new Error(`Error getting top groups: ${error}`);
    }
  }

  /**
   * Get group statistics
   */
  async getGroupStats(): Promise<any> {
    try {
      const stats = await this.model.aggregate([
        {
          $group: {
            _id: null,
            totalGroups: { $sum: 1 },
            activeGroups: {
              $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] },
            },
            publicGroups: {
              $sum: { $cond: [{ $eq: ['$visibility', GroupVisibility.PUBLIC] }, 1, 0] },
            },
            privateGroups: {
              $sum: { $cond: [{ $eq: ['$visibility', GroupVisibility.PRIVATE] }, 1, 0] },
            },
            totalMembers: { $sum: '$currentMemberCount' },
            avgMembersPerGroup: { $avg: '$currentMemberCount' },
          },
        },
      ]);

      return stats[0] || {};
    } catch (error: any) {
      throw new Error(`Error getting group stats: ${error}`);
    }
  }

  async findByGroupId(groupId: string): Promise<IGroup | null> {
        logger.info("inside repository")

    return await this.model.findOne({ groupId, isActive: true }).lean();
  }

  async create(data: any, session?: mongoose.ClientSession): Promise<IGroup> {
    const groups = await this.model.create([data], { session });
    return groups[0].toObject();
  }

  async updateById(groupId: string, updates: any): Promise<IGroup | null> {
    const group = await this.model.findOneAndUpdate(
      { groupId, isActive: true },
      { $set: updates },
      { new: true }
    );
    if (!group) return null;
    return group.toObject();
  }

  async softDeleteById(groupId: string): Promise<boolean> {
    const group = await this.model.findOne({ groupId, isActive: true });
    if (!group) return false;
    group.isActive = false;
    await group.save();
    return true;
  }

  async findAll(query: any, sortQuery: any, skip: number, limit: number): Promise<IGroup[]> {
    return await this.model
      .find(query)
      // .populate('leaderId', 'name email avatar')  // was: 'leader'
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      // .lean();
  }

  async count(query: any): Promise<number> {
    return await this.model.countDocuments(query);
  }

  // repositories/group.repository.ts — ADD these methods

  // // groupId UUID se find
  // async findByGroupId(groupId: string): Promise<IGroup | null> {
  //   try {
  //     return await this.model.findOne({ groupId }).exec();
  //   } catch (error: any) {
  //     throw new Error(`Error finding group by groupId: ${error}`);
  //   }
  // }

  // leaderId check ke liye
  async findByGroupIdWithLeader(groupId: string): Promise<IGroup | null> {
    try {
      return await this.model
        .findOne({ groupId })
        .select('groupId title leaderId avatar isActive')
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding group with leader: ${error}`);
    }
  }

  async findByGroupIdWithReports(groupId: string): Promise<IGroup | null> {
    return await this.model
      .findOne({ groupId, isActive: true })
      .select('groupId title reports messageReports')
      .lean();
  }

  async getPendingReportsCount(): Promise<number> {
  const result = await this.model.aggregate([
    {
      $project: {
        pendingUserReports: {
          $size: {
            $filter: { input: '$reports', cond: { $eq: ['$$this.status', 'pending'] } },
          },
        },
        pendingMessageReports: {
          $size: {
            $filter: { input: '$messageReports', cond: { $eq: ['$$this.status', 'pending'] } },
          },
        },
      },
    },
    {
      $group: {
        _id: null,
        totalPending: { $sum: { $add: ['$pendingUserReports', '$pendingMessageReports'] } },
      },
    },
  ]);
  return result[0]?.totalPending || 0;
}

async getDailyGrowth(startDate: Date, endDate: Date): Promise<any[]> {
  return await this.model.aggregate([
    { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

async findRawByGroupId(groupId: string): Promise<IGroup | null> {
  return await this.model.findOne({ groupId, isActive: true }).exec();
}

}

export default new GroupRepository();