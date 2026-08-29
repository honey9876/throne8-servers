// ../src/middleware/validation.middleware.ts
/**
 * validation.middleware.ts
 * Professional-level input validation middleware for auth-service-phase3-kafka
 * Validates request inputs using validator.util.ts
 * Compliant with NIST 800-63B and OWASP guidelines
 */

import { Request, Response, NextFunction } from 'express';
import ValidatorUtil from '@/shared/utils/validator.util';
import ResponseUtil from '@/shared/response.util';
import LoggerUtil from '@/shared/logger.util';
import { AuditLog } from '@/shared/models/index.models';
import ValidationUtil from '@/shared/validation.util';
import Joi from 'joi';
import Constants from '@/shared/constants.util';

interface ValidationSchema {
    [key: string]: {
        type: string;
        required: boolean;
        format?: string;
        minLength?: number;
        maxLength?: number;
        transform?: (value: any) => any;
        validate: (value: any) => boolean;
        error: string;
    };
}

const validationMiddleware = (schema: any, target: string = 'body') => async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = (req as any).session?.userId || null;
    const correlationId = (req as any).correlationId || req.headers['x-correlation-id'] || 'unknown';

    try {
        const data = (req as any)[target] || {};
        const validation = await ValidatorUtil.validate(data, schema, userId, ipAddress);

        if (!validation.isValid) {
            // Safe audit with valid enum values
            try {
                await AuditLog.logAction({
                    userId: String(null),
                    action: 'LOGIN_FAILED',     // Valid in schema
                    status: 'FAILURE',          // Valid: SUCCESS | FAILURE | WARNING
                    severity: 'MEDIUM',
                    ipAddress,
                    userAgent: req.headers['user-agent'] || 'unknown',
                    metadata: new Map([
                        ['errors', JSON.stringify(validation.errors)],
                        ['reason', 'validation_failed'],
                        ['path', req.path],
                        ['correlationId', correlationId]
                    ])
                });
            } catch (auditError: any) {
                LoggerUtil.error('Audit log failed in middleware', { error: auditError.message });
            }

            // Use your existing ResponseUtil method correctly
            return ResponseUtil.validationError(res, validation.errors, 'Validation failed');
        }

        LoggerUtil.info('Input validation successful', { userId, ipAddress, path: req.path, correlationId });
        next();

    } catch (error: any) {
        LoggerUtil.error('Validation middleware error', { error: error.message, userId, ipAddress, correlationId });

        try {
            await AuditLog.logAction({
                userId: String(null),
                action: 'LOGIN_FAILED',
                status: 'FAILURE',
                severity: 'HIGH',
                ipAddress,
                userAgent: req.headers['user-agent'] || 'unknown',
                metadata: new Map([
                    ['error', error.message],
                    ['reason', 'validation_exception'],
                    ['path', req.path],
                    ['correlationId', correlationId]
                ])
            });
        } catch (auditError: any) {
            LoggerUtil.error('Failed to log middleware exception', { error: auditError.message });
        }

        return ResponseUtil.error(res, 'Internal validation error', correlationId);
    }
};

// 📌 SCHEMAS

/**
 * Email Verification Token Schema (Joi)
 */
const emailVerificationTokenSchemaJoi = Joi.object({
    token: Joi.string()
        .length(64)
        .pattern(/^[0-9a-fA-F]{64}$/)
        .required()
        .messages({
            'string.length': 'Token must be exactly 64 characters',
            'string.pattern.base': 'Token must be hexadecimal',
            'any.required': 'Verification token is required',
        }),
});

/**
 * Email Verification OTP Schema (Joi)
 */
const emailVerificationOTPSchemaJoi = Joi.object({
    otp: Joi.string()
        .length(6)
        .pattern(/^\d{6}$/)
        .required()
        .messages({
            'string.length': 'OTP must be exactly 6 digits',
            'string.pattern.base': 'OTP must contain only numbers',
            'any.required': 'OTP is required',
        }),
});

/**
 * Resend Email Verification Schema (Joi)
 */
const resendEmailVerificationSchemaJoi = Joi.object({
    type: Joi.string()
        .valid('link', 'otp')
        .default('link')
        .messages({
            'any.only': 'Type must be either "link" or "otp"',
        }),
});

