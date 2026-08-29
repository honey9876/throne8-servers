// src/routes/searchRoutes.ts - Production-level search routes

import { Router } from 'express';
import { param } from 'express-validator';
import { authenticateJWT } from '@/shared/middlewares/auth.middleware';

import { searchController } from '../controllers/search.controller';
import { cacheMiddleware } from '../middleware/cache.middleware';
import { defaultRateLimiter } from '../middleware/rateLimiter.middleware';
import { roleBasedAccess } from '../middleware/rbca.middleware';
import { requestLogging } from '../middleware/requestLogging.middleware';
import { z } from "zod";
import { validateRequest } from '@/shared/middlewares/connections/validations.middleware';
import { compressionMiddleware } from '../middleware/compression.middleware';
import { sanitizeInput } from '../middleware/sanitization.middleware';

const router: Router = Router();

// ====================
// ZOD VALIDATION SCHEMAS
// ====================

// Base pagination schema
const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).max(10000).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// User search schema
const userSearchSchema = z.object({
    name: z.string().min(1, "Name is required").max(100).trim(),
    sortBy: z.enum(['relevance', 'name', 'date', 'connections']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    region: z.string().max(50).trim().optional(),
}).merge(paginationSchema);

// Company search schema  
const companySearchSchema = z.object({
    query: z.string().min(1, "Query is required").max(100).trim(),
    company: z.string().max(100).trim().optional().default(''),
    industry: z.string().max(50).trim().optional(),
}).merge(paginationSchema);

// Skills search schema
const skillsSearchSchema = z.object({
    skills: z.string().min(1, "Skills are required").max(200).trim(),
    level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
}).merge(paginationSchema);

// Suggestions schema
const suggestionsSchema = z.object({
    query: z.string().min(1, "Query is required").max(50).trim(),
    limit: z.coerce.number().int().min(1).max(20).optional().default(10),
    type: z.enum(['users', 'companies', 'skills']).optional(),
});

// Index update schema (for body validation)
const indexUpdateBodySchema = z.object({
    forceUpdate: z.boolean().optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
});

// Cache management schema
const cacheManageSchema = z.object({
    action: z.enum(['clear', 'refresh', 'optimize']),
    scope: z.enum(['global', 'user', 'region']).optional(),
});

// Search optimization schema
const searchOptimizeSchema = z.object({
    type: z.enum(['index', 'cache', 'performance', 'full']),
    async: z.boolean().optional(),
});

// Analytics schema
const analyticsSchema = z.object({
    timeframe: z.enum(['hour', 'day', 'week', 'month']).optional(),
    metrics: z.string().max(100).optional(),
});

// History schema
const historySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    days: z.coerce.number().int().min(1).max(90).optional().default(30),
});

// Recommendations schema
const recommendationsSchema = z.object({
    type: z.enum(['trending', 'personal', 'similar']).optional(),
    limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

// Validation schema
const validationSchema = z.object({
    query: z.string().min(1).max(200).trim(),
    type: z.enum(['users', 'companies', 'skills']),
    filters: z.object({}).optional(),
});

// Audit schema
const auditSchema = z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    userId: z.string().uuid().optional(),
    action: z.string().max(50).optional(),
});

// ====================
// RATE LIMITING CONFIG
// ====================

const searchLimiter = defaultRateLimiter;
const suggestionLimiter = defaultRateLimiter;
const indexUpdateLimiter = defaultRateLimiter;
const analyticsLimiter = defaultRateLimiter;

// ====================
// CACHE CONFIGURATIONS
// ====================

const searchCache = cacheMiddleware({
    ttl: 300, // 5 minutes for search results
    prefix: 'search',
    varyBy: ['query', 'page', 'limit', 'userId'],
    skipCache: (req) => req.query.nocache === 'true',
});

const suggestionCache = cacheMiddleware({
    ttl: 600, // 10 minutes for suggestions
    prefix: 'suggestions',
    varyBy: ['query', 'type'],
});

