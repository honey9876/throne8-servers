/**
 * Analytics Routes - API Endpoints for User Analytics
 * All 15 analytics features
 * 
 * @module routes/analytics.routes
 * @version 1.0.0
 */

import express, { Request, Response, NextFunction } from 'express';
import { AnalyticsController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import { validateDateRange, validateExportFormat, validatePagination, validateTimeframeDays, validateTogglePrivacy } from '../validations/analytics.validation';


const router = express.Router();

// ==================== ROUTES ====================

/**
 * @route   POST /api/v1/analytics/record-search
 * @desc    Record search appearance when user appears in search results
 * @access  Private
 * @body    { searchedUserId, searchQuery, wasClicked, position }
 * Kam: Search me dikhne par track karta hai, Test: Search result click record karo
 */
router.post(
    '/record-search',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }), // 100 requests/min
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 RECORD SEARCH APPEARANCE ROUTE HIT');
            console.log('👤 Searcher:', (req as any).user);
            console.log('📦 Body:', req.body);

            await AnalyticsController.recordSearchAppearance(req as any, res);

            console.log('✅ RECORD SEARCH APPEARANCE COMPLETED');
        } catch (error : any) {
            console.error('❌ RECORD SEARCH APPEARANCE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/analytics/record-profile-view
 * @desc    Record profile view when someone visits a profile
 * @access  Private
 * @body    { profileOwnerId, viewerName?, viewerHeadline? }
 * Kam: Profile view track karta hai, Test: Kisi aur ka profile view record karo
 */
router.post(
    '/record-profile-view',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 RECORD PROFILE VIEW ROUTE HIT');
            console.log('👤 Viewer:', (req as any).user);
            console.log('📦 Body:', req.body);

            await AnalyticsController.recordProfileViewAPI(req as any, res);

            console.log('✅ RECORD PROFILE VIEW COMPLETED');
        } catch (error : any) {
            console.error('❌ RECORD PROFILE VIEW ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/analytics/privacy
 * @desc    Toggle analytics privacy (Feature 1)
 * @access  Private
 * @body    { isPrivate: boolean }
 */
router.put(
    '/privacy',
    AuthMiddleware.authenticate as any,
    validateTogglePrivacy,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 TOGGLE ANALYTICS PRIVACY ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📦 Body:', req.body);

            await AnalyticsController.togglePrivacy(req as any, res);

            console.log('✅ TOGGLE PRIVACY ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ TOGGLE PRIVACY ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/profile-views/count
 * @desc    Get profile views count (Feature 2)
 * @access  Private
 * @query   dateRange=90 (optional, default: 90 days)
 */




router.get(
    '/profile-views/count',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET PROFILE VIEWS COUNT ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getProfileViewsCount(req as any, res);

            console.log('✅ GET PROFILE VIEWS COUNT ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET PROFILE VIEWS COUNT ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/profile-views/detail
 * @desc    Get profile views detail (Feature 3)
 * @access  Private
 * @query   isPremium=false, page=1, limit=20
 */
router.get(
    '/profile-views/detail',
    AuthMiddleware.authenticate as any,
    validatePagination,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET PROFILE VIEWS DETAIL ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getProfileViewsDetail(req as any, res);

            console.log('✅ GET PROFILE VIEWS DETAIL ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET PROFILE VIEWS DETAIL ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/post-impressions/count
 * @desc    Get post impressions count (Feature 4)
 * @access  Private
 */
router.get(
    '/post-impressions/count',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET POST IMPRESSIONS COUNT ROUTE HIT');
            console.log('👤 User:', (req as any).user);

            await AnalyticsController.getPostImpressionsCount(req as any, res);

            console.log('✅ GET POST IMPRESSIONS COUNT ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET POST IMPRESSIONS COUNT ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/post-impressions/detail
 * @desc    Get post impressions detail (Feature 5)
 * @access  Private
 * @query   page=1, limit=50
 */
router.get(
    '/post-impressions/detail',
    AuthMiddleware.authenticate as any,
    // validatePagination,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET POST IMPRESSIONS DETAIL ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getPostImpressionsDetail(req as any, res);

            console.log('✅ GET POST IMPRESSIONS DETAIL ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET POST IMPRESSIONS DETAIL ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/post-impressions/timeframe
 * @desc    Get post impressions by timeframe (Feature 6)
 * @access  Private
 * @query   days=7 (default: 7 days)
 */
router.get(
    '/post-impressions/timeframe',
    AuthMiddleware.authenticate as any,
    validateTimeframeDays,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET POST IMPRESSIONS TIMEFRAME ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getPostImpressionsByTimeframe(req as any, res);

            console.log('✅ GET POST IMPRESSIONS TIMEFRAME ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET POST IMPRESSIONS TIMEFRAME ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/search-appearances/count
 * @desc    Get search appearances count (Feature 7)
 * @access  Private
 */
router.get(
    '/search-appearances/count',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET SEARCH APPEARANCES COUNT ROUTE HIT');
            console.log('👤 User:', (req as any).user);

            await AnalyticsController.getSearchAppearancesCount(req as any, res);

            console.log('✅ GET SEARCH APPEARANCES COUNT ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET SEARCH APPEARANCES COUNT ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/search-appearances/detail
 * @desc    Get search appearances detail (Feature 8)
 * @access  Private
 * @query   page=1, limit=50
 */
router.get(
    '/search-appearances/detail',
    AuthMiddleware.authenticate as any,
    validatePagination,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET SEARCH APPEARANCES DETAIL ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getSearchAppearancesDetail(req as any, res);

            console.log('✅ GET SEARCH APPEARANCES DETAIL ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET SEARCH APPEARANCES DETAIL ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/all
 * @desc    Get all analytics summary (Feature 9)
 * @access  Private
 * @query   dateRange=30 (optional, default: 30 days)
 */
router.get(
    '/all',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ALL ANALYTICS ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getAllAnalytics(req as any, res);

            console.log('✅ GET ALL ANALYTICS ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET ALL ANALYTICS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/who-viewed
 * @desc    Get who viewed your profile (Feature 10)
 * @access  Private
 * @query   isPremium=false, page=1, limit=20
 */
router.get(
    '/who-viewed',
    AuthMiddleware.authenticate as any,
    validatePagination,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET WHO VIEWED PROFILE ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getWhoViewedProfile(req as any, res);

            console.log('✅ GET WHO VIEWED PROFILE ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET WHO VIEWED PROFILE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/demographics
 * @desc    Get viewer demographics (Feature 11)
 * @access  Private
 */
router.get(
    '/demographics',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET VIEWER DEMOGRAPHICS ROUTE HIT');
            console.log('👤 User:', (req as any).user);

            await AnalyticsController.getViewerDemographics(req as any, res);

            console.log('✅ GET VIEWER DEMOGRAPHICS ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET VIEWER DEMOGRAPHICS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/search-keywords
 * @desc    Get search keywords used (Feature 12)
 * @access  Private
 * @query   limit=10 (optional)
 */
router.get(
    '/search-keywords',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET SEARCH KEYWORDS ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getSearchKeywords(req as any, res);

            console.log('✅ GET SEARCH KEYWORDS ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET SEARCH KEYWORDS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/date-range
 * @desc    Get analytics by custom date range (Feature 13)
 * @access  Private
 * @query   startDate=2024-01-01, endDate=2024-01-31 (YYYY-MM-DD)
 */
router.get(
    '/date-range',
    AuthMiddleware.authenticate as any,
    validateDateRange,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ANALYTICS BY DATE RANGE ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getAnalyticsByDateRange(req as any, res);

            console.log('✅ GET ANALYTICS BY DATE RANGE ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET ANALYTICS BY DATE RANGE ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/export
 * @desc    Export analytics (Feature 14)
 * @access  Private
 * @query   format=csv (csv or excel)
 */
router.get(
    '/export',
    AuthMiddleware.authenticate as any,
    validateExportFormat,
    rateLimitMiddleware({ maxRequests: 5, windowMs: 60000 }), // Limited to 5/min
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 EXPORT ANALYTICS ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.exportAnalytics(req as any, res);

            console.log('✅ EXPORT ANALYTICS ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ EXPORT ANALYTICS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/graphs
 * @desc    Get analytics graphs/charts data (Feature 15)
 * @access  Private
 * @query   days=30 (optional, default: 30)
 */
router.get(
    '/graphs',
    AuthMiddleware.authenticate as any,
    validateTimeframeDays,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ANALYTICS GRAPHS DATA ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getAnalyticsGraphData(req as any, res);

            console.log('✅ GET ANALYTICS GRAPHS DATA ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET ANALYTICS GRAPHS DATA ROUTE ERROR:', error);
            next(error);
        }
    }
);

// /**
//  * @route   POST /api/v1/analytics/record-post-impression
//  * @desc    Record post impression when user sees post in feed/profile
//  * @access  Private
//  * @body    { postId, postOwnerId, source, deviceType?, sessionId?, scrollDepth?, viewDuration? }
//  */
// router.post(
//     '/record-post-impression',
//     AuthMiddleware.authenticate as any,
//     rateLimitMiddleware({ maxRequests: 200, windowMs: 60000 }), // 200 requests/min (high traffic)
//     async (req: Request, res: Response, next: NextFunction) => {
//         try {
//             console.log('🎯 RECORD POST IMPRESSION ROUTE HIT');
//             console.log('👤 Viewer:', (req as any).user);
//             console.log('📦 Body:', req.body);

//             await AnalyticsController.recordPostImpressionAPI(req as any, res);

//             console.log('✅ RECORD POST IMPRESSION COMPLETED');
//         } catch (error : any) {
//             console.error('❌ RECORD POST IMPRESSION ERROR:', error);
//             next(error);
//         }
//     }
// );

/**
 * @route   POST /api/v1/analytics/record-post-impression-smart
 * @desc    Record post impression with intelligent time-based counting
 * @access  Private
 * @body    { postId, postOwnerId, source }
 * Kam: Post view count karta hai with 10-min cooldown
    Test: Apne post ka impression record karo
 */
router.post(
    '/record-post-impression-smart',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 200, windowMs: 60000 }),
    AnalyticsController.recordPostImpressionSmart as any
);

/**
 * @route   GET /api/v1/analytics/post-impressions/timeline
 * @desc    Get post impressions timeline (daily breakdown)
 * @access  Private
 * @query   days=30, postId (optional)
 */
router.get(
    '/post-impressions/timeline',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    AnalyticsController.getPostImpressionsTimeline as any
);

/**
 * @route   GET /api/v1/analytics/post/:postId/impression-stats
 * @desc    Get detailed impression statistics for specific post
 * @access  Private
 */
router.get(
    '/post/:postId/impression-stats',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    AnalyticsController.getPostImpressionStats as any
);

/**
 * @route   GET /api/v1/analytics/post-impressions/date-range
 * @desc    Get post impressions by custom date range
 * @access  Private
 * @query   startDate=2024-01-01, endDate=2024-01-31, postId? (optional)
 */
router.get(
    '/post-impressions/date-range',
    AuthMiddleware.authenticate as any,
    validateDateRange,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET POST IMPRESSIONS BY DATE RANGE ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getPostImpressionsByDateRangeAPI(req as any, res);

            console.log('✅ GET POST IMPRESSIONS BY DATE RANGE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET POST IMPRESSIONS BY DATE RANGE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/post/:postId
 * @desc    Get analytics for specific post (impressions, engagement, daily breakdown)
 * @access  Private
 * @query   days=30 (optional, default: 30)
 */
router.get(
    '/post/:postId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET POST ANALYTICS ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Params:', req.params);
            console.log('📊 Query:', req.query);

            await AnalyticsController.getPostAnalyticsAPI(req as any, res);

            console.log('✅ GET POST ANALYTICS COMPLETED');
        } catch (error : any) {
            console.error('❌ GET POST ANALYTICS ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/profile-views/trend
 * @desc    Get profile views trend graph (Feature 1)
 * @access  Private
 * @query   days=30, groupBy=day (day|week|month)
 */
router.get(
    '/profile-views/trend',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET PROFILE VIEWS TREND ROUTE HIT');
            await AnalyticsController.getProfileViewsTrend(req as any, res);
            console.log('✅ GET PROFILE VIEWS TREND COMPLETED');
        } catch (error : any) {
            console.error('❌ GET PROFILE VIEWS TREND ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/profile-views/change
 * @desc    Get profile views % change (Feature 2)
 * @access  Private
 * @query   days=30
 */
router.get(
    '/profile-views/change',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET PROFILE VIEWS CHANGE ROUTE HIT');
            await AnalyticsController.getProfileViewsChange(req as any, res);
            console.log('✅ GET PROFILE VIEWS CHANGE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET PROFILE VIEWS CHANGE ERROR:', error);
            next(error);
        }
    }
);



/**
 * @route   GET /api/v1/analytics/post-impressions/change
 * @desc    Get post impressions % change vs previous period
 * @access  Private
 * @query   days=30
 */
router.get(
    '/post-impressions/change',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET POST IMPRESSIONS CHANGE ROUTE HIT');
            await AnalyticsController.getPostImpressionsChange(req as any, res);
            console.log('✅ GET POST IMPRESSIONS CHANGE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET POST IMPRESSIONS CHANGE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/search-appearances/change
 * @desc    Get search appearances % change vs previous period
 * @access  Private
 * @query   days=30
 */
router.get(
    '/search-appearances/change',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET SEARCH APPEARANCES CHANGE ROUTE HIT');
            await AnalyticsController.getSearchAppearancesChange(req as any, res);
            console.log('✅ GET SEARCH APPEARANCES CHANGE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET SEARCH APPEARANCES CHANGE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/engagements/total
 * @desc    Get total engagements (Feature 3)
 * @access  Private
 * @query   days? (optional)
 */
router.get(
    '/engagements/total',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET TOTAL ENGAGEMENTS ROUTE HIT');
            await AnalyticsController.getTotalEngagements(req as any, res);
            console.log('✅ GET TOTAL ENGAGEMENTS COMPLETED');
        } catch (error : any) {
            console.error('❌ GET TOTAL ENGAGEMENTS ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/engagements/trend
 * @desc    Get engagement trend graph (Feature 4)
 * @access  Private
 * @query   days=30, groupBy=day (day|week|month)
 */
router.get(
    '/engagements/trend',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ENGAGEMENT TREND ROUTE HIT');
            await AnalyticsController.getEngagementTrend(req as any, res);
            console.log('✅ GET ENGAGEMENT TREND COMPLETED');
        } catch (error : any) {
            console.error('❌ GET ENGAGEMENT TREND ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/engagements/change
 * @desc    Get engagement % change (Feature 5)
 * @access  Private
 * @query   days=30
 */
router.get(
    '/engagements/change',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ENGAGEMENT CHANGE ROUTE HIT');
            await AnalyticsController.getEngagementChange(req as any, res);
            console.log('✅ GET ENGAGEMENT CHANGE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET ENGAGEMENT CHANGE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/reactions/count
 * @desc    Get reactions count (Feature 6)
 * @access  Private
 * @query   days? (optional)
 */
router.get(
    '/reactions/count',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET REACTIONS COUNT ROUTE HIT');
            await AnalyticsController.getReactionsCount(req as any, res);
            console.log('✅ GET REACTIONS COUNT COMPLETED');
        } catch (error : any) {
            console.error('❌ GET REACTIONS COUNT ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/comments/count
 * @desc    Get comments count (Feature 7)
 * @access  Private
 * @query   days? (optional)
 */
router.get(
    '/comments/count',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET COMMENTS COUNT ROUTE HIT');
            await AnalyticsController.getCommentsCount(req as any, res);
            console.log('✅ GET COMMENTS COUNT COMPLETED');
        } catch (error : any) {
            console.error('❌ GET COMMENTS COUNT ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/videos/views
 * @desc    Get video views (Feature 8)
 * @access  Private
 * @query   days?, videoId? (optional)
 */
router.get(
    '/videos/views',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET VIDEO VIEWS ROUTE HIT');
            await AnalyticsController.getVideoViews(req as any, res);
            console.log('✅ GET VIDEO VIEWS COMPLETED');
        } catch (error : any) {
            console.error('❌ GET VIDEO VIEWS ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/analytics/viewers/retention
 * @desc    Get viewer retention - new vs returning (Feature 9)
 * @access  Private
 * @query   days=30
 */
router.get(
    '/viewers/retention',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET VIEWER RETENTION ROUTE HIT');
            await AnalyticsController.getViewerRetention(req as any, res);
            console.log('✅ GET VIEWER RETENTION COMPLETED');
        } catch (error : any) {
            console.error('❌ GET VIEWER RETENTION ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/analytics/record-click
 * @desc    Record click on profile/post/link
 * @access  Private
 * @body    { targetUserId, clickType, targetUrl?, postId? }
 * Kam: Links/buttons clicks track karta hai, Test: Profile ya post pe click record karo
 */
router.post(
    '/record-click',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 200, windowMs: 60000 }),
    AnalyticsController.recordClick as any
);

/**
 * @route   POST /api/v1/analytics/record-share
 * @desc    Post shares count karta hai
 * @access  Private
 * @body    { postOwnerId, postId, shareType }
 */
router.post(
    '/record-share',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    AnalyticsController.recordShare as any
);

/**
 * @route   POST /api/v1/analytics/record-unique-visitor
 * @desc    Record unique visitor to profile
 * @access  Private
 * @body    { profileOwnerId, pageUrl?, duration? }
 */
router.post(
    '/record-unique-visitor',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 200, windowMs: 60000 }),
    AnalyticsController.recordUniqueVisitor as any
);


/**
 * @route   POST /api/v1/analytics/record-engagement
 * @desc    Record engagement (like/comment/share/save) on a post
 * @access  Private
 * @body    { postId, postOwnerId, engagementType }
 * Kam: Like/comment/share hone par analytics update karta hai
 */
router.post(
    '/record-engagement',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 200, windowMs: 60000 }),
    AnalyticsController.recordEngagement as any
);


/**
 * @route   GET /api/v1/analytics/clicks/count
 * @desc    Get clicks count with breakdown
 * @access  Private
 * @query   days? (optional)
 */
router.get(
    '/clicks/count',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    AnalyticsController.getClicksCount as any
);

/**
 * @route   GET /api/v1/analytics/shares/count
 * @desc    Get shares count with breakdown
 * @access  Private
 * @query   days? (optional)
 */
router.get(
    '/shares/count',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    AnalyticsController.getSharesCount as any
);

/**
 * @route   GET /api/v1/analytics/unique-visitors/count
 * @desc    Get unique visitors count
 * @access  Private
 * @query   days? (optional)
 */
router.get(
    '/unique-visitors/count',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    AnalyticsController.getUniqueVisitorsCount as any
);

/**
 * @route   GET /api/v1/analytics/profile-views/trend-with-change
 * @desc    Get profile views trend with % change
 * @access  Private
 * @query   days=30
 */
router.get(
    '/profile-views/trend-with-change',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    AnalyticsController.getProfileViewsTrendWithChange as any
);

/**
 * @route   GET /api/v1/analytics/search-appearances/highlighted
 * @desc    Get search appearances with highlighted terms
 * @access  Private
 * @query   page=1, limit=50
 */
router.get(
    '/search-appearances/highlighted',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    AnalyticsController.getSearchAppearancesWithHighlights as any
);

/**
 * @route   GET /api/v1/analytics/discovery-stats
 * @desc    Get discovery stats (impressions, engagements, members reached)
 * @access  Private
 * @query   days? (optional)
 */
router.get(
    '/discovery-stats',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    AnalyticsController.getDiscoveryStats as any
);

export default router;