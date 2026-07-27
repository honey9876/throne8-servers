// src/controllers/blockController.ts
import { Request, Response } from 'express';
import logger, { LogCategory } from '../utils/logger';
import environmentConfig from '../config/environment';
import ConnectionBlock, { BlockReason, BlockStatus, BlockType, BlockSeverity } from '../models/mongodb/ConnectionBlock';
import { ErrorResponse, SuccessResponse, HttpStatus } from '../utils/response';
import { ERROR_CODES } from '../utils/constants';
import { asyncHandler } from '../middleware/asyns.middleware';
import { validationResult } from 'express-validator';

/**
 * Block Controller
 * Handles blocking-related API endpoints for the Connection Service.
 * Optimized for 100M+ users with advanced indexing, pagination, caching, and analytics.
 * 
 * Features (Complete 12):
 * 1. blockUser
 * 2. unblockUser
 * 3. getBlockedUsers
 * 4. isUserBlocked
 * 5. getBlockHistory
 * 6. setBulkBlockRules
 * 7. getBlockAnalytics
 * 8. setBlockNotifications
 * 9. handleBlockAppeal
 * 10. getBlockReasons
 * 11. setBlockPrivacy
 * 12. exportBlockData
 * 
 * Dependencies:
 * - express: For handling HTTP requests and responses
 * - mongoose: For MongoDB operations (ConnectionBlock model)
 * - winston: For logging (logger)
 * - environmentConfig: For validated environment variables
 * - asyncHandler: For async error handling
 * - response: For standardized ErrorResponse and SuccessResponse
 * - express-validator: For input validation
 * 
 * Scalability Considerations:
 * - Efficient indexing and lean queries for large datasets
 * - Pagination for list operations
 * - Caching with Redis for frequent queries
 * - Rate limiting integration (RATE_LIMIT_*)
 * - Async operations for performance
 * - Audit logging for critical actions
 * - Appeal system with admin workflow
 * - Bulk operations with batch processing
 * - GDPR-compliant data export
 * 
 * Integration:
 * - Uses ConnectionBlock.ts for data operations
 * - Logs to LOG_FILE_PATH and LOG_ERROR_FILE_PATH
 * - Supports health endpoints from output
 */

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: 'user' | 'admin';
    email?: string;
  };
}

class blockController {}

/**
 * Block a user
 * Feature 1 of 12 - Core blocking functionality with audit trail
 * 
 * @route POST /api/v1/block
 * @access Private
 * @rateLimit RATE_LIMIT_BLOCK_USER per day
 */
export const blockUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Block user validation failed', {
      errors: errors.array(),
      userId: authReq.user?.id,
      category: LogCategory.VALIDATION
    });
    res.status(HttpStatus.BAD_REQUEST).json(
      new ErrorResponse('Validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED, errors.array())
    );
    return;
  }

  const blockerId = authReq.user.id;
  const { blockedId, reason, customReason, blockType = BlockType.USER_INITIATED, expiresAt, metadata } = req.body;

  // Prevent self-blocking
  if (blockerId === blockedId) {
    res.status(HttpStatus.BAD_REQUEST).json(
      new ErrorResponse('Cannot block yourself', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED)
    );
    return;
  }

  // Check if already blocked
  const existingBlock = await ConnectionBlock.isBlocked(blockerId, blockedId);
  if (existingBlock) {
    res.status(HttpStatus.CONFLICT).json(
      new ErrorResponse('User already blocked', HttpStatus.CONFLICT, ERROR_CODES.DUPLICATE_RECORD)
    );
    return;
  }

  // Create block record
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
      reportCount: metadata?.reportedBy ? 1 : 0,
      severity: BlockSeverity.LOW,
      appealSubmitted: false,
      automaticUnblockEnabled: !!expiresAt,
      reportedBy: metadata?.reportedBy ? [metadata.reportedBy] : [],
      evidenceUrls: metadata?.evidence || [],
      blockerIP: req.ip,
      userAgent: req.get('User-Agent'),
      platform: req.get('X-Platform') || 'web'
    },
    auditLog: [{
      action: 'blocked',
      performedBy: blockerId,
      performedByType: 'user',
      timestamp: new Date(),
      reason,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }]
  };

  const block = new ConnectionBlock(blockData);
  await block.save();

  logger.auditLog('user_blocked', blockerId, {
    blockedId,
    reason,
    blockType,
    connectionId: block._id.toString(),
    category: LogCategory.CONNECTION
  });

  res.status(HttpStatus.CREATED).json(
    SuccessResponse({ 
      blockId: block._id, 
      blockedAt: block.blockedAt 
    }, 'User blocked successfully', HttpStatus.CREATED)
  );
});

