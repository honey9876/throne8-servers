// src/routes/connectionRoutes.ts

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
// import { authenticateJWT } from '@middleware/auth.middleware';
import { connectionController } from '@/shared/controllers/index.controllers';
import environmentConfig from '@/config/environment/environment';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import { asyncHandler } from '@/shared/utils/helpers.util';
import connectionValidationSchemas from '@/connections/models/schemas/connectionSchema';
import { validateRequest } from '@/shared/middlewares/connections/validations.middleware';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { logger } from '@/shared/logger.util';

/**
 * Connection Routes
 * Defines Express routes for connection-related API endpoints in the Connection Service.
 * Optimized for 100M+ users with rate limiting, authentication, and validation.
 * 
 * Features (Aligned with connectionController.ts - 20 endpoints):
 * 1. POST / - Create a new connection
 * 2. DELETE /:connectionId - Delete a connection
 * 3. GET /:connectionId - Get connection details
 * 4. PATCH /:connectionId/status - Update connection status
 * 5. GET /user/:userId - Get user's connections with pagination
 * 6. GET /user/:userId/count - Get connection count
 * 7. PATCH /:connectionId/visibility - Set connection visibility
 * 8. PATCH /:connectionId/archive - Archive a connection
 * 9. PATCH /:connectionId/restore - Restore an archived connection
 * 10. GET /user/:userId/export - Export connections to CSV
 * 11. POST /user/:userId/import - Import connections
 * 12. DELETE /bulk - Bulk delete connections
 * 13. GET /:connectionId/strength - Get connection strength
 * 14. PATCH /:connectionId/priority - Set connection priority
 * 15. GET /:connectionId/timeline - Get connection timeline
 * 16. GET /user/:userId/suggestions - Get suggested connections
 * 17. PATCH /:connectionId/tags - Set connection tags
 * 18. GET /user/:userId/tags/:tag - Get connections by tag
 * 19. GET /user/:userId/report - Generate connection report
 * 20. GET /:connectionId/activity - Get connection activity
 */

const router = Router();



// Rate limiter specifically for mutual connections (high-frequency, low-cost reads)
const mutualLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 300, // bahut zyada limit, kyunki ek page load pe 50-100 calls ho sakti hain
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        statusCode: 429
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        logger.warn('Mutual connections rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            userId: req.user?.id || 'anonymous'
        });

        const error = new ErrorResponse('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
        res.status(error.statusCode).json(error);
    },
});


// FIXED: Improved rate limiter error handling
const connectionLimiter = rateLimit({
    windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS,
    max: environmentConfig.RATE_LIMIT_MAX,
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        statusCode: 429
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        logger.warn('Connection route rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
        });

        const error = new ErrorResponse('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
        res.status(error.statusCode).json(error);
    },
});

// Rate limiter for connection creation
const createConnectionLimiter = rateLimit({
    windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes fallback
    max: environmentConfig.CONNECTION_REQUEST_RATE_LIMIT || 10,
    message: {
        error: 'Too many connection requests',
        message: 'Connection request rate limit exceeded. Please try again later.',
        statusCode: 429
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        logger.warn('Connection creation rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            userId: req.user?.id || 'anonymous'
        });

        const error = new ErrorResponse('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED');
        res.status(error.statusCode).json({
            statusCode: error.statusCode,
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many connection requests'
        });
    }
});
// Rate limiter for bulk operations
const bulkOperationLimiter = rateLimit({
    windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS,
    max: Math.floor(environmentConfig.RATE_LIMIT_MAX / 2), // FIXED: Ensure integer
    message: {
        error: 'Too many bulk requests',
        message: 'Bulk operation rate limit exceeded. Please try again later.',
        statusCode: 429
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        logger.warn('Bulk operation rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            userId: req.user?.id || 'anonymous'
        });

        const error = new ErrorResponse('Too many bulk requests', HttpStatus.TOO_MANY_REQUESTS);
        res.status(error.statusCode).json(error);
    },
});

// ✅ APPLY AUTHENTICATION TO ALL ROUTES
router.use(AuthMiddleware.authenticate as any);


// Apply authentication to all routes
// router.use(authenticateJWT);

// Logging middleware - placed before routes for better logging
router.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info('Connection route accessed', {
        method: req.method,
        path: req.path,
        userId: req.user?.id || 'anonymous',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });
    next();
});

