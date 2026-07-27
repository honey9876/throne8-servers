// src/middlewares/rateLimiter.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '@/shared/logger.util';
import ApiResponse from '@/services/apiresponse.service';
import CacheUtil from '@/shared/cache.util';

// ==================== RATE LIMITER CONFIGURATIONS ====================

interface RateLimiterConfig {
    points: number;
    duration: number;
    blockDuration?: number;
}

const rateLimiterConfigs: Record<string, RateLimiterConfig> = {
    // Upload operations - strict limits
    upload: {
        points: 10, // 10 uploads
        duration: 3600, // per hour
        blockDuration: 1800 // block for 30 minutes
    },

    // Read operations - generous limits
    read: {
        points: 100, // 100 reads
        duration: 60, // per minute
        blockDuration: 60
    },

    // Update operations - moderate limits
    update: {
        points: 20, // 20 updates
        duration: 3600, // per hour
        blockDuration: 900 // block for 15 minutes
    },

    // Delete operations - moderate limits
    delete: {
        points: 15, // 15 deletes
        duration: 3600, // per hour
        blockDuration: 1800
    },

    // General API - generous limits
    general: {
        points: 1000, // 1000 requests
        duration: 900, // per 15 minutes
        blockDuration: 300
    }
};

// ==================== RATE LIMITER STATE ====================

let rateLimitersInitialized = false;

// ==================== RATE LIMITER INITIALIZATION ====================

/**
 * Initialize rate limiters
 */
export const initializeRateLimiters = async (): Promise<void> => {
    try {
        // Check if CacheUtil is available
        if (!CacheUtil.isConnected()) {
            logger.warn('⚠️ [RATE LIMITER] Redis not connected, rate limiting will use in-memory cache');
        }

        rateLimitersInitialized = true;

        logger.info('✅ [RATE LIMITER] Initialized successfully', {
            limiters: Object.keys(rateLimiterConfigs),
            cacheType: CacheUtil.isConnected() ? 'redis' : 'memory'
        });
    } catch (error: any) {
        logger.error('❌ [RATE LIMITER] Initialization failed', {
            error: error.message
        });
        throw error;
    }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate rate limit key from request
 */
export const getRateLimitKey = (req: Request, limitType: string): string => {
    // Use user ID if authenticated, otherwise IP
    const userId = (req as any).user?.id;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    const identifier = userId ? `user:${userId}` : `ip:${ip}`;
    return `ratelimit:${limitType}:${identifier}`;
};

// /**
//  * Get rate limiter by key
//  */
// export const getRateLimiter = (key: string): RateLimiterRedis => {
//     const limiter = rateLimiters.get(key);
//     if (!limiter) {
//         throw new Error(`Rate limiter '${key}' not found`);
//     }
//     return limiter;
// };

/**
 * Check and consume rate limit
 */
export const consumeRateLimit = async (
    key: string,
    config: RateLimiterConfig
): Promise<{ allowed: boolean; remaining: number; resetTime: number; retryAfter?: number }> => {
    const now = Date.now();
    const windowKey = `${key}:window`;
    const blockKey = `${key}:blocked`;

    try {
        // Check if blocked
        const blockUntil = await CacheUtil.get(blockKey);
        if (blockUntil && now < parseInt(blockUntil)) {
            const retryAfter = Math.ceil((parseInt(blockUntil) - now) / 1000);
            return {
                allowed: false,
                remaining: 0,
                resetTime: parseInt(blockUntil),
                retryAfter
            };
        }

        // Get current window data
        const windowData = await CacheUtil.get(windowKey);
        let currentCount = 0;
        let windowStart = now;

        if (windowData) {
            const parsed = JSON.parse(windowData);
            currentCount = parsed.count || 0;
            windowStart = parsed.start || now;

            // Check if window has expired
            if (now - windowStart > config.duration * 1000) {
                currentCount = 0;
                windowStart = now;
            }
        }

        // Check if limit exceeded
        if (currentCount >= config.points) {
            // Block the user
            if (config.blockDuration) {
                const blockUntilTime = now + (config.blockDuration * 1000);
                await CacheUtil.set(blockKey, blockUntilTime.toString(), config.blockDuration);
            }

            const resetTime = windowStart + (config.duration * 1000);
            const retryAfter = Math.ceil((resetTime - now) / 1000);

            return {
                allowed: false,
                remaining: 0,
                resetTime,
                retryAfter
            };
        }

        // Increment counter
        currentCount++;
        const newWindowData = {
            count: currentCount,
            start: windowStart
        };

        await CacheUtil.set(windowKey, JSON.stringify(newWindowData), config.duration);

        const resetTime = windowStart + (config.duration * 1000);
        const remaining = config.points - currentCount;

        return {
            allowed: true,
            remaining,
            resetTime
        };

    } catch (error: any) {
        logger.error('❌ [RATE LIMIT] Error checking limit', {
            error: error.message,
            key
        });

        // On error, allow the request (fail open)
        return {
            allowed: true,
            remaining: config.points,
            resetTime: now + (config.duration * 1000)
        };
    }
};

/**
 * Handle rate limit exceeded
 */
export const handleRateLimitExceeded = (
    req: Request,
    res: Response,
    retryAfter: number,
    limitType: string
): void => {
    res.setHeader('Retry-After', retryAfter);
    res.setHeader('X-RateLimit-Limit', rateLimiterConfigs[limitType].points);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', new Date(Date.now() + (retryAfter * 1000)).toISOString());

    logger.warn('⚠️ [RATE LIMIT] Exceeded', {
        limitType,
        key: getRateLimitKey(req, limitType),
        path: req.path,
        retryAfter,
        ip: req.ip
    });

    ApiResponse.rateLimit(res, retryAfter);
};

/**
 * Set rate limit headers
 */
export const setRateLimitHeaders = (
    res: Response,
    remaining: number,
    resetTime: number,
    limitType: string
): void => {
    res.setHeader('X-RateLimit-Limit', rateLimiterConfigs[limitType].points);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
};

// ==================== RATE LIMITER MIDDLEWARE ====================

/**
 * Generic rate limiter factory
 */
export const createRateLimiter = (limitType: string) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!rateLimitersInitialized) {
                logger.warn('⚠️ [RATE LIMITER] Not initialized, allowing request');
                return next();
            }

            const config = rateLimiterConfigs[limitType];
            const key = getRateLimitKey(req, limitType);

            const result = await consumeRateLimit(key, config);

            if (!result.allowed) {
                return handleRateLimitExceeded(req, res, result.retryAfter!, limitType);
            }

            setRateLimitHeaders(res, result.remaining, result.resetTime, limitType);

            if (limitType === 'upload') {
                logger.debug('✅ [RATE LIMIT] Upload allowed', {
                    key,
                    remaining: result.remaining
                });
            }

            next();
        } catch (error: any) {
            if (error instanceof Error) {
                logger.error('❌ [RATE LIMITER] Error', {
                    error: error.message,
                    path: req.path,
                    limitType
                });
            }
            // Fail open - allow request on error
            next();
        }
    };
};

