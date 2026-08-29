// src/connections/services/follow.service.ts

import { Follow } from '../models/index';
import logger, { LogCategory } from '@/shared/logger.util';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import constants from '@/shared/constants.util';
import NotificationService from '@/notifications/services/notification.service';

const ERROR_CODES = constants.ERROR_CODES;

/**
 * FOLLOW SERVICE
 *
 * NOTE: Kafka event publishing (followProducer / analyticsProducer) was removed
 * because those producer files don't exist yet in the project
 * (only audit.producer.ts, auth.producer.ts, base.producer.ts, user.producer.ts
 * exist under src/shared/kafka/producers/). If you want Kafka events for follow
 * actions later, create src/shared/kafka/producers/followProducer.ts and
 * analyticsProducer.ts following the pattern in base.producer.ts, then wire
 * them back in here.
 */

type FollowStatus = 'pending' | 'active' | 'declined';

interface FollowData {
  followingId: string;
  notificationEnabled?: boolean;
}

interface BulkFollowData {
  followingIds: string[];
}

interface FollowStatusData {
  status: FollowStatus;
}

interface ListQuery {
  page?: number;
  limit?: number;
  status?: string;
  sortOrder?: string;
}

class FollowService {

  /**
   * Follow a user
   */
  async followUser(followerId: string, data: FollowData): Promise<any> {
    try {
      logger.info('Following user initiated', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId: data.followingId
      });

      const existingFollow = await Follow.findOne({
        followerId,
        followingId: data.followingId
      }).lean();

      if (existingFollow) {
        if (existingFollow.status === 'active') {
          throw new ErrorResponse('Already following this user', HttpStatus.CONFLICT, ERROR_CODES.CONNECTION_ALREADY_EXISTS);
        }

        const updated = await Follow.findOneAndUpdate(
          { followerId, followingId: data.followingId },
          {
            status: 'active',
            isBlocked: false,
            updatedAt: new Date(),
            notificationEnabled: data.notificationEnabled ?? true
          },
          { new: true }
        ).lean();

        logger.info('Follow relationship reactivated', {
          category: LogCategory.FOLLOW,
          followerId,
          followingId: data.followingId
        });

        await this.sendFollowNotification(followerId, data.followingId);

        return this.formatFollowResponse(updated!);
      }

      const follow = new Follow({
        followerId,
        followingId: data.followingId,
        status: 'active',
        notificationEnabled: data.notificationEnabled ?? true,
        isBlocked: false
      });

      const savedFollow = await follow.save();

      logger.info('User followed successfully', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId: data.followingId
      });

      await this.sendFollowNotification(followerId, data.followingId);