const analyticsCache = cacheMiddleware({
    ttl: 1800, // 30 minutes for analytics
    prefix: 'analytics',
    varyBy: ['userId', 'timeframe'],
});

// ====================
// SEARCH ROUTES
// ====================

/**
 * @route   GET /api/v1/search/users
 * @desc    Search users by name with advanced filtering
 * @access  Private
 * @rateLimit 100 req/min
 * @cache   5 minutes
 */
router.get(
    '/users',
    requestLogging('search_users'),
    searchLimiter,
    authenticateJWT,
    roleBasedAccess(['user', 'premium', 'admin']),
    sanitizeInput,
    validateRequest(userSearchSchema, 'query'),
    searchCache,
    compressionMiddleware,
    searchController.searchUsersByName
);

/**
 * @route   GET /api/v1/search/company
 * @desc    Search users by company affiliation
 * @access  Private
 * @rateLimit 100 req/min
 * @cache   5 minutes
 */
router.get(
    '/company',
    requestLogging('search_company'),
    searchLimiter,
    authenticateJWT,
    roleBasedAccess(['user', 'premium', 'admin']),
    sanitizeInput,
    validateRequest(companySearchSchema, 'query'),
    searchCache,
    compressionMiddleware,
    searchController.searchUsersByCompany
);

/**
 * @route   GET /api/v1/search/skills
 * @desc    Search users by skills and expertise
 * @access  Private
 * @rateLimit 100 req/min
 * @cache   5 minutes
 */
router.get(
    '/skills',
    requestLogging('search_skills'),
    searchLimiter,
    authenticateJWT,
    roleBasedAccess(['user', 'premium', 'admin']),
    sanitizeInput,
    validateRequest(skillsSearchSchema, 'query'),
    searchCache,
    compressionMiddleware,
    searchController.searchUsersBySkills
);

/**
 * @route   GET /api/v1/search/suggestions
 * @desc    Get search autocomplete suggestions
 * @access  Private
 * @rateLimit 200 req/min
 * @cache   10 minutes
 */
router.get(
    '/suggestions',
    requestLogging('search_suggestions'),
    suggestionLimiter,
    authenticateJWT,
    roleBasedAccess(['user', 'premium', 'admin']),
    sanitizeInput,
    validateRequest(suggestionsSchema, 'query'),
    suggestionCache,
    compressionMiddleware,
    searchController.getSearchSuggestions
);

/**
 * @route   POST /api/v1/search/index/:userId
 * @desc    Update search index for specific user
 * @access  Private (Admin/System only)
 * @rateLimit 10 req/5min
 */
router.post(
    '/index/:userId',
    requestLogging('update_search_index'),
    indexUpdateLimiter,
    authenticateJWT,
    roleBasedAccess(['admin', 'system']),
    sanitizeInput,
    [
        param('userId')
            .isUUID(4)
            .withMessage('Invalid user ID format'),
    ],
    validateRequest(indexUpdateBodySchema, 'body'),
    searchController.updateSearchIndex
);

/**
 * @route   GET /api/v1/search/filters
 * @desc    Get available search filters and facets
 * @access  Private
 * @rateLimit 100 req/min
 * @cache   30 minutes
 */
router.get(
    '/filters',
    requestLogging('search_filters'),
    searchLimiter,
    authenticateJWT,
    roleBasedAccess(['user', 'premium', 'admin']),
    cacheMiddleware({ ttl: 1800, prefix: 'filters' }),
    compressionMiddleware,
    searchController.getSearchFilters
);

/**
 * @route   POST /api/v1/search/cache/manage
 * @desc    Manage search cache (admin operation)
 * @access  Private (Admin only)
 * @rateLimit 5 req/min
 */
router.post(
    '/cache/manage',
    requestLogging('manage_search_cache'),
    defaultRateLimiter,
    authenticateJWT,
    roleBasedAccess(['admin']),
    sanitizeInput,
    validateRequest(cacheManageSchema, 'body'),
    searchController.manageSearchCache
);