/**
 * Upload rate limiter
 */
export const uploadRateLimiter = createRateLimiter('upload');

/**
 * Read rate limiter
 */
export const readRateLimiter = createRateLimiter('read');

/**
 * Update rate limiter
 */
export const updateRateLimiter = createRateLimiter('update');

/**
 * Delete rate limiter
 */
export const deleteRateLimiter = createRateLimiter('delete');

/**
 * General API rate limiter
 */
export const generalRateLimiter = createRateLimiter('general');

// ==================== UTILITY FUNCTIONS ====================

/**
 * Reset rate limit for a user/IP
 */
export const resetRateLimit = async (
    identifier: string,
    limitType: string
): Promise<void> => {
    try {
        const key = `ratelimit:${limitType}:${identifier}`;
        await CacheUtil.del(`${key}:window`);
        await CacheUtil.del(`${key}:blocked`);

        logger.info('✅ [RATE LIMIT] Reset successfully', {
            identifier,
            limitType
        });
    } catch (error: any) {
        logger.error('❌ [RATE LIMIT] Reset failed', {
            error: error.message,
            identifier,
            limitType
        });
    }
};

/**
 * Get current rate limit status
 */
export const getRateLimitStatus = async (
    identifier: string,
    limitType: string
): Promise<{ count: number; limit: number; remaining: number; resetTime: number } | null> => {
    try {
        const config = rateLimiterConfigs[limitType];
        const key = `ratelimit:${limitType}:${identifier}`;
        const windowKey = `${key}:window`;

        const windowData = await CacheUtil.get(windowKey);

        if (!windowData) {
            return {
                count: 0,
                limit: config.points,
                remaining: config.points,
                resetTime: Date.now() + (config.duration * 1000)
            };
        }

        const parsed = JSON.parse(windowData);
        const resetTime = parsed.start + (config.duration * 1000);

        return {
            count: parsed.count || 0,
            limit: config.points,
            remaining: Math.max(0, config.points - (parsed.count || 0)),
            resetTime
        };
    } catch (error: any) {
        logger.error('❌ [RATE LIMIT] Status check failed', {
            error: error.message,
            identifier,
            limitType
        });
        return null;
    }
};

