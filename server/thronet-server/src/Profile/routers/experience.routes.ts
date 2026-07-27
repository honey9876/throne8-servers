/**
 * Experience Routes - API Endpoints for Professional Experience
 * Supports CREATE, GET, UPDATE, DELETE, ARCHIVE, RESTORE
 * 
 * @module routes/experience.routes
 * @version 1.0.0
 */

import express, { Request, Response, NextFunction } from 'express';
import { ExperienceController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import Joi from 'joi';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';

const router = express.Router();
const logger = LoggerUtil;

// ==================== VALIDATION SCHEMAS ====================

const createExperienceSchema = Joi.object({
    currentPosition: Joi.string()
        .min(2)
        .max(100)
        .trim()
        .required()
        .messages({
            'string.min': 'Position must be at least 2 characters',
            'string.max': 'Position cannot exceed 100 characters',
            'string.empty': 'Position is required',
            'any.required': 'Position is required',
        }),

    companyName: Joi.string()
        .min(2)
        .max(150)
        .trim()
        .required()
        .messages({
            'string.min': 'Company name must be at least 2 characters',
            'string.max': 'Company name cannot exceed 150 characters',
            'string.empty': 'Company name is required',
            'any.required': 'Company name is required',
        }),

    description: Joi.string()
        .min(15)
        .max(500)
        .trim()
        .required()
        .custom((value, helpers) => {
            return value;
        })
        .messages({}),

    startDate: Joi.date()
        .iso()
        .max('now')
        .required()
        .messages({
            'date.base': 'Start date must be a valid date',
            'date.format': 'Start date must be in ISO format (YYYY-MM-DD)',
            'date.max': 'Start date cannot be in the future',
            'any.required': 'Start date is required',
        }),

    endDate: Joi.date()
        .iso()
        .min(Joi.ref('startDate'))
        .max('now')
        .optional()
        .allow(null, '')
        .messages({
            'date.base': 'End date must be a valid date',
            'date.format': 'End date must be in ISO format (YYYY-MM-DD)',
            'date.min': 'End date must be after start date',
            'date.max': 'End date cannot be in the future',
        }),

    currentlyWorking: Joi.boolean()
        .default(false)
        .messages({
            'boolean.base': 'Currently working must be true or false',
        }),

    keyAchievements: Joi.array()
        .items(
            Joi.string()
                .min(5)
                .max(200)
                .trim()
                .messages({
                    'string.min': 'Each achievement must be at least 5 characters',
                    'string.max': 'Each achievement cannot exceed 200 characters',
                })
        )
        .max(10)
        .optional()
        .messages({
            'array.max': 'Maximum 10 achievements allowed',
        }),
});

const updateExperienceSchema = Joi.object({
    currentPosition: Joi.string()
        .min(2)
        .max(100)
        .trim()
        .optional(),

    companyName: Joi.string()
        .min(2)
        .max(150)
        .trim()
        .optional(),

    description: Joi.string()
        .min(15)
        .message('Description must be at least 15 characters')
        .max(500)
        .message('Description cannot exceed 500 characters')
        .trim()
        .message('Description cannot be empty')
        .optional(),

    startDate: Joi.date()
        .iso()
        .max('now')
        .optional(),

    endDate: Joi.date()
        .iso()
        .max('now')
        .optional()
        .allow(null, ''),

    currentlyWorking: Joi.boolean()
        .optional(),

    keyAchievements: Joi.array()
        .items(
            Joi.string()
                .min(5)
                .max(200)
                .trim()
        )
        .max(10)
        .optional(),
})
    .min(1)
    .messages({
        'object.min': 'At least one field must be provided for update',
    });

// ==================== VALIDATION MIDDLEWARE ====================

const validateCreate = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createExperienceSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        logger.warn('Create experience validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateUpdate = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateExperienceSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        logger.warn('Update experience validation failed', {
            errors,
            userId: (req as any).user?.userId,
            experienceId: req.params.experienceId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

// ==================== ROUTES ====================

/**
 * @route   POST /api/v1/experience
 * @desc    Create new experience
 * @access  Private (requires JWT)
 */
router.post(
    '/create-experience',
    AuthMiddleware.authenticate as any,
    validateCreate,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            logger.info('CREATE EXPERIENCE ROUTE HIT');
            await ExperienceController.createExperience(req as any, res);
            logger.info('✅ CREATE EXPERIENCE ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ CREATE EXPERIENCE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/experience
 * @desc    Get all experiences for authenticated user
 * @access  Private
 * @query   includeArchived=true (optional)
 */
router.get(
    '/get-all-experiences',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            logger.info('GET ALL EXPERIENCES ROUTE HIT');
            await ExperienceController.getAllExperiences(req as any, res);
            logger.info('✅ GET ALL EXPERIENCES ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET ALL EXPERIENCES ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/experience/get-all-experiences/:userId
 * @desc    Get all experiences for a specific user (public profile view)
 * @access  Public
 */
router.get(
    '/get-all-experiences/:userId',
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            logger.info('GET ALL EXPERIENCES BY USERID ROUTE HIT');
            await ExperienceController.getAllExperiencesByUserId(req as any, res);
            logger.info('✅ GET ALL EXPERIENCES BY USERID ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET ALL EXPERIENCES BY USERID ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/experience/:experienceId
 * @desc    Get single experience by ID
 * @access  Private
 */
router.get(
    '/get-experience/:experienceId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            logger.info('GET EXPERIENCE BY ID ROUTE HIT', {
                experienceId: req.params.experienceId,
            });
            await ExperienceController.getExperienceById(req as any, res);
            logger.info('✅ GET EXPERIENCE BY ID ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET EXPERIENCE BY ID ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/experience/:experienceId
 * @desc    Update experience
 * @access  Private
 */
router.put(
    '/update-experience/:experienceId',
    AuthMiddleware.authenticate as any,
    validateUpdate,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            logger.info('UPDATE EXPERIENCE ROUTE HIT', {
                experienceId: req.params.experienceId,
            });
            await ExperienceController.updateExperience(req as any, res);
            logger.info('✅ UPDATE EXPERIENCE ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ UPDATE EXPERIENCE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/experience/:experienceId
 * @desc    Delete experience (soft delete by default)
 * @access  Private
 * @query   permanent=true (for permanent deletion)
 */
router.delete(
    '/delete-experience/:experienceId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            logger.info('DELETE EXPERIENCE ROUTE HIT', {
                experienceId: req.params.experienceId,
                permanent: req.query.permanent,
            });
            await ExperienceController.deleteExperience(req as any, res);
            logger.info('✅ DELETE EXPERIENCE ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ DELETE EXPERIENCE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/experience/:experienceId/archive
 * @desc    Archive experience
 * @access  Private
 */
router.post(
    '/:experienceId/archive',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            logger.info('ARCHIVE EXPERIENCE ROUTE HIT', {
                experienceId: req.params.experienceId,
            });
            await ExperienceController.archiveExperience(req as any, res);
            logger.info('✅ ARCHIVE EXPERIENCE ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ ARCHIVE EXPERIENCE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/experience/:experienceId/restore
 * @desc    Restore archived experience
 * @access  Private
 */
router.post(
    '/:experienceId/restore',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            logger.info('RESTORE EXPERIENCE ROUTE HIT', {
                experienceId: req.params.experienceId,
            });
            await ExperienceController.restoreExperience(req as any, res);
            logger.info('✅ RESTORE EXPERIENCE ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ RESTORE EXPERIENCE ROUTE ERROR:', error);
            next(error);
        }
    }
);

export default router;