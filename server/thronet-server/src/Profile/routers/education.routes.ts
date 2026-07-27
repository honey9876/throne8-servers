/**
 * Education Routes - API Endpoints for Educational Background
 * 
 * @module routes/education.routes
 * @version 1.0.0
 */

import Joi from 'joi';
import express, { Request, Response, NextFunction } from 'express';
import { EducationController } from '@/shared/controllers/index.controllers';
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

const createEducationSchema = Joi.object({
    schoolCollegeName: Joi.string()
        .min(2)
        .max(200)
        .pattern(/^[A-Z0-9][a-zA-Z0-9\s\-'.&(),]+$/)
        .trim()
        .required()
        .messages({
            'string.min': 'School/College name must be at least 2 characters',
            'string.max': 'School/College name cannot exceed 200 characters',
            'string.pattern.base': 'School/College name must start with a capital letter or number',
            'string.empty': 'School/College name cannot be empty',
            'any.required': 'School/College name is required',
        }),

    degreeType: Joi.string()
        .valid('High School', 'Diploma', "Bachelor's", "Master's", 'Doctorate', 'Certificate', 'Other')
        .required()
        .messages({
            'any.only': 'Degree type must be one of: High School, Diploma, Bachelor\'s, Master\'s, Doctorate, Certificate, Other',
            'any.required': 'Degree type is required',
        }),

    degree: Joi.string()
        .min(2)
        .max(100)
        .pattern(/^[A-Z0-9][a-zA-Z0-9\s\-.()]+$/)
        .trim()
        .required()
        .messages({
            'string.min': 'Degree must be at least 2 characters',
            'string.max': 'Degree cannot exceed 100 characters',
            'string.pattern.base': 'Degree must start with a capital letter or number',
            'string.empty': 'Degree cannot be empty',
            'any.required': 'Degree is required',
        }),

    startDate: Joi.date()
        .iso()
        .required()
        .messages({
            'date.base': 'Start date must be a valid date',
            'date.format': 'Start date must be in YYYY-MM-DD format',
            'any.required': 'Start date is required',
        }),

    specialization: Joi.string()
        .min(2)
        .max(150)
        .pattern(/^[A-Z][a-zA-Z\s\-&(),]+$/)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.min': 'Specialization must be at least 2 characters',
            'string.max': 'Specialization cannot exceed 150 characters',
            'string.pattern.base': 'Specialization must start with a capital letter',
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
        .max(5000)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.min': 'Description must be at least 10 characters',
            'string.max': 'Description cannot exceed 5000 characters',
        }),

    educationType: Joi.string()
        .valid('full-time', 'part-time', 'distance', 'online')
        .lowercase()
        .optional()
        .messages({
            'any.only': 'Education type must be one of: full-time, part-time, distance, online',
        }),

    gradeType: Joi.string()
        .valid('percentage', 'cgpa', 'gpa', 'grade')
        .lowercase()
        .optional()
        .messages({
            'any.only': 'Grade type must be one of: percentage, cgpa, gpa, grade',
        }),

    gradeValue: Joi.string()
        .max(20)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Grade value cannot exceed 20 characters',
        }),

    location: Joi.string()
        .max(100)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Location cannot exceed 100 characters',
        }),

}).custom((value, helpers) => {
    if (value.gradeValue && !value.gradeType) {
        return helpers.error('any.invalid', {
            message: 'Grade type is required when grade value is provided',
        });
    }

    if (value.gradeType && value.gradeValue) {
        const gradeValue = value.gradeValue.trim();

        if (value.gradeType === 'percentage') {
            const num = parseFloat(gradeValue);
            if (isNaN(num) || num < 0 || num > 100) {
                return helpers.error('any.invalid', {
                    message: 'Percentage must be between 0 and 100',
                });
            }
        } else if (value.gradeType === 'cgpa') {
            const num = parseFloat(gradeValue);
            if (isNaN(num) || num < 0 || num > 10) {
                return helpers.error('any.invalid', {
                    message: 'CGPA must be between 0.00 and 10.00',
                });
            }
        } else if (value.gradeType === 'gpa') {
            const num = parseFloat(gradeValue);
            if (isNaN(num) || num < 0 || num > 4) {
                return helpers.error('any.invalid', {
                    message: 'GPA must be between 0.00 and 4.00',
                });
            }
        }
    }

    return value;
});

const validateCreateEducation = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = createEducationSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Education validation failed', {
            errors,
            userId: (req as any).user?.userId,
            ipAddress: req.ip,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