export default {
    initializeRateLimiters,
    uploadRateLimiter,
    readRateLimiter,
    updateRateLimiter,
    deleteRateLimiter,
    generalRateLimiter,
    resetRateLimit,
    getRateLimitStatus
};












// // src/middlewares/rateLimiter.middleware.ts
// import { Request, Response, NextFunction } from 'express';
// import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
// import { logger } from '@/utils/logger.util';
// import ApiResponse from '@/services/apiresponse.service';
// import redisService from '@/services/redis.service';

// // ==================== RATE LIMITER CONFIGURATIONS ====================

// interface RateLimiterConfig {
//     points: number;
//     duration: number;
//     blockDuration?: number;
// }

// const rateLimiterConfigs: Record<string, RateLimiterConfig> = {
//     // Upload operations - strict limits
//     upload: {
//         points: 10, // 10 uploads
//         duration: 3600, // per hour
//         blockDuration: 1800 // block for 30 minutes
//     },

//     // Read operations - generous limits
//     read: {
//         points: 100, // 100 reads
//         duration: 60, // per minute
//         blockDuration: 60
//     },

//     // Update operations - moderate limits
//     update: {
//         points: 20, // 20 updates
//         duration: 3600, // per hour
//         blockDuration: 900 // block for 15 minutes
//     },

//     // Delete operations - moderate limits
//     delete: {
//         points: 15, // 15 deletes
//         duration: 3600, // per hour
//         blockDuration: 1800
//     },

//     // General API - generous limits
//     general: {
//         points: 1000, // 1000 requests
//         duration: 900, // per 15 minutes
//         blockDuration: 300
//     }
// };

// // ==================== RATE LIMITER INSTANCES ====================

// let rateLimiters: Map<string, RateLimiterRedis> = new Map();

// /**
//  * Initialize rate limiters
//  */
// export const initializeRateLimiters = async (): Promise<void> => {
//     try {
//         const cluster = redisService.getCluster();

//         for (const [key, config] of Object.entries(rateLimiterConfigs)) {
//             const limiter = new RateLimiterRedis({
//                 storeClient: cluster,
//                 keyPrefix: `ratelimit:banner:${key}`,
//                 points: config.points,
//                 duration: config.duration,
//                 blockDuration: config.blockDuration,
//                 insuranceLimiter: undefined // Fallback to in-memory if Redis fails
//             });

//             rateLimiters.set(key, limiter);
//         }

//         logger.info('✅ [RATE LIMITER] Initialized successfully', {
//             limiters: Array.from(rateLimiters.keys())
//         });
//     } catch (error: any) {
//         logger.error('❌ [RATE LIMITER] Initialization failed', {
//             error: error.message
//         });
//         throw error;
//     }
// };

// /**
//  * Get rate limiter by key
//  */
// export const getRateLimiter = (key: string): RateLimiterRedis => {
//     const limiter = rateLimiters.get(key);
//     if (!limiter) {
//         throw new Error(`Rate limiter '${key}' not found`);
//     }
//     return limiter;
// };

// /**
//  * Generate rate limit key from request
//  */
// export const getRateLimitKey = (req: Request): string => {
//     // Use user ID if authenticated, otherwise IP
//     const userId = (req as any).user?.id;
//     const ip = req.ip || req.socket.remoteAddress || 'unknown';

//     return userId ? `user:${userId}` : `ip:${ip}`;
// };

// /**
//  * Handle rate limit exceeded
//  */
// export const handleRateLimitExceeded = (
//     req: Request,
//     res: Response,
//     rateLimiterRes: RateLimiterRes,
//     limitType: string
// ): void => {
//     const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);

//     res.setHeader('Retry-After', retryAfter);
//     res.setHeader('X-RateLimit-Limit', rateLimiterConfigs[limitType].points);
//     res.setHeader('X-RateLimit-Remaining', 0);
//     res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());

