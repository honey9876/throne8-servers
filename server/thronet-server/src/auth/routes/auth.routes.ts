/**
 * auth.routes.ts
 * Authentication routes: register, login, refresh, logout, profile, OAuth.
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import Constants from '@/shared/constants.util';
import { AuthController } from '@/shared/controllers/index.controllers';
import {
    validateLogin,
    validateLogout,
} from '@/shared/middlewares/validation.middleware';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import LoggerUtil from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { setAuthCookies, shouldExposeTokensInBody } from '../../shared/utils/authCookies.util';
import { User, Session } from '@/shared/models/index.models';
import passport from '@/config/oauth/passport.config';
import { csrfProtection } from '@/config/security/csrf.config';
import { updateDateOfBirth } from '../controllers/dob.controller';
import { googleVerifyController, googleRegisterController } from '../controllers/googleAuth.controller';
import { DeviceRepository, SessionRepository } from '../repository/auth.repository';
import {
    normalizeEmail,
    normalizePhone,
    RegistrationField,
} from '../utils/registrationIdentity';

const router = express.Router();

// ==================== MIDDLEWARE ====================

// In fields ko kabhi modify nahi karte (password ko <, > ya trim se badalna nahi chahiye)
const SKIP_SANITIZE_FIELDS = new Set([
    'password',
    'confirmPassword',
    'currentPassword',
    'newPassword',
    'refreshToken',
    'idToken',
    'credential',
    'token',
]);

const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
        Object.keys(req.body).forEach((key) => {
            if (SKIP_SANITIZE_FIELDS.has(key)) return;
            if (typeof req.body[key] === 'string') {
                req.body[key] = (req.body[key] as string).replace(/[<>]/g, '').trim();
            }
        });
    }
    next();
};

const trimRegistrationInput = (req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
        Object.keys(req.body).forEach((key) => {
            if (SKIP_SANITIZE_FIELDS.has(key)) return;
            if (typeof req.body[key] === 'string') {
                req.body[key] = (req.body[key] as string).trim();
            }
        });
    }
    next();
};

/**
 * Controller errors ko next() tak pahunchata hai
 */
const handle =
    (fn: (req: any, res: Response) => Promise<unknown>) =>
        (req: Request, res: Response, next: NextFunction) => {
            Promise.resolve(fn(req, res)).catch(next);
        };

// ==================== HELPERS ====================

const getMonthsDifference = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (end.getUTCMonth() - start.getUTCMonth());
};

