// src/connections/validators/searchValidator.ts  
// src/connections/validators/searchValidator.ts
/**
 * Search Validators
 * express-validator based validation chains for all search-related routes.
 * Pairs with `search.routes.ts` and `search.controller.ts`.
 *
 * Usage in routes:
 *   router.get('/users', searchUsersValidator, handleValidationErrors, searchController.searchUsersByName);
 *
 * @module connections/validators/searchValidator
 */

import { Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult, ValidationChain } from 'express-validator';
import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';

// ==================== SHARED HELPERS ====================

/**
 * Common pagination validators — reused across most search endpoints.
 */
const paginationValidators: ValidationChain[] = [
    query('page')
        .optional()
        .isInt({ min: 1, max: 10000 })
        .withMessage('page must be an integer between 1 and 10000')
        .toInt(),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('limit must be an integer between 1 and 100')
        .toInt(),
];

/**
 * Run this AFTER any validator chain to collect + respond with errors.
 * Add this as the middleware right after the `*Validator` array in routes.
 */
export function handleValidationErrors(req: Request, res: Response, next: NextFunction): void | Response {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const formatted = errors.array().map((err: any) => ({
            field: err.path || err.param,
            message: err.msg,
        }));

        logger.warn('Search validation failed', {
            path: req.path,
            method: req.method,
            errors: formatted,
        });

        return ResponseUtil.badRequest(
            res,
            'Validation failed',
            formatted.map((error) => `${error.field}: ${error.message}`),
        );
    }

    next();
}

// ==================== INDIVIDUAL VALIDATORS ====================

/**
 * GET /search/users
 */
export const searchUsersValidator: ValidationChain[] = [
    query('name')
        .exists({ checkFalsy: true })
        .withMessage('name is required')
        .isString()
        .isLength({ min: 1, max: 100 })
        .withMessage('name must be between 1 and 100 characters')
        .trim(),
    query('sortBy')
        .optional()
        .isIn(['relevance', 'name', 'date', 'connections'])
        .withMessage('sortBy must be one of: relevance, name, date, connections'),
    query('sortOrder')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('sortOrder must be asc or desc'),
    query('region')
        .optional()
        .isString()
        .isLength({ max: 50 })
        .trim(),
    ...paginationValidators,
];

/**
 * GET /search/company
 */
export const searchCompanyValidator: ValidationChain[] = [
    query('query')
        .exists({ checkFalsy: true })
        .withMessage('query is required')
        .isString()
        .isLength({ min: 1, max: 100 })
        .withMessage('query must be between 1 and 100 characters')
        .trim(),
    query('company')
        .optional()
        .isString()
        .isLength({ max: 100 })
        .trim(),
    query('industry')
        .optional()
        .isString()
        .isLength({ max: 50 })
        .trim(),
    ...paginationValidators,
];

/**
 * GET /search/skills
 */
export const searchSkillsValidator: ValidationChain[] = [
    query('skills')
        .exists({ checkFalsy: true })
        .withMessage('skills is required')
        .isString()
        .isLength({ min: 1, max: 200 })
        .withMessage('skills must be between 1 and 200 characters')
        .trim(),
    query('level')
        .optional()
        .isIn(['beginner', 'intermediate', 'advanced', 'expert'])
        .withMessage('level must be one of: beginner, intermediate, advanced, expert'),
    ...paginationValidators,
];

/**
 * GET /search/suggestions
 */
export const searchSuggestionsValidator: ValidationChain[] = [
    query('query')
        .exists({ checkFalsy: true })
        .withMessage('query is required')
        .isString()
        .isLength({ min: 1, max: 50 })
        .withMessage('query must be between 1 and 50 characters')
        .trim(),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 20 })
        .withMessage('limit must be between 1 and 20')
        .toInt(),
    query('type')
        .optional()
        .isIn(['users', 'companies', 'skills'])
        .withMessage('type must be one of: users, companies, skills'),
];

/**
 * POST /search/index/:userId
 */