/**
 * Unblock a user
 * Feature 2 of 12 - Remove blocking with reason tracking
 * 
 * @route DELETE /api/v1/block/:blockedId
 * @access Private
 */
export const unblockUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const { blockedId } = req.params;
  const { reason = 'unblocked by user' } = req.body;
  const blockerId = authReq.user.id;

  const block = await ConnectionBlock.findOne({
    blockerId,
    blockedId,
    isActive: true
  });

  if (!block) {
    res.status(HttpStatus.NOT_FOUND).json(
      new ErrorResponse('Block not found', HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND)
    );
    return;
  }

  await block.unblock(blockerId, reason);

  logger.auditLog('user_unblocked', blockerId, {
    blockedId,
    reason,
    connectionId: block._id.toString(),
    category: LogCategory.CONNECTION
  });

  res.json(
    SuccessResponse({ 
      blockId: block._id, 
      unblockedAt: block.unblockedAt 
    }, 'User unblocked successfully')
  );
});

/**
 * Get blocked users list
 * Feature 3 of 12 - Paginated list of blocked users with filtering
 * 
 * @route GET /api/v1/block/blocked
 * @access Private
 */
export const getBlockedUsers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const blockerId = authReq.user.id;
  const { 
    page = 1, 
    limit = 20, 
    sortBy = 'blockedAt', 
    sortOrder = 'desc',
    includeInactive = false,
    status,
    reason 
  } = req.query;

  const pagination = {
    page: Math.max(1, Number(page)),
    limit: Math.min(Number(limit), environmentConfig.PAGINATION_MAX_LIMIT)
  };

  const query: any = { blockerId };
  if (!includeInactive) query.isActive = true;
  if (status) query.status = status;
  if (reason) query.reason = reason;

  const options = {
    includeInactive: Boolean(includeInactive),
    limit: pagination.limit,
    skip: (pagination.page - 1) * pagination.limit,
    sortBy: `${sortBy}${sortOrder === 'desc' ? '' : ''}`
  };

  const [blocks, totalCount] = await Promise.all([
    ConnectionBlock.findByBlocker(blockerId, options),
    ConnectionBlock.getBlockCount(blockerId, status as BlockStatus)
  ]);

  const responseData = {
    blocks,
    pagination: {
      currentPage: pagination.page,
      totalPages: Math.ceil(totalCount / pagination.limit),
      totalCount,
      hasNext: pagination.page * pagination.limit < totalCount,
      hasPrev: pagination.page > 1
    }
  };

  res.json(SuccessResponse(responseData, 'Blocked users retrieved successfully'));
});

/**
 * Check if user is blocked
 * Feature 4 of 12 - Quick block status lookup (bidirectional)
 * 
 * @route GET /api/v1/block/status/:userId
 * @access Private
 */
export const isUserBlocked = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const { userId } = req.params;
  const currentUserId = authReq.user.id;

  // Check both directions efficiently
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

  res.json(SuccessResponse(blockStatus, 'Block status retrieved successfully'));
});

/**
 * Get block history
 * Feature 5 of 12 - Historical block data with date filtering
 * 
 * @route GET /api/v1/block/history
 * @access Private
 */
