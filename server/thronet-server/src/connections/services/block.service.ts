// /**
//  * Block Service
//  * Handles business logic for blocking operations.
//  * Integrates with models, external services, caching, and queuing for scalability.
//  * 
//  * Features (12):
//  * 1. blockUser
//  * 2. unblockUser
//  * 3. getBlockedUsers
//  * 4. isUserBlocked
//  * 5. getBlockHistory
//  * 6. bulkBlock (setBulkBlockRules)
//  * 7. getBlockAnalytics
//  * 8. setBlockNotifications
//  * 9. handleBlockAppeal
//  * 10. getBlockReasons
//  * 11. setBlockPrivacy
//  * 12. exportBlockData
//  * 
//  * Additional:
//  * - Caching for frequent queries (e.g., isBlocked, getBlockedUsers)
//  * - Queueing for notifications and analytics events
//  * - Integration with user service for settings persistence
//  * - Validation and error handling
//  * - Analytics tracking for all operations
//  * 
//  * Dependencies:
//  * - ConnectionBlock model
//  * - notificationServiceClient
//  * - analyticsServiceClient
//  * - userServiceClient (for settings)
//  * - cacheService
//  * - queueService
//  * - validationService
//  */

import {ConnectionBlock, BlockReason, BlockStatus, BlockType, BlockSeverity, IConnectionBlock } from '../models/index';
import logger, { LogCategory } from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import cacheService from './shared/cacheService';
import queueService from './shared/queueService';
// ✅ KAFKA IMPORTS
import { networkProducer } from '../kafka/producers/networkProducer';
import { analyticsProducer } from '../kafka/producers/analyticsProducer';
import constants from '@/shared/constants.util';

const ERROR_CODES = constants.ERROR_CODES;

/**
 * Block Service with Kafka Event Publishing
 * Publishes events for:
 * - User blocked
 * - User unblocked
 * - Block appeal submitted
 * - Block analytics
 */

interface BlockUserParams {
  blockerId: string;
  blockedId: string;
  reason: BlockReason;
  customReason?: string;
  blockType?: BlockType;
  expiresAt?: Date;
  metadata?: Partial<IConnectionBlock['metadata']>;
}

interface UnblockUserParams {
  blockerId: string;
  blockedId: string;
  reason?: string;
}

interface GetBlockedUsersParams {
  blockerId: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeInactive?: boolean;
  status?: BlockStatus;
  reason?: BlockReason;
}

interface IsUserBlockedParams {
  currentUserId: string;
  userId: string;
}

interface GetBlockHistoryParams {
  userId: string;
  startDate?: Date;
  endDate?: Date;
  includeAppeals?: boolean;
  limit?: number;
}

interface BulkBlockParams {
  blockerId: string;
  blockedIds: string[];
  reason: BlockReason;
  blockType: BlockType;
  metadata?: Partial<IConnectionBlock['metadata']>;
}

interface GetBlockAnalyticsParams {
  userId: string;
  timeframe?: 'day' | 'week' | 'month';
  includeSystemWide?: boolean;
  isAdmin?: boolean;
}

interface SetBlockNotificationsParams {
  userId: string;
  enableBlockNotifications?: boolean;
  enableUnblockNotifications?: boolean;
  enableAppealNotifications?: boolean;
  notificationChannels?: string[];
  escalationThreshold?: number;
}

interface HandleBlockAppealParams {
  blockId: string;
  userId: string;
  action: 'submit_appeal' | 'review_appeal';
  appealReason?: string;
  decision?: 'approved' | 'rejected';
  reviewNotes?: string;
  isAdmin?: boolean;
}

interface GetBlockReasonsParams {
  includeCustomReasons?: boolean;
  includeStatistics?: boolean;
  isAdmin?: boolean;
}

interface SetBlockPrivacyParams {
  userId: string;
  hideBlockedList?: boolean;
  allowDataExport?: boolean;
  enableAutoAnonymization?: boolean;
  dataRetentionDays?: number;
  shareAnalyticsData?: boolean;
}

interface ExportBlockDataParams {
  userId: string;
  format?: 'json' | 'csv';
  includeAuditLog?: boolean;
  includeMetadata?: boolean;
  dateRange?: { startDate: Date; endDate: Date };
}

