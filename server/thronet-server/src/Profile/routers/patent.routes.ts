/**
 * Patent Routes - API Endpoints for Patents Management
 * 
 * @module routes/patent.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { PatentController } from '@/shared/controllers/index.controllers';
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
 * Create Patent Validation Schema
 */
const createPatentSchema = Joi.object({
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

    patentNumber: Joi.string()
        .min(3)
        .max(50)
        .trim()
        .required()
        .messages({
            'string.min': 'Patent number must be at least 3 characters',
            'string.max': 'Patent number cannot exceed 50 characters',
            'string.empty': 'Patent number is required',
            'any.required': 'Patent number is required',
        }),

    patentOffice: Joi.string()
        .valid('USPTO', 'EPO', 'WIPO', 'JPO', 'KIPO', 'CNIPA', 'IPO', 'CIPO', 'IP_AUSTRALIA', 'OTHER')
        .uppercase()
        .required()
        .messages({
            'any.only': 'Invalid patent office',
            'any.required': 'Patent office is required',
        }),

    issueDate: Joi.object({
        month: Joi.number()
            .min(1)
            .max(12)
            .required()
            .messages({
                'number.min': 'Month must be between 1 and 12',
                'number.max': 'Month must be between 1 and 12',
                'any.required': 'Issue month is required',
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
            .max(new Date().getFullYear() + 1)
            .required()
            .messages({
                'number.min': 'Year must be after 1900',
                'number.max': 'Year cannot be too far in the future',
                'any.required': 'Issue year is required',
            }),
    }).required(),

    inventors: Joi.array()
        .items(
            Joi.object({
                inventorId: Joi.string().trim().optional(),
                inventorName: Joi.string()
                    .min(2)
                    .max(100)
                    .trim()
                    .required()
                    .messages({
                        'string.min': 'Inventor name must be at least 2 characters',
                        'string.max': 'Inventor name cannot exceed 100 characters',
                        'any.required': 'Inventor name is required',
                    }),
                inventorProfile: Joi.string().uri().trim().optional(),
            })
        )
        .min(1)
        .max(50)
        .required()
        .messages({
            'array.min': 'At least one inventor is required',
            'array.max': 'Maximum 50 inventors allowed',
            'any.required': 'Inventors are required',
        }),

    patentStatus: Joi.string()
        .valid('pending', 'granted', 'expired', 'abandoned')
        .lowercase()
        .required()
        .messages({
            'any.only': 'Patent status must be pending, granted, expired, or abandoned',
            'any.required': 'Patent status is required',
        }),

    description: Joi.string()
        .max(1000)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Description cannot exceed 1000 characters',
        }),

    patentUrl: Joi.string()
        .uri()
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.uri': 'Patent URL must be a valid URL',
        }),
});

/**
 * Update Patent Validation Schema
 */
const updatePatentSchema = Joi.object({
    title: Joi.string()
        .min(5)
        .max(500)
        .trim()
        .optional()
        .messages({
            'string.min': 'Title must be at least 5 characters',
            'string.max': 'Title cannot exceed 500 characters',
        }),

    patentNumber: Joi.string()
        .min(3)
        .max(50)
        .trim()
        .optional()
        .messages({
            'string.min': 'Patent number must be at least 3 characters',
            'string.max': 'Patent number cannot exceed 50 characters',
        }),

    patentOffice: Joi.string()
        .valid('USPTO', 'EPO', 'WIPO', 'JPO', 'KIPO', 'CNIPA', 'IPO', 'CIPO', 'IP_AUSTRALIA', 'OTHER')
        .uppercase()
        .optional(),

    issueDate: Joi.object({
        month: Joi.number().min(1).max(12).required(),
        day: Joi.number().min(1).max(31).optional(),
        year: Joi.number().min(1900).max(new Date().getFullYear() + 1).required(),
    }).optional(),

    inventors: Joi.array()
        .items(
            Joi.object({
                inventorId: Joi.string().trim().optional(),
                inventorName: Joi.string().min(2).max(100).trim().required(),
                inventorProfile: Joi.string().uri().trim().optional(),
            })
        )
        .min(1)
        .max(50)
        .optional(),

    patentStatus: Joi.string()
        .valid('pending', 'granted', 'expired', 'abandoned')
        .lowercase()
        .optional(),

    description: Joi.string()
        .max(1000)
        .trim()
        .optional()
        .allow(''),

    patentUrl: Joi.string()
        .uri()
        .trim()
        .optional()
        .allow(''),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

/**
 * Reorder Patents Validation Schema
 */
const reorderPatentsSchema = Joi.object({
    reorderData: Joi.array()
        .items(
            Joi.object({
                patentId: Joi.string().required(),
                newOrder: Joi.number().min(1).required(),
            })
        )
        .min(1)
        .required()
        .messages({
            'array.min': 'At least one patent must be reordered',
            'any.required': 'Reorder data is required',
        }),
});

// ==================== VALIDATION MIDDLEWARE ====================

const validateCreatePatent = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createPatentSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        LoggerUtil.warn('Patent validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateUpdatePatent = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updatePatentSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        LoggerUtil.warn('Patent update validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateReorderPatents = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = reorderPatentsSchema.validate(req.body, {
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
 * @route   POST /api/v1/patents/create-patent
 * @desc    Create new patent
 * @access  Private
 */
router.post(
    '/create-patent',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreatePatent,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PatentController.createPatent(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/patents/get-all-patents
 * @desc    Get all patents for authenticated user
 * @access  Private
 * @query   includeArchived=true (optional)
 */
router.get(
    '/get-all-patents',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PatentController.getAllPatents(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/patents/get-patent/:patentId
 * @desc    Get patent by ID
 * @access  Private
 */
router.get(
    '/get-patent/:patentId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PatentController.getPatentById(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/patents/update-patent/:patentId
 * @desc    Update patent
 * @access  Private
 */
router.put(
    '/update-patent/:patentId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdatePatent,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PatentController.updatePatent(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/patents/delete-patent/:patentId
 * @desc    Delete patent (soft delete or permanent)
 * @access  Private
 * @query   permanent=true (optional)
 */
router.delete(
    '/delete-patent/:patentId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PatentController.deletePatent(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/patents/archive-patent/:patentId
 * @desc    Archive patent
 * @access  Private
 */
router.post(
    '/archive-patent/:patentId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PatentController.archivePatent(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/patents/restore-patent/:patentId
 * @desc    Restore archived/deleted patent
 * @access  Private
 */
router.post(
    '/restore-patent/:patentId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PatentController.restorePatent(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/patents/reorder-patents
 * @desc    Reorder patents
 * @access  Private
 */
router.post(
    '/reorder-patents',
    AuthMiddleware.authenticate as any,
    validateReorderPatents,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PatentController.reorderPatents(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/patents/upload-document/:patentId
 * @desc    Upload patent document
 * @access  Private
 */
router.post(
    '/upload-document/:patentId',
    AuthMiddleware.authenticate as any,
    uploadSingle('document'),
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PatentController.uploadPatentDocument(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/patents/delete-document/:patentId/:mediaId
 * @desc    Delete patent document
 * @access  Private
 */
router.delete(
    '/delete-document/:patentId/:mediaId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await PatentController.deletePatentDocument(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

export default router;