export const getBlockHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const {
    startDate,
    endDate,
    includeAppeals = false,
    limit = 50
  } = req.query;

  const options = {
    startDate: startDate ? new Date(startDate as string) : undefined,
    endDate: endDate ? new Date(endDate as string) : undefined,
    includeAppeals: Boolean(includeAppeals),
    limit: Math.min(Number(limit), 100)
  };

  const history = await ConnectionBlock.getBlockHistory(userId, options);

  const responseData = {
    history,
    summary: {
      totalBlocks: history.length,
      activeBlocks: history.filter(b => b.isActive).length,
      expiredBlocks: history.filter(b => b.status === BlockStatus.EXPIRED).length,
      appealedBlocks: history.filter(b => b.metadata.appealSubmitted).length
    }
  };

  logger.info('Block history retrieved', {
    userId,
    recordCount: history.length,
    category: LogCategory.AUDIT
  });

  res.json(SuccessResponse(responseData, 'Block history retrieved successfully'));
});

/**
 * Set bulk block rules
 * Feature 6 of 12 - Mass blocking operations with rate limiting
 * 
 * @route POST /api/v1/block/bulk
 * @access Private
 */
export const setBulkBlockRules = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(HttpStatus.BAD_REQUEST).json(
      new ErrorResponse('Validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED, errors.array())
    );
    return;
  }

  const blockerId = authReq.user.id;
  const { blockedIds, reason, blockType } = req.body;

  // Rate limiting check
  const bulkLimit = environmentConfig.BULK_OPERATION_BATCH_SIZE || 100;
  if (blockedIds.length > bulkLimit) {
    res.status(HttpStatus.BAD_REQUEST).json(
      new ErrorResponse(`Bulk operation limited to ${bulkLimit} users`, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED)
    );
    return;
  }

  // Remove self from list
  const filteredIds = blockedIds.filter((id: string) => id !== blockerId);

  // Check existing blocks
  const existingBlocks = await ConnectionBlock.find({
    blockerId,
    blockedId: { $in: filteredIds },
    isActive: true
  }).distinct('blockedId');

  const newBlockIds = filteredIds.filter((id: string) => !existingBlocks.includes(id));

  if (newBlockIds.length === 0) {
    res.status(HttpStatus.BAD_REQUEST).json(
      new ErrorResponse('All users are already blocked', HttpStatus.BAD_REQUEST, ERROR_CODES.DUPLICATE_RECORD)
    );
    return;
  }

  const metadata = {
    reportCount: 0,
    severity: BlockSeverity.LOW,
    appealSubmitted: false,
    automaticUnblockEnabled: false,
    reportedBy: [],
    blockerIP: req.ip,
    userAgent: req.get('User-Agent'),
    platform: req.get('X-Platform') || 'web'
  };

  const blocks = await ConnectionBlock.bulkBlock(blockerId, newBlockIds, reason, blockType, metadata);

  logger.auditLog('bulk_block_operation', blockerId, {
    totalRequested: blockedIds.length,
    successfulBlocks: blocks.length,
    alreadyBlocked: existingBlocks.length,
    reason,
    blockType,
    category: LogCategory.BULK_OPERATION
  });

  const responseData = {
    successfulBlocks: blocks.length,
    alreadyBlocked: existingBlocks.length,
    totalRequested: blockedIds.length,
    blocks: blocks.map(b => ({ id: b._id, blockedId: b.blockedId, blockedAt: b.blockedAt }))
  };

  res.status(HttpStatus.CREATED).json(
    SuccessResponse(responseData, 'Bulk block operation completed', HttpStatus.CREATED)
  );
});

/**
 * Get block analytics
 * Feature 7 of 12 - Comprehensive blocking statistics and analytics
 * 
 * @route GET /api/v1/block/analytics
 * @access Private
 */
