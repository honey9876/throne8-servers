import { Router, Request, Response } from 'express';
import { ProfileViewController, healthCheck, batchProfileViewOperations } from '../controllers/index';
import { rateLimiterMiddleware } from '../middleware/rateLimiter.middleware';
import { loggerMiddleware } from '../middleware/logger.middleware';
import { securityMiddleware } from '../middleware/security.middleware';
import { metricsMiddleware } from '../middleware/metrics.middleware';
import { profileViewValidators } from '../validators/profileViewValidator';
import { z } from 'zod';
import { 
    createProfileViewQuerySchema, 
    createQuerySchema, 
    validateRequest 
} from '@/shared/middlewares/connections/validations.middleware';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router: Router = Router();

// Apply global middleware to all routes
router.use(loggerMiddleware);
router.use(securityMiddleware);
router.use(metricsMiddleware);

// Enhanced RATE_LIMITS configuration with all required properties
const RATE_LIMITS = {
    GLOBAL: {
        windowInSeconds: 60,
        maxRequests: 100,
    },
    AUTH: {
        windowInSeconds: 60,
        maxRequests: 10,
    },
    PASSWORD_RESET: {
        windowInSeconds: 900,
        maxRequests: 5,
    },
    SEARCH: {
        windowInSeconds: 60,
        maxRequests: 30,
    },
    PROFILE_VIEW: {
        windowInSeconds: 60,
        maxRequests: 60,
    },
    API_KEY: {
        windowInSeconds: 60,
        maxRequests: 300,
    },
    // Additional rate limits for profile view specific endpoints
    HEALTH: 50,
    RECORD_VIEW: 30,
    GET_VIEWERS: 20,
    GET_COUNT: 25,
    GET_ANALYTICS: 15,
    SET_PRIVACY: 5,
    DELETE_HISTORY: 3,
    GET_INSIGHTS: 10,
    EXPORT_DATA: 2,
    BATCH_OPS: 5,
} as const;

// ==================== ZOD SCHEMAS ====================
// Define Zod schemas for type-safe validation (recommended for new endpoints)

// Schema for recording profile views - FIXED for MongoDB ObjectIds
const recordProfileViewSchema = z.object({
    viewedUserId: z.string(),
    metadata: z.object({
        source: z.enum(['profile', 'search', 'suggestion', 'connection']).optional(),
        deviceType: z.enum(['mobile', 'desktop', 'tablet']).optional(),
        location: z.string().max(100).optional(),
        referrer: z.string().url().optional()
    }).optional(),
    anonymous: z.boolean().optional().default(false)
});

// Schema for profile view privacy settings
const profileViewPrivacySchema = z.object({
    viewVisibility: z.enum(['public', 'connections', 'private']),
    showViewerDetails: z.boolean().optional().default(true),
    allowAnonymousViews: z.boolean().optional().default(true)
});

// Schema for analytics queries
const analyticsQuerySchema = z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    groupBy: z.enum(['day', 'week', 'month']).optional().default('day'),
    includeMetadata: z.boolean().optional().default(false)
});

// Schema for export data queries
const exportQuerySchema = z.object({
    format: z.enum(['json', 'csv', 'excel']).optional().default('json'),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    includeMetadata: z.boolean().optional().default(false)
});

// Schema for delete history queries - FIXED for MongoDB ObjectIds
// const deleteHistoryQuerySchema = z.object({
//   startDate: z.string().datetime().optional(),
//   endDate: z.string().datetime().optional(),
//   viewerIds: z.array(mongoObjectId).optional(),
//   confirmDelete: z.boolean().refine(val => val === true, {
//     message: "confirmDelete must be true to proceed with deletion"
//   })
// });

const deleteHistoryQuerySchema = z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    viewerIds: z.array(z.string()).optional(),
    confirmDelete: z.string()
        .transform((val) => val === 'true')
        .refine(val => val === true, {
            message: "confirmDelete must be true to proceed with deletion"
        })
});

// Schema for batch operations - FIXED for MongoDB ObjectIds
const batchOperationsSchema = z.object({
    operations: z.array(z.object({
        type: z.enum(['record', 'delete', 'update_privacy']),
        data: z.record(z.string(), z.any()),
        id: z.string().optional()
    })).min(1).max(100), // Limit batch size for performance
    executeInTransaction: z.boolean().optional().default(true)
});

// ==================== ROUTES ====================

/**
 * Health check route (Public, no auth)
 */
router.get(
    '/health',
    rateLimiterMiddleware({ windowMs: 15 * 60 * 1000, max: RATE_LIMITS.HEALTH, storePrefix: 'health_' }),
    healthCheck
);

/**
 * Feature 1: Record profile view
 * POST /record
 * Requires auth, validates body with Zod schema
 */
router.post(
    '/record',
    AuthMiddleware.authenticate as any,
    validateRequest(recordProfileViewSchema, 'body'),
    rateLimiterMiddleware({ windowMs: 60 * 1000, max: RATE_LIMITS.RECORD_VIEW, storePrefix: 'record_view_' }),
    (req: Request, res: Response) => ProfileViewController.recordProfileView(req as any, res)
);

/**
 * Feature 2: Get who viewed profile
 * GET /viewers
 * Requires auth, validates query params
 * OPTION 1: Using Zod schema (recommended)
 * OPTION 2: Using existing ValidationChain (fallback)
 */
