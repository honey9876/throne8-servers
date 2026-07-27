/**
 * Skill Routes - API Endpoints for Skills Management
 *
 * @module routes/skill.routes
 * @version 1.1.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { SkillController } from '@/shared/controllers/index.controllers';
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

/**
 * Create Skill Validation Schema
 */
const createSkillSchema = Joi.object({
    skillName: Joi.string()
        .min(2)
        .max(100)
        .pattern(/^[A-Za-z0-9][a-zA-Z0-9\s\-+#.()]+$/)
        .trim()
        .required()
        .messages({
            'string.min': 'Skill name must be at least 2 characters',
            'string.max': 'Skill name cannot exceed 100 characters',
            'string.pattern.base': 'Skill name must start with a letter or number',
            'string.empty': 'Skill name cannot be empty',
            'any.required': 'Skill name is required',
        }),

    category: Joi.string()
        .max(50)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Category cannot exceed 50 characters',
        }),

    skillStrength: Joi.string()
        .valid('beginner', 'intermediate', 'advanced', 'expert')
        .lowercase()
        .optional()
        .messages({
            'any.only': 'Skill strength must be one of: beginner, intermediate, advanced, expert',
        }),

    yearsOfExperience: Joi.number()
        .min(0)
        .max(50)
        .optional()
        .messages({
            'number.min': 'Years of experience cannot be negative',
            'number.max': 'Years of experience cannot exceed 50',
        }),

    lastUsed: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.base': 'Last used must be a valid date',
            'date.format': 'Last used must be in YYYY-MM-DD format',
        }),
});

/**
 * Update Skill Validation Schema
 */
const updateSkillSchema = Joi.object({
    skillName: Joi.string()
        .min(2)
        .max(100)
        .pattern(/^[A-Za-z0-9][a-zA-Z0-9\s\-+#.()]+$/)
        .trim()
        .optional()
        .messages({
            'string.min': 'Skill name must be at least 2 characters',
            'string.max': 'Skill name cannot exceed 100 characters',
            'string.pattern.base': 'Skill name must start with a letter or number',
        }),

    category: Joi.string()
        .max(50)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Category cannot exceed 50 characters',
        }),

    skillStrength: Joi.string()
        .valid('beginner', 'intermediate', 'advanced', 'expert')
        .lowercase()
        .optional()
        .messages({
            'any.only': 'Skill strength must be one of: beginner, intermediate, advanced, expert',
        }),

    yearsOfExperience: Joi.number()
        .min(0)
        .max(50)
        .optional()
        .messages({
            'number.min': 'Years of experience cannot be negative',
            'number.max': 'Years of experience cannot exceed 50',
        }),

    lastUsed: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.base': 'Last used must be a valid date',
            'date.format': 'Last used must be in YYYY-MM-DD format',
        }),

    isVisible: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'isVisible must be a boolean',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

/**
 * Pin Skill Validation Schema
 */
