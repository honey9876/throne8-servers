/**
 * Honor Routes - API Endpoints for Honors & Awards Management
 * 
 * @module routes/honor.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { HonorController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import { uploadSingle } from '@/shared/upload/upload';

const router = express.Router();

// ==================== MIDDLEWARE ====================

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
 * Create Honor Validation Schema
 */
const createHonorSchema = Joi.object({
    title: Joi.string()
        .min(3)
        .max(200)
        .trim()
        .required()
        .messages({
            'string.min': 'Title must be at least 3 characters',
            'string.max': 'Title cannot exceed 200 characters',
            'string.empty': 'Title is required',
            'any.required': 'Title is required',
        }),

    issuer: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .required()
        .messages({
            'string.min': 'Issuer name must be at least 2 characters',
            'string.max': 'Issuer name cannot exceed 200 characters',
            'string.empty': 'Issuer is required',
            'any.required': 'Issuer is required',
        }),

    dateReceived: Joi.object({
        month: Joi.number()
            .min(1)
            .max(12)
            .required()
            .messages({
                'number.min': 'Month must be between 1 and 12',
                'number.max': 'Month must be between 1 and 12',
                'any.required': 'Month is required',
            }),
        year: Joi.number()
            .min(1900)
            .max(new Date().getFullYear())
            .required()
            .messages({
                'number.min': 'Year must be after 1900',
                'number.max': 'Year cannot be in the future',
                'any.required': 'Year is required',
            }),
    }).required(),

    description: Joi.string()
        .max(1000)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Description cannot exceed 1000 characters',
        }),

    category: Joi.string()
        .valid('academic', 'professional', 'sports', 'community_service', 'cultural', 'research', 'leadership', 'other')
        .lowercase()
        .required()
        .messages({
            'any.only': 'Invalid category',
            'any.required': 'Category is required',
        }),

    associatedWith: Joi.object({
        associationType: Joi.string()
            .valid('school', 'company')
            .required()
            .messages({
                'any.only': 'Association type must be school or company',
                'any.required': 'Association type is required',
            }),
        associationId: Joi.string().trim().optional(),
        associationName: Joi.string()
            .min(2)
            .max(200)
            .trim()
            .required()
            .messages({
                'string.min': 'Association name must be at least 2 characters',
                'string.max': 'Association name cannot exceed 200 characters',
                'any.required': 'Association name is required',
            }),
    }).optional(),

    visibility: Joi.string()
        .valid('public', 'connections')
        .optional()
        .default('public')
        .messages({
            'any.only': 'Visibility must be public or connections',
        }),
});

/**
 * Update Honor Validation Schema
 */
