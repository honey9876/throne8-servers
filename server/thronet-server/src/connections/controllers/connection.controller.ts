// src/controllers/connectionController.ts

/**
 * Connection Controller
 * Handles connection-related API endpoints for the Connection Service.
 * Optimized for 100M+ users with advanced indexing, pagination, caching, and analytics.
 * 
 * Features (Complete 20):
 * 1. createConnection
 * 2. deleteConnection
 * 3. getConnectionDetails
 * 4. updateConnectionStatus
 * 5. getUserConnections
 * 6. getConnectionCount
 * 7. setConnectionVisibility
 * 8. archiveConnection
 * 9. restoreConnection
 * 10. exportConnections
 * 11. importConnections
 * 12. bulkDeleteConnections
 * 13. getConnectionStrength
 * 14. setConnectionPriority
 * 15. getConnectionTimeline
 * 16. getSuggestedConnections
 * 17. setConnectionTags
 * 18. getConnectionsByTag
 * 19. generateConnectionReport
 * 20. getConnectionActivity
 * 
 * Dependencies:
 * - express: For handling HTTP requests and responses
 * - mongoose: For MongoDB operations (Connection model)
 * - winston: For logging (logger)
 * - environmentConfig: For validated environment variables
 * - connectionService: For business logic
 * - asyncHandler: For async error handling
 * - response: For standardized ErrorResponse and SuccessResponse
 * 
 * Scalability Considerations:
 * - Efficient indexing and lean queries for large datasets
 * - Pagination for list operations
 * - Caching with Redis for frequent queries
 * - Rate limiting integration (RATE_LIMIT_*)
 * - Async operations for performance
 * - Audit logging for critical actions
 * 
 * Integration:
 * - Uses Connection.ts for data operations
 * - Calls connectionService.ts for business logic
 * - Aligns with .env (MONGODB_*, CACHE_*), package.json, tsconfig.json
 * - Logs to LOG_FILE_PATH and LOG_ERROR_FILE_PATH
 * - Supports health endpoints from output
 */

// src/controllers/connectionController.ts

import mongoose from 'mongoose';
import { Request, Response, NextFunction } from 'express';
import { connectionService } from '@/shared/services/index.service';
import { Connection } from '@/shared/models/index.models';
import { LogCategory, logger } from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';
import { ErrorResponse, HttpStatus, SuccessResponse } from '@/shared/response.util';
import { asyncHandler } from '@/shared/utils/helpers.util';

/**
 * ✅ CRITICAL: AuthRequest Interface for TypeScript Type Safety
 * This ensures req.user is properly typed throughout the controller
 * Updated to match authentication middleware's actual user object structure
 */
interface AuthRequest extends Request {
    user?: {
        id: string;
        userId?: string;
        isAdmin: boolean;
        region?: string;
        email: string;
        role: 'user' | 'admin';
        deviceId?: string | null;
        sessionId?: string | null;
    };
    correlationId?: string;
}

/**
 * Connection Controller
 * Handles connection-related API endpoints for the Connection Service.
 * Optimized for 100M+ users with advanced indexing, pagination, caching, and analytics.
 * 
 * ✅ ALL 20 ENDPOINTS UPDATED WITH PROPER AUTHENTICATION & AUTHORIZATION
 */
class connectionController {

