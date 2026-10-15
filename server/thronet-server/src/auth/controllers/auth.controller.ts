// ../controllers/auth.controller.ts
/**
 * auth.controller.ts
 * Authentication controllers: register, login, refresh (DB rotation), logout, profile.
 *
 * @module controllers/auth.controller
 * @version 4.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import ResponseUtil from '@/shared/response.util';

import ValidatorUtil from '@/shared/utils/validator.util';
import LoggerUtil from '@/shared/logger.util';
import CacheUtil from '@/shared/cache.util';
import Constants from '@/shared/constants.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { User, AuditLog, Session } from '@/shared/models/index.models';
import { AuthService } from '@/shared/services/index.service';
import { GetAllUsersParams } from '../interfaces/auth.interfaces';
import { AuthCacheRepository } from '../repository/auth.repository';
import {
    duplicateKeyConflict,
    normalizeEmail,
    normalizePhone,
    phoneLookupVariants,
    RegistrationConflictError,
} from '../utils/registrationIdentity';

// ==================== CONSTANTS ====================

// JWT config (User.model JWT_CONFIG) se match hona chahiye
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_GRACE_MS = 60 * 1000;

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    sessionId: string;
    deviceId: string;
}

interface DeviceData {
    deviceType: string;
    deviceName: string;
    os: string;
    browser: string;
    userAgent: string;
    ipAddress: string;
}

interface RegisterBody {
    email: string;
    password: string;
    confirmPassword: string;
    firstName: string;
    lastName?: string;
    location: string;
    phoneNumber: string;
    currentPosition?: string;
    company?: string;
    education?: string;
    pronouns?: string;
    userType: 'working' | 'student' | 'fresher';
    jobTitle?: string;
    companyName?: string;
    startDate?: string;
    endDate?: string;
    collegeName?: string;
    degree?: string;
    fieldOfStudy?: string;
    graduationYear?: string;
    highestEducation?: string;
    preferredRole?: string;
    cgpa?: string;
    deviceType?: string;
    deviceName?: string;
    os?: string;
    browser?: string;
}

interface LoginBody {
    email: string;
    password: string;
    rememberMe?: boolean;
    deviceType?: string;
    deviceName?: string;
    os?: string;
    browser?: string;
}

interface UpdateProfileBody {
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
    location?: string;
    currentPosition?: string;
    company?: string;
    education?: string;
    pronouns?: string;
    onboarding?: {
        userType?: 'working' | 'student' | 'fresher';
        workingProfile?: {
            jobTitle?: string;
            companyName?: string;
            startDate?: string;
            endDate?: string;
        };
        studentProfile?: {
            collegeName?: string;
            degree?: string;
            fieldOfStudy?: string;
            graduationYear?: string;
        };
        fresherProfile?: {
            highestEducation?: string;
            preferredRole?: string;
            cgpa?: string;
        };
    };
    preferences?: Record<string, any>;
}

interface DeactivateBody {
    reason?: string;
    confirmation: string;
}

interface DeleteBody {
    reason: string;
    confirmation: string;
}

// ==================== HELPERS ====================

/**
 * Kafka audit event: fire-and-forget. KAFKA_ENABLED=false par skip.
 */
const sendAudit = (event: Record<string, any>): void => {
    if (process.env['KAFKA_ENABLED'] === 'false') return;
    try {
        Promise.resolve(AuditProducer.sendAuditEvent(event as any)).catch((err: any) =>
            LoggerUtil.warn('Audit event failed (non-critical)', { error: err?.message })
        );
    } catch (err: any) {
        LoggerUtil.warn('Audit event failed (non-critical)', { error: err?.message });
    }
};

/**
 * Mongo AuditLog: fire-and-forget. Fail hone par kabhi request ko nahi todta.
 */
const logAuditSafe = (data: Record<string, any>): void => {
    try {
        Promise.resolve(AuditLog.logAction(data as any)).catch((err: any) =>
            LoggerUtil.error('Audit log write failed (non-critical)', { error: err?.message })
        );
    } catch (err: any) {
        LoggerUtil.error('Audit log write failed (non-critical)', { error: err?.message });
    }
};

const buildTokensResponse = (accessToken: string, refreshToken: string) => ({
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
    refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
});

/**
 * Refresh JWT ka hash session mein save karo (rotation/reuse detection ke liye).
 * Fail hua to bhi login nahi tootta: pehli refresh par session bootstrap ho jati hai.
 */
const saveRefreshTokenHash = async (
    sessionId: string,
    refreshToken: string,
    correlationId: string
): Promise<void> => {
    try {
        await Session.setRefreshToken(sessionId, refreshToken);
    } catch (err: any) {
        LoggerUtil.error('Saving refresh token hash failed (non-critical)', {
            error: err.message,
            sessionId,
            correlationId,
        });
    }
};

// ==================== AUTH CONTROLLER CLASS ====================

