/**
 * Career Break Routes - API Endpoints for Career Break Management
 * Complete CRUD operations with validation
 * 
 * @module routes/careerBreak.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { CareerBreakController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';

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
 * Create Career Break Validation Schema
 */
const createCareerBreakSchema = Joi.object({
    breakType: Joi.string()
        .valid(
            'Caregiving',
            'Personal travel',
            'Career transition',
            'Layoff',
            'Full-time parenting',
            'Sabbatical',
            'Health & well-being',
            'Bereavement',
            'Gap year',
            'Relocation',
            'Retirement',
            'Volunteer work',
            'Other'
        )
        .required()
        .messages({
            'any.only': 'Break type must be one of: Caregiving, Personal travel, Career transition, Layoff, Full-time parenting, Sabbatical, Health & well-being, Bereavement, Gap year, Relocation, Retirement, Volunteer work, Other',
            'any.required': 'Break type is required',
        }),

    startDate: Joi.date()
        .iso()
        .required()
        .messages({
            'date.base': 'Start date must be a valid date',
            'date.format': 'Start date must be in YYYY-MM-DD format',
            'any.required': 'Start date is required',
        }),

    endDate: Joi.date()
        .iso()
        .min(Joi.ref('startDate'))
        .optional()
        .allow(null, '')
        .messages({
            'date.base': 'End date must be a valid date',
            'date.format': 'End date must be in YYYY-MM-DD format',
            'date.min': 'End date must be after start date',
        }),

    description: Joi.string()
        .min(10)
        .max(500)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.min': 'Description must be at least 10 characters',
            'string.max': 'Description cannot exceed 500 characters',
        }),

    displayOnProfile: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'Display on profile must be true or false',
        }),

    notifyNetwork: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'Notify network must be true or false',
        }),

    visibility: Joi.string()
        .valid('public', 'connections', 'private', 'me_only')
        .optional()
        .messages({
            'any.only': 'Visibility must be one of: public, connections, private, me_only',
        }),
});

/**
 * Update Career Break Validation Schema
 */
const updateCareerBreakSchema = Joi.object({
    breakType: Joi.string()
        .valid(
            'Caregiving',
            'Personal travel',
            'Career transition',
            'Layoff',
            'Full-time parenting',
            'Sabbatical',
            'Health & well-being',
            'Bereavement',
            'Gap year',
            'Relocation',
            'Retirement',
            'Volunteer work',
            'Other'
        )
        .optional()
        .messages({
            'any.only': 'Break type must be one of: Caregiving, Personal travel, Career transition, Layoff, Full-time parenting, Sabbatical, Health & well-being, Bereavement, Gap year, Relocation, Retirement, Volunteer work, Other',
        }),

    startDate: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.base': 'Start date must be a valid date',
            'date.format': 'Start date must be in YYYY-MM-DD format',
        }),

    endDate: Joi.date()
        .iso()
        .optional()
        .allow(null, '')
        .messages({
            'date.base': 'End date must be a valid date',
            'date.format': 'End date must be in YYYY-MM-DD format',
        }),

    description: Joi.string()
        .min(10)
        .max(500)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.min': 'Description must be at least 10 characters',
            'string.max': 'Description cannot exceed 500 characters',
        }),

    displayOnProfile: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'Display on profile must be true or false',
        }),

    notifyNetwork: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'Notify network must be true or false',
        }),

    visibility: Joi.string()
        .valid('public', 'connections', 'private', 'me_only')
        .optional()
        .messages({
            'any.only': 'Visibility must be one of: public, connections, private, me_only',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

/**
 * Validation middleware for create
 */
const validateCreateCareerBreak = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createCareerBreakSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Career break validation failed', {
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
const validateUpdateCareerBreak = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateCareerBreakSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Career break update validation failed', {
            errors,
            userId: (req as any).user?.userId,
            careerBreakId: req.params.careerBreakId,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

// ==================== ROUTES ====================

/**
 * @route   POST /api/v1/career-break
 * @desc    Create new career break
 * @access  Private
 */
router.post(
    '/',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreateCareerBreak,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await CareerBreakController.createCareerBreak(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/career-break
 * @desc    Get all career breaks for authenticated user
 * @access  Private
 */
router.get(
    '/',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await CareerBreakController.getAllCareerBreaks(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/career-break/:careerBreakId
 * @desc    Get career break by ID
 * @access  Private
 */
router.get(
    '/:careerBreakId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await CareerBreakController.getCareerBreakById(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/career-break/:careerBreakId
 * @desc    Update career break
 * @access  Private
 */
router.put(
    '/:careerBreakId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdateCareerBreak,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await CareerBreakController.updateCareerBreak(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/career-break/:careerBreakId
 * @desc    Delete career break (soft delete by default, permanent with ?permanent=true)
 * @access  Private
 */
router.delete(
    '/:careerBreakId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await CareerBreakController.deleteCareerBreak(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/career-break/:careerBreakId/archive
 * @desc    Archive career break
 * @access  Private
 */
router.post(
    '/:careerBreakId/archive',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await CareerBreakController.archiveCareerBreak(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/career-break/:careerBreakId/restore
 * @desc    Restore archived career break
 * @access  Private
 */
router.post(
    '/:careerBreakId/restore',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await CareerBreakController.restoreCareerBreak(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

export default router;