const SAFE_TEXT_PATTERN = /^[^\p{Cc}<>]+$/u;
const NAME_PATTERN = /^[\p{L} .'-]+$/u;
const LOCATION_PATTERN = /^[\p{L} ,.-]+$/u;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isValidDateOnly = (value: string): boolean => {
    if (!DATE_ONLY_PATTERN.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const utcToday = (): string => new Date().toISOString().slice(0, 10);
const earliestStartDate = (): string => {
    const today = new Date();
    return new Date(Date.UTC(
        today.getUTCFullYear() - 50,
        today.getUTCMonth(),
        today.getUTCDate()
    )).toISOString().slice(0, 10);
};
const REGISTRATION_FIELDS = new Set<RegistrationField>([
    'email', 'password', 'confirmPassword', 'firstName', 'lastName',
    'phoneNumber', 'location', 'userType', 'jobTitle', 'companyName',
    'startDate', 'endDate', 'collegeName', 'degree', 'fieldOfStudy',
    'graduationYear', 'highestEducation', 'preferredRole', 'cgpa',
]);

/**
 * OAuth (browser flow) ke baad tokens issue karta hai, hamesha session + device ke saath
 * (warna refresh 15 minute baad fail hoga).
 */
async function issueOAuthTokens(
    req: Request,
    user: any
): Promise<{ accessToken: string; refreshToken: string }> {
    const ipAddress = req.ip || '0.0.0.0';
    const userAgent = (req.headers['user-agent'] as string) || 'Unknown';

    let sessionId: string | undefined = user.sessionId;
    let deviceId: string | undefined = user.deviceId;

    if (!sessionId || !deviceId) {
        const device = await DeviceRepository.registerDevice(user.userId, {
            deviceType: 'desktop',
            deviceName: 'OAuth Login',
            os: 'Unknown',
            browser: 'Unknown',
            userAgent,
        } as any);

        const session = await SessionRepository.createSession({
            userId: user.userId,
            ipAddress,
            deviceId: device.deviceId,
            sessionType: 'oauth',
            deviceInfo: { userAgent },
        });

        sessionId = session._id;
        deviceId = device.deviceId;
    }

    const payload = {
        userId: user.userId,
        role: user.role || 'user',
        sessionId: sessionId as string,
        deviceId: deviceId as string,
    };

    const accessToken = User.generateAccessToken(payload);
    const refreshToken = User.generateRefreshToken(payload);

    try {
        await Session.setRefreshToken(sessionId as string, refreshToken);
    } catch (err: any) {
        LoggerUtil.error('Saving OAuth refresh token hash failed (non-critical)', {
            error: err.message,
            userId: user.userId,
        });
    }

    return { accessToken, refreshToken };
}

// ==================== REGISTRATION VALIDATION SCHEMA ====================

const registerSchema = Joi.object({
    // Basic fields
    email: Joi.string()
        .email()
        .custom((value) => normalizeEmail(value))
        .required()
        .messages({
            'string.email': 'Invalid email format',
            'string.empty': 'Email cannot be empty',
            'any.required': 'Email is required',
        }),

    password: Joi.string()
        .min(Constants.PASSWORD_POLICY.MIN_LENGTH)
        .max(Constants.PASSWORD_POLICY.MAX_LENGTH)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .required()
        .messages({
            'string.min': `Password must be at least ${Constants.PASSWORD_POLICY.MIN_LENGTH} characters`,
            'string.max': `Password cannot exceed ${Constants.PASSWORD_POLICY.MAX_LENGTH} characters`,
            'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character (@$!%*?&)',
            'string.empty': 'Password cannot be empty',
            'any.required': 'Password is required',
        }),

    confirmPassword: Joi.string()
        .valid(Joi.ref('password'))
        .required()
        .messages({
            'any.only': 'Passwords do not match',
            'string.empty': 'Password confirmation cannot be empty',
            'any.required': 'Password confirmation is required',
        }),

    firstName: Joi.string()
        .min(2)
        .max(50)
        .pattern(NAME_PATTERN)
        .trim()
        .required()
        .messages({
            'string.min': 'First name must be at least 2 characters',
            'string.max': 'First name cannot exceed 50 characters',
            'string.pattern.base': 'Name can only contain Unicode letters, spaces, hyphens, apostrophes, and periods',
            'string.empty': 'First name cannot be empty',
            'any.required': 'First name is required',
        }),

    lastName: Joi.string()
        .min(2)
        .max(50)
        .pattern(NAME_PATTERN)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.min': 'Last name must be at least 2 characters',
            'string.max': 'Last name cannot exceed 50 characters',
            'string.pattern.base': 'Name can only contain Unicode letters, spaces, hyphens, apostrophes, and periods',
        }),

    location: Joi.string()
        .min(2)
        .max(100)
        .pattern(LOCATION_PATTERN)
        .trim()
        .required()
        .messages({
            'string.min': 'Location must be at least 2 characters',
            'string.max': 'Location cannot exceed 100 characters',
            'string.pattern.base': 'Location can only contain Unicode letters, spaces, commas, periods, and hyphens',
            'string.empty': 'Location cannot be empty',
            'any.required': 'Location is required',
        }),

    phoneNumber: Joi.string()
        .custom((value, helpers) => {
            try {
                return normalizePhone(value);
            } catch {
                return helpers.error('any.invalid');
            }
        })
        .required()
        .messages({
            'any.invalid': 'Enter a valid phone number: use + and country code, or a 10-digit Indian mobile number.',
            'string.empty': 'Phone number is required',
            'any.required': 'Phone number is required',
        }),

    // Onboarding
    userType: Joi.string()
        .valid(...Constants.ONBOARDING.USER_TYPES)
        .required()
        .messages({
            'any.only': 'User type must be one of: working, student, or fresher',
            'any.required': 'User type is required',
        }),

    // Working professional fields
    jobTitle: Joi.when('userType', {
        is: 'working',
        then: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(SAFE_TEXT_PATTERN)
            .required()
            .messages({
                'string.min': 'Job title must be at least 2 characters',
                'string.max': 'Job title cannot exceed 100 characters',
                'string.pattern.base': 'Enter a job title without HTML or control characters',
                'any.required': 'Job title is required for working professionals',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'Job title is not allowed for this user type',
            }),
    }),

    companyName: Joi.when('userType', {
        is: 'working',
        then: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(SAFE_TEXT_PATTERN)
            .required()
            .messages({
                'string.min': 'Company name must be at least 2 characters',
                'string.max': 'Company name cannot exceed 100 characters',
                'string.pattern.base': 'Enter a company name without HTML or control characters',
                'any.required': 'Company name is required for working professionals',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'Company name is not allowed for this user type',
            }),
    }),

    startDate: Joi.when('userType', {
        is: 'working',
        then: Joi.string()
            .trim()
            .pattern(DATE_ONLY_PATTERN)
            .custom((value, helpers) => {
                if (!DATE_ONLY_PATTERN.test(value)) return value;
                if (!isValidDateOnly(value)) return helpers.error('date.base');
                if (value > utcToday()) return helpers.error('date.max');
                if (value < earliestStartDate()) return helpers.error('date.min');
                return value;
            })
            .required()
            .messages({
                'date.base': 'Start date must be a valid date',
                'date.format': 'Start date must be in YYYY-MM-DD format',
                'string.pattern.base': 'Start date must be in YYYY-MM-DD format',
                'date.max': 'Start date cannot be in the future',
                'date.min': 'Start date cannot be more than 50 years ago',
                'any.required': 'Start date is required for working professionals',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'Start date is not allowed for this user type',
            }),
    }),

    endDate: Joi.when('userType', {
        is: 'working',
        then: Joi.string()
            .trim()
            .pattern(DATE_ONLY_PATTERN)
            .optional()
            .allow(null, '')
            .custom((value, helpers) => {
                if (value === null || value === '') return value;
                if (!DATE_ONLY_PATTERN.test(value)) return value;
                if (!isValidDateOnly(value)) return helpers.error('date.base');
                if (value > utcToday()) return helpers.error('date.max');

                const startDate = helpers.state.ancestors[0].startDate;
                if (!startDate) return value;

                if (value < startDate) return helpers.error('date.min');
                const monthsDiff = getMonthsDifference(startDate, value);

                if (monthsDiff < Constants.ONBOARDING.WORKING.MIN_JOB_DURATION_MONTHS) {
                    return helpers.error('any.invalid', {
                        message: `Minimum job duration is ${Constants.ONBOARDING.WORKING.MIN_JOB_DURATION_MONTHS} month`,
                    });
                }

                return value;
            })
            .messages({
                'date.base': 'End date must be a valid date',
                'date.format': 'End date must be in YYYY-MM-DD format',
                'string.pattern.base': 'End date must be in YYYY-MM-DD format',
                'date.min': 'End date must be after start date',
                'date.max': 'End date cannot be in the future',
                'any.invalid': 'Minimum 1 month job duration is required',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'End date is not allowed for this user type',
            }),
    }),

    // Student fields
    collegeName: Joi.when('userType', {
        is: 'student',
        then: Joi.string()
            .min(3)
            .max(100)
            .trim()
            .pattern(SAFE_TEXT_PATTERN)
            .required()
            .messages({
                'string.min': 'College name must be at least 3 characters',
                'string.max': 'College name cannot exceed 100 characters',
                'string.pattern.base': 'Enter a college name without HTML or control characters',
                'string.empty': 'College name cannot be empty',
                'any.required': 'College name is required for students',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'College name is not allowed for this user type',
            }),
    }),

    degree: Joi.when('userType', {
        is: 'student',
        then: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(SAFE_TEXT_PATTERN)
            .required()
            .messages({
                'string.min': 'Degree must be at least 2 characters',
                'string.max': 'Degree cannot exceed 100 characters',
                'string.pattern.base': 'Enter a degree without HTML or control characters',
                'any.required': 'Degree is required for students',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'Degree is not allowed for this user type',
            }),
    }),

    fieldOfStudy: Joi.when('userType', {
        is: 'student',
        then: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(SAFE_TEXT_PATTERN)
            .required()
            .messages({
                'string.min': 'Field of study must be at least 2 characters',
                'string.max': 'Field of study cannot exceed 100 characters',
                'string.pattern.base': 'Enter a field of study without HTML or control characters',
                'any.required': 'Field of study is required for students',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'Field of study is not allowed for this user type',
            }),
    }),

    graduationYear: Joi.when('userType', {
        is: 'student',
        then: Joi.string()
            .pattern(Constants.ONBOARDING.STUDENT.GRAD_YEAR_PATTERN)
            .custom((value, helpers) => {
                const year = parseInt(value);
                if (year < Constants.ONBOARDING.STUDENT.MIN_GRAD_YEAR ||
                    year > Constants.ONBOARDING.STUDENT.MAX_GRAD_YEAR) {
                    return helpers.error('any.invalid', {
                        message: `Graduation year must be between ${Constants.ONBOARDING.STUDENT.MIN_GRAD_YEAR} and ${Constants.ONBOARDING.STUDENT.MAX_GRAD_YEAR}`,
                    });
                }
                return value;
            })
            .required()
            .messages({
                'string.pattern.base': 'Graduation year must be a 4-digit year (e.g., 2025)',
                'string.empty': 'Graduation year cannot be empty',
                'any.required': 'Graduation year is required for students',
                'any.invalid': `Graduation year must be between ${Constants.ONBOARDING.STUDENT.MIN_GRAD_YEAR} and ${Constants.ONBOARDING.STUDENT.MAX_GRAD_YEAR}`,
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'Graduation year is not allowed for this user type',
            }),
    }),

    // Fresher fields
    highestEducation: Joi.when('userType', {
        is: 'fresher',
        then: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(SAFE_TEXT_PATTERN)
            .required()
            .messages({
                'string.min': 'Highest education must be at least 2 characters',
                'string.max': 'Highest education cannot exceed 100 characters',
                'string.pattern.base': 'Enter an education level without HTML or control characters',
                'any.required': 'Highest education is required for freshers',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'Highest education is not allowed for this user type',
            }),
    }),

    preferredRole: Joi.when('userType', {
        is: 'fresher',
        then: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .pattern(SAFE_TEXT_PATTERN)
            .required()
            .messages({
                'string.min': 'Preferred role must be at least 2 characters',
                'string.max': 'Preferred role cannot exceed 100 characters',
                'string.pattern.base': 'Enter a preferred role without HTML or control characters',
                'any.required': 'Preferred job role is required for freshers',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'Preferred role is not allowed for this user type',
            }),
    }),

    cgpa: Joi.when('userType', {
        is: 'fresher',
        then: Joi.string()
            .pattern(Constants.ONBOARDING.FRESHER.CGPA_PATTERN)
            .optional()
            .allow(null, '')
            .messages({
                'string.pattern.base': 'CGPA must be between 0.00 and 10.00',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'CGPA is not allowed for this user type',
            }),
    }),

    // Device info (optional)
    deviceType: Joi.string().optional().allow(''),
    deviceName: Joi.string().optional().allow(''),
    os: Joi.string().optional().allow(''),
    browser: Joi.string().optional().allow(''),

    // Verification token from pre-registration email verification
    verificationToken: Joi.string()
        .required()
        .messages({
            'string.empty': 'Verification token cannot be empty',
            'any.required': 'Verification token is required. Please verify your email first.',
        }),
});

const sendRegistrationOtpSchema = Joi.object({
    email: Joi.string()
        .email()
        .lowercase()
        .trim()
        .required()
        .messages({
            'string.email': 'Invalid email format',
            'string.empty': 'Email cannot be empty',
            'any.required': 'Email is required',
        }),
    firstName: Joi.string().optional().allow(''),
});

const verifyRegistrationOtpSchema = Joi.object({
    email: Joi.string()
        .email()
        .lowercase()
        .trim()
        .required()
        .messages({
            'string.email': 'Invalid email format',
            'string.empty': 'Email cannot be empty',
            'any.required': 'Email is required',
        }),
    otp: Joi.string()
        .length(6)
        .pattern(/^\d{6}$/)
        .required()
        .messages({
            'string.length': 'OTP must be exactly 6 digits',
            'string.pattern.base': 'OTP must contain only numbers',
            'string.empty': 'OTP cannot be empty',
            'any.required': 'OTP is required',
        }),
});

const validateSendRegistrationOtp = (req: Request, res: Response, next: NextFunction) => {
    const { error } = sendRegistrationOtpSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
        return ResponseUtil.validationError(res, error.details.map((d) => d.message), 'Validation failed');
    }
    next();
};

