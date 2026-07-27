/**
 * rateLimit.middleware.ts
 * Single source of truth for rate limiting.
 * - 5 req / 1 min per endpoint (configurable via policies)
 * - Tracks IP + userId independently (both must pass)
 * - Redis-backed; falls back to in-memory via CacheUtil
 * - Block lasts exactly until the 60s window expires (Redis TTL handles reset)
 */

import { Request, Response, NextFunction } from 'express';
import CacheUtil from '../cache.util';
import ResponseUtil from '../response.util';
import LoggerUtil from '../logger.util';
import rateLimitPolicies, { RateLimitPolicy } from '@/config/security/rateLimit.policies';

// ── Types ──────────────────────────────────────────────────────────────────

interface RateLimitOverride {
    maxRequests?: number;
    windowMs?: number;
    message?: string;
    redisPrefix?: string;
}
 
// ── Helper: resolve policy for current request ────────────────────────────

function resolvePolicy(path: string, override?: RateLimitOverride): RateLimitPolicy {
    // 1. Exact match on req.path (e.g. "/login")
    const matched = rateLimitPolicies[path] ?? rateLimitPolicies['*'];

    return {
        windowMs: override?.windowMs ?? matched.windowMs,
        maxRequests: override?.maxRequests ?? matched.maxRequests,
        redisPrefix: override?.redisPrefix ?? matched.redisPrefix,
        message: override?.message ?? matched.message,
    };
}

// ── Helper: increment + check ─────────────────────────────────────────────

async function checkLimit(
    key: string,
    ttlSeconds: number
): Promise<number> {
    // CacheUtil.incr sets TTL only on first call (value === 1).
    // That means the window is fixed from first request — exactly what we want.
    return CacheUtil.incr(key, ttlSeconds);
}

// ── Middleware factory ────────────────────────────────────────────────────

/**
 * Usage in routes (no inline options needed — policy auto-resolved from req.path):
 *   router.post('/login', rateLimitMiddleware(), validateLogin, AuthController.login)
 *
 * Override per-route if needed:
 *   router.post('/login', rateLimitMiddleware({ maxRequests: 3 }), ...)
 */
