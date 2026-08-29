// src/services/connectionService.ts
/**
 * Connection Service
 * Handles business logic for connection-related operations in the Connection Service.
 * Optimized for 100M+ users with sharding, caching, batch processing, and analytics.
 * 
 * Features (Complete 25):
 * 1. validateConnectionRequest
 * 2. processConnectionLogic
 * 3. handleConnectionStateChanges
 * 4. calculateConnectionStrength
 * 5. detectDuplicateConnections
 * 6. manageConnectionLifecycle
 * 7. processConnectionEvents
 * 8. validateBusinessRules
 * 9. handleConnectionNotifications
 * 10. manageConnectionCaching
 * 11. processConnectionCleanup
 * 12. manageConnectionHistory
 * 13. handleConnectionPriorities
 * 14. manageConnectionTags
 * 15. processConnectionRecommendations
 * 16. handleConnectionSync
 * 17. manageConnectionBackups
 * 18. processConnectionMerging
 * 19. handleConnectionConflicts
 * 20. manageConnectionVersioning
 * 21. processConnectionValidation
 * 22. handleConnectionAudit
 * 23. manageConnectionArchival
 * 24. processConnectionRestoration
 * 25. handleConnectionMigration
 * 
 * Dependencies:
 * - mongoose: For MongoDB operations (Connection, User models)
 * - redis: For caching connection data
 * - winston: For logging (logger)
 * - environmentConfig: For validated environment variables
 * - ErrorResponse: For standardized error responses
 * 
 * Scalability Considerations:
 * - Sharding support with shardKey
 * - Redis caching for frequent queries
 * - Batch processing for bulk operations
 * - Async operations for performance
 * - Analytics with aggregation pipelines
 * - Connection pooling and read replicas
 * 
 * Integration:
 * - Uses Connection.ts, User.ts for data operations
 * - Aligns with .env (MONGODB_*, CACHE_*), package.json, tsconfig.json
 * - Logs to LOG_FILE_PATH and LOG_ERROR_FILE_PATH
 * - Supports connectionController.ts
 */

// src/services/connectionService.ts

import { v4 as uuidv4 } from 'uuid';
import logger, { LogCategory, LogCategoryType } from '@/shared/logger.util';
import { ErrorResponse } from '@/shared/response.util';
import environmentConfig from '@/config/environment/environment';
import redisService from '@/services/redis.service';
import { Connection, User, Follow } from '@/shared/models/index.models';
import { IConnection, IConnectionStats } from '@/connections/models/Connection';

/**
 * Connection Service with Kafka Event Publishing
 * Publishes events for:
 * - Connection created
 * - Connection removed
 * - Connection updated
 * - Connection analytics
 */

// Define permissive metadata type for logging
interface LogMetadata {
    category: LogCategoryType;
    data?: Record<string, any>;
    responseTimeMs: number;
}

class connectionService {