const validateVerifyRegistrationOtp = (req: Request, res: Response, next: NextFunction) => {
    const { error } = verifyRegistrationOtpSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
        return ResponseUtil.validationError(res, error.details.map((d) => d.message), 'Validation failed');
    }
    next();
};

const validateRegistration = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = registerSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map((detail) => detail.message);

        LoggerUtil.warn('Registration validation failed', {
            errors,
            userType: req.body?.userType,
            ipAddress: req.ip,
        });

        const fieldErrors = error.details.flatMap((detail) => {
            const field = detail.path[0];
            return typeof field === 'string' && REGISTRATION_FIELDS.has(field as RegistrationField)
                ? [{ field: field as RegistrationField, message: detail.message }]
                : [];
        });
        return ResponseUtil.validationError(
            res,
            errors,
            'Registration validation failed',
            fieldErrors
        );
    }

    req.body = value;
    next();
};

// ==================== ADMIN USERS QUERY VALIDATION ====================

const getAllUsersQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('active', 'inactive', 'suspended', 'deleted'),
    role: Joi.string().valid('user', 'admin', 'moderator', 'mentor'),
    userType: Joi.string().valid('working', 'student', 'fresher'),
    location: Joi.string().min(2).max(50),
    search: Joi.string().min(2).max(100),
    sortBy: Joi.string().valid('newest', 'oldest', 'name', 'email').default('newest'),
});

