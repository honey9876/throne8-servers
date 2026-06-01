/**
 * rateLimit.policies.ts
 * 5 requests per 1 minute per endpoint.
 * req.path format: "/register", "/login" etc. (without /api/v1/auth prefix)
 */

interface RateLimitPolicy {
    windowMs: number;
    maxRequests: number;
    redisPrefix: string;
    message?: string;
}

const ONE_MINUTE = 60 * 1000;

const rateLimitPolicies: Record<string, RateLimitPolicy> = {

    // ── Auth endpoints (req.path values) ──────────────────────────

    '/register': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:register',
        message: 'Too many registration attempts. Try again in 1 minute.',
    },

    '/login': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:login',
        message: 'Too many login attempts. Try again in 1 minute.',
    },

    '/refresh-token': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:refresh',
        message: 'Too many token refresh requests. Try again in 1 minute.',
    },

    '/logout': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:logout',
        message: 'Too many logout requests. Try again in 1 minute.',
    },

    '/logout-all': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:logout-all',
        message: 'Too many logout-all requests. Try again in 1 minute.',
    },

    '/profile': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:profile',
        message: 'Too many profile requests. Try again in 1 minute.',
    },

    '/update-profile': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:update-profile',
        message: 'Too many update requests. Try again in 1 minute.',
    },

    '/users': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:users',
        message: 'Too many requests. Try again in 1 minute.',
    },

    '/user-account-deactivate': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:deactivate',
        message: 'Too many deactivation requests. Try again in 1 minute.',
    },

    // ── Global fallback ────────────────────────────────────────────

    '*': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:global',
        message: 'Too many requests. Try again in 1 minute.',
    },
};

export default rateLimitPolicies;
export type { RateLimitPolicy };
















// /**
//  * rateLimit.policies.ts
//  * Professional-level endpoint-specific rate limiting policies for auth-service-phase3-kafka
//  * Defines per-endpoint rate limits
//  * Compliant with NIST 800-63B and OWASP guidelines
//  */

// interface RateLimitPolicy {
//     windowMs: number;
//     maxRequests: number;
//     redisPrefix: string;
//     lockoutDuration?: number;
// }

// export default {
//     '/auth/login': {
//         windowMs: 15 * 60 * 1000, // 15 minutes
//         maxRequests: 5,
//         redisPrefix: 'rate_limit_auth_login',
//         lockoutDuration: 30 * 60 * 1000, // 30 minutes
//     } as RateLimitPolicy,
//     '/auth/register': {
//         windowMs: 60 * 60 * 1000, // 1 hour
//         maxRequests: 3,
//         redisPrefix: 'rate_limit_auth_register',
//     } as RateLimitPolicy,
//     '/auth/mfa/verify': {
//         windowMs: 15 * 60 * 1000, // 15 minutes
//         maxRequests: 5,
//         redisPrefix: 'rate_limit_mfa_verify',
//         lockoutDuration: 15 * 60 * 1000, // 15 minutes
//     } as RateLimitPolicy,
//     '/notification/send': {
//         windowMs: 60 * 1000, // 1 minute
//         maxRequests: 10,
//         redisPrefix: 'rate_limit_notification_send',
//     } as RateLimitPolicy,
//     '/oauth/authorize': {
//         windowMs: 15 * 60 * 1000, // 15 minutes
//         maxRequests: 10,
//         redisPrefix: 'rate_limit_oauth_authorize',
//     } as RateLimitPolicy,
//     '/oauth/token': {
//         windowMs: 15 * 60 * 1000, // 15 minutes
//         maxRequests: 10,
//         redisPrefix: 'rate_limit_oauth_token',
//     } as RateLimitPolicy,
// } as Record<string, RateLimitPolicy>;