const loginSchema: ValidationSchema = {
    email: {
        type: 'string',
        required: true,
        format: 'email',
        minLength: 5,
        maxLength: 255,
        transform: (value: string) => value.toLowerCase().trim(),
        validate: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        error: 'Valid email is required',
    },
    password: {
        type: 'string',
        required: true,
        minLength: 8,
        maxLength: 128,
        validate: (value: string) =>
            /[A-Z]/.test(value) &&
            /[a-z]/.test(value) &&
            /[0-9]/.test(value) &&
            /[!@#$%^&*()_+\-=\[\]{}|;':"\\,.<>?]/.test(value),
        error: 'Password must be 8-128 characters with uppercase, lowercase, number, and special character',
    },
};

const oauthLoginSchema: ValidationSchema = {
    provider: {
        type: 'string',
        required: true,
        validate: (value: string) => ['google', 'facebook', 'github'].includes(value.toLowerCase()),
        transform: (value: string) => value.toLowerCase().trim(),
        error: 'Provider must be one of: google, facebook, github',
    },
    accessToken: {
        type: 'string',
        required: true,
        minLength: 10,
        maxLength: 4096,
        validate: (value: string) => /^[A-Za-z0-9\-_=+/]+\.?[A-Za-z0-9\-_=+/]*\.?[A-Za-z0-9\-_=+/]*$/.test(value),
        error: 'Valid access token is required',
    },
    redirectUri: {
        type: 'string',
        required: true,
        format: 'uri',
        minLength: 1,
        maxLength: 2048,
        validate: (value: string) => {
            try {
                const url = new URL(value);
                return ['http:', 'https:'].includes(url.protocol);
            } catch {
                return false;
            }
        },
        error: 'Valid redirect URI is required',
    },
};

const tokenRefreshSchema: ValidationSchema = {
    refreshToken: {
        type: 'string',
        required: true,
        format: 'uuid',
        validate: (value: string) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
        error: 'Valid UUID refresh token is required',
    },
    ipAddress: {
        type: 'string',
        required: false,
        format: 'ip',
        validate: (value: string) => {
            const ipv4 = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){2}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
            const ipv6 = /([a-fA-F\d]{1,4}:){7}[a-fA-F\d]{1,4}/;
            return ipv4.test(value) || ipv6.test(value);
        },
        error: 'Valid IP address is required',
    },
};

const tokenRevokeSchema: ValidationSchema = {
    token: {
        type: 'string',
        required: true,
        minLength: 10,
        maxLength: 4096,
        validate: (value: string) => /^[A-Za-z0-9\-_=+/]+\.?[A-Za-z0-9\-_=+/]*\.?[A-Za-z0-9\-_=+/]*$/.test(value),
        error: 'Valid token is required',
    },
};

const userUpdateSchema: ValidationSchema = {
    username: {
        type: 'string',
        required: false,
        minLength: 3,
        maxLength: 50,
        validate: (v: string) => /^[a-zA-Z0-9_]+$/.test(v),
        error: 'Username must be 3-50 characters and alphanumeric',
    },
    bio: {
        type: 'string',
        required: false,
        maxLength: 200,
        validate: () => true,
        error: 'Bio must be under 200 characters',
    },
    avatarUrl: {
        type: 'string',
        required: false,
        validate: (v: string) => v.startsWith('http://') || v.startsWith('https://'),
        error: 'Avatar URL must be a valid link',
    },
};

const userDeleteSchema: ValidationSchema = {
    userId: {
        type: 'string',
        required: true,
        format: 'uuid',
        validate: (value: string) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
        error: 'Valid user ID (UUID) is required',
    },
};

