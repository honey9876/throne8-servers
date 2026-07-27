// src/middleware/auth.middleware.ts
/**
 * JWT Auth Middleware - Production-Ready for 1M+ Users
 * Verifies access token, checks blacklist, attaches user to req.user
 * Integrates device/session limits (2 active devices max)
 * 
 * @module middleware/auth.middleware
 * @version 1.0.0
 */

/** 
 * auth.middleware.ts - FIXED VERSION
 * ✅ Complete error handling
 * ✅ Token verification checks
 * ✅ Detailed error messages
 * ✅ User validation
 * 
 * @module middleware/auth.middleware
 * @version 2.0.0
 */

import { Request, Response, NextFunction } from 'express';
import CacheUtil from '@/shared/cache.util';
import { User, Device, Session } from '@/shared/models/index.models';
import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';

const BLACKLIST_PREFIX = 'blacklist:access:';

interface DecodedToken {
    userId: string;
    role: string;
    sessionId?: string;
    deviceId?: string;
}

export interface ReqUser {
    id: string;                  // ✅ Primary ID (matches global type)
    userId: string;              // ✅ Alias for backward compatibility
    _id: string;
    isAdmin: boolean;            // ✅ Required by global type
    region?: string;             // ✅ Optional region
    role: 'user' | 'admin';      // ✅ Strict type instead of string
    email: string;
    deviceId: string | null;
    sessionId: string | null;
}

export interface AuthRequest extends Request {
    user?: ReqUser;
    correlationId?: string;
}

/**
 * ✅ Enforce 2-device limit
 */
const enforceDeviceLimit = async (userId: string, deviceId: string) => {
    try {
        const activeDevices = await Device.find({ userId, isActive: true })
            .sort({ lastSeenAt: 1 })
            .limit(3);

        if (activeDevices.length > 2) {
            const oldest = activeDevices[0];
            await oldest.revoke('device_limit_exceeded');
            logger.info('Oldest device revoked', {
                userId,
                revokedDeviceId: oldest.deviceId,
                currentDeviceId: deviceId
            });
        }
    } catch (error: any) {
        logger.error('Device limit check failed (non-critical)', {
            error: error.message,
            userId
        });
    }
};

/**
 * AuthMiddleware Class
 */
class AuthMiddleware {

    // shared/middlewares/auth.middleware.ts mein ADD karo

    /**
     * Optional authentication — token hai to decode karo, nahi hai to skip karo
     * Public leaderboards ke liye — logged in users ko currentUser entry milti hai
     */
    // static optionalAuthenticate = (req: Request, res: Response, next: NextFunction) => {
    //     try {
    //         const authHeader = req.headers.authorization;

    //         if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //             // Token nahi — anonymous user, continue karo
    //             return next();
    //         }

    //         const token = authHeader.split(' ')[1];
    //         const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    //         (req as AuthRequest).user = {
    //             id: decoded.userId,
    //             email: decoded.email,
    //             role: decoded.role,
    //         };

    //         return next();
    //     } catch {
    //         // Invalid token — anonymous user treat karo, error mat do
    //         return next();
    //     }
    // };