const validateGetAllUsersQuery = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = getAllUsersQuerySchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map((detail) => detail.message);
        return ResponseUtil.validationError(res, errors, 'Invalid query parameters');
    }

    // Express 5 mein req.query getter-only hota hai, isliye defineProperty
    Object.defineProperty(req, 'query', {
        value,
        writable: true,
        configurable: true,
        enumerable: true,
    });
    next();
};

// ==================== UPDATE PROFILE / DEACTIVATE / DELETE SCHEMAS ====================

// Email aur password yahan allowed nahi (stripUnknown unhe hata deta hai).
// Unhe badalne ke liye verified OTP flows use hote hain.
const updateProfileSchema = Joi.object({
    phoneNumber: Joi.string()
        .pattern(/^\+?[1-9]\d{1,14}$/)
        .allow(null, '')
        .optional()
        .messages({
            'string.pattern.base': 'Invalid phone number format (E.164 format required, e.g., +919876543210)',
        }),

    firstName: Joi.string()
        .min(2)
        .max(50)
        .pattern(/^[a-zA-Z\s\-']+$/)
        .trim()
        .optional()
        .messages({
            'string.min': 'First name must be at least 2 characters',
            'string.max': 'First name cannot exceed 50 characters',
            'string.pattern.base': 'First name can only contain letters, spaces, hyphens, and apostrophes',
        }),

    lastName: Joi.string()
        .min(2)
        .max(50)
        .pattern(/^[a-zA-Z\s\-']+$/)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.min': 'Last name must be at least 2 characters',
            'string.max': 'Last name cannot exceed 50 characters',
            'string.pattern.base': 'Last name can only contain letters, spaces, hyphens, and apostrophes',
        }),

    location: Joi.string()
        .min(2)
        .max(50)
        .pattern(/^[A-Za-z][A-Za-z\s\-,.'()]{1,49}$/)
        .trim()
        .optional()
        .messages({
            'string.min': 'Location must be at least 2 characters',
            'string.max': 'Location cannot exceed 50 characters',
            'string.pattern.base': "Location can contain only letters, spaces and these characters: - , . ' ( )",
        }),

    currentPosition: Joi.string()
        .max(100)
        .trim()
        .optional()
        .allow('', null)
        .messages({
            'string.max': 'Current position cannot exceed 100 characters',
        }),

    company: Joi.string()
        .max(100)
        .trim()
        .optional()
        .allow('', null)
        .messages({
            'string.max': 'Company name cannot exceed 100 characters',
        }),

    education: Joi.string()
        .max(150)
        .trim()
        .optional()
        .allow('', null)
        .messages({
            'string.max': 'Education cannot exceed 150 characters',
        }),

    pronouns: Joi.string()
        .valid('He/Him', 'She/Her', 'They/Them', 'Other')
        .optional()
        .allow('', null)
        .messages({
            'any.only': 'Pronouns must be one of: He/Him, She/Her, They/Them, Other',
        }),

    onboarding: Joi.object({
        userType: Joi.string()
            .valid('working', 'student', 'fresher')
            .optional()
            .messages({
                'any.only': 'User type must be one of: working, student, or fresher',
            }),

        workingProfile: Joi.object({
            jobTitle: Joi.string().min(2).max(100).optional(),
            companyName: Joi.string().min(2).max(100).optional(),
            startDate: Joi.date().iso().max('now').optional(),
            endDate: Joi.date().iso().min(Joi.ref('startDate')).max('now').optional().allow(null, ''),
        }).optional(),

        studentProfile: Joi.object({
            collegeName: Joi.string().min(2).max(100).optional(),
            degree: Joi.string().optional(),
            fieldOfStudy: Joi.string().optional(),
            graduationYear: Joi.string().pattern(/^\d{4}$/).optional(),
        }).optional(),

        fresherProfile: Joi.object({
            highestEducation: Joi.string().optional(),
            preferredRole: Joi.string().optional(),
            cgpa: Joi.string().pattern(/^\d{1,2}\.\d{2}$/).optional().allow(null, ''),
        }).optional(),
    }).optional(),

    preferences: Joi.object({
        notifications: Joi.object({
            email: Joi.boolean().optional(),
            push: Joi.boolean().optional(),
            sms: Joi.boolean().optional(),
        }).optional(),
        language: Joi.string().valid('en', 'hi', 'es', 'fr', 'de', 'ja', 'zh').optional(),
        timezone: Joi.string().optional(),
        theme: Joi.string().valid('light', 'dark', 'auto').optional(),
    }).optional(),

}).min(1).messages({
    'object.min': 'At least one field must be provided',
});

const deactivateAccountSchema = Joi.object({
    reason: Joi.string()
        .max(500)
        .optional()
        .messages({
            'string.max': 'Reason cannot exceed 500 characters',
        }),

    confirmation: Joi.string()
        .valid('DEACTIVATE_MY_ACCOUNT')
        .required()
        .messages({
            'any.only': 'Confirmation must be: DEACTIVATE_MY_ACCOUNT',
            'any.required': 'Confirmation is required',
        }),
});

const deleteUserSchema = Joi.object({
    reason: Joi.string()
        .min(10)
        .max(500)
        .required()
        .messages({
            'string.min': 'Deletion reason must be at least 10 characters',
            'string.max': 'Reason cannot exceed 500 characters',
            'any.required': 'Deletion reason is required',
        }),

    confirmation: Joi.string()
        .valid('DELETE_USER_PERMANENTLY')
        .required()
        .messages({
            'any.only': 'Confirmation must be: DELETE_USER_PERMANENTLY',
            'any.required': 'Confirmation is required',
        }),
});

const validate = (schema: Joi.ObjectSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map((detail) => detail.message);
            return res.status(400).json({
                status: 'error',
                message: 'Validation failed',
                errors,
            });
        }

        req.body = value;
        next();
    };
};

// ==================== PUBLIC ROUTES ====================

/**
 * @route GET /api/v1/auth/health
 */
router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'auth-service',
        version: process.env.APP_VERSION || '1.0.0',
    });
});