// ✅ NEW: Admin Action Schema
const adminActionSchema: ValidationSchema = {
    adminId: {
        type: 'string',
        required: true,
        format: 'uuid',
        validate: (value: string) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
        error: 'Valid admin ID is required',
    },
    targetUserId: {
        type: 'string',
        required: true,
        format: 'uuid',
        validate: (value: string) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
        error: 'Valid target user ID is required',
    },
    actionType: {
        type: 'string',
        required: true,
        validate: (value: string) => ['ban', 'promote', 'demote', 'warn'].includes(value.toLowerCase()),
        transform: (value: string) => value.toLowerCase().trim(),
        error: 'Action type must be one of: ban, promote, demote, warn',
    },
    reason: {
        type: 'string',
        required: true,
        minLength: 5,
        maxLength: 500,
        validate: () => true,
        error: 'Reason must be 5–500 characters long',
    },
};

// ✅ NEW: Analytics Query Schema
const analyticsQuerySchema: ValidationSchema = {
    startDate: {
        type: 'string',
        required: false,
        format: 'date',
        validate: (value: string) => {
            if (!value) return true;
            const date = new Date(value);
            return !isNaN(date.getTime()) && date <= new Date();
        },
        transform: (value: string) => value ? new Date(value).toISOString() : undefined,
        error: 'Start date must be a valid date in the past',
    },
    endDate: {
        type: 'string',
        required: false,
        format: 'date',
        validate: (value: string) => {
            if (!value) return true;
            const date = new Date(value);
            return !isNaN(date.getTime()) && date <= new Date();
        },
        transform: (value: string) => value ? new Date(value).toISOString() : undefined,
        error: 'End date must be a valid date in the past',
    },
};

// 📦 EXPORTS
export const validateLogin = validationMiddleware(ValidationUtil.loginSchema);


/**
 * ✅ FIXED: validateLogout Middleware
 * Validates logout request - checks for active session and valid user
 */

export const validateLogout = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = (req as any).user?.userId || null; // ✅ From AuthMiddleware
    const correlationId = (req as any).correlationId || req.headers['x-correlation-id'] || 'unknown';

    try {
        // ✅ Check if user is authenticated (from AuthMiddleware)
        if (!(req as any).user || !(req as any).user.userId) {
            LoggerUtil.warn('Logout validation failed - No authenticated user', {
                ipAddress,
                path: req.path,
                correlationId
            });

            try {
                await AuditLog.logAction({
                    userId: String(null),
                    action: 'LOGOUT_FAILED',
                    status: 'FAILURE',
                    severity: 'MEDIUM',
                    ipAddress,
                    userAgent: req.headers['user-agent'] || 'unknown',
                    metadata: new Map([
                        ['error', 'No authenticated user'],
                        ['reason', 'no_authenticated_user'],
                        ['path', req.path],
                        ['correlationId', correlationId]
                    ])
                });
            } catch (auditError: any) {
                LoggerUtil.error('Audit log failed', { error: auditError.message });
            }

            // ✅ FIXED: Direct ResponseUtil call (no res.status().json())
            return ResponseUtil.unauthorized(res, 'Authentication required');
        }

        LoggerUtil.info('Logout validation successful', {
            userId,
            ipAddress,
            path: req.path,
            correlationId
        });

        next();
    } catch (error: any) {
        LoggerUtil.error('Logout validation failed', {
            error: error.message,
            stack: error.stack,
            userId,
            ipAddress,
            correlationId
        });

        try {
            await AuditLog.logAction({
                userId: String(null),
                action: 'LOGOUT_FAILED',
                status: 'FAILURE',
                severity: 'HIGH',
                ipAddress,
                userAgent: req.headers['user-agent'] || 'unknown',
                metadata: new Map([
                    ['error', error.message],
                    ['reason', 'logout_validation_exception'],
                    ['path', req.path],
                    ['correlationId', correlationId]
                ])
            });
        } catch (auditError: any) {
            LoggerUtil.error('Audit log failed', { error: auditError.message });
        }

        // ✅ FIXED: Direct ResponseUtil call (no res.status().json())
        return ResponseUtil.internalError(res, 'Internal server error');
    }
};


export const validateOAuthLogin = validationMiddleware(oauthLoginSchema, 'body');
export const validateTokenRefresh = validationMiddleware(tokenRefreshSchema, 'body');
export const validateTokenRevoke = validationMiddleware(tokenRevokeSchema, 'body');
export const validateUserUpdate = validationMiddleware(userUpdateSchema, 'body');
export const validateUserDelete = validationMiddleware(userDeleteSchema, 'body');
export const validateAdminAction = validationMiddleware(adminActionSchema, 'body');
export const validateAnalyticsQuery = validationMiddleware(analyticsQuerySchema, 'query');

