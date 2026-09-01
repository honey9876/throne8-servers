/**
 * Test Score Routes - API Endpoints for Test Score Management
 * Complete CRUD operations with validation and reordering
 * 
 * @module routes/testScore.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { TestScoreController } from '@/shared/controllers/index.controllers';
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
 * Create Test Score Validation Schema
 */
const createTestScoreSchema = Joi.object({
    testName: Joi.string()
        .valid(
            'GRE',
            'GMAT',
            'TOEFL',
            'IELTS',
            'SAT',
            'ACT',
            'LSAT',
            'MCAT',
            'CAT',
            'JEE',
            'NEET',
            'GATE',
            'UPSC',
            'PTE',
            'Duolingo English Test',
            'Other'
        )
        .required()
        .messages({
            'any.only': 'Test name must be one of: GRE, GMAT, TOEFL, IELTS, SAT, ACT, LSAT, MCAT, CAT, JEE, NEET, GATE, UPSC, PTE, Duolingo English Test, Other',
            'any.required': 'Test name is required',
        }),

    score: Joi.string()
        .min(1)
        .max(50)
        .pattern(/^[0-9.\/\s-]+$/)
        .trim()
        .required()
        .messages({
            'string.min': 'Score must be at least 1 character',
            'string.max': 'Score cannot exceed 50 characters',
            'string.pattern.base': 'Score must contain only numbers, dots, slashes, spaces, or hyphens',
            'any.required': 'Score is required',
        }),

    testDate: Joi.date()
        .iso()
        .max('now')
        .required()
        .messages({
            'date.base': 'Test date must be a valid date',
            'date.format': 'Test date must be in YYYY-MM-DD format',
            'date.max': 'Test date cannot be in the future',
            'any.required': 'Test date is required',
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

    associatedSchool: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.min': 'School name must be at least 2 characters',
            'string.max': 'School name cannot exceed 200 characters',
        }),

    validityYears: Joi.number()
        .min(1)
        .max(20)
        .optional()
        .messages({
            'number.min': 'Validity must be at least 1 year',
            'number.max': 'Validity cannot exceed 20 years',
        }),
});

/**
 * Update Test Score Validation Schema
 */
const updateTestScoreSchema = Joi.object({
    testName: Joi.string()
        .valid(
            'GRE',
            'GMAT',
            'TOEFL',
            'IELTS',
            'SAT',
            'ACT',
            'LSAT',
            'MCAT',
            'CAT',
            'JEE',
            'NEET',
            'GATE',
            'UPSC',
            'PTE',
            'Duolingo English Test',
            'Other'
        )
        .optional()
        .messages({
            'any.only': 'Test name must be one of: GRE, GMAT, TOEFL, IELTS, SAT, ACT, LSAT, MCAT, CAT, JEE, NEET, GATE, UPSC, PTE, Duolingo English Test, Other',
        }),

    score: Joi.string()
        .min(1)
        .max(50)
        .pattern(/^[0-9.\/\s-]+$/)
        .trim()
        .optional()
        .messages({
            'string.min': 'Score must be at least 1 character',
            'string.max': 'Score cannot exceed 50 characters',
            'string.pattern.base': 'Score must contain only numbers, dots, slashes, spaces, or hyphens',
        }),

    testDate: Joi.date()
        .iso()
        .max('now')
        .optional()
        .messages({
            'date.base': 'Test date must be a valid date',
            'date.format': 'Test date must be in YYYY-MM-DD format',
            'date.max': 'Test date cannot be in the future',
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

    associatedSchool: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.min': 'School name must be at least 2 characters',
            'string.max': 'School name cannot exceed 200 characters',
        }),

    validityYears: Joi.number()
        .min(1)
        .max(20)
        .optional()
        .messages({
            'number.min': 'Validity must be at least 1 year',
            'number.max': 'Validity cannot exceed 20 years',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

/**
 * Reorder Test Scores Validation Schema
 */
const reorderTestScoresSchema = Joi.object({
    orderedIds: Joi.array()
        .items(Joi.string().uuid({ version: 'uuidv4' }))
        .min(1)
        .required()
        .messages({
            'array.base': 'orderedIds must be an array',
            'array.min': 'orderedIds must contain at least one ID',
            'any.required': 'orderedIds is required',
            'string.guid': 'Each ID must be a valid UUID',
        }),
});

/**
 * Validation middleware for create
 */
const validateCreateTestScore = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createTestScoreSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Test score validation failed', {
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
const validateUpdateTestScore = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateTestScoreSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Test score update validation failed', {
            errors,
            userId: (req as any).user?.userId,
            testScoreId: req.params.testScoreId,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

/**
 * Validation middleware for reorder
 */
const validateReorderTestScores = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = reorderTestScoresSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Test score reorder validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

// ==================== ROUTES ====================

/**
 * @route   POST /api/v1/test-score
 * @desc    Create new test score
 * @access  Private
 */
router.post(
    '/',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreateTestScore,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await TestScoreController.createTestScore(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/test-score
 * @desc    Get all test scores for authenticated user
 * @access  Private
 */
router.get(
    '/',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await TestScoreController.getAllTestScores(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/test-score/reorder
 * @desc    Reorder test scores
 * @access  Private
 */
router.post(
    '/reorder',
    AuthMiddleware.authenticate as any,
    validateReorderTestScores,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await TestScoreController.reorderTestScores(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/test-score/:testScoreId
 * @desc    Get test score by ID
 * @access  Private
 */
router.get(
    '/:testScoreId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await TestScoreController.getTestScoreById(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/test-score/:testScoreId
 * @desc    Update test score
 * @access  Private
 */
router.put(
    '/:testScoreId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdateTestScore,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await TestScoreController.updateTestScore(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/test-score/:testScoreId
 * @desc    Delete test score (soft delete by default, permanent with ?permanent=true)
 * @access  Private
 */
router.delete(
    '/:testScoreId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await TestScoreController.deleteTestScore(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/test-score/:testScoreId/archive
 * @desc    Archive test score
 * @access  Private
 */
router.post(
    '/:testScoreId/archive',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await TestScoreController.archiveTestScore(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/test-score/:testScoreId/restore
 * @desc    Restore archived test score
 * @access  Private
 */
router.post(
    '/:testScoreId/restore',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await TestScoreController.restoreTestScore(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

export default router;