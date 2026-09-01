/**
 * Project Routes - API Endpoints for Projects Management
 * 
 * @module routes/project.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { ProjectController } from '@/shared/controllers/index.controllers';
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
            if (typeof req.body[key] === 'string' && !['projectDescription'].includes(key)) {
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

const createProjectSchema = Joi.object({
    projectName: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .required()
        .messages({
            'string.min': 'Project name must be at least 2 characters',
            'string.max': 'Project name cannot exceed 200 characters',
            'string.empty': 'Project name is required',
            'any.required': 'Project name is required',
        }),

    projectDescription: Joi.string()
        .min(10)
        .max(2000)
        .trim()
        .required()
        .messages({
            'string.min': 'Description must be at least 10 characters',
            'string.max': 'Description cannot exceed 2000 characters',
            'string.empty': 'Description is required',
            'any.required': 'Description is required',
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
        .optional()
        .messages({
            'date.base': 'End date must be a valid date',
        }),

    isCurrentlyWorking: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'isCurrentlyWorking must be a boolean',
        }),

    projectUrl: Joi.string()
        .uri()
        .trim()
        .optional()
        .messages({
            'string.uri': 'Project URL must be a valid URL',
        }),

    associatedWith: Joi.object({
        type: Joi.string()
            .valid('company', 'school')
            .required()
            .messages({
                'any.only': 'Type must be company or school',
            }),
        name: Joi.string()
            .max(200)
            .trim()
            .required()
            .messages({
                'string.max': 'Organization name cannot exceed 200 characters',
            }),
        organizationId: Joi.string()
            .trim()
            .optional(),
    }).optional(),

    skillsUsed: Joi.array()
        .items(Joi.string().trim())
        .max(30)
        .optional()
        .messages({
            'array.max': 'Maximum 30 skills allowed',
        }),
});

const updateProjectSchema = Joi.object({
    projectName: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .optional()
        .messages({
            'string.min': 'Project name must be at least 2 characters',
            'string.max': 'Project name cannot exceed 200 characters',
        }),

    projectDescription: Joi.string()
        .min(10)
        .max(2000)
        .trim()
        .optional()
        .messages({
            'string.min': 'Description must be at least 10 characters',
            'string.max': 'Description cannot exceed 2000 characters',
        }),

    startDate: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.base': 'Start date must be a valid date',
        }),

    endDate: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.base': 'End date must be a valid date',
        }),

    isCurrentlyWorking: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'isCurrentlyWorking must be a boolean',
        }),

    projectUrl: Joi.string()
        .uri()
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.uri': 'Project URL must be a valid URL',
        }),

    associatedWith: Joi.object({
        type: Joi.string()
            .valid('company', 'school')
            .required(),
        name: Joi.string()
            .max(200)
            .trim()
            .required(),
        organizationId: Joi.string()
            .trim()
            .optional(),
    }).optional(),

    isVisible: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'isVisible must be a boolean',
        }),

    skillsUsed: Joi.array()
        .items(Joi.string().trim())
        .max(30)
        .optional()
        .messages({
            'array.max': 'Maximum 30 skills allowed',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

const addTeamMemberSchema = Joi.object({
    memberName: Joi.string()
        .min(2)
        .max(100)
        .trim()
        .required()
        .messages({
            'string.min': 'Member name must be at least 2 characters',
            'string.max': 'Member name cannot exceed 100 characters',
            'any.required': 'Member name is required',
        }),

    memberLinkedInUrl: Joi.string()
        .uri()
        .trim()
        .optional()
        .messages({
            'string.uri': 'LinkedIn URL must be valid',
        }),
});

const uploadMediaSchema = Joi.object({
    mediaType: Joi.string()
        .valid('image', 'video', 'document')
        .required()
        .messages({
            'any.only': 'Media type must be image, video, or document',
            'any.required': 'Media type is required',
        }),

    caption: Joi.string()
        .max(500)
        .trim()
        .optional()
        .messages({
            'string.max': 'Caption cannot exceed 500 characters',
        }),
});

const reorderProjectsSchema = Joi.object({
    projectOrders: Joi.array()
        .items(
            Joi.object({
                projectId: Joi.string().required(),
                displayOrder: Joi.number().min(1).required(),
            })
        )
        .min(1)
        .required()
        .messages({
            'array.min': 'At least one project order is required',
            'any.required': 'Project orders are required',
        }),
});

const pinProjectSchema = Joi.object({
    pinnedOrder: Joi.number()
        .min(1)
        .optional()
        .messages({
            'number.min': 'Pinned order must be at least 1',
        }),
});

// ==================== VALIDATION MIDDLEWARE ====================

const validateCreateProject = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createProjectSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        LoggerUtil.warn('Project validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateUpdateProject = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateProjectSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        LoggerUtil.warn('Project update validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateAddTeamMember = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = addTeamMemberSchema.validate(req.body, {
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

const validateReorderProjects = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = reorderProjectsSchema.validate(req.body, {
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

const validatePinProject = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = pinProjectSchema.validate(req.body, {
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

// ==================== ROUTES ====================

/**
 * @route   POST /api/v1/projects/create-project
 * @desc    Create new project
 * @access  Private
 */