class AuthController {

    // ==================== USER REGISTRATION ====================

    static async checkAvailability(req: Request, res: Response): Promise<void> {
        const { field, value } = req.body || {};
        if ((field !== 'email' && field !== 'phone') || typeof value !== 'string' || !value.trim()) {
            ResponseUtil.badRequest(res, 'Availability field and value are required');
            return;
        }

        try {
            let existing;
            if (field === 'email') {
                const email = normalizeEmail(value);
                if (!ValidatorUtil.validateEmail(email).isValid) {
                    ResponseUtil.validationError(
                        res,
                        ['Enter a valid email address'],
                        'Availability validation failed',
                        [{ field: 'email', message: 'Enter a valid email address' }]
                    );
                    return;
                }
                existing = await User.findOne({ email })
                    .collation({ locale: 'en', strength: 2 })
                    .select('_id')
                    .lean()
                    .exec();
            } else {
                let phone: string;
                try {
                    phone = normalizePhone(value);
                } catch {
                    ResponseUtil.validationError(
                        res,
                        ['Enter a valid phone number'],
                        'Availability validation failed',
                        [{ field: 'phoneNumber', message: 'Enter a valid phone number' }]
                    );
                    return;
                }
                existing = await User.findOne({
                    phoneNumber: { $in: phoneLookupVariants(phone) },
                }).select('_id').lean().exec();
            }

            res.status(200).json({ available: !existing });
        } catch (error: any) {
            LoggerUtil.error('Registration availability check failed', {
                error: error?.message,
                field,
            });
            ResponseUtil.internalError(res, 'Availability check failed. Please try again.', error);
        }
    }

    /**
     * POST /api/v1/auth/register
     */
    static async register(req: Request<{}, any, RegisterBody>, res: Response): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const data = req.body;
            const normalizedEmail = normalizeEmail(data.email);
            const normalizedPhone = normalizePhone(data.phoneNumber);

            const ipAddress = req.ip || (req as any).connection?.remoteAddress || '0.0.0.0';
            const userAgent = (req.headers['user-agent'] as string) || 'Unknown';

            const deviceData: DeviceData = {
                deviceType: req.body.deviceType || 'desktop',
                deviceName: req.body.deviceName || 'Unknown Device',
                os: req.body.os || 'Unknown',
                browser: req.body.browser || 'Unknown',
                userAgent,
                ipAddress,
            };

            LoggerUtil.info('Registration attempt started', { ipAddress, correlationId });

            // Step 3: Register via AuthService
            const result = await AuthService.register(
                normalizedEmail,
                data.password,
                {
                    firstName: data.firstName,
                    lastName: data.lastName,
                    location: data.location,
                    phoneNumber: normalizedPhone,
                    userType: data.userType,
                    jobTitle: data.jobTitle,
                    companyName: data.companyName,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    collegeName: data.collegeName,
                    degree: data.degree,
                    fieldOfStudy: data.fieldOfStudy,
                    graduationYear: data.graduationYear,
                    highestEducation: data.highestEducation,
                    preferredRole: data.preferredRole,
                    cgpa: data.cgpa,
                },
                deviceData
            );

            LoggerUtil.info('AuthService.register successful', {
                userId: result.userId,
                sessionId: result.sessionId,
                deviceId: result.deviceId,
                correlationId,
            });

            // Step 4: Tokens
            const payload: UserPayload = {
                userId: result.userId,
                role: result.role || 'user',
                sessionId: result.sessionId,
                deviceId: result.deviceId,
            };

            const accessToken = User.generateAccessToken(payload);
            const refreshToken = User.generateRefreshToken(payload);

            await saveRefreshTokenHash(result.sessionId, refreshToken, correlationId);

            // Step 5: Cache session and user data
            try {
                await CacheUtil.set(
                    `${Constants.CACHE_PREFIXES.SESSION}${result.sessionId}`,
                    {
                        userId: result.userId,
                        email: normalizedEmail,
                        sessionId: result.sessionId,
                        ipAddress,
                        createdAt: new Date().toISOString(),
                    },
                    Constants.CACHE_TTLS.SESSION
                );

                await AuthCacheRepository.setLoginSessionUser(
                    result.userId,
                    {
                        userId: result.userId,
                        email: normalizedEmail,
                        firstName: data.firstName,
                        lastName: data.lastName,
                        role: result.role || 'user',
                    },
                    Constants.CACHE_TTLS.USER
                );

                await CacheUtil.set(
                    `access_token:${accessToken}`,
                    { ...payload, ipAddress, userAgent },
                    ACCESS_TOKEN_TTL_SECONDS
                );
            } catch (cacheError: any) {
                LoggerUtil.error('Cache update failed (non-critical)', {
                    error: cacheError.message,
                    userId: result.userId,
                    correlationId,
                });
            }