const rateLimitMiddleware = (override?: RateLimitOverride) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {

        const ip = (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace('::ffff:', '');
        const userId = (req as any).user?.userId ?? null;
        const path = req.path; // "/login", "/register" etc.

        const policy = resolvePolicy(path, override);
        const ttlSeconds = Math.floor(policy.windowMs / 1000); // 60
        const { redisPrefix, maxRequests, message } = policy;

        try {
            // ── Track IP and userId separately ──────────────────────────
            const ipKey = `${redisPrefix}:ip:${ip}`;
            const userKey = userId ? `${redisPrefix}:user:${userId}` : null;

            const ipCount = await checkLimit(ipKey, ttlSeconds);
            const userCount = userKey ? await checkLimit(userKey, ttlSeconds) : 0;

            // Whichever counter is higher determines blocking
            const count = Math.max(ipCount, userCount);
            const remaining = Math.max(0, maxRequests - count);

            // Remaining TTL for the Retry-After header
            const resetEpoch = Math.floor(Date.now() / 1000) + ttlSeconds;

            // ── Set headers always (even when blocked) ──────────────────
            res.set({
                'X-RateLimit-Limit': String(maxRequests),
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(resetEpoch),
            });

            if (count > maxRequests) {
                // Retry-After tells the client exactly how long to wait
                res.set('Retry-After', String(ttlSeconds));

                LoggerUtil.warn('Rate limit exceeded', {
                    ip,
                    userId,
                    path,
                    count,
                    maxRequests,
                });

                // Use an action that exists in your AuditLog schema
                // Fire-and-forget — never await in the hot path
                logRateLimitViolation(userId, ip, path, count, maxRequests);

                ResponseUtil.tooManyRequests(
                    res,
                    message ?? 'Too many requests. Please try again later.',
                    {
                        limit: maxRequests,
                        remaining: 0,
                        reset: resetEpoch,
                        retryAfter: ttlSeconds,
                    }
                );
                return; // <— important: stop the middleware chain
            }

            LoggerUtil.debug('Rate limit passed', {
                ip, userId, path, count, remaining, maxRequests,
            });

            next();

        } catch (error: any) {
            // Redis failure → fail open (let the request through)
            // Never block legitimate users because of an infra hiccup
            LoggerUtil.error('Rate limit middleware error — failing open', {
                error: error.message,
                stack: error.stack,
                ip, path,
            });
            next();
        }
    };

// ── Fire-and-forget audit log ─────────────────────────────────────────────

async function logRateLimitViolation(
    userId: string | null,
    ip: string,
    path: string,
    count: number,
    limit: number
): Promise<void> {
    try {
        // Lazy import to avoid circular deps
        const { AuditLog } = await import('@/shared/models/index.models');

        await AuditLog.logAction({
            userId: userId ?? undefined,
            // 'LOGIN_ATTEMPT_BLOCKED' exists in your schema enum
            action: path === '/login' ? 'LOGIN_ATTEMPT_BLOCKED' : 'FAILED_LOGIN_ATTEMPT',
            status: 'FAILURE',
            severity: 'HIGH',
            ipAddress: ip,
            metadata: new Map(Object.entries({ path, count, limit })),
        });
    } catch (err: any) {
        // Non-critical — never throw from here
        LoggerUtil.error('Rate limit audit log failed', { error: err.message });
    }
}

export default rateLimitMiddleware;














// /*
//  * rateLimit.middleware.ts
//  * Professional-level rate limiting middleware for auth-service-phase3-kafka
//  * Enforces rate limits using Redis
//  * Compliant with NIST 800-63B and OWASP guidelines
//  */

// import { Request, Response, NextFunction } from 'express';
// import CacheUtil from '../cache.util';
// import ResponseUtil from '../response.util';
// import LoggerUtil from '../logger.util';
// import rateLimitConfig from '@/config/security/rateLimit.config';
// import rateLimitPolicies from '@/config/security/rateLimit.policies';
// import { AuditLog } from '@/shared/models/index.models';

// interface RateLimitOptions {
//     maxRequests?: number;
//     windowMs?: number;
// }

// interface RateLimitPolicy {
//     windowMs: number;
//     maxRequests: number;
//     message?: string;  // ✅ Optional
//     redisPrefix?: string;  // ✅ Optional
// }

// const rateLimitMiddleware = (options: RateLimitOptions = {}) => async (req: Request, res: Response, next: NextFunction) => {
//     const ipAddress = req.ip;
//     const userId = (req as any).user?.userId || null;
//     const path = req.path;

//     try {
//         const policy: RateLimitPolicy = rateLimitPolicies[path] || options || rateLimitConfig.global;
//         const prefix = policy.redisPrefix || 'ratelimit';
//         const key = `${prefix}:${userId || ipAddress}`;

//         const requests = await CacheUtil.incr(key, policy.windowMs / 1000);

//         if (requests > policy.maxRequests) {
//             // Log rate limit violation
//             try {
//                 await AuditLog.logAction({
//                     userId,
//                     action: 'RATE_LIMIT_EXCEEDED',
//                     status: 'FAILURE',
//                     severity: 'HIGH',
//                     ipAddress,
//                     metadata: new Map(Object.entries({ path, requests, limit: policy.maxRequests })),
//                 });
//             } catch (auditError: any) {
//                 LoggerUtil.error('Audit log creation failed', { error: auditError.message });
//             }

//             // ✅ FIXED: Use tooManyRequests method with proper signature
//             return ResponseUtil.tooManyRequests(
//                 res,
//                 'Too many requests. Please try again later.',
//                 {
//                     limit: policy.maxRequests,
//                     remaining: 0,
//                     reset: Math.floor(Date.now() / 1000 + policy.windowMs / 1000),
//                     retryAfter: Math.floor(policy.windowMs / 1000)
//                 }
//             );
//         }

//         // Set rate limit headers
//         res.set({
//             'X-RateLimit-Limit': policy.maxRequests.toString(),
//             'X-RateLimit-Remaining': Math.max(0, policy.maxRequests - requests).toString(),
//             'X-RateLimit-Reset': Math.floor(Date.now() / 1000 + policy.windowMs / 1000).toString(),
//         });

//         LoggerUtil.info('Rate limit passed', { userId, ipAddress, requests, limit: policy.maxRequests });
//         next();
//     } catch (error: any) {
//         LoggerUtil.error('Rate limit error', { error: error.message, stack: error.stack });
//         // ✅ FIXED: Use internalError method
//         return ResponseUtil.internalError(res, 'Internal server error');
//     }
// };



// export default rateLimitMiddleware;













// // /*
// //  * rateLimit.middleware.ts
// //  * Professional-level rate limiting middleware for auth-service-phase3-kafka
// //  * Enforces rate limits using Redis
// //  * Compliant with NIST 800-63B and OWASP guidelines
// //  */

// // import { Request, Response, NextFunction } from 'express';
// // import CacheUtil from '../utils/cache.util.js';
// // import ResponseUtil from '../utils/response.util.js';
// // import LoggerUtil from '../utils/logger.util.js';
// // import rateLimitConfig from '../config/security/rateLimit.config.js';
// // import rateLimitPolicies from '../config/security/rateLimit.policies.js';
// // import { AuditLog } from '../models/index.js';

// // interface RateLimitOptions {
// //     maxRequests?: number;
// //     windowMs?: number;
// // }

// // interface RateLimitPolicy {
// //     windowMs: number;
// //     maxRequests: number;
// //     message?: string;
// //     redisPrefix?: string;
// // }

// // const rateLimitMiddleware = (options: RateLimitOptions = {}) => async (req: Request, res: Response, next: NextFunction) => {
// //     const ipAddress = req.ip;
// //     const userId = (req as any).user?.userId || null;
// //     const path = req.path;

// //     try {
// //         const policy: RateLimitPolicy = rateLimitPolicies[path] || options || rateLimitConfig.global;
// //         const prefix = policy.redisPrefix || 'ratelimit';
// //         const key = `${prefix}:${userId || ipAddress}`;

// //         const requests = await CacheUtil.incr(key, policy.windowMs / 1000);

// //         if (requests > policy.maxRequests) {
// //             // Log rate limit violation
// //             try {
// //                 await AuditLog.logAction({
// //                     userId,
// //                     action: 'RATE_LIMIT_EXCEEDED',
// //                     status: 'FAILURE',
// //                     severity: 'HIGH',
// //                     ipAddress,
// //                     metadata: new Map(Object.entries({ path, requests, limit: policy.maxRequests })),
// //                 });
// //             } catch (auditError: any) {
// //                 LoggerUtil.error('Audit log creation failed', { error: auditError.message });
// //             }

// //             // ✅ FIXED: Correct ResponseUtil usage
// //             return ResponseUtil.error(
// //                 res,
// //                 429,
// //                 'Too many requests. Please try again later.',
// //                 ['Rate limit exceeded']
// //             );
// //         }

// //         // Set rate limit headers
// //         res.set({
// //             'X-RateLimit-Limit': policy.maxRequests.toString(),
// //             'X-RateLimit-Remaining': Math.max(0, policy.maxRequests - requests).toString(),
// //             'X-RateLimit-Reset': Math.floor(Date.now() / 1000 + policy.windowMs / 1000).toString(),
// //         });

// //         LoggerUtil.info('Rate limit passed', { userId, ipAddress, requests, limit: policy.maxRequests });
// //         next();
// //     } catch (error: any) {
// //         LoggerUtil.error('Rate limit error', { error: error.message, stack: error.stack });
// //         // ✅ FIXED: Correct error response
// //         return ResponseUtil.error(res, 500, 'Internal server error');
// //     }
// // };

// // export default rateLimitMiddleware;