export default validationMiddleware;


// ==================== EMAIL VERIFICATION MIDDLEWARES ====================

/**
 * ✅ Validate Email Verification Token (Query Param)
 * Used for: GET /api/v1/auth/email/verify?token=xxx
 */
export const validateEmailVerificationToken = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const correlationId = (req as any).correlationId || req.headers['x-correlation-id'] || 'unknown';

    try {
        const data = req.query || {};

        // ✅ Use your existing ValidatorUtil.validate() method
        const validation = await ValidatorUtil.validate(
            data,
            emailVerificationTokenSchemaJoi,
            null,
            ipAddress
        );

        if (!validation.isValid) {
            LoggerUtil.warn('Email verification token validation failed', {
                errors: validation.errors,
                token: (req.query.token as string)?.substring(0, 16),
                ipAddress,
                path: req.path,
                correlationId,
            });

            try {
                await AuditLog.logAction({
                    userId: String(null),
                    action: 'LOGIN_FAILED',
                    status: 'FAILURE',
                    severity: 'MEDIUM',
                    ipAddress,
                    userAgent: req.headers['user-agent'] || 'unknown',
                    metadata: new Map([
                        ['errors', JSON.stringify(validation.errors)],
                        ['reason', 'invalid_verification_token'],
                        ['path', req.path],
                        ['correlationId', correlationId]
                    ])
                });
            } catch (auditError: any) {
                LoggerUtil.error('Audit log failed', { error: auditError.message });
            }

            return ResponseUtil.validationError(res, validation.errors, 'Invalid verification token');
        }

        LoggerUtil.info('Email verification token validation successful', {
            ipAddress,
            path: req.path,
            correlationId,
        });

        (req as any).validatedQuery = validation.data;
        next();
    } catch (error: any) {
        LoggerUtil.error('Email verification token validation error', {
            error: error.message,
            stack: error.stack,
            ipAddress,
            correlationId,
        });

        try {
            await AuditLog.logAction({
                userId: String(null),
                action: 'LOGIN_FAILED',
                status: 'FAILURE',
                severity: 'HIGH',
                ipAddress,
                userAgent: req.headers['user-agent'] || 'unknown',
                metadata: new Map([
                    ['error', error.message],
                    ['path', req.path],
                    ['correlationId', correlationId],
                    ['reason', 'token_validation_exception'],
                ]),
            });
        } catch (auditError: any) {
            LoggerUtil.error('Failed to log token validation exception', { error: auditError.message });
        }

        return ResponseUtil.internalError(res, 'Token validation failed');
    }
};

/**
 * ✅ Validate Email Verification OTP (Request Body)
 * Used for: POST /api/v1/auth/email/verify-otp
 */
