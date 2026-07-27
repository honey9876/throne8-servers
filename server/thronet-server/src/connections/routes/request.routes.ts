// src/routes/requestRoutes.ts

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { requestController } from '../controllers/index';
import logger from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';
import { asyncHandler } from '../middleware/asyns.middleware';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import { requestValidationSchemas } from '../validators/requestValidator';
import { validateRequest } from '@/shared/middlewares/connections/validations.middleware';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

/**
 * Request Routes
 * Defines Express routes for connection request-related API endpoints in the Connection Service.
 * Optimized for 100M+ users with rate limiting, authentication, and validation.
 *
 * Features (Aligned with requestController.ts - 18 endpoints):
 * 1. POST / - Send a new connection request
 * 2. POST /:requestId/accept - Accept a connection request
 * 3. POST /:requestId/decline - Decline a connection request
 * 4. POST /:requestId/cancel - Cancel a connection request
 * 5. GET /:requestId - Get connection request details
 * 6. GET /user/:userId - Get all user requests with pagination
 * 7. GET /user/:userId/incoming - Get incoming requests with pagination
 * 8. GET /user/:userId/outgoing - Get outgoing requests with pagination
 * 9. PATCH /:requestId/message - Update connection request message
 * 10. PATCH /:requestId/read - Mark connection request as read
 * 11. POST /bulk/accept - Bulk accept connection requests
 * 12. POST /bulk/decline - Bulk decline connection requests
 * 13. POST /bulk/read - Bulk mark requests as read
 * 14. GET /user/:userId/stats - Get request stats for a user
 * 15. PATCH /:requestId/priority - Set request priority
 * 16. GET /user/:userId/status/:status - Get requests by status
 * 17. GET /user/:userId/export - Export connection requests to CSV
 * 18. POST /archive - Archive old connection requests
 */

// Extend Express Request interface to include ip property
interface RequestWithIP extends Request {
    ip: string;
}

const router: Router = Router();

// Rate limiter for request-related endpoints
const requestLimiter = rateLimit({
    windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS,
    max: environmentConfig.RATE_LIMIT_MAX,
    message: async (req: RequestWithIP) => {
        const error = new ErrorResponse('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
        logger.warn('Request route rate limit exceeded', { ip: req.ip, path: req.path });
        return error;
    },
});

// Rate limiter for sending connection requests
const sendRequestLimiter = rateLimit({
    windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS,
    max: environmentConfig.CONNECTION_REQUEST_RATE_LIMIT,
    message: async (req: RequestWithIP) => {
        const error = new ErrorResponse('Too many connection requests', HttpStatus.TOO_MANY_REQUESTS);
        logger.warn('Connection request rate limit exceeded', { ip: req.ip, path: req.path });
        return error;
    },
});

// Rate limiter for bulk operations
const bulkOperationLimiter = rateLimit({
    windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS,
    max: environmentConfig.RATE_LIMIT_MAX / 2, // Stricter limit for bulk operations
    message: async (req: RequestWithIP) => {
        const error = new ErrorResponse('Too many bulk requests', HttpStatus.TOO_MANY_REQUESTS);
        logger.warn('Bulk operation rate limit exceeded', { ip: req.ip, path: req.path });
        return error;
    },
});

// Apply authentication to all routes
router.use(AuthMiddleware.authenticate as any);

// Send a new connection request
router.post(
    '/',
    sendRequestLimiter,
    validateRequest(requestValidationSchemas.sendConnectionRequest),
    asyncHandler(requestController.sendConnectionRequest)
);

// Accept a connection request
router.post(
    '/:requestId/accept',
    requestLimiter,
    asyncHandler(requestController.acceptConnectionRequest)
);

// Decline a connection request
router.post(
    '/:requestId/decline',
    requestLimiter,
    asyncHandler(requestController.declineConnectionRequest)
);

// Cancel a connection request
router.post(
    '/:requestId/cancel',
    requestLimiter,
    asyncHandler(requestController.cancelConnectionRequest)
);

// Get connection request details
router.get(
    '/:requestId',
    requestLimiter,
    asyncHandler(requestController.getConnectionRequestDetails)
);

// Get all user requests with pagination
router.get(
    '/user/:userId',
    requestLimiter,
    asyncHandler(requestController.getUserRequests)
);

// Get incoming requests with pagination
router.get(
    '/user/:userId/incoming',
    requestLimiter,
    asyncHandler(requestController.getIncomingRequests)
);

// Get outgoing requests with pagination
router.get(
    '/user/:userId/outgoing',
    requestLimiter,
    asyncHandler(requestController.getOutgoingRequests)
);

// Update connection request message
router.patch(
    '/:requestId/message',
    requestLimiter,
    validateRequest(requestValidationSchemas.updateRequestMessage),
    asyncHandler(requestController.updateRequestMessage)
);

// Mark connection request as read
router.patch(
    '/:requestId/read',
    requestLimiter,
    asyncHandler(requestController.markRequestAsRead)
);

// Bulk accept connection requests
router.post(
    '/bulk/accept',
    bulkOperationLimiter,
    validateRequest(requestValidationSchemas.bulkAcceptRequests),
    asyncHandler(requestController.bulkAcceptRequests)
);

// Bulk decline connection requests
router.post(
    '/bulk/decline',
    bulkOperationLimiter,
    validateRequest(requestValidationSchemas.bulkDeclineRequests),
    asyncHandler(requestController.bulkDeclineRequests)
);

// Bulk mark requests as read
router.post(
    '/bulk/read',
    bulkOperationLimiter,
    validateRequest(requestValidationSchemas.bulkMarkRequestsAsRead),
    asyncHandler(requestController.bulkMarkRequestsAsRead)
);

// Get request stats for a user
router.get(
    '/user/:userId/stats',
    requestLimiter,
    asyncHandler(requestController.getRequestStats)
);

// Set request priority
router.patch(
    '/:requestId/priority',
    requestLimiter,
    validateRequest(requestValidationSchemas.setRequestPriority),
    asyncHandler(requestController.setRequestPriority)
);

// Get requests by status
router.get(
    '/user/:userId/status/:status',
    requestLimiter,
    asyncHandler(requestController.getRequestsByStatus)
);

// Export connection requests to CSV
router.get(
    '/user/:userId/export',
    requestLimiter,
    asyncHandler(requestController.exportRequests)
);

// Archive old connection requests
router.post(
    '/archive',
    bulkOperationLimiter,
    asyncHandler(requestController.archiveOldRequests)
);

// Log all requests - moved before routes to capture them
router.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info('Request route accessed', {
        method: req.method,
        path: req.path,
        userId: (req as any).user?.userId || 'anonymous',
        ip: req.ip,
    });
    next();
});

export const requestRouter: Router = router;