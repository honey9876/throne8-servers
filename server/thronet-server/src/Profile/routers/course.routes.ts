/**
 * Course Routes - API Endpoints for Courses Management
 * 
 * @module routes/course.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { CourseController } from '@/shared/controllers/index.controllers';
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
 * Create Course Validation Schema
 */
const createCourseSchema = Joi.object({
    courseName: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .required()
        .messages({
            'string.min': 'Course name must be at least 2 characters',
            'string.max': 'Course name cannot exceed 200 characters',
            'string.empty': 'Course name cannot be empty',
            'any.required': 'Course name is required',
        }),

    courseNumber: Joi.string()
        .max(50)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Course number cannot exceed 50 characters',
        }),

    associatedSchool: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .required()
        .messages({
            'string.min': 'School name must be at least 2 characters',
            'string.max': 'School name cannot exceed 200 characters',
            'string.empty': 'School name cannot be empty',
            'any.required': 'Associated school is required',
        }),

    completionDate: Joi.object({
        month: Joi.number()
            .integer()
            .min(1)
            .max(12)
            .required()
            .messages({
                'number.min': 'Month must be between 1 and 12',
                'number.max': 'Month must be between 1 and 12',
                'any.required': 'Completion month is required',
            }),
        year: Joi.number()
            .integer()
            .min(1900)
            .max(new Date().getFullYear() + 10)
            .required()
            .messages({
                'number.min': 'Year must be after 1900',
                'number.max': 'Year cannot be more than 10 years in future',
                'any.required': 'Completion year is required',
            }),
    })
        .required()
        .messages({
            'any.required': 'Completion date is required',
        }),

    description: Joi.string()
        .max(500)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Description cannot exceed 500 characters',
        }),

    skillsLearned: Joi.array()
        .items(
            Joi.string()
                .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
                .messages({
                    'string.pattern.base': 'Invalid skill ID format',
                })
        )
        .optional()
        .messages({
            'array.base': 'Skills learned must be an array',
        }),
});

/**
 * Update Course Validation Schema
 */