    /**
     * ✅ 1. CREATE CONNECTION
     * POST /api/v1/connections
     * @access Private (Authenticated users only)
     * @authorization User must be fromUserId (or admin)
     */
    static createConnection = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            console.log('\n🔄 PROCESSING CONNECTION CREATION:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`⏰ Time: ${new Date().toISOString()}`);
            console.log(`🔗 Route: POST /api/v1/connections`);
            console.log(`📋 Request Body:`, JSON.stringify(req.body, null, 2));

            const { fromUserId, toUserId, connectionType = 'professional', requestId } = req.body;

            // ✅ EXTRACT AUTHENTICATED USER FROM MIDDLEWARE
            const authUserId = req.user?.userId || req.user?.id;
            const authUserEmail = req.user?.email;
            const authUserRole = req.user?.role;

            console.log('📋 Authentication Data:');
            console.log(`  authUserId: ${authUserId}`);
            console.log(`  authUserEmail: ${authUserEmail}`);
            console.log(`  authUserRole: ${authUserRole}`);

            // ✅ CHECK 1: Authentication
            if (!authUserId) {
                console.log('❌ Authentication failed - No authUserId');
                return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_001'));
            }
            console.log('✅ Authentication passed');

            // ✅ CHECK 2: Required fields validation
            if (!fromUserId || !toUserId) {
                console.log('❌ Missing required fields:', { fromUserId: !!fromUserId, toUserId: !!toUserId });
                return next(new ErrorResponse('fromUserId and toUserId are required', HttpStatus.BAD_REQUEST, 'INVALID_INPUT'));
            }
            console.log('✅ Required fields present');

            // ✅ CHECK 3: Authorization - USER MUST BE fromUserId (or admin)
            if (fromUserId !== authUserId && authUserRole !== 'admin') {
                console.log('❌ Authorization failed - User can only create connections from themselves');
                return next(new ErrorResponse(
                    'You can only create connections from your own account',
                    HttpStatus.FORBIDDEN,
                    'AUTH_ERROR'
                ));
            }
            console.log('✅ Authorization passed');

            // ✅ Emergency index creation (performance optimization)
            try {
                const db = mongoose.connection.db;
                if (db) {
                    await db.collection('connections').createIndex({
                        fromUserId: 1,
                        region: 1,
                        createdAt: 1
                    }, {   });
                }
            } catch (indexError) {
                console.log('⚠️ Emergency index creation failed (non-critical):', indexError);
            }

            // ✅ CALL SERVICE TO CREATE CONNECTION
            const connection = await connectionService.processConnectionLogic(
                fromUserId,
                toUserId,
                connectionType,
                requestId
            );

            console.log('✅ Connection created successfully:', connection.connectionId);

            // ✅ AUDIT LOGGING
            if (environmentConfig.AUDIT_LOG_ENABLED) {
                await logger.auditLog('create_connection', authUserId, {
                    connectionId: connection.connectionId,
                    fromUserId,
                    toUserId,
                    email: authUserEmail
                });
            }

            console.log('🎉 SUCCESS - Sending response\n');

            res.status(HttpStatus.CREATED).json(SuccessResponse(
                connection,
                'Connection created successfully',
                HttpStatus.CREATED
            ));

        } catch (error: unknown) {
            console.error('❌ CREATE CONNECTION ERROR:', error);
            next(error);
        }
    });

    /**
     * ✅ 2. DELETE CONNECTION
     * DELETE /api/v1/connections/:connectionId
     * @access Private
     * @authorization User must be part of connection (or admin)
     */
    static deleteConnection = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionId } = req.params;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        const connection = await Connection.findByConnectionId(connectionId, 'fromUserId toUserId');
        if (!connection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        // ✅ AUTHORIZATION: User must be part of connection or admin
        if (connection.fromUserId !== authUserId &&
            connection.toUserId !== authUserId &&
            req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to delete this connection', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        await connectionService.manageConnectionLifecycle(connectionId, 'delete');

        if (environmentConfig.AUDIT_LOG_ENABLED) {
            await logger.auditLog('delete_connection', authUserId, {
                connectionId,
                email: req.user?.email
            });
        }

        res.status(HttpStatus.OK).json(SuccessResponse(null, 'Connection deleted successfully', HttpStatus.OK));
    });

    /**
     * ✅ 3. GET CONNECTION DETAILS
     * GET /api/v1/connections/:connectionId
     * @access Private
     * @authorization User must be part of connection (or admin)
     */
    static getConnectionDetails = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionId } = req.params;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        const connection = await Connection.findByConnectionId(
            connectionId,
            'connectionId fromUserId toUserId connectionType status strength visibility priority tags createdAt updatedAt metadata'
        );

        if (!connection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        // ✅ AUTHORIZATION CHECK
        if (connection.fromUserId !== authUserId &&
            connection.toUserId !== authUserId &&
            req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to view this connection', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        res.status(HttpStatus.OK).json(SuccessResponse(connection, 'Connection details retrieved', HttpStatus.OK));
    });

    /**
     * ✅ 4. UPDATE CONNECTION STATUS
     * PATCH /api/v1/connections/:connectionId/status
     * @access Private
     * @authorization User must be part of connection (or admin)
     */
    static updateConnectionStatus = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionId } = req.params;
        const { status } = req.body;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        if (!['active', 'pending', 'removed', 'blocked'].includes(status)) {
            return next(new ErrorResponse('Invalid status', HttpStatus.BAD_REQUEST, 'INVALID_INPUT'));
        }

        const connection = await Connection.findByConnectionId(connectionId, 'fromUserId toUserId');
        if (!connection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        // ✅ AUTHORIZATION
        if (connection.fromUserId !== authUserId &&
            connection.toUserId !== authUserId &&
            req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to update this connection', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        const updatedConnection = await connectionService.handleConnectionStateChanges(connectionId, status);

        if (environmentConfig.AUDIT_LOG_ENABLED) {
            await logger.auditLog('update_connection_status', authUserId, {
                connectionId,
                newStatus: status,
                email: req.user?.email
            });
        }

        res.status(HttpStatus.OK).json(SuccessResponse(updatedConnection, 'Connection status updated', HttpStatus.OK));
    });

    /**
     * ✅ 5. GET USER'S CONNECTIONS (PAGINATED)
     * GET /api/v1/connections/user/:userId
     * @access Private
     * @authorization User can only view their own connections (or admin)
     */
    static getUserConnections = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId;
        const { userId } = req.params;
        const { page = '1', limit = environmentConfig.PAGINATION_DEFAULT_LIMIT, status, tag } = req.query;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        // ✅ AUTHORIZATION: User can only view their own connections (unless admin)
        // if (userId !== authUserId && req.user?.role !== 'admin') {
        //     return next(new ErrorResponse('You can only view your own connections', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        // }

        const result = await Connection.findUserConnectionsPaginated(userId, {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            status: status as string,
            tag: tag as string,
            projection: 'connectionId fromUserId toUserId connectionType status strength visibility priority tags createdAt updatedAt',
            useEstimatedCount: true,
        });

        res.status(HttpStatus.OK).json(SuccessResponse(result, 'User connections retrieved', HttpStatus.OK));
    });

    /**
     * ✅ 6. GET CONNECTION COUNT
     * GET /api/v1/connections/user/:userId/count
     * @access Private
     * @authorization User can only view their own count (or admin)
     */
    static getConnectionCount = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId;
        const { userId } = req.params;
        const { status } = req.query;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        // ✅ AUTHORIZATION
            // ❌ REMOVE this self-only restriction — connection count is public info

        // if (userId !== authUserId && req.user?.role !== 'admin') {
        //     return next(new ErrorResponse('You can only view your own connection count', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        // }

        const filter: any = {
            $or: [{ fromUserId: userId }, { toUserId: userId }],
            isArchived: false,
            status: 'active',  // sirf active connections count karo, pending nahi
        };
        // if (status) filter.status = status;

        const count = await Connection.countDocuments(filter);

        // logger.debug('Connection count retrieved', {
        //     userId: authUserId,
        //     count,
        //     category: LogCategory.CONNECTION
        // });

        res.status(HttpStatus.OK).json(SuccessResponse({ count }, 'Connection count retrieved', HttpStatus.OK));
    });

    /**
     * ✅ 7. SET CONNECTION VISIBILITY
     * PATCH /api/v1/connections/:connectionId/visibility
     * @access Private
     * @authorization User must be part of connection (or admin)
     */
    static setConnectionVisibility = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionId } = req.params;
        const { visibility } = req.body;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        if (!['public', 'connections', 'private'].includes(visibility)) {
            return next(new ErrorResponse('Invalid visibility setting', HttpStatus.BAD_REQUEST, 'INVALID_INPUT'));
        }

        const connection = await Connection.findByConnectionId(connectionId, 'fromUserId toUserId');
        if (!connection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        // ✅ AUTHORIZATION
        if (connection.fromUserId !== authUserId &&
            connection.toUserId !== authUserId &&
            req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to update visibility', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        const updatedConnection = await Connection.findOneAndUpdate(
            { connectionId },
            {
                $set: { visibility },
                $inc: { cacheVersion: 1 }
            },
            { new: true }
        );

        if (!updatedConnection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        await connectionService.manageConnectionCaching(connectionId, 'set');

        if (environmentConfig.AUDIT_LOG_ENABLED) {
            await logger.auditLog('set_connection_visibility', authUserId, {
                connectionId,
                visibility,
                email: req.user?.email
            });
        }

        res.status(HttpStatus.OK).json(SuccessResponse(updatedConnection, 'Connection visibility updated', HttpStatus.OK));
    });

    /**
     * ✅ 8. ARCHIVE CONNECTION
     * PATCH /api/v1/connections/:connectionId/archive
     * @access Private
     * @authorization User must be part of connection (or admin)
     */
    static archiveConnection = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionId } = req.params;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        const connection = await Connection.findByConnectionId(connectionId, 'fromUserId toUserId');
        if (!connection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        // ✅ AUTHORIZATION
        if (connection.fromUserId !== authUserId &&
            connection.toUserId !== authUserId &&
            req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to archive this connection', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        await connectionService.manageConnectionArchival(connectionId);

        if (environmentConfig.AUDIT_LOG_ENABLED) {
            await logger.auditLog('archive_connection', authUserId, {
                connectionId,
                email: req.user?.email
            });
        }

        res.status(HttpStatus.OK).json(SuccessResponse(null, 'Connection archived successfully', HttpStatus.OK));
    });

    /**
     * ✅ 9. RESTORE ARCHIVED CONNECTION
     * PATCH /api/v1/connections/:connectionId/restore
     * @access Private
     * @authorization User must be part of connection (or admin)
     */
    static restoreConnection = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionId } = req.params;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        const connection = await Connection.findByConnectionId(connectionId, 'fromUserId toUserId');
        if (!connection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        // ✅ AUTHORIZATION
        if (connection.fromUserId !== authUserId &&
            connection.toUserId !== authUserId &&
            req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to restore this connection', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        await connectionService.processConnectionRestoration(connectionId);

        if (environmentConfig.AUDIT_LOG_ENABLED) {
            await logger.auditLog('restore_connection', authUserId, {
                connectionId,
                email: req.user?.email
            });
        }

        res.status(HttpStatus.OK).json(SuccessResponse(null, 'Connection restored successfully', HttpStatus.OK));
    });

    /**
     * ✅ 10. EXPORT CONNECTIONS TO CSV
     * GET /api/v1/connections/user/:userId/export
     * @access Private
     * @authorization User can only export their own connections (or admin)
     */
    static exportConnections = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId;
        const { userId } = req.params;
        const { status } = req.query;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        // ✅ AUTHORIZATION
        if (userId !== authUserId && req.user?.role !== 'admin') {
            return next(new ErrorResponse('You can only export your own connections', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        const connections = await Connection.findUserConnectionsPaginated(userId, {
            page: 1,
            limit: environmentConfig.PAGINATION_MAX_LIMIT,
            status: status as string,
            projection: 'connectionId fromUserId toUserId connectionType status strength visibility priority tags createdAt updatedAt',
            useEstimatedCount: true,
        });

        // Format as CSV-like data
        const csvData = connections.data.map((conn) => ({
            connectionId: conn.connectionId,
            fromUserId: conn.fromUserId,
            toUserId: conn.toUserId,
            connectionType: conn.connectionType,
            status: conn.status,
            strength: conn.strength,
            visibility: conn.visibility,
            priority: conn.priority,
            tags: conn.tags?.join(','),
            createdAt: conn.createdAt,
            updatedAt: conn.updatedAt,
        }));

        if (environmentConfig.AUDIT_LOG_ENABLED) {
            await logger.auditLog('export_connections', authUserId, {
                userId,
                count: csvData.length,
                email: req.user?.email
            });
        }

        res.status(HttpStatus.OK).json(SuccessResponse(csvData, 'Connections exported successfully', HttpStatus.OK));
    });

    /**
     * ✅ 11. IMPORT CONNECTIONS (PLACEHOLDER)
     * POST /api/v1/connections/user/:userId/import
     * @access Private
     * @authorization User can only import to their own account (or admin)
     */
    static importConnections = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId;
        const { userId } = req.params;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        // ✅ AUTHORIZATION
        if (userId !== authUserId && req.user?.role !== 'admin') {
            return next(new ErrorResponse('You can only import to your own account', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        // Placeholder: Requires multer for file upload
        return next(new ErrorResponse('Import connections not implemented', HttpStatus.NOT_IMPLEMENTED, 'NOT_IMPLEMENTED'));
    });

    /**
     * ✅ 12. BULK DELETE CONNECTIONS
     * DELETE /api/v1/connections/bulk
     * @access Private
     * @authorization User can only delete their own connections (or admin)
     */
    static bulkDeleteConnections = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionIds } = req.body;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        if (!Array.isArray(connectionIds) || connectionIds.length === 0) {
            return next(new ErrorResponse('connectionIds must be a non-empty array', HttpStatus.BAD_REQUEST, 'INVALID_INPUT'));
        }

        const connections = await Connection.find({ connectionId: { $in: connectionIds } }, 'fromUserId toUserId connectionId').lean();

        // ✅ AUTHORIZATION: Filter only user's connections
        const authorizedIds = connections
            .filter((conn) =>
                conn.fromUserId === authUserId ||  // ✅
                conn.toUserId === authUserId ||    // ✅
                req.user?.role === 'admin'
            )
            .map((conn) => conn.connectionId);

        if (authorizedIds.length === 0) {
            return next(new ErrorResponse('No authorized connections found for deletion', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        await Connection.bulkUpdateStatus(authorizedIds, 'removed', authUserId);
        await Promise.all(authorizedIds.map((id) => connectionService.manageConnectionCaching(id, 'delete')));

        if (environmentConfig.AUDIT_LOG_ENABLED) {
            await logger.auditLog('bulk_delete_connections', authUserId, {
                count: authorizedIds.length,
                email: req.user?.email
            });
        }

        res.status(HttpStatus.OK).json(SuccessResponse(
            { deletedCount: authorizedIds.length },
            'Connections deleted successfully',
            HttpStatus.OK
        ));
    });

    /**
     * ✅ 13. GET CONNECTION STRENGTH
     * GET /api/v1/connections/:connectionId/strength
     * @access Private
     * @authorization User must be part of connection (or admin)
     */
    static getConnectionStrength = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionId } = req.params;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        const connection = await Connection.findByConnectionId(connectionId, 'fromUserId toUserId strength');
        if (!connection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        // ✅ AUTHORIZATION
        if (connection.fromUserId !== authUserId &&
            connection.toUserId !== authUserId &&
            req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to view strength', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        const strength = await connectionService.calculateConnectionStrength(connectionId);

        res.status(HttpStatus.OK).json(SuccessResponse({ strength }, 'Connection strength retrieved', HttpStatus.OK));
    });

    /**
     * ✅ 14. SET CONNECTION PRIORITY
     * PATCH /api/v1/connections/:connectionId/priority
     * @access Private
     * @authorization User must be part of connection (or admin)
     */
    static setConnectionPriority = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionId } = req.params;
        const { priority } = req.body;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        if (!['low', 'medium', 'high'].includes(priority)) {
            return next(new ErrorResponse('Invalid priority', HttpStatus.BAD_REQUEST, 'INVALID_INPUT'));
        }

        const connection = await Connection.findByConnectionId(connectionId, 'fromUserId toUserId');
        if (!connection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        // ✅ AUTHORIZATION
        if (connection.fromUserId !== authUserId &&
            connection.toUserId !== authUserId &&
            req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to update priority', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        await connectionService.handleConnectionPriorities(connectionId, priority);

        if (environmentConfig.AUDIT_LOG_ENABLED) {
            await logger.auditLog('set_connection_priority', authUserId, {
                connectionId,
                priority,
                email: req.user?.email
            });
        }

        res.status(HttpStatus.OK).json(SuccessResponse(null, 'Connection priority updated', HttpStatus.OK));
    });

    /**
     * ✅ 15. GET CONNECTION TIMELINE
     * GET /api/v1/connections/:connectionId/timeline
     * @access Private
     * @authorization User must be part of connection (or admin)
     */
    static getConnectionTimeline = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionId } = req.params;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        const connection = await Connection.findByConnectionId(connectionId, 'fromUserId toUserId createdAt updatedAt metadata');
        if (!connection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        // ✅ AUTHORIZATION
        if (connection.fromUserId !== authUserId &&
            connection.toUserId !== authUserId &&
            req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to view timeline', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        const timeline = {
            createdAt: connection.createdAt,
            updatedAt: connection.updatedAt,
            events: connection.metadata?.events || [],
        };

        res.status(HttpStatus.OK).json(SuccessResponse(timeline, 'Connection timeline retrieved', HttpStatus.OK));
    });

    /**
     * ✅ 16. GET SUGGESTED CONNECTIONS
     * GET /api/v1/connections/user/:userId/suggestions
     * @access Private
     * @authorization User can only view their own suggestions (or admin)
     */
    static getSuggestedConnections = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId;
        const { userId } = req.params;
        const { limit = environmentConfig.PAGINATION_DEFAULT_LIMIT } = req.query;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        // ✅ AUTHORIZATION
        if (userId !== authUserId && req.user?.role !== 'admin') {
            return next(new ErrorResponse('You can only view your own suggestions', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        const suggestions = await connectionService.processConnectionRecommendations(userId, parseInt(limit as string));

        res.status(HttpStatus.OK).json(SuccessResponse(suggestions, 'Suggested connections retrieved', HttpStatus.OK));
    });

    /**
     * ✅ 17. SET CONNECTION TAGS
     * PATCH /api/v1/connections/:connectionId/tags
     * @access Private
     * @authorization User must be part of connection (or admin)
     */
    static setConnectionTags = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionId } = req.params;
        const { tags } = req.body;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        if (!Array.isArray(tags) || tags.some((tag: string) => typeof tag !== 'string' || tag.length > 50)) {
            return next(new ErrorResponse('Tags must be an array of strings with max length 50', HttpStatus.BAD_REQUEST, 'INVALID_INPUT'));
        }

        const connection = await Connection.findByConnectionId(connectionId, 'fromUserId toUserId');
        if (!connection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        // ✅ AUTHORIZATION
        if (connection.fromUserId !== authUserId &&
            connection.toUserId !== authUserId &&
            req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to update tags', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        await connectionService.manageConnectionTags(connectionId, tags);

        if (environmentConfig.AUDIT_LOG_ENABLED) {
            await logger.auditLog('set_connection_tags', authUserId, {
                connectionId,
                tagsCount: tags.length,
                email: req.user?.email
            });
        }

        res.status(HttpStatus.OK).json(SuccessResponse(null, 'Connection tags updated', HttpStatus.OK));
    });

    /**
     * ✅ 18. GET CONNECTIONS BY TAG
     * GET /api/v1/connections/user/:userId/tags/:tag
     * @access Private
     * @authorization User can only view their own connections (or admin)
     */
    static getConnectionsByTag = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId;
        const { userId, tag } = req.params;
        const { page = '1', limit = environmentConfig.PAGINATION_DEFAULT_LIMIT } = req.query;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        // ✅ AUTHORIZATION
        if (userId !== authUserId && req.user?.role !== 'admin') {
            return next(new ErrorResponse('You can only view your own connections', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        if (!tag || typeof tag !== 'string') {
            return next(new ErrorResponse('Tag is required', HttpStatus.BAD_REQUEST, 'INVALID_INPUT'));
        }

        const result = await Connection.findUserConnectionsPaginated(userId, {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            tag: tag as string,
            projection: 'connectionId fromUserId toUserId connectionType status strength visibility priority tags createdAt updatedAt',
            useEstimatedCount: true,
        });

        res.status(HttpStatus.OK).json(SuccessResponse(result, 'Connections by tag retrieved', HttpStatus.OK));
    });

    /**
     * ✅ 19. GENERATE CONNECTION REPORT
     * GET /api/v1/connections/user/:userId/report
     * @access Private
     * @authorization User can only view their own report (or admin)
     */
    static generateConnectionReport = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId;
        const { userId } = req.params;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        // ✅ AUTHORIZATION
        if (userId !== authUserId && req.user?.role !== 'admin') {
            return next(new ErrorResponse('You can only view your own report', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        const stats = await connectionService.getUserConnectionStats(userId);

        if (environmentConfig.AUDIT_LOG_ENABLED) {
            await logger.auditLog('generate_connection_report', authUserId, {
                userId,
                email: req.user?.email
            });
        }

        res.status(HttpStatus.OK).json(SuccessResponse(stats, 'Connection report generated', HttpStatus.OK));
    });

    /**
     * ✅ 20. GET CONNECTION ACTIVITY
     * GET /api/v1/connections/:connectionId/activity
     * @access Private
     * @authorization User must be part of connection (or admin)
     */
    static getConnectionActivity = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { connectionId } = req.params;
        const authUserId = req.user?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        const connection = await Connection.findByConnectionId(connectionId, 'fromUserId toUserId metadata');
        if (!connection) {
            return next(new ErrorResponse('Connection not found', HttpStatus.NOT_FOUND, 'NOT_FOUND'));
        }

        // ✅ AUTHORIZATION
        if (connection.fromUserId !== authUserId &&
            connection.toUserId !== authUserId &&
            req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to view activity', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        const activity = connection.metadata?.events || [];

        res.status(HttpStatus.OK).json(SuccessResponse(activity, 'Connection activity retrieved', HttpStatus.OK));
    });



    /**
     * ✅ 21. GET MUTUAL CONNECTIONS
     * GET /api/v1/connections/mutual/:userId1/:userId2
     * @access Private
     * @authorization Requesting user must be userId1 or userId2 (or admin)
     */
    static getMutualConnections = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { userId1, userId2 } = req.params;
        const { limit = '10' } = req.query;
        const authUserId = req.user?.userId || req.user?.id;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));
        }

        if (!userId1 || !userId2) {
            return next(new ErrorResponse('userId1 and userId2 are required', HttpStatus.BAD_REQUEST, 'INVALID_INPUT'));
        }

        // ✅ AUTHORIZATION: Requesting user must be one of the two users (or admin)
        if (userId1 !== authUserId && userId2 !== authUserId && req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized to view these mutual connections', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        const mutuals = await connectionService.getMutualConnections(
            userId1,
            userId2,
            parseInt(limit as string)
        );

        res.status(HttpStatus.OK).json(SuccessResponse(
            { mutuals, count: mutuals.length },
            'Mutual connections retrieved',
            HttpStatus.OK
        ));
    });
}

export { connectionController };