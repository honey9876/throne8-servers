/**
 * About Routes - API Endpoints with Video & Media Upload
 * 
 * @module routes/about.routes
 * @version 2.0.0
 */

import express, { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AboutController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import { uploadSingle } from '@/shared/upload/upload';

const router = express.Router();

// ==================== VALIDATION SCHEMAS ====================

const createAboutSchema = Joi.object({
    aboutText: Joi.string()
        .min(50)
        .max(2600)
        .trim()
        .pattern(/^[A-Z]/)
        .required()
        .messages({
            'string.min': 'About text must be at least 50 characters',
            'string.max': 'About text cannot exceed 2600 characters',
            'string.pattern.base': 'About text must start with a capital letter',
            'string.empty': 'About text is required',
            'any.required': 'About text is required',
        }),
    textFormatting: Joi.string()
        .optional()
        .messages({
            'string.base': 'Text formatting must be a JSON string',
        }),
});

const updateAboutSchema = Joi.object({
    aboutText: Joi.string()
        .min(50)
        .max(2600)
        .trim()
        .pattern(/^[A-Z]/)
        .optional()
        .messages({
            'string.min': 'About text must be at least 50 characters',
            'string.max': 'About text cannot exceed 2600 characters',
            'string.pattern.base': 'About text must start with a capital letter',
        }),
    isExpanded: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'isExpanded must be a boolean',
        }),
    textFormatting: Joi.string()
        .optional()
        .messages({
            'string.base': 'Text formatting must be a JSON string',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

const uploadMediaSchema = Joi.object({
    mediaType: Joi.string()
        .valid('image', 'document')
        .required()
        .messages({
            'any.only': 'Media type must be image or document',
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

// ==================== MIDDLEWARE ====================

const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string' && key !== 'textFormatting') {
                req.body[key] = (req.body[key] as string)
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<[^>]+>/g, '')
                    .trim();
            }
        });
    }
    next();
};

const validateCreateAbout = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createAboutSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('About validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateUpdateAbout = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateAboutSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('About update validation failed', {
            errors,
            userId: (req as any).user?.userId,
        });

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

        LoggerUtil.warn('Media upload validation failed', {
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
 * @route   POST /api/v1/about/create-about
 * @desc    Create about section
 * @access  Private
 */
router.post(
    '/create-about',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreateAbout,
    rateLimitMiddleware({ maxRequests: 5, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await AboutController.createAbout(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/about/upload-video/:aboutId
 * @desc    Upload cover story video (max 120 seconds)
 * @access  Private
 */
router.post(
    '/upload-video/:aboutId',
    AuthMiddleware.authenticate as any,
    uploadSingle('video', 'video'),   // 👈 second arg 'video' add kiya — ab video filter use hoga, image filter nahi
    rateLimitMiddleware({ maxRequests: 3, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await AboutController.uploadCoverStory(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);
/**
 * @route   POST /api/v1/about/upload-media/:aboutId
 * @desc    Upload media attachment (image/document)
 * @access  Private
 */
router.post(
    '/upload-media/:aboutId',
    AuthMiddleware.authenticate as any,
    uploadSingle('media'),
    validateUploadMedia,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await AboutController.uploadMediaAttachment(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/about/delete-media/:aboutId/:mediaId
 * @desc    Delete media attachment
 * @access  Private
 */
router.delete(
    '/delete-media/:aboutId/:mediaId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await AboutController.deleteMediaAttachment(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/about/get-all-about
 * @desc    Get about for authenticated user
 * @access  Private
 */
router.get(
    '/get-all-about',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await AboutController.getAllAbout(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/about/get-about/:aboutId
 * @desc    Get about by ID
 * @access  Private
 */
router.get(
    '/get-about/:aboutId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await AboutController.getAboutById(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/about/update-about/:aboutId
 * @desc    Update about
 * @access  Private
 */
router.put(
    '/update-about/:aboutId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdateAbout,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await AboutController.updateAbout(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/about/delete-about/:aboutId
 * @desc    Delete about (soft delete or permanent)
 * @access  Private
 * @query   permanent=true (optional)
 */
router.delete(
    '/delete-about/:aboutId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await AboutController.deleteAbout(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/about/archive-about/:aboutId
 * @desc    Archive about
 * @access  Private
 */
router.post(
    '/archive-about/:aboutId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await AboutController.archiveAbout(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/about/restore-about/:aboutId
 * @desc    Restore archived/deleted about
 * @access  Private
 */
router.post(
    '/restore-about/:aboutId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            await AboutController.restoreAbout(req as any, res);
        } catch (error : any) {
            next(error);
        }
    }
);

export default router;