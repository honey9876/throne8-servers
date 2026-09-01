/**
 * Report Routes - API Endpoints for Post Reporting
 *
 * @module routes/report.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { ReportController } from '@/shared/controllers/index.controllers';
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

const createReportSchema = Joi.object({
    postId: Joi.string().required().messages({
        'string.empty': 'Post ID cannot be empty',
        'any.required': 'Post ID is required',
    }),
    reason: Joi.string()
        .valid(
            'spam_or_misleading',
            'harassment_or_bullying',
            'hate_speech',
            'nudity_or_sexual_content',
            'false_information',
            'something_else'
        )
        .required()
        .messages({
            'any.only': 'Invalid report reason',
            'any.required': 'Reason is required',
        }),
    details: Joi.string().max(500).trim().optional().allow(''),
    postOwnerId: Joi.string().optional(),
});

const updateStatusSchema = Joi.object({
    status: Joi.string()
        .valid('reviewed', 'action_taken', 'dismissed')
        .required()
        .messages({
            'any.only': 'Status must be one of: reviewed, action_taken, dismissed',
            'any.required': 'Status is required',
        }),
});

const validateCreateReport = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createReportSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);
        LoggerUtil.warn('Report validation failed', {
            errors,
            userId: (req as any).user?.userId,
            ipAddress: req.ip,
        });
        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateUpdateStatus = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateStatusSchema.validate(req.body, {
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
 * @route   POST /api/v1/reports
 * @desc    Report a post
 * @access  Private
 */
router.post(
    '/',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreateReport,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 CREATE REPORT ROUTE HIT');
            await ReportController.createReport(req as any, res);
            console.log('✅ CREATE REPORT ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ CREATE REPORT ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/reports/post/:postId
 * @desc    Get all reports for a specific post (moderation)
 * @access  Private
 */
router.get(
    '/post/:postId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET REPORTS BY POST ROUTE HIT');
            await ReportController.getReportsByPost(req as any, res);
            console.log('✅ GET REPORTS BY POST ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET REPORTS BY POST ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/reports/my-reports
 * @desc    Get reports submitted by the authenticated user
 * @access  Private
 */
router.get(
    '/my-reports',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET MY REPORTS ROUTE HIT');
            await ReportController.getMyReports(req as any, res);
            console.log('✅ GET MY REPORTS ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET MY REPORTS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/reports/pending
 * @desc    Get pending reports (admin/moderation queue)
 * @access  Private (TODO: restrict to admin/moderator role)
 * @query   limit (optional, default 50)
 */
router.get(
    '/pending',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 30, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET PENDING REPORTS ROUTE HIT');
            await ReportController.getPendingReports(req as any, res);
            console.log('✅ GET PENDING REPORTS ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET PENDING REPORTS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/reports/:reportId/status
 * @desc    Update report status (admin/moderation action)
 * @access  Private (TODO: restrict to admin/moderator role)
 */
router.put(
    '/:reportId/status',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdateStatus,
    rateLimitMiddleware({ maxRequests: 30, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPDATE REPORT STATUS ROUTE HIT');
            await ReportController.updateReportStatus(req as any, res);
            console.log('✅ UPDATE REPORT STATUS ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ UPDATE REPORT STATUS ROUTE ERROR:', error);
            next(error);
        }
    }
);

export default router;