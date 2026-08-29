/**
 * Rate‑Limit Global Configuration & Policies
 * Centralised, environment‑aware, and extensible.
 *
 * @module config/security/rateLimit.config
 * @version 3.0.0
 */

const ONE_MINUTE = 60 * 1000;
const FIFTEEN_MINUTES = 15 * ONE_MINUTE;
const ONE_HOUR = 60 * ONE_MINUTE;

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Global defaults – applied when no specific policy exists
 */
export const global = {
    windowMs: FIFTEEN_MINUTES,
    maxRequests: isDev ? 1000 : 100,
    message: 'Too many requests from this IP, please try again later.',
    redisPrefix: 'ratelimit:global',
    skipSuccessfulRequests: false,
};

/**
 * Path‑specific policies (used by `rateLimitPolicies` in middleware)
 */
export const policies = {
    // ───── AUTH ENDPOINTS ─────
    '/api/v1/auth/register': {
        windowMs: FIFTEEN_MINUTES,
        maxRequests: 5,
        message: 'Too many registration attempts',
        redisPrefix: 'ratelimit:register',
    },

    '/api/v1/auth/login': {
        windowMs: FIFTEEN_MINUTES,
        maxRequests: 10,
        message: 'Too many login attempts',
        redisPrefix: 'ratelimit:login',
    },

    '/api/v1/auth/password/reset-request': {
        windowMs: ONE_HOUR,
        maxRequests: 3,
        message: 'Too many password reset requests',
        redisPrefix: 'ratelimit:pwdreset',
    },

    // ───── VERIFICATION ENDPOINTS ─────
    '/api/v1/auth/verify-email/:token': {
        windowMs: ONE_HOUR,
        maxRequests: 5,
        message: 'Too many email verification attempts',
        redisPrefix: 'ratelimit:emailverify',
    },

    // ───── MFA ─────
    '/api/v1/auth/mfa/verify-login': {
        windowMs: FIFTEEN_MINUTES,
        maxRequests: 10,
        message: 'Too many MFA verification attempts',
        redisPrefix: 'ratelimit:mfa',
    },

    // ───── ADMIN ─────
    '/api/v1/auth/admin/*': {
        windowMs: ONE_HOUR,
        maxRequests: 200,
        message: 'Too many admin actions',
        redisPrefix: 'ratelimit:admin',
    },

    // ───── DEFAULT FALLBACK (catch‑all) ─────
    '*': global,
};

/**
 * Export a **merged** version that the middleware can read directly.
 * In production you may want to freeze this object.
 */
const rateLimitConfig = {
    global,
    policies,
};

export default Object.freeze(rateLimitConfig);