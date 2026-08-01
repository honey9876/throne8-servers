/**
 * auth.routes.ts
 * Production-ready authentication routes for auth-service-phase3-kafka
 * Handles login, logout, register, and token refresh endpoints
 * Compliant with NIST 800-63B and OWASP guidelines
 * Enhanced with production security measures
 */

import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import express, { Request, Response, NextFunction } from 'express';
import Constants from '@/shared/constants.util';
import { AuthController } from '@/shared/controllers/index.controllers';
import {
    validateLogin,
    validateLogout,
    validateTokenRefresh
} from '@/shared/middlewares/validation.middleware';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import LoggerUtil from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { User } from '../models';
import passport from '@/config/oauth/passport.config';
import { csrfProtection } from '@/config/security/csrf.config';
import { updateDateOfBirth } from '../controllers/dob.controller';


const router = express.Router();

console.log('🔍 auth/routes/index.ts LOADING START');

// ==================== MIDDLEWARE ====================

const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = (req.body[key] as string).replace(/[<>]/g, '').trim();
            }
        });
    }
    next();
};

/**
 * Rate limiter for sending OTP
 * Max 3 requests per 15 minutes per IP
 */
const sendOTPLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3,
    message: {
        status: 'error',
        message: 'Too many OTP requests. Please try again after 15 minutes.',
        retryAfter: 900
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate limiter for verifying OTP
 * Max 5 attempts per 5 minutes per IP
 */
const verifyOTPLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5,
    message: {
        status: 'error',
        message: 'Too many verification attempts. Please try again after 5 minutes.',
        retryAfter: 300
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate limiter for resending OTP
 * Max 3 requests per 15 minutes per IP
 */
const resendOTPLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3,
    message: {
        status: 'error',
        message: 'Too many resend requests. Please try again after 15 minutes.',
        retryAfter: 900
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// ==================== VALIDATION SCHEMAS ====================

/**
 * ==================== HELPER FUNCTIONS ====================
 */

/**
 * Calculate months difference between two dates
 */
const getMonthsDifference = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());
};

/**
 * ==================== REGISTRATION VALIDATION SCHEMA ====================
 */

const registerSchema = Joi.object({
    // ==================== BASIC FIELDS ====================
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

    password: Joi.string()
        .min(Constants.PASSWORD_POLICY.MIN_LENGTH)
        .max(Constants.PASSWORD_POLICY.MAX_LENGTH)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
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
        .min(Constants.USER_VALIDATION.FIRST_NAME.MIN_LENGTH)
        .max(Constants.USER_VALIDATION.FIRST_NAME.MAX_LENGTH)
        .pattern(Constants.USER_VALIDATION.FIRST_NAME.PATTERN)
        .trim()
        .required()
        .messages({
            'string.min': `First name must be at least ${Constants.USER_VALIDATION.FIRST_NAME.MIN_LENGTH} characters`,
            'string.max': `First name cannot exceed ${Constants.USER_VALIDATION.FIRST_NAME.MAX_LENGTH} characters`,
            'string.pattern.base': 'First name can only contain letters, spaces, hyphens, and apostrophes',
            'string.empty': 'First name cannot be empty',
            'any.required': 'First name is required',
        }),

    lastName: Joi.string()
        .min(Constants.USER_VALIDATION.LAST_NAME.MIN_LENGTH)
        .max(Constants.USER_VALIDATION.LAST_NAME.MAX_LENGTH)
        .pattern(Constants.USER_VALIDATION.LAST_NAME.PATTERN)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.min': `Last name must be at least ${Constants.USER_VALIDATION.LAST_NAME.MIN_LENGTH} characters`,
            'string.max': `Last name cannot exceed ${Constants.USER_VALIDATION.LAST_NAME.MAX_LENGTH} characters`,
            'string.pattern.base': 'Last name can only contain letters, spaces, hyphens, and apostrophes',
        }),

    location: Joi.string()
        .min(Constants.LOCATION_VALIDATION.MIN_LENGTH)
        .max(Constants.LOCATION_VALIDATION.MAX_LENGTH)
        .pattern(Constants.LOCATION_VALIDATION.PATTERN)
        .trim()
        .required()
        .messages({
            'string.min': `Location must be at least ${Constants.LOCATION_VALIDATION.MIN_LENGTH} characters`,
            'string.max': `Location cannot exceed ${Constants.LOCATION_VALIDATION.MAX_LENGTH} characters`,
            'string.pattern.base': 'Location must start with a capital letter and contain only letters, spaces, and hyphens',
            'string.empty': 'Location cannot be empty',
            'any.required': 'Location is required',
        }),

    phoneNumber: Joi.string()
        .pattern(/^\+?[1-9]\d{1,14}$/)
        .optional()
        .allow('')
        .messages({
            'string.pattern.base': 'Invalid phone number format (E.164 format required, e.g., +919876543210)',
        }),

    // ==================== ONBOARDING FIELDS ====================
    userType: Joi.string()
        .valid(...Constants.ONBOARDING.USER_TYPES)
        .required()
        .messages({
            'any.only': 'User type must be one of: working, student, or fresher',
            'any.required': 'User type is required',
        }),

    // ==================== WORKING PROFESSIONAL FIELDS ====================
    jobTitle: Joi.when('userType', {
        is: 'working',
        then: Joi.string()
            .valid(...Constants.ONBOARDING.WORKING.JOB_TITLES)
            .required()
            .messages({
                'any.only': 'Please select a valid job title',
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
            .valid(...Constants.ONBOARDING.WORKING.COMPANIES)
            .required()
            .messages({
                'any.only': 'Please select a valid company',
                'any.required': 'Company name is required for working professionals',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'Company name is not allowed for this user type',
            }),
    }),

    startDate: Joi.when('userType', {
        is: 'working',
        then: Joi.date()
            .iso()
            .max('now')
            .required()
            .messages({
                'date.base': 'Start date must be a valid date',
                'date.format': 'Start date must be in YYYY-MM-DD format',
                'date.max': 'Start date cannot be in the future',
                'any.required': 'Start date is required for working professionals',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'Start date is not allowed for this user type',
            }),
    }),

    endDate: Joi.when('userType', {
        is: 'working',
        then: Joi.date()
            .iso()
            .min(Joi.ref('startDate'))
            .max('now')
            .optional()
            .allow(null, '')
            .custom((value, helpers) => {
                if (!value) return value;  // Allow empty for current jobs

                const startDate = helpers.state.ancestors[0].startDate;
                if (!startDate) return value;

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
                'date.min': 'End date must be after start date',
                'date.max': 'End date cannot be in the future',
                'any.invalid': 'Minimum 1 month job duration is required',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'End date is not allowed for this user type',
            }),
    }),

    // ==================== STUDENT FIELDS ====================
    collegeName: Joi.when('userType', {
        is: 'student',
        then: Joi.string()
            .min(Constants.ONBOARDING.STUDENT.MIN_COLLEGE_NAME_LENGTH)
            .max(Constants.ONBOARDING.STUDENT.MAX_COLLEGE_NAME_LENGTH)
            .trim()
            .required()
            .messages({
                'string.min': `College name must be at least ${Constants.ONBOARDING.STUDENT.MIN_COLLEGE_NAME_LENGTH} characters`,
                'string.max': `College name cannot exceed ${Constants.ONBOARDING.STUDENT.MAX_COLLEGE_NAME_LENGTH} characters`,
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
            .valid(...Constants.ONBOARDING.STUDENT.VALID_DEGREES)
            .required()
            .messages({
                'any.only': 'Please select a valid degree',
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
            .valid(...Constants.ONBOARDING.STUDENT.VALID_FIELDS)
            .required()
            .messages({
                'any.only': 'Please select a valid field of study',
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
                'any.invalid': 'Invalid graduation year',
            }),
        otherwise: Joi.forbidden()
            .messages({
                'any.unknown': 'Graduation year is not allowed for this user type',
            }),
    }),

    // ==================== FRESHER FIELDS ====================
    highestEducation: Joi.when('userType', {
        is: 'fresher',
        then: Joi.string()
            .valid(...Constants.ONBOARDING.FRESHER.VALID_EDUCATION_LEVELS)
            .required()
            .messages({
                'any.only': 'Please select a valid education level',
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
            .valid(...Constants.ONBOARDING.FRESHER.VALID_JOB_ROLES)
            .required()
            .messages({
                'any.only': 'Please select a valid job role',
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

    // ==================== DEVICE INFO (OPTIONAL) ====================
    deviceType: Joi.string().optional().allow(''),
    deviceName: Joi.string().optional().allow(''),
    os: Joi.string().optional().allow(''),
    browser: Joi.string().optional().allow(''),
});

/**
 * Validation middleware wrapper
 */
const validateRegistration = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = registerSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Registration validation failed', {
            errors,
            email: req.body.email,
            userType: req.body.userType,
            ipAddress: req.ip,
        });

        return ResponseUtil.validationError(res, errors, 'Registration validation failed');
    }

    req.body = value;
    next();
};

/**
 * ==================== VALIDATION SCHEMA (Optional) ====================
 * 
 * If you want to add strict query parameter validation,
 * add this Joi schema before the route:
 */

const getAllUsersQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('active', 'inactive', 'suspended', 'deleted'),
    role: Joi.string().valid('user', 'admin', 'moderator'),
    userType: Joi.string().valid('working', 'student', 'fresher'),
    location: Joi.string().min(2).max(50),
    search: Joi.string().min(2).max(100),
    sortBy: Joi.string().valid('newest', 'oldest', 'name', 'email').default('newest'),
});

/**
 * Validation middleware for query parameters
 */
const validateGetAllUsersQuery = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = getAllUsersQuerySchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Invalid query parameters');
    }

    req.query = value;
    next();
};

/**
 * Update Profile Validation Schema
 */
const updateProfileSchema = Joi.object({
    // ==================== EMAIL ====================
    email: Joi.string()
        .email()
        .lowercase()
        .trim()
        .optional()
        .messages({
            'string.email': 'Invalid email format',
        }),

    // ==================== PASSWORD ====================
    password: Joi.string()
        .min(8)
        .max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .optional()
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'string.max': 'Password cannot exceed 128 characters',
            'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character',
        }),

    // ==================== PHONE NUMBER ====================
    phoneNumber: Joi.string()
        .pattern(/^\+?[1-9]\d{1,14}$/)
        .allow(null, '')
        .optional()
        .messages({
            'string.pattern.base': 'Invalid phone number format (E.164 format required, e.g., +919876543210)',
        }),

    // ==================== FIRST NAME ====================
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

    // ==================== LAST NAME ====================
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

    // ==================== LOCATION ====================
    location: Joi.string()
        .min(2)
        .max(50)
        .pattern(/^[A-Z][a-zA-Z\s\-]{1,49}$/)
        .trim()
        .optional()
        .messages({
            'string.min': 'Location must be at least 2 characters',
            'string.max': 'Location cannot exceed 50 characters',
            'string.pattern.base': 'Location must start with a capital letter',
        }),



         // ✅ ADD THESE 4 NEW FIELDS
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


    // ==================== ONBOARDING ====================
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

    // ==================== PREFERENCES ====================
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

/**
 * Deactivate Account Validation Schema
 */
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

/**
 * Delete User Validation Schema (Admin)
 */
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

// ==================== VALIDATION MIDDLEWARE ====================

/**
 * Validate request body against Joi schema
 */
const validate = (schema: Joi.ObjectSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(detail => detail.message);
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
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'auth-service',
        version: process.env.APP_VERSION || '1.0.0'
    });
});