const updateCourseSchema = Joi.object({
    courseName: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .optional()
        .messages({
            'string.min': 'Course name must be at least 2 characters',
            'string.max': 'Course name cannot exceed 200 characters',
        }),

    courseNumber: Joi.string()
        .max(50)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Course number cannot exceed 50 characters',
        }),

    associatedSchool: Joi.string()
        .min(2)
        .max(200)
        .trim()
        .optional()
        .messages({
            'string.min': 'School name must be at least 2 characters',
            'string.max': 'School name cannot exceed 200 characters',
        }),

    completionDate: Joi.object({
        month: Joi.number()
            .integer()
            .min(1)
            .max(12)
            .required()
            .messages({
                'number.min': 'Month must be between 1 and 12',
                'number.max': 'Month must be between 1 and 12',
            }),
        year: Joi.number()
            .integer()
            .min(1900)
            .max(new Date().getFullYear() + 10)
            .required()
            .messages({
                'number.min': 'Year must be after 1900',
                'number.max': 'Year cannot be more than 10 years in future',
            }),
    }).optional(),

    description: Joi.string()
        .max(500)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Description cannot exceed 500 characters',
        }),

    skillsLearned: Joi.array()
        .items(
            Joi.string()
                .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
                .messages({
                    'string.pattern.base': 'Invalid skill ID format',
                })
        )
        .optional()
        .messages({
            'array.base': 'Skills learned must be an array',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

/**
 * Reorder Courses Validation Schema
 */
const reorderCoursesSchema = Joi.object({
    courseIds: Joi.array()
        .items(
            Joi.string()
                .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
                .messages({
                    'string.pattern.base': 'Invalid course ID format',
                })
        )
        .min(1)
        .required()
        .messages({
            'array.min': 'At least one course ID is required',
            'any.required': 'Course IDs array is required',
        }),
});

/**
 * Validation middleware wrapper
 */
const validateCreateCourse = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createCourseSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Course validation failed', {
            errors,
            userId: (req as any).user?.userId,
            ipAddress: req.ip,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateUpdateCourse = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateCourseSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Course update validation failed', {
            errors,
            userId: (req as any).user?.userId,
            courseId: req.params.courseId,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const validateReorderCourses = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = reorderCoursesSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Reorder courses validation failed', {
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
 * @route   POST /api/v1/courses/create-course
 * @desc    Create new course
 * @access  Private
 */
router.post(
    '/create-course',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreateCourse,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 CREATE COURSE ROUTE HIT');
            await CourseController.createCourse(req as any, res);
            console.log('✅ CREATE COURSE ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ CREATE COURSE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/courses/upload-certificate/:courseId
 * @desc    Upload course certificate (image or PDF)
 * @access  Private
 */
router.post(
    '/upload-certificate/:courseId',
    AuthMiddleware.authenticate as any,
    uploadSingle('certificate'),
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPLOAD CERTIFICATE ROUTE HIT');
            await CourseController.uploadCertificate(req as any, res);
            console.log('✅ UPLOAD CERTIFICATE ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ UPLOAD CERTIFICATE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/courses/upload-logo/:courseId
 * @desc    Upload course provider logo
 * @access  Private
 */
router.post(
    '/upload-logo/:courseId',
    AuthMiddleware.authenticate as any,
    uploadSingle('logo'),
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPLOAD PROVIDER LOGO ROUTE HIT');
            await CourseController.uploadProviderLogo(req as any, res);
            console.log('✅ UPLOAD PROVIDER LOGO ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ UPLOAD PROVIDER LOGO ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/courses/get-all-courses
 * @desc    Get all courses for authenticated user
 * @access  Private
 * @query   includeArchived=true (optional)
 */
router.get(
    '/get-all-courses',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ALL COURSES ROUTE HIT');
            await CourseController.getAllCourses(req as any, res);
            console.log('✅ GET ALL COURSES ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET ALL COURSES ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/courses/get-course-id/:courseId
 * @desc    Get course by ID
 * @access  Private
 */
router.get(
    '/get-course-id/:courseId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET COURSE BY ID ROUTE HIT');
            await CourseController.getCourseById(req as any, res);
            console.log('✅ GET COURSE BY ID ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET COURSE BY ID ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/courses/update-course/:courseId
 * @desc    Update course
 * @access  Private
 */
router.put(
    '/update-course/:courseId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdateCourse,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPDATE COURSE ROUTE HIT');
            await CourseController.updateCourse(req as any, res);
            console.log('✅ UPDATE COURSE ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ UPDATE COURSE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/courses/delete-course/:courseId
 * @desc    Delete course (soft delete or permanent)
 * @access  Private
 * @query   permanent=true (optional)
 */
router.delete(
    '/delete-course/:courseId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 DELETE COURSE ROUTE HIT');
            await CourseController.deleteCourse(req as any, res);
            console.log('✅ DELETE COURSE ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ DELETE COURSE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/courses/archive-course/:courseId
 * @desc    Archive course
 * @access  Private
 */
router.post(
    '/archive-course/:courseId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 ARCHIVE COURSE ROUTE HIT');
            await CourseController.archiveCourse(req as any, res);
            console.log('✅ ARCHIVE COURSE ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ ARCHIVE COURSE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/courses/restore-course/:courseId
 * @desc    Restore archived/deleted course
 * @access  Private
 */
router.post(
    '/restore-course/:courseId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 RESTORE COURSE ROUTE HIT');
            await CourseController.restoreCourse(req as any, res);
            console.log('✅ RESTORE COURSE ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ RESTORE COURSE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/courses/reorder-courses
 * @desc    Reorder courses
 * @access  Private
 */
router.post(
    '/reorder-courses',
    AuthMiddleware.authenticate as any,
    validateReorderCourses,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 REORDER COURSES ROUTE HIT');
            await CourseController.reorderCourses(req as any, res);
            console.log('✅ REORDER COURSES ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ REORDER COURSES ROUTE ERROR:', error);
            next(error);
        }
    }
);

export default router;