// 1. Create a new connection
router.post(
    '/create-connection',
    createConnectionLimiter,
    validateRequest(connectionValidationSchemas.createConnection),
    asyncHandler(connectionController.createConnection)
);

// 2. Delete a connection
router.delete(
    '/:connectionId',
    connectionLimiter,
    asyncHandler(connectionController.deleteConnection)
);


// 2.5 Get mutual connections between two users (MUST be before GET /:connectionId)
router.get(
    '/mutual/:userId1/:userId2',
    mutualLimiter,   // ✅ connectionLimiter ki jagah ye
    asyncHandler(connectionController.getMutualConnections)
);




// 3. Get connection details
router.get(
    '/:connectionId',
    connectionLimiter,
    asyncHandler(connectionController.getConnectionDetails)
);


// 4. Update connection status
router.patch(
    '/:connectionId/status',
    connectionLimiter,
    validateRequest(connectionValidationSchemas.updateConnectionStatus),
    asyncHandler(connectionController.updateConnectionStatus)
);

// 5. Get user's connections with pagination
router.get(
    '/user/:userId',
    connectionLimiter,
    asyncHandler(connectionController.getUserConnections)
);

// 6. Get connection count
router.get(
    '/user/:userId/count',
    connectionLimiter,
    asyncHandler(connectionController.getConnectionCount)
);

// 7. Set connection visibility
router.patch(
    '/:connectionId/visibility',
    connectionLimiter,
    validateRequest(connectionValidationSchemas.setConnectionVisibility),
    asyncHandler(connectionController.setConnectionVisibility)
);

// 8. Archive a connection
router.patch(
    '/:connectionId/archive',
    connectionLimiter,
    asyncHandler(connectionController.archiveConnection)
);

// 9. Restore an archived connection
router.patch(
    '/:connectionId/restore',
    connectionLimiter,
    asyncHandler(connectionController.restoreConnection)
);

// 10. Export connections to CSV
router.get(
    '/user/:userId/export',
    connectionLimiter,
    asyncHandler(connectionController.exportConnections)
);

// 11. Import connections
router.post(
    '/user/:userId/import',
    connectionLimiter,
    asyncHandler(connectionController.importConnections)
);

// 12. Bulk delete connections
router.delete(
    '/bulk',
    bulkOperationLimiter,
    validateRequest(connectionValidationSchemas.bulkDeleteConnections),
    asyncHandler(connectionController.bulkDeleteConnections)
);

// 13. Get connection strength
router.get(
    '/:connectionId/strength',
    connectionLimiter,
    asyncHandler(connectionController.getConnectionStrength)
);

// 14. Set connection priority
router.patch(
    '/:connectionId/priority',
    connectionLimiter,
    validateRequest(connectionValidationSchemas.setConnectionPriority),
    asyncHandler(connectionController.setConnectionPriority)
);

// 15. Get connection timeline
router.get(
    '/:connectionId/timeline',
    connectionLimiter,
    asyncHandler(connectionController.getConnectionTimeline)
);

// 16. Get suggested connections
router.get(
    '/user/:userId/suggestions',
    connectionLimiter,
    asyncHandler(connectionController.getSuggestedConnections)
);

// 17. Set connection tags
router.patch(
    '/:connectionId/tags',
    connectionLimiter,
    validateRequest(connectionValidationSchemas.setConnectionTags),
    asyncHandler(connectionController.setConnectionTags)
);

// 18. Get connections by tag
router.get(
    '/user/:userId/tags/:tag',
    connectionLimiter,
    asyncHandler(connectionController.getConnectionsByTag)
);

// 19. Generate connection report
router.get(
    '/user/:userId/report',
    connectionLimiter,
    asyncHandler(connectionController.generateConnectionReport)
);

// 20. Get connection activity
router.get(
    '/:connectionId/activity',
    connectionLimiter,
    asyncHandler(connectionController.getConnectionActivity)
);

// FIXED: Error handling middleware for unmatched routes
router.use(asyncHandler(async (req: Request, res: Response): Promise<void> => {  // ✅ '*' remove kiya
    const error = new ErrorResponse(
        `Route ${req.method} ${req.path} not found`,
        HttpStatus.NOT_FOUND
    );

    logger.warn('Connection route not found', {
        method: req.method,
        path: req.path,
        userId: req.user?.id || 'anonymous',
        ip: req.ip
    });

    res.status(error.statusCode).json(error);
}));    

export const connectionRouter: Router = router;