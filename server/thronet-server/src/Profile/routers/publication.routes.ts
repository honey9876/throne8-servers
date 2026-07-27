/**
 * Publication Routes - API Endpoints for Publications Management
 * 
 * @module routes/publication.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { PublicationController } from '@/shared/controllers/index.controllers';
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
 * Create Publication Validation Schema
 */
const createPublicationSchema = Joi.object({
    title: Joi.string()
        .min(5)
        .max(500)
        .trim()
        .required()
        .messages({
            'string.min': 'Title must be at least 5 characters',
            'string.max': 'Title cannot exceed 500 characters',
            'string.empty': 'Title is required',
            'any.required': 'Title is required',
        }),

    publisherName: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .required()
        .messages({
            'string.min': 'Publisher name must be at least 2 characters',
            'string.max': 'Publisher name cannot exceed 200 characters',
            'string.empty': 'Publisher name is required',
            'any.required': 'Publisher name is required',
        }),

    publicationDate: Joi.object({
        month: Joi.number()
            .min(1)
            .max(12)
            .required()
            .messages({
                'number.min': 'Month must be between 1 and 12',
                'number.max': 'Month must be between 1 and 12',
                'any.required': 'Publication month is required',
            }),
        day: Joi.number()
            .min(1)
            .max(31)
            .optional()
            .messages({
                'number.min': 'Day must be between 1 and 31',
                'number.max': 'Day must be between 1 and 31',
            }),
        year: Joi.number()
            .min(1900)
            .max(new Date().getFullYear())
            .required()
            .messages({
                'number.min': 'Year must be after 1900',
                'number.max': 'Year cannot be in the future',
                'any.required': 'Publication year is required',
            }),
    }).required(),

    publicationUrl: Joi.string()
        .uri()
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.uri': 'Publication URL must be a valid URL',
        }),

    description: Joi.string()
        .max(2000)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Description cannot exceed 2000 characters',
        }),

    authors: Joi.array()
        .items(
            Joi.object({
                authorId: Joi.string().trim().optional(),
                authorName: Joi.string()
                    .min(2)
                    .max(100)
                    .trim()
                    .required()
                    .messages({
                        'string.min': 'Author name must be at least 2 characters',
                        'string.max': 'Author name cannot exceed 100 characters',
                        'any.required': 'Author name is required',
                    }),
                authorProfile: Joi.string().uri().trim().optional(),
            })
        )
        .max(20)
        .optional()
        .messages({
            'array.max': 'Maximum 20 co-authors allowed',
        }),

    publicationType: Joi.string()
        .valid('article', 'book', 'paper', 'conference_paper', 'thesis')
        .lowercase()
        .required()
        .messages({
            'any.only': 'Publication type must be article, book, paper, conference_paper, or thesis',
            'any.required': 'Publication type is required',
        }),
});

/**
 * Update Publication Validation Schema
 */