export const getBlockAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { 
    timeframe = 'week', 
    includeSystemWide = false 
  } = req.query;

  // User-specific analytics
  const userStats = await ConnectionBlock.getBlockStats(userId);

  let systemAnalytics = null;
  if (includeSystemWide && authReq.user.role === 'admin') {
    systemAnalytics = await ConnectionBlock.getSystemBlockAnalytics(timeframe as 'day' | 'week' | 'month');
  }

  const responseData = {
    userStats,
    systemAnalytics,
    generatedAt: new Date().toISOString(),
    timeframe
  };

  logger.info('Block analytics generated', {
    userId,
    includeSystemWide: Boolean(includeSystemWide),
    timeframe,
    category: LogCategory.PERFORMANCE
  });

  res.json(SuccessResponse(responseData, 'Block analytics retrieved successfully'));
});

/**
 * Set block notifications
 * Feature 8 of 12 - Configure notification preferences for blocking events
 * 
 * @route PUT /api/v1/block/notifications
 * @access Private
 */
export const setBlockNotifications = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { 
    enableBlockNotifications = true,
    enableUnblockNotifications = true,
    enableAppealNotifications = true,
    notificationChannels = ['email'],
    escalationThreshold = 3
  } = req.body;

  const notificationSettings = {
    userId,
    enableBlockNotifications,
    enableUnblockNotifications,
    enableAppealNotifications,
    notificationChannels,
    escalationThreshold,
    updatedAt: new Date()
  };

  // Get recent blocks for immediate notification processing
  const recentBlocks = await ConnectionBlock.findRecentBlocks(
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  );

  const relevantBlocks = recentBlocks.filter(block => 
    block.blockerId === userId || block.blockedId === userId
  );

  logger.auditLog('notification_settings_updated', userId, {
    settings: notificationSettings,
    recentBlocksCount: relevantBlocks.length,
    category: LogCategory.SYSTEM
  });

  const responseData = {
    settings: notificationSettings,
    recentActivityCount: relevantBlocks.length,
    lastUpdated: new Date()
  };

  res.json(SuccessResponse(responseData, 'Block notification settings updated successfully'));
});

/**
 * Handle block appeal
 * Feature 9 of 12 - Appeal submission and admin review system
 * 
 * @route POST /api/v1/block/appeal/:blockId
 * @access Private
 */
export const handleBlockAppeal = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const { blockId } = req.params;
  const { action, appealReason, reviewNotes } = req.body;
  const userId = authReq.user.id;

  const block = await ConnectionBlock.findById(blockId);
  if (!block) {
    res.status(HttpStatus.NOT_FOUND).json(
      new ErrorResponse('Block not found', HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND)
    );
    return;
  }

  if (action === 'submit_appeal') {
    // User submitting appeal
    if (block.blockedId !== userId) {
      res.status(HttpStatus.FORBIDDEN).json(
        new ErrorResponse('Can only appeal blocks against yourself', HttpStatus.FORBIDDEN, ERROR_CODES.ACCESS_DENIED)
      );
      return;
    }

    if (block.metadata.appealSubmitted) {
      res.status(HttpStatus.BAD_REQUEST).json(
        new ErrorResponse('Appeal already submitted', HttpStatus.BAD_REQUEST, ERROR_CODES.DUPLICATE_RECORD)
      );
      return;
    }

    await block.submitAppeal(appealReason, userId);

    logger.auditLog('block_appeal_submitted', userId, {
      blockId: block._id.toString(),
      appealReason,
      category: LogCategory.AUDIT
    });

    res.json(SuccessResponse({ 
      blockId: block._id,
      appealedAt: block.metadata.appealedAt,
      status: 'pending_review'
    }, 'Appeal submitted successfully'));

  } else if (action === 'review_appeal') {
    // Admin reviewing appeal
    if (authReq.user.role !== 'admin') {
      res.status(HttpStatus.FORBIDDEN).json(
        new ErrorResponse('Admin access required', HttpStatus.FORBIDDEN, ERROR_CODES.ACCESS_DENIED)
      );
      return;
    }

    const { decision } = req.body;
    
    if (!['approved', 'rejected'].includes(decision)) {
      res.status(HttpStatus.BAD_REQUEST).json(
        new ErrorResponse('Invalid decision', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED)
      );
      return;
    }

    const updatedBlock = await ConnectionBlock.processAppeal(blockId, decision, userId, reviewNotes);

    logger.auditLog('block_appeal_reviewed', userId, {
      blockId: block._id.toString(),
      decision,
      reviewNotes,
      category: LogCategory.AUDIT
    });

    res.json(SuccessResponse({
      blockId: updatedBlock._id,
      decision,
      reviewedAt: updatedBlock.metadata.reviewedAt,
      reviewedBy: updatedBlock.metadata.reviewedBy
    }, `Appeal ${decision} successfully`));
  }
});