const updateHonorSchema = Joi.object({
    title: Joi.string()
        .min(3)
        .max(200)
        .trim()
        .optional()
        .messages({
            'string.min': 'Title must be at least 3 characters',
            'string.max': 'Title cannot exceed 200 characters',
        }),

    issuer: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .optional()
        .messages({
            'string.min': 'Issuer name must be at least 2 characters',
            'string.max': 'Issuer name cannot exceed 200 characters',
        }),

    dateReceived: Joi.object({
        month: Joi.number().min(1).max(12).required(),
        year: Joi.number().min(1900).max(new Date().getFullYear()).required(),
    }).optional(),

    description: Joi.string()
        .max(1000)
        .trim()
        .optional()
        .allow(''),

    category: Joi.string()
        .valid('academic', 'professional', 'sports', 'community_service', 'cultural', 'research', 'leadership', 'other')
        .lowercase()
        .optional(),

    associatedWith: Joi.object({
        associationType: Joi.string().valid('school', 'company').required(),
        associationId: Joi.string().trim().optional(),
        associationName: Joi.string().min(2).max(200).trim().required(),
    }).optional(),

    visibility: Joi.string()
        .valid('public', 'connections')
        .optional(),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

/**
 * Pin Honor Validation Schema
 */
const pinHonorSchema = Joi.object({
    pinnedOrder: Joi.number()
        .valid(1, 2, 3)
        .required()
        .messages({
            'number.base': 'Pinned order must be a number',
            'any.only': 'Pinned order must be 1, 2, or 3',
            'any.required': 'Pinned order is required',
        }),
});

/**
 * Reorder Honors Validation Schema
 */
const reorderHonorsSchema = Joi.object({
    reorderData: Joi.array()
        .items(
            Joi.object({
                honorId: Joi.string().required(),
                newOrder: Joi.number().min(1).required(),
            })
        )
        .min(1)
        .required()
        .messages({
            'array.min': 'At least one honor must be reordered',
            'any.required': 'Reorder data is required',
        }),
});

/**
 * Verify Honor Validation Schema
 */
const verifyHonorSchema = Joi.object({
    verifiedBy: Joi.string()
        .required()
        .messages({
            'string.empty': 'Verified by is required',
            'any.required': 'Verified by is required',
        }),
    verificationProof: Joi.string()
        .uri()
        .optional()
        .messages({
            'string.uri': 'Verification proof must be a valid URL',
        }),
});

/**
 * Upload Media Validation Schema
 */
const uploadMediaSchema = Joi.object({
    mediaType: Joi.string()
        .valid('certificate', 'photo')
        .required()
        .messages({
            'any.only': 'Media type must be certificate or photo',
            'any.required': 'Media type is required',
        }),
});

// ==================== VALIDATION MIDDLEWARE ====================

const validateCreateHonor = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createHonorSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        LoggerUtil.warn('Honor validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateUpdateHonor = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateHonorSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        LoggerUtil.warn('Honor update validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validatePinHonor = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = pinHonorSchema.validate(req.body, {
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

const validateReorderHonors = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = reorderHonorsSchema.validate(req.body, {
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

const validateVerifyHonor = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = verifyHonorSchema.validate(req.body, {
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

const validateUploadMedia = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = uploadMediaSchema.validate(req.body, {
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
 * @route   POST /api/v1/honors/create-honor
 * @desc    Create new honor/award
 * @access  Private
 */
router.post(
    '/create-honor',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreateHonor,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.createHonor(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/honors/get-all-honors
 * @desc    Get all honors for authenticated user
 * @access  Private
 * @query   includeArchived=true (optional)
 */
router.get(
    '/get-all-honors',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.getAllHonors(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/honors/get-honor/:honorId
 * @desc    Get honor by ID
 * @access  Private
 */
router.get(
    '/get-honor/:honorId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.getHonorById(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/honors/update-honor/:honorId
 * @desc    Update honor
 * @access  Private
 */
router.put(
    '/update-honor/:honorId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdateHonor,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.updateHonor(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/honors/delete-honor/:honorId
 * @desc    Delete honor (soft delete or permanent)
 * @access  Private
 * @query   permanent=true (optional)
 */
router.delete(
    '/delete-honor/:honorId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.deleteHonor(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/honors/archive-honor/:honorId
 * @desc    Archive honor
 * @access  Private
 */
router.post(
    '/archive-honor/:honorId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.archiveHonor(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/honors/restore-honor/:honorId
 * @desc    Restore archived/deleted honor
 * @access  Private
 */
router.post(
    '/restore-honor/:honorId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.restoreHonor(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/honors/pin-honor/:honorId
 * @desc    Pin honor to top 3
 * @access  Private
 */
router.post(
    '/pin-honor/:honorId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validatePinHonor,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.pinHonor(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/honors/unpin-honor/:honorId
 * @desc    Unpin honor from top 3
 * @access  Private
 */
router.post(
    '/unpin-honor/:honorId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.unpinHonor(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/honors/reorder-honors
 * @desc    Reorder honors
 * @access  Private
 */
router.post(
    '/reorder-honors',
    AuthMiddleware.authenticate as any,
    validateReorderHonors,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.reorderHonors(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/honors/verify-honor/:honorId
 * @desc    Verify honor/award
 * @access  Private
 */
router.post(
    '/verify-honor/:honorId',
    AuthMiddleware.authenticate as any,
    validateVerifyHonor,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.verifyHonor(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/honors/upload-logo/:honorId
 * @desc    Upload organization logo
 * @access  Private
 */
router.post(
    '/upload-logo/:honorId',
    AuthMiddleware.authenticate as any,
    uploadSingle('logo'),
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.uploadOrganizationLogo(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/honors/upload-media/:honorId
 * @desc    Upload media attachment (certificate/photo)
 * @access  Private
 */
router.post(
    '/upload-media/:honorId',
    AuthMiddleware.authenticate as any,
    uploadSingle('media'),
    validateUploadMedia,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.uploadMediaAttachment(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/honors/delete-media/:honorId/:mediaId
 * @desc    Delete media attachment
 * @access  Private
 */
router.delete(
    '/delete-media/:honorId/:mediaId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await HonorController.deleteMediaAttachment(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

export default router;