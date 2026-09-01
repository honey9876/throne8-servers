/**
 * Position Routes - All 22 Features
 * 
 * @module routes/position.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { PositionController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';

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

const createPositionSchema = Joi.object({
    jobTitle: Joi.string()
        .min(2)
        .max(100)
        .trim()
        .required()
        .messages({
            'string.min': 'Job title must be at least 2 characters',
            'string.max': 'Job title cannot exceed 100 characters',
            'any.required': 'Job title is required',
        }),

    employmentType: Joi.string()
        .valid('full-time', 'part-time', 'contract', 'freelance', 'internship', 'self-employed', 'seasonal', 'temporary')
        .lowercase()
        .required()
        .messages({
            'any.only': 'Invalid employment type',
            'any.required': 'Employment type is required',
        }),

    companyName: Joi.string()
        .min(2)
        .max(150)
        .trim()
        .required()
        .messages({
            'string.min': 'Company name must be at least 2 characters',
            'string.max': 'Company name cannot exceed 150 characters',
            'any.required': 'Company name is required',
        }),

    location: Joi.string()
        .max(100)
        .trim()
        .optional()
        .allow(''),

    locationType: Joi.string()
        .valid('on-site', 'remote', 'hybrid')
        .lowercase()
        .required()
        .messages({
            'any.only': 'Invalid location type',
            'any.required': 'Location type is required',
        }),

    startDate: Joi.date()
        .iso()
        .required()
        .messages({
            'date.base': 'Start date must be a valid date',
            'any.required': 'Start date is required',
        }),

    endDate: Joi.date()
        .iso()
        .min(Joi.ref('startDate'))
        .optional()
        .allow(null, ''),

    currentlyWorking: Joi.boolean().optional(),

    industry: Joi.string()
        .max(100)
        .trim()
        .optional()
        .allow(''),

    description: Joi.string()
        .max(2000)
        .trim()
        .optional()
        .allow(''),

    updateProfileHeadline: Joi.boolean().optional(),
    notifyNetwork: Joi.boolean().optional(),

    skillIds: Joi.array()
        .items(Joi.string().uuid())
        .optional(),
});

const updatePositionSchema = Joi.object({
    jobTitle: Joi.string().min(2).max(100).trim().optional(),
    employmentType: Joi.string().valid('full-time', 'part-time', 'contract', 'freelance', 'internship', 'self-employed', 'seasonal', 'temporary').lowercase().optional(),
    companyName: Joi.string().min(2).max(150).trim().optional(),
    location: Joi.string().max(100).trim().optional().allow(''),
    locationType: Joi.string().valid('on-site', 'remote', 'hybrid').lowercase().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional().allow(null, ''),
    currentlyWorking: Joi.boolean().optional(),
    industry: Joi.string().max(100).trim().optional().allow(''),
    description: Joi.string().max(2000).trim().optional().allow(''),
    updateProfileHeadline: Joi.boolean().optional(),
    notifyNetwork: Joi.boolean().optional(),
    skillIds: Joi.array().items(Joi.string().uuid()).optional(),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

const reorderSchema = Joi.object({
    positionIds: Joi.array()
        .items(Joi.string().uuid())
        .min(1)
        .required()
        .messages({
            'array.min': 'At least one position ID is required',
            'any.required': 'positionIds array is required',
        }),
});

const mediaAttachmentSchema = Joi.object({
    type: Joi.string()
        .valid('image', 'video', 'document', 'link')
        .required(),
    url: Joi.string().uri().required(),
    publicId: Joi.string().optional(),
    fileName: Joi.string().optional(),
    fileSize: Joi.number().positive().optional(),
    title: Joi.string().max(200).optional(),
    description: Joi.string().max(500).optional(),
});

const shareUpdateSchema = Joi.object({
    message: Joi.string()
        .max(500)
        .optional()
        .allow(''),
});

// ==================== VALIDATION MIDDLEWARE ====================

const validateCreatePosition = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createPositionSchema.validate(req.body, {
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

const validateUpdatePosition = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updatePositionSchema.validate(req.body, {
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

const validateReorder = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = reorderSchema.validate(req.body, {
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

const validateMediaAttachment = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = mediaAttachmentSchema.validate(req.body, {
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

const validateShareUpdate = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = shareUpdateSchema.validate(req.body, {
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

// ==================== ROUTES (22 FEATURES) ====================

/**
 * 1. CREATE POSITION
 * POST /api/v1/positions
 */
router.post(
    '/',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreatePosition,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    PositionController.createPosition as any
);

/**
 * 2. GET ALL POSITIONS
 * GET /api/v1/positions
 */
router.get(
    '/',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    PositionController.getAllPositions as any
);

/**
 * 3. GET POSITION BY ID
 * GET /api/v1/positions/:positionId
 */
router.get(
    '/:positionId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    PositionController.getPositionById as any
);

/**
 * 4. UPDATE POSITION
 * PUT /api/v1/positions/:positionId
 */
router.put(
    '/:positionId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdatePosition,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    PositionController.updatePosition as any
);

/**
 * 5. DELETE POSITION (SOFT)
 * DELETE /api/v1/positions/:positionId
 */
router.delete(
    '/:positionId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    PositionController.deletePosition as any
);

/**
 * 6. DELETE POSITION (PERMANENT)
 * DELETE /api/v1/positions/:positionId/permanent
 */
router.delete(
    '/:positionId/permanent',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 5, windowMs: 60000 }),
    PositionController.deletePositionPermanently as any
);

/**
 * 7. ARCHIVE POSITION
 * POST /api/v1/positions/:positionId/archive
 */
router.post(
    '/:positionId/archive',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    PositionController.archivePosition as any
);

/**
 * 8. RESTORE POSITION
 * POST /api/v1/positions/:positionId/restore
 */
router.post(
    '/:positionId/restore',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    PositionController.restorePosition as any
);

/**
 * 9. REORDER POSITIONS
 * POST /api/v1/positions/reorder
 */
router.post(
    '/reorder',
    AuthMiddleware.authenticate as any,
    validateReorder,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    PositionController.reorderPositions as any
);

/**
 * 10. ADD MEDIA ATTACHMENT
 * POST /api/v1/positions/:positionId/media
 */
router.post(
    '/:positionId/media',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateMediaAttachment,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    PositionController.addMediaAttachment as any
);

/**
 * 11. REMOVE MEDIA ATTACHMENT
 * DELETE /api/v1/positions/:positionId/media/:attachmentIndex
 */
router.delete(
    '/:positionId/media/:attachmentIndex',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    PositionController.removeMediaAttachment as any
);

/**
 * 12. GET TOTAL EXPERIENCE (Feature 35)
 * GET /api/v1/positions/analytics/total-experience
 */
router.get(
    '/analytics/total-experience',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    PositionController.getTotalExperience as any
);

/**
 * 13. GET EMPLOYMENT GAPS (Feature 36)
 * GET /api/v1/positions/analytics/employment-gaps
 */
router.get(
    '/analytics/employment-gaps',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    PositionController.getEmploymentGaps as any
);

/**
 * 14. GET CURRENT POSITION
 * GET /api/v1/positions/current
 */
router.get(
    '/current/position',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    PositionController.getCurrentPosition as any
);

/**
 * 15. SHARE POSITION UPDATE (Feature 37)
 * POST /api/v1/positions/:positionId/share
 */
router.post(
    '/:positionId/share',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateShareUpdate,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    PositionController.sharePositionUpdate as any
);

export default router;