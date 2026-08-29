// ../controllers/auth.controller.ts
/**
 * auth.controller.ts
 * Production-Level Authentication Controllers for 1M+ Users
 * Supports Registration, Login, Logout, Token Refresh
 * 
 * Features:
 * - NIST 800-63B compliant authentication
 * - Kafka audit logging for all events
 * - Redis caching for sessions
 * - Rate limiting integration
 * - Device fingerprintings
 * - IP-based security checks
 * - Comprehensive error handling
 * - Performance monitoring
 * 
 * @module controllers/auth.controller
 * @version 3.0.0
 *
 * ✅ PERFORMANCE FIX (this version) — login():
 *    - Removed the separate AuthService.checkAccountLocked() call.
 *      AuthService.login() now does IP-check + user-fetch +
 *      rate-limit-check + account-status-check all in a single pass,
 *      so calling checkAccountLocked() first was doing a redundant
 *      user fetch + redundant rate-limit query before login() even ran.
 *    - Removed the User.findOne({ userId }) re-fetch that used to run
 *      AFTER a successful login just to build the response.
 *      AuthService.login() now returns the full user fields
 *      (email, role, firstName, lastName, profilePhotoId, headlineId)
 *      directly, so the controller never needs to touch the DB again.
 *    - The 3 CacheUtil.set() calls (session, user, access token) now
 *      run in parallel via Promise.all instead of sequentially.
 *    - The success audit log write is now fire-and-forget
 *      (setImmediate) instead of blocking the response, matching the
 *      pattern already used everywhere else in this file.
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
import TokenBlacklistUtil from '@/shared/utils/tokenBlacklist.util';
import { GetAllUsersParams } from '../interfaces/auth.interfaces';

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
    // username?: string;
    // Basic fields
    email: string;
    password: string;
    confirmPassword: string;        // ✅ NEW: Required
    firstName: string;              // ✅ CHANGED: Now required (remove ?)
    lastName?: string;
    location: string;               // ✅ NEW: Required city name
    phoneNumber?: string;

    // ✅ FIX: these were destructured from req.body in register() but
    // never declared on this interface — TypeScript now correctly
    // flags that. Adding them here matches what the code already uses.
    currentPosition?: string;
    company?: string;
    education?: string;
    pronouns?: string;

    // Onboarding fields
    userType: 'working' | 'student' | 'fresher';  // ✅ NEW: Required

    // Working Professional (conditional - required if userType is 'working')
    jobTitle?: string;
    companyName?: string;
    startDate?: string;             // YYYY-MM-DD format
    endDate?: string;               // YYYY-MM-DD format (optional for current jobs)

    // Student (conditional - required if userType is 'student')
    collegeName?: string;
    degree?: string;
    fieldOfStudy?: string;
    graduationYear?: string;        // Must be digits only

    // Fresher (conditional - required if userType is 'fresher')
    highestEducation?: string;
    preferredRole?: string;
    cgpa?: string;                  // Optional, no validation

    // Device info (optional)
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
    email?: string;
    password?: string;
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

interface RefreshBody {
    refreshToken?: string;
    deviceId?: string;
}

interface ValidationResult {
    isValid: boolean;
    data?: {
        email: string;
        password: string;
        confirmPassword: string;
        firstName: string;
        lastName?: string;
        location: string;
        currentPosition?: string;
        company?: string;
        education?: string;
        pronouns?: string;
        phoneNumber?: string;
        userType: 'working' | 'student' | 'fresher';

        // Working fields
        jobTitle?: string;
        companyName?: string;
        startDate?: string;
        endDate?: string;

        // Student fields
        collegeName?: string;
        degree?: string;
        fieldOfStudy?: string;
        graduationYear?: string;

        // Fresher fields
        highestEducation?: string;
        preferredRole?: string;
        cgpa?: string;

        rememberMe?: boolean;
        // username?: string;
    };
    errors?: string[];
}

// ==================== AUTH CONTROLLER CLASS ====================

class AuthController {

    // ==================== USER REGISTRATION ====================

    /**
     * Register a new user
     * POST /api/v1/auth/register
     * 
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     * @returns {Promise<void>}
     */
    
    static async register(req: Request<{}, any, RegisterBody>, res: Response): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            // Step 1: Extract request data
            const {
                /* username, */
                email,
                password,
                confirmPassword,           // ✅ NEW
                firstName,                 // Now required
                lastName,
                location,                  // ✅ NEW
                phoneNumber,
                userType,                  // ✅ NEW
                currentPosition,           // ✅ NEW
                company,                   // ✅ NEW
                education,                 // ✅ NEW
                pronouns,                  // ✅ NEW

                // Working fields
                jobTitle,
                companyName,
                startDate,
                endDate,

                // Student fields
                collegeName,
                degree,
                fieldOfStudy,
                graduationYear,

                // Fresher fields
                highestEducation,
                preferredRole,
                cgpa,
            } = req.body;
            const ipAddress = req.ip || (req as any).connection?.remoteAddress || '0.0.0.0';
            const userAgent = req.headers['user-agent'] as string || 'Unknown';

            const deviceData: DeviceData = {
                deviceType: req.body.deviceType || 'desktop',
                deviceName: req.body.deviceName || 'Unknown Device',
                os: req.body.os || 'Unknown',
                browser: req.body.browser || 'Unknown',
                userAgent,
                ipAddress,
            };

            LoggerUtil.info('Registration attempt started', {
                email,
                ipAddress,
                correlationId,
            });

            // Step 2: Validate input
            const validation: ValidationResult = await ValidatorUtil.validateUserRegistration(
                {
                    /* username, */
                    email,
                    password,
                    confirmPassword,       // ✅ NEW
                    firstName,             // Required
                    lastName,
                    location,              // ✅ NEW
                    phoneNumber,
                    userType,              // ✅ NEW

                    // Working
                    jobTitle,
                    companyName,
                    startDate,
                    endDate,

                    // Student
                    collegeName,
                    degree,
                    fieldOfStudy,
                    graduationYear,

                    // Fresher
                    highestEducation,
                    preferredRole,
                    cgpa,
                },
                ipAddress
            );

            if (!validation.isValid) {
                LoggerUtil.warn('Registration validation failed', {
                    email,
                    errors: validation.errors,
                    ipAddress,
                    correlationId,
                });

                ResponseUtil.validationError(res, validation.errors || [], 'Validation failed');
                return;
            }

            // Step 3: Check for existing user
            const existingUser = await User.findOne({ email: validation.data?.email });
            if (existingUser) {
                LoggerUtil.warn('Registration failed - user already exists', {
                    email: validation.data?.email,
                    ipAddress,
                    correlationId,
                });

                // ✅ Async audit event (non-blocking)
                setImmediate(async () => {
                    try {
                        await AuditProducer.connect();
                        await AuditProducer.sendAuditEvent({
                            eventId: uuidv4(),
                            userId: null,
                            action: 'REGISTRATION_FAILED',
                            ipAddress,
                            status: 'FAILURE',
                            severity: 'LOW',
                            timestamp: new Date().toISOString(),
                            metadata: {
                                email: validation.data?.email,
                                reason: 'user_already_exists',
                                correlationId,
                            },
                        });
                    } catch (err: any) {
                        LoggerUtil.warn('Audit event failed (non-critical)', { error: err.message });
                    } finally {
                        await AuditProducer.disconnect();
                    }
                });

                ResponseUtil.conflict(
                    res,
                    'User already exists with this email',
                    ['Email is already registered']
                );
                return;
            }

            // Step 4: Register user via AuthService
            const result = await AuthService.register(
                validation.data!.email,
                validation.data!.password,
                {
                    firstName: validation.data!.firstName,
                    lastName: validation.data!.lastName,
                    location: validation.data!.location,        // ✅ NEW
                    phoneNumber: validation.data!.phoneNumber,
                    userType: validation.data!.userType,        // ✅ NEW

                    // Working profile
                    jobTitle: validation.data!.jobTitle,
                    companyName: validation.data!.companyName,
                    startDate: validation.data!.startDate,
                    endDate: validation.data!.endDate,

                    // Student profile
                    collegeName: validation.data!.collegeName,
                    degree: validation.data!.degree,
                    fieldOfStudy: validation.data!.fieldOfStudy,
                    graduationYear: validation.data!.graduationYear,

                    // Fresher profile
                    highestEducation: validation.data!.highestEducation,
                    preferredRole: validation.data!.preferredRole,
                    cgpa: validation.data!.cgpa,
                },
                deviceData
            );

            LoggerUtil.info('AuthService.register successful', {
                userId: result.userId,
                sessionId: result.sessionId,
                deviceId: result.deviceId,
                correlationId
            });

            // Step 5: Generate JWT tokens
            const payload: UserPayload = {
                userId: result.userId,
                role: result.role || 'user',
                sessionId: result.sessionId,
                deviceId: result.deviceId
            };

            LoggerUtil.debug('Generating JWT tokens', { userId: result.userId, correlationId });

            const accessToken = User.generateAccessToken(payload);
            const refreshToken = User.generateRefreshToken(payload);

            LoggerUtil.debug('JWT tokens generated successfully', {
                userId: result.userId,
                hasAccessToken: !!accessToken,
                hasRefreshToken: !!refreshToken,
                correlationId
            });

            // Step 6: Cache session and user data
            try {
                await CacheUtil.set(
                    `${Constants.CACHE_PREFIXES.SESSION}${result.sessionId}`,
                    {
                        userId: result.userId,
                        email: validation.data!.email,
                        sessionId: result.sessionId,
                        ipAddress,
                        createdAt: new Date().toISOString(),
                    },
                    Constants.CACHE_TTLS.SESSION
                );

                await CacheUtil.set(
                    `${Constants.CACHE_PREFIXES.USER}${result.userId}`,
                    {
                        userId: result.userId,
                        email: validation.data!.email,
                        firstName: validation.data!.firstName,
                        lastName: validation.data!.lastName,
                        role: result.role || 'user',
                    },
                    Constants.CACHE_TTLS.USER
                );

                await CacheUtil.set(
                    `access_token:${accessToken}`,
                    {
                        ...payload,
                        ipAddress,
                        userAgent
                    },
                    900
                );

                LoggerUtil.debug('Cache updated successfully', {
                    userId: result.userId,
                    sessionId: result.sessionId,
                    correlationId
                });
            } catch (cacheError: any) {
                LoggerUtil.error('Cache update failed (non-critical)', {
                    error: cacheError.message,
                    userId: result.userId,
                    correlationId
                });
            }

            // Step 7: ✅ Send audit event ASYNCHRONOUSLY (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId: result.userId,
                        action: Constants.AUDIT_ACTIONS.USER_REGISTERED,
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            email: validation.data!.email,
                            firstName: validation.data!.firstName,
                            location: validation.data!.location,
                            userType: validation.data!.userType,
                            hasPhoneNumber: !!validation.data!.phoneNumber,
                            registrationMethod: 'local',
                            correlationId,
                            duration: Date.now() - startTime,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed (non-critical)', {
                        error: err.message,
                        userId: result.userId,
                    });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            // Step 8: Log performance metrics
            const duration = Date.now() - startTime;
            LoggerUtil.performance('user_registration', duration, {
                userId: result.userId,
                email: validation.data!.email,
                correlationId,
            });

            LoggerUtil.info('User registered successfully', {
                userId: result.userId,
                email: validation.data!.email,
                duration,
                correlationId,
            });

            // Step 9: Return success response
            const accessTokenExpiresIn = 15 * 60; // 15 minutes in seconds
            const refreshTokenExpiresIn = 7 * 24 * 60 * 60; // 7 days in seconds

            ResponseUtil.created(res, {
                user: {
                    userId: result.userId,
                    email: validation.data!.email,
                    firstName: validation.data!.firstName,
                    lastName: validation.data!.lastName,
                    role: result.role || 'user',
                },
                tokens: {
                    accessToken: accessToken,
                    refreshToken: refreshToken,
                    tokenType: 'Bearer',                    // ✅ NEW
                    expiresIn: accessTokenExpiresIn,       // ✅ NEW: seconds
                    expiresAt: new Date(Date.now() + accessTokenExpiresIn * 1000).toISOString(), // ✅ NEW: ISO timestamp
                    refreshExpiresIn: refreshTokenExpiresIn,  // ✅ NEW
                    refreshExpiresAt: new Date(Date.now() + refreshTokenExpiresIn * 1000).toISOString(), // ✅ NEW
                },
            }, 'Registration successful');

            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Registration failed', {
                error: error.message,
                stack: error.stack,
                email: req.body.email,
                ipAddress: req.ip,
                duration,
                correlationId,
            });

            // ✅ Async audit event for error
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
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
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
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
    * Authenticate user and create session
    * POST /api/v1/auth/login
    *
    * ✅ OPTIMIZED: previously this handler called
    * AuthService.checkAccountLocked() (which fetched the user + ran a
    * rate-limit query), then called AuthService.login() which fetched
    * the SAME user again and ran the SAME rate-limit query again, and
    * THEN — after a successful login — fetched the user a THIRD time
    * via User.findOne() just to build the response. That's 3 user
    * fetches + 2 rate-limit queries for a single login request.
    *
    * Now: a single call to AuthService.login() does everything (IP
    * check, user fetch, account-status checks, rate-limit check,
    * password verification) and returns the full user fields needed
    * for the response — so this handler never touches the User
    * collection directly.
    * 
    * @param {Request} req - Express request
    * @param {Response} res - Express response
    * @returns {Promise<void>}
    */
    static async login(req: Request<{}, any, LoginBody>, res: Response): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { email, password, rememberMe } = req.body;
            const ipAddress = req.ip || '0.0.0.0';
            const userAgent = req.headers['user-agent'] as string || 'Unknown';

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
                correlationId
            });

            // Step 1: Validate input
            const validation: ValidationResult = await ValidatorUtil.validateLogin(
                { email, password, rememberMe },
                ipAddress
            );

            if (!validation.isValid) {
                await AuditLog.logAction({
                    userId: String(null),
                    userEmail: email,
                    action: 'LOGIN_FAILED',
                    ipAddress,
                    userAgent,
                    status: 'FAILURE' as const,
                    severity: 'MEDIUM' as const,
                    metadata: new Map<string, any>(Object.entries({
                        reason: '3_failed_attempts', correlationId
                    })),
                });
                ResponseUtil.validationError(res, validation.errors || [], 'Validation failed');
                return;
            }

            // ✅ Step 2 (removed): AuthService.checkAccountLocked() no
            // longer called separately here — AuthService.login() below
            // now handles the IP-block check, account-status checks,
            // and rate-limit check internally in a single pass, using
            // ONE user fetch instead of the two (checkAccountLocked +
            // login) this used to require.

            // Step 3: Authenticate user via AuthService — this single
            // call now does everything: IP check, user fetch, account
            // status checks, rate-limit check, password verification,
            // device registration, session creation, and returns the
            // full user data needed for the response.
            LoggerUtil.debug('Calling AuthService.login', { email, correlationId });

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
                correlationId
            });

            // ✅ Step 4 (removed): the old User.findOne({ userId })
            // re-fetch is gone. `result` from AuthService.login() now
            // already contains email, role, firstName, lastName,
            // profilePhotoId, headlineId — everything this handler
            // needs to build the response and cache payload.

            // Step 5: Generate JWT tokens
            const payload: UserPayload = {
                userId: result.userId,
                role: result.role || 'user',
                sessionId: result.sessionId,
                deviceId: result.deviceId
            };

            LoggerUtil.debug('Generating JWT tokens', { userId: result.userId, correlationId });

            const accessToken = User.generateAccessToken(payload);
            const refreshToken = User.generateRefreshToken(payload);

            LoggerUtil.debug('JWT tokens generated successfully', {
                userId: result.userId,
                hasAccessToken: !!accessToken,
                hasRefreshToken: !!refreshToken,
                correlationId
            });

            // Step 6: ✅ Cache session and user data — the 3 independent
            // cache writes now run in PARALLEL instead of sequentially.
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
                            ipAddress
                        },
                        sessionTTL
                    ),
                    CacheUtil.set(
                        `${Constants.CACHE_PREFIXES.USER}${result.userId}`,
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
                        {
                            ...payload,
                            ipAddress,
                            userAgent
                        },
                        900
                    ),
                ]);

                LoggerUtil.debug('Cache updated successfully', {
                    userId: result.userId,
                    sessionId: result.sessionId,
                    correlationId
                });
            } catch (cacheError: any) {
                LoggerUtil.error('Cache update failed (non-critical)', {
                    error: cacheError.message,
                    userId: result.userId,
                    correlationId
                });
            }

            // Step 7: ✅ Log successful login audit — now fire-and-forget
            // (setImmediate) instead of blocking the response, matching
            // the pattern used everywhere else in this file.
            setImmediate(() => {
                AuditLog.logAction({
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
                        duration: Date.now() - startTime
                    })),
                }).catch((err: any) =>
                    LoggerUtil.error('Login success audit log failed (non-critical)', {
                        error: err.message,
                        userId: result.userId,
                    })
                );
            });

            // Step 8: Log performance metrics
            const duration = Date.now() - startTime;
            LoggerUtil.performance('user_login', duration, {
                userId: result.userId,
                correlationId
            });

            LoggerUtil.info('User logged in successfully', {
                userId: result.userId,
                email: result.email,
                duration,
                correlationId
            });

            // Step 9: ✅ Return success response
            const accessTokenExpiresIn = 15 * 60; // 15 minutes
            const refreshTokenExpiresIn = rememberMe
                ? 90 * 24 * 60 * 60  // 90 days (remember me)
                : 30 * 24 * 60 * 60; // 30 days default (persistent login)

            ResponseUtil.success(res, {
                user: {
                    userId: result.userId,
                    email: result.email,
                    role: result.role || 'user'
                },
                tokens: {
                    accessToken: accessToken,
                    refreshToken: refreshToken,
                    tokenType: 'Bearer',                    // ✅ NEW
                    expiresIn: accessTokenExpiresIn,       // ✅ NEW
                    expiresAt: new Date(Date.now() + accessTokenExpiresIn * 1000).toISOString(), // ✅ NEW
                    refreshExpiresIn: refreshTokenExpiresIn,  // ✅ NEW
                    refreshExpiresAt: new Date(Date.now() + refreshTokenExpiresIn * 1000).toISOString(), // ✅ NEW
                },
            }, 'Welcome To Throne8', 200);
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Login failed', {
                error: error.message,
                stack: error.stack,
                email: req.body.email,
                ipAddress: req.ip,
                duration,
                correlationId
            });

            await AuditLog.logAction({
                userId: String(null),
                userEmail: req.body.email,
                action: 'LOGIN_FAILED',
                ipAddress: req.ip || '0.0.0.0',
                userAgent: req.headers['user-agent'] as string || 'Unknown',
                status: 'FAILURE',
                severity: 'MEDIUM',
                metadata: new Map<string, any>(Object.entries({
                    reason: error.message,
                    correlationId
                })),
            });

            // Return appropriate error responses
            if (error.message.includes('Account locked') ||
                error.message.includes('failed attempts') ||
                error.message.includes('too many attempts') ||
                error.message.includes('Too many attempts')) {
                ResponseUtil.tooManyRequests(
                    res,
                    'Account temporarily locked due to multiple failed login attempts',
                    { retryAfter: 900 }
                );
                return;
            }

            if (error.message.includes('disabled') ||
                error.message.includes('suspended') ||
                error.message.includes('not active') ||
                error.message.includes('Contact support')) {
                ResponseUtil.forbidden(
                    res,
                    'Your account has been disabled. Please contact support.'
                );
                return;
            }

            if (error.message.includes('unable to retrieve user data') ||
                error.message.includes('User data not found')) {
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

    /**
 * ✅ NEW: Refresh Token with Rotation
 * POST /api/v1/auth/refresh
 */
    static async refreshToken(req: Request, res: Response): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                ResponseUtil.badRequest(res, 'Refresh token is required');
                return;
            }

            LoggerUtil.info('Token refresh attempt', { correlationId });

            // Step 1: Verify refresh token
            let decoded: any;
            try {
                decoded = User.verifyToken(refreshToken, 'refresh');
            } catch (error: any) {
                LoggerUtil.warn('Invalid refresh token', { error: error.message });
                ResponseUtil.unauthorized(res, 'Invalid or expired refresh token');
                return;
            }

            // Step 2: ✅ Check if refresh token is blacklisted (reuse detection)
            const isBlacklisted = await TokenBlacklistUtil.isRefreshTokenBlacklisted(refreshToken);
            if (isBlacklisted) {
                LoggerUtil.error('🚨 SECURITY ALERT: Blacklisted refresh token reused', {
                    userId: decoded.userId,
                    sessionId: decoded.sessionId,
                });

                // ✅ Blacklist all user tokens (potential token theft)
                await TokenBlacklistUtil.blacklistAllUserTokens(decoded.userId);
                await Session.revokeAllUserSessions(decoded.userId, 'security_breach');

                ResponseUtil.unauthorized(
                    res,
                    'Security alert: This token has been used before. All your sessions have been terminated for security.'
                );
                return;
            }

            // Step 3: Fetch user and validate
            const user = await User.findOne({ userId: decoded.userId })
                .select('userId email role status')
                .lean();

            if (!user || user.status !== 'active') {
                LoggerUtil.warn('User not found or inactive during refresh', {
                    userId: decoded.userId,
                });
                ResponseUtil.unauthorized(res, 'User account not found or inactive');
                return;
            }

            // Step 4: Validate session still exists
            const session = await Session.findById(decoded.sessionId);
            if (!session || !session.isActive) {
                LoggerUtil.warn('Session not found or inactive', {
                    sessionId: decoded.sessionId,
                });
                ResponseUtil.unauthorized(res, 'Session has been terminated');
                return;
            }

            // Step 5: ✅ BLACKLIST OLD REFRESH TOKEN (Token Rotation)
            await TokenBlacklistUtil.blacklistRefreshToken(
                refreshToken,
                decoded.userId,
                'token_rotation'
            );

            // Step 6: ✅ GENERATE NEW TOKENS
            const newPayload = {
                userId: user.userId,
                role: user.role,
                sessionId: session._id,
                deviceId: decoded.deviceId,
            };

            const newAccessToken = User.generateAccessToken(newPayload);
            const newRefreshToken = User.generateRefreshToken(newPayload);

            // Step 7: Cache new tokens
            const accessTokenExpiresIn = 15 * 60; // 15 minutes
            const refreshTokenExpiresIn = 7 * 24 * 60 * 60; // 7 days

            await CacheUtil.set(
                `access_token:${newAccessToken}`,
                {
                    ...newPayload,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                },
                accessTokenExpiresIn
            );

            // Step 8: Update session refresh token
            session.refreshToken = newRefreshToken;
            session.lastActivity = new Date();
            await session.save();

            // Step 9: Audit log
            await AuditLog.logAction({
                userId: user.userId,
                userEmail: user.email,
                action: 'TOKEN_REFRESH_SUCCESS',
                ipAddress: req.ip || '0.0.0.0',
                userAgent: req.headers['user-agent'] as string,
                status: 'SUCCESS',
                severity: 'LOW',
                metadata: new Map([
                    ['sessionId', session._id],
                    ['correlationId', correlationId],
                ]),
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Token refreshed successfully', {
                userId: user.userId,
                duration,
                correlationId,
            });

            // Step 10: ✅ Return new tokens with expiry info
            ResponseUtil.success(
                res,
                {
                    tokens: {
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                        tokenType: 'Bearer',
                        expiresIn: accessTokenExpiresIn,
                        expiresAt: new Date(Date.now() + accessTokenExpiresIn * 1000).toISOString(),
                        refreshExpiresIn: refreshTokenExpiresIn,
                        refreshExpiresAt: new Date(Date.now() + refreshTokenExpiresIn * 1000).toISOString(),
                    },
                },
                'Token refreshed successfully',
                200
            );
            return;
        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Token refresh failed', {
                error: error.message,
                stack: error.stack,
                duration,
                correlationId,
            });

            await AuditLog.logAction({
                userId: String(null),
                action: 'TOKEN_REFRESH_FAILED',
                ipAddress: req.ip || '0.0.0.0',
                status: 'FAILURE',
                severity: 'MEDIUM',
                metadata: new Map([
                    ['error', error.message],
                    ['correlationId', correlationId],
                ]),
            });

            ResponseUtil.internalError(
                res,
                'Token refresh failed. Please login again.',
                error
            );
            return;
        }
    }

    // ==================== GET USER PROFILE ====================

    /**
     * GET /api/v1/user/profile
     * Get authenticated user's profile
     * 
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     * @returns {Promise<void>}
     */
    static async getUserProfile(req: Request & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const ipAddress = req.ip || 'unknown';

        try {
            // ✅ Validate authentication
            if (!userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            LoggerUtil.info('Get profile request', { userId, correlationId });

            // ✅ Parse query options
            const includeStats = req.query.includeStats === 'true';
            const includeSessions = req.query.includeSessions === 'true';

            // ✅ Fetch profile from service
            const profile = await AuthService.getUserProfile(userId, {
                includeStats,
                includeSessions,
            });

            // ✅ Audit log (non-blocking)
            setImmediate(() => {
                AuditProducer.sendAuditEvent({
                    eventId: uuidv4(),
                    userId,
                    action: 'PROFILE_VIEWED',
                    ipAddress,
                    status: 'SUCCESS',
                    severity: 'LOW',
                    timestamp: new Date().toISOString(),
                    metadata: { correlationId },
                }).catch((err: any) => LoggerUtil.error('Audit log failed', { error: err.message }));
            });

            ResponseUtil.success(
                res,
                profile,
                'Profile fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get profile failed', {
                error: error.message,
                userId,
                correlationId,
            });

            ResponseUtil.error(
                res,
                error.message || 'Failed to fetch profile',
                500
            );
            return;
        }
    }

    /**
 * @route   GET /api/v1/auth/users/:userId
 * @desc    Get user by ID (UUID)
 * @access  Public (can be changed to Private if needed)
 * @param   {String} userId - User UUID
 * @query   {Boolean} includeStats - Include statistics
 * @query   {Boolean} includeSessions - Include active sessions
 */
    static async getUserById(req: Request, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const { userId } = req.params;

        try {
            LoggerUtil.info('Get user by ID request', { userId, correlationId });

            // ✅ Validate userId parameter
            if (!userId) {
                ResponseUtil.badRequest(res, 'User ID is required');
                return;
            }

            // ✅ Parse query options
            const includeStats = req.query.includeStats === 'true';
            const includeSessions = req.query.includeSessions === 'true';

            // ✅ Fetch user from service
            const user = await AuthService.getUserById(userId, {
                includeStats,
                includeSessions,
            });

            // ✅ Audit log (non-blocking)
            setImmediate(() => {
                AuditProducer.sendAuditEvent({
                    eventId: uuidv4(),
                    userId: userId,
                    action: 'USER_VIEWED_BY_ID',
                    ipAddress: req.ip || 'unknown',
                    status: 'SUCCESS',
                    severity: 'LOW',
                    timestamp: new Date().toISOString(),
                    metadata: {
                        correlationId,
                        includeStats,
                        includeSessions
                    },
                }).catch((err: any) =>
                    LoggerUtil.error('Audit log failed', { error: err.message })
                );
            });

            ResponseUtil.success(
                res,
                user,
                'User fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get user by ID failed', {
                error: error.message,
                stack: error.stack,
                userId,
                correlationId,
            });

            // Handle specific errors
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

            ResponseUtil.error(
                res,
                error.message || 'Failed to fetch user',
                500
            );
            return;
        }
    }


    static async getUsersBulk(req: Request, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const { userIds } = req.body;
        try {
            LoggerUtil.info('Get users bulk request', { count: userIds?.length, correlationId });
            if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
                ResponseUtil.badRequest(res, 'userIds must be a non-empty array');
                return;
            }
            if (userIds.length > 100) {
                ResponseUtil.badRequest(res, 'Cannot request more than 100 userIds at once');
                return;
            }
            const users = await AuthService.getUsersByIds(userIds);
            setImmediate(() => {
                AuditProducer.sendAuditEvent({
                    eventId: uuidv4(), userId: null, action: 'USERS_VIEWED_BULK',
                    ipAddress: req.ip || 'unknown', status: 'SUCCESS', severity: 'LOW',
                    timestamp: new Date().toISOString(),
                    metadata: { requested: userIds.length, found: users.length, correlationId },
                }).catch((err: any) => LoggerUtil.error('Audit log failed', { error: err.message }));
            });
            ResponseUtil.success(res, { users }, 'Users fetched successfully');
            return;
        } catch (error: any) {
            LoggerUtil.error('Get users bulk failed', { error: error.message, stack: error.stack, correlationId });
            ResponseUtil.error(res, error.message || 'Failed to fetch users', 500);
            return;
        }
    }

    /**
     * ==================== GET ALL USERS (ADMIN ONLY) ====================
     * 
     * GET /api/v1/auth/users
     * 
     * Query Parameters:
     * - page: number (default: 1)
     * - limit: number (default: 20, max: 100)
     * - status: 'active' | 'inactive' | 'suspended' | 'deleted'
     * - role: 'user' | 'admin' | 'moderator'
     * - userType: 'working' | 'student' | 'fresher'
     * - location: string
     * - search: string (searches email, firstName, lastName)
     * - sortBy: 'newest' | 'oldest' | 'name' | 'email'
     * 
     * @access Private (Admin only)
    */
    static async getAllUsers(req: Request & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        try {
            // ✅ Step 1: Verify user
            if (!userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            // ✅ Step 2: Parse and validate query parameters
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

            // ✅ FIX: GetAllUsersParams.sortBy expects a specific union
            // type ('newest' | 'oldest' | 'name' | 'email'), not a
            // generic string — cast against the interface's own field
            // type instead of hardcoding the union here, so it stays in
            // sync if that type ever changes.
            const sortBy = (req.query.sortBy as GetAllUsersParams['sortBy']) || 'newest';

            LoggerUtil.info('Admin fetching all users', {
                userId,
                userRole,
                page,
                limit,
                filters: Object.entries(filters)
                    .filter(([_, v]) => v !== undefined)
                    .map(([k]) => k),
                sortBy,
                correlationId
            });

            // ✅ Step 3: Fetch users from service
            const result = await AuthService.getAllUsers({
                page,
                limit,
                skip,
                filters,
                sortBy
            });

            // ✅ Step 4: Audit log (non-blocking)
            setImmediate(() => {
                AuditProducer.sendAuditEvent({
                    eventId: uuidv4(),
                    userId: userId,
                    action: 'ADMIN_VIEW_ALL_USERS',
                    ipAddress: req.ip || 'unknown',
                    status: 'SUCCESS',
                    severity: 'LOW',
                    timestamp: new Date().toISOString(),
                    metadata: {
                        page,
                        limit,
                        totalUsers: result.total,
                        filters,
                        correlationId,
                    },
                }).catch((err: any) => LoggerUtil.error('Audit log failed', { error: err.message }));
            });

            LoggerUtil.info('Users fetched successfully', {
                userId,
                page,
                limit,
                total: result.total,
                returned: result.users.length,
                correlationId
            });

            // ✅ Step 5: Return response
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
                userId: userId,
                correlationId,
            });

            // ✅ Audit log for failure (non-blocking)
            setImmediate(() => {
                AuditProducer.sendAuditEvent({
                    eventId: uuidv4(),
                    userId: userId || null,
                    action: 'ADMIN_VIEW_ALL_USERS_FAILED',
                    ipAddress: req.ip || 'unknown',
                    status: 'FAILURE',
                    severity: 'MEDIUM',
                    timestamp: new Date().toISOString(),
                    metadata: {
                        error: error.message,
                        correlationId,
                    },
                }).catch((err: any) => LoggerUtil.error('Audit log failed', { error: err.message }));
            });

            ResponseUtil.error(
                res,
                error.message || 'Failed to fetch users',
                500
            );
            return;
        }
    }

    // ==================== UPDATE USER PROFILE ====================

    /**
     * PUT /api/v1/user/profile
     * Update authenticated user's profile
     * 
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     * @returns {Promise<void>}
     */
    static async updateUserProfile(req: Request<{}, any, UpdateProfileBody> & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const ipAddress = req.ip || 'unknown';

        try {
            // ✅ Validate authentication
            if (!userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const {
                email,
                password,
                phoneNumber,
                firstName,
                lastName,
                location,
                currentPosition,
                company,
                education,
                pronouns,
                onboarding,
                preferences
            } = req.body;

            // ✅ Validate at least one field is provided
            if (!email && !password && !phoneNumber && !firstName && !lastName &&
                !location && !currentPosition && !company && !education && !pronouns && !onboarding && !preferences) {
                ResponseUtil.validationError(
                    res,
                    ['At least one field (email, password, phoneNumber, firstName, lastName, location, currentPosition, company, education, pronouns, onboarding, preferences) is required'],
                    'No fields provided'
                );
                return;
            }

            LoggerUtil.info('Update profile request', {
                userId,
                fields: Object.keys(req.body),
                correlationId
            });

            // ✅ Build updates object
            const updates: Partial<UpdateProfileBody> = {};

            if (email !== undefined) updates.email = email;
            if (password !== undefined) updates.password = password;
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

            // ✅ Update profile via service
            const updatedProfile = await AuthService.updateUserProfile(
                userId,
                updates,
                ipAddress
            );

            LoggerUtil.info('Profile updated successfully', {
                userId,
                updatedFields: updatedProfile.updatedFields,
                correlationId
            });

            ResponseUtil.success(
                res,
                updatedProfile,
                'Profile updated successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Update profile failed', {
                error: error.message,
                stack: error.stack,
                userId,
                correlationId,
            });

            // ✅ Audit log for failed update (non-blocking)
            setImmediate(() => {
                AuditProducer.sendAuditEvent({
                    eventId: uuidv4(),
                    userId: userId || null,
                    action: 'PROFILE_UPDATE_FAILED',
                    ipAddress,
                    status: 'FAILURE',
                    severity: 'MEDIUM',
                    timestamp: new Date().toISOString(),
                    metadata: {
                        error: error.message,
                        correlationId,
                    },
                }).catch((err: any) => LoggerUtil.error('Audit log failed', { error: err.message }));
            });

            ResponseUtil.error(
                res,
                error.message || 'Failed to update profile',
                400
            );
            return;
        }
    }

    // ==================== DEACTIVATE ACCOUNT ====================

    /**
     * POST /api/v1/user/deactivate
     * Deactivate authenticated user's account
     * 
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     * @returns {Promise<void>}
     */
    static async deactivateAccount(req: Request<{}, any, DeactivateBody> & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const ipAddress = req.ip || 'unknown';

        try {
            // ✅ Validate authentication
            if (!userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { reason, confirmation } = req.body;

            // ✅ Validate confirmation
            if (confirmation !== 'DEACTIVATE_MY_ACCOUNT') {
                ResponseUtil.validationError(
                    res,
                    ['Confirmation string must be: DEACTIVATE_MY_ACCOUNT'],
                    'Invalid confirmation'
                );
                return;
            }

            LoggerUtil.warn('Account deactivation request', {
                userId,
                reason,
                correlationId
            });

            // ✅ Deactivate via service
            const result = await AuthService.deactivateAccount(
                userId,
                ipAddress,
                reason || 'user_requested'
            );

            ResponseUtil.success(
                res,
                result,
                'Account deactivated successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Deactivate account failed', {
                error: error.message,
                userId,
                correlationId,
            });

            ResponseUtil.error(
                res,
                error.message || 'Failed to deactivate account',
                500
            );
            return;
        }
    }

    // ==================== DELETE USER (ADMIN ONLY) ====================

    /**
     * DELETE /api/v1/user/:userId
     * Permanently delete user account (admin only)
     * 
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     * @returns {Promise<void>}
     */
    static async deleteUser(req: Request<{ userId: string }, any, DeleteBody> & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const adminId = req.user?.userId;
        const adminRole = req.user?.role;
        const ipAddress = req.ip || 'unknown';

        try {
            // ✅ Validate admin authentication
            if (!adminId || adminRole !== 'admin') {
                LoggerUtil.warn('Unauthorized delete attempt', { adminId, adminRole, correlationId });

                ResponseUtil.forbidden(
                    res,
                    'Admin privileges required'
                );
                return;
            }

            const { userId } = req.params;
            const { reason, confirmation } = req.body;

            // ✅ Validate userId
            if (!userId) {
                ResponseUtil.validationError(
                    res,
                    ['User ID is required'],
                    'Missing user ID'
                );
                return;
            }

            // ✅ Prevent self-deletion
            if (userId === adminId) {
                ResponseUtil.validationError(
                    res,
                    ['Cannot delete your own account'],
                    'Self-deletion not allowed'
                );
                return;
            }

            // ✅ Validate confirmation
            if (confirmation !== 'DELETE_USER_PERMANENTLY') {
                ResponseUtil.validationError(
                    res,
                    ['Confirmation string must be: DELETE_USER_PERMANENTLY'],
                    'Invalid confirmation'
                );
                return;
            }

            // ✅ Validate reason
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
                correlationId
            });

            // ✅ Delete user via service
            const result = await AuthService.deleteUser(
                userId,
                adminId,
                ipAddress,
                reason
            );

            ResponseUtil.success(
                res,
                result,
                'User deleted permanently'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete user failed', {
                error: error.message,
                adminId,
                targetUserId: req.params.userId,
                correlationId,
            });

            ResponseUtil.error(
                res,
                error.message || 'Failed to delete user',
                500
            );
            return;
        }
    }

    // ==================== USER LOGOUT (WITH BLACKLIST) ====================
    /**
    * Authenticate user and terminate session
    * POST /api/v1/auth/logout
    * 
    * @param {Request} req - Express request
    * @param {Response} res - Express response
    * @returns {Promise<void>}
    */
    static async logout(req: Request & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const sessionId = req.user?.sessionId;
        const deviceId = req.user?.deviceId || req.headers['x-device-id'] as string;
        const ipAddress = req.ip || (req as any).connection?.remoteAddress || 'unknown';

        // ✅ CRITICAL: Extract access token from Authorization header
        const authHeader = req.headers.authorization as string;
        const accessToken = authHeader ? authHeader.split(' ')[1] : null;

        try {
            // ✅ Validate required data
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
                tokenPrefix: accessToken.substring(0, 20),
                correlationId
            });

            // ✅ Call logout service with access token
            const result = await AuthService.logout(
                userId,
                sessionId || '',
                deviceId || '',
                accessToken, // ✅ Pass the actual token
                ipAddress,
                correlationId
            );

            // ✅ Clear cookies (if using cookie-based auth)
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

            LoggerUtil.info('Logout successful', {
                userId,
                sessionId,
                correlationId
            });

            ResponseUtil.success(
                res,
                result,
                'Logged out successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Logout controller failed', {
                error: error.message,
                stack: error.stack,
                userId,
                sessionId,
                correlationId,
            });

            // ✅ Handle specific error cases
            if (error.message === 'Session not found') {
                ResponseUtil.error(res, 'Invalid session', 400);
                return;
            }

            if (error.message === 'Session already terminated') {
                ResponseUtil.success(res, {
                    success: true,
                    message: 'Already logged out',
                    loggedOut: false
                }, 'Session already terminated');
                return;
            }

            ResponseUtil.error(
                res,
                error.message || 'Logout failed',
                500
            );
            return;
        }
    }

    /**
     * POST /api/v1/auth/logout-all
     * Logout from all devices
     * 
     * @param {Request} req - Express request
     * @param {Response} res - Express response
     * @returns {Promise<void>}
     */
    static async logoutAllDevices(req: Request & { user?: UserPayload }, res: Response): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const currentSessionId = req.user?.sessionId;
        const ipAddress = req.ip || (req as any).connection?.remoteAddress || 'unknown';

        // ✅ CRITICAL: Extract current access token from Authorization header
        const authHeader = req.headers.authorization as string;
        const currentAccessToken = authHeader ? authHeader.split(' ')[1] : null;

        try {
            // ✅ Validate authentication
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
                tokenPrefix: currentAccessToken.substring(0, 20),
                correlationId
            });

            // ✅ Call logout all service with current access token
            const result = await AuthService.logoutAll(
                userId,
                currentAccessToken,  // ✅ Pass current token to blacklist
                ipAddress,
                correlationId
            );

            // ✅ Clear cookies (if using cookie-based auth)
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
                devicesLoggedOut: result.devicesLoggedOut,
                sessionsTerminated: result.sessionsTerminated,
                correlationId
            });

            ResponseUtil.success(
                res,
                result,
                'Logged out from all devices successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Logout all devices controller failed', {
                error: error.message,
                stack: error.stack,
                userId,
                currentSessionId,
                correlationId,
            });

            // ✅ Handle specific error cases
            if (error.message.includes('No active sessions')) {
                ResponseUtil.success(res, {
                    success: true,
                    message: 'No active sessions to logout',
                    devicesLoggedOut: 0
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