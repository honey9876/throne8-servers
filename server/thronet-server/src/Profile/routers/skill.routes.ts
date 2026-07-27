/**
 * Skill Routes - API Endpoints for Skills Management
 * 
 * @module routes/skill.routes
 * @version 1.0.0
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
            console.log('🎯 CREATE SKILL ROUTE HIT');
            await SkillController.createSkill(req as any, res);
            console.log('✅ CREATE SKILL ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ CREATE SKILL ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/skills/get-all-skills
 * @desc    Get all skills for authenticated user
 * @access  Private
 * @query   includeArchived=true (optional)
 */
router.get(
    '/get-all-skills',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ALL SKILLS ROUTE HIT');
            await SkillController.getAllSkills(req as any, res);
            console.log('✅ GET ALL SKILLS ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET ALL SKILLS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/skills/get-all-skills/:userId
 * @desc    Get all skills for a specific user (public profile view)
 * @access  Private
 */
router.get(
    '/get-all-skills/:userId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET SKILLS BY USER ID ROUTE HIT');
            await SkillController.getSkillsByUserId(req as any, res);
            console.log('✅ GET SKILLS BY USER ID ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET SKILLS BY USER ID ROUTE ERROR:', error);
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
            console.log('🎯 GET SKILL BY ID ROUTE HIT');
            await SkillController.getSkillById(req as any, res);
            console.log('✅ GET SKILL BY ID ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET SKILL BY ID ROUTE ERROR:', error);
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
            console.log('🎯 UPDATE SKILL ROUTE HIT');
            await SkillController.updateSkill(req as any, res);
            console.log('✅ UPDATE SKILL ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ UPDATE SKILL ROUTE ERROR:', error);
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
            console.log('🎯 DELETE SKILL ROUTE HIT');
            await SkillController.deleteSkill(req as any, res);
            console.log('✅ DELETE SKILL ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ DELETE SKILL ROUTE ERROR:', error);
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
            console.log('🎯 ARCHIVE SKILL ROUTE HIT');
            await SkillController.archiveSkill(req as any, res);
            console.log('✅ ARCHIVE SKILL ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ ARCHIVE SKILL ROUTE ERROR:', error);
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
            console.log('🎯 RESTORE SKILL ROUTE HIT');
            await SkillController.restoreSkill(req as any, res);
            console.log('✅ RESTORE SKILL ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ RESTORE SKILL ROUTE ERROR:', error);
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
            console.log('🎯 PIN SKILL ROUTE HIT');
            await SkillController.pinSkill(req as any, res);
            console.log('✅ PIN SKILL ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ PIN SKILL ROUTE ERROR:', error);
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
            console.log('🎯 UNPIN SKILL ROUTE HIT');
            await SkillController.unpinSkill(req as any, res);
            console.log('✅ UNPIN SKILL ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ UNPIN SKILL ROUTE ERROR:', error);
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
            console.log('🎯 REQUEST ENDORSEMENT ROUTE HIT');
            await SkillController.requestEndorsement(req as any, res);
            console.log('✅ REQUEST ENDORSEMENT ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ REQUEST ENDORSEMENT ROUTE ERROR:', error);
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
            console.log('🎯 TOGGLE ENDORSEMENT VISIBILITY ROUTE HIT');
            await SkillController.toggleEndorsementVisibility(req as any, res);
            console.log('✅ TOGGLE ENDORSEMENT VISIBILITY ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ TOGGLE ENDORSEMENT VISIBILITY ROUTE ERROR:', error);
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
            console.log('🎯 REORDER SKILLS ROUTE HIT');
            await SkillController.reorderSkills(req as any, res);
            console.log('✅ REORDER SKILLS ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ REORDER SKILLS ROUTE ERROR:', error);
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
            console.log('🎯 EXPORT SKILLS ROUTE HIT');
            await SkillController.exportSkills(req as any, res);
            console.log('✅ EXPORT SKILLS ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ EXPORT SKILLS ROUTE ERROR:', error);
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
            console.log('🎯 GET SKILL SUGGESTIONS ROUTE HIT');
            await SkillController.getSkillSuggestions(req as any, res);
            console.log('✅ GET SKILL SUGGESTIONS ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET SKILL SUGGESTIONS ROUTE ERROR:', error);
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
            console.log('🎯 TAKE SKILL ASSESSMENT ROUTE HIT');
            await SkillController.takeSkillAssessment(req as any, res);
            console.log('✅ TAKE SKILL ASSESSMENT ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ TAKE SKILL ASSESSMENT ROUTE ERROR:', error);
            next(error);
        }
    }
);

export default router;