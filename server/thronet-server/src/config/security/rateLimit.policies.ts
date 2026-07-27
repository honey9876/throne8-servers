/**
 * rateLimit.policies.ts
 * Per-endpoint request limits.
 * req.path format: "/register", "/login" etc. (without /api/v1/auth prefix)
 */

interface RateLimitPolicy {
    windowMs: number;
    maxRequests: number;
    redisPrefix: string;
    message?: string;
}

const ONE_MINUTE = 60 * 1000;

const isDev = process.env.NODE_ENV !== 'production';

const rateLimitPolicies: Record<string, RateLimitPolicy> = {

    // ── Sensitive/mutation endpoints — keep these STRICT ──────────

    '/register': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:register',
        message: 'Too many registration attempts. Try again in 1 minute.',
    },

    '/login': {
        windowMs: ONE_MINUTE,
        maxRequests: 8,
        redisPrefix: 'rl:login',
        message: 'Too many login attempts. Try again in 1 minute.',
    },

    '/refresh-token': {
        // ✅ Refresh token endpoint fires often (auto token refresh on 401s
        // across many components). Kept high but still bounded.
        windowMs: ONE_MINUTE,
        maxRequests: isDev ? 100 : 30,
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

    '/update-profile': {
        // Mutation — keep strict-ish, but not so strict that a couple
        // of retries lock the user out.
        windowMs: ONE_MINUTE,
        maxRequests: 10,
        redisPrefix: 'rl:update-profile',
        message: 'Too many update requests. Try again in 1 minute.',
    },

    '/user-account-deactivate': {
        windowMs: ONE_MINUTE,
        maxRequests: 5,
        redisPrefix: 'rl:deactivate',
        message: 'Too many deactivation requests. Try again in 1 minute.',
    },

    // ── Read-heavy endpoints hit by normal page loads ──────────────
    // ✅ FIX: These were previously capped at 5-10 req/min, but a single
    // profile/dashboard page load legitimately fires many parallel GET
    // requests across multiple components (connections, posts, analytics,
    // education, experience, skills, etc). 5/min was causing normal usage
    // to trip 429s constantly. Bumped these up to realistic numbers for
    // read-only, non-sensitive data.

    '/profile': {
        windowMs: ONE_MINUTE,
        maxRequests: isDev ? 300 : 100,
        redisPrefix: 'rl:profile',
        message: 'Too many profile requests. Try again in 1 minute.',
    },

    '/users': {
        windowMs: ONE_MINUTE,
        maxRequests: isDev ? 300 : 100,
        redisPrefix: 'rl:users',
        message: 'Too many requests. Try again in 1 minute.',
    },

    // ── Global fallback ────────────────────────────────────────────
    // ✅ FIX: was 5 req/min for EVERY route not explicitly listed above
    // (connections, company, messaging, analytics, education, experience,
    // skills, activity/posts, reposts, etc. all fell into this bucket).
    // That's why almost everything was 429ing. Bumped to a sane default.
    '*': {
        windowMs: ONE_MINUTE,
        maxRequests: isDev ? 300 : 120,
        redisPrefix: 'rl:global',
        message: 'Too many requests. Try again in 1 minute.',
    },
};

export default rateLimitPolicies;
export type { RateLimitPolicy };