export const validateEmailVerificationOTP = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = (req as any).user?.userId || null;
    const correlationId = (req as any).correlationId || req.headers['x-correlation-id'] || 'unknown';

    try {
        // Check authentication first
        if (!(req as any).user || !(req as any).user.userId) {
            LoggerUtil.warn('OTP validation failed - No authenticated user', {
                ipAddress,
                path: req.path,
                correlationId,
            });

            return ResponseUtil.unauthorized(res, 'Authentication required');
        }

        const data = req.body || {};

        // ✅ Use your existing ValidatorUtil.validate() method
        const validation = await ValidatorUtil.validate(
            data,
            emailVerificationOTPSchemaJoi,
            userId,
            ipAddress
        );

        if (!validation.isValid) {
            LoggerUtil.warn('Email OTP validation failed', {
                errors: validation.errors,
                userId,
                ipAddress,
                path: req.path,
                correlationId,
            });

            try {
                await AuditLog.logAction({
                    userId: String(null),
                    action: 'LOGIN_FAILED',
                    status: 'FAILURE',
                    severity: 'MEDIUM',
                    ipAddress,
                    userAgent: req.headers['user-agent'] || 'unknown',
                    metadata: new Map([
                        ['errors', JSON.stringify(validation.errors)],
                        ['reason', 'invalid_otp_format'],
                        ['path', req.path],
                        ['correlationId', correlationId]
                    ])
                });
            } catch (auditError: any) {
                LoggerUtil.error('Audit log failed', { error: auditError.message });
            }

            return ResponseUtil.validationError(res, validation.errors, 'Invalid OTP format');
        }

        LoggerUtil.info('Email OTP validation successful', {
            userId,
            ipAddress,
            path: req.path,
            correlationId,
        });

        (req as any).validatedBody = validation.data;
        next();
    } catch (error: any) {
        LoggerUtil.error('Email OTP validation error', {
            error: error.message,
            stack: error.stack,
            userId,
            ipAddress,
            correlationId,
        });

        try {
            await AuditLog.logAction({
                userId: String(null),
                action: 'LOGIN_FAILED',
                status: 'FAILURE',
                severity: 'HIGH',
                ipAddress,
                userAgent: req.headers['user-agent'] || 'unknown',
                metadata: new Map([
                    ['error', error.message],
                    ['reason', 'otp_validation_exception'],
                    ['path', req.path],
                    ['correlationId', correlationId]
                ])
            });
        } catch (auditError: any) {
            LoggerUtil.error('Failed to log OTP validation exception', { error: auditError.message });
        }

        return ResponseUtil.internalError(res, 'OTP validation failed');
    }
};

/**
 * ✅ Validate Resend Email Verification (Request Body)
 * Used for: POST /api/v1/auth/email/resend
 */
export const validateResendEmailVerification = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = (req as any).user?.userId || null;
    const correlationId = (req as any).correlationId || req.headers['x-correlation-id'] || 'unknown';

    try {
        // Check authentication first
        if (!(req as any).user || !(req as any).user.userId) {
            LoggerUtil.warn('Resend validation failed - No authenticated user', {
                ipAddress,
                path: req.path,
                correlationId,
            });

            return ResponseUtil.unauthorized(res, 'Authentication required');
        }

        const data = req.body || {};

        // ✅ Use your existing ValidatorUtil.validate() method
        const validation = await ValidatorUtil.validate(
            data,
            resendEmailVerificationSchemaJoi,
            userId,
            ipAddress
        );

        if (!validation.isValid) {
            LoggerUtil.warn('Resend email verification validation failed', {
                errors: validation.errors,
                userId,
                ipAddress,
                path: req.path,
                correlationId,
            });

            try {
                await AuditLog.logAction({
                    userId: String(null),
                    action: 'LOGIN_FAILED',
                    status: 'FAILURE',
                    severity: 'MEDIUM',
                    ipAddress,
                    userAgent: req.headers['user-agent'] || 'unknown',
                    metadata: new Map([
                        ['errors', JSON.stringify(validation.errors)],
                        ['reason', 'invalid_verification_token'],
                        ['path', req.path],
                        ['correlationId', correlationId]
                    ])
                });
            } catch (auditError: any) {
                LoggerUtil.error('Audit log failed', { error: auditError.message });
            }

            return ResponseUtil.validationError(res, validation.errors, 'Invalid resend request');
        }

        LoggerUtil.info('Resend email verification validation successful', {
            userId,
            ipAddress,
            path: req.path,
            type: validation.data.type || 'link',
            correlationId,
        });

        (req as any).validatedBody = validation.data;
        next();
    } catch (error: any) {
        LoggerUtil.error('Resend email verification validation error', {
            error: error.message,
            stack: error.stack,
            userId,
            ipAddress,
            correlationId,
        });

        try {
            await AuditLog.logAction({
                userId: String(null),
                action: 'LOGIN_FAILED',
                status: 'FAILURE',
                severity: 'HIGH',
                ipAddress,
                userAgent: req.headers['user-agent'] || 'unknown',
                metadata: new Map([
                    ['error', error.message],
                    ['reason', 'token_validation_exception'],
                    ['path', req.path],
                    ['correlationId', correlationId]
                ])
            });
        } catch (auditError: any) {
            LoggerUtil.error('Failed to log resend validation exception', { error: auditError.message });
        }

        return ResponseUtil.internalError(res, 'Resend validation failed');
    }
};