/**
 * @route POST /api/v1/auth/register
 * @desc Register new user account
 * @access Public
 */
router.post(
    '/register',
    sanitizeInput,
    rateLimitMiddleware(),
    validateRegistration,
    async (req, res, next) => {
        try {
            console.log('🎯 REGISTER ROUTE HIT');
            console.log('📦 Request Body:', JSON.stringify(req.body, null, 2));
            console.log('📊 Body Keys:', Object.keys(req.body));
            console.log('🔍 userType:', req.body.userType);
            console.log('🔍 status:', req.body.status);

            await AuthController.register(req, res);
            console.log('✅ REGISTER ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ REGISTER ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user and generate session
 * @access Public
 */
router.post(
    '/login',
    sanitizeInput,
    rateLimitMiddleware(),
    validateLogin,
    async (req, res, next) => {
        try {
            console.log('🎯 LOGIN ROUTE HIT');
            console.log('📦 Request Body:', JSON.stringify(req.body, null, 2));
            await AuthController.login(req, res);
            console.log('✅ LOGIN ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ LOGIN ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh access token using refresh token (with rotation)
 * @access Public (requires valid refresh token)
 */
router.post(
    '/refresh-token',
    sanitizeInput,
    rateLimitMiddleware(),
    async (req, res, next) => {
        try {
            console.log('🎯 REFRESH TOKEN ROUTE HIT');
            await AuthController.refreshToken(req, res);
            console.log('✅ REFRESH TOKEN ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ REFRESH TOKEN ROUTE ERROR:', error);
            next(error);
        }
    }

);

router.patch('/date-of-birth', AuthMiddleware.authenticate as any, updateDateOfBirth);
// ==================== GOOGLE OAUTH ROUTES ====================

router.get('/csrf-token', csrfProtection, (req: Request, res: Response) => {
    res.json({ csrfToken: req.csrfToken() });
});

/**
 * @route GET /api/v1/auth/google
 * @desc Google OAuth initiate
 * @access Public
 */
router.get(
    '/google',
    csrfProtection,
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false // JWT use kar rahe hain
    })
);

/**
 * @route GET /api/v1/auth/google/callback
 * @desc Google OAuth callback
 * @access Public
 */
router.get(
    '/google/callback',
    csrfProtection,
    passport.authenticate('google', {
        failureRedirect: `${process.env.FRONTEND_URL}/login?error=oauth_failed`,
        session: false
    }),
    async (req: any, res: Response) => {
        try {
            const user = req.user;

            // JWT tokens generate karo — User model ka existing method use karo
            const accessToken = User.generateAccessToken({
                userId: user.userId,
                role: user.role
            });
            const refreshToken = User.generateRefreshToken({
                userId: user.userId,
                role: user.role
            });

            // Frontend ko redirect karo tokens ke saath (query params mein)
            // Note: Production mein httpOnly cookie better hai
            const redirectUrl = new URL(`${process.env.FRONTEND_URL}/auth/callback`);
            redirectUrl.searchParams.set('accessToken', accessToken);
            redirectUrl.searchParams.set('refreshToken', refreshToken);
            redirectUrl.searchParams.set('userId', user.userId);
            redirectUrl.searchParams.set('email', user.email);
            redirectUrl.searchParams.set('role', user.role);
            redirectUrl.searchParams.set('isNewUser', (req.user as any).isNewUser ? 'true' : 'false');

            res.redirect(redirectUrl.toString());

        } catch (error: any) {
            console.error('Google callback error:', error);
            res.redirect(`${process.env.FRONTEND_URL}/login?error=token_generation_failed`);
        }
    }
);


// ==================== GITHUB OAUTH ROUTES ====================

/**
 * @route GET /api/v1/auth/github
 * @desc GitHub OAuth initiate
 * @access Public
 */
router.get(
    '/github',
    csrfProtection,
    passport.authenticate('github', {
        scope: ['user:email'],
        session: false
    })
);

/**
 * @route GET /api/v1/auth/github/callback
 * @desc GitHub OAuth callback
 * @access Public
 */
router.get(
    '/github/callback',
    csrfProtection,
    passport.authenticate('github', {
        failureRedirect: `${process.env.FRONTEND_URL}/login?error=github_oauth_failed`,
        session: false
    }),
    async (req: any, res: Response) => {
        try {
            const user = req.user;

            const accessToken = User.generateAccessToken({
                userId: user.userId,
                role: user.role
            });
            const refreshToken = User.generateRefreshToken({
                userId: user.userId,
                role: user.role
            });

            const redirectUrl = new URL(`${process.env.FRONTEND_URL}/auth/callback`);
            redirectUrl.searchParams.set('accessToken', accessToken);
            redirectUrl.searchParams.set('refreshToken', refreshToken);
            redirectUrl.searchParams.set('userId', user.userId);
            redirectUrl.searchParams.set('email', user.email);
            redirectUrl.searchParams.set('role', user.role);
            redirectUrl.searchParams.set('isNewUser', user.isNewUser === true ? 'true' : 'false');

            res.redirect(redirectUrl.toString());

        } catch (error: any) {
            console.error('GitHub callback error:', error);
            res.redirect(`${process.env.FRONTEND_URL}/login?error=token_generation_failed`);
        }
    }
);

// ==================== AUTHENTICATED ROUTES ====================

/**
 * @route   GET /api/v1/user/profile
 * @desc    Get authenticated user's profile
 * @access  Private (requires JWT)
 * @query   {Boolean} includeStats - Include statistics
 * @query   {Boolean} includeSessions - Include active sessions
 */
router.get(
    '/profile',
    AuthMiddleware.authenticate as any,
    // rateLimitMiddleware(),
    AuthController.getUserProfile as any
);

/**
 * @route   GET /api/v1/auth/users/:userId
 * @desc    Get user by ID (UUID)
 * @access  Public (or Private - add AuthMiddleware.authenticate)
 * @param   {String} userId - User UUID
 * @query   {Boolean} includeStats - Include statistics (optional)
 * @query   {Boolean} includeSessions - Include active sessions (optional)
 * 
 * @example
 * GET /api/v1/auth/users/fa8b42a2-6e15-49e2-8a5a-9ab45758baaa
 * GET /api/v1/auth/users/fa8b42a2-6e15-49e2-8a5a-9ab45758baaa?includeStats=true
 * GET /api/v1/auth/users/fa8b42a2-6e15-49e2-8a5a-9ab45758baaa?includeStats=true&includeSessions=true
 */
router.get(
    '/get-user/:userId',
    // AuthMiddleware.authenticate as any,  // ✅ Uncomment if you want authentication required
    // rateLimitMiddleware(),
    AuthController.getUserById as any
);

/**
 * ==================== GET ALL USERS ROUTE ====================
 * 
 * Add this route in your auth.routes.ts file
 * Place it in the "AUTHENTICATED ROUTES" section
 */

/**
 * @route   GET /api/v1/auth/users
 * @desc    Get all users (admin only)
 * @access  Private (Admin only)
 * @query   {Number} page - Page number (default: 1)
 * @query   {Number} limit - Items per page (default: 20, max: 100)
 * @query   {String} status - Filter by status (active, inactive, suspended, deleted)
 * @query   {String} role - Filter by role (user, admin, moderator)
 * @query   {String} userType - Filter by userType (working, student, fresher)
 * @query   {String} location - Filter by location (partial match)
 * @query   {String} search - Search by email, firstName, lastName
 * @query   {String} sortBy - Sort order (newest, oldest, name, email)
 * 
 * @example
 * GET /api/v1/auth/users?page=1&limit=20&status=active&sortBy=newest
 * GET /api/v1/auth/users?search=john&location=Mumbai
 * GET /api/v1/auth/users?userType=working&role=user
 */

/**
 * ==================== ROUTE WITH VALIDATION (Recommended) ====================
 */
router.get(
    '/users',
    AuthMiddleware.authenticate as any,
    // AuthMiddleware.authorize('admin') as any,
    // validateGetAllUsersQuery,  // ✅ Add query validation
    // rateLimitMiddleware(),
    AuthController.getAllUsers as any
);

router.post(
    '/get-users-bulk',
    sanitizeInput,
    AuthController.getUsersBulk as any
);
/**
 * @route   PUT /api/v1/user/profile
 * @desc    Update authenticated user's profile
 * @access  Private (requires JWT)
 * @body    {String} username - New username (optional)
 * @body    {String} phone - New phone number (optional)
 * @body    {Object} preferences - User preferences (optional)
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
 * @route   POST /api/v1/user/deactivate
 * @desc    Deactivate authenticated user's account
 * @access  Private (requires JWT)
 * @body    {String} reason - Deactivation reason (optional)
 * @body    {String} confirmation - Must be "DEACTIVATE_MY_ACCOUNT"
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
 * @route   DELETE /api/v1/user/:userId
 * @desc    Permanently delete user account (admin only)
 * @access  Private (requires admin role)
 * @param   {String} userId - Target user ID
 * @body    {String} reason - Deletion reason (required)
 * @body    {String} confirmation - Must be "DELETE_USER_PERMANENTLY"
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
 * @desc Terminate user session
 * @access Private
 */
router.post(
    '/logout',
    AuthMiddleware.authenticate as any,
    validateLogout,
    AuthController.logout as any
);

/**
 * @route POST /api/v1/auth/logout-all
 * @desc Logout from all devices
 * @access Private
 */
router.post(
    '/logout-all',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 5, windowMs: 900000 }), // 5 req/15min
    AuthController.logoutAllDevices as any
);

export default router;

console.log('🔍 auth/routes/index.ts LOADING END');