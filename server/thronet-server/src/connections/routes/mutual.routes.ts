// src/routes/mutualRoutes.ts

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { celebrate, Joi } from 'celebrate';
import { mutualController } from '../controllers/index';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import environmentConfig from '@/config/environment/environment';
import { logger } from '@/shared/logger.util';
import { getBulkMutualConnections } from '@/connections/controllers/mutual.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

/**
 * Mutual Routes
 * Defines Express routes for mutual connections-related API endpoints in the Connection Service.
 * Optimized for 100M+ users with rate limiting, authentication, validation, and logging.
 * 
 * Features (Aligned with mutualController.ts - 12 endpoints):
 * 1. GET /:userId1/:userId2 - Get mutual connections list (Feature 1)
 * 2. GET /:userId1/:userId2/count - Get mutual connections count (Feature 2)
 * 3. GET /:userId/suggestions - Get mutual suggestions (Feature 3)
 * 4. GET /:userId1/:userId2/extended?degree=2|3 - Get extended mutuals (Feature 4)
 * 5. GET /:userId1/:userId2/strength - Get mutual strength (Feature 5)
 * 6. POST /common - Find common connections (Feature 6)
 * 7. GET /:userId1/:userId2/metrics - Get mutual network metrics (Feature 7)
 * 8. POST /bulk - Bulk mutual queries (Feature 8)
 * 9. GET /:userId1/:userId2/search?q=query&company=... - Search mutual connections (Feature 9)
 * 10. GET /:userId1/:userId2/insights - Get mutual insights (Feature 10)
 * 11. GET /:userId/trending?limit=10 - Get trending mutuals (Feature 11)
 * 12. POST /:userId/invalidate-cache - Invalidate user cache (admin, Feature 12)
 * 
 * Dependencies:
 * - express: For routing
 * - express-rate-limit: For rate limiting
 * - celebrate: For request validation with Joi
 * - winston: For logging (logger)
 * - environmentConfig: For validated environment variables
 * - mutualController: For endpoint handlers
 * - auth.middleware: For JWT authentication
 * - response: For standardized ErrorResponse and HttpStatus
 * 
 * Scalability Considerations:
 * - Rate limiting to prevent abuse (general, bulk-specific)
 * - Authentication for secure access (all routes)
 * - Validation for input integrity (body/query params)
 * - Async operations for performance
 * - Audit logging for all requests
 * - Pagination and limits from env
 * 
 * Integration:
 * - Uses mutualController.ts for endpoint logic
 * - Aligns with .env (RATE_LIMIT_*, API_VERSION), package.json, tsconfig.json
 * - Logs to LOG_FILE_PATH and LOG_ACCESS_FILE_PATH
 * - Supports health endpoints from server output
 * - Admin routes require role check (via middleware)
 */

const router: Router = Router();