/**
 * @route POST /api/v1/auth/register/send-otp
 */
router.post(
    '/register/send-otp',
    sanitizeInput,
    rateLimitMiddleware(),
    validateSendRegistrationOtp,
    handle((req, res) => AuthController.sendRegistrationOTP(req, res))
);

/**
 * @route POST /api/v1/auth/register/resend-otp
 */
router.post(
    '/register/resend-otp',
    sanitizeInput,
    rateLimitMiddleware(),
    validateSendRegistrationOtp,
    handle((req, res) => AuthController.sendRegistrationOTP(req, res))
);

/**
 * @route POST /api/v1/auth/register/verify-otp
 */
router.post(
    '/register/verify-otp',
    sanitizeInput,
    rateLimitMiddleware(),
    validateVerifyRegistrationOtp,
    handle((req, res) => AuthController.verifyRegistrationOTP(req, res))
);

/**
 * @route POST /api/v1/auth/register
 */
router.post(
    '/register',
    trimRegistrationInput,
    rateLimitMiddleware(),
    validateRegistration,
    handle((req, res) => AuthController.register(req, res))
);

router.post(
    '/availability',
    rateLimitMiddleware({
        maxRequests: 20,
        windowMs: 60_000,
        message: 'Too many availability checks. Try again shortly.',
    }),
    handle((req, res) => AuthController.checkAvailability(req, res))
);

