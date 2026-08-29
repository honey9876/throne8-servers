/**
 * ====================================
 * USER REPOSITORY
 * ====================================
 * Extended repository for User-specific operations
 */

import { BaseRepository } from './base.repository';
import { User } from '@/auth/models';
import { IUser } from '@/auth/models/User.model';
import { UserRole } from '../enums/UserRole.enum';

class UserRepository extends BaseRepository<IUser> {
  constructor() {
    super(User);
  }
  /**
     * Find user by userId
     */
  async findByUserId(userId: string): Promise<IUser | null> {
    return await this.model.findOne({ userId }).select('-password').lean();
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<IUser | null> {
    try {
      return await User.findByEmail(email);
    } catch (error: any) {
      throw new Error(`Error finding user by email: ${error}`);
    }
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<IUser | null> {
    try {
      return await User.findByUsername(username);
    } catch (error: any) {
      throw new Error(`Error finding user by username: ${error}`);
    }
  }

  /**
   * Find user by ID with password (for authentication)
   */
  async findByIdWithPassword(id: string): Promise<IUser | null> {
    try {
      return await this.model.findById(id).select('+password').exec();
    } catch (error: any) {
      throw new Error(`Error finding user with password: ${error}`);
    }
  }

  /**
   * Find user by email with password (for login)
   */
  async findByEmailWithPassword(email: string): Promise<IUser | null> {
    try {
      return await this.model
        .findOne({ email: email.toLowerCase() })
        .select('+password')
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding user by email with password: ${error}`);
    }
  }

  /**
   * Get users by role
   */
  async findByRole(role: UserRole): Promise<IUser[]> {
    try {
      return await this.model.find({ role, isActive: true }).exec();
    } catch (error: any) {
      throw new Error(`Error finding users by role: ${error}`);
    }
  }

  /**
   * Get active users (logged in recently)
   */
  async findActiveUsers(hours: number = 24): Promise<IUser[]> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hours);

      return await this.model
        .find({
          isActive: true,
          lastActive: { $gte: cutoffTime },
        })
        .sort({ lastActive: -1 })
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding active users: ${error}`);
    }
  }

  /**
   * Update last active timestamp
   */
  async updateLastActive(userId: string): Promise<IUser | null> {
    try {
      return await this.model
        .findByIdAndUpdate(
          userId,
          { lastActive: new Date() },
          { new: true }
        )
        .exec();
    } catch (error: any) {
      throw new Error(`Error updating last active: ${error}`);
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(userId: string): Promise<IUser | null> {
    try {
      return await this.model
        .findByIdAndUpdate(
          userId,
          { isEmailVerified: true },
          { new: true }
        )
        .exec();
    } catch (error: any) {
      throw new Error(`Error verifying email: ${error}`);
    }
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(userId: string): Promise<IUser | null> {
    try {
      return await this.model
        .findByIdAndUpdate(
          userId,
          { isActive: false },
          { new: true }
        )
        .exec();
    } catch (error: any) {
      throw new Error(`Error deactivating user: ${error}`);
    }
  }

  /**
   * Activate user account
   */
  async activateUser(userId: string): Promise<IUser | null> {
    try {
      return await this.model
        .findByIdAndUpdate(
          userId,
          { isActive: true },
          { new: true }
        )
        .exec();
    } catch (error: any) {
      throw new Error(`Error activating user: ${error}`);
    }
  }

  /**
   * Search users by name or email
   */
  async searchUsers(query: string, limit: number = 10): Promise<IUser[]> {
    try {
      const regex = new RegExp(query, 'i');
      return await this.model
        .find({
          $or: [{ name: regex }, { email: regex }, { username: regex }],
          isActive: true,
        })
        .limit(limit)
        .exec();
    } catch (error: any) {
      throw new Error(`Error searching users: ${error}`);
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<any> {
    try {
      const stats = await this.model.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: {
              $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] },
            },
            verifiedUsers: {
              $sum: { $cond: [{ $eq: ['$isEmailVerified', true] }, 1, 0] },
            },
            studentsCount: {
              $sum: { $cond: [{ $eq: ['$role', UserRole.STUDENT] }, 1, 0] },
            },
            mentorsCount: {
              $sum: { $cond: [{ $eq: ['$role', UserRole.MENTOR] }, 1, 0] },
            },
            adminsCount: {
              $sum: { $cond: [{ $eq: ['$role', UserRole.ADMIN] }, 1, 0] },
            },
          },
        },
      ]);

      return stats[0] || {};
    } catch (error: any) {
      throw new Error(`Error getting user stats: ${error}`);
    }
  }

  async findWithPagination(query: any, sort: string, skip: number, limit: number): Promise<IUser[]> {
    return await this.model.find(query).select('-password').sort(sort).skip(skip).limit(limit).lean();
  }

  async updateByUserId(userId: string, updates: any): Promise<IUser | null> {
    return await this.model.findOneAndUpdate({ userId }, { $set: updates }, { new: true }).select('-password').lean();
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
}

export default new UserRepository();