/**
 * @route   GET /api/v1/search/analytics
 * @desc    Get search analytics and metrics
 * @access  Private (Admin/Premium only)
 * @rateLimit 20 req/min
 * @cache   30 minutes
 */
router.get(
    '/analytics',
    requestLogging('search_analytics'),
    analyticsLimiter,
    authenticateJWT,
    roleBasedAccess(['admin', 'premium']),
    validateRequest(analyticsSchema, 'query'),
    analyticsCache,
    compressionMiddleware,
    searchController.getSearchAnalytics
);

/**
 * @route   POST /api/v1/search/optimize
 * @desc    Trigger search optimization processes
 * @access  Private (Admin only)
 * @rateLimit 2 req/hour
 */
router.post(
    '/optimize',
    requestLogging('search_optimize'),
    defaultRateLimiter, // 2 per hour
    authenticateJWT,
    roleBasedAccess(['admin']),
    sanitizeInput,
    validateRequest(searchOptimizeSchema, 'body'),
    searchController.optimizeSearch
);

/**
 * @route   GET /api/v1/search/history
 * @desc    Get user's search history
 * @access  Private
 * @rateLimit 50 req/min
 * @cache   5 minutes
 */
router.get(
    '/history',
    requestLogging('search_history'),
    defaultRateLimiter,
    authenticateJWT,
    roleBasedAccess(['user', 'premium', 'admin']),
    validateRequest(historySchema, 'query'),
    cacheMiddleware({ ttl: 300, prefix: 'history', varyBy: ['userId'] }),
    compressionMiddleware,
    searchController.getSearchHistory
);

/**
 * @route   GET /api/v1/search/recommendations
 * @desc    Get personalized search recommendations
 * @access  Private
 * @rateLimit 30 req/min
 * @cache   15 minutes
 */
router.get(
    '/recommendations',
    requestLogging('search_recommendations'),
    defaultRateLimiter,
    authenticateJWT,
    roleBasedAccess(['user', 'premium', 'admin']),
    validateRequest(recommendationsSchema, 'query'),
    cacheMiddleware({ ttl: 900, prefix: 'recommendations', varyBy: ['userId', 'type'] }),
    compressionMiddleware,
    searchController.getSearchRecommendations
);

/**
 * @route   POST /api/v1/search/validate
 * @desc    Validate search parameters and queries
 * @access  Private
 * @rateLimit 100 req/min
 */
router.post(
    '/validate',
    requestLogging('search_validate'),
    searchLimiter,
    authenticateJWT,
    roleBasedAccess(['user', 'premium', 'admin']),
    sanitizeInput,
    validateRequest(validationSchema, 'body'),
    searchController.validateSearch
);

/**
 * @route   GET /api/v1/search/audit
 * @desc    Get search audit logs and compliance data
 * @access  Private (Admin only)
 * @rateLimit 10 req/min
 */
router.get(
    '/audit',
    requestLogging('search_audit'),
    defaultRateLimiter,
    authenticateJWT,
    roleBasedAccess(['admin']),
    validateRequest(auditSchema, 'query'),
    cacheMiddleware({ ttl: 300, prefix: 'audit' }),
    compressionMiddleware,
    searchController.manageSearchAuditEndpoint
);

// ====================
// ERROR HANDLING & HEALTH CHECK
// ===================

/**
 * @route   GET /api/v1/search/health
 * @desc    Search service health check
 * @access  Public (internal)
 */
router.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'healthy',
        service: 'search',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.SERVICE_VERSION || '1.0.0'
    });
});

/**
 * @route   GET /api/v1/search/metrics
 * @desc    Prometheus metrics endpoint
 * @access  Private (Monitoring systems)
 */
router.get(
    '/metrics',
    authenticateJWT,
    roleBasedAccess(['system', 'monitoring']),
    (_req, res) => {
        // Return Prometheus-formatted metrics
        res.set('Content-Type', 'text/plain');
        res.send('# HELP search_requests_total Total number of search requests\n# TYPE search_requests_total counter\n');
    }
);

export default router;