/**
 * Contact Routes - API Endpoints for Contact Information
 * Complete CRUD operations with privacy controls
 * 
 * @module routes/contact.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { ContactController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import Constants from '@/shared/constants.util';

const router = express.Router();

// ==================== MIDDLEWARE ====================

/**
 * Sanitize input - Remove dangerous characters
 */
const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = (req.body[key] as string)
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<[^>]+>/g, '')
                    .trim();
            }
        });
    }
    next();
};

// ==================== VALIDATION SCHEMAS ====================

/**
 * Phone Schema
 */
const phoneSchema = Joi.object({
    phoneNumber: Joi.string()
        .pattern(/^\+?[1-9]\d{9,14}$/)
        .required()
        .messages({
            'string.pattern.base': 'Invalid phone number format. Use international format (e.g., +919876543210)',
            'any.required': 'Phone number is required',
        }),
    type: Joi.string()
        .valid('mobile', 'home', 'work')
        .default('mobile')
        .messages({
            'any.only': 'Phone type must be one of: mobile, home, work',
        }),
    isPrimary: Joi.boolean()
        .default(false),
    countryCode: Joi.string()
        .max(5)
        .optional()
        .messages({
            'string.max': 'Country code cannot exceed 5 characters',
        }),
});

/**
 * Website Schema
 */
const websiteSchema = Joi.object({
    url: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .max(500)
        .required()
        .messages({
            'string.uri': 'Invalid URL format. Must start with http:// or https://',
            'string.max': 'URL cannot exceed 500 characters',
            'any.required': 'Website URL is required',
        }),
    type: Joi.string()
        .valid('personal', 'company', 'portfolio', 'blog', 'social', 'other')
        .default('personal')
        .messages({
            'any.only': 'Website type must be one of: personal, company, portfolio, blog, social, other',
        }),
    label: Joi.string()
        .max(50)
        .optional()
        .messages({
            'string.max': 'Label cannot exceed 50 characters',
        }),
});

/**
 * Address Schema
 */
const addressSchema = Joi.object({
    street: Joi.string()
        .max(200)
        .optional()
        .messages({
            'string.max': 'Street cannot exceed 200 characters',
        }),
    city: Joi.string()
        .max(100)
        .optional()
        .messages({
            'string.max': 'City cannot exceed 100 characters',
        }),
    state: Joi.string()
        .max(100)
        .optional()
        .messages({
            'string.max': 'State cannot exceed 100 characters',
        }),
    country: Joi.string()
        .max(100)
        .optional()
        .messages({
            'string.max': 'Country cannot exceed 100 characters',
        }),
    postalCode: Joi.string()
        .max(20)
        .optional()
        .messages({
            'string.max': 'Postal code cannot exceed 20 characters',
        }),
    fullAddress: Joi.string()
        .max(500)
        .optional()
        .messages({
            'string.max': 'Full address cannot exceed 500 characters',
        }),
}).min(1).messages({
    'object.min': 'At least one address field must be provided',
});

/**
 * Birthday Schema
 */
const birthdaySchema = Joi.object({
    day: Joi.number()
        .integer()
        .min(1)
        .max(31)
        .required()
        .messages({
            'number.min': 'Day must be between 1 and 31',
            'number.max': 'Day must be between 1 and 31',
            'any.required': 'Day is required',
        }),
    month: Joi.number()
        .integer()
        .min(1)
        .max(12)
        .required()
        .messages({
            'number.min': 'Month must be between 1 and 12',
            'number.max': 'Month must be between 1 and 12',
            'any.required': 'Month is required',
        }),
    year: Joi.number()
        .integer()
        .min(1900)
        .max(new Date().getFullYear() - 13)
        .optional()
        .messages({
            'number.min': 'Year must be after 1900',
            'number.max': 'User must be at least 13 years old',
        }),
    hideYear: Joi.boolean()
        .default(false),
});

/**
 * Privacy Schema
 */
const privacySchema = Joi.object({
    phoneVisibility: Joi.string()
        .valid('public', 'connections', 'private', 'me_only')
        .optional()
        .messages({
            'any.only': 'Phone visibility must be one of: public, connections, private, me_only',
        }),
    birthdayVisibility: Joi.string()
        .valid('public', 'connections', 'private', 'me_only')
        .optional()
        .messages({
            'any.only': 'Birthday visibility must be one of: public, connections, private, me_only',
        }),
    addressVisibility: Joi.string()
        .valid('public', 'connections', 'private', 'me_only')
        .optional()
        .messages({
            'any.only': 'Address visibility must be one of: public, connections, private, me_only',
        }),
    phoneDiscovery: Joi.string()
        .valid('anyone', 'connections_only', 'no_one')
        .optional()
        .messages({
            'any.only': 'Phone discovery must be one of: anyone, connections_only, no_one',
        }),
    contactButtonVisibility: Joi.string()
        .valid('public', 'connections', 'private', 'me_only')
        .optional()
        .messages({
            'any.only': 'Contact button visibility must be one of: public, connections, private, me_only',
        }),
});

/**
 * Create Contact Schema
 */