router.get(
    '/viewers',
    AuthMiddleware.authenticate as any,
    // Option 1: Use Zod schema for better type safety
    validateRequest(createProfileViewQuerySchema(), 'query'),
    // Option 2: Fallback to existing ValidationChain for backward compatibility
    validateRequest(profileViewValidators.getWhoViewedProfile, 'query'),
    rateLimiterMiddleware({ windowMs: 60 * 1000, max: RATE_LIMITS.GET_VIEWERS, storePrefix: 'get_viewers_' }),
    (req: Request, res: Response) => ProfileViewController.getWhoViewedProfile(req as any, res)
);

/**
 * Feature 3: Get profile view count
 * GET /count
 * Requires auth, validates query with basic schema
 */
router.get(
    '/count',
    AuthMiddleware.authenticate as any,
    validateRequest(createQuerySchema(), 'query'),
    // Alternative: Use existing validator for backward compatibility
    validateRequest(profileViewValidators.getProfileViewCount, 'query'),
    rateLimiterMiddleware({ windowMs: 60 * 1000, max: RATE_LIMITS.GET_COUNT, storePrefix: 'get_count_' }),
    (req: Request, res: Response) => ProfileViewController.getProfileViewCount(req as any, res)
);

/**
 * Feature 4: Get profile view analytics
 * GET /analytics
 * Requires auth, validates query with analytics schema
 */
router.get(
    '/analytics',
    AuthMiddleware.authenticate as any,
    validateRequest(analyticsQuerySchema, 'query'),
    // Alternative: Use existing validator
    validateRequest(profileViewValidators.getProfileViewAnalytics, 'query'),
    rateLimiterMiddleware({ windowMs: 60 * 1000, max: RATE_LIMITS.GET_ANALYTICS, storePrefix: 'get_analytics_' }),
    (req: Request, res: Response) => ProfileViewController.getProfileViewAnalytics(req as any, res)
);

/**
 * Feature 5: Set profile view privacy
 * PUT /privacy
 * Requires auth, validates body with privacy schema
 */
router.put(
    '/privacy',
    AuthMiddleware.authenticate as any,
    validateRequest(profileViewPrivacySchema, 'body'),
    // Alternative: Use existing validator
    // validateRequest(profileViewValidators.setProfileViewPrivacy, 'body'),
    rateLimiterMiddleware({ windowMs: 60 * 1000, max: RATE_LIMITS.SET_PRIVACY, storePrefix: 'set_privacy_' }),
    (req: Request, res: Response) => ProfileViewController.setProfileViewPrivacy(req as any, res)
);

/**
 * Feature 6: Delete profile view history
 * DELETE /history
 * Requires auth, validates query with delete schema
 */
router.delete(
    '/history',
    AuthMiddleware.authenticate as any,
    validateRequest(deleteHistoryQuerySchema, 'query'),
    // Alternative: Use existing validator
    // validateRequest(profileViewValidators.deleteProfileViewHistory, 'query'),
    rateLimiterMiddleware({ windowMs: 60 * 1000, max: RATE_LIMITS.DELETE_HISTORY, storePrefix: 'delete_history_' }),
    (req: Request, res: Response) => ProfileViewController.deleteProfileViewHistory(req as any, res)
);

/**
 * Feature 7: Get profile view insights
 * GET /insights  
 * Requires auth, validates query with analytics schema
 */
router.get(
    '/insights',
    AuthMiddleware.authenticate as any,
    validateRequest(analyticsQuerySchema, 'query'),
    // Alternative: Use existing validator
    validateRequest(profileViewValidators.getProfileViewInsights, 'query'),
    rateLimiterMiddleware({ windowMs: 60 * 1000, max: RATE_LIMITS.GET_INSIGHTS, storePrefix: 'get_insights_' }),
    (req: Request, res: Response) => ProfileViewController.getProfileViewInsights(req as any, res)
);

/**
 * Feature 8: Export profile view data
 * GET /export
 * Requires auth, validates query with export schema
 */
router.get(
    '/export',
    AuthMiddleware.authenticate as any,
    validateRequest(exportQuerySchema, 'query'),
    // Alternative: Use existing validator
    validateRequest(profileViewValidators.exportProfileViewData, 'query'),
    rateLimiterMiddleware({ windowMs: 60 * 1000, max: RATE_LIMITS.EXPORT_DATA, storePrefix: 'export_data_' }),
    (req: Request, res: Response) => ProfileViewController.exportProfileViewData(req as any, res)
);

/**
 * Bonus: Batch operations
 * POST /batch
 * Requires auth, validates body with batch schema
 */
router.post(
    '/batch',
    AuthMiddleware.authenticate as any,
    validateRequest(batchOperationsSchema, 'body'),
    // Alternative: Use existing validator
    // validateRequest(profileViewValidators.batchOperations, 'body'),
    rateLimiterMiddleware({ windowMs: 5 * 60 * 1000, max: RATE_LIMITS.BATCH_OPS, storePrefix: 'batch_ops_' }),
    (req: Request, res: Response) => batchProfileViewOperations(req as any, res)
);

/**
 * Legacy route using ValidationChain (for backward compatibility testing)
 * GET /viewers-legacy
 */
router.get(
    '/viewers-legacy',
    AuthMiddleware.authenticate as any,
    validateRequest(profileViewValidators.getWhoViewedProfile, 'query'),
    rateLimiterMiddleware({ windowMs: 60 * 1000, max: RATE_LIMITS.GET_VIEWERS, storePrefix: 'get_viewers_legacy_' }),
    (req: Request, res: Response) => ProfileViewController.getWhoViewedProfile(req as any, res)
);

// ==================== EXPORTS ====================

export default router;

// Export schemas for use in other files (testing, documentation, etc.)
export {
    recordProfileViewSchema,
    profileViewPrivacySchema,
    analyticsQuerySchema,
    exportQuerySchema,
    deleteHistoryQuerySchema,
    batchOperationsSchema
};