/**
 * @route POST /api/v1/auth/login
 */
router.post(
    '/login',
    sanitizeInput,
    rateLimitMiddleware(),
    validateLogin,
    handle((req, res) => AuthController.login(req, res))
);

/**
 * @route POST /api/v1/auth/refresh-token
 * Frontend isi path ko call karta hai (api.instance.ts REFRESH_PATH)
 */
router.post(
    '/refresh-token',
    sanitizeInput,
    rateLimitMiddleware(),
    handle((req, res) => AuthController.refreshToken(req, res))
);

router.patch('/date-of-birth', AuthMiddleware.authenticate as any, updateDateOfBirth);

// ==================== GOOGLE (NATIVE VERIFY) ROUTES ====================

router.post(
    '/google/verify',
    sanitizeInput,
    rateLimitMiddleware(),
    googleVerifyController
);

router.post(
    '/google/register',
    sanitizeInput,
    rateLimitMiddleware(),
    googleRegisterController
);

router.post(
    '/google/native',
    sanitizeInput,
    rateLimitMiddleware(),
    googleVerifyController
);

router.get('/csrf-token', csrfProtection, (req: Request, res: Response) => {
    res.json({ csrfToken: req.csrfToken() });
});

// ==================== GOOGLE OAUTH (BROWSER FLOW) ====================