      return this.formatFollowResponse(savedFollow.toObject());

    } catch (error: any) {
      logger.error('Error following user', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId: data.followingId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    try {
      logger.info('Unfollowing user initiated', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId
      });

      const result = await Follow.deleteOne({
        followerId,
        followingId
      });

      logger.info('User unfollowed operation completed', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId,
        deletedCount: result.deletedCount
      });

    } catch (error: any) {
      logger.error('Error unfollowing user', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Update follow status
   */
  async updateFollowStatus(followerId: string, followingId: string, data: FollowStatusData): Promise<any> {
    try {
      logger.info('Updating follow status', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId,
        status: data.status
      });

      const updatedFollow = await Follow.findOneAndUpdate(
        { followerId, followingId },
        {
          status: data.status,
          updatedAt: new Date()
        },
        { new: true }
      ).lean();

      if (!updatedFollow) {
        throw new ErrorResponse('Follow relationship not found', HttpStatus.NOT_FOUND, ERROR_CODES.CONNECTION_NOT_FOUND);
      }

      logger.info('Follow status updated successfully', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId,
        status: data.status
      });

      return this.formatFollowResponse(updatedFollow);

    } catch (error: any) {
      logger.error('Error updating follow status', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Bulk follow multiple users
   */
  async bulkFollow(followerId: string, data: BulkFollowData): Promise<any> {
    try {
      logger.info('Bulk follow initiated', {
        category: LogCategory.FOLLOW,
        followerId,
        count: data.followingIds.length
      });

      const bulkOps = data.followingIds.map(followingId => ({
        updateOne: {
          filter: { followerId, followingId },
          update: {
            $set: {
              followerId,
              followingId,
              status: 'active' as FollowStatus,
              updatedAt: new Date(),
              notificationEnabled: true,
              isBlocked: false
            },
            $setOnInsert: {
              createdAt: new Date()
            }
          },
          upsert: true
        }
      }));

      const result = await Follow.bulkWrite(bulkOps, { ordered: false });

      logger.info('Bulk follow completed', {
        category: LogCategory.FOLLOW,
        followerId,
        upsertedCount: result.upsertedCount,
        modifiedCount: result.modifiedCount
      });

      return {
        success: true,
        totalOperations: data.followingIds.length,
        successfulOperations: (result.upsertedCount || 0) + (result.modifiedCount || 0),
        failedOperations: data.followingIds.length - ((result.upsertedCount || 0) + (result.modifiedCount || 0)),
        errors: [],
        results: data.followingIds.map((id: string) => ({
          userId: id,
          status: 'success' as const
        }))
      };

    } catch (error: any) {
      logger.error('Error in bulk follow', {
        category: LogCategory.FOLLOW,
        followerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Bulk unfollow multiple users
   */
  async bulkUnfollow(followerId: string, data: BulkFollowData): Promise<any> {
    try {
      logger.info('Bulk unfollow initiated', {
        category: LogCategory.FOLLOW,
        followerId,
        count: data.followingIds.length
      });

      const result = await Follow.deleteMany({
        followerId,
        followingId: { $in: data.followingIds }
      });

      logger.info('Bulk unfollow completed', {
        category: LogCategory.FOLLOW,
        followerId,
        deletedCount: result.deletedCount
      });

      return {
        success: true,
        totalOperations: data.followingIds.length,
        successfulOperations: result.deletedCount || 0,
        failedOperations: data.followingIds.length - (result.deletedCount || 0),
        errors: [],
        results: data.followingIds.map((id: string) => ({
          userId: id,
          status: 'success' as const
        }))
      };

    } catch (error: any) {
      logger.error('Error in bulk unfollow', {
        category: LogCategory.FOLLOW,
        followerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get user's followers
   */
  async getFollowers(userId: string, query: ListQuery): Promise<any> {
    try {
      const page = query.page || 1;
      const limit = Math.min(query.limit || 50, 100);
      const skip = (page - 1) * limit;

      const [followers, total] = await Promise.all([
        Follow.find({
          followingId: userId,
          status: query.status || 'active',
          isBlocked: false
        })
        .select('followerId createdAt')
        .sort({ createdAt: query.sortOrder === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

        Follow.countDocuments({
          followingId: userId,
          status: query.status || 'active',
          isBlocked: false
        })
      ]);

      logger.debug('Followers retrieved', {
        category: LogCategory.FOLLOW,
        userId,
        count: followers.length,
        total
      });

      return {
        data: followers.map((f: any) => this.formatFollowResponse({
          ...f,
          followingId: userId,
          status: query.status || 'active',
          updatedAt: f.createdAt,
          notificationEnabled: true,
          isBlocked: false
        })),
        pagination: this.buildPaginationResponse(page, limit, total)
      };

    } catch (error: any) {
      logger.error('Error getting followers', {
        category: LogCategory.FOLLOW,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get user's following
   */
  async getFollowing(userId: string, query: ListQuery): Promise<any> {
    try {
      const page = query.page || 1;
      const limit = Math.min(query.limit || 50, 100);
      const skip = (page - 1) * limit;

      const [following, total] = await Promise.all([
        Follow.find({
          followerId: userId,
          status: query.status || 'active',
          isBlocked: false
        })
        .select('followingId createdAt')
        .sort({ createdAt: query.sortOrder === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

        Follow.countDocuments({
          followerId: userId,
          status: query.status || 'active',
          isBlocked: false
        })
      ]);

      logger.debug('Following retrieved', {
        category: LogCategory.FOLLOW,
        userId,
        count: following.length,
        total
      });

      return {
        data: following.map((f: any) => this.formatFollowResponse({
          ...f,
          followerId: userId,
          status: query.status || 'active',
          updatedAt: f.createdAt,
          notificationEnabled: true,
          isBlocked: false
        })),
        pagination: this.buildPaginationResponse(page, limit, total)
      };

    } catch (error: any) {
      logger.error('Error getting following', {
        category: LogCategory.FOLLOW,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get follow counts for a user
   */
  async getFollowCounts(userId: string): Promise<{ followersCount: number; followingCount: number }> {
    try {
      const [followersCount, followingCount] = await Promise.all([
        Follow.countDocuments({
          followingId: userId,
          status: 'active',
          isBlocked: false
        }),
        Follow.countDocuments({
          followerId: userId,
          status: 'active',
          isBlocked: false
        })
      ]);

      logger.debug('Follow counts retrieved', {
        category: LogCategory.FOLLOW,
        userId,
        followersCount,
        followingCount
      });

      return {
        followersCount,
        followingCount
      };

    } catch (error: any) {
      logger.error('Error getting follow counts', {
        category: LogCategory.FOLLOW,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Check follow status between two users
   */
  async checkFollowStatus(followerId: string, followingId: string): Promise<any> {
    try {
      const followStatus = await Follow.findOne(
        { followerId, followingId },
        'status isBlocked'
      ).lean();

      return {
        userId: followingId,
        status: followStatus?.status || null,
        isBlocked: followStatus?.isBlocked || false,
        isFollowing: followStatus?.status === 'active',
        isFollower: false
      };

    } catch (error: any) {
      logger.error('Error checking follow status', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Batch check follow status for multiple users
   */
  async batchCheckFollowStatus(followerId: string, userIds: string[]): Promise<any> {
    try {
      const statuses = await Follow.find(
        {
          followerId,
          followingId: { $in: userIds }
        },
        'followingId status isBlocked'
      ).lean();

      const result: any = {};

      userIds.forEach(userId => {
        const status = statuses.find((s: any) => s.followingId === userId);
        result[userId] = {
          userId,
          status: status?.status || null,
          isBlocked: status?.isBlocked || false,
          isFollowing: status?.status === 'active',
          isFollower: false
        };
      });

      return result;

    } catch (error: any) {
      logger.error('Error in batch follow status check', {
        category: LogCategory.FOLLOW,
        followerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get mutual follows count between two users
   */
  async getMutualFollows(userId1: string, userId2: string): Promise<number> {
    try {
      const [user1Followers, user2Followers] = await Promise.all([
        Follow.find({
          followingId: userId1,
          status: 'active',
          isBlocked: false
        }).select('followerId').lean(),

        Follow.find({
          followingId: userId2,
          status: 'active',
          isBlocked: false
        }).select('followerId').lean()
      ]);

      const user1FollowerIds = user1Followers.map((f: any) => f.followerId);
      const user2FollowerIds = user2Followers.map((f: any) => f.followerId);

      const mutualFollowers = user1FollowerIds.filter(id => user2FollowerIds.includes(id));

      logger.debug('Mutual follows counted', {
        category: LogCategory.FOLLOW,
        userId1,
        userId2,
        mutualCount: mutualFollowers.length
      });

      return mutualFollowers.length;

    } catch (error: any) {
      logger.error('Error getting mutual follows', {
        category: LogCategory.FOLLOW,
        userId1,
        userId2,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * HELPER METHODS
   */

  private formatFollowResponse(follow: any): any {
    return {
      _id: follow._id?.toString() || `${follow.followerId}_${follow.followingId}`,
      followerId: follow.followerId,
      followingId: follow.followingId,
      status: follow.status,
      createdAt: follow.createdAt,
      updatedAt: follow.updatedAt,
      notificationEnabled: follow.notificationEnabled,
      isBlocked: follow.isBlocked
    };
  }

  private buildPaginationResponse(page: number, limit: number, total: number) {
    const totalPages = Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }

  private async sendFollowNotification(followerId: string, followingId: string): Promise<void> {
    try {
      await NotificationService.notifyNewFollower(followerId, followingId);

      logger.debug('Notification sent for follow', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId
      });
    } catch (error: any) {
      logger.warn('Failed to send follow notification', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const followService = new FollowService();