export const updateSearchIndexValidator: ValidationChain[] = [
    param('userId')
        .exists()
        .withMessage('userId is required')
        .isUUID(4)
        .withMessage('userId must be a valid UUID v4'),
    body('forceUpdate')
        .optional()
        .isBoolean()
        .withMessage('forceUpdate must be a boolean'),
    body('priority')
        .optional()
        .isIn(['low', 'normal', 'high'])
        .withMessage('priority must be one of: low, normal, high'),
];

/**
 * POST /search/cache/manage
 */
export const manageCacheValidator: ValidationChain[] = [
    body('action')
        .exists()
        .withMessage('action is required')
        .isIn(['clear', 'refresh', 'optimize'])
        .withMessage('action must be one of: clear, refresh, optimize'),
    body('scope')
        .optional()
        .isIn(['global', 'user', 'region'])
        .withMessage('scope must be one of: global, user, region'),
];

/**
 * GET /search/analytics
 */
export const searchAnalyticsValidator: ValidationChain[] = [
    query('timeframe')
        .optional()
        .isIn(['hour', 'day', 'week', 'month'])
        .withMessage('timeframe must be one of: hour, day, week, month'),
    query('metrics')
        .optional()
        .isString()
        .isLength({ max: 100 })
        .trim(),
];

/**
 * POST /search/optimize
 */
export const searchOptimizeValidator: ValidationChain[] = [
    body('type')
        .exists()
        .withMessage('type is required')
        .isIn(['index', 'cache', 'performance', 'full'])
        .withMessage('type must be one of: index, cache, performance, full'),
    body('async')
        .optional()
        .isBoolean()
        .withMessage('async must be a boolean'),
];

/**
 * GET /search/history
 */
export const searchHistoryValidator: ValidationChain[] = [
    query('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('limit must be between 1 and 50')
        .toInt(),
    query('days')
        .optional()
        .isInt({ min: 1, max: 90 })
        .withMessage('days must be between 1 and 90')
        .toInt(),
];

/**
 * GET /search/recommendations
 */
export const searchRecommendationsValidator: ValidationChain[] = [
    query('type')
        .optional()
        .isIn(['trending', 'personal', 'similar'])
        .withMessage('type must be one of: trending, personal, similar'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 20 })
        .withMessage('limit must be between 1 and 20')
        .toInt(),
];

/**
 * POST /search/validate
 */
export const validateSearchValidator: ValidationChain[] = [
    body('query')
        .exists({ checkFalsy: true })
        .withMessage('query is required')
        .isString()
        .isLength({ min: 1, max: 200 })
        .withMessage('query must be between 1 and 200 characters')
        .trim(),
    body('type')
        .exists()
        .withMessage('type is required')
        .isIn(['users', 'companies', 'skills'])
        .withMessage('type must be one of: users, companies, skills'),
    body('filters')
        .optional()
        .isObject()
        .withMessage('filters must be an object'),
];

/**
 * GET /search/audit
 */
export const searchAuditValidator: ValidationChain[] = [
    query('startDate')
        .optional()
        .isISO8601()
        .withMessage('startDate must be a valid ISO 8601 date'),
    query('endDate')
        .optional()
        .isISO8601()
        .withMessage('endDate must be a valid ISO 8601 date'),
    query('userId')
        .optional()
        .isUUID()
        .withMessage('userId must be a valid UUID'),
    query('action')
        .optional()
        .isString()
        .isLength({ max: 50 })
        .trim(),
];

// ==================== DEFAULT EXPORT (namespaced access) ====================

export default {
    searchUsersValidator,
    searchCompanyValidator,
    searchSkillsValidator,
    searchSuggestionsValidator,
    updateSearchIndexValidator,
    manageCacheValidator,
    searchAnalyticsValidator,
    searchOptimizeValidator,
    searchHistoryValidator,
    searchRecommendationsValidator,
    validateSearchValidator,
    searchAuditValidator,
    handleValidationErrors,
};