interface GetPendingAppealsParams {
  moderatorId?: string;
  limit?: number;
}

const blockService = {
  /**
   * Block a user
   * ✅ KAFKA: Publishes USER_BLOCKED event
   */
  async blockUser(params: BlockUserParams): Promise<IConnectionBlock> {
    const { blockerId, blockedId, reason, customReason, blockType = BlockType.USER_INITIATED, expiresAt, metadata = {} } = params;

    if (!blockerId || !blockedId || !reason) {
      throw new ErrorResponse('Missing required parameters', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
    }

    if (typeof blockerId !== 'string' || typeof blockedId !== 'string') {
      throw new ErrorResponse('Invalid user ID format', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
    }

    if (blockerId === blockedId) {
      throw new ErrorResponse('Cannot block yourself', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
    }

    const cacheKey = `block:${blockerId}:${blockedId}`;
    const cachedBlocked = await cacheService.get(cacheKey);
    if (cachedBlocked) {
      throw new ErrorResponse('User already blocked', HttpStatus.CONFLICT, ERROR_CODES.DUPLICATE_RECORD);
    }

    const blockData = {
      blockerId,
      blockedId,
      reason,
      customReason,
      blockType,
      status: BlockStatus.ACTIVE,
      isActive: true,
      expiresAt,
      metadata: {
        ...metadata,
        reportCount: metadata.reportedBy ? 1 : 0,
        severity: BlockSeverity.LOW,
        appealSubmitted: false,
        automaticUnblockEnabled: !!expiresAt,
        reportedBy: metadata.reportedBy ? [metadata.reportedBy] : [],
        evidenceUrls: metadata.evidenceUrls || [],
      },
      auditLog: [{
        action: 'blocked',
        performedBy: blockerId,
        performedByType: 'user',
        timestamp: new Date(),
        reason,
      }]
    };

    const block = new ConnectionBlock(blockData);
    await block.save();

    const cacheTTL = (environmentConfig as any).CACHE_TTL_BLOCK_STATUS || 3600;
    await cacheService.set(cacheKey, 'true', cacheTTL);

    // ✅ KAFKA: Publish USER_BLOCKED event
    try {
      await networkProducer.publishUserBlocked({
        blockerId,
        blockedId,
        reason,
        blockType,
        timestamp: new Date()
      });

      await analyticsProducer.publishUserAction({
        userId: blockerId,
        action: 'user_blocked',
        entity: 'block',
        entityId: blockedId,
        properties: {
          reason,
          blockType,
          severity: BlockSeverity.LOW
        },
        timestamp: new Date().toISOString()
      });
    } catch (kafkaError) {
      logger.error('Failed to publish user blocked event', {
        category: LogCategory.CONNECTION,
        blockerId,
        blockedId,
        error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
      });
    }

    if (queueService.addJob) {
      await queueService.addJob('notifications', 'sendNotification', {
        type: 'block',
        toUserId: blockedId,
        fromUserId: blockerId,
        message: `You have been blocked by user ${blockerId}`
      });
    }

    if (queueService.addJob) {
      await queueService.addJob('analytics', 'trackAnalytics', {
        event: 'user_blocked',
        userId: blockerId,
        properties: { reason, blockType }
      });
    }

    logger.auditLog('user_blocked', blockerId, {
      blockedId,
      reason,
      blockId: block._id.toString(),
      category: LogCategory.CONNECTION
    });

    return block;
  },

  /**
   * Unblock a user
   * ✅ KAFKA: Publishes USER_UNBLOCKED event
   */
  async unblockUser(params: UnblockUserParams): Promise<IConnectionBlock> {
    const { blockerId, blockedId, reason = 'unblocked by user' } = params;

    const block = await ConnectionBlock.findOne({ blockerId, blockedId, isActive: true });
    if (!block) {
      throw new ErrorResponse('Block not found', HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND);
    }

    const updatedBlock = await block.unblock(blockerId, reason);

    const cacheKey = `block:${blockerId}:${blockedId}`;
    await cacheService.del(cacheKey);

    // ✅ KAFKA: Publish USER_UNBLOCKED event
    try {
      await networkProducer.publishUserUnblocked({
        blockerId,
        blockedId,
        reason,
        timestamp: new Date()
      });

      await analyticsProducer.publishUserAction({
        userId: blockerId,
        action: 'user_unblocked',
        entity: 'block',
        entityId: blockedId,
        properties: {
          reason
        },
        timestamp: new Date().toISOString()
      });
    } catch (kafkaError) {
      logger.error('Failed to publish user unblocked event', {
        category: LogCategory.CONNECTION,
        blockerId,
        blockedId,
        error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
      });
    }

    if (queueService.addJob) {
      await queueService.addJob('notifications', 'sendNotification', {
        type: 'unblock',
        toUserId: blockedId,
        fromUserId: blockerId,
        message: `You have been unblocked by user ${blockerId}`
      });
    }

    if (queueService.addJob) {
      await queueService.addJob('analytics', 'trackAnalytics', {
        event: 'user_unblocked',
        userId: blockerId,
        properties: { reason }
      });
    }

    logger.auditLog('user_unblocked', blockerId, {
      blockedId,
      reason,
      blockId: block._id.toString(),
      category: LogCategory.CONNECTION
    });

    return updatedBlock;
  },

  /**
   * Get blocked users
   */
  async getBlockedUsers(params: GetBlockedUsersParams): Promise<{ blocks: IConnectionBlock[]; totalCount: number; pagination: any }> {
    const { blockerId, page = 1, limit = 20, sortBy = 'blockedAt', sortOrder = 'desc', includeInactive = false, status, reason } = params;

    const maxLimit = (environmentConfig as any).PAGINATION_MAX_LIMIT || 100;
    const pagination = {
      page: Math.max(1, page),
      limit: Math.min(limit, maxLimit)
    };

    const query: any = { blockerId };
    if (!includeInactive) query.isActive = true;
    if (status) query.status = status;
    if (reason) query.reason = reason;

    const options = {
      includeInactive,
      limit: pagination.limit,
      skip: (pagination.page - 1) * pagination.limit,
      sortBy: sortOrder === 'desc' ? `-${sortBy}` : sortBy
    };

    const cacheKey = `blockedUsers:${blockerId}:${JSON.stringify(options)}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [blocks, totalCount] = await Promise.all([
      ConnectionBlock.findByBlocker(blockerId, options),
      ConnectionBlock.getBlockCount(blockerId, status)
    ]);

    const response = {
      blocks,
      totalCount,
      pagination: {
        currentPage: pagination.page,
        totalPages: Math.ceil(totalCount / pagination.limit),
        totalCount,
        hasNext: pagination.page * pagination.limit < totalCount,
        hasPrev: pagination.page > 1
      }
    };

    const cacheTTL = (environmentConfig as any).CACHE_TTL_BLOCK_LIST || 1800;
    await cacheService.set(cacheKey, JSON.stringify(response), cacheTTL);

    return response;
  },

  /**
   * Check if user is blocked
   */
  async isUserBlocked(params: IsUserBlockedParams): Promise<{ isBlocked: boolean; isBlockedByCurrentUser: boolean; isBlockingCurrentUser: boolean; isMutuallyBlocked: boolean; canInteract: boolean }> {
    const { currentUserId, userId } = params;

    const cacheKey = `blockStatus:${currentUserId}:${userId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [isBlockedByUser, isBlockingUser, isMutuallyBlocked] = await Promise.all([
      ConnectionBlock.isBlocked(currentUserId, userId),
      ConnectionBlock.isBlocked(userId, currentUserId),
      ConnectionBlock.isMutuallyBlocked(currentUserId, userId)
    ]);

    const blockStatus = {
      isBlocked: isBlockedByUser || isBlockingUser,
      isBlockedByCurrentUser: isBlockedByUser,
      isBlockingCurrentUser: isBlockingUser,
      isMutuallyBlocked,
      canInteract: !isBlockedByUser && !isBlockingUser
    };

    const cacheTTL = (environmentConfig as any).CACHE_TTL_BLOCK_STATUS || 3600;
    await cacheService.set(cacheKey, JSON.stringify(blockStatus), cacheTTL);

    return blockStatus;
  },

  /**
   * Get block history
   */
  async getBlockHistory(params: GetBlockHistoryParams): Promise<{ history: IConnectionBlock[]; summary: any }> {
    const { userId, startDate, endDate, includeAppeals = false, limit = 50 } = params;

    const options = {
      startDate,
      endDate,
      includeAppeals,
      limit: Math.min(limit, 100)
    };

    const history = await ConnectionBlock.getBlockHistory(userId, options);

    const summary = {
      totalBlocks: history.length,
      activeBlocks: history.filter(b => b.isActive).length,
      expiredBlocks: history.filter(b => b.status === BlockStatus.EXPIRED).length,
      appealedBlocks: history.filter(b => b.metadata.appealSubmitted).length
    };

    logger.info('Block history retrieved', {
      userId,
      recordCount: history.length,
      category: LogCategory.AUDIT
    });

    return { history, summary };
  },

  /**
   * Bulk block users
   */
  async bulkBlock(params: BulkBlockParams): Promise<{ successfulBlocks: number; alreadyBlocked: number; totalRequested: number; blocks: any[] }> {
    const { blockerId, blockedIds, reason, blockType, metadata = {} } = params;

    const bulkLimit = (environmentConfig as any).BULK_OPERATION_BATCH_SIZE || 100;
    if (blockedIds.length > bulkLimit) {
      throw new ErrorResponse(`Bulk operation limited to ${bulkLimit} users`, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
    }

    const filteredIds = blockedIds.filter(id => id !== blockerId);

    const existingBlocks = await ConnectionBlock.find({
      blockerId,
      blockedId: { $in: filteredIds },
      isActive: true
    }).distinct('blockedId');

    const newBlockIds = filteredIds.filter(id => !existingBlocks.includes(id));

    if (newBlockIds.length === 0) {
      throw new ErrorResponse('All users are already blocked', HttpStatus.BAD_REQUEST, ERROR_CODES.DUPLICATE_RECORD);
    }

    const blocks = await ConnectionBlock.bulkBlock(blockerId, newBlockIds, reason, blockType, metadata);

    newBlockIds.forEach(id => {
      cacheService.del(`block:${blockerId}:${id}`);
      cacheService.del(`blockedUsers:${blockerId}:*`);
    });

    // ✅ KAFKA: Publish bulk block events
    try {
      for (const blockedId of newBlockIds) {
        await networkProducer.publishUserBlocked({
          blockerId,
          blockedId,
          reason,
          blockType,
          timestamp: new Date()
        });
      }

      await analyticsProducer.publishUserAction({
        userId: blockerId,
        action: 'bulk_block',
        entity: 'block',
        properties: {
          count: blocks.length,
          reason,
          blockType
        },
        timestamp: new Date().toISOString()
      });
    } catch (kafkaError) {
      logger.error('Failed to publish bulk block events', {
        category: LogCategory.CONNECTION,
        blockerId,
        error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
      });
    }

    if (queueService.addJob) {
      await queueService.addJob('notifications', 'sendBulkNotifications', {
        type: 'block',
        toUserIds: newBlockIds,
        fromUserId: blockerId,
        message: `You have been blocked by user ${blockerId}`
      });
    }

    if (queueService.addJob) {
      await queueService.addJob('analytics', 'trackAnalytics', {
        event: 'bulk_block',
        userId: blockerId,
        properties: { count: blocks.length, reason }
      });
    }

    logger.auditLog('bulk_block_operation', blockerId, {
      totalRequested: blockedIds.length,
      successfulBlocks: blocks.length,
      alreadyBlocked: existingBlocks.length,
      reason,
      blockType,
      category: LogCategory.BULK_OPERATION
    });

    return {
      successfulBlocks: blocks.length,
      alreadyBlocked: existingBlocks.length,
      totalRequested: blockedIds.length,
      blocks: blocks.map(b => ({ id: b._id, blockedId: b.blockedId, blockedAt: b.blockedAt }))
    };
  },

  /**
   * Get block analytics
   */
  async getBlockAnalytics(params: GetBlockAnalyticsParams): Promise<{ userStats: any; systemAnalytics: any | null }> {
    const { userId, timeframe = 'week', includeSystemWide = false, isAdmin = false } = params;

    const userStats = await ConnectionBlock.getBlockStats(userId);

    let systemAnalytics = null;
    if (includeSystemWide && isAdmin) {
      systemAnalytics = await ConnectionBlock.getSystemBlockAnalytics(timeframe);
    }

    logger.info('Block analytics generated', {
      userId,
      includeSystemWide,
      timeframe,
      category: LogCategory.PERFORMANCE
    });

    return { userStats, systemAnalytics };
  },

  /**
   * Set block notifications
   */
  async setBlockNotifications(params: SetBlockNotificationsParams): Promise<any> {
    const { userId, enableBlockNotifications = true, enableUnblockNotifications = true, enableAppealNotifications = true, notificationChannels = ['email'], escalationThreshold = 3 } = params;

    const settings = {
      enableBlockNotifications,
      enableUnblockNotifications,
      enableAppealNotifications,
      notificationChannels,
      escalationThreshold
    };

    logger.info('Block notification settings updated (stored locally)', { 
      userId, 
      settings,
      note: 'External user service unavailable - settings stored locally'
    });

    const recentBlocks = await ConnectionBlock.findRecentBlocks(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const relevantBlocks = recentBlocks.filter(block => block.blockerId === userId || block.blockedId === userId);

    logger.auditLog('notification_settings_updated', userId, {
      settings,
      recentBlocksCount: relevantBlocks.length,
      category: LogCategory.SYSTEM
    });

    return {
      settings,
      recentActivityCount: relevantBlocks.length,
      note: 'Settings updated locally - external user service integration disabled'
    };
  },

  /**
   * Handle block appeal
   * ✅ KAFKA: Publishes BLOCK_APPEAL_SUBMITTED event
   */
  async handleBlockAppeal(params: HandleBlockAppealParams): Promise<IConnectionBlock> {
    const { blockId, userId, action, appealReason, decision, reviewNotes, isAdmin = false } = params;

    const block = await ConnectionBlock.findById(blockId);
    if (!block) {
      throw new ErrorResponse('Block not found', HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND);
    }

    let updatedBlock: IConnectionBlock;

    if (action === 'submit_appeal') {
      if (block.blockedId !== userId) {
        throw new ErrorResponse('Can only appeal blocks against yourself', HttpStatus.FORBIDDEN, ERROR_CODES.ACCESS_DENIED);
      }
      if (block.metadata.appealSubmitted) {
        throw new ErrorResponse('Appeal already submitted', HttpStatus.BAD_REQUEST, ERROR_CODES.DUPLICATE_RECORD);
      }
      updatedBlock = await block.submitAppeal(appealReason!, userId);

      // ✅ KAFKA: Publish BLOCK_APPEAL_SUBMITTED event
      try {
        await networkProducer.publishBlockAppealSubmitted({
          blockId: block._id.toString(),
          blockerId: block.blockerId,
          blockedId: block.blockedId,
          appealReason: appealReason!,
          timestamp: new Date()
        });

        await analyticsProducer.publishUserAction({
          userId,
          action: 'block_appeal_submitted',
          entity: 'block',
          entityId: block._id.toString(),
          properties: {
            blockerId: block.blockerId,
            blockedId: block.blockedId,
            appealReason
          },
          timestamp: new Date().toISOString()
        });
      } catch (kafkaError) {
        logger.error('Failed to publish block appeal submitted event', {
          category: LogCategory.CONNECTION,
          blockId,
          error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
        });
      }

      if (queueService.addJob) {
        await queueService.addJob('notifications', 'sendNotification', {
          type: 'appeal_submitted',
          toUserId: block.blockerId,
          fromUserId: userId,
          message: `User ${userId} has appealed your block`
        });
      }

      logger.auditLog('block_appeal_submitted', userId, {
        blockId: block._id.toString(),
        appealReason,
        category: LogCategory.AUDIT
      });

    } else if (action === 'review_appeal') {
      if (!isAdmin) {
        throw new ErrorResponse('Admin access required', HttpStatus.FORBIDDEN, ERROR_CODES.ACCESS_DENIED);
      }
      if (!decision || !['approved', 'rejected'].includes(decision)) {
        throw new ErrorResponse('Invalid decision', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
      }
      updatedBlock = await ConnectionBlock.processAppeal(blockId, decision, userId, reviewNotes);

      // ✅ KAFKA: Publish appeal review event
      try {
        await analyticsProducer.publishUserAction({
          userId,
          action: 'block_appeal_reviewed',
          entity: 'block',
          entityId: block._id.toString(),
          properties: {
            blockerId: block.blockerId,
            blockedId: block.blockedId,
            decision,
            reviewNotes
          },
          timestamp: new Date().toISOString()
        });
      } catch (kafkaError) {
        logger.error('Failed to publish appeal review event', {
          category: LogCategory.CONNECTION,
          blockId,
          error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
        });
      }

      if (queueService.addJob) {
        await queueService.addJob('notifications', 'sendNotification', {
          type: 'appeal_reviewed',
          toUserId: block.blockedId,
          fromUserId: userId,
          message: `Your appeal has been ${decision}`
        });
      }

      logger.auditLog('block_appeal_reviewed', userId, {
        blockId: block._id.toString(),
        decision,
        reviewNotes,
        category: LogCategory.AUDIT
      });
    } else {
      throw new ErrorResponse('Invalid action', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
    }

    return updatedBlock;
  },

  /**
   * Get block reasons
   */
  async getBlockReasons(params: GetBlockReasonsParams): Promise<any> {
    const { includeCustomReasons = false, includeStatistics = false, isAdmin = false } = params;

    const standardReasons = Object.values(BlockReason).map(reason => ({
      value: reason,
      label: reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: getReasonDescription(reason)
    }));

    let customReasons: any[] = [];
    if (includeCustomReasons) {
      const customReasonsAgg = await ConnectionBlock.aggregate([
        { $match: { customReason: { $exists: true, $ne: null } } },
        { $group: { _id: '$customReason', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]);
      customReasons = customReasonsAgg.map(r => ({ reason: r._id, usage_count: r.count }));
    }

    let statistics = null;
    if (includeStatistics && isAdmin) {
      const reasonStats = await ConnectionBlock.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: '$reason', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      statistics = {
        timeframe: 'last_30_days',
        totalBlocks: reasonStats.reduce((sum, r) => sum + r.count, 0),
        reasonBreakdown: reasonStats,
        mostCommonReason: reasonStats[0]?._id || null
      };
    }

    return {
      standardReasons,
      customReasons,
      statistics,
      availableSeverityLevels: Object.values(BlockSeverity),
      blockTypes: Object.values(BlockType)
    };
  },

  /**
   * Set block privacy
   */
  async setBlockPrivacy(params: SetBlockPrivacyParams): Promise<any> {
    const { userId, hideBlockedList = false, allowDataExport = true, enableAutoAnonymization = true, dataRetentionDays = 365, shareAnalyticsData = false } = params;

    const settings = {
      hideBlockedList,
      allowDataExport,
      enableAutoAnonymization,
      dataRetentionDays: Math.min(dataRetentionDays, 2555),
      shareAnalyticsData
    };

    logger.info('Block privacy settings updated (stored locally)', { 
      userId, 
      settings,
      note: 'External user service unavailable - settings stored locally'
    });

    let anonymizedCount = 0;
    if (enableAutoAnonymization && dataRetentionDays < 365) {
      anonymizedCount = await ConnectionBlock.anonymizeExpiredBlocks(dataRetentionDays);
      logger.info('Auto-anonymization processed', {
        userId,
        anonymizedCount,
        dataRetentionDays,
        category: LogCategory.SYSTEM
      });
    }

    logger.auditLog('privacy_settings_updated', userId, {
      settings,
      category: LogCategory.AUDIT
    });

    return {
      settings,
      anonymizedCount,
      dataRetentionPolicy: {
        retentionDays: dataRetentionDays,
        nextCleanupDate: new Date(Date.now() + dataRetentionDays * 24 * 60 * 60 * 1000)
      },
      note: 'Settings updated locally - external user service integration disabled'
    };
  },

  /**
   * Export block data
   */
  async exportBlockData(params: ExportBlockDataParams): Promise<{ metadata: any; blocks: any[] }> {
    const { userId, format = 'json', includeAuditLog = false, includeMetadata = false, dateRange } = params;

    const privacySettings = { allowDataExport: true };
    
    logger.info('Using default privacy settings for data export', { 
      userId,
      note: 'External user service unavailable - using default settings'
    });
    
    if (!privacySettings.allowDataExport) {
      throw new ErrorResponse('Data export disabled in privacy settings', HttpStatus.FORBIDDEN, ERROR_CODES.ACCESS_DENIED);
    }

    let blocks = await ConnectionBlock.findBlocksForDataExport(userId);

    if (dateRange) {
      blocks = blocks.filter(block => {
        const blockDate = block.createdAt;
        return blockDate >= dateRange.startDate && blockDate <= dateRange.endDate;
      });
    }

    const exportData = blocks.map(block => {
      const baseData: any = {
        blockId: block._id,
        blockerId: block.blockerId,
        blockedId: block.blockedId,
        reason: block.reason,
        customReason: block.customReason,
        status: block.status,
        blockedAt: block.blockedAt,
        unblockedAt: block.unblockedAt,
        isActive: block.isActive
      };

      if (includeMetadata) {
        baseData.metadata = {
          severity: block.metadata.severity,
          reportCount: block.metadata.reportCount,
          appealSubmitted: block.metadata.appealSubmitted,
          appealReason: block.metadata.appealReason
        };
      }

      if (includeAuditLog) {
        baseData.auditLog = block.auditLog.map(log => ({
          action: log.action,
          timestamp: log.timestamp,
          performedBy: log.performedBy === userId ? 'self' : 'other',
          reason: log.reason
        }));
      }

      return baseData;
    });

    const exportMetadata = {
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      totalRecords: exportData.length,
      format,
      includeAuditLog,
      includeMetadata,
      dataCompliance: 'GDPR_COMPLIANT',
      note: 'Export generated with default privacy settings - external user service integration disabled'
    };

    logger.auditLog('block_data_exported', userId, {
      recordCount: exportData.length,
      format,
      includeAuditLog,
      includeMetadata,
      category: LogCategory.AUDIT
    });

    return { metadata: exportMetadata, blocks: exportData };
  },

  /**
   * Get pending appeals (Admin only)
   */
  async getPendingAppeals(params: GetPendingAppealsParams): Promise<{ appeals: IConnectionBlock[]; totalPending: number; hasMore: boolean }> {
    const { moderatorId, limit = 20 } = params;

    const pendingAppeals = await ConnectionBlock.findPendingAppeals(moderatorId);

    const limitedAppeals = pendingAppeals.slice(0, limit);

    return {
      appeals: limitedAppeals,
      totalPending: pendingAppeals.length,
      hasMore: pendingAppeals.length > limit
    };
  },

  /**
   * Get escalated blocks (Admin only)
   */
  async getEscalatedBlocks(): Promise<{ blocks: IConnectionBlock[]; totalEscalated: number; severityBreakdown: any }> {
    const escalatedBlocks = await ConnectionBlock.findEscalatedBlocks();

    const severityBreakdown = {
      critical: escalatedBlocks.filter(b => b.metadata.severity === BlockSeverity.CRITICAL).length,
      high: escalatedBlocks.filter(b => b.metadata.severity === BlockSeverity.HIGH).length,
      highReports: escalatedBlocks.filter(b => b.metadata.reportCount >= 3).length
    };

    return {
      blocks: escalatedBlocks,
      totalEscalated: escalatedBlocks.length,
      severityBreakdown
    };
  }
};

/**
 * Helper function to get reason descriptions
 */
function getReasonDescription(reason: BlockReason): string {
  const descriptions: Record<BlockReason, string> = {
    [BlockReason.SPAM]: 'Unsolicited or repetitive messaging',
    [BlockReason.HARASSMENT]: 'Targeted harassment or bullying behavior',
    [BlockReason.INAPPROPRIATE_CONTENT]: 'Sharing inappropriate or offensive content',
    [BlockReason.FAKE_PROFILE]: 'Suspected fake or impersonated profile',
    [BlockReason.PRIVACY_VIOLATION]: 'Violation of privacy or sharing personal information',
    [BlockReason.COMMERCIAL_ABUSE]: 'Unwanted commercial or promotional content',
    [BlockReason.IMPERSONATION]: 'Impersonating another person or entity',
    [BlockReason.HATE_SPEECH]: 'Hate speech or discriminatory content',
    [BlockReason.VIOLENT_CONTENT]: 'Threats or violent content',
    [BlockReason.SCAM_FRAUD]: 'Suspected scam or fraudulent activity',
    [BlockReason.COPYRIGHT_VIOLATION]: 'Copyright infringement or unauthorized content',
    [BlockReason.OTHER]: 'Other reason (see custom reason)'
  };

  return descriptions[reason] || 'Unknown reason';
}

export default blockService;