//     logger.warn('⚠️ [RATE LIMIT] Exceeded', {
//         limitType,
//         key: getRateLimitKey(req),
//         path: req.path,
//         retryAfter,
//         ip: req.ip
//     });

//     ApiResponse.rateLimit(res, retryAfter);
// };

// /**
//  * Set rate limit headers
//  */
// export const setRateLimitHeaders = (
//     res: Response,
//     rateLimiterRes: RateLimiterRes,
//     limitType: string
// ): void => {
//     res.setHeader('X-RateLimit-Limit', rateLimiterConfigs[limitType].points);
//     res.setHeader('X-RateLimit-Remaining', rateLimiterRes.remainingPoints);
//     res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());
// };

// // ==================== RATE LIMITER MIDDLEWARE ====================

// /**
//  * Upload rate limiter
//  */
// export const uploadRateLimiter = async (
//     req: Request,
//     res: Response,
//     next: NextFunction
// ): Promise<void> => {
//     try {
//         const limiter = getRateLimiter('upload');
//         const key = getRateLimitKey(req);

//         const rateLimiterRes = await limiter.consume(key);
//         setRateLimitHeaders(res, rateLimiterRes, 'upload');

//         logger.debug('✅ [RATE LIMIT] Upload allowed', {
//             key,
//             remaining: rateLimiterRes.remainingPoints
//         });

//         next();
//     } catch (error: any) {
//         if (error instanceof Error) {
//             logger.error('❌ [RATE LIMITER] Error', {
//                 error: error.message,
//                 path: req.path
//             });
//             return next(error);
//         }

//         handleRateLimitExceeded(req, res, error as RateLimiterRes, 'upload');
//     }
// };

// /**
//  * Read rate limiter
//  */
// export const readRateLimiter = async (
//     req: Request,
//     res: Response,
//     next: NextFunction
// ): Promise<void> => {
//     try {
//         const limiter = getRateLimiter('read');
//         const key = getRateLimitKey(req);

//         const rateLimiterRes = await limiter.consume(key);
//         setRateLimitHeaders(res, rateLimiterRes, 'read');

//         next();
//     } catch (error: any) {
//         if (error instanceof Error) {
//             return next(error);
//         }
//         handleRateLimitExceeded(req, res, error as RateLimiterRes, 'read');
//     }
// };

// /**
//  * Update rate limiter
//  */
// export const updateRateLimiter = async (
//     req: Request,
//     res: Response,
//     next: NextFunction
// ): Promise<void> => {
//     try {
//         const limiter = getRateLimiter('update');
//         const key = getRateLimitKey(req);

//         const rateLimiterRes = await limiter.consume(key);
//         setRateLimitHeaders(res, rateLimiterRes, 'update');

//         next();
//     } catch (error: any) {
//         if (error instanceof Error) {
//             return next(error);
//         }
//         handleRateLimitExceeded(req, res, error as RateLimiterRes, 'update');
//     }
// };

// /**
//  * Delete rate limiter
//  */
// export const deleteRateLimiter = async (
//     req: Request,
//     res: Response,
//     next: NextFunction
// ): Promise<void> => {
//     try {
//         const limiter = getRateLimiter('delete');
//         const key = getRateLimitKey(req);

//         const rateLimiterRes = await limiter.consume(key);
//         setRateLimitHeaders(res, rateLimiterRes, 'delete');

//         next();
//     } catch (error: any) {
//         if (error instanceof Error) {
//             return next(error);
//         }
//         handleRateLimitExceeded(req, res, error as RateLimiterRes, 'delete');
//     }
// };

// /**
//  * General API rate limiter
//  */
// export const generalRateLimiter = async (
//     req: Request,
//     res: Response,
//     next: NextFunction
// ): Promise<void> => {
//     try {
//         const limiter = getRateLimiter('general');
//         const key = getRateLimitKey(req);

//         const rateLimiterRes = await limiter.consume(key);
//         setRateLimitHeaders(res, rateLimiterRes, 'general');

//         next();
//     } catch (error: any) {
//         if (error instanceof Error) {
//             return next(error);
//         }
//         handleRateLimitExceeded(req, res, error as RateLimiterRes, 'general');
//     }
// };

// export default {
//     initializeRateLimiters,
//     uploadRateLimiter,
//     readRateLimiter,
//     updateRateLimiter,
//     deleteRateLimiter,
//     generalRateLimiter
// };