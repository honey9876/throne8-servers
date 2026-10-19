// src/shared/middlewares/auth.middleware.ts
/**
 * JWT Auth Middleware
 * Access token verify karta hai, blacklist check karta hai, session ka active hona
 * check karta hai (ek hi updateOne mein activity bhi update), aur req.user attach karta hai.
 * Device limit login ke time enforce hoti hai (DeviceRepository.enforceLimit).
 *
 * @module middleware/auth.middleware
 * @version 4.0.0
 */

import { Request, Response, NextFunction } from 'express';
import CacheUtil from '@/shared/cache.util';
import TokenBlacklistUtil from '@/shared/utils/tokenBlacklist.util';
import { User, Session } from '@/shared/models/index.models';
import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { getCachedAuthUser, setCachedAuthUser } from '@/shared/cache/authCache';

const BLACKLIST_PREFIX = 'blacklist:access:';

// Ye lock reasons existing sessions ko bhi block karte hain.
// "too_many_attempts" sirf naye login rokta hai (attacker ke lock se legit user logout na ho).
const HARD_LOCK_REASONS = ['admin_action', 'security_breach', 'suspicious_activity'];

interface DecodedToken {
    userId: string;
    role: string;
    sessionId?: string;
    deviceId?: string;
}

export interface ReqUser {
    id: string;
    userId: string;
    _id: string;
    isAdmin: boolean;
    region?: string;
    role: 'user' | 'admin';
    email: string;
    deviceId: string | null;
    sessionId: string | null;
}

// user field global Express.Request.user (shared/types/express/index.d.ts) se aata hai.
export interface AuthRequest extends Request {
    correlationId?: string;
}

interface AuthFailure {
    ok: false;
    status: 401 | 403 | 500;
    message: string;
}

interface AuthSuccess {
    ok: true;
    user: ReqUser;
}

const fail = (status: 401 | 403 | 500, message: string): AuthFailure => ({
    ok: false,
    status,
    message,
});

const sendFailure = (res: Response, failure: AuthFailure) => {
    if (failure.status === 401) return ResponseUtil.unauthorized(res, failure.message);
    if (failure.status === 403) return ResponseUtil.forbidden(res, failure.message);
    return ResponseUtil.error(res, failure.message, 500);
};

class AuthMiddleware {

    /**
     * Token verify karke user resolve karta hai. Response nahi bhejta;
     * caller (strict ya optional) decide karta hai.
     */
    private static async resolveUser(
        req: AuthRequest
    ): Promise<AuthSuccess | AuthFailure> {
        // Step 1: Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return fail(401, 'Authorization header required');
        }

        if (!authHeader.startsWith('Bearer ')) {
            return fail(401, 'Invalid Authorization format. Use: Bearer <token>');
        }

        const token = authHeader.split(' ')[1];

        if (!token || token === 'null' || token === 'undefined') {
            return fail(401, 'Access token is required');
        }

        // Step 2: Blacklist (logout ke baad turant)
        // Uses sha256(token) and honors BLACKLIST_LEGACY_RAW_KEYS_ENABLED migration flag
        const isBlacklisted = await TokenBlacklistUtil.isAccessTokenBlacklisted(token);
        if (isBlacklisted) {
            return fail(401, 'Token has been invalidated. Please login again.');
        }

        // Step 3: JWT verify
        let decoded: DecodedToken;
        try {
            decoded = User.verifyToken(token, 'access') as DecodedToken;
        } catch (verifyError: any) {
            logger.warn('Token verification failed', {
                error: verifyError.message,
                path: req.path,
                correlationId: req.correlationId,
            });
            return fail(401, 'Invalid or expired access token');
        }

        if (!decoded || !decoded.userId) {
            return fail(401, 'Invalid token payload');
        }

        const sessionId = decoded.sessionId || (req.headers['x-session-id'] as string | undefined);
        const now = new Date();

        // Step 4: User fetch (Redis cache with DB fallback) + session check (parallel)
        let user: any = await getCachedAuthUser(decoded.userId);
        const userPromise: Promise<any> = user
            ? Promise.resolve(user)
            : User.findOne({ userId: decoded.userId })
                .select('userId email role status accountStatus lockUntil accountLockedReason flags region')
                .lean()
                .exec()
                .then(async (dbUser) => {
                    if (dbUser) {
                        await setCachedAuthUser(decoded.userId, dbUser as any);
                    }
                    return dbUser;
                });

