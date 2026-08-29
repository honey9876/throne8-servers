// src/connections/services/request.service.ts

import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import logger, { LogCategory } from '@/shared/logger.util';
import { Connection, ConnectionRequest, Follow } from '../models/index';
import { IConnectionRequest } from '@/connections/models/ConnectionRequest';
import { User } from '@/shared/models/index.models';
import { ErrorResponse } from '@/shared/response.util';
import environmentConfig from '@/config/environment/environment';
import redisService from '@/services/redis.service';
import { emitNotificationCount } from '@/socket/handlers/notificationHandler';
import { emitConnectionAccepted, emitConnectionRequest } from '@/socket/handlers/connectionHandler';
import { getIO } from '@/socket';
import NotificationService from '@/notifications/services/notification.service';

// ✅ KAFKA IMPORTS
// import { requestProducer } from '../kafka/producers/requestProducer';
// import { analyticsProducer } from '../kafka/producers/analyticsProducer';

/**
 * Connection Request Service with Kafka Event Publishing
 * Publishes events for:
 * - Request sent
 * - Request accepted
 * - Request declined
 * - Request cancelled
 * - Request analytics
 */

interface IConnection {
  _id?: unknown;
  connectionId: string;
  fromUserId: Types.ObjectId | string;
  toUserId: Types.ObjectId | string;
  connectionType: string;
  status: string;
  strength: number;
  priority: string;
  tags: string[];
  visibility: string;
  isArchived: boolean;
  lastInteraction: Date | undefined;
  region: string;
  shardKey: string;
  metadata?: any;
}

interface IServicePaginationResult<T> {
  data: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    estimatedTotal?: number;
  };
}

/**
 * Validates a connection request before creation
 */
// src/services/requestService.ts - Line 47-66

export async function validateConnectionRequest(fromUserId: string, toUserId: string, region: string = 'global'): Promise<void> {
  if (fromUserId === toUserId) {
    throw new ErrorResponse('Cannot send connection request to self', 400);
  }

  const [fromUser, toUser, existingRequest, existingConnection, dailyRequestCount] = await Promise.all([
    // ✅ FIXED: Use findOne with userId field instead of findById
    User.findOne({ userId: fromUserId }).lean().select('userId'),
    User.findOne({ userId: toUserId }).lean().select('userId'),

    ConnectionRequest.checkActiveRequestExists(fromUserId, toUserId, region),
    Connection.checkConnectionExists ? Connection.checkConnectionExists(fromUserId, toUserId) : Promise.resolve(false),

    ConnectionRequest.countDocuments({
      fromUserId: fromUserId,  // ✅ No Types.ObjectId wrapper
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      region,
    })
    // .hint('rate_limiting'),
  ]);

  if (!fromUser || !toUser) {
    throw new ErrorResponse('One or both users not found', 404);
  }

  if (existingRequest) {
    throw new ErrorResponse('Active connection request already exists', 409);
  }

  if (existingConnection) {
    throw new ErrorResponse('Connection already exists', 409);
  }

  if (dailyRequestCount >= (environmentConfig.MAX_CONNECTION_REQUESTS_PER_DAY || 50)) {
    throw new ErrorResponse('Daily connection request limit exceeded', 429);
  }
}

class connectionRequestService {