const updateEducationSchema = Joi.object({
    schoolCollegeName: Joi.string()
        .min(2)
        .max(200)
        .pattern(/^[A-Z0-9][a-zA-Z0-9\s\-'.&(),]+$/)
        .trim()
        .optional()
        .messages({
            'string.min': 'School/College name must be at least 2 characters',
            'string.max': 'School/College name cannot exceed 200 characters',
            'string.pattern.base': 'School/College name must start with a capital letter or number',
        }),

    degreeType: Joi.string()
        .valid('High School', 'Diploma', "Bachelor's", "Master's", 'Doctorate', 'Certificate', 'Other')
        .optional()
        .messages({
            'any.only': 'Degree type must be one of: High School, Diploma, Bachelor\'s, Master\'s, Doctorate, Certificate, Other',
        }),

    degree: Joi.string()
        .min(2)
        .max(100)
        .pattern(/^[A-Z0-9][a-zA-Z0-9\s\-.()]+$/)
        .trim()
        .optional()
        .messages({
            'string.min': 'Degree must be at least 2 characters',
            'string.max': 'Degree cannot exceed 100 characters',
            'string.pattern.base': 'Degree must start with a capital letter or number',
        }),

    specialization: Joi.string()
        .min(2)
        .max(150)
        .pattern(/^[A-Z][a-zA-Z\s\-&(),]+$/)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.min': 'Specialization must be at least 2 characters',
            'string.max': 'Specialization cannot exceed 150 characters',
            'string.pattern.base': 'Specialization must start with a capital letter',
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
        .max(5000)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.min': 'Description must be at least 10 characters',
            'string.max': 'Description cannot exceed 5000 characters',
        }),

    educationType: Joi.string()
        .valid('full-time', 'part-time', 'distance', 'online')
        .lowercase()
        .optional()
        .messages({
            'any.only': 'Education type must be one of: full-time, part-time, distance, online',
        }),

    gradeType: Joi.string()
        .valid('percentage', 'cgpa', 'gpa', 'grade')
        .lowercase()
        .optional()
        .messages({
            'any.only': 'Grade type must be one of: percentage, cgpa, gpa, grade',
        }),

    gradeValue: Joi.string()
        .max(20)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Grade value cannot exceed 20 characters',
        }),

    location: Joi.string()
        .max(100)
        .trim()
        .optional()
        .allow('')
        .messages({
            'string.max': 'Location cannot exceed 100 characters',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

const validateUpdateEducation = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = updateEducationSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Education update validation failed', {
            errors,
            userId: (req as any).user?.userId,
            educationId: req.params.educationId,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    req.body = value;
    next();
};

// ==================== ROUTES ====================

/**
 * @route   POST /api/v1/education
 * @desc    Create new education record
 * @access  Private (requires JWT)
 */
router.post(
    '/create-education',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateCreateEducation,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 CREATE EDUCATION ROUTE HIT');
            console.log('📦 Request Body:', JSON.stringify(req.body, null, 2));
            console.log('👤 User:', (req as any).user);

            await EducationController.createEducation(req as any, res);

            console.log('✅ CREATE EDUCATION ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ CREATE EDUCATION ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/education/getEducation-id/:educationId
 * @desc    Get education record by ID
 * @access  Private
 */
router.get(
    '/getEducation-id/:educationId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET EDUCATION BY ID ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Education ID:', req.params.educationId);

            await EducationController.getEducationById(req as any, res);

            console.log('✅ GET EDUCATION BY ID ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET EDUCATION BY ID ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/education/get-all-education
 * @desc    Get all education records for authenticated user
 * @access  Private
 * @query   includeArchived=true (optional)
 */
router.get(
    '/get-all-education',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ALL EDUCATION ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await EducationController.getAllEducation(req as any, res);

            console.log('✅ GET ALL EDUCATION ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET ALL EDUCATION ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/education/get-all-education/:userId
 * @desc    Get all education for a specific user (public profile view)
 * @access  Public
 */
router.get(
    '/get-all-education/:userId',
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ALL EDUCATION BY USERID ROUTE HIT');
            await EducationController.getAllEducationByUserId(req as any, res);
            console.log('✅ GET ALL EDUCATION BY USERID ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET ALL EDUCATION BY USERID ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/education/:educationId
 * @desc    Update education record
 * @access  Private
 */
router.put(
    '/update-education/:educationId',
    AuthMiddleware.authenticate as any,
    sanitizeInput,
    validateUpdateEducation,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPDATE EDUCATION ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Education ID:', req.params.educationId);
            console.log('📦 Updates:', req.body);

            await EducationController.updateEducation(req as any, res);

            console.log('✅ UPDATE EDUCATION ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ UPDATE EDUCATION ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/education/:educationId
 * @desc    Delete education record (soft delete)
 * @access  Private
 */
router.delete(
    '/delete-education/:educationId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 DELETE EDUCATION ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Education ID:', req.params.educationId);

            await EducationController.deleteEducation(req as any, res);

            console.log('✅ DELETE EDUCATION ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ DELETE EDUCATION ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/education/:educationId/archive
 * @desc    Archive education record
 * @access  Private
 */
router.post(
    '/archive-education/:educationId/archive',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 ARCHIVE EDUCATION ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Education ID:', req.params.educationId);

            await EducationController.archiveEducation(req as any, res);

            console.log('✅ ARCHIVE EDUCATION ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ ARCHIVE EDUCATION ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/education/:educationId/restore
 * @desc    Restore archived education record
 * @access  Private
 */
router.post(
    '/restore-education/:educationId/restore',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 RESTORE EDUCATION ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Education ID:', req.params.educationId);

            await EducationController.restoreEducation(req as any, res);

            console.log('✅ RESTORE EDUCATION ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ RESTORE EDUCATION ROUTE ERROR:', error);
            next(error);
        }
    }
);

export default router;