// ==================== EXPORT ALIASES ====================
// These aliases match the import names used in routes

/**
 * Alias for validateEmailVerificationOTP, validateResendEmailVerification
 * Used in routes as: validateOTPMiddleware, validateResendMiddleware
 */
export const validateOTPMiddleware = validateEmailVerificationOTP;
export const validateResendMiddleware = validateResendEmailVerification;


// ==================== ACTIVITY VALIDATIONS ====================

/**
 * Validate create post request
 */
export const validateCreatePost = (req: Request, res: Response, next: NextFunction) => {
    const baseSchema = Joi.object({
        title: Joi.string()
            .min(Constants.ACTIVITY_VALIDATION.POST.TITLE_MIN_LENGTH)
            .max(Constants.ACTIVITY_VALIDATION.POST.TITLE_MAX_LENGTH)
            .pattern(Constants.ACTIVITY_VALIDATION.POST.TITLE_PATTERN)
            .required()
            .messages({
                'string.min': `Title must be at least ${Constants.ACTIVITY_VALIDATION.POST.TITLE_MIN_LENGTH} character`,
                'string.max': `Title cannot exceed ${Constants.ACTIVITY_VALIDATION.POST.TITLE_MAX_LENGTH} characters`,
                'string.pattern.base': 'Title must start with a capital letter',
                'any.required': 'Title is required',
            }),
        content: Joi.string()
            .max(Constants.ACTIVITY_VALIDATION.POST.CONTENT_MAX_LENGTH)
            .optional()
            .allow(''),

        mood: Joi.string()
            .valid('happy', 'thoughtful', 'excited', 'reflective', 'grateful')
            .optional()
            .allow(null)
            .messages({
                'any.only': 'Mood must be one of: happy, thoughtful, excited, reflective, grateful',
            }),

        isPublic: Joi.boolean()
            .optional()
            .default(true),

        // ✅ POLL VALIDATION
        pollData: Joi.object({
            question: Joi.string()
                .max(Constants.ACTIVITY_VALIDATION.POLL.QUESTION_MAX_LENGTH)
                .required()
                .messages({
                    'string.max': 'Poll question cannot exceed 140 characters',
                    'any.required': 'Poll question is required'
                }),
            options: Joi.array()
                .items(
                    Joi.string()
                        .max(Constants.ACTIVITY_VALIDATION.POLL.OPTION_MAX_LENGTH)
                        .required()
                )
                .min(Constants.ACTIVITY_VALIDATION.POLL.MIN_OPTIONS)
                .max(Constants.ACTIVITY_VALIDATION.POLL.MAX_OPTIONS)
                .required()
                .messages({
                    'array.min': 'Poll must have at least 2 options',
                    'array.max': 'Poll cannot have more than 4 options',
                    'string.max': 'Option cannot exceed 100 characters'
                }),
            duration: Joi.number()
                .valid(...Constants.ACTIVITY_VALIDATION.POLL.ALLOWED_DURATIONS)
                .required()
                .messages({
                    'any.only': 'Duration must be 1, 3, 7, or 14 days'
                })
        }).optional(),

        // ✅ SCHEDULED POST VALIDATION
        scheduledFor: Joi.date()
            .min('now')
            .max(Joi.ref('$maxDate'))
            .optional()
            .messages({
                'date.min': 'Scheduled time must be in the future',
                'date.max': 'Cannot schedule more than 1 year in advance'
            }),

        // ✅ EVENT VALIDATION
        eventData: Joi.object({
            eventType: Joi.string()
                .valid(...Constants.ACTIVITY_VALIDATION.EVENT.ALLOWED_TYPES)
                .required(),
            eventFormat: Joi.string()
                .valid(...Constants.ACTIVITY_VALIDATION.EVENT.ALLOWED_FORMATS)
                .required(),
            eventName: Joi.string()
                .max(Constants.ACTIVITY_VALIDATION.EVENT.NAME_MAX_LENGTH)
                .required()
                .messages({
                    'string.max': 'Event name cannot exceed 75 characters'
                }),
            timezone: Joi.string().default('UTC'),
            startDate: Joi.date()
                .min('now')
                .required()
                .messages({
                    'date.min': 'Event start date must be in the future'
                }),
            startTime: Joi.string()
                .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
                .required()
                .messages({
                    'string.pattern.base': 'Invalid time format. Use HH:MM (24-hour)'
                }),
            endDate: Joi.date()
                .min(Joi.ref('startDate'))
                .optional(),
            endTime: Joi.string()
                .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
                .optional(),
            description: Joi.string()
                .max(Constants.ACTIVITY_VALIDATION.EVENT.DESCRIPTION_MAX_LENGTH)
                .optional(),
            location: Joi.object({
                venue: Joi.string().optional(),
                address: Joi.string().optional(),
                city: Joi.string().optional(),
                country: Joi.string().optional(),
                coordinates: Joi.object({
                    lat: Joi.number().min(-90).max(90),
                    lng: Joi.number().min(-180).max(180)
                }).optional()
            }).optional(),
            registrationLink: Joi.string().uri().optional(),
            maxAttendees: Joi.number().min(1).optional()
        }).optional()
    });

    // Max future date for scheduling
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);

    const { error, value } = baseSchema.validate(req.body, {
        abortEarly: false,
        context: { maxDate }
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

/**
 * Validate create home post request
 */
export const validateCreateHomePost = (req: Request, res: Response, next: NextFunction) => {
    const schema = Joi.object({
        title: Joi.string()
            .min(1)
            .max(300)
            .pattern(/^[A-Z].*/)
            .required()
            .messages({
                'string.min': 'Title must be at least 1 character',
                'string.max': 'Title cannot exceed 300 characters',
                'string.pattern.base': 'Title must start with a capital letter',
                'any.required': 'Title is required',
            }),

        content: Joi.string()
            .max(10000)
            .optional()
            .allow(''),

        mood: Joi.string()
            .valid('happy', 'thoughtful', 'excited', 'reflective', 'grateful')
            .optional()
            .allow(null)
            .messages({
                'any.only': 'Mood must be one of: happy, thoughtful, excited, reflective, grateful',
            }),

        isPublic: Joi.boolean()
            .optional()
            .default(true),

        scheduledFor: Joi.date()
            .min('now')
            .optional()
            .messages({
                'date.min': 'Scheduled time must be in the future',
            }),

        pollData: Joi.object({
            question: Joi.string().max(140).required(),
            options: Joi.array()
                .items(Joi.string().max(100).required())
                .min(2)
                .max(4)
                .required(),
            duration: Joi.number()
                .valid(1, 3, 7, 14)
                .required(),
        }).optional(),

        eventData: Joi.object({
            eventType: Joi.string()
                .valid('online', 'in-person', 'hybrid')
                .required(),
            eventFormat: Joi.string()
                .valid('conference', 'webinar', 'workshop', 'meetup', 'seminar', 'other')
                .required(),
            eventName: Joi.string().max(75).required(),
            timezone: Joi.string().default('UTC'),
            startDate: Joi.date().min('now').required(),
            startTime: Joi.string()
                .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
                .required(),
            endDate: Joi.date().optional(),
            endTime: Joi.string()
                .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
                .optional(),
            description: Joi.string().max(5000).optional(),
            location: Joi.object({
                venue: Joi.string().optional(),
                address: Joi.string().optional(),
                city: Joi.string().optional(),
                country: Joi.string().optional(),
            }).optional(),
            registrationLink: Joi.string().uri().optional(),
            maxAttendees: Joi.number().min(1).optional(),
        }).optional(),
    });

    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

/**
 * Validate update post request
 */
export const validateUpdatePost = (req: Request, res: Response, next: NextFunction) => {
    const schema = Joi.object({
        title: Joi.string()
            .min(Constants.ACTIVITY_VALIDATION.POST.TITLE_MIN_LENGTH)
            .max(Constants.ACTIVITY_VALIDATION.POST.TITLE_MAX_LENGTH)
            .optional()
            .messages({
                'string.min': `Title must be at least ${Constants.ACTIVITY_VALIDATION.POST.TITLE_MIN_LENGTH} character`,
                'string.max': `Title cannot exceed ${Constants.ACTIVITY_VALIDATION.POST.TITLE_MAX_LENGTH} characters`,
            }),
        content: Joi.string()
            .max(Constants.ACTIVITY_VALIDATION.POST.CONTENT_MAX_LENGTH)
            .optional()
            .allow('')
            .messages({
                'string.max': `Content cannot exceed ${Constants.ACTIVITY_VALIDATION.POST.CONTENT_MAX_LENGTH} characters`,
            }),
    }).min(1).messages({
        'object.min': 'At least one field (title or content) must be provided',
    });

    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

/**
 * Validate create comment request
 */
export const validateCreateComment = (req: Request, res: Response, next: NextFunction) => {
    const schema = Joi.object({
        postId: Joi.string()
            .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
            .required()
            .messages({
                'string.pattern.base': 'Invalid post ID format',
                'any.required': 'Post ID is required',
            }),
        content: Joi.string()
            .min(Constants.ACTIVITY_VALIDATION.COMMENT.MIN_LENGTH)
            .max(Constants.ACTIVITY_VALIDATION.COMMENT.MAX_LENGTH)
            .required()
            .messages({
                'string.min': `Comment must be at least ${Constants.ACTIVITY_VALIDATION.COMMENT.MIN_LENGTH} character`,
                'string.max': `Comment cannot exceed ${Constants.ACTIVITY_VALIDATION.COMMENT.MAX_LENGTH} characters`,
                'any.required': 'Comment content is required',
            }),
    });

    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

/**
 * Validate update comment request
 */
export const validateUpdateComment = (req: Request, res: Response, next: NextFunction) => {
    const schema = Joi.object({
        content: Joi.string()
            .min(Constants.ACTIVITY_VALIDATION.COMMENT.MIN_LENGTH)
            .max(Constants.ACTIVITY_VALIDATION.COMMENT.MAX_LENGTH)
            .required()
            .messages({
                'string.min': `Comment must be at least ${Constants.ACTIVITY_VALIDATION.COMMENT.MIN_LENGTH} character`,
                'string.max': `Comment cannot exceed ${Constants.ACTIVITY_VALIDATION.COMMENT.MAX_LENGTH} characters`,
                'any.required': 'Comment content is required',
            }),
    });

    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

export const validateCreateReply = (req: Request, res: Response, next: NextFunction) => {
    const schema = Joi.object({
        content: Joi.string()
            .min(Constants.ACTIVITY_VALIDATION.COMMENT.MIN_LENGTH)
            .max(Constants.ACTIVITY_VALIDATION.COMMENT.MAX_LENGTH)
            .required()
            .messages({
                'string.min': `Reply must be at least ${Constants.ACTIVITY_VALIDATION.COMMENT.MIN_LENGTH} character`,
                'string.max': `Reply cannot exceed ${Constants.ACTIVITY_VALIDATION.COMMENT.MAX_LENGTH} characters`,
                'any.required': 'Reply content is required',
            }),
    });

    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

/**
 * Validate vote poll request
 */
export const validateVotePoll = (req: Request, res: Response, next: NextFunction) => {
    const schema = Joi.object({
        optionId: Joi.string()
            .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
            .required()
            .messages({
                'string.pattern.base': 'Invalid option ID format',
                'any.required': 'Option ID is required',
            }),
    });

    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};


// validation.middleware.ts ke end mein add karo

export const validateCreateRepost = (req: Request, res: Response, next: NextFunction) => {
    const schema = Joi.object({
        type: Joi.string()
            .valid('repost', 'quote')
            .default('repost')
            .messages({
                'any.only': 'Type must be either "repost" or "quote"',
            }),
        thoughtText: Joi.when('type', {
            is: 'quote',
            then: Joi.string()
                .min(1)
                .max(3000)
                .required()
                .messages({
                    'any.required': 'Thought text is required for quote repost',
                    'string.max': 'Thought text cannot exceed 3000 characters',
                }),
            otherwise: Joi.string().optional().allow('', null),
        }),
        visibility: Joi.string()
            .valid('public', 'connections', 'private')
            .default('public'),
        repostSource: Joi.string()
            .valid('feed', 'profile', 'search', 'other')
            .default('feed'),
    });

    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};