router.get(
    '/google',
    csrfProtection,
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
    })
);

router.get(
    '/google/callback',
    csrfProtection,
    passport.authenticate('google', {
        failureRedirect: `${process.env.FRONTEND_URL}/login?error=oauth_failed`,
        session: false,
    }),
    async (req: any, res: Response) => {
        try {
            const user = req.user;
            const { accessToken, refreshToken } = await issueOAuthTokens(req, user);

            // Note: tokens query string mein jaate hain (frontend /auth/callback page yahin se padhta hai)
            const redirectUrl = new URL(`${process.env.FRONTEND_URL}/auth/callback`);
            setAuthCookies(res, { accessToken, refreshToken });
            if (shouldExposeTokensInBody(req)) {
                redirectUrl.searchParams.set('accessToken', accessToken);
                redirectUrl.searchParams.set('refreshToken', refreshToken);
            }
            redirectUrl.searchParams.set('userId', user.userId);
            redirectUrl.searchParams.set('email', user.email);
            redirectUrl.searchParams.set('role', user.role || 'user');
            redirectUrl.searchParams.set('isNewUser', user.isNewUser === true ? 'true' : 'false');

            res.redirect(redirectUrl.toString());
        } catch (error: any) {
            LoggerUtil.error('Google callback error', { error: error.message });
            res.redirect(`${process.env.FRONTEND_URL}/login?error=token_generation_failed`);
        }
    }
);