router.post(
    '/create-project',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreateProject,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.createProject(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/projects/get-all-projects
 * @desc    Get all projects for authenticated user
 * @access  Private
 * @query   includeArchived=true (optional)
 */
router.get(
    '/get-all-projects',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.getAllProjects(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/projects/get-project/:projectId
 * @desc    Get project by ID
 * @access  Private
 */
router.get(
    '/get-project/:projectId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.getProjectById(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/projects/update-project/:projectId
 * @desc    Update project
 * @access  Private
 */
router.put(
    '/update-project/:projectId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdateProject,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.updateProject(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/projects/delete-project/:projectId
 * @desc    Delete project (soft delete)
 * @access  Private
 * @query   permanent=true (optional)
 */
router.delete(
    '/delete-project/:projectId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.deleteProject(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/projects/archive-project/:projectId
 * @desc    Archive project
 * @access  Private
 */
router.post(
    '/archive-project/:projectId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.archiveProject(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/projects/restore-project/:projectId
 * @desc    Restore archived/deleted project
 * @access  Private
 */
router.post(
    '/restore-project/:projectId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.restoreProject(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/projects/add-team-member/:projectId
 * @desc    Add team member to project
 * @access  Private
 */
router.post(
    '/add-team-member/:projectId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateAddTeamMember,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.addTeamMember(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/projects/remove-team-member/:projectId/:memberId
 * @desc    Remove team member from project
 * @access  Private
 */
router.delete(
    '/remove-team-member/:projectId/:memberId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.removeTeamMember(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/projects/upload-media/:projectId
 * @desc    Upload media attachment (image/video/document)
 * @access  Private
 */
router.post(
    '/upload-media/:projectId',
    AuthMiddleware.authenticate as any,
    uploadSingle('media'),
    validateUploadMedia,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.uploadMedia(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/projects/delete-media/:projectId/:mediaId
 * @desc    Delete media attachment
 * @access  Private
 */
router.delete(
    '/delete-media/:projectId/:mediaId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.deleteMedia(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/projects/reorder-projects
 * @desc    Reorder projects
 * @access  Private
 */
router.post(
    '/reorder-projects',
    AuthMiddleware.authenticate as any,
    validateReorderProjects,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.reorderProjects(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/projects/pin-project/:projectId
 * @desc    Pin project
 * @access  Private
 */
router.post(
    '/pin-project/:projectId',
    AuthMiddleware.authenticate as any,
    validatePinProject,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.pinProject(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/projects/unpin-project/:projectId
 * @desc    Unpin project
 * @access  Private
 */
router.post(
    '/unpin-project/:projectId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await ProjectController.unpinProject(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

export default router;