/**
 * Volunteer Routes - API Endpoints for Volunteer Experience Management
 * 
 * @module routes/volunteer.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { VolunteerController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import { uploadSingle } from '@/shared/upload/upload';
import { VOLUNTEER_CAUSES } from '@/shared/models/index.models';

const router = express.Router();

// ==================== MIDDLEWARE ====================

const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string' && key !== 'caption') {
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
 * Create Volunteer Validation Schema
 */
const createVolunteerSchema = Joi.object({
    organizationName: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .required()
        .messages({
            'string.min': 'Organization name must be at least 2 characters',
            'string.max': 'Organization name cannot exceed 200 characters',
            'string.empty': 'Organization name cannot be empty',
            'any.required': 'Organization name is required',
        }),

    role: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .required()
        .messages({
            'string.min': 'Role must be at least 2 characters',
            'string.max': 'Role cannot exceed 200 characters',
            'string.empty': 'Role cannot be empty',
            'any.required': 'Role is required',
        }),

    cause: Joi.string()
        .valid(...VOLUNTEER_CAUSES)
        .required()
        .messages({
            'any.only': `Cause must be one of: ${VOLUNTEER_CAUSES.join(', ')}`,
            'any.required': 'Cause is required',
        }),

    startDate: Joi.object({
        month: Joi.number()
            .integer()
            .min(1)
            .max(12)
            .required()
            .messages({
                'number.min': 'Month must be between 1 and 12',
                'number.max': 'Month must be between 1 and 12',
                'any.required': 'Start month is required',
            }),
        year: Joi.number()
            .integer()
            .min(1900)
            .max(new Date().getFullYear() + 1)
            .required()
            .messages({
                'number.min': 'Year must be after 1900',
                'number.max': 'Year cannot be more than 1 year in future',
                'any.required': 'Start year is required',
            }),
    })
        .required()
        .messages({
            'any.required': 'Start date is required',
        }),

    endDate: Joi.object({
        month: Joi.number()
            .integer()
            .min(1)
            .max(12)
            .required()
            .messages({
                'number.min': 'Month must be between 1 and 12',
                'number.max': 'Month must be between 1 and 12',
            }),
        year: Joi.number()
            .integer()
            .min(1900)
            .max(new Date().getFullYear() + 1)
            .required()
            .messages({
                'number.min': 'Year must be after 1900',
                'number.max': 'Year cannot be more than 1 year in future',
            }),
    }).optional(),

    currentlyVolunteering: Joi.boolean()
        .default(false)
        .messages({
            'boolean.base': 'Currently volunteering must be a boolean',
        }),

    description: Joi.string()
        .max(500)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Description cannot exceed 500 characters',
        }),

    skillsUsed: Joi.array()
        .items(
            Joi.string()
                .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
                .messages({
                    'string.pattern.base': 'Invalid skill ID format',
                })
        )
        .optional()
        .messages({
            'array.base': 'Skills used must be an array',
        }),

    notifyNetwork: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'Notify network must be a boolean',
        }),
});

/**
 * Update Volunteer Validation Schema
 */
const updateVolunteerSchema = Joi.object({
    organizationName: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .optional()
        .messages({
            'string.min': 'Organization name must be at least 2 characters',
            'string.max': 'Organization name cannot exceed 200 characters',
        }),

    role: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .optional()
        .messages({
            'string.min': 'Role must be at least 2 characters',
            'string.max': 'Role cannot exceed 200 characters',
        }),

    cause: Joi.string()
        .valid(...VOLUNTEER_CAUSES)
        .optional()
        .messages({
            'any.only': `Cause must be one of: ${VOLUNTEER_CAUSES.join(', ')}`,
        }),

    startDate: Joi.object({
        month: Joi.number()
            .integer()
            .min(1)
            .max(12)
            .required(),
        year: Joi.number()
            .integer()
            .min(1900)
            .max(new Date().getFullYear() + 1)
            .required(),
    }).optional(),

    endDate: Joi.object({
        month: Joi.number()
            .integer()
            .min(1)
            .max(12)
            .required(),
        year: Joi.number()
            .integer()
            .min(1900)
            .max(new Date().getFullYear() + 1)
            .required(),
    }).optional(),

    currentlyVolunteering: Joi.boolean().optional(),

    description: Joi.string()
        .max(500)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Description cannot exceed 500 characters',
        }),

    skillsUsed: Joi.array()
        .items(
            Joi.string()
                .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
        )
        .optional(),

    notifyNetwork: Joi.boolean().optional(),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

