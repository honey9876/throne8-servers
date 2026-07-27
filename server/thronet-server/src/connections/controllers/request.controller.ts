// src/controllers/requestController.ts

import { Request, Response, NextFunction } from 'express';
import logger from '@/shared/logger.util';
import { connectionRequestService } from '../services/index';
import { ErrorResponse, SuccessResponse, HttpStatus } from '@/shared/response.util';
import { asyncHandler } from '../middleware/asyns.middleware';
import environmentConfig from '@/config/environment/environment';

/**
 * Request Controller
 * Handles connection request-related API endpoints for the Connection Service.
 * Optimized for 100M+ users with advanced indexing, pagination, caching, and analytics.
 *
 * Features (Complete 18):
 * 1. sendConnectionRequest
 * 2. acceptConnectionRequest
 * 3. declineConnectionRequest
 * 4. cancelConnectionRequest
 * 5. getConnectionRequestDetails
 * 6. getUserRequests
 * 7. getIncomingRequests
 * 8. getOutgoingRequests
 * 9. updateRequestMessage
 * 10. markRequestAsRead
 * 11. bulkAcceptRequests
 * 12. bulkDeclineRequests
 * 13. bulkMarkRequestsAsRead
 * 14. getRequestStats
 * 15. setRequestPriority
 * 16. getRequestsByStatus
 * 17. exportRequests
 * 18. archiveOldRequests
 *
 * NOTE: Auth middleware attaches the authenticated user's ID as
 * `req.user.userId` (not `req.user.id`). Every method below reads
 * `(req.user as any)?.userId` for that reason.
 */

class requestController {
    /**
     * Send a new connection request
     */
    static sendConnectionRequest = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { toUserId, message, priority = 'medium', templateId } = req.body;
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        if (!toUserId) {
            return next(new ErrorResponse('toUserId is required', HttpStatus.BAD_REQUEST));
        }
        if (!['low', 'medium', 'high'].includes(priority)) {
            return next(new ErrorResponse('Invalid priority', HttpStatus.BAD_REQUEST));
        }

        if (message && message.length > 500) {
            return next(new ErrorResponse('Message cannot exceed 500 characters', HttpStatus.BAD_REQUEST));
        }

        if (templateId && !/^[a-zA-Z0-9-]+$/.test(templateId)) {
            return next(new ErrorResponse('Invalid templateId format', HttpStatus.BAD_REQUEST));
        }

        const request = await connectionRequestService.sendConnectionRequest(
            authUserId,
            toUserId,
            message,
            priority,
            templateId,
            (req.user as any)?.region || 'global'
        );

        await logger.auditLog('send_connection_request', authUserId, { requestId: request.requestId, toUserId });