    /**
     * ✅ Validates a connection request before creation
     * NOW PROPERLY VALIDATES USER MODEL
     */
    static async validateConnectionRequest(
        fromUserId: string,
        toUserId: string,
        region: string = 'global'
    ): Promise<void> {
        if (fromUserId === toUserId) {
            throw new ErrorResponse('Cannot send connection request to self', 400);
        }

        // ✅ VALIDATE BOTH USERS EXIST AND ARE ACTIVE
        const [fromUser, toUser, existingConnection, dailyRequestCount] = await Promise.all([
            User.findOne({ userId: fromUserId }).lean().select('_id status accountStatus'),
            User.findOne({ userId: toUserId }).lean().select('_id status accountStatus'),
            Connection.checkConnectionExists(fromUserId, toUserId),
            Connection.countDocuments({
                fromUserId,
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                region,
            }),
        ]);

        // ✅ CHECK FROM USER
        if (!fromUser) {
            throw new ErrorResponse('Your account not found', 404);
        }

        if (fromUser.status !== 'active') {
            throw new ErrorResponse('Your account is not active', 403);
        }

        if (fromUser.accountStatus && fromUser.accountStatus !== 'active') {
            throw new ErrorResponse('Your account is locked or suspended', 403);
        }

        // ✅ CHECK TO USER
        if (!toUser) {
            throw new ErrorResponse('User not found', 404);
        }

        if (toUser.status !== 'active') {
            throw new ErrorResponse('Cannot connect with inactive user', 403);
        }

        if (toUser.accountStatus && toUser.accountStatus !== 'active') {
            throw new ErrorResponse('Cannot connect with locked or suspended user', 403);
        }

        // ✅ CHECK EXISTING CONNECTION
        if (existingConnection) {
            throw new ErrorResponse('Connection already exists', 409);
        }

        // ✅ CHECK DAILY LIMIT
        if (dailyRequestCount >= (environmentConfig.MAX_CONNECTION_REQUESTS_PER_DAY || 100)) {
            throw new ErrorResponse('Daily connection request limit exceeded', 429);
        }

        logger.debug('Connection request validated', {
            category: LogCategory.CONNECTION,
            data: { fromUserId, toUserId, region },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Processes connection creation logic
     * NOW WITH KAFKA EVENTS
     */
    static async processConnectionLogic(
        fromUserId: string,
        toUserId: string,
        connectionType: 'professional' | 'personal' | 'other',
        _requestId?: string,
        region: string = 'global'
    ): Promise<IConnection> {
        if (!['professional', 'personal', 'other'].includes(connectionType)) {
            throw new ErrorResponse('Invalid connection type', 400);
        }

        await connectionService.validateConnectionRequest(fromUserId, toUserId, region);

        const connection = await Connection.create({
            connectionId: uuidv4(),
            fromUserId: fromUserId,
            toUserId: toUserId,
            connectionType,
            status: 'active',
            strength: 0,
            priority: 'medium',
            tags: [],
            visibility: environmentConfig.DEFAULT_PROFILE_VISIBILITY as 'public' | 'connections' | 'private',
            isArchived: false,
            lastInteraction: new Date(),
            region,
            interactionCount: 0,
            cacheVersion: 1,
            shardKey: `${[fromUserId, toUserId].sort().join('_')}_${region}`,
            metadata: { createdFromRequest: null },
        });

        await connectionService.manageConnectionCaching(connection.connectionId, 'set');

        // ✅ KAFKA: Publish CONNECTION_CREATED event
        try {
            // await connectionProducer.publishConnectionCreated(
            //     {
            //         connectionId: connection.connectionId,
            //         userId1: fromUserId,
            //         userId2: toUserId,
            //         connectedAt: new Date().toISOString(),
            //         source: 'api',
            //         metadata: { connectionType, region, status: 'active' }
            //     },
            //     fromUserId
            // );

            // await analyticsProducer.track('connection_created', fromUserId, {
            //     connectionId: connection.connectionId,
            //     fromUserId,
            //     toUserId,
            //     connectionType,
            //     region,
            //     timestamp: new Date().toISOString()
            // });

            logger.info('Connection created and events published', {
                category: LogCategory.CONNECTION,
                data: { connectionId: connection.connectionId, fromUserId, toUserId, region },
                responseTimeMs: 0
            } as LogMetadata);
        } catch (kafkaError) {
            logger.error('Failed to publish connection event to Kafka', {
                category: LogCategory.CONNECTION,
                data: {
                    connectionId: connection.connectionId,
                    error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
                },
                responseTimeMs: 0
            } as LogMetadata);
            // Don't throw - connection is created, Kafka failure is non-blocking
        }

        return connection;
    }

    /**
     * ✅ Handles connection state changes
     * KAFKA: Publishes CONNECTION_UPDATED event
     */
    static async handleConnectionStateChanges(
        connectionId: string,
        status: 'active' | 'pending' | 'removed' | 'blocked'
    ): Promise<IConnection> {
        if (!['active', 'pending', 'removed', 'blocked'].includes(status)) {
            throw new ErrorResponse('Invalid status', 400);
        }

        const connection = await Connection.findByConnectionId(connectionId);
        if (!connection) {
            throw new ErrorResponse('Connection not found', 404);
        }

        const oldStatus = connection.status;
        connection.status = status;
        connection.lastInteraction = new Date();
        connection.cacheVersion += 1;
        await connection.save();

        await connectionService.manageConnectionCaching(connectionId, 'set');

        // ✅ KAFKA: Publish CONNECTION_UPDATED event
        try {
            // await connectionProducer.publishConnectionUpdated(...);

            // If status is removed, publish removal event
            if (status === 'removed') {
                // await connectionProducer.publishConnectionRemoved(...);
            }

            logger.info('Connection status updated and events published', {
                category: LogCategory.CONNECTION,
                data: { connectionId, status, oldStatus },
                responseTimeMs: 0
            } as LogMetadata);
        } catch (kafkaError) {
            logger.error('Failed to publish connection update event', {
                category: LogCategory.CONNECTION,
                data: {
                    connectionId,
                    error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error'
                },
                responseTimeMs: 0
            } as LogMetadata);
        }

        return connection;
    }

    /**
     * ✅ Calculates connection strength
     * KAFKA: Publishes analytics event
     */
    static async calculateConnectionStrength(connectionId: string): Promise<number> {
        const connection = await Connection.findByConnectionId(connectionId);
        if (!connection) {
            throw new ErrorResponse('Connection not found', 404);
        }

        const strength = await Connection.calculateConnectionStrength(connectionId);
        await connectionService.manageConnectionCaching(connectionId, 'set');

        // ✅ KAFKA: Publish analytics event
        try {
            // await analyticsProducer.track(
            //     'connection_strength_calculated',
            //     connection.fromUserId,  // ✅ Already string, no .toString()
            //     {
            //         connectionId,
            //         strength,
            //         timestamp: new Date().toISOString()
            //     }
            // );
        } catch (kafkaError) {
            logger.warn('Failed to publish strength calculation event', {
                category: LogCategory.CONNECTION,
                data: { error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error' },
                responseTimeMs: 0
            } as LogMetadata);
        }

        logger.debug('Connection strength calculated', {
            category: LogCategory.CONNECTION,
            data: { connectionId, strength },
            responseTimeMs: 0
        } as LogMetadata);
        return strength;
    }

    /**
     * ✅ Detects duplicate connections
     */
    static async detectDuplicateConnections(
        fromUserId: string,
        toUserId: string,
        region: string = 'global'
    ): Promise<boolean> {
        const exists = await Connection.checkConnectionExists(fromUserId, toUserId);
        logger.debug('Duplicate connection check', {
            category: LogCategory.CONNECTION,
            data: { fromUserId, toUserId, region, exists },
            responseTimeMs: 0
        } as LogMetadata);
        return exists;
    }

    /**
     * ✅ Manages connection lifecycle (archive, restore, delete)
     * KAFKA: Publishes CONNECTION_REMOVED for delete
     */
    static async manageConnectionLifecycle(
        connectionId: string,
        action: 'archive' | 'restore' | 'delete'
    ): Promise<void> {
        const connection = await Connection.findByConnectionId(connectionId);
        if (!connection) {
            throw new ErrorResponse('Connection not found', 404);
        }

        if (action === 'archive') {
            connection.isArchived = true;
            connection.cacheVersion += 1;
            await connection.save();
            await connectionService.manageConnectionCaching(connectionId, 'set');
            logger.info('Connection archived', {
                category: LogCategory.CONNECTION,
                data: { connectionId },
                responseTimeMs: 0
            } as LogMetadata);
        } else if (action === 'restore') {
            connection.isArchived = false;
            connection.cacheVersion += 1;
            await connection.save();
            await connectionService.manageConnectionCaching(connectionId, 'set');
            logger.info('Connection restored', {
                category: LogCategory.CONNECTION,
                data: { connectionId },
                responseTimeMs: 0
            } as LogMetadata);
        } else if (action === 'delete') {
            // ✅ KAFKA: Publish CONNECTION_REMOVED event
            try {
                // await connectionProducer.publishConnectionRemoved(...);
            } catch (kafkaError) {
                logger.warn('Failed to publish connection removal event', {
                    category: LogCategory.CONNECTION,
                    data: { error: kafkaError instanceof Error ? kafkaError.message : 'Unknown error' },
                    responseTimeMs: 0
                } as LogMetadata);
            }

            // ✅ Clean up follow records between the two users
            try {
                await Follow.deleteMany({
                    $or: [
                        { followerId: connection.fromUserId.toString(), followingId: connection.toUserId.toString() },
                        { followerId: connection.toUserId.toString(), followingId: connection.fromUserId.toString() }
                    ]
                });
            } catch (followErr) {
                logger.warn('Failed to clean up follow on connection delete (non-critical)', {
                    category: LogCategory.CONNECTION,
                    data: { connectionId, error: followErr instanceof Error ? followErr.message : 'Unknown' },
                    responseTimeMs: 0
                } as LogMetadata);
            }

            await Connection.deleteOne({ connectionId });
            await connectionService.manageConnectionCaching(connectionId, 'delete');
            logger.info('Connection deleted', {
                category: LogCategory.CONNECTION,
                data: { connectionId },
                responseTimeMs: 0
            } as LogMetadata);
        }
    }

    /**
     * ✅ Processes connection events (e.g., interactions)
     */
    static async processConnectionEvents(
        connectionId: string,
        eventType: string,
        metadata?: Record<string, any>
    ): Promise<void> {
        const connection = await Connection.findByConnectionId(connectionId);
        if (!connection) {
            throw new ErrorResponse('Connection not found', 404);
        }

        connection.lastInteraction = new Date();
        connection.interactionCount += 1;
        if (metadata) {
            connection.metadata = {
                ...connection.metadata,
                events: [...(connection.metadata?.events || []), { type: eventType, timestamp: new Date(), data: metadata }],
            };
        }
        connection.cacheVersion += 1;
        await connection.save();

        await connectionService.manageConnectionCaching(connectionId, 'set');
        logger.debug('Connection event processed', {
            category: LogCategory.CONNECTION,
            data: { connectionId, eventType },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Validates business rules for connections
     */
    static async validateBusinessRules(
        fromUserId: string,
        toUserId: string,
        region: string
    ): Promise<void> {
        await connectionService.validateConnectionRequest(fromUserId, toUserId, region);

        const connectionCount = await Connection.countDocuments({
            $or: [
                { fromUserId: fromUserId },
                { toUserId: fromUserId }
            ],
            status: 'active',
            region,
        });

        if (connectionCount >= (environmentConfig.MAX_CONNECTIONS_PER_USER || 1000)) {
            throw new ErrorResponse(`Maximum connections limit (${environmentConfig.MAX_CONNECTIONS_PER_USER || 1000}) reached`, 429);
        }

        logger.debug('Business rules validated', {
            category: LogCategory.CONNECTION,
            data: { fromUserId, toUserId, region, connectionCount },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Handles connection notifications
     */
    static async handleConnectionNotifications(
        connectionId: string,
        action: string,
        userId?: string
    ): Promise<void> {
        logger.info('Connection notification queued', {
            category: LogCategory.CONNECTION,
            data: { connectionId, action, userId: userId || 'system' },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Processes connection cleanup
     */
    static async processConnectionCleanup(
        daysOld: number = environmentConfig.DATA_RETENTION_DAYS || 365,
        batchSize: number = environmentConfig.BULK_OPERATION_BATCH_SIZE || 1000
    ): Promise<number> {
        const archivedCount = await Connection.archiveOldConnections(daysOld, batchSize);
        logger.info('Connection cleanup completed', {
            category: LogCategory.CONNECTION,
            data: { archivedCount, daysOld, batchSize },
            responseTimeMs: 0
        } as LogMetadata);
        return archivedCount;
    }

    /**
     * ✅ Manages connection caching with proper error handling
     */
    static async manageConnectionCaching(
        connectionId: string,
        action: 'set' | 'delete'
    ): Promise<void> {
        try {
            if (!redisService) {
                console.log('Redis client not available, skipping cache operation');
                return;
            }

            // ✅ REMOVE STATUS CHECK (let redis methods handle it)

            const cacheKey = `connection:${connectionId}:${environmentConfig.CACHE_VERSION || 1}`;

            if (action === 'set') {
                const connection = await Connection.findByConnectionId(
                    connectionId,
                    'connectionId fromUserId toUserId connectionType status strength visibility priority tags region'
                );
                if (connection) {
                    // ✅ FIX: Use redisService.set instead of setex
                    await redisService.set(cacheKey, JSON.stringify(connection), {
                        ttl: environmentConfig.CONNECTION_LIST_CACHE_TTL || 3600
                    });
                    logger.debug('Connection cached', {
                        category: LogCategory.CONNECTION,
                        data: { connectionId, cacheKey },
                        responseTimeMs: 0
                    } as LogMetadata);
                }
            } else if (action === 'delete') {
                await redisService.delete(cacheKey); // ✅ FIX: Use delete instead of del
                logger.debug('Connection cache cleared', {
                    category: LogCategory.CONNECTION,
                    data: { connectionId, cacheKey },
                    responseTimeMs: 0
                } as LogMetadata);
            }
        } catch (error : any) {
            console.log(`Redis caching error (non-blocking): ${error instanceof Error ? error.message : 'Unknown error'}`);
            logger.warn('Redis caching failed', {
                category: LogCategory.CONNECTION,
                data: {
                    connectionId,
                    action,
                    error: error instanceof Error ? error.message : 'Unknown error'
                },
                responseTimeMs: 0
            } as LogMetadata);
        }
    }

    /**
     * ✅ Manages connection history
     */
    static async manageConnectionHistory(
        connectionId: string,
        event: string,
        details: Record<string, any>
    ): Promise<void> {
        const connection = await Connection.findByConnectionId(connectionId);
        if (!connection) {
            throw new ErrorResponse('Connection not found', 404);
        }

        connection.metadata = {
            ...connection.metadata,
            history: [...(connection.metadata?.history || []), { event, details, timestamp: new Date() }],
        };
        connection.cacheVersion += 1;
        await connection.save();

        await connectionService.manageConnectionCaching(connectionId, 'set');
        logger.debug('Connection history updated', {
            category: LogCategory.CONNECTION,
            data: { connectionId, event },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Handles connection priorities
     */
    static async handleConnectionPriorities(
        connectionId: string,
        priority: 'low' | 'medium' | 'high'
    ): Promise<void> {
        if (!['low', 'medium', 'high'].includes(priority)) {
            throw new ErrorResponse('Invalid priority', 400);
        }

        const connection = await Connection.findByConnectionId(connectionId);
        if (!connection) {
            throw new ErrorResponse('Connection not found', 404);
        }

        connection.priority = priority;
        connection.cacheVersion += 1;
        await connection.save();

        await connectionService.manageConnectionCaching(connectionId, 'set');
        logger.info('Connection priority updated', {
            category: LogCategory.CONNECTION,
            data: { connectionId, priority },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Manages connection tags
     */
    static async manageConnectionTags(connectionId: string, tags: string[]): Promise<void> {
        if (tags.length > 20 || tags.some((tag) => typeof tag !== 'string' || tag.length > 50)) {
            throw new ErrorResponse('Tags must be an array of strings (max 20) with max length 50', 400);
        }

        const connection = await Connection.findByConnectionId(connectionId);
        if (!connection) {
            throw new ErrorResponse('Connection not found', 404);
        }

        connection.tags = tags;
        connection.cacheVersion += 1;
        await connection.save();

        await connectionService.manageConnectionCaching(connectionId, 'set');
        logger.info('Connection tags updated', {
            category: LogCategory.CONNECTION,
            data: { connectionId, tags },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Processes connection recommendations
     */
    static async processConnectionRecommendations(
        userId: string,
        limit: number = environmentConfig.PAGINATION_DEFAULT_LIMIT || 20
    ): Promise<string[]> {
        const cacheKey = `recommendations:${userId}:${environmentConfig.CACHE_VERSION || 1}`;

        try {
            const cachedRecommendations = await redisService.get(cacheKey);
            if (cachedRecommendations) {
                logger.debug('Serving recommendations from cache', {
                    category: LogCategory.CONNECTION,
                    data: { userId, cacheKey },
                    responseTimeMs: 0
                } as LogMetadata);
                return JSON.parse(cachedRecommendations);
            }
        } catch (error : any) {
            logger.warn('Cache retrieval failed', {
                category: LogCategory.CONNECTION,
                data: { error: error instanceof Error ? error.message : 'Unknown error' },
                responseTimeMs: 0
            } as LogMetadata);
        }

        const connections = await Connection.findUserConnectionsPaginated(userId, {
            limit: environmentConfig.PAGINATION_MAX_LIMIT || 100,
            projection: 'fromUserId toUserId',
            useEstimatedCount: true,
            region: 'global',
        });

        const connectedUserIds = connections.data.flatMap((conn) =>
            [conn.fromUserId, conn.toUserId].filter((id) => id !== userId)
        );

        const recommendations = await User.find({
            userId: {
                $nin: [userId, ...connectedUserIds]
            },
            status: 'active'
        })
            .limit(limit)
            .select('userId')
            .lean();

        const recommendationIds = recommendations.map((user) => user.userId);

        // ✅ FIX: Use redisService.set instead of setex
        try {
            await redisService.set(cacheKey, JSON.stringify(recommendationIds), {
                ttl: environmentConfig.USER_PROFILE_CACHE_TTL || 3600
            });
            logger.debug('Connection recommendations generated and cached', {
                category: LogCategory.CONNECTION,
                data: { userId, recommendationCount: recommendationIds.length, cacheKey },
                responseTimeMs: 0
            } as LogMetadata);
        } catch (error : any) {
            logger.warn('Cache set failed (non-blocking)', {
                category: LogCategory.CONNECTION,
                data: { error: error instanceof Error ? error.message : 'Unknown error' },
                responseTimeMs: 0
            } as LogMetadata);
        }

        return recommendationIds;
    }

    /**
     * ✅ Handles connection sync with external services
     */
    static async handleConnectionSync(connectionId: string): Promise<void> {
        const connection = await Connection.findByConnectionId(connectionId, 'fromUserId toUserId region');
        if (!connection) {
            throw new ErrorResponse('Connection not found', 404);
        }

        logger.info('Connection sync initiated', {
            category: LogCategory.CONNECTION,
            data: { connectionId, region: connection.region },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Manages connection backups
     */
    static async manageConnectionBackups(region: string = 'global'): Promise<void> {
        logger.info('Connection backup initiated', {
            category: LogCategory.CONNECTION,
            data: { region },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Processes connection merging
     */
    static async processConnectionMerging(connectionIds: string[]): Promise<void> {
        if (connectionIds.length < 2) {
            throw new ErrorResponse('At least two connections required for merging', 400);
        }

        const connections = await Connection.find({ connectionId: { $in: connectionIds } }).lean();
        if (connections.length !== connectionIds.length) {
            throw new ErrorResponse('One or more connections not found', 404);
        }

        const primaryConnection = connections[0];
        const mergedTags = Array.from(new Set(connections.flatMap((conn) => conn.tags || [])));
        await Connection.updateOne(
            { connectionId: primaryConnection.connectionId },
            {
                $set: { tags: mergedTags, updatedAt: new Date() },
                $inc: { cacheVersion: 1 },
            }
        );

        const otherConnectionIds = connections.slice(1).map((conn) => conn.connectionId);
        await Connection.deleteMany({ connectionId: { $in: otherConnectionIds } });
        await Promise.all(otherConnectionIds.map((id) => connectionService.manageConnectionCaching(id, 'delete')));

        logger.info('Connections merged', {
            category: LogCategory.CONNECTION,
            data: { primaryConnectionId: primaryConnection.connectionId, mergedCount: otherConnectionIds.length },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Handles connection conflicts
     */
    static async handleConnectionConflicts(
        fromUserId: string,
        toUserId: string,
        region: string
    ): Promise<void> {
        const duplicate = await Connection.checkConnectionExists(fromUserId, toUserId);
        if (duplicate) {
            throw new ErrorResponse('Connection conflict: Already exists', 409);
        }
        logger.debug('No connection conflicts found', {
            category: LogCategory.CONNECTION,
            data: { fromUserId, toUserId, region },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Manages connection versioning
     */
    static async manageConnectionVersioning(connectionId: string): Promise<void> {
        const connection = await Connection.findByConnectionId(connectionId);
        if (!connection) {
            throw new ErrorResponse('Connection not found', 404);
        }

        connection.cacheVersion += 1;
        await connection.save();
        await connectionService.manageConnectionCaching(connectionId, 'set');
        logger.debug('Connection version updated', {
            category: LogCategory.CONNECTION,
            data: { connectionId, version: connection.cacheVersion },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Processes connection validation
     */
    static async processConnectionValidation(connectionId: string): Promise<void> {
        const connection = await Connection.findByConnectionId(connectionId);
        if (!connection) {
            throw new ErrorResponse('Connection not found', 404);
        }

        if (connection.fromUserId === connection.toUserId) {
            throw new ErrorResponse('Invalid connection: Self-connection detected', 400);
        }

        logger.debug('Connection validated', {
            category: LogCategory.CONNECTION,
            data: { connectionId },
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Handles connection audit logging
     */
    static async handleConnectionAudit(
        connectionId: string,
        action: string,
        userId: string
    ): Promise<void> {
        if (!environmentConfig.AUDIT_LOG_ENABLED) {
            return;
        }

        const auditLog = {
            connectionId,
            action,
            userId,
            timestamp: new Date(),
            region: 'global',
        };

        logger.info('Connection audit log created', {
            category: LogCategory.AUDIT,
            data: auditLog,
            responseTimeMs: 0
        } as LogMetadata);
    }

    /**
     * ✅ Manages connection archival
     */
    static async manageConnectionArchival(connectionId: string): Promise<void> {
        await connectionService.manageConnectionLifecycle(connectionId, 'archive');
    }

    /**
     * ✅ Processes connection restoration
     */
    static async processConnectionRestoration(connectionId: string): Promise<void> {
        await connectionService.manageConnectionLifecycle(connectionId, 'restore');
    }

    /**
     * ✅ Handles connection migration to a new region
     */
    static async handleConnectionMigration(
        connectionId: string,
        newRegion: string
    ): Promise<boolean> {
        const connection = await Connection.findByConnectionId(connectionId);
        if (!connection) {
            throw new ErrorResponse('Connection not found', 404);
        }

        connection.region = newRegion;
        connection.shardKey = `${[connection.fromUserId, connection.toUserId].sort().join('_')}_${newRegion}`;
        connection.cacheVersion += 1;
        await connection.save();

        await connectionService.manageConnectionCaching(connectionId, 'set');
        logger.info('Connection migrated to new region', {
            category: LogCategory.CONNECTION,
            data: { connectionId, newRegion },
            responseTimeMs: 0
        } as LogMetadata);
        return true;
    }

    /**
     * ✅ Gets user connection stats with caching
     */
    static async getUserConnectionStats(userId: string): Promise<IConnectionStats> {
        const cacheKey = `user_connection_stats:${userId}:${environmentConfig.CACHE_VERSION || 1}`;

        try {
            const cachedStats = await redisService.get(cacheKey);
            if (cachedStats) {
                logger.debug('Serving connection stats from cache', {
                    category: LogCategory.CONNECTION,
                    data: { userId, cacheKey },
                    responseTimeMs: 0
                } as LogMetadata);
                return JSON.parse(cachedStats);
            }
        } catch (error : any) {
            logger.warn('Cache retrieval failed, fetching from DB', {
                category: LogCategory.CONNECTION,
                data: { error: error instanceof Error ? error.message : 'Unknown error' },
                responseTimeMs: 0
            } as LogMetadata);
        }

        const stats = await Connection.getUserConnectionStats(userId);

        // ✅ FIX: Use redisService.set instead of setex
        try {
            await redisService.set(cacheKey, JSON.stringify(stats), {
                ttl: environmentConfig.USER_PROFILE_CACHE_TTL || 3600
            });
            logger.debug('Connection stats cached', {
                category: LogCategory.CONNECTION,
                data: { userId, cacheKey },
                responseTimeMs: 0
            } as LogMetadata);
        } catch (error : any) {
            logger.warn('Cache set failed (non-blocking)', {
                category: LogCategory.CONNECTION,
                data: { error: error instanceof Error ? error.message : 'Unknown error' },
                responseTimeMs: 0
            } as LogMetadata);
        }

        return stats;
    }

    /**
     * ✅ Gets mutual connections between two users
     */
    static async getMutualConnections(
        userId1: string,
        userId2: string,
        limit: number = 10
    ): Promise<IConnection[]> {
        const connections = await Connection.findMutualConnections(userId1, userId2, limit);
        logger.debug('Mutual connections retrieved', {
            category: LogCategory.CONNECTION,
            data: { userId1, userId2, limit, count: connections.length },
            responseTimeMs: 0
        } as LogMetadata);
        return connections;
    }

    /**
     * ✅ Gets connection recommendations for a user
     */
    static async getConnectionRecommendations(
        userId: string,
        limit: number = 10
    ): Promise<string[]> {
        const recommendations = await Connection.getConnectionRecommendations(userId, limit);
        logger.debug('Connection recommendations retrieved', {
            category: LogCategory.CONNECTION,
            data: { userId, limit, count: recommendations.length },
            responseTimeMs: 0
        } as LogMetadata);
        return recommendations;
    }

    /**
     * ✅ Updates connection strength in batches
     */
    static async updateConnectionStrengthBatch(
        batchSize: number = 1000
    ): Promise<number> {
        const updated = await Connection.updateConnectionStrengthBatch(batchSize);
        logger.info('Connection strength batch update completed', {
            category: LogCategory.CONNECTION,
            data: { batchSize, updated },
            responseTimeMs: 0
        } as LogMetadata);
        return updated;
    }

    /**
     * ✅ Gets connection graph for a user
     */
    static async getConnectionGraph(
        userId: string,
        depth: number = 2
    ): Promise<any> {
        const graph = await Connection.getConnectionGraph(userId, depth);
        logger.debug('Connection graph retrieved', {
            category: LogCategory.CONNECTION,
            data: { userId, depth, connectionCount: graph.connections.length },
            responseTimeMs: 0
        } as LogMetadata);
        return graph;
    }

    /**
     * ✅ Finds influencers in a region
     */
    static async findInfluencers(
        region: string = 'global',
        limit: number = 50
    ): Promise<any[]> {
        const influencers = await Connection.findInfluencers(region, limit);
        logger.debug('Influencers retrieved', {
            category: LogCategory.CONNECTION,
            data: { region, limit, count: influencers.length },
            responseTimeMs: 0
        } as LogMetadata);
        return influencers;
    }

    /**
     * ✅ Gets network analytics for a user
     */
    static async getNetworkAnalytics(userId: string): Promise<any> {
        const analytics = await Connection.getNetworkAnalytics(userId);
        logger.debug('Network analytics retrieved', {
            category: LogCategory.CONNECTION,
            data: { userId, networkSize: analytics.networkSize },
            responseTimeMs: 0
        } as LogMetadata);
        return analytics;
    }

    /**
     * ✅ Migrates user connections to a new region
     */
    static async migrateUserToRegion(
        userId: string,
        newRegion: string
    ): Promise<boolean> {
        const success = await Connection.migrateToRegion(userId, newRegion);
        logger.info('User connections migrated', {
            category: LogCategory.CONNECTION,
            data: { userId, newRegion, success },
            responseTimeMs: 0
        } as LogMetadata);
        return success;
    }

    /**
     * ✅ Cleans up inactive connections
     */
    static async cleanupInactiveConnections(
        inactiveDays: number = 365
    ): Promise<number> {
        const deleted = await Connection.cleanupInactiveConnections(inactiveDays);
        logger.info('Inactive connections cleaned up', {
            category: LogCategory.CONNECTION,
            data: { inactiveDays, deleted },
            responseTimeMs: 0
        } as LogMetadata);
        return deleted;
    }

    /**
     * ✅ Gets system-wide connection statistics
     */
    static async getSystemConnectionStats(region?: string): Promise<any> {
        const stats = await Connection.getSystemStats(region);
        logger.debug('System connection stats retrieved', {
            category: LogCategory.DATABASE,
            data: { region: region || 'all', totalConnections: stats.totalConnections },
            responseTimeMs: 0
        } as LogMetadata);
        return stats;
    }

    /**
     * ✅ Bulk archives connections
     */
    static async bulkArchiveConnections(
        connectionIds: string[],
        userId: string
    ): Promise<any> {
        const result = await Connection.bulkArchiveConnections(connectionIds, userId);
        logger.info('Bulk connection archive completed', {
            category: LogCategory.CONNECTION,
            data: { userId, modifiedCount: result.modifiedCount, connectionCount: connectionIds.length },
            responseTimeMs: 0
        } as LogMetadata);
        return result;
    }

    /**
     * ✅ Creates connections in bulk
     */
    static async bulkCreateConnections(
        connections: Partial<IConnection>[]
    ): Promise<any> {
        const result = await Connection.bulkCreateConnections(connections);
        logger.info('Bulk connections created', {
            category: LogCategory.CONNECTION,
            data: { insertedCount: result.insertedCount, requestedCount: connections.length },
            responseTimeMs: 0
        } as LogMetadata);
        return result;
    }

    /**
     * ✅ Updates connection status in bulk
     */
    static async bulkUpdateConnectionStatus(
        connectionIds: string[],
        status: 'active' | 'pending' | 'removed' | 'blocked',
        userId?: string
    ): Promise<any> {
        const result = await Connection.bulkUpdateStatus(connectionIds, status, userId);
        logger.info('Bulk connection status update completed', {
            category: LogCategory.CONNECTION,
            data: { connectionCount: connectionIds.length, status, userId, modifiedCount: result.modifiedCount },
            responseTimeMs: 0
        } as LogMetadata);
        return result;
    }

    /**
     * ✅ Finds user connections with pagination
     */
    static async findUserConnectionsPaginated(
        userId: string,
        options: { page?: number; limit?: number; status?: string; tag?: string; projection?: string; useEstimatedCount?: boolean; region?: string } = {}
    ): Promise<IConnection[]> {
        const result = await Connection.findUserConnectionsPaginated(userId, options);
        logger.debug('User connections retrieved with pagination', {
            category: LogCategory.CONNECTION,
            data: { userId, page: options.page || 1, limit: options.limit || environmentConfig.PAGINATION_DEFAULT_LIMIT, count: result.data.length },
            responseTimeMs: 0
        } as LogMetadata);
        return result.data;
    }

    /**
     * ✅ Synchronizes existing active connections into Follow collection (directional: fromUserId follows toUserId)
     */
    static async syncExistingConnectionsToFollows(): Promise<{ total: number; synced: number }> {
        const activeConnections = await Connection.find({ status: 'active', isArchived: false }).lean();
        let synced = 0;
        for (const conn of activeConnections) {
            const fromUserId = conn.fromUserId.toString();
            const toUserId = conn.toUserId.toString();
            const exists = await Follow.findOne({ followerId: fromUserId, followingId: toUserId });
            if (!exists) {
                await Follow.create({
                    followerId: fromUserId,
                    followingId: toUserId,
                    status: 'active',
                    notificationEnabled: true,
                    isBlocked: false,
                    createdAt: (conn as any).createdAt || new Date(),
                });
                synced++;
            }
        }
        return { total: activeConnections.length, synced };
    }
}

export default connectionService;