const createContactSchema = Joi.object({
    profileUrl: Joi.string()
        .min(3)
        .max(50)
        .pattern(/^[a-z0-9_-]+$/)
        .lowercase()
        .trim()
        .optional()
        .custom((value, helpers) => {
            if (Constants.CONTACT_VALIDATION.PROFILE_URL.RESERVED_USERNAMES.includes(value)) {
                return helpers.error('any.invalid', {
                    message: 'Profile URL is reserved and cannot be used',
                });
            }
            return value;
        })
        .messages({
            'string.min': 'Profile URL must be at least 3 characters',
            'string.max': 'Profile URL cannot exceed 50 characters',
            'string.pattern.base': 'Profile URL can only contain lowercase letters, numbers, underscore, and hyphen',
        }),

    phones: Joi.array()
        .items(phoneSchema)
        .max(3)
        .optional()
        .messages({
            'array.max': 'Maximum 3 phone numbers allowed',
        }),

    birthday: birthdaySchema.optional(),

    address: addressSchema.optional(),

    websites: Joi.array()
        .items(websiteSchema)
        .max(3)
        .optional()
        .messages({
            'array.max': 'Maximum 3 websites allowed',
        }),

    privacy: privacySchema.optional(),
});

/**
 * Update Contact Schema
 */
const updateContactSchema = Joi.object({
    profileUrl: Joi.string()
        .min(3)
        .max(50)
        .pattern(/^[a-z0-9_-]+$/)
        .lowercase()
        .trim()
        .optional()
        .allow('')
        .custom((value, helpers) => {
            if (value && Constants.CONTACT_VALIDATION.PROFILE_URL.RESERVED_USERNAMES.includes(value)) {
                return helpers.error('any.invalid', {
                    message: 'Profile URL is reserved and cannot be used',
                });
            }
            return value;
        })
        .messages({
            'string.min': 'Profile URL must be at least 3 characters',
            'string.max': 'Profile URL cannot exceed 50 characters',
            'string.pattern.base': 'Profile URL can only contain lowercase letters, numbers, underscore, and hyphen',
        }),

    phones: Joi.array()
        .items(phoneSchema)
        .max(3)
        .optional()
        .messages({
            'array.max': 'Maximum 3 phone numbers allowed',
        }),

    birthday: birthdaySchema.optional(),

    address: addressSchema.optional(),

    websites: Joi.array()
        .items(websiteSchema)
        .max(3)
        .optional()
        .messages({
            'array.max': 'Maximum 3 websites allowed',
        }),

    privacy: privacySchema.optional(),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

/**
 * Validation middleware for create
 */
const validateCreateContact = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createContactSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Contact validation failed', {
            errors,
            userId: (req as any).user?.userId,
            ipAddress: req.ip,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

/**
 * Validation middleware for update
 */
const validateUpdateContact = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateContactSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Contact update validation failed', {
            errors,
            userId: (req as any).user?.userId,
            contactId: req.params.contactId,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

// ==================== ROUTES ====================

/**
 * @route   POST /api/v1/contact
 * @desc    Create new contact information
 * @access  Private
 */
router.post(
    '/create-contact',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreateContact,
    rateLimitMiddleware({ maxRequests: 5, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 CREATE CONTACT ROUTE HIT');
            console.log('📦 Request Body:', JSON.stringify(req.body, null, 2));
            console.log('👤 User:', (req as any).user);

            await ContactController.createContact(req as any, res);

            console.log('✅ CREATE CONTACT ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ CREATE CONTACT ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/contact
 * @desc    Get contact information for authenticated user
 * @access  Private
 */
router.get(
    '/get-contact',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET CONTACT ROUTE HIT');
            console.log('👤 User:', (req as any).user);

            await ContactController.getContact(req as any, res);

            console.log('✅ GET CONTACT ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET CONTACT ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/contact/:contactId
 * @desc    Get contact by ID
 * @access  Private
 */
router.get(
    '/get-contact-id/:contactId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET CONTACT BY ID ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Contact ID:', req.params.contactId);

            await ContactController.getContactById(req as any, res);

            console.log('✅ GET CONTACT BY ID ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET CONTACT BY ID ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/contact/:contactId
 * @desc    Update contact information
 * @access  Private
 */
router.put(
    '/update-contact/:contactId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdateContact,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPDATE CONTACT ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Contact ID:', req.params.contactId);
            console.log('📦 Updates:', req.body);

            await ContactController.updateContact(req as any, res);

            console.log('✅ UPDATE CONTACT ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ UPDATE CONTACT ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/contact/:contactId
 * @desc    Delete contact (soft delete or permanent)
 * @access  Private
 * @query   permanent=true (optional) - Permanently delete
 */
router.delete(
    '/delete-contact/:contactId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 DELETE CONTACT ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Contact ID:', req.params.contactId);
            console.log('🔒 Permanent:', req.query.permanent);

            await ContactController.deleteContact(req as any, res);

            console.log('✅ DELETE CONTACT ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ DELETE CONTACT ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/contact/:contactId/archive
 * @desc    Archive contact
 * @access  Private
 */
router.post(
    '/archive-contact/:contactId/archive',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 ARCHIVE CONTACT ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Contact ID:', req.params.contactId);

            await ContactController.archiveContact(req as any, res);

            console.log('✅ ARCHIVE CONTACT ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ ARCHIVE CONTACT ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/contact/:contactId/restore
 * @desc    Restore archived contact
 * @access  Private
 */
router.post(
    '/restore-contact/:contactId/restore',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 RESTORE CONTACT ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Contact ID:', req.params.contactId);

            await ContactController.restoreContact(req as any, res);

            console.log('✅ RESTORE CONTACT ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ RESTORE CONTACT ROUTE ERROR:', error);
            next(error);
        }
    }
);

export default router;