// ==================== GITHUB OAUTH ====================

router.get(
    '/github',
    csrfProtection,
    passport.authenticate('github', {
        scope: ['user:email'],
        session: false,
    })
);

router.get(
    '/github/callback',
    csrfProtection,
    passport.authenticate('github', {
        failureRedirect: `${process.env.FRONTEND_URL}/login?error=github_oauth_failed`,
        session: false,
    }),
    async (req: any, res: Response) => {
        try {
            const user = req.user;
            const { accessToken, refreshToken } = await issueOAuthTokens(req, user);

            const redirectUrl = new URL(`${process.env.FRONTEND_URL}/auth/callback`);
            setAuthCookies(res, { accessToken, refreshToken });
            if (shouldExposeTokensInBody(req)) {
                redirectUrl.searchParams.set('accessToken', accessToken);
                redirectUrl.searchParams.set('refreshToken', refreshToken);
            }
            redirectUrl.searchParams.set('userId', user.userId);
            redirectUrl.searchParams.set('email', user.email);
            redirectUrl.searchParams.set('role', user.role || 'user');
            redirectUrl.searchParams.set('isNewUser', user.isNewUser === true ? 'true' : 'false');

            res.redirect(redirectUrl.toString());
        } catch (error: any) {
            LoggerUtil.error('GitHub callback error', { error: error.message });
            res.redirect(`${process.env.FRONTEND_URL}/login?error=token_generation_failed`);
        }
    }
);

// ==================== AUTHENTICATED ROUTES ====================

/**
 * @route GET /api/v1/auth/profile
 * Apna full profile
 */
router.get(
    '/profile',
    AuthMiddleware.authenticate as any,
    AuthController.getUserProfile as any
);

/**
 * @route GET /api/v1/auth/get-user/:userId
 * Public profile (self ya admin ko full). Token optional.
 */
router.get(
    '/get-user/:userId',
    AuthMiddleware.authenticateOptional as any,
    AuthController.getUserById as any
);

/**
 * @route GET /api/v1/auth/users
 * Sirf admin
 */
router.get(
    '/users',
    AuthMiddleware.authenticate as any,
    AuthMiddleware.authorize('admin') as any,
    validateGetAllUsersQuery,
    AuthController.getAllUsers as any
);

/**
 * @route POST /api/v1/auth/get-users-bulk
 * Logged-in users ke liye (public fields only)
 */
router.post(
    '/get-users-bulk',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    AuthController.getUsersBulk as any
);

/**
 * @route PUT /api/v1/auth/update-profile
 */
router.put(
    '/update-profile',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validate(updateProfileSchema),
    rateLimitMiddleware(),
    AuthController.updateUserProfile as any
);

/**
 * @route POST /api/v1/auth/user-account-deactivate
 */
router.post(
    '/user-account-deactivate',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    rateLimitMiddleware(),
    validate(deactivateAccountSchema),
    AuthController.deactivateAccount as any
);

/**
 * @route DELETE /api/v1/auth/user-delete/:userId
 * Sirf admin
 */
router.delete(
    '/user-delete/:userId',
    AuthMiddleware.authenticate as any,
    AuthMiddleware.authorize('admin') as any,
    sanitizeInput,
    rateLimitMiddleware(),
    validate(deleteUserSchema),
    AuthController.deleteUser as any
);

/**
 * @route POST /api/v1/auth/logout
 */
router.post(
    '/logout',
    AuthController.logoutWithRefreshCookie as any, // handles "access cookie already expired"
    AuthMiddleware.authenticate as any,
    validateLogout,
    AuthController.logout as any
);

/**
 * @route POST /api/v1/auth/logout-all
 */
router.post(
    '/logout-all',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 5, windowMs: 900000 }),
    AuthController.logoutAllDevices as any
);

export default router;