  /**
   * Sends a new connection request
   * ✅ KAFKA: Publishes REQUEST_SENT event - FIXED
   */
  static async sendConnectionRequest(
    
    fromUserId: string,
    toUserId: string,
    message?: string,
    priority: 'low' | 'medium' | 'high' = 'medium',
    templateId?: string,
    region: string = 'global'
  ): Promise<IConnectionRequest> {
    console.log('🔥🔥🔥 SEND CONNECTION SERVICE REACHED 🔥🔥🔥', {
  fromUserId,
  toUserId,
});
    if (!['low', 'medium', 'high'].includes(priority)) {
      throw new ErrorResponse('Invalid priority', 400);
    }

    if (message && message.length > 500) {
      throw new ErrorResponse('Message cannot exceed 500 characters', 400);
    }

    if (templateId && !/^[a-zA-Z0-9-]+$/.test(templateId)) {
      throw new ErrorResponse('Invalid templateId format', 400);
    }

    await validateConnectionRequest(fromUserId, toUserId, region);

    const request = await ConnectionRequest.create({
      fromUserId: fromUserId,
      toUserId: toUserId,
      message: message || '',
      status: 'pending' as const,
      priority,
      templateId,
      isRead: false,
      region,
    });

    // ✅ EMIT SOCKET EVENT
    try {
      const io = getIO();
      const fromUser = await User.findOne({ userId: fromUserId }).lean().select('firstName lastName profilePhoto');

      emitConnectionRequest(io, toUserId, {
        requestId: request.requestId,
        fromUserId,
        fromUserName: `${fromUser?.firstName} ${fromUser?.lastName}`.trim(),
        fromUserPhoto: fromUser?.profilePhotoId || undefined,
        message: message || '',
        timestamp: new Date().toISOString(),
      });

      // ✅ Update notification count
      const unreadCount = await ConnectionRequest.countDocuments({
        toUserId,
        status: 'pending',
        isRead: false,
      });

      emitNotificationCount(io, toUserId, unreadCount);
    } catch (socketError) {
      logger.error('Socket emission failed (non-critical)', {
        category: LogCategory.CONNECTION,
        data: { error: socketError instanceof Error ? socketError.message : 'Unknown' },
      });
    }

    // ✅ Persist Notification document so Notifications page can fetch it
    logger.info('🔴 BEFORE notifyConnectionRequest', {
  category: LogCategory.CONNECTION,
  data: {
    fromUserId,
    toUserId,
    requestId: request.requestId,
  },
});

try {
  await NotificationService.notifyConnectionRequest(
    fromUserId,
    toUserId,
    request.requestId
  );

  logger.info('🟢 AFTER notifyConnectionRequest SUCCESS', {
    category: LogCategory.CONNECTION,
    data: {
      fromUserId,
      toUserId,
      requestId: request.requestId,
    },
  });
} catch (err) {
  logger.error('🔴 notifyConnectionRequest FAILED', {
    category: LogCategory.CONNECTION,
    data: {
      error: err instanceof Error ? err.stack : String(err),
      fromUserId,
      toUserId,
      requestId: request.requestId,
    },
  });
}

    logger.info(`Connection request sent - RequestID: ${request.requestId}, From: ${fromUserId}, To: ${toUserId}, Region: ${region}, Priority: ${priority}`, {
      category: LogCategory.CONNECTION
    });

    // ✅ KAFKA: Publish REQUEST_SENT event - FIXED
    // try {
    //   await requestProducer.publishRequestSent(
    //     {
    //       requestId: request.requestId,
    //       senderId: fromUserId,
    //       receiverId: toUserId,
    //       message: message || '',
    //       sentAt: new Date().toISOString(),
    //       metadata: { priority, region }
    //     },
    //     fromUserId
    //   );

    //   // ✅ KAFKA: Publish analytics event - FIXED
    //   await analyticsProducer.track('request_sent', fromUserId, {
    //     requestId: request.requestId,
    //     fromUserId,
    //     toUserId,
    //     priority,
    //     region,
    //     timestamp: new Date().toISOString()
    //   });
    // } catch (kafkaError) {
    //   logger.error('Failed to publish request sent event', {
    //     category: LogCategory.CONNECTION,
    //     requestId: request.requestId,
    //     error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
    //   });
    // }

    connectionRequestService.manageRequestCaching(request.requestId, 'set').catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to cache new request - RequestID: ${request.requestId}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    });

    // ✅ Invalidate feed cache for both users so home feed reflects pending status immediately
    try {
      await Promise.all([
        redisService.deleteByPattern(`feed:v1:${fromUserId}:*`),
        redisService.deleteByPattern(`feed:v1:${toUserId}:*`),
      ]);
    } catch (cacheErr) {
      logger.warn('Failed to clear feed cache after connection request', cacheErr);
    }

    return request;
  }

  /**
   * Accepts a connection request and creates a connection
   * ✅ KAFKA: Publishes REQUEST_ACCEPTED event - FIXED
   */
  static async acceptConnectionRequest(
    requestId: string,
    userId: string,
    region: string = 'global'
  ): Promise<IConnection> {
    const request = await ConnectionRequest.findByRequestId(requestId, 'fromUserId toUserId status');
    if (!request) {
      throw new ErrorResponse('Connection request not found', 404);
    }

    if (request.toUserId.toString() !== userId) {
      throw new ErrorResponse('Not authorized to accept this request', 403);
    }

    if (request.status !== 'pending') {
      throw new ErrorResponse('Request is not in pending status', 400);
    }

    await ConnectionRequest.bulkUpdateStatus([requestId], 'accepted', userId);

    const sortedIds = [request.fromUserId.toString(), request.toUserId.toString()].sort();
    const connectionShardKey = `${sortedIds[0]}_${sortedIds[1]}_${region}`;

    const connection = await Connection.create({
      connectionId: uuidv4(),
      fromUserId: request.fromUserId,
      toUserId: request.toUserId,
      connectionType: 'professional',
      status: 'active',
      strength: 0,
      priority: 'medium',
      tags: [],
      visibility: environmentConfig.DEFAULT_PROFILE_VISIBILITY || 'public',
      isArchived: false,
      lastInteraction: new Date(),
      region,
      shardKey: connectionShardKey,
      metadata: { createdFromRequest: requestId },
    });

    // ✅ Algorithm: When User B accepts User A's request, User A follows User B
    // (User A following count +1, User B follower count +1)
    try {
      await Follow.findOneAndUpdate(
        { followerId: request.fromUserId.toString(), followingId: request.toUserId.toString() },
        {
          $set: { status: 'active', isBlocked: false, updatedAt: new Date() },
          $setOnInsert: {
            followerId: request.fromUserId.toString(),
            followingId: request.toUserId.toString(),
            createdAt: new Date(),
            notificationEnabled: true,
          },
        },
        { upsert: true, new: true }
      );
    } catch (followError) {
      logger.error('Failed to create follow relationship after connection accept (non-critical)', {
        category: LogCategory.CONNECTION,
        data: {
          error: followError instanceof Error ? followError.message : 'Unknown error',
          fromUserId: request.fromUserId,
          toUserId: request.toUserId,
        },
      });
    }

    // ✅ EMIT SOCKET EVENT
    try {
      const io = getIO();
      const acceptedByUser = await User.findOne({ userId }).lean().select('firstName lastName profilePhoto');

      emitConnectionAccepted(io, request.fromUserId.toString(), {
        connectionId: connection.connectionId,
        acceptedByUserId: userId,
        acceptedByUserName: `${acceptedByUser?.firstName} ${acceptedByUser?.lastName}`.trim(),
        acceptedByUserPhoto: acceptedByUser?.profilePhotoId || undefined,
        timestamp: new Date().toISOString(),
      });

      // ✅ Update notification count for sender
      const unreadCount = await ConnectionRequest.countDocuments({
        fromUserId: request.fromUserId.toString(),
        status: 'accepted',
        isRead: false,
      });

      emitNotificationCount(io, request.fromUserId.toString(), unreadCount);
    } catch (socketError) {
      logger.error('Socket emission failed (non-critical)', {
        category: LogCategory.CONNECTION,
        data: { error: socketError instanceof Error ? socketError.message : 'Unknown' },
      });
    }

    // ✅ Persist Notification document for the original request sender
    NotificationService.notifyConnectionAccepted(
      userId,                              // acceptedByUserId (User B)
      request.fromUserId.toString(),       // originalSenderId (User A)
      connection.connectionId
    ).catch((err) => {
      logger.warn('Failed to persist connection_accepted notification (non-critical)', {
        category: LogCategory.CONNECTION,
        data: { error: err instanceof Error ? err.message : 'Unknown' },
      });
    });

    // ✅ KAFKA: Publish REQUEST_ACCEPTED event - FIXED
    // try {
    //   await requestProducer.publishRequestAccepted(
    //     {
    //       requestId,
    //       senderId: request.fromUserId.toString(),
    //       receiverId: request.toUserId.toString(),
    //       acceptedAt: new Date().toISOString(),
    //       connectionId: connection.connectionId
    //     },
    //     userId
    //   );

    //   // ✅ KAFKA: Publish analytics event - FIXED
    //   await analyticsProducer.track('request_accepted', userId, {
    //     requestId,
    //     connectionId: connection.connectionId,
    //     fromUserId: request.fromUserId.toString(),
    //     toUserId: request.toUserId.toString(),
    //     region,
    //     timestamp: new Date().toISOString()
    //   });
    // } catch (kafkaError) {
    //   logger.error('Failed to publish request accepted event', {
    //     category: LogCategory.CONNECTION,
    //     requestId,
    //     error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
    //   });
    // }

    Promise.all([
      connectionRequestService.manageRequestCaching(requestId, 'delete'),
      connectionRequestService.manageConnectionCaching(connection.connectionId, 'set')
    ]).catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to update cache after accepting request - RequestID: ${requestId}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    });

    logger.info(`Connection request accepted and connection created - RequestID: ${requestId}, ConnectionID: ${connection.connectionId}, ShardKey: ${connectionShardKey}`, {
      category: LogCategory.CONNECTION
    });

    return connection.toObject() as IConnection;
  }

  /**
   * Declines a connection request
   * ✅ KAFKA: Publishes REQUEST_DECLINED event - FIXED
   */
  static async declineConnectionRequest(requestId: string, userId: string): Promise<void> {
    const request = await ConnectionRequest.findByRequestId(requestId, 'fromUserId toUserId status');
    if (!request) {
      throw new ErrorResponse('Connection request not found', 404);
    }

    if (request.toUserId.toString() !== userId) {
      throw new ErrorResponse('Not authorized to decline this request', 403);
    }

    if (request.status !== 'pending') {
      throw new ErrorResponse('Request is not in pending status', 400);
    }

    await ConnectionRequest.bulkUpdateStatus([requestId], 'declined', userId);

    // ✅ KAFKA: Publish REQUEST_DECLINED event - FIXED (using publishRequestRejected)
    // try {
    //   await requestProducer.publishRequestRejected(
    //     {
    //       requestId,
    //       senderId: request.fromUserId.toString(),
    //       receiverId: request.toUserId.toString(),
    //       rejectedAt: new Date().toISOString(),
    //       reason: 'declined_by_user'
    //     },
    //     userId
    //   );

    //   // ✅ KAFKA: Publish analytics event - FIXED
    //   await analyticsProducer.track('request_declined', userId, {
    //     requestId,
    //     fromUserId: request.fromUserId.toString(),
    //     toUserId: request.toUserId.toString(),
    //     timestamp: new Date().toISOString()
    //   });
    // } catch (kafkaError) {
    //   logger.error('Failed to publish request declined event', {
    //     category: LogCategory.CONNECTION,
    //     requestId,
    //     error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
    //   });
    // }

    connectionRequestService.manageRequestCaching(requestId, 'delete').catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to clear cache after declining request - RequestID: ${requestId}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    });

    logger.info(`Connection request declined - RequestID: ${requestId}`, {
      category: LogCategory.CONNECTION
    });
  }

  /**
   * Cancels a connection request
   * ✅ KAFKA: Publishes REQUEST_CANCELLED event - FIXED
   */
  static async cancelConnectionRequest(requestId: string, userId: string): Promise<void> {
    const request = await ConnectionRequest.findByRequestId(requestId, 'fromUserId toUserId status');
    if (!request) {
      throw new ErrorResponse('Connection request not found', 404);
    }

    if (request.fromUserId.toString() !== userId) {
      throw new ErrorResponse('Not authorized to cancel this request', 403);
    }

    if (request.status !== 'pending') {
      throw new ErrorResponse('Request is not in pending status', 400);
    }

    await ConnectionRequest.bulkUpdateStatus([requestId], 'cancelled', userId);

    // ✅ KAFKA: Publish REQUEST_CANCELLED event - FIXED
    // try {
    //   await requestProducer.publishRequestCancelled(
    //     {
    //       requestId,
    //       senderId: request.fromUserId.toString(),
    //       receiverId: request.toUserId.toString(),
    //       cancelledAt: new Date().toISOString(),
    //       reason: 'cancelled_by_sender'
    //     },
    //     userId
    //   );

    //   // ✅ KAFKA: Publish analytics event - FIXED
    //   await analyticsProducer.track('request_cancelled', userId, {
    //     requestId,
    //     fromUserId: request.fromUserId.toString(),
    //     toUserId: request.toUserId.toString(),
    //     timestamp: new Date().toISOString()
    //   });
    // } catch (kafkaError) {
    //   logger.error('Failed to publish request cancelled event', {
    //     category: LogCategory.CONNECTION,
    //     requestId,
    //     error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
    //   });
    // }

    connectionRequestService.manageRequestCaching(requestId, 'delete').catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to clear cache after cancelling request - RequestID: ${requestId}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    });

    logger.info(`Connection request cancelled - RequestID: ${requestId}`, {
      category: LogCategory.CONNECTION
    });
  }

  /**
   * Gets connection request details with caching
   */
  static async getRequestDetails(requestId: string, userId: string): Promise<IConnectionRequest> {
    const cacheKey = `request:${requestId}:${environmentConfig.CACHE_VERSION || 1}`;
    const client = redisService;

    let request: IConnectionRequest | null = null;

    try {
      const cachedRequest = await client.get(cacheKey);
      if (cachedRequest) {
        request = JSON.parse(cachedRequest);
        logger.debug(`Serving request details from cache - RequestID: ${requestId}, CacheKey: ${cacheKey}`, {
          category: LogCategory.CONNECTION
        });
      }
    } catch (error: any) {
      logger.warn(`Failed to get request from cache - RequestID: ${requestId}, Error: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        category: LogCategory.CONNECTION
      });
    }

    if (!request) {
      request = await ConnectionRequest.findByRequestId(
        requestId,
        'requestId fromUserId toUserId message status priority templateId isRead createdAt updatedAt expiresAt metadata'
      );

      if (request) {
        client.set(
          cacheKey,
          JSON.stringify(request),
          { ttl: environmentConfig.CONNECTION_LIST_CACHE_TTL || 300 }
        ).catch((error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`Failed to cache request details - RequestID: ${requestId}, Error: ${errorMessage}`, {
            category: LogCategory.CONNECTION
          });
        });
      }
    }

    if (!request) {
      throw new ErrorResponse('Connection request not found', 404);
    }

    if (request.fromUserId.toString() !== userId && request.toUserId.toString() !== userId) {
      throw new ErrorResponse('Not authorized to view this request', 403);
    }

    return request;
  }

  /**
   * Gets user requests with pagination
   */
  static async getUserRequests(
    userId: string,
    options: { page?: number; limit?: number; status?: string; region?: string } = {}
  ): Promise<IServicePaginationResult<IConnectionRequest>> {
    const modelResult = await ConnectionRequest.findUserRequestsPaginated(userId, {
      page: options.page,
      limit: options.limit,
      status: options.status,
      projection: 'requestId fromUserId toUserId message status priority templateId isRead createdAt updatedAt expiresAt',
      useEstimatedCount: true,
      region: options.region || 'global',
    });

    return {
      data: modelResult.data,
      pagination: {
        currentPage: modelResult.currentPage,
        totalPages: modelResult.totalPages,
        totalItems: modelResult.totalCount,
        itemsPerPage: modelResult.data.length,
        hasNextPage: modelResult.hasNextPage,
        hasPreviousPage: modelResult.hasPreviousPage,
        ...(modelResult.estimatedTotal && { estimatedTotal: modelResult.estimatedTotal }),
      }
    };
  }

  /**
   * Gets incoming requests with pagination
   */
  static async getIncomingRequests(
    userId: string,
    options: { page?: number; limit?: number; status?: string; region?: string } = {}
  ): Promise<IServicePaginationResult<IConnectionRequest>> {
    const modelResult = await ConnectionRequest.findIncomingRequestsPaginated(userId, {
      page: options.page,
      limit: options.limit,
      status: options.status || 'pending',
      projection: 'requestId fromUserId toUserId message status priority templateId isRead createdAt updatedAt expiresAt',
      useEstimatedCount: true,
      region: options.region || 'global',
    });

    return {
      data: modelResult.data,
      pagination: {
        currentPage: modelResult.currentPage,
        totalPages: modelResult.totalPages,
        totalItems: modelResult.totalCount,
        itemsPerPage: modelResult.data.length,
        hasNextPage: modelResult.hasNextPage,
        hasPreviousPage: modelResult.hasPreviousPage,
        ...(modelResult.estimatedTotal && { estimatedTotal: modelResult.estimatedTotal }),
      }
    };
  }

  /**
   * Gets outgoing requests with pagination
   */
  static async getOutgoingRequests(
    userId: string,
    options: { page?: number; limit?: number; status?: string; region?: string } = {}
  ): Promise<IServicePaginationResult<IConnectionRequest>> {
    const modelResult = await ConnectionRequest.findOutgoingRequestsPaginated(userId, {
      page: options.page,
      limit: options.limit,
      status: options.status,
      projection: 'requestId fromUserId toUserId message status priority templateId isRead createdAt updatedAt expiresAt',
      useEstimatedCount: true,
      region: options.region || 'global',
    });

    return {
      data: modelResult.data,
      pagination: {
        currentPage: modelResult.currentPage,
        totalPages: modelResult.totalPages,
        totalItems: modelResult.totalCount,
        itemsPerPage: modelResult.data.length,
        hasNextPage: modelResult.hasNextPage,
        hasPreviousPage: modelResult.hasPreviousPage,
        ...(modelResult.estimatedTotal && { estimatedTotal: modelResult.estimatedTotal }),
      }
    };
  }

  /**
   * Updates connection request message
   */
  static async updateRequestMessage(requestId: string, userId: string, message: string): Promise<void> {
    if (!message || message.length > 500) {
      throw new ErrorResponse('Message is required and cannot exceed 500 characters', 400);
    }

    const request = await ConnectionRequest.findByRequestId(requestId, 'fromUserId status');
    if (!request) {
      throw new ErrorResponse('Connection request not found', 404);
    }

    if (request.fromUserId.toString() !== userId) {
      throw new ErrorResponse('Not authorized to update this request', 403);
    }

    if (request.status !== 'pending') {
      throw new ErrorResponse('Cannot update message of non-pending request', 400);
    }

    await ConnectionRequest.findOneAndUpdate(
      { requestId },
      {
        $set: { message, updatedAt: new Date() },
        $inc: { cacheVersion: 1 }
      },
      { new: true }
    );

    connectionRequestService.manageRequestCaching(requestId, 'set').catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to update cache after message update - RequestID: ${requestId}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    });

    const messagePreview = message.slice(0, 50) + (message.length > 50 ? '...' : '');
    logger.info(`Connection request message updated - RequestID: ${requestId}, MessagePreview: ${messagePreview}`, {
      category: LogCategory.CONNECTION
    });
  }

  /**
   * Marks connection request as read
   */
  static async markRequestAsRead(requestId: string, userId: string): Promise<void> {
    const request = await ConnectionRequest.findByRequestId(requestId, 'toUserId isRead');
    if (!request) {
      throw new ErrorResponse('Connection request not found', 404);
    }

    if (request.toUserId.toString() !== userId) {
      throw new ErrorResponse('Not authorized to mark this request as read', 403);
    }

    if (request.isRead) {
      return;
    }

    await ConnectionRequest.bulkMarkAsRead([requestId], userId);

    connectionRequestService.manageRequestCaching(requestId, 'set').catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to update cache after marking as read - RequestID: ${requestId}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    });

    logger.info(`Connection request marked as read - RequestID: ${requestId}`, {
      category: LogCategory.CONNECTION
    });
  }

  /**
   * Bulk accepts connection requests
   */
  static async bulkAcceptRequests(
    requestIds: string[],
    userId: string,
    region: string = 'global'
  ): Promise<{ connections: IConnection[]; acceptedCount: number }> {
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      throw new ErrorResponse('requestIds must be a non-empty array', 400);
    }

    const requests = await ConnectionRequest.find(
      { requestId: { $in: requestIds } },
      'requestId fromUserId toUserId status'
    ).lean().hint({ requestId: 1 });

    const authorizedRequests = requests.filter((req) =>
      req.toUserId.toString() === userId && req.status === 'pending'
    );

    if (authorizedRequests.length === 0) {
      throw new ErrorResponse('No authorized pending requests found for acceptance', 403);
    }

    const authorizedIds = authorizedRequests.map(req => req.requestId);

    const connections = await Promise.all(
      authorizedRequests.map(async (request) => {
        const sortedIds = [request.fromUserId.toString(), request.toUserId.toString()].sort();
        const connectionShardKey = `${sortedIds[0]}_${sortedIds[1]}_${region}`;

        return Connection.create({
          connectionId: uuidv4(),
          fromUserId: request.fromUserId,
          toUserId: request.toUserId,
          connectionType: 'professional',
          status: 'active',
          strength: 0,
          priority: 'medium',
          tags: [],
          visibility: environmentConfig.DEFAULT_PROFILE_VISIBILITY || 'public',
          isArchived: false,
          lastInteraction: new Date(),
          region,
          shardKey: connectionShardKey,
          metadata: { createdFromRequest: request.requestId },
        });
      })
    );

    await ConnectionRequest.bulkUpdateStatus(authorizedIds, 'accepted', userId);

    // ✅ Directional follow for bulk accept: requester follows acceptor
    try {
      await Promise.all(
        authorizedRequests.map((request) =>
          Follow.findOneAndUpdate(
            { followerId: request.fromUserId.toString(), followingId: request.toUserId.toString() },
            {
              $set: { status: 'active', isBlocked: false, updatedAt: new Date() },
              $setOnInsert: {
                followerId: request.fromUserId.toString(),
                followingId: request.toUserId.toString(),
                createdAt: new Date(),
                notificationEnabled: true,
              },
            },
            { upsert: true, new: true }
          )
        )
      );
    } catch (followError) {
      logger.error('Failed to create follow relationships after bulk accept (non-critical)', {
        category: LogCategory.CONNECTION,
        data: { error: followError instanceof Error ? followError.message : 'Unknown error' },
      });
    }

    Promise.all([
      ...authorizedIds.map((id) => connectionRequestService.manageRequestCaching(id, 'delete')),
      ...connections.map((conn) => connectionRequestService.manageConnectionCaching(conn.connectionId, 'set'))
    ]).catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to update cache after bulk accept - RequestCount: ${authorizedIds.length}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    });

    logger.info(`Bulk connection requests accepted - RequestCount: ${authorizedIds.length}, AcceptedCount: ${connections.length}`, {
      category: LogCategory.CONNECTION
    });

    return { connections: connections.map(c => c.toObject() as IConnection), acceptedCount: authorizedIds.length };
  }

  /**
   * Bulk declines connection requests
   */
  static async bulkDeclineRequests(requestIds: string[], userId: string): Promise<{ declinedCount: number }> {
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      throw new ErrorResponse('requestIds must be a non-empty array', 400);
    }

    const requests = await ConnectionRequest.find(
      { requestId: { $in: requestIds } },
      'requestId toUserId status'
    ).lean().hint({ requestId: 1 });

    const authorizedRequests = requests.filter((req) =>
      req.toUserId.toString() === userId && req.status === 'pending'
    );

    if (authorizedRequests.length === 0) {
      throw new ErrorResponse('No authorized pending requests found for decline', 403);
    }

    const authorizedIds = authorizedRequests.map(req => req.requestId);

    await ConnectionRequest.bulkUpdateStatus(authorizedIds, 'declined', userId);

    Promise.all(authorizedIds.map((id) => connectionRequestService.manageRequestCaching(id, 'delete'))).catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to clear cache after bulk decline - RequestCount: ${authorizedIds.length}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    });

    logger.info(`Bulk connection requests declined - DeclinedCount: ${authorizedIds.length}`, {
      category: LogCategory.CONNECTION
    });

    return { declinedCount: authorizedIds.length };
  }

  /**
   * Bulk marks requests as read
   */
  static async bulkMarkRequestsAsRead(requestIds: string[], userId: string): Promise<{ markedCount: number }> {
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      throw new ErrorResponse('requestIds must be a non-empty array', 400);
    }

    const requests = await ConnectionRequest.find(
      { requestId: { $in: requestIds } },
      'requestId toUserId isRead'
    ).lean().hint({ requestId: 1 });

    const unreadRequests = requests.filter((req) =>
      req.toUserId.toString() === userId && !req.isRead
    );

    if (unreadRequests.length === 0) {
      return { markedCount: 0 };
    }

    const unreadIds = unreadRequests.map(req => req.requestId);

    await ConnectionRequest.bulkMarkAsRead(unreadIds, userId);

    Promise.all(unreadIds.map((id) => connectionRequestService.manageRequestCaching(id, 'set'))).catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to update cache after bulk mark as read - RequestCount: ${unreadIds.length}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    });

    logger.info(`Bulk connection requests marked as read - MarkedCount: ${unreadIds.length}`, {
      category: LogCategory.CONNECTION
    });

    return { markedCount: unreadIds.length };
  }

  /**
   * Gets request stats for a user
   */
  static async getRequestStats(userId: string, useCache: boolean = true): Promise<any> {
    const cacheKey = `request_stats:${userId}:${environmentConfig.CACHE_VERSION || 1}`;
    const client = redisService;

    if (useCache) {
      try {
        const cachedStats = await client.get(cacheKey);
        if (cachedStats) {
          logger.debug(`Serving request stats from cache - UserID: ${userId}, CacheKey: ${cacheKey}`, {
            category: LogCategory.CONNECTION
          });
          return JSON.parse(cachedStats);
        }
      } catch (error: any) {
        logger.warn(`Failed to get stats from cache - UserID: ${userId}, Error: ${error instanceof Error ? error.message : 'Unknown error'}`, {
          category: LogCategory.CONNECTION
        });
      }
    }

    const stats = await ConnectionRequest.getUserConnectionStats(userId, useCache);

    if (useCache) {
      client.set(
        cacheKey,
        JSON.stringify(stats),
        { ttl: environmentConfig.USER_PROFILE_CACHE_TTL || 3600 }
      ).catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn(`Failed to cache request stats - UserID: ${userId}, Error: ${errorMessage}`, {
          category: LogCategory.CONNECTION
        });
      });
    }

    logger.debug(`Request stats computed and cached - UserID: ${userId}, CacheKey: ${cacheKey}`, {
      category: LogCategory.CONNECTION
    });
    return stats;
  }

  /**
   * Sets request priority
   */
  static async setRequestPriority(
    requestId: string,
    userId: string,
    priority: 'low' | 'medium' | 'high'
  ): Promise<void> {
    if (!['low', 'medium', 'high'].includes(priority)) {
      throw new ErrorResponse('Invalid priority', 400);
    }

    const request = await ConnectionRequest.findByRequestId(requestId, 'fromUserId status');
    if (!request) {
      throw new ErrorResponse('Connection request not found', 404);
    }

    if (request.fromUserId.toString() !== userId) {
      throw new ErrorResponse('Not authorized to update this request', 403);
    }

    if (request.status !== 'pending') {
      throw new ErrorResponse('Cannot update priority of non-pending request', 400);
    }

    await ConnectionRequest.findOneAndUpdate(
      { requestId },
      {
        $set: { priority, updatedAt: new Date() },
        $inc: { cacheVersion: 1 }
      }
    );

    connectionRequestService.manageRequestCaching(requestId, 'set').catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to update cache after priority update - RequestID: ${requestId}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    });

    logger.info(`Connection request priority updated - RequestID: ${requestId}, Priority: ${priority}`, {
      category: LogCategory.CONNECTION
    });
  }

  /**
   * Gets requests by status with pagination
   */
  static async getRequestsByStatus(
    userId: string,
    status: string,
    options: { page?: number; limit?: number; region?: string } = {}
  ): Promise<IServicePaginationResult<IConnectionRequest>> {
    if (!['pending', 'accepted', 'declined', 'cancelled'].includes(status)) {
      throw new ErrorResponse('Invalid status', 400);
    }

    const modelResult = await ConnectionRequest.findUserRequestsPaginated(userId, {
      page: options.page,
      limit: options.limit,
      status,
      projection: 'requestId fromUserId toUserId message status priority templateId isRead createdAt updatedAt expiresAt',
      useEstimatedCount: true,
      region: options.region || 'global',
    });

    return {
      data: modelResult.data,
      pagination: {
        currentPage: modelResult.currentPage,
        totalPages: modelResult.totalPages,
        totalItems: modelResult.totalCount,
        itemsPerPage: modelResult.data.length,
        hasNextPage: modelResult.hasNextPage,
        hasPreviousPage: modelResult.hasPreviousPage,
        ...(modelResult.estimatedTotal && { estimatedTotal: modelResult.estimatedTotal }),
      }
    };
  }

  /**
   * Archives old connection requests
   */
  static async archiveOldRequests(
    daysOld: number = environmentConfig.DATA_RETENTION_DAYS || 90,
    batchSize: number = environmentConfig.BULK_OPERATION_BATCH_SIZE || 1000
  ): Promise<number> {
    const archivedCount = await ConnectionRequest.archiveOldRequests(daysOld, batchSize);
    logger.info(`Old connection requests archived - ArchivedCount: ${archivedCount}, DaysOld: ${daysOld}, BatchSize: ${batchSize}`, {
      category: LogCategory.CONNECTION
    });
    return archivedCount;
  }

  /**
   * Gets system stats for admin/monitoring purposes
   */
  static async getSystemStats(region?: string): Promise<any> {
    return ConnectionRequest.getSystemStats(region);
  }

  /**
   * Cleans up expired requests
   */
  static async cleanupExpiredRequests(
    batchSize: number = environmentConfig.BULK_OPERATION_BATCH_SIZE || 1000
  ): Promise<number> {
    const deletedCount = await ConnectionRequest.cleanupExpiredRequests(batchSize);
    logger.info(`Expired connection requests cleaned up - DeletedCount: ${deletedCount}, BatchSize: ${batchSize}`, {
      category: LogCategory.CONNECTION
    });
    return deletedCount;
  }

  /**
   * Gets slow queries for performance monitoring
   */
  static async getSlowQueries() {
    return ConnectionRequest.getSlowQueries();
  }

  /**
   * Manages request caching
   */
  static async manageRequestCaching(requestId: string, action: 'set' | 'delete'): Promise<void> {
    const cacheKey = `request:${requestId}:${environmentConfig.CACHE_VERSION || 1}`;
    const client = redisService;

    try {
      if (action === 'set') {
        const request = await ConnectionRequest.findByRequestId(
          requestId,
          'requestId fromUserId toUserId message status priority templateId isRead createdAt updatedAt expiresAt'
        );
        if (request) {
          await client.set(
            cacheKey,
            JSON.stringify(request),
            { ttl: environmentConfig.CONNECTION_LIST_CACHE_TTL || 300 }
          );
          logger.debug(`Connection request cached - RequestID: ${requestId}, CacheKey: ${cacheKey}`, {
            category: LogCategory.CONNECTION
          });
        }
      } else if (action === 'delete') {
        await client.del(cacheKey);
        logger.debug(`Connection request cache cleared - RequestID: ${requestId}, CacheKey: ${cacheKey}`, {
          category: LogCategory.CONNECTION
        });
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Cache operation failed - RequestID: ${requestId}, Action: ${action}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    }
  }

  /**
   * Manages connection caching
   */
  static async manageConnectionCaching(connectionId: string, action: 'set' | 'delete'): Promise<void> {
    const cacheKey = `connection:${connectionId}:${environmentConfig.CACHE_VERSION || 1}`;
    const client = redisService;

    try {
      if (action === 'set') {
        const connection = await Connection.findOne({ connectionId })
          .lean()
          .select('connectionId fromUserId toUserId connectionType status strength visibility priority tags region shardKey');

        if (connection) {
          await client.set(
            cacheKey,
            JSON.stringify(connection),
            { ttl: environmentConfig.CONNECTION_LIST_CACHE_TTL || 300 }
          );
          logger.debug(`Connection cached - ConnectionID: ${connectionId}, CacheKey: ${cacheKey}`, {
            category: LogCategory.CONNECTION
          });
        }
      } else if (action === 'delete') {
        await client.del(cacheKey);
        logger.debug(`Connection cache cleared - ConnectionID: ${connectionId}, CacheKey: ${cacheKey}`, {
          category: LogCategory.CONNECTION
        });
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Connection cache operation failed - ConnectionID: ${connectionId}, Action: ${action}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    }
  }

  /**
   * Gets connection request analytics
   */
  static async getRequestAnalytics(
    region?: string,
    dateRange?: { startDate: Date; endDate: Date }
  ): Promise<any> {
    const pipeline: any[] = [];

    const matchStage: any = {};
    if (region) {
      matchStage.region = region;
    }
    if (dateRange) {
      matchStage.createdAt = {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate
      };
    }

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    pipeline.push(
      {
        $group: {
          _id: {
            status: '$status',
            priority: '$priority',
            region: '$region',
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            }
          },
          count: { $sum: 1 },
          avgResponseTime: {
            $avg: {
              $subtract: ['$updatedAt', '$createdAt']
            }
          },
          unreadCount: {
            $sum: {
              $cond: [{ $eq: ['$isRead', false] }, 1, 0]
            }
          }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          dailyStats: {
            $push: {
              status: '$_id.status',
              priority: '$_id.priority',
              region: '$_id.region',
              count: '$count',
              avgResponseTime: '$avgResponseTime',
              unreadCount: '$unreadCount'
            }
          },
          totalRequests: { $sum: '$count' },
          totalUnread: { $sum: '$unreadCount' }
        }
      },
      {
        $sort: { _id: -1 }
      },
      {
        $limit: 30
      }
    );

    const analytics = await ConnectionRequest.aggregate(pipeline).allowDiskUse(true);

    const dateRangeString = dateRange ?
      `${dateRange.startDate.toISOString()} to ${dateRange.endDate.toISOString()}` :
      'all time';

    logger.info(`Connection request analytics generated - Region: ${region || 'all'}, DateRange: ${dateRangeString}, ResultCount: ${analytics.length}`, {
      category: LogCategory.CONNECTION
    });

    return analytics;
  }

  /**
   * Gets request health metrics
   */
  static async getRequestHealthMetrics(): Promise<any> {
    const [slowQueries, systemStats, recentErrors] = await Promise.all([
      ConnectionRequest.getSlowQueries(),
      ConnectionRequest.getSystemStats(),
      Promise.resolve([])
    ]);

    const healthMetrics = {
      performance: {
        slowQueries: slowQueries.slice(0, 10),
        avgQueryTime: slowQueries.length > 0 ?
          slowQueries.reduce((sum, q) => sum + q.duration, 0) / slowQueries.length : 0,
        slowQueryCount: slowQueries.length
      },
      system: systemStats,
      errors: {
        recentErrorCount: recentErrors.length,
        lastErrorTime: recentErrors.length > 0 ? new Date() : null
      },
      timestamp: new Date()
    };

    return healthMetrics;
  }

  /**
   * Batch processes connection requests
   */
  static async batchProcessRequests(
    processingType: 'cleanup' | 'archive' | 'expire',
    options: {
      batchSize?: number;
      daysOld?: number;
      region?: string;
      dryRun?: boolean;
    } = {}
  ): Promise<{ processedCount: number; errors: string[] }> {
    const {
      batchSize = environmentConfig.BULK_OPERATION_BATCH_SIZE || 1000,
      daysOld = environmentConfig.DATA_RETENTION_DAYS || 90,
      region,
      dryRun = false
    } = options;

    const errors: string[] = [];
    let processedCount = 0;

    try {
      switch (processingType) {
        case 'cleanup':
          if (!dryRun) {
            processedCount = await ConnectionRequest.cleanupExpiredRequests(batchSize);
          } else {
            processedCount = await ConnectionRequest.countDocuments({
              expiresAt: { $lt: new Date() },
              status: 'pending'
            });
          }
          break;

        case 'archive':
          if (!dryRun) {
            processedCount = await ConnectionRequest.archiveOldRequests(daysOld, batchSize);
          } else {
            const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
            processedCount = await ConnectionRequest.countDocuments({
              createdAt: { $lt: cutoffDate },
              status: { $in: ['declined', 'cancelled'] },
              ...(region && { region })
            });
          }
          break;

        case 'expire':
          const expiredCount = await ConnectionRequest.updateMany(
            {
              status: 'pending',
              createdAt: {
                $lt: new Date(Date.now() - (environmentConfig.CONNECTION_EXPIRY_DAYS || 30) * 24 * 60 * 60 * 1000)
              },
              ...(region && { region })
            },
            {
              $set: {
                status: 'cancelled',
                updatedAt: new Date()
              },
              $inc: { cacheVersion: 1 }
            }
          );
          processedCount = expiredCount.modifiedCount;
          break;

        default:
          throw new ErrorResponse('Invalid processing type', 400);
      }

      logger.info(`Batch processing completed - ProcessingType: ${processingType}, ProcessedCount: ${processedCount}, DryRun: ${dryRun}`, {
        category: LogCategory.CONNECTION
      });

    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Batch processing failed: ${errorMessage}`);
      logger.error(`Batch processing error - ProcessingType: ${processingType}, Error: ${errorMessage}`, {
        category: LogCategory.CONNECTION
      });
    }

    return { processedCount, errors };
  }

  /**
   * Exports connection request data
   */
  static async exportRequestData(
    filters: {
      userId?: string;
      status?: string;
      dateRange?: { startDate: Date; endDate: Date };
      region?: string;
    } = {},
    format: 'json' | 'csv' = 'json'
  ): Promise<any> {
    const query: any = {};

    if (filters.userId) {
      query.$or = [
        { fromUserId: filters.userId },
        { toUserId: filters.userId }
      ];
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.dateRange) {
      query.createdAt = {
        $gte: filters.dateRange.startDate,
        $lte: filters.dateRange.endDate
      };
    }

    if (filters.region) {
      query.region = filters.region;
    }

    const requests = await ConnectionRequest.find(query)
      .select('requestId fromUserId toUserId message status priority isRead createdAt updatedAt region')
      .lean()
      .sort({ createdAt: -1 })
      .limit(10000);

    logger.info(`Connection request data exported - Format: ${format}, ResultCount: ${requests.length}`, {
      category: LogCategory.CONNECTION
    });

    if (format === 'csv') {
      const csvHeaders = ['Request ID', 'From User ID', 'To User ID', 'Status', 'Priority', 'Created At', 'Region'];
      const csvData = requests.map(req => [
        req.requestId,
        req.fromUserId.toString(),
        req.toUserId.toString(),
        req.status,
        req.priority,
        req.createdAt.toISOString(),
        req.region
      ]);

      return {
        headers: csvHeaders,
        data: csvData,
        totalRecords: requests.length
      };
    }

    return {
      data: requests,
      totalRecords: requests.length,
      filters,
      exportedAt: new Date()
    };
  }

}

export { connectionRequestService }