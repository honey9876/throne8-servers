// src/services/followService.ts

import { Follow } from '../models/index';
import logger, { LogCategory } from '@/shared/logger.util';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
// ✅ KAFKA IMPORTS
import { followProducer } from '../kafka/producers/followProducer';
import { analyticsProducer } from '../kafka/producers/analyticsProducer';
import { ERROR_CODES } from '../utils/constants';
import environmentConfig from '@/config/environment/environment';

/**
 * FOLLOW SERVICE with Kafka Event Publishing
 * Publishes events for:
 * - Follow created
 * - Unfollow/follow removed
 * - Follow status updated
 * - Follow analytics
 */

interface FollowData {
  followingId: string;
  notificationEnabled?: boolean;
}

interface BulkFollowData {
  followingIds: string[];
}

interface FollowStatusData {
  status: 'pending' | 'active' | 'declined';
}

interface ListQuery {
  page?: number;
  limit?: number;
  status?: string;
  sortOrder?: string;
}

class FollowService {
  private notificationServiceClient?: any;

  constructor() {
    this.initializeExternalServices();
  }

  private async initializeExternalServices(): Promise<void> {
    try {
      if (environmentConfig.USER_SERVICE_URL) {
        logger.info('User service available', { category: LogCategory.FOLLOW });
      }
      
      if (environmentConfig.NOTIFICATION_SERVICE_URL) {
        logger.info('Notification service available', { category: LogCategory.FOLLOW });
      }
    } catch (error : any) {
      logger.warn('External services not available, continuing without them', { 
        category: LogCategory.FOLLOW,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Follow a user
   * ✅ KAFKA: Publishes FOLLOW_CREATED event
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

        // ✅ KAFKA: Publish FOLLOW_CREATED event (reactivation)
        try {
          await followProducer.publishUserFollowed(
            {
              followId: updated!._id.toString(),
              followerId,
              followedUserId: data.followingId,
              followedAt: new Date().toISOString(),
              source: 'reactivation',
              metadata: {
                notificationEnabled: data.notificationEnabled ?? true
              }
            },
            followerId
          );

          await analyticsProducer.publishUserAction({
            userId: followerId,
            action: 'follow_reactivated',
            entity: 'follow',
            entityId: data.followingId,
            timestamp: new Date().toISOString()
          });
        } catch (kafkaError) {
          logger.error('Failed to publish follow reactivation event', {
            category: LogCategory.FOLLOW,
            error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
          });
        }

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

      // ✅ KAFKA: Publish FOLLOW_CREATED event
      try {
        await followProducer.publishUserFollowed(
          {
            followId: String(savedFollow._id),
            followerId,
            followedUserId: data.followingId,
            followedAt: new Date().toISOString(),
            source: 'new',
            metadata: {
              notificationEnabled: data.notificationEnabled ?? true
            }
          },
          followerId
        );

        await analyticsProducer.publishUserAction({
          userId: followerId,
          action: 'follow_created',
          entity: 'follow',
          entityId: data.followingId,
          timestamp: new Date().toISOString()
        });
      } catch (kafkaError) {
        logger.error('Failed to publish follow created event', {
          category: LogCategory.FOLLOW,
          error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
        });
      }

      await this.sendFollowNotification(followerId, data.followingId);

      return this.formatFollowResponse(savedFollow.toObject());

    } catch (error : any) {
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
   * ✅ KAFKA: Publishes FOLLOW_REMOVED event
   */
  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    try {
      logger.info('Unfollowing user initiated', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId
      });

      // Get follow ID before deleting
      const existingFollow = await Follow.findOne({
        followerId,
        followingId
      }).lean();

      if (!existingFollow) {
        throw new ErrorResponse('Follow relationship not found', HttpStatus.NOT_FOUND, ERROR_CODES.CONNECTION_NOT_FOUND);
      }

      const result = await Follow.deleteOne({
        followerId,
        followingId
      });

      if (result.deletedCount === 0) {
        throw new ErrorResponse('Follow relationship not found', HttpStatus.NOT_FOUND, ERROR_CODES.CONNECTION_NOT_FOUND);
      }

      logger.info('User unfollowed successfully', {
        category: LogCategory.FOLLOW,
        followerId,
        followingId
      });

      // ✅ KAFKA: Publish FOLLOW_REMOVED event
      try {
        await followProducer.publishUserUnfollowed(
          {
            followId: existingFollow._id.toString(),
            followerId,
            followedUserId: followingId,
            unfollowedAt: new Date().toISOString(),
            reason: 'user_action'
          },
          followerId
        );

        await analyticsProducer.publishUserAction({
          userId: followerId,
          action: 'follow_removed',
          entity: 'follow',
          entityId: followingId,
          timestamp: new Date().toISOString()
        });
      } catch (kafkaError) {
        logger.error('Failed to publish follow removed event', {
          category: LogCategory.FOLLOW,
          error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
        });
      }

    } catch (error : any) {
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
   * ✅ KAFKA: Publishes analytics event for status update
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

      // ✅ KAFKA: Publish analytics event for status update
      try {
        await analyticsProducer.publishUserAction({
          userId: followerId,
          action: 'follow_status_updated',
          entity: 'follow',
          entityId: followingId,
          properties: {
            status: data.status,
            previousStatus: updatedFollow.status
          },
          timestamp: new Date().toISOString()
        });

        // If status changed to declined, publish unfollowed event
        if (data.status === 'declined') {
          await followProducer.publishUserUnfollowed(
            {
              followId: updatedFollow._id.toString(),
              followerId,
              followedUserId: followingId,
              unfollowedAt: new Date().toISOString(),
              reason: 'declined'
            },
            followerId
          );
        }
      } catch (kafkaError) {
        logger.error('Failed to publish follow status update event', {
          category: LogCategory.FOLLOW,
          error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
        });
      }

      return this.formatFollowResponse(updatedFollow);

    } catch (error : any) {
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
              status: 'active',
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

      // ✅ KAFKA: Publish batch follow events
      try {
        const followEvents = data.followingIds.map(followingId => ({
          type: 'followed' as const,
          payload: {
            followId: `${followerId}_${followingId}`,
            followerId,
            followedUserId: followingId,
            followedAt: new Date().toISOString(),
            source: 'bulk_operation'
          },
          userId: followerId
        }));

        await followProducer.publishFollowBatch(followEvents);

        await analyticsProducer.publishUserAction({
          userId: followerId,
          action: 'bulk_follow',
          entity: 'follow',
          properties: {
            count: data.followingIds.length,
            successCount: (result.upsertedCount || 0) + (result.modifiedCount || 0)
          },
          timestamp: new Date().toISOString()
        });
      } catch (kafkaError) {
        logger.error('Failed to publish bulk follow events', {
          category: LogCategory.FOLLOW,
          error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
        });
      }

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

    } catch (error : any) {
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

      // ✅ KAFKA: Publish batch unfollow events
      try {
        const unfollowEvents = data.followingIds.map(followingId => ({
          type: 'unfollowed' as const,
          payload: {
            followId: `${followerId}_${followingId}`,
            followerId,
            followedUserId: followingId,
            unfollowedAt: new Date().toISOString(),
            reason: 'bulk_operation'
          },
          userId: followerId
        }));

        await followProducer.publishFollowBatch(unfollowEvents);

        await analyticsProducer.publishUserAction({
          userId: followerId,
          action: 'bulk_unfollow',
          entity: 'follow',
          properties: {
            count: data.followingIds.length,
            successCount: result.deletedCount || 0
          },
          timestamp: new Date().toISOString()
        });
      } catch (kafkaError) {
        logger.error('Failed to publish bulk unfollow events', {
          category: LogCategory.FOLLOW,
          error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
        });
      }

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

    } catch (error : any) {
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

    } catch (error : any) {
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

    } catch (error : any) {
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

      // ✅ KAFKA: Publish metrics event
      try {
        await followProducer.publishFollowMetrics(userId, {
          followersCount,
          followingCount
        });
      } catch (kafkaError) {
        logger.error('Failed to publish follow metrics', {
          category: LogCategory.FOLLOW,
          error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
        });
      }

      return {
        followersCount,
        followingCount
      };

    } catch (error : any) {
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

    } catch (error : any) {
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

    } catch (error : any) {
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

    } catch (error : any) {
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
      if (this.notificationServiceClient) {
        logger.debug('Notification sent for follow', {
          category: LogCategory.FOLLOW,
          followerId,
          followingId
        });
      }
    } catch (error : any) {
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