/**
 * Analytics Validation - Request Validation for Analytics Routes
 * 
 * @module validations/analytics.validation
 * @version 1.0.0
 */

import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== VALIDATION SCHEMAS ====================

/**
 * Toggle Privacy Validation Schema
 */
const togglePrivacySchema = Joi.object({
    isPrivate: Joi.boolean()
        .required()
        .messages({
            'boolean.base': 'isPrivate must be a boolean',
            'any.required': 'isPrivate is required',
        }),
});

/**
 * Date Range Validation Schema
 */
const dateRangeSchema = Joi.object({
    startDate: Joi.date()
        .iso()
        .required()
        .messages({
            'date.base': 'startDate must be a valid date',
            'date.format': 'startDate must be in ISO format (YYYY-MM-DD)',
            'any.required': 'startDate is required',
        }),
    endDate: Joi.date()
        .iso()
        .min(Joi.ref('startDate'))
        .required()
        .messages({
            'date.base': 'endDate must be a valid date',
            'date.format': 'endDate must be in ISO format (YYYY-MM-DD)',
            'date.min': 'endDate must be after startDate',
            'any.required': 'endDate is required',
        }),
}).unknown(true); // Allow other query params

/**
 * Export Format Validation Schema
 */
const exportFormatSchema = Joi.object({
    format: Joi.string()
        .valid('csv', 'excel')
        .optional()
        .default('csv')
        .messages({
            'any.only': 'format must be either csv or excel',
        }),
}).unknown(true);

/**
 * Pagination Validation Schema
 */
const paginationSchema = Joi.object({
    page: Joi.number()
        .integer()
        .min(1)
        .optional()
        .default(1)
        .messages({
            'number.base': 'page must be a number',
            'number.integer': 'page must be an integer',
            'number.min': 'page must be at least 1',
        }),
    limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .messages({
            'number.base': 'limit must be a number',
            'number.integer': 'limit must be an integer',
            'number.min': 'limit must be at least 1',
            'number.max': 'limit cannot exceed 100',
        }),
    isPremium: Joi.boolean()
        .optional()
        .default(false)
        .messages({
            'boolean.base': 'isPremium must be a boolean',
        }),
}).unknown(true);

/**
 * Timeframe Days Validation Schema
 */
const timeframeDaysSchema = Joi.object({
    days: Joi.number()
        .integer()
        .min(1)
        .max(365)
        .optional()
        .default(7)
        .messages({
            'number.base': 'days must be a number',
            'number.integer': 'days must be an integer',
            'number.min': 'days must be at least 1',
            'number.max': 'days cannot exceed 365',
        }),
}).unknown(true);

// ==================== VALIDATION MIDDLEWARE ====================

/**
 * Validate Toggle Privacy
 */
export const validateTogglePrivacy = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = togglePrivacySchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Toggle privacy validation failed', {
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
 * Validate Date Range
 */
export const validateDateRange = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = dateRangeSchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: false,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Date range validation failed', {
            errors,
            userId: (req as any).user?.userId,
            ipAddress: req.ip,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    Object.assign(req.query, value);
    next();
};

/**
 * Validate Export Format
 */
export const validateExportFormat = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = exportFormatSchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: false,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Export format validation failed', {
            errors,
            userId: (req as any).user?.userId,
            ipAddress: req.ip,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    Object.assign(req.query, value);
    next();
};

/**
 * Validate Pagination
 */
export const validatePagination = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = paginationSchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: false,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Pagination validation failed', {
            errors,
            userId: (req as any).user?.userId,
            ipAddress: req.ip,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    Object.assign(req.query, value);
    next();
};

/**
 * Validate Timeframe Days
 */
export const validateTimeframeDays = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = timeframeDaysSchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: false,
        convert: true,
    });

    if (error) {
        const errors = error.details.map(detail => detail.message);

        LoggerUtil.warn('Timeframe days validation failed', {
            errors,
            userId: (req as any).user?.userId,
            ipAddress: req.ip,
        });

        return ResponseUtil.validationError(res, errors, 'Validation failed');
    }

    Object.assign(req.query, value);
    next();
};