const updatePublicationSchema = Joi.object({
    title: Joi.string()
        .min(5)
        .max(500)
        .trim()
        .optional()
        .messages({
            'string.min': 'Title must be at least 5 characters',
            'string.max': 'Title cannot exceed 500 characters',
        }),

    publisherName: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .optional()
        .messages({
            'string.min': 'Publisher name must be at least 2 characters',
            'string.max': 'Publisher name cannot exceed 200 characters',
        }),

    publicationDate: Joi.object({
        month: Joi.number().min(1).max(12).required(),
        day: Joi.number().min(1).max(31).optional(),
        year: Joi.number().min(1900).max(new Date().getFullYear()).required(),
    }).optional(),

    publicationUrl: Joi.string()
        .uri()
        .trim()
        .optional()
        .allow(''),

    description: Joi.string()
        .max(2000)
        .trim()
        .optional()
        .allow(''),

    authors: Joi.array()
        .items(
            Joi.object({
                authorId: Joi.string().trim().optional(),
                authorName: Joi.string().min(2).max(100).trim().required(),
                authorProfile: Joi.string().uri().trim().optional(),
            })
        )
        .max(20)
        .optional(),

    publicationType: Joi.string()
        .valid('article', 'book', 'paper', 'conference_paper', 'thesis')
        .lowercase()
        .optional(),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

/**
 * Pin Publication Validation Schema
 */
const pinPublicationSchema = Joi.object({
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
 * Reorder Publications Validation Schema
 */
const reorderPublicationsSchema = Joi.object({
    reorderData: Joi.array()
        .items(
            Joi.object({
                publicationId: Joi.string().required(),
                newOrder: Joi.number().min(1).required(),
            })
        )
        .min(1)
        .required()
        .messages({
            'array.min': 'At least one publication must be reordered',
            'any.required': 'Reorder data is required',
        }),
});

/**
 * Update Citation Count Validation Schema
 */
const updateCitationSchema = Joi.object({
    googleScholar: Joi.number().min(0).optional(),
    researchGate: Joi.number().min(0).optional(),
    pubmed: Joi.number().min(0).optional(),
}).min(1).messages({
    'object.min': 'At least one citation source must be provided',
});

/**
 * Upload Media Validation Schema
 */
const uploadMediaSchema = Joi.object({
    mediaType: Joi.string()
        .valid('pdf', 'image')
        .required()
        .messages({
            'any.only': 'Media type must be pdf or image',
            'any.required': 'Media type is required',
        }),
});

// ==================== VALIDATION MIDDLEWARE ====================

const validateCreatePublication = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createPublicationSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        LoggerUtil.warn('Publication validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateUpdatePublication = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updatePublicationSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        LoggerUtil.warn('Publication update validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validatePinPublication = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = pinPublicationSchema.validate(req.body, {
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

const validateReorderPublications = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = reorderPublicationsSchema.validate(req.body, {
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

const validateUpdateCitation = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateCitationSchema.validate(req.body, {
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
 * @route   POST /api/v1/publications/create-publication
 * @desc    Create new publication
 * @access  Private
 */
router.post(
    '/create-publication',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreatePublication,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.createPublication(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/publications/get-all-publications
 * @desc    Get all publications for authenticated user
 * @access  Private
 * @query   includeArchived=true (optional)
 */
router.get(
    '/get-all-publications',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.getAllPublications(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/publications/get-publication/:publicationId
 * @desc    Get publication by ID
 * @access  Private
 */
router.get(
    '/get-publication/:publicationId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.getPublicationById(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/publications/update-publication/:publicationId
 * @desc    Update publication
 * @access  Private
 */
router.put(
    '/update-publication/:publicationId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdatePublication,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.updatePublication(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/publications/delete-publication/:publicationId
 * @desc    Delete publication (soft delete or permanent)
 * @access  Private
 * @query   permanent=true (optional)
 */
router.delete(
    '/delete-publication/:publicationId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.deletePublication(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/publications/archive-publication/:publicationId
 * @desc    Archive publication
 * @access  Private
 */
router.post(
    '/archive-publication/:publicationId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.archivePublication(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/publications/restore-publication/:publicationId
 * @desc    Restore archived/deleted publication
 * @access  Private
 */
router.post(
    '/restore-publication/:publicationId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.restorePublication(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/publications/pin-publication/:publicationId
 * @desc    Pin publication to top 3
 * @access  Private
 */
router.post(
    '/pin-publication/:publicationId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validatePinPublication,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.pinPublication(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/publications/unpin-publication/:publicationId
 * @desc    Unpin publication from top 3
 * @access  Private
 */
router.post(
    '/unpin-publication/:publicationId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.unpinPublication(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/publications/reorder-publications
 * @desc    Reorder publications
 * @access  Private
 */
router.post(
    '/reorder-publications',
    AuthMiddleware.authenticate as any,
    validateReorderPublications,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.reorderPublications(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/publications/update-citation/:publicationId
 * @desc    Update citation count tracking
 * @access  Private
 */
router.post(
    '/update-citation/:publicationId',
    AuthMiddleware.authenticate as any,
    validateUpdateCitation,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.updateCitationCount(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/publications/upload-logo/:publicationId
 * @desc    Upload publisher logo
 * @access  Private
 */
router.post(
    '/upload-logo/:publicationId',
    AuthMiddleware.authenticate as any,
    uploadSingle('logo'),
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.uploadPublisherLogo(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/publications/upload-media/:publicationId
 * @desc    Upload media attachment (PDF/image)
 * @access  Private
 */
router.post(
    '/upload-media/:publicationId',
    AuthMiddleware.authenticate as any,
    uploadSingle('media'),
    validateUploadMedia,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.uploadMediaAttachment(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/publications/delete-media/:publicationId/:mediaId
 * @desc    Delete media attachment
 * @access  Private
 */
router.delete(
    '/delete-media/:publicationId/:mediaId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PublicationController.deleteMediaAttachment(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

export default router;