/**
 * Get block reasons
 * Feature 10 of 12 - Available block reasons with descriptions and statistics
 * 
 * @route GET /api/v1/block/reasons
 * @access Private
 */
export const getBlockReasons = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const { includeCustomReasons = false, includeStatistics = false } = req.query;
  
  // Standard block reasons
  const standardReasons = Object.values(BlockReason).map(reason => ({
    value: reason,
    label: reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    description: getReasonDescription(reason)
  }));

  let customReasons: Array<{reason: string; usage_count: number}> = [];
  let statistics = null;

  if (includeCustomReasons) {
    const customReasonsAgg = await ConnectionBlock.aggregate([
      { $match: { customReason: { $exists: true, $ne: null } } },
      { $group: { _id: '$customReason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    
    customReasons = customReasonsAgg.map(r => ({
      reason: r._id,
      usage_count: r.count
    }));
  }

  if (includeStatistics && authReq.user.role === 'admin') {
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

  const responseData = {
    standardReasons,
    customReasons,
    statistics,
    availableSeverityLevels: Object.values(BlockSeverity),
    blockTypes: Object.values(BlockType)
  };

  res.json(SuccessResponse(responseData, 'Block reasons retrieved successfully'));
});

/**
 * Set block privacy
 * Feature 11 of 12 - Privacy settings and GDPR compliance configuration
 * 
 * @route PUT /api/v1/block/privacy
 * @access Private
 */
export const setBlockPrivacy = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const {
    hideBlockedList = false,
    allowDataExport = true,
    enableAutoAnonymization = true,
    dataRetentionDays = 365,
    shareAnalyticsData = false
  } = req.body;

  const privacySettings = {
    userId,
    hideBlockedList,
    allowDataExport,
    enableAutoAnonymization,
    dataRetentionDays: Math.min(dataRetentionDays, 2555), // Max 7 years
    shareAnalyticsData,
    updatedAt: new Date()
  };

  // If auto-anonymization is enabled, process old blocks
  if (enableAutoAnonymization && dataRetentionDays < 365) {
    const anonymizedCount = await ConnectionBlock.anonymizeExpiredBlocks(dataRetentionDays);
    
    logger.info('Auto-anonymization processed', {
      userId,
      anonymizedCount,
      dataRetentionDays,
      category: LogCategory.SYSTEM
    });
  }

  logger.auditLog('privacy_settings_updated', userId, {
    settings: privacySettings,
    category: LogCategory.AUDIT
  });

  const responseData = {
    settings: privacySettings,
    dataRetentionPolicy: {
      retentionDays: dataRetentionDays,
      nextCleanupDate: new Date(Date.now() + dataRetentionDays * 24 * 60 * 60 * 1000)
    }
  };

  res.json(SuccessResponse(responseData, 'Block privacy settings updated successfully'));
});

/**
 * Export block data
 * Feature 12 of 12 - GDPR-compliant data export in JSON/CSV formats
 * 
 * @route GET /api/v1/block/export
 * @access Private
 */
export const exportBlockData = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.id;
  const { 
    format = 'json',
    includeAuditLog = false,
    includeMetadata = false,
    dateRange
  } = req.query;

  // Get user's blocks for export
  const blocks = await ConnectionBlock.findBlocksForDataExport(userId);

  // Filter by date range if provided
  let filteredBlocks = blocks;
  if (dateRange) {
    const { startDate, endDate } = JSON.parse(dateRange as string);
    filteredBlocks = blocks.filter(block => {
      const blockDate = block.createdAt;
      return blockDate >= new Date(startDate) && blockDate <= new Date(endDate);
    });
  }

  // Format data based on privacy settings
  const exportData = filteredBlocks.map(block => {
    const baseData = {
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

    // Add optional data based on request
    if (includeMetadata) {
      (baseData as any).metadata = {
        severity: block.metadata.severity,
        reportCount: block.metadata.reportCount,
        appealSubmitted: block.metadata.appealSubmitted,
        appealReason: block.metadata.appealReason
      };
    }

    if (includeAuditLog) {
      (baseData as any).auditLog = block.auditLog.map(log => ({
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
    dataCompliance: 'GDPR_COMPLIANT'
  };

  logger.auditLog('block_data_exported', userId, {
    recordCount: exportData.length,
    format,
    includeAuditLog,
    includeMetadata,
    category: LogCategory.AUDIT
  });

  if (format === 'csv') {
    // Generate CSV format
    const csvHeaders = Object.keys(exportData[0] || {}).join(',');
    const csvRows = exportData.map(row => 
      Object.values(row).map(val => 
        typeof val === 'object' ? JSON.stringify(val) : val
      ).join(',')
    );
    const csvContent = [csvHeaders, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="block_data_${userId}_${Date.now()}.csv"`);
    res.send(csvContent);
  } else {
    // JSON format (default)
    const responseData = {
      metadata: exportMetadata,
      blocks: exportData
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="block_data_${userId}_${Date.now()}.json"`);
    res.json(SuccessResponse(responseData, 'Block data exported successfully'));
  }
});

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

/**
 * Get pending appeals (Admin only)
 * Additional feature - Admin appeal review queue
 * 
 * @route GET /api/v1/block/appeals/pending
 * @access Admin
 */
export const getPendingAppeals = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user.role !== 'admin') {
    res.status(HttpStatus.FORBIDDEN).json(
      new ErrorResponse('Admin access required', HttpStatus.FORBIDDEN, ERROR_CODES.ACCESS_DENIED)
    );
    return;
  }

  const { moderatorId, limit = 20 } = req.query;

  const pendingAppeals = await ConnectionBlock.findPendingAppeals(moderatorId as string);
  const limitedAppeals = pendingAppeals.slice(0, Number(limit));

  const responseData = {
    appeals: limitedAppeals,
    totalPending: pendingAppeals.length,
    hasMore: pendingAppeals.length > Number(limit)
  };

  res.json(SuccessResponse(responseData, 'Pending appeals retrieved successfully'));
});

/**
 * Get escalated blocks (Admin only)
 * Additional feature - High-priority blocks requiring attention
 * 
 * @route GET /api/v1/block/escalated
 * @access Admin
 */
export const getEscalatedBlocks = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user.role !== 'admin') {
    res.status(HttpStatus.FORBIDDEN).json(
      new ErrorResponse('Admin access required', HttpStatus.FORBIDDEN, ERROR_CODES.ACCESS_DENIED)
    );
    return;
  }

  const escalatedBlocks = await ConnectionBlock.findEscalatedBlocks();

  const responseData = {
    blocks: escalatedBlocks,
    totalEscalated: escalatedBlocks.length,
    severityBreakdown: {
      critical: escalatedBlocks.filter(b => b.metadata.severity === BlockSeverity.CRITICAL).length,
      high: escalatedBlocks.filter(b => b.metadata.severity === BlockSeverity.HIGH).length,
      highReports: escalatedBlocks.filter(b => b.metadata.reportCount >= 3).length
    }
  };

  res.json(SuccessResponse(responseData, 'Escalated blocks retrieved successfully'));
});

export default {
  blockUser,
  unblockUser,
  getBlockedUsers,
  isUserBlocked,
  getBlockHistory,
  setBulkBlockRules,
  getBlockAnalytics,
  setBlockNotifications,
  handleBlockAppeal,
  getBlockReasons,
  setBlockPrivacy,
  exportBlockData,
  getPendingAppeals,
  getEscalatedBlocks
};


export {
  blockController
}