    // In auth.middleware.ts — ADD this method
    static async authenticateOptional(req: Request, res: Response, next: NextFunction) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return next(); // no token — continue without user
            }
            // reuse your existing authenticate logic
            await AuthMiddleware.authenticate(req as any, res, next);
        } catch {
            next(); // token invalid — continue without user
        }
    };

    /**
     * ✅ FIXED: JWT Authentication with complete error handling
     */
    static async authenticate(req: AuthRequest, res: Response, next: NextFunction) {
        const correlationId = req.correlationId || 'unknown';

        try {
            // ========== STEP 1: Extract Authorization Header ==========
            const authHeader = req.headers.authorization;

            if (!authHeader) {
                logger.warn('Missing Authorization header', {
                    path: req.path,
                    correlationId
                });
                return ResponseUtil.unauthorized(res, 'Authorization header required');
            }

            if (!authHeader.startsWith('Bearer ')) {
                logger.warn('Invalid Authorization format', {
                    path: req.path,
                    authHeader: authHeader.substring(0, 20),
                    correlationId
                });
                return ResponseUtil.unauthorized(res, 'Invalid Authorization format. Use: Bearer <token>');
            }

            // ========== STEP 2: Extract Token ==========
            const token = authHeader.split(' ')[1];

            if (!token || token === 'null' || token === 'undefined') {
                logger.warn('Empty or invalid token', {
                    path: req.path,
                    correlationId
                });
                return ResponseUtil.unauthorized(res, 'Access token is required');
            }

            logger.debug('Token extracted', {
                tokenPrefix: token.substring(0, 20),
                path: req.path,
                correlationId
            });

            // ========== STEP 3: Check Blacklist ==========
            const blacklistKey = `${BLACKLIST_PREFIX}${token}`;
            const isBlacklisted = await CacheUtil.exists(blacklistKey);

            if (isBlacklisted) {
                logger.warn('Token blacklisted', {
                    tokenPrefix: token.substring(0, 20),
                    path: req.path,
                    correlationId
                });
                return ResponseUtil.unauthorized(res, 'Token has been invalidated. Please login again.');
            }

            logger.debug('Token not blacklisted', { correlationId });

            // ========== STEP 4: Verify JWT Token ==========
            let decoded: DecodedToken;
            try {
                decoded = User.verifyToken(token, 'access') as DecodedToken;

                if (!decoded) {
                    logger.warn('Token verification returned null', {
                        tokenPrefix: token.substring(0, 20),
                        correlationId
                    });
                    return ResponseUtil.unauthorized(res, 'Invalid access token');
                }

                logger.debug('Token verified successfully', {
                    userId: decoded.userId,
                    role: decoded.role,
                    correlationId
                });

            } catch (verifyError: any) {
                logger.warn('Token verification failed', {
                    error: verifyError.message,
                    name: verifyError.name,
                    tokenPrefix: token.substring(0, 20),
                    correlationId
                });

                // Specific JWT error messages
                if (verifyError.name === 'TokenExpiredError') {
                    return ResponseUtil.unauthorized(res, 'Access token has expired. Please refresh your token.');
                }

                if (verifyError.name === 'JsonWebTokenError') {
                    return ResponseUtil.unauthorized(res, 'Invalid access token format');
                }

                if (verifyError.name === 'NotBeforeError') {
                    return ResponseUtil.unauthorized(res, 'Token not yet valid');
                }

                return ResponseUtil.unauthorized(res, 'Token verification failed');
            }

            // ========== STEP 5: Validate Token Payload ==========
            if (!decoded.userId) {
                logger.error('Token missing userId', {
                    decoded: JSON.stringify(decoded),
                    correlationId
                });
                return ResponseUtil.unauthorized(res, 'Invalid token payload');
            }

            // ========== STEP 6: Fetch User from Database ==========
            let user: any;
            try {
                logger.debug('Fetching user from database', {
                    userId: decoded.userId,
                    correlationId
                });

                user = await User.findOne({ userId: decoded.userId })
                    .select('userId email role status accountStatus')
                    .lean()
                    .exec();

                if (!user) {
                    logger.warn('User not found in database', {
                        userId: decoded.userId,
                        correlationId
                    });
                    return ResponseUtil.unauthorized(res, 'User not found. Please login again.');
                }
                // ✅ FIX: removed the big console.log(═══...) block that used to
                // print here on EVERY single authenticated request. With 20-30
                // API calls firing per page load, this was producing hundreds of
                // console lines per second and tripping Railway's 500 logs/sec
                // rate limit ("Messages dropped: N"), which also adds real
                // latency to every request (console writes are synchronous I/O).
                // Structured, level-aware logging via `logger.debug` below is
                // kept — it won't print in production if the log level is set
                // above 'debug'.
                logger.debug('User fetched from database', {
                    userId: user.userId,
                    email: user.email,
                    status: user.status,
                    correlationId
                });

            } catch (dbError: any) {
                logger.error('Database query failed in auth middleware', {
                    error: dbError.message,
                    stack: dbError.stack,
                    userId: decoded.userId,
                    correlationId
                });
                return ResponseUtil.error(res, 'Authentication failed. Please try again.', 500);
            }

            // ========== STEP 7: Validate User Status ==========
            if (user.status !== 'active') {
                logger.warn('User status not active', {
                    userId: user.userId,
                    status: user.status,
                    correlationId
                });
                return ResponseUtil.forbidden(res, 'Account is not active. Please contact support.');
            }

            if (user.accountStatus === 'locked') {
                logger.warn('User account locked', {
                    userId: user.userId,
                    correlationId
                });
                return ResponseUtil.forbidden(res, 'Account is locked. Please contact support.');
            }

            if (user.accountStatus === 'suspended') {
                logger.warn('User account suspended', {
                    userId: user.userId,
                    correlationId
                });
                return ResponseUtil.forbidden(res, 'Account is suspended. Please contact support.');
            }

            // ========== STEP 8: Enforce Device Limit (Optional) ==========
            const deviceId = req.headers['x-device-id'] as string || decoded.deviceId;

            if (deviceId) {
                try {
                    await enforceDeviceLimit(decoded.userId, deviceId);

                    const device = await Device.validateDevice(deviceId);
                    if (!device) {
                        logger.warn('Device not found', {
                            deviceId,
                            userId: decoded.userId,
                            correlationId
                        });
                        return ResponseUtil.unauthorized(res, 'Device not recognized. Please login again.');
                    }

                    if (device.userId !== decoded.userId) {
                        logger.warn('Device userId mismatch', {
                            deviceId,
                            deviceUserId: device.userId,
                            tokenUserId: decoded.userId,
                            correlationId
                        });
                        return ResponseUtil.unauthorized(res, 'Device verification failed');
                    }

                    logger.debug('Device validated', {
                        deviceId,
                        userId: decoded.userId,
                        correlationId
                    });

                } catch (deviceError: any) {
                    logger.error('Device validation failed (non-critical)', {
                        error: deviceError.message,
                        deviceId,
                        correlationId
                    });
                    // Don't block - continue without device check
                }
            }

            // ========== STEP 9: Update Session Activity (Optional) ==========
            const sessionId = req.headers['x-session-id'] as string || decoded.sessionId;

            if (sessionId) {
                try {
                    await Session.updateActivity(sessionId);
                    logger.debug('Session activity updated', {
                        sessionId,
                        correlationId
                    });
                } catch (sessionError: any) {
                    logger.error('Session update failed (non-critical)', {
                        error: sessionError.message,
                        sessionId,
                        correlationId
                    });
                    // Don't block - continue
                }
            }

            // ========== STEP 10: Attach User to Request ==========
            const userRole = (user.role as 'user' | 'admin') || 'user';

            req.user = {
                id: decoded.userId,          // ✅ Matches global type
                _id: user._id.toString(),
                userId: decoded.userId,      // ✅ Backward compatibility
                region: user.region || 'global', // ✅ Default region
                isAdmin: userRole === 'admin', // ✅ Boolean flag
                role: userRole,              // ✅ Typed role
                email: user.email,
                deviceId: deviceId || null,
                sessionId: sessionId || null,
            };

            logger.debug('Auth middleware passed', {
                userId: decoded.userId,
                id: req.user.userId || decoded.userId,
                email: req.user.email,
                role: req.user.role,
                path: req.path,
                correlationId
            });

            // ✅ FIX: removed console.log('✅ User authenticated:', {...}) that
            // used to fire on every authenticated request — same log-spam
            // reason as above. logger.debug above already captures this.

            // Continue to next middleware
            next();

        } catch (error: any) {
            logger.error('Auth middleware unexpected error', {
                error: error.message,
                stack: error.stack,
                path: req.path,
                correlationId
            });

            return ResponseUtil.error(
                res,
                'Authentication error. Please try again.',
                500
            );
        }
    }

    /**
     * ✅ Optional: Role-based authorization
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
                    requiredRoles: allowedRoles
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

// middleware/auth.middleware.ts

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).isAuthenticated()) {
        return next();
    }

    res.status(401).json({
        success: false,
        message: 'Please login to access this resource'
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
        message: 'You are already logged in'
    });
};

/**
 * ✅ Extract auth token from request headers
 * Used by controllers that need the raw token (e.g., for external API calls)
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

export default AuthMiddleware;