const pinSkillSchema = Joi.object({
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
 * Validation middleware wrapper
 */
const validateCreateSkill = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createSkillSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Skill validation failed', {
            errors,
            userId: (req as any).user?.userId,
            ipAddress: req.ip,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateUpdateSkill = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateSkillSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Skill update validation failed', {
            errors,
            userId: (req as any).user?.userId,
            skillId: req.params.skillId,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validatePinSkill = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = pinSkillSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Pin skill validation failed', {
            errors,
            userId: (req as any).user?.userId,
            skillId: req.params.skillId,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

// ==================== ROUTES ====================

/**
 * @route   POST /api/v1/skills/create-skill
 * @desc    Create new skill
 * @access  Private
 */
router.post(
    '/create-skill',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreateSkill,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Create skill route hit', { userId: (req as any).user?.userId });
            await SkillController.createSkill(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Create skill route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/skills/get-all-skills
 * @desc    Get all skills for authenticated user (own profile)
 * @access  Private
 * @query   includeArchived=true (optional)
 */
router.get(
    '/get-all-skills',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Get all skills route hit', { userId: (req as any).user?.userId });
            await SkillController.getAllSkills(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Get all skills route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/skills/get-all-skills/:userId
 * @desc    Get all visible skills for ANY user (public profile view).
 *          Archived and hidden (isVisible=false) skills are always
 *          excluded, regardless of who is viewing.
 * @access  Private (any authenticated user; data returned belongs to :userId)
 */
router.get(
    '/get-all-skills/:userId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Get skills by userId route hit', {
                targetUserId: req.params.userId,
                requestedBy: (req as any).user?.userId,
            });
            await SkillController.getSkillById(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Get skills by userId route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/skills/get-skill-id/:skillId
 * @desc    Get skill by ID
 * @access  Private
 */
router.get(
    '/get-skill-id/:skillId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Get skill by ID route hit', { skillId: req.params.skillId });
            await SkillController.getSkillById(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Get skill by ID route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/skills/update-skill/:skillId
 * @desc    Update skill
 * @access  Private
 */
router.put(
    '/update-skill/:skillId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdateSkill,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Update skill route hit', { skillId: req.params.skillId });
            await SkillController.updateSkill(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Update skill route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/skills/delete-skill/:skillId
 * @desc    Delete skill (soft delete)
 * @access  Private
 */
router.delete(
    '/delete-skill/:skillId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Delete skill route hit', { skillId: req.params.skillId });
            await SkillController.deleteSkill(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Delete skill route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/skills/archive-skill/:skillId/archive
 * @desc    Archive skill
 * @access  Private
 */
router.post(
    '/archive-skill/:skillId/archive',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Archive skill route hit', { skillId: req.params.skillId });
            await SkillController.archiveSkill(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Archive skill route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/skills/restore-skill/:skillId/restore
 * @desc    Restore archived skill
 * @access  Private
 */
router.post(
    '/restore-skill/:skillId/restore',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Restore skill route hit', { skillId: req.params.skillId });
            await SkillController.restoreSkill(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Restore skill route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/skills/pin-skill/:skillId/pin
 * @desc    Pin skill to top 3
 * @access  Private
 */
router.post(
    '/pin-skill/:skillId/pin',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validatePinSkill,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Pin skill route hit', { skillId: req.params.skillId });
            await SkillController.pinSkill(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Pin skill route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/skills/unpin-skill/:skillId/unpin
 * @desc    Unpin skill from top 3
 * @access  Private
 */
router.post(
    '/unpin-skill/:skillId/unpin',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Unpin skill route hit', { skillId: req.params.skillId });
            await SkillController.unpinSkill(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Unpin skill route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/skills/request-endorsement/:skillId
 * @desc    Request endorsement from another user
 * @access  Private
 */
router.post(
    '/request-endorsement/:skillId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Request endorsement route hit', { skillId: req.params.skillId });
            await SkillController.requestEndorsement(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Request endorsement route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/skills/toggle-endorsement-visibility/:skillId
 * @desc    Show/hide endorsements for a skill
 * @access  Private
 */
router.post(
    '/toggle-endorsement-visibility/:skillId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Toggle endorsement visibility route hit', { skillId: req.params.skillId });
            await SkillController.toggleEndorsementVisibility(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Toggle endorsement visibility route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/skills/reorder
 * @desc    Reorder skills (drag & drop)
 * @access  Private
 */
router.post(
    '/reorder',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Reorder skills route hit', { userId: (req as any).user?.userId });
            await SkillController.reorderSkills(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Reorder skills route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/skills/export
 * @desc    Export skills as PDF or CSV
 * @access  Private
 * @query   format=pdf|csv
 */
router.get(
    '/export',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 5, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Export skills route hit', { userId: (req as any).user?.userId });
            await SkillController.exportSkills(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Export skills route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/skills/suggestions
 * @desc    Get skill suggestions based on profile/industry
 * @access  Private
 * @query   industry (optional)
 */
router.get(
    '/suggestions',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Get skill suggestions route hit', { userId: (req as any).user?.userId });
            await SkillController.getSkillSuggestions(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Get skill suggestions route error', { error: error.message });
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/skills/assessment/:skillId
 * @desc    Take skill assessment/quiz
 * @access  Private
 */
router.post(
    '/assessment/:skillId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            LoggerUtil.info('Take skill assessment route hit', { skillId: req.params.skillId });
            await SkillController.takeSkillAssessment(req as any, res);
        } catch (error: any) {
            LoggerUtil.error('Take skill assessment route error', { error: error.message });
            next(error);
        }
    }
);

export default router;