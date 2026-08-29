/**
 * headline.routes.ts
 * Production-Level Headline Routes
 * 
 * Routes:
 * - POST   /api/v1/headlines                    - Create headline (admin)
 * - GET    /api/v1/headlines                    - Get all headlines (admin)
 * - GET    /api/v1/headlines/user               - Get user headlines
 * - GET    /api/v1/headlines/:headlineId        - Get headline by ID
 * - PUT    /api/v1/headlines/:headlineId        - Update headline (admin)
 * - DELETE /api/v1/headlines/:headlineId        - Delete headline (admin)
 * - POST   /api/v1/headlines/:headlineId/view   - Track view
 * - POST   /api/v1/headlines/:headlineId/click  - Track click
 * - POST   /api/v1/headlines/:headlineId/dismiss - Track dismiss
 * - GET    /api/v1/headlines/:headlineId/analytics - Get analytics (admin)
 * 
 * @module routes/headline.routes
 * @version 1.0.0
 */

import { HeadlineController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { Router, Request, Response } from 'express';
import CacheUtil from '@/shared/cache.util';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import { getHeadlineByIdValidation, updateHeadlineValidation } from '@/Profile/validations/headline.validation';

const router = Router();

// ==================== INLINE RATE LIMITING HELPER ====================

/**
 * Simple inline rate limiting using Redis/Memory cache
 * @param key - Rate limit key prefix
 * @param maxRequests - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns Express middleware
 */
const rateLimitByKey = (key: string, maxRequests: number, windowMs: number) => {
    return async (req: any, res: Response<any, Record<string, any>>, next: Function) => {
        try {
            // Get user ID or IP for rate limiting
            const userId = (req as any).user?.userId || (req as any).ip || 'anonymous';
            const rateLimitKey = `ratelimit:${key}:${userId}`;

            // Get current count
            const currentCount = await CacheUtil.get(rateLimitKey);
            const count = currentCount ? parseInt(currentCount as string) : 0;

            // Check if limit exceeded
            if (count >= maxRequests) {
                const ttl = await CacheUtil.ttl(rateLimitKey);
                const retryAfter = ttl > 0 ? ttl : Math.floor(windowMs / 1000);

                LoggerUtil.warn('Rate limit exceeded', {
                    key,
                    userId,
                    count,
                    maxRequests,
                    path: (req as any).path || (req as any).url,
                });

                return ResponseUtil.tooManyRequests(
                    res,
                    'Too many requests. Please try again later.',
                    {
                        limit: maxRequests,
                        remaining: 0,
                        retryAfter,
                    }
                );
            }

            // Increment counter
            const newCount = count + 1;
            const ttlSeconds = Math.floor(windowMs / 1000);

            if (count === 0) {
                // First request - set with TTL
                await CacheUtil.set(rateLimitKey, newCount.toString(), ttlSeconds);
            } else {
                // Increment existing counter
                await CacheUtil.incr(rateLimitKey, ttlSeconds);
            }

            // Set rate limit headers
            res.setHeader('X-RateLimit-Limit', maxRequests.toString());
            res.setHeader('X-RateLimit-Remaining', (maxRequests - newCount).toString());
            res.setHeader('X-RateLimit-Reset', (Date.now() + windowMs).toString());

            next();

        } catch (error: any) {
            // If rate limiting fails, log error but allow request
            LoggerUtil.error('Rate limit check failed', {
                error: error.message,
                key,
                path: (req as any).path || (req as any).url,
            });

            // Continue without rate limiting on error
            next();
        }
    };
};

// ==================== USER ROUTES ====================

/**
 * POST /api/v1/headlines
 * Create a new headline (admin only)
 */
router.post(
    '/create-headline',
    AuthMiddleware.authenticate as any,
    rateLimitByKey('create_headline', 20, 60000), // 20 req/min
    HeadlineController.createHeadline as any
);

// ==================== GET ROUTES ====================

/**
 * GET /api/v1/headlines/:headlineId
 * Get headline by ID
 */
router.get(
    '/get-headline-by-id/:headlineId',
    AuthMiddleware.authenticate as any,
    rateLimitByKey('get_headline', 100, 60000), // 100 req/min
    // getHeadlineByIdValidation,
    HeadlineController.getHeadlineById as any
);

router.post(
    '/get-multiple-headlines',
    AuthMiddleware.authenticate as any,
    rateLimitByKey('get_multiple_headlines', 100, 60000),
    HeadlineController.getMultipleHeadlines as any
);
/**
 * GET /api/v1/headlines
 * Get all headlines with filters
 * Query params: ?type=dashboard&status=ACTIVE&page=1&limit=20
 */
router.get(
    '/get-all-headlines',
    AuthMiddleware.authenticate as any,
    rateLimitByKey('get_all_headlines', 100, 60000), // 100 req/min
    // getHeadlineByIdValidation,
    HeadlineController.getAllHeadlines as any
);

// ==================== UPDATE ROUTE ====================

/**
 * PUT /api/v1/headlines/:headlineId
 * Update headline
 */
router.put(
    '/update-headline/:headlineId',
    AuthMiddleware.authenticate as any,
    rateLimitByKey('update_headline', 30, 60000),
    // updateHeadlineValidation, // 30 req/min
    HeadlineController.updateHeadline as any
);1 

// ==================== EXPORT ====================

export default router;