            // Step 6: Audit (non-blocking)
            sendAudit({
                eventId: uuidv4(),
                userId: result.userId,
                action: Constants.AUDIT_ACTIONS.USER_REGISTERED,
                ipAddress,
                status: 'SUCCESS',
                severity: 'LOW',
                timestamp: new Date().toISOString(),
                metadata: {
                    firstName: data.firstName,
                    location: data.location,
                    userType: data.userType,
                    hasPhoneNumber: !!data.phoneNumber,
                    registrationMethod: 'local',
                    correlationId,
                    duration: Date.now() - startTime,
                },
            });

            const duration = Date.now() - startTime;
            LoggerUtil.performance('user_registration', duration, {
                userId: result.userId,
                correlationId,
            });

            ResponseUtil.created(res, {
                user: {
                    userId: result.userId,
                    email: normalizedEmail,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    role: result.role || 'user',
                },
                tokens: buildTokensResponse(accessToken, refreshToken),
            }, 'Registration successful');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            const conflict = error instanceof RegistrationConflictError
                ? error
                : duplicateKeyConflict(error);
            if (conflict) {
                ResponseUtil.conflict(
                    res,
                    'Registration conflicts with an existing account',
                    conflict.fieldErrors.map((fieldError) => fieldError.message),
                    conflict.fieldErrors
                );
                return;
            }

            LoggerUtil.error('Registration failed', {
                error: error.message,
                stack: error.stack,
                ipAddress: req.ip,
                duration,
                correlationId,
            });