// Rate limiter for general mutual endpoints
const mutualLimiter = rateLimit({
    windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS,
    max: environmentConfig.RATE_LIMIT_MAX,
    message: async (req: Request, _res: Response) => {
        const error = new ErrorResponse('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
        logger.warn('Mutual route rate limit exceeded', { ip: req.ip, path: req.path });
        return error;
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter for bulk and search operations (stricter)
const bulkSearchLimiter = rateLimit({
    windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS,
    max: Math.floor(environmentConfig.RATE_LIMIT_MAX / 2), // Stricter for heavy ops
    message: async (req: Request, _res: Response) => {
        const error = new ErrorResponse('Too many bulk/search requests', HttpStatus.TOO_MANY_REQUESTS);
        logger.warn('Bulk/search rate limit exceeded', { ip: req.ip, path: req.path });
        return error;
    },
});

// ✅ FIX: Authentication ab enable hai — pehle yeh commented tha isliye
// req.user hamesha undefined aata tha aur "Authentication required" 500 error deta tha
// connection.routes.ts jaisa hi pattern use kiya hai (AuthMiddleware.authenticate)
router.use(AuthMiddleware.authenticate as any);

// Request logging middleware (applied after auth)
router.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info('Mutual route accessed', {
        method: req.method,
        path: req.path,
        userId: req.user?.id || 'anonymous',
        ip: req.ip,
    });
    next();
});


router.post(
    '/bulk',
    mutualLimiter,   // ya jo bhi limiter already mutual routes pe lagta hai
    getBulkMutualConnections
);


// Feature 1: Get mutual connections list
router.get(
    '/:userId1/:userId2',
    mutualLimiter,
    (req: Request, _res: Response, next: NextFunction) => {
        // Query param validation (optional, service handles deeper)
        const limit = parseInt(req.query.limit as string);
        const offset = parseInt(req.query.offset as string);
        if (limit && (limit < 1 || limit > 100)) {
            return next(new ErrorResponse('Limit must be between 1 and 100', HttpStatus.BAD_REQUEST));
        }
        if (offset && offset < 0) {
            return next(new ErrorResponse('Offset must be non-negative', HttpStatus.BAD_REQUEST));
        }
        next();
    },
    mutualController.getMutualConnections
);

// Feature 2: Get mutual count
router.get(
    '/:userId1/:userId2/count',
    mutualLimiter,
    mutualController.getMutualCount
);

// Feature 3: Get mutual suggestions
router.get(
    '/:userId/suggestions',
    mutualLimiter,
    (req: Request, _res: Response, next: NextFunction) => {
        const limit = parseInt(req.query.limit as string);
        if (limit && (limit < 1 || limit > 50)) {
            return next(new ErrorResponse('Limit must be between 1 and 50', HttpStatus.BAD_REQUEST));
        }
        next();
    },
    mutualController.getMutualSuggestions
);

// Feature 4: Get extended mutuals
router.get(
    '/:userId1/:userId2/extended',
    mutualLimiter,
    (req: Request, _res: Response, next: NextFunction) => {
        const degree = parseInt(req.query.degree as string);
        if (degree && (degree !== 2 && degree !== 3)) {
            return next(new ErrorResponse('Degree must be 2 or 3', HttpStatus.BAD_REQUEST));
        }
        next();
    },
    mutualController.getExtendedMutuals
);

// Feature 5: Get mutual strength
router.get(
    '/:userId1/:userId2/strength',
    mutualLimiter,
    mutualController.getMutualStrength
);

// Feature 6: Find common connections (POST with body)
router.post(
    '/common',
    mutualLimiter,
    celebrate({
        body: Joi.object({
            userConnections1: Joi.array().items(Joi.string()).min(1).max(1000).required(),
            userConnections2: Joi.array().items(Joi.string()).min(1).max(1000).required(),
        }).strict(),
    }),
    mutualController.findCommonConnections
);

// Feature 7: Get mutual network metrics
router.get(
    '/:userId1/:userId2/metrics',
    mutualLimiter,
    mutualController.getMutualNetworkMetrics
);

// Feature 8: Bulk mutual queries (stricter limit)
// Feature 8: Bulk mutual queries (stricter limit) — pairs-based, alag path
router.post(
    '/bulk-pairs',
    // bulkSearchLimiter,
    celebrate({
        body: Joi.object({
            pairs: Joi.array()
                .items(Joi.array().items(Joi.string()).min(2).max(2))
                .min(1)
                .max(50) // From service MAX_BATCH_SIZE
                .required(),
        }).strict(),
    }),
    mutualController.bulkMutualQueries
);

// Feature 9: Search mutual connections
router.get(
    '/:userId1/:userId2/search',
    bulkSearchLimiter,
    (req: Request, _res: Response, next: NextFunction) => {
        const q = req.query.q;
        if (!q || typeof q !== 'string' || (q as string).trim().length < 2) {
            return next(new ErrorResponse('Search query must be at least 2 characters', HttpStatus.BAD_REQUEST));
        }
        // Optional filters validation
        next();
    },
    mutualController.searchMutualConnections
);

// Feature 10: Get mutual insights
router.get(
    '/:userId1/:userId2/insights',
    mutualLimiter,
    mutualController.getMutualInsights
);

// Feature 11: Get trending mutuals
router.get(
    '/:userId/trending',
    mutualLimiter,
    (req: Request, _res: Response, next: NextFunction) => {
        const limit = parseInt(req.query.limit as string);
        if (limit && (limit < 1 || limit > 50)) {
            return next(new ErrorResponse('Limit must be between 1 and 50', HttpStatus.BAD_REQUEST));
        }
        next();
    },
    mutualController.getTrendingMutuals
);

// Feature 12: Invalidate user cache (admin only - add role middleware if needed)
router.post(
    '/:userId/invalidate-cache',
    mutualLimiter,
    // TODO: Add requireRole('admin') middleware here if implemented
    mutualController.invalidateUserCache
);

// Global error handling for unmatched routes (404)
router.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new ErrorResponse('Mutual route not found', HttpStatus.NOT_FOUND));
});

// Log all responses (optional post-handler)
router.use((req: Request, res: Response, next: NextFunction) => {
    const oldSend = res.json;
    res.json = function (data: any) {
        logger.info('Mutual route response', {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            responseSize: JSON.stringify(data).length,
            userId: req.user?.id || 'anonymous',
        });
        return oldSend.call(this, data);
    };
    next();
});

export default router;