        res.status(HttpStatus.CREATED).json(SuccessResponse(request, 'Connection request sent successfully', HttpStatus.CREATED));
    });

    /**
     * Accept a connection request
     */
    static acceptConnectionRequest = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { requestId } = req.params;
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        const connection = await connectionRequestService.acceptConnectionRequest(requestId, authUserId, (req.user as any)?.region || 'global');
        await logger.auditLog('accept_connection_request', authUserId, { requestId, connectionId: connection.connectionId });

        res.status(HttpStatus.OK).json(SuccessResponse(connection, 'Connection request accepted'));
    });

    /**
     * Decline a connection request
     */
    static declineConnectionRequest = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { requestId } = req.params;
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        await connectionRequestService.declineConnectionRequest(requestId, authUserId);
        await logger.auditLog('decline_connection_request', authUserId, { requestId });

        res.status(HttpStatus.OK).json(SuccessResponse(null, 'Connection request declined'));
    });

    /**
     * Cancel a connection request
     */
    static cancelConnectionRequest = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { requestId } = req.params;
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        await connectionRequestService.cancelConnectionRequest(requestId, authUserId);
        await logger.auditLog('cancel_connection_request', authUserId, { requestId });

        res.status(HttpStatus.OK).json(SuccessResponse(null, 'Connection request cancelled'));
    });

    /**
     * Get connection request details
     */
    static getConnectionRequestDetails = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { requestId } = req.params;
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        const request = await connectionRequestService.getRequestDetails(requestId, authUserId);
        res.status(HttpStatus.OK).json(SuccessResponse(request, 'Connection request details retrieved'));
    });

    /**
     * Get all user requests with pagination
     */
    static getUserRequests = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const authUserId = (req.user as any)?.userId;
        const { page = '1', limit = environmentConfig.PAGINATION_DEFAULT_LIMIT, status } = req.query;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        const result = await connectionRequestService.getUserRequests(authUserId, {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            status: status as string,
            region: (req.user as any)?.region || 'global',
        });

        res.status(HttpStatus.OK).json(SuccessResponse(result, 'User connection requests retrieved'));
    });

    /**
     * Get incoming requests with pagination
     */
    static getIncomingRequests = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const authUserId = (req.user as any)?.userId;
        const { page = '1', limit = environmentConfig.PAGINATION_DEFAULT_LIMIT, status = 'pending' } = req.query;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        const result = await connectionRequestService.getIncomingRequests(authUserId, {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            status: status as string,
            region: (req.user as any)?.region || 'global',
        });

        res.status(HttpStatus.OK).json(SuccessResponse(result, 'Incoming connection requests retrieved'));
    });

    /**
     * Get outgoing requests with pagination
     */
    static getOutgoingRequests = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const authUserId = (req.user as any)?.userId;
        const { page = '1', limit = environmentConfig.PAGINATION_DEFAULT_LIMIT, status } = req.query;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        const result = await connectionRequestService.getOutgoingRequests(authUserId, {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            status: status as string,
            region: (req.user as any)?.region || 'global',
        });

        res.status(HttpStatus.OK).json(SuccessResponse(result, 'Outgoing connection requests retrieved'));
    });

    /**
     * Update connection request message
     */
    static updateRequestMessage = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { requestId } = req.params;
        const { message } = req.body;
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        await connectionRequestService.updateRequestMessage(requestId, authUserId, message);
        await logger.auditLog('update_request_message', authUserId, { requestId, message: message.slice(0, 50) });

        res.status(HttpStatus.OK).json(SuccessResponse(null, 'Connection request message updated'));
    });

    /**
     * Mark connection request as read
     */
    static markRequestAsRead = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { requestId } = req.params;
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        await connectionRequestService.markRequestAsRead(requestId, authUserId);
        await logger.auditLog('mark_request_as_read', authUserId, { requestId });

        res.status(HttpStatus.OK).json(SuccessResponse(null, 'Connection request marked as read'));
    });

    /**
     * Bulk accept connection requests
     */
    static bulkAcceptRequests = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { requestIds } = req.body;
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        if (!Array.isArray(requestIds) || requestIds.length === 0) {
            return next(new ErrorResponse('requestIds must be a non-empty array', HttpStatus.BAD_REQUEST));
        }

        const { connections, acceptedCount } = await connectionRequestService.bulkAcceptRequests(requestIds, authUserId, (req.user as any)?.region || 'global');
        await logger.auditLog('bulk_accept_requests', authUserId, { data: { requestIds } });
        res.status(HttpStatus.OK).json(SuccessResponse({ connections, acceptedCount }, 'Connection requests accepted'));
    });

    /**
     * Bulk decline connection requests
     */
    static bulkDeclineRequests = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { requestIds } = req.body;
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        if (!Array.isArray(requestIds) || requestIds.length === 0) {
            return next(new ErrorResponse('requestIds must be a non-empty array', HttpStatus.BAD_REQUEST));
        }

        await connectionRequestService.bulkDeclineRequests(requestIds, authUserId);
        await logger.auditLog('bulk_decline_requests', authUserId, { data: { requestIds } });
        res.status(HttpStatus.OK).json(SuccessResponse({ declinedCount: requestIds.length }, 'Connection requests declined'));
    });

    /**
     * Bulk mark requests as read
     */
    static bulkMarkRequestsAsRead = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { requestIds } = req.body;
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        if (!Array.isArray(requestIds) || requestIds.length === 0) {
            return next(new ErrorResponse('requestIds must be a non-empty array', HttpStatus.BAD_REQUEST));
        }

        await connectionRequestService.bulkMarkRequestsAsRead(requestIds, authUserId);
        await logger.auditLog('bulk_mark_requests_as_read', authUserId, { data: { requestIds } });
        res.status(HttpStatus.OK).json(SuccessResponse({ markedCount: requestIds.length }, 'Connection requests marked as read'));
    });

    /**
     * Get request stats for a user
     */
    static getRequestStats = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        const stats = await connectionRequestService.getRequestStats(authUserId);
        res.status(HttpStatus.OK).json(SuccessResponse(stats, 'Connection request stats retrieved'));
    });

    /**
     * Set request priority
     */
    static setRequestPriority = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { requestId } = req.params;
        const { priority } = req.body;
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        if (!['low', 'medium', 'high'].includes(priority)) {
            return next(new ErrorResponse('Invalid priority', HttpStatus.BAD_REQUEST));
        }

        await connectionRequestService.setRequestPriority(requestId, authUserId, priority);
        await logger.auditLog('set_request_priority', authUserId, { requestId, priority });

        res.status(HttpStatus.OK).json(SuccessResponse(null, 'Connection request priority updated'));
    });

    /**
     * Get requests by status with pagination
     */
    static getRequestsByStatus = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const authUserId = (req.user as any)?.userId;
        const { status, page = '1', limit = environmentConfig.PAGINATION_DEFAULT_LIMIT } = req.query;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        if (!['pending', 'accepted', 'declined', 'cancelled'].includes(status as string)) {
            return next(new ErrorResponse('Invalid status', HttpStatus.BAD_REQUEST));
        }

        const result = await connectionRequestService.getRequestsByStatus(authUserId, status as string, {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            region: (req.user as any)?.region || 'global',
        });

        res.status(HttpStatus.OK).json(SuccessResponse(result, 'Connection requests by status retrieved'));
    });

    /**
     * Export connection requests to CSV
     */
    static exportRequests = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const authUserId = (req.user as any)?.userId;
        const { status } = req.query;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        const requests = await connectionRequestService.getUserRequests(authUserId, {
            page: 1,
            limit: environmentConfig.PAGINATION_MAX_LIMIT,
            status: status as string,
            region: (req.user as any)?.region || 'global',
        });

        const csvData = requests.data.map((reqItem: any) => ({
            requestId: reqItem.requestId,
            fromUserId: reqItem.fromUserId,
            toUserId: reqItem.toUserId,
            message: reqItem.message,
            status: reqItem.status,
            priority: reqItem.priority,
            templateId: reqItem.templateId,
            isRead: reqItem.isRead,
            createdAt: reqItem.createdAt,
            updatedAt: reqItem.updatedAt,
            expiresAt: reqItem.expiresAt,
        }));

        await logger.auditLog('export_requests', authUserId, { count: requests.data.length });
        res.status(HttpStatus.OK).json(SuccessResponse(csvData, 'Connection requests exported successfully'));
    });

    /**
     * Archive old connection requests
     */
    static archiveOldRequests = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const authUserId = (req.user as any)?.userId;

        if (!authUserId) {
            return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
        }

        if (!(req.user as any)?.isAdmin) {
            return next(new ErrorResponse('Admin access required to archive requests', HttpStatus.FORBIDDEN));
        }

        const archivedCount = await connectionRequestService.archiveOldRequests(
            environmentConfig.DATA_RETENTION_DAYS,
            environmentConfig.BULK_OPERATION_BATCH_SIZE
        );

        await logger.auditLog('archive_old_requests', authUserId, { data: { archivedCount } });
        res.status(HttpStatus.OK).json(SuccessResponse({ archivedCount }, 'Old connection requests archived'));
    });
}

export { requestController };