            sendAudit({
                eventId: uuidv4(),
                userId: null,
                action: 'REGISTRATION_ERROR',
                ipAddress: req.ip || '0.0.0.0',
                status: 'ERROR',
                severity: 'HIGH',
                timestamp: new Date().toISOString(),
                metadata: {
                    error: error.message,
                    endpoint: '/api/v1/auth/register',
                    correlationId,
                },
            });

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Registration failed. Please try again.'
                    : error.message,
                error
            );
            return;
        }
    }

    // ==================== USER LOGIN ====================

    /**
     * POST /api/v1/auth/login
     */
    static async login(req: Request<{}, any, LoginBody>, res: Response): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { email, password, rememberMe } = req.body;
            const ipAddress = req.ip || '0.0.0.0';
            const userAgent = (req.headers['user-agent'] as string) || 'Unknown';

            const deviceData: DeviceData = {
                deviceType: req.body.deviceType || 'desktop',
                deviceName: req.body.deviceName || 'Unknown Device',
                os: req.body.os || 'Unknown',
                browser: req.body.browser || 'Unknown',
                userAgent,
                ipAddress,
            };

            LoggerUtil.info('Login attempt started', {
                email,
                ipAddress,
                rememberMe: !!rememberMe,
                correlationId,
            });

            // Step 1: Validate input
            const validation: ValidationResult = await ValidatorUtil.validateLogin(
                { email, password, rememberMe },
                ipAddress
            );

            if (!validation.isValid) {
                logAuditSafe({
                    userId: 'unknown',
                    userEmail: email,
                    action: 'LOGIN_FAILED',
                    ipAddress,
                    userAgent,
                    status: 'FAILURE',
                    severity: 'MEDIUM',
                    metadata: new Map<string, any>(Object.entries({
                        reason: 'validation_failed',
                        correlationId,
                    })),
                });
                ResponseUtil.validationError(res, validation.errors || [], 'Validation failed');
                return;
            }

            // Step 2: Authenticate (IP check, user fetch, status, rate limit, password,
            // device, session: sab AuthService.login ke andar)
            const result = await AuthService.login(
                validation.data!.email,
                validation.data!.password,
                ipAddress,
                deviceData
            );

            LoggerUtil.info('AuthService.login successful', {
                userId: result.userId,
                sessionId: result.sessionId,
                deviceId: result.deviceId,
                correlationId,
            });

            // Step 3: Tokens
            const payload: UserPayload = {
                userId: result.userId,
                role: result.role || 'user',
                sessionId: result.sessionId,
                deviceId: result.deviceId,
            };

            const accessToken = User.generateAccessToken(payload);
            const refreshToken = User.generateRefreshToken(payload);

            await saveRefreshTokenHash(result.sessionId, refreshToken, correlationId);

            // Step 4: Cache writes (parallel)
            try {
                const sessionTTL = rememberMe
                    ? Constants.CACHE_TTLS.SESSION_LONG
                    : Constants.CACHE_TTLS.SESSION;

                await Promise.all([
                    CacheUtil.set(
                        `${Constants.CACHE_PREFIXES.SESSION}${result.sessionId}`,
                        {
                            userId: result.userId,
                            sessionId: result.sessionId,
                            ipAddress,
                        },
                        sessionTTL
                    ),
                    AuthCacheRepository.setLoginSessionUser(
                        result.userId,
                        {
                            userId: result.userId,
                            email: result.email,
                            firstName: result.firstName,
                            lastName: result.lastName,
                            profilePhotoId: result.profilePhotoId,
                            headlineId: result.headlineId,
                            role: result.role || 'user',
                        },
                        Constants.CACHE_TTLS.USER
                    ),
                    CacheUtil.set(
                        `access_token:${accessToken}`,
                        { ...payload, ipAddress, userAgent },
                        ACCESS_TOKEN_TTL_SECONDS
                    ),
                ]);
            } catch (cacheError: any) {
                LoggerUtil.error('Cache update failed (non-critical)', {
                    error: cacheError.message,
                    userId: result.userId,
                    correlationId,
                });
            }

            // Step 5: Success audit (non-blocking)
            logAuditSafe({
                userId: result.userId,
                userEmail: result.email,
                action: 'LOGIN_SUCCESS',
                ipAddress,
                userAgent,
                sessionId: result.sessionId,
                status: 'SUCCESS',
                severity: 'LOW',
                metadata: new Map<string, any>(Object.entries({
                    rememberMe: !!rememberMe,
                    tokenType: 'JWT',
                    correlationId,
                    duration: Date.now() - startTime,
                })),
            });

            const duration = Date.now() - startTime;
            LoggerUtil.performance('user_login', duration, {
                userId: result.userId,
                correlationId,
            });

            ResponseUtil.success(res, {
                user: {
                    userId: result.userId,
                    email: result.email,
                    role: result.role || 'user',
                },
                tokens: buildTokensResponse(accessToken, refreshToken),
            }, 'Welcome To Throne8', 200);
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Login failed', {
                error: error.message,
                ipAddress: req.ip,
                duration,
                correlationId,
            });

            // Audit fire-and-forget: audit fail hone par login ka 401 kabhi 500 nahi banega
            logAuditSafe({
                userId: 'unknown',
                userEmail: req.body?.email,
                action: 'LOGIN_FAILED',
                ipAddress: req.ip || '0.0.0.0',
                userAgent: (req.headers['user-agent'] as string) || 'Unknown',
                status: 'FAILURE',
                severity: 'MEDIUM',
                metadata: new Map<string, any>(Object.entries({
                    reason: error.message,
                    correlationId,
                })),
            });

            const message: string = String(error?.message || '');
            const lower = message.toLowerCase();

            if (
                lower.includes('account locked') ||
                lower.includes('failed attempts') ||
                lower.includes('too many attempts')
            ) {
                ResponseUtil.tooManyRequests(
                    res,
                    'Too many failed login attempts. Please try again in 15 minutes.',
                    { retryAfter: 900 }
                );
                return;
            }

            if (
                lower.includes('disabled') ||
                lower.includes('suspended') ||
                lower.includes('not active') ||
                lower.includes('contact support')
            ) {
                ResponseUtil.forbidden(
                    res,
                    'Your account is not active. Please contact support.'
                );
                return;
            }

            if (
                lower.includes('unable to retrieve user data') ||
                lower.includes('user data not found')
            ) {
                ResponseUtil.error(
                    res,
                    'An error occurred during login. Please try again.',
                    500
                );
                return;
            }

            ResponseUtil.unauthorized(res, 'Invalid email or password');
            return;
        }
    }

    // ==================== REFRESH TOKEN (DB ROTATION) ====================

    /**
     * POST /api/v1/auth/refresh-token
     * Session ke andar stored hash se rotation + reuse detection.
     */
    static async refreshToken(req: Request, res: Response): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { refreshToken } = req.body || {};

            if (!refreshToken || typeof refreshToken !== 'string') {
                ResponseUtil.badRequest(res, 'Refresh token is required');
                return;
            }

            // Step 1: JWT verify
            let decoded: any;
            try {
                decoded = User.verifyToken(refreshToken, 'refresh');
            } catch (error: any) {
                LoggerUtil.warn('Invalid refresh token', { error: error.message, correlationId });
                ResponseUtil.unauthorized(res, 'Invalid or expired refresh token');
                return;
            }

            // Session ke bina bane purane tokens ab accept nahi hote
            if (!decoded?.userId || !decoded?.sessionId) {
                ResponseUtil.unauthorized(res, 'Session not found. Please login again.');
                return;
            }

            // Step 2: User validate
            const user: any = await User.findOne({ userId: decoded.userId })
                .select('userId email role status accountStatus flags')
                .lean();

            if (
                !user ||
                user.status !== 'active' ||
                user.flags?.isDeleted ||
                (user.accountStatus && user.accountStatus !== 'active')
            ) {
                LoggerUtil.warn('User not found or inactive during refresh', {
                    userId: decoded.userId,
                    correlationId,
                });
                ResponseUtil.unauthorized(res, 'User account not found or inactive');
                return;
            }

            // Step 3: Naye tokens + atomic rotation
            const newPayload: UserPayload = {
                userId: user.userId,
                role: user.role || 'user',
                sessionId: decoded.sessionId,
                deviceId: decoded.deviceId,
            };

            const newAccessToken = User.generateAccessToken(newPayload);
            const newRefreshToken = User.generateRefreshToken(newPayload);

            const rotation = await Session.rotateRefreshToken({
                sessionId: decoded.sessionId,
                userId: decoded.userId,
                presentedToken: refreshToken,
                newToken: newRefreshToken,
                graceMs: REFRESH_GRACE_MS,
            });

            if (!rotation.ok) {
                if (rotation.reason === 'reuse') {
                    LoggerUtil.error('SECURITY ALERT: refresh token reuse detected, session revoked', {
                        userId: decoded.userId,
                        sessionId: decoded.sessionId,
                        correlationId,
                    });

                    sendAudit({
                        eventId: uuidv4(),
                        userId: decoded.userId,
                        action: 'REFRESH_TOKEN_REUSE_DETECTED',
                        ipAddress: req.ip || '0.0.0.0',
                        status: 'FAILURE',
                        severity: 'HIGH',
                        timestamp: new Date().toISOString(),
                        metadata: { sessionId: decoded.sessionId, correlationId },
                    });

                    ResponseUtil.unauthorized(
                        res,
                        'Your session was ended for security reasons. Please login again.'
                    );
                    return;
                }

                if (rotation.reason === 'conflict') {
                    ResponseUtil.error(res, 'Please retry', 409);
                    return;
                }

                LoggerUtil.warn('Refresh rejected', {
                    reason: rotation.reason,
                    sessionId: decoded.sessionId,
                    correlationId,
                });
                ResponseUtil.unauthorized(res, 'Session has been terminated');
                return;
            }

            // Step 4: Cache (non-critical)
            try {
                await CacheUtil.set(
                    `access_token:${newAccessToken}`,
                    {
                        ...newPayload,
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent'],
                    },
                    ACCESS_TOKEN_TTL_SECONDS
                );
            } catch (cacheError: any) {
                LoggerUtil.warn('Token cache failed (non-critical)', {
                    error: cacheError.message,
                    correlationId,
                });
            }

            // Step 5: Audit (non-blocking)
            logAuditSafe({
                userId: user.userId,
                userEmail: user.email,
                action: 'TOKEN_REFRESH_SUCCESS',
                ipAddress: req.ip || '0.0.0.0',
                userAgent: req.headers['user-agent'] as string,
                status: 'SUCCESS',
                severity: 'LOW',
                metadata: new Map<string, any>([
                    ['sessionId', decoded.sessionId],
                    ['graceUsed', String(rotation.graceUsed)],
                    ['correlationId', correlationId],
                ]),
            });

            LoggerUtil.info('Token refreshed successfully', {
                userId: user.userId,
                graceUsed: rotation.graceUsed,
                duration: Date.now() - startTime,
                correlationId,
            });

            ResponseUtil.success(
                res,
                { tokens: buildTokensResponse(newAccessToken, newRefreshToken) },
                'Token refreshed successfully',
                200
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Token refresh failed', {
                error: error.message,
                stack: error.stack,
                duration: Date.now() - startTime,
                correlationId,
            });

            // 500: frontend isse logout nahi karta (sirf 400/401/403 par karta hai)
            ResponseUtil.internalError(
                res,
                'Token refresh failed. Please try again.',
                error
            );
            return;
        }
    }

    // ==================== GET USER PROFILE (SELF) ====================

    /**
     * GET /api/v1/auth/profile
     */
    static async getUserProfile(req: Request & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const ipAddress = req.ip || 'unknown';

        try {
            if (!userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const includeStats = req.query.includeStats === 'true';
            const includeSessions = req.query.includeSessions === 'true';

            const profile = await AuthService.getUserProfile(userId, {
                includeStats,
                includeSessions,
            });

            sendAudit({
                eventId: uuidv4(),
                userId,
                action: 'PROFILE_VIEWED',
                ipAddress,
                status: 'SUCCESS',
                severity: 'LOW',
                timestamp: new Date().toISOString(),
                metadata: { correlationId },
            });

            ResponseUtil.success(res, profile, 'Profile fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get profile failed', {
                error: error.message,
                userId,
                correlationId,
            });

            ResponseUtil.error(res, error.message || 'Failed to fetch profile', 500);
            return;
        }
    }

    // ==================== GET USER BY ID ====================

    /**
     * GET /api/v1/auth/get-user/:userId
     * Self ya admin ko full profile, baaki sabko sirf public profile.
     * Route par authenticateOptional lagi honi chahiye.
     */
    static async getUserById(req: Request, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const { userId } = req.params;
        const viewer = (req as any).user as UserPayload | undefined;

        try {
            if (!userId) {
                ResponseUtil.badRequest(res, 'User ID is required');
                return;
            }

            if (!UUID_REGEX.test(userId)) {
                ResponseUtil.badRequest(res, 'Invalid user ID format');
                return;
            }

            const includeStats = req.query.includeStats === 'true';
            const includeSessions = req.query.includeSessions === 'true';

            const isSelfOrAdmin =
                !!viewer && (viewer.userId === userId || viewer.role === 'admin');

            const user = isSelfOrAdmin
                ? await AuthService.getUserProfile(userId, { includeStats, includeSessions })
                : await AuthService.getUserById(userId, {});

            sendAudit({
                eventId: uuidv4(),
                userId: viewer?.userId || null,
                action: 'USER_VIEWED_BY_ID',
                ipAddress: req.ip || 'unknown',
                status: 'SUCCESS',
                severity: 'LOW',
                timestamp: new Date().toISOString(),
                metadata: {
                    viewedUserId: userId,
                    fullProfile: isSelfOrAdmin,
                    correlationId,
                },
            });

            ResponseUtil.success(res, user, 'User fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get user by ID failed', {
                error: error.message,
                stack: error.stack,
                userId,
                correlationId,
            });

            if (error.message === 'Invalid user ID format') {
                ResponseUtil.badRequest(res, 'Invalid user ID format');
                return;
            }

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            if (error.message === 'User account is not active') {
                ResponseUtil.forbidden(res, 'User account is not active');
                return;
            }

            ResponseUtil.error(res, error.message || 'Failed to fetch user', 500);
            return;
        }
    }

    // ==================== GET USERS BULK (PUBLIC FIELDS) ====================

    /**
     * POST /api/v1/auth/get-users-bulk (route par authenticate zaroori)
     */
    static async getUsersBulk(req: Request, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const viewer = (req as any).user as UserPayload | undefined;
        const { userIds } = req.body || {};

        try {
            if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
                ResponseUtil.badRequest(res, 'userIds must be a non-empty array');
                return;
            }

            if (userIds.length > 100) {
                ResponseUtil.badRequest(res, 'Cannot request more than 100 userIds at once');
                return;
            }

            const users = await AuthService.getUsersByIds(userIds);

            sendAudit({
                eventId: uuidv4(),
                userId: viewer?.userId || null,
                action: 'USERS_VIEWED_BULK',
                ipAddress: req.ip || 'unknown',
                status: 'SUCCESS',
                severity: 'LOW',
                timestamp: new Date().toISOString(),
                metadata: { requested: userIds.length, found: users.length, correlationId },
            });

            ResponseUtil.success(res, { users }, 'Users fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get users bulk failed', {
                error: error.message,
                stack: error.stack,
                correlationId,
            });
            ResponseUtil.error(res, error.message || 'Failed to fetch users', 500);
            return;
        }
    }

    // ==================== GET ALL USERS (ADMIN ONLY) ====================

    /**
     * GET /api/v1/auth/users
     * Query: page, limit, status, role, userType, location, search, sortBy
     */
    static async getAllUsers(req: Request & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const userRole = req.user?.role;

        try {
            if (!userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            // Defense in depth: route par authorize('admin') ke saath yahan bhi check
            if (userRole !== 'admin') {
                LoggerUtil.warn('Non-admin tried to list users', { userId, userRole, correlationId });
                ResponseUtil.forbidden(res, 'Admin privileges required');
                return;
            }

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            const filters: any = {
                status: req.query.status,
                role: req.query.role,
                userType: req.query.userType,
                location: req.query.location,
                search: req.query.search as string,
            };

            const sortBy = (req.query.sortBy as GetAllUsersParams['sortBy']) || 'newest';

            LoggerUtil.info('Admin fetching all users', {
                userId,
                page,
                limit,
                filters: Object.entries(filters)
                    .filter(([_, v]) => v !== undefined)
                    .map(([k]) => k),
                sortBy,
                correlationId,
            });

            const result = await AuthService.getAllUsers({
                page,
                limit,
                skip,
                filters,
                sortBy,
            });

            sendAudit({
                eventId: uuidv4(),
                userId,
                action: 'ADMIN_VIEW_ALL_USERS',
                ipAddress: req.ip || 'unknown',
                status: 'SUCCESS',
                severity: 'LOW',
                timestamp: new Date().toISOString(),
                metadata: { page, limit, totalUsers: result.total, correlationId },
            });

            ResponseUtil.success(
                res,
                {
                    users: result.users,
                    pagination: {
                        currentPage: page,
                        totalPages: result.totalPages,
                        totalUsers: result.total,
                        limit,
                        hasNextPage: page < result.totalPages,
                        hasPrevPage: page > 1,
                    },
                    filters: Object.entries(filters)
                        .filter(([_, v]) => v !== undefined)
                        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
                },
                'Users fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all users failed', {
                error: error.message,
                stack: error.stack,
                userId,
                correlationId,
            });

            sendAudit({
                eventId: uuidv4(),
                userId: userId || null,
                action: 'ADMIN_VIEW_ALL_USERS_FAILED',
                ipAddress: req.ip || 'unknown',
                status: 'FAILURE',
                severity: 'MEDIUM',
                timestamp: new Date().toISOString(),
                metadata: { error: error.message, correlationId },
            });

            ResponseUtil.error(res, error.message || 'Failed to fetch users', 500);
            return;
        }
    }

    // ==================== UPDATE USER PROFILE ====================

    /**
     * PUT /api/v1/auth/update-profile
     * Email aur password yahan se nahi badalte (verified OTP flow use hota hai).
     */
    static async updateUserProfile(req: Request<{}, any, UpdateProfileBody> & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const ipAddress = req.ip || 'unknown';

        try {
            if (!userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const {
                phoneNumber,
                firstName,
                lastName,
                location,
                currentPosition,
                company,
                education,
                pronouns,
                onboarding,
                preferences,
            } = req.body;

            if (
                phoneNumber === undefined && firstName === undefined && lastName === undefined &&
                location === undefined && currentPosition === undefined && company === undefined &&
                education === undefined && pronouns === undefined && !onboarding && !preferences
            ) {
                ResponseUtil.validationError(
                    res,
                    ['At least one field (phoneNumber, firstName, lastName, location, currentPosition, company, education, pronouns, onboarding, preferences) is required'],
                    'No fields provided'
                );
                return;
            }

            LoggerUtil.info('Update profile request', {
                userId,
                fields: Object.keys(req.body),
                correlationId,
            });

            const updates: Partial<UpdateProfileBody> = {};

            if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
            if (firstName !== undefined) updates.firstName = firstName;
            if (lastName !== undefined) updates.lastName = lastName;
            if (location !== undefined) updates.location = location;
            if (currentPosition !== undefined) updates.currentPosition = currentPosition;
            if (company !== undefined) updates.company = company;
            if (education !== undefined) updates.education = education;
            if (pronouns !== undefined) updates.pronouns = pronouns;
            if (onboarding !== undefined) updates.onboarding = onboarding;
            if (preferences !== undefined) updates.preferences = preferences;

            const updatedProfile = await AuthService.updateUserProfile(
                userId,
                updates,
                ipAddress
            );

            LoggerUtil.info('Profile updated successfully', {
                userId,
                updatedFields: updatedProfile.updatedFields,
                correlationId,
            });

            ResponseUtil.success(res, updatedProfile, 'Profile updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update profile failed', {
                error: error.message,
                stack: error.stack,
                userId,
                correlationId,
            });

            sendAudit({
                eventId: uuidv4(),
                userId: userId || null,
                action: 'PROFILE_UPDATE_FAILED',
                ipAddress,
                status: 'FAILURE',
                severity: 'MEDIUM',
                timestamp: new Date().toISOString(),
                metadata: { error: error.message, correlationId },
            });

            ResponseUtil.error(res, error.message || 'Failed to update profile', 400);
            return;
        }
    }

    // ==================== DEACTIVATE ACCOUNT ====================

    /**
     * POST /api/v1/auth/user-account-deactivate
     */
    static async deactivateAccount(req: Request<{}, any, DeactivateBody> & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const ipAddress = req.ip || 'unknown';

        try {
            if (!userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { reason, confirmation } = req.body;

            if (confirmation !== 'DEACTIVATE_MY_ACCOUNT') {
                ResponseUtil.validationError(
                    res,
                    ['Confirmation string must be: DEACTIVATE_MY_ACCOUNT'],
                    'Invalid confirmation'
                );
                return;
            }

            LoggerUtil.warn('Account deactivation request', { userId, reason, correlationId });

            const result = await AuthService.deactivateAccount(
                userId,
                ipAddress,
                reason || 'user_requested'
            );

            ResponseUtil.success(res, result, 'Account deactivated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Deactivate account failed', {
                error: error.message,
                userId,
                correlationId,
            });

            ResponseUtil.error(res, error.message || 'Failed to deactivate account', 500);
            return;
        }
    }

    // ==================== DELETE USER (ADMIN ONLY) ====================

    /**
     * DELETE /api/v1/auth/user-delete/:userId
     */
    static async deleteUser(req: Request<{ userId: string }, any, DeleteBody> & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const adminId = req.user?.userId;
        const adminRole = req.user?.role;
        const ipAddress = req.ip || 'unknown';

        try {
            if (!adminId || adminRole !== 'admin') {
                LoggerUtil.warn('Unauthorized delete attempt', { adminId, adminRole, correlationId });
                ResponseUtil.forbidden(res, 'Admin privileges required');
                return;
            }

            const { userId } = req.params;
            const { reason, confirmation } = req.body;

            if (!userId) {
                ResponseUtil.validationError(res, ['User ID is required'], 'Missing user ID');
                return;
            }

            if (userId === adminId) {
                ResponseUtil.validationError(
                    res,
                    ['Cannot delete your own account'],
                    'Self-deletion not allowed'
                );
                return;
            }

            if (confirmation !== 'DELETE_USER_PERMANENTLY') {
                ResponseUtil.validationError(
                    res,
                    ['Confirmation string must be: DELETE_USER_PERMANENTLY'],
                    'Invalid confirmation'
                );
                return;
            }

            if (!reason || reason.length < 10) {
                ResponseUtil.validationError(
                    res,
                    ['Deletion reason must be at least 10 characters'],
                    'Invalid reason'
                );
                return;
            }

            LoggerUtil.warn('ADMIN DELETE - User deletion request', {
                adminId,
                targetUserId: userId,
                reason,
                correlationId,
            });

            const result = await AuthService.deleteUser(userId, adminId, ipAddress, reason);

            ResponseUtil.success(res, result, 'User deleted permanently');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete user failed', {
                error: error.message,
                adminId,
                targetUserId: req.params.userId,
                correlationId,
            });

            ResponseUtil.error(res, error.message || 'Failed to delete user', 500);
            return;
        }
    }

    // ==================== LOGOUT ====================

    /**
     * POST /api/v1/auth/logout
     */
    static async logout(req: Request & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const sessionId = req.user?.sessionId;
        const deviceId = req.user?.deviceId || (req.headers['x-device-id'] as string);
        const ipAddress = req.ip || (req as any).connection?.remoteAddress || 'unknown';

        const authHeader = req.headers.authorization as string;
        const accessToken = authHeader ? authHeader.split(' ')[1] : null;

        try {
            if (!userId) {
                LoggerUtil.warn('Logout failed - No userId', { correlationId });
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            if (!accessToken) {
                LoggerUtil.warn('Logout failed - No access token', { userId, correlationId });
                ResponseUtil.unauthorized(res, 'Access token required');
                return;
            }

            LoggerUtil.info('Logout request received', {
                userId,
                sessionId,
                deviceId,
                correlationId,
            });

            const result = await AuthService.logout(
                userId,
                sessionId || '',
                deviceId || '',
                accessToken,
                ipAddress,
                correlationId
            );

            res.clearCookie('accessToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
            });

            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
            });

            LoggerUtil.info('Logout successful', { userId, sessionId, correlationId });

            ResponseUtil.success(res, result, 'Logged out successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Logout controller failed', {
                error: error.message,
                stack: error.stack,
                userId,
                sessionId,
                correlationId,
            });

            if (error.message === 'Session not found') {
                ResponseUtil.error(res, 'Invalid session', 400);
                return;
            }

            if (error.message === 'Session already terminated') {
                ResponseUtil.success(res, {
                    success: true,
                    message: 'Already logged out',
                    loggedOut: false,
                }, 'Session already terminated');
                return;
            }

            ResponseUtil.error(res, error.message || 'Logout failed', 500);
            return;
        }
    }

    // ==================== LOGOUT ALL DEVICES ====================

    /**
     * POST /api/v1/auth/logout-all
     */
    static async logoutAllDevices(req: Request & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const currentSessionId = req.user?.sessionId;
        const ipAddress = req.ip || (req as any).connection?.remoteAddress || 'unknown';

        const authHeader = req.headers.authorization as string;
        const currentAccessToken = authHeader ? authHeader.split(' ')[1] : null;

        try {
            if (!userId) {
                LoggerUtil.warn('Logout all failed - No userId', { correlationId });
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            if (!currentAccessToken) {
                LoggerUtil.warn('Logout all failed - No access token', { userId, correlationId });
                ResponseUtil.unauthorized(res, 'Access token required');
                return;
            }

            LoggerUtil.info('Logout all devices request received', {
                userId,
                currentSessionId,
                correlationId,
            });

            const result = await AuthService.logoutAll(
                userId,
                currentAccessToken,
                ipAddress,
                correlationId
            );

            res.clearCookie('accessToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
            });

            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
            });

            LoggerUtil.info('Logout all devices successful', {
                userId,
                devicesDeactivated: result.devicesDeactivated,
                sessionsTerminated: result.sessionsTerminated,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Logged out from all devices successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Logout all devices controller failed', {
                error: error.message,
                stack: error.stack,
                userId,
                currentSessionId,
                correlationId,
            });

            if (String(error.message).includes('No active sessions')) {
                ResponseUtil.success(res, {
                    success: true,
                    message: 'No active sessions to logout',
                    devicesLoggedOut: 0,
                }, 'No active sessions found');
                return;
            }

            ResponseUtil.error(
                res,
                error.message || 'Failed to logout from all devices',
                500
            );
            return;
        }
    }
}

// ==================== EXPORT ====================

export default AuthController;