/**
 * Upload Media Validation Schema
 */
const uploadMediaSchema = Joi.object({
    mediaType: Joi.string()
        .valid('photo', 'certificate')
        .required()
        .messages({
            'any.only': 'Media type must be photo or certificate',
            'any.required': 'Media type is required',
        }),
    caption: Joi.string()
        .max(200)
        .trim()
        .optional()
        .messages({
            'string.max': 'Caption cannot exceed 200 characters',
        }),
});

/**
 * Toggle Notify Network Validation Schema
 */
const toggleNotifyNetworkSchema = Joi.object({
    notifyNetwork: Joi.boolean()
        .required()
        .messages({
            'boolean.base': 'Notify network must be a boolean',
            'any.required': 'Notify network is required',
        }),
});

/**
 * Reorder Volunteers Validation Schema
 */
const reorderVolunteersSchema = Joi.object({
    volunteerIds: Joi.array()
        .items(
            Joi.string()
                .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
                .messages({
                    'string.pattern.base': 'Invalid volunteer ID format',
                })
        )
        .min(1)
        .required()
        .messages({
            'array.min': 'At least one volunteer ID is required',
            'any.required': 'Volunteer IDs array is required',
        }),
});

/**
 * Validation middleware wrapper
 */
const validateCreateVolunteer = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createVolunteerSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        LoggerUtil.warn('Volunteer validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateUpdateVolunteer = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateVolunteerSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        LoggerUtil.warn('Volunteer update validation failed', {
            errors,
            userId: (req as any).user?.userId,
            volunteerId: req.params.volunteerId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateUploadMedia = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = uploadMediaSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateToggleNotifyNetwork = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = toggleNotifyNetworkSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateReorderVolunteers = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = reorderVolunteersSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

// ==================== ROUTES ====================

/**
 * @route   POST /api/v1/volunteers/create-volunteer
 * @desc    Create new volunteer experience
 * @access  Private
 */
router.post(
    '/create-volunteer',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreateVolunteer,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 CREATE VOLUNTEER ROUTE HIT');
            await VolunteerController.createVolunteer(req as any, res);
            console.log('✅ CREATE VOLUNTEER ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ CREATE VOLUNTEER ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/volunteers/upload-logo/:volunteerId
 * @desc    Upload organization logo
 * @access  Private
 */
router.post(
    '/upload-logo/:volunteerId',
    AuthMiddleware.authenticate as any,
    uploadSingle('logo'),
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPLOAD ORGANIZATION LOGO ROUTE HIT');
            await VolunteerController.uploadOrganizationLogo(req as any, res);
            console.log('✅ UPLOAD ORGANIZATION LOGO ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ UPLOAD ORGANIZATION LOGO ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/volunteers/upload-media/:volunteerId
 * @desc    Upload media attachment (photo or certificate)
 * @access  Private
 */
router.post(
    '/upload-media/:volunteerId',
    AuthMiddleware.authenticate as any,
    uploadSingle('media'),
    validateUploadMedia,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPLOAD MEDIA ATTACHMENT ROUTE HIT');
            await VolunteerController.uploadMediaAttachment(req as any, res);
            console.log('✅ UPLOAD MEDIA ATTACHMENT ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ UPLOAD MEDIA ATTACHMENT ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/volunteers/delete-media/:volunteerId/:mediaId
 * @desc    Delete media attachment
 * @access  Private
 */
router.delete(
    '/delete-media/:volunteerId/:mediaId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 DELETE MEDIA ATTACHMENT ROUTE HIT');
            await VolunteerController.deleteMediaAttachment(req as any, res);
            console.log('✅ DELETE MEDIA ATTACHMENT ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ DELETE MEDIA ATTACHMENT ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/volunteers/get-all-volunteers
 * @desc    Get all volunteer experiences for authenticated user
 * @access  Private
 * @query   includeArchived=true (optional)
 */
router.get(
    '/get-all-volunteers',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ALL VOLUNTEERS ROUTE HIT');
            await VolunteerController.getAllVolunteers(req as any, res);
            console.log('✅ GET ALL VOLUNTEERS ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET ALL VOLUNTEERS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/volunteers/get-volunteer-id/:volunteerId
 * @desc    Get volunteer by ID
 * @access  Private
 */
router.get(
    '/get-volunteer-id/:volunteerId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET VOLUNTEER BY ID ROUTE HIT');
            await VolunteerController.getVolunteerById(req as any, res);
            console.log('✅ GET VOLUNTEER BY ID ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET VOLUNTEER BY ID ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/volunteers/update-volunteer/:volunteerId
 * @desc    Update volunteer experience
 * @access  Private
 */
router.put(
    '/update-volunteer/:volunteerId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdateVolunteer,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPDATE VOLUNTEER ROUTE HIT');
            await VolunteerController.updateVolunteer(req as any, res);
            console.log('✅ UPDATE VOLUNTEER ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ UPDATE VOLUNTEER ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/volunteers/delete-volunteer/:volunteerId
 * @desc    Delete volunteer (soft delete or permanent)
 * @access  Private
 * @query   permanent=true (optional)
 */
router.delete(
    '/delete-volunteer/:volunteerId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 DELETE VOLUNTEER ROUTE HIT');
            await VolunteerController.deleteVolunteer(req as any, res);
            console.log('✅ DELETE VOLUNTEER ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ DELETE VOLUNTEER ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/volunteers/archive-volunteer/:volunteerId
 * @desc    Archive volunteer experience
 * @access  Private
 */
router.post(
    '/archive-volunteer/:volunteerId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 ARCHIVE VOLUNTEER ROUTE HIT');
            await VolunteerController.archiveVolunteer(req as any, res);
            console.log('✅ ARCHIVE VOLUNTEER ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ ARCHIVE VOLUNTEER ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/volunteers/restore-volunteer/:volunteerId
 * @desc    Restore archived/deleted volunteer experience
 * @access  Private
 */
router.post(
    '/restore-volunteer/:volunteerId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 RESTORE VOLUNTEER ROUTE HIT');
            await VolunteerController.restoreVolunteer(req as any, res);
            console.log('✅ RESTORE VOLUNTEER ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ RESTORE VOLUNTEER ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/volunteers/toggle-notify/:volunteerId
 * @desc    Toggle notify network
 * @access  Private
 */
router.post(
    '/toggle-notify/:volunteerId',
    AuthMiddleware.authenticate as any,
    validateToggleNotifyNetwork,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 TOGGLE NOTIFY NETWORK ROUTE HIT');
            await VolunteerController.toggleNotifyNetwork(req as any, res);
            console.log('✅ TOGGLE NOTIFY NETWORK ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ TOGGLE NOTIFY NETWORK ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/volunteers/reorder-volunteers
 * @desc    Reorder volunteer experiences
 * @access  Private
 */
router.post(
    '/reorder-volunteers',
    AuthMiddleware.authenticate as any,
    validateReorderVolunteers,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 REORDER VOLUNTEERS ROUTE HIT');
            await VolunteerController.reorderVolunteers(req as any, res);
            console.log('✅ REORDER VOLUNTEERS ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ REORDER VOLUNTEERS ROUTE ERROR:', error);
            next(error);
        }
    }
);

export default router;