        const [resolvedUser, sessionResult]: [any, any] = await Promise.all([
            userPromise,
            sessionId
                ? Session.updateOne(
                    {
                        _id: sessionId,
                        userId: decoded.userId,
                        isActive: true,
                        expiresAt: { $gt: now },
                    },
                    { $set: { lastActivity: now } }
                )
                : Promise.resolve(null),
        ]);
        user = resolvedUser;

        if (!user) {
            return fail(401, 'User not found. Please login again.');
        }

        // Session ya to revoke ho chuki hai (logout, logout-all, device limit) ya expire
        if (sessionId && sessionResult && sessionResult.matchedCount === 0) {
            return fail(401, 'Session has ended. Please login again.');
        }

        // Step 5: Account state
        if (user.flags?.isDeleted || user.status !== 'active') {
            return fail(401, 'Account is not active. Please contact support.');
        }

        if (user.accountStatus && user.accountStatus !== 'active') {
            return fail(401, 'Account is not active. Please contact support.');
        }

        if (
            user.lockUntil &&
            new Date(user.lockUntil) > now &&
            HARD_LOCK_REASONS.includes(user.accountLockedReason)
        ) {
            return fail(401, 'Account is locked. Please contact support.');
        }

        // Step 6: Result
        const userRole = (user.role as 'user' | 'admin') || 'user';

        return {
            ok: true,
            user: {
                id: decoded.userId,
                _id: user._id.toString(),
                userId: decoded.userId,
                region: user.region || 'global',
                isAdmin: userRole === 'admin',
                role: userRole,
                email: user.email,
                deviceId: decoded.deviceId || (req.headers['x-device-id'] as string | undefined) || null,
                sessionId: sessionId || null,
            },
        };
    }

    private static async safeResolve(
        req: AuthRequest
    ): Promise<AuthSuccess | AuthFailure> {
        try {
            return await AuthMiddleware.resolveUser(req);
        } catch (error: any) {
            logger.error('Auth middleware unexpected error', {
                error: error.message,
                stack: error.stack,
                path: req.path,
                correlationId: req.correlationId,
            });
            return fail(500, 'Authentication error. Please try again.');
        }
    }

    /**
     * Strict authentication: fail hone par 401/403/500 response.
     */
    static async authenticate(req: AuthRequest, res: Response, next: NextFunction) {
        const result = await AuthMiddleware.safeResolve(req);

        if (!result.ok) {
            logger.warn('Authentication rejected', {
                path: req.path,
                status: result.status,
                reason: result.message,
                correlationId: req.correlationId,
            });
            return sendFailure(res, result);
        }

        req.user = result.user as Express.User;
        return next();
    }

    /**
     * Optional authentication: token valid ho to req.user set hota hai,
     * warna (missing, expired, invalid) bina user ke aage badhta hai.
     */
    static async authenticateOptional(
        req: Request,
        _res: Response,
        next: NextFunction
    ) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const result = await AuthMiddleware.safeResolve(req as AuthRequest);
        if (result.ok) {
            (req as AuthRequest).user = result.user as Express.User;
        }
        return next();
    }

    /**
     * Role-based authorization
     */
    static authorize(...allowedRoles: string[]) {
        return (req: AuthRequest, res: Response, next: NextFunction) => {
            if (!req.user) {
                return ResponseUtil.unauthorized(res, 'Authentication required');
            }

            if (!allowedRoles.includes(req.user.role)) {
                logger.warn('Authorization failed - insufficient permissions', {
                    userId: req.user.userId,
                    userRole: req.user.role,
                    requiredRoles: allowedRoles,
                });

                return ResponseUtil.forbidden(
                    res,
                    'You do not have permission to access this resource'
                );
            }

            next();
        };
    }
}

/**
 * Check if user is authenticated (passport session based)
 */
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).isAuthenticated()) {
        return next();
    }

    res.status(401).json({
        success: false,
        message: 'Please login to access this resource',
    });
};

/**
 * Check if user is not authenticated (for login/register routes)
 */
export const isNotAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).isAuthenticated()) {
        return next();
    }

    res.status(400).json({
        success: false,
        message: 'You are already logged in',
    });
};

/**
 * Raw auth token header se nikalta hai
 */
export const getAuthToken = (req: Request): string | null => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];

    if (!token || token === 'null' || token === 'undefined') {
        return null;
    }

    return token;
};

export const authenticateJWT = AuthMiddleware.authenticate;

export default AuthMiddleware;