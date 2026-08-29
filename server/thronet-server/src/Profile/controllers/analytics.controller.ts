/**
 * Analytics Controller - Handles HTTP Requests for Analytics
 * All 15 analytics features
 * 
 * @module controllers/analytics.controller
 * @version 1.0.0
 */

import AuditProducer from '@/shared/kafka/producers/audit.producer';
import Analytics from '@/Profile/models/Analytics.model';
import { AnalyticsService } from '@/shared/services/index.service';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
    sessionId?: string;
    deviceId?: string;
}

// ==================== ANALYTICS CONTROLLER ====================

class AnalyticsController {

    // ==================== 16. RECORD SEARCH APPEARANCE ====================

    /**
     * ✅ Feature 16: Record search appearance (POST)
     * POST /api/v1/analytics/record-search
     */
    static async recordSearchAppearance(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const searcherId = req.user.userId;
            const { searchedUserId, searchQuery, wasClicked, position } = req.body;

            // Validation
            if (!searchedUserId || !searchQuery) {
                ResponseUtil.validationError(
                    res,
                    ['searchedUserId and searchQuery are required'],
                    'Validation failed'
                );
                return;
            }

            // Don't record if user searches themselves
            if (searcherId === searchedUserId) {
                ResponseUtil.success(res, null, 'Self-search not recorded');
                return;
            }

            LoggerUtil.info('Recording search appearance', {
                searcherId,
                searchedUserId,
                searchQuery,
                wasClicked,
                correlationId,
            });

            // Call service method
            await AnalyticsService.recordSearchAppearance(searchedUserId, {
                searchQuery: searchQuery.toLowerCase().trim(),
                searcherId,
                appearedAt: new Date(),
                wasClicked: wasClicked === true,
                position: position || undefined,
            });

            ResponseUtil.success(
                res,
                { recorded: true },
                'Search appearance recorded successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Record search appearance failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 17. RECORD PROFILE VIEW ====================

    /**
     * ✅ Feature 17: Record profile view (POST)
     * POST /api/v1/analytics/record-profile-view
     */
    static async recordProfileViewAPI(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const viewerId = req.user.userId;
            const { profileOwnerId, viewerName, viewerHeadline, viewerPhotoUrl } = req.body;

            // Validation
            if (!profileOwnerId) {
                ResponseUtil.validationError(
                    res,
                    ['profileOwnerId is required'],
                    'Validation failed'
                );
                return;
            }

            // Don't record self-views
            if (viewerId === profileOwnerId) {
                ResponseUtil.success(res, null, 'Self-view not recorded');
                return;
            }

            LoggerUtil.info('Recording profile view', {
                viewerId,
                profileOwnerId,
                correlationId,
            });

            // Call service method
            await AnalyticsService.recordProfileView(profileOwnerId, {
                viewerId,
                viewerName: viewerName || req.user.email,
                viewerHeadline: viewerHeadline || undefined,
                viewerPhotoUrl: viewerPhotoUrl || undefined,
                ipAddress: req.ip || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
            });

            ResponseUtil.success(
                res,
                { recorded: true },
                'Profile view recorded successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Record profile view failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 1. TOGGLE PRIVACY ====================

    /**
     * ✅ Feature 1: Toggle analytics privacy
     * PUT /api/v1/analytics/privacy
     */
    static async togglePrivacy(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { isPrivate } = req.body;

            if (typeof isPrivate !== 'boolean') {
                ResponseUtil.validationError(
                    res,
                    ['isPrivate must be a boolean'],
                    'Validation failed'
                );
                return;
            }

            LoggerUtil.info('Toggle analytics privacy request', {
                userId,
                isPrivate,
                correlationId,
            });

            const result = await AnalyticsService.togglePrivacy(userId, isPrivate);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Privacy toggled successfully', {
                userId,
                isPrivate,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Analytics privacy updated successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Toggle privacy failed', {
                error: error.message,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 2. GET PROFILE VIEWS COUNT ====================

    /**
     * ✅ Feature 2: Get profile views count
     * GET /api/v1/analytics/profile-views/count
     */
    static async getProfileViewsCount(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const dateRange = parseInt(req.query.dateRange as string) || 90;

            const result = await AnalyticsService.getProfileViewsCount(userId, dateRange);

            ResponseUtil.success(
                res,
                result,
                'Profile views count fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get profile views count failed', {
                error: error.message,
                correlationI: correlationId,
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 3. GET PROFILE VIEWS DETAIL ====================

    /**
     * ✅ Feature 3: Get profile views detail
     * GET /api/v1/analytics/profile-views/detail
     */
    static async getProfileViewsDetail(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const isPremium = req.query.isPremium === 'true';
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;

            const result = await AnalyticsService.getProfileViewsDetail(
                userId,
                isPremium,
                page,
                limit
            );

            ResponseUtil.success(
                res,
                result,
                'Profile views detail fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get profile views detail failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 4. GET POST IMPRESSIONS COUNT ====================

    /**
     * ✅ Feature 4: Get post impressions count
     * GET /api/v1/analytics/post-impressions/count
     */
    static async getPostImpressionsCount(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;

            const result = await AnalyticsService.getPostImpressionsCount(userId);

            ResponseUtil.success(
                res,
                result,
                'Post impressions count fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get post impressions count failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 5. GET POST IMPRESSIONS DETAIL ====================

    /**
     * ✅ Feature 5: Get post impressions detail
     * GET /api/v1/analytics/post-impressions/detail
     */
    static async getPostImpressionsDetail(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;

            const result = await AnalyticsService.getPostImpressionsDetail(
                userId,
                page,
                limit
            );

            ResponseUtil.success(
                res,
                result,
                'Post impressions detail fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get post impressions detail failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 6. GET POST IMPRESSIONS BY TIMEFRAME ====================

    /**
     * ✅ Feature 6: Get post impressions by timeframe
     * GET /api/v1/analytics/post-impressions/timeframe
     */
    static async getPostImpressionsByTimeframe(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = parseInt(req.query.days as string) || 7;

            const result = await AnalyticsService.getPostImpressionsByTimeframe(userId, days);

            ResponseUtil.success(
                res,
                result,
                `Post impressions for last ${days} days fetched successfully`
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get post impressions by timeframe failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 7. GET SEARCH APPEARANCES COUNT ====================

    /**
     * ✅ Feature 7: Get search appearances count
     * GET /api/v1/analytics/search-appearances/count
     */
    static async getSearchAppearancesCount(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;

            const result = await AnalyticsService.getSearchAppearancesCount(userId);

            ResponseUtil.success(
                res,
                result,
                'Search appearances count fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get search appearances count failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 8. GET SEARCH APPEARANCES DETAIL ====================

    /**
     * ✅ Feature 8: Get search appearances detail
     * GET /api/v1/analytics/search-appearances/detail
     */
    static async getSearchAppearancesDetail(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;

            const result = await AnalyticsService.getSearchAppearancesDetail(
                userId,
                page,
                limit
            );

            ResponseUtil.success(
                res,
                result,
                'Search appearances detail fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get search appearances detail failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 9. GET ALL ANALYTICS ====================

    /**
     * ✅ Feature 9: Get all analytics summary
     * GET /api/v1/analytics/all
     */
    static async getAllAnalytics(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const dateRange = parseInt(req.query.dateRange as string) || 30;

            const result = await AnalyticsService.getAllAnalytics(userId, dateRange);

            ResponseUtil.success(
                res,
                result,
                'All analytics fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all analytics failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 10. WHO VIEWED YOUR PROFILE ====================

    /**
     * ✅ Feature 10: Get who viewed your profile (list)
     * GET /api/v1/analytics/who-viewed
     */
    static async getWhoViewedProfile(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        // Same as Feature 3
        return this.getProfileViewsDetail(req, res);
    }

    // ==================== 11. VIEWER DEMOGRAPHICS ====================

    /**
     * ✅ Feature 11: Get viewer demographics
     * GET /api/v1/analytics/demographics
     */
    static async getViewerDemographics(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;

            const result = await AnalyticsService.getViewerDemographics(userId);

            ResponseUtil.success(
                res,
                result,
                'Viewer demographics fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get viewer demographics failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 12. SEARCH KEYWORDS ====================

    /**
     * ✅ Feature 12: Get search keywords used
     * GET /api/v1/analytics/search-keywords
     */
    static async getSearchKeywords(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const limit = parseInt(req.query.limit as string) || 10;

            const result = await AnalyticsService.getSearchKeywords(userId, limit);

            ResponseUtil.success(
                res,
                result,
                'Search keywords fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get search keywords failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 13. ANALYTICS BY DATE RANGE ====================

    /**
     * ✅ Feature 13: Get analytics by custom date range
     * GET /api/v1/analytics/date-range
     */
    static async getAnalyticsByDateRange(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                ResponseUtil.validationError(
                    res,
                    ['startDate and endDate are required'],
                    'Validation failed'
                );
                return;
            }

            const start = new Date(startDate as string);
            const end = new Date(endDate as string);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                ResponseUtil.validationError(
                    res,
                    ['Invalid date format'],
                    'Validation failed'
                );
                return;
            }

            if (start > end) {
                ResponseUtil.validationError(
                    res,
                    ['startDate must be before endDate'],
                    'Validation failed'
                );
                return;
            }

            const result = await AnalyticsService.getAnalyticsByDateRange(userId, start, end);

            ResponseUtil.success(
                res,
                result,
                'Analytics by date range fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get analytics by date range failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 14. EXPORT ANALYTICS ====================

    /**
     * ✅ Feature 14: Export analytics (CSV/Excel)
     * GET /api/v1/analytics/export
     */
    static async exportAnalytics(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const format = (req.query.format as 'csv' | 'excel') || 'csv';

            if (!['csv', 'excel'].includes(format)) {
                ResponseUtil.validationError(
                    res,
                    ['format must be csv or excel'],
                    'Validation failed'
                );
                return;
            }

            const result = await AnalyticsService.exportAnalytics(userId, format);

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'ANALYTICS_EXPORTED',
                        ipAddress: req.ip || 'unknown',
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: { format, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            ResponseUtil.success(
                res,
                result,
                `Analytics exported in ${format.toUpperCase()} format`
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Export analytics failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'No analytics data found') {
                ResponseUtil.notFound(res, 'No analytics data found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 15. ANALYTICS GRAPHS DATA ====================

    /**
     * ✅ Feature 15: Get analytics graphs/charts data
     * GET /api/v1/analytics/graphs
     */
    static async getAnalyticsGraphData(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = parseInt(req.query.days as string) || 30;

            const result = await AnalyticsService.getAnalyticsGraphData(userId, days);

            ResponseUtil.success(
                res,
                result,
                'Analytics graph data fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get analytics graph data failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 18. RECORD POST IMPRESSION ====================

    /**
     * ✅ Feature 18: Record post impression (POST)
     * POST /api/v1/analytics/record-post-impression
     */
    static async recordPostImpressionAPI(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const viewerId = req.user.userId;
            const {
                postId,
                postOwnerId,
                source,
                deviceType,
                sessionId,
                scrollDepth,
                viewDuration
            } = req.body;

            // ✅ VALIDATION
            if (!postId || !postOwnerId || !source) {
                ResponseUtil.validationError(
                    res,
                    ['postId, postOwnerId, and source are required'],
                    'Validation failed'
                );
                return;
            }

            const validSources = ['feed', 'profile', 'search', 'hashtag', 'repost', 'direct'];
            if (!validSources.includes(source)) {
                ResponseUtil.validationError(
                    res,
                    ['Invalid source. Must be one of: ' + validSources.join(', ')],
                    'Validation failed'
                );
                return;
            }

            // ✅ DON'T COUNT SELF-IMPRESSIONS
            if (viewerId === postOwnerId) {
                ResponseUtil.success(res, null, 'Self-impression not recorded');
                return;
            }

            LoggerUtil.info('Recording post impression', {
                viewerId,
                postOwnerId,
                postId,
                source,
                correlationId,
            });

            // ✅ CALL SERVICE
            await AnalyticsService.recordPostImpression(postOwnerId, {
                postId,
                source,
                viewerId,
                deviceType,
                sessionId,
                scrollDepth,
                viewDuration,
            });

            ResponseUtil.success(
                res,
                { recorded: true },
                'Post impression recorded successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Record post impression failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 19. GET POST IMPRESSIONS BY DATE RANGE ====================

    /**
     * ✅ Feature 19: Get post impressions by date range (GET)
     * GET /api/v1/analytics/post-impressions/date-range
     */
    static async getPostImpressionsByDateRangeAPI(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { startDate, endDate, postId } = req.query;

            if (!startDate || !endDate) {
                ResponseUtil.validationError(
                    res,
                    ['startDate and endDate are required'],
                    'Validation failed'
                );
                return;
            }

            const start = new Date(startDate as string);
            const end = new Date(endDate as string);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                ResponseUtil.validationError(
                    res,
                    ['Invalid date format. Use YYYY-MM-DD'],
                    'Validation failed'
                );
                return;
            }

            const result = await AnalyticsService.getPostImpressionsByDateRange(
                userId,
                start,
                end,
                postId as string | undefined
            );

            ResponseUtil.success(
                res,
                result,
                'Post impressions by date range fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get post impressions by date range failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== 20. GET POST ANALYTICS ====================

    /**
     * ✅ Feature 20: Get analytics for specific post (GET)
     * GET /api/v1/analytics/post/:postId
     */
    static async getPostAnalyticsAPI(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { postId } = req.params;
            const days = parseInt(req.query.days as string) || 30;

            if (!postId) {
                ResponseUtil.validationError(
                    res,
                    ['postId is required'],
                    'Validation failed'
                );
                return;
            }

            const result = await AnalyticsService.getPostAnalytics(userId, postId, days);

            ResponseUtil.success(
                res,
                result,
                'Post analytics fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get post analytics failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ Feature 1: Get profile views trend
     * GET /api/v1/analytics/profile-views/trend
     */
    static async getProfileViewsTrend(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = parseInt(req.query.days as string) || 30;
            const groupBy = (req.query.groupBy as 'day' | 'week' | 'month') || 'day';

            const result = await AnalyticsService.getProfileViewsTrend(userId, days, groupBy);

            ResponseUtil.success(
                res,
                result,
                'Profile views trend fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get profile views trend failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== FEATURE 2: PROFILE VIEWS % CHANGE ====================

    /**
     * ✅ Feature 2: Get profile views % change
     * GET /api/v1/analytics/profile-views/change
     */
    static async getProfileViewsChange(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = parseInt(req.query.days as string) || 30;

            const result = await AnalyticsService.getProfileViewsChange(userId, days);

            ResponseUtil.success(
                res,
                result,
                'Profile views change fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get profile views change failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }


    

    /**
     * ✅ Get post impressions % change
     * GET /api/v1/analytics/post-impressions/change
     */
    static async getPostImpressionsChange(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = parseInt(req.query.days as string) || 30;

            const result = await AnalyticsService.getPostImpressionsChange(userId, days);

            ResponseUtil.success(res, result, 'Post impressions change fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get post impressions change failed', {
                error: error.message,
                correlationId,
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ Get search appearances % change
     * GET /api/v1/analytics/search-appearances/change
     */
    static async getSearchAppearancesChange(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = parseInt(req.query.days as string) || 30;

            const result = await AnalyticsService.getSearchAppearancesChange(userId, days);

            ResponseUtil.success(res, result, 'Search appearances change fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get search appearances change failed', {
                error: error.message,
                correlationId,
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }






    // ==================== FEATURE 3: TOTAL ENGAGEMENTS ====================

    /**
     * ✅ Feature 3: Get total engagements
     * GET /api/v1/analytics/engagements/total
     */
    static async getTotalEngagements(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = req.query.days ? parseInt(req.query.days as string) : undefined;

            const result = await AnalyticsService.getTotalEngagements(userId, days);

            ResponseUtil.success(
                res,
                result,
                'Total engagements fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get total engagements failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== FEATURE 4: ENGAGEMENT TREND ====================

    /**
     * ✅ Feature 4: Get engagement trend
     * GET /api/v1/analytics/engagements/trend
     */
    static async getEngagementTrend(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = parseInt(req.query.days as string) || 30;
            const groupBy = (req.query.groupBy as 'day' | 'week' | 'month') || 'day';

            const result = await AnalyticsService.getEngagementTrend(userId, days, groupBy);

            ResponseUtil.success(
                res,
                result,
                'Engagement trend fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get engagement trend failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== FEATURE 5: ENGAGEMENT % CHANGE ====================

    /**
     * ✅ Feature 5: Get engagement % change
     * GET /api/v1/analytics/engagements/change
     */
    static async getEngagementChange(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = parseInt(req.query.days as string) || 30;

            const result = await AnalyticsService.getEngagementChange(userId, days);

            ResponseUtil.success(
                res,
                result,
                'Engagement change fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get engagement change failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== FEATURE 6: REACTIONS COUNT ====================

    /**
     * ✅ Feature 6: Get reactions count
     * GET /api/v1/analytics/reactions/count
     */
    static async getReactionsCount(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = req.query.days ? parseInt(req.query.days as string) : undefined;

            const result = await AnalyticsService.getReactionsCount(userId, days);

            ResponseUtil.success(
                res,
                result,
                'Reactions count fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get reactions count failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== FEATURE 7: COMMENTS COUNT ====================

    /**
     * ✅ Feature 7: Get comments count
     * GET /api/v1/analytics/comments/count
     */
    static async getCommentsCount(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = req.query.days ? parseInt(req.query.days as string) : undefined;

            const result = await AnalyticsService.getCommentsCount(userId, days);

            ResponseUtil.success(
                res,
                result,
                'Comments count fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get comments count failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== FEATURE 8: VIDEO VIEWS ====================

    /**
     * ✅ Feature 8: Get video views
     * GET /api/v1/analytics/videos/views
     */
    static async getVideoViews(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = req.query.days ? parseInt(req.query.days as string) : undefined;
            const videoId = req.query.videoId as string | undefined;

            const result = await AnalyticsService.getVideoViews(userId, days, videoId);

            ResponseUtil.success(
                res,
                result,
                'Video views fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get video views failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // ==================== FEATURE 9: VIEWER RETENTION ====================

    /**
     * ✅ Feature 9: Get viewer retention (new vs returning)
     * GET /api/v1/analytics/viewers/retention
     */
    static async getViewerRetention(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = parseInt(req.query.days as string) || 30;

            const result = await AnalyticsService.getViewerRetention(userId, days);

            ResponseUtil.success(
                res,
                result,
                'Viewer retention fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get viewer retention failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

   // ✅ CHANGED: viewDuration ab body se accept hota hai aur service ko pass hota hai
    static async recordPostImpressionSmart(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const viewerId = req.user.userId;
            const { postId, postOwnerId, source, viewDuration } = req.body;

            // Generate session/device fingerprint
            const sessionId = req.headers['x-session-id'] as string || uuidv4();
            const deviceFingerprint = req.headers['user-agent'] || 'unknown';

            if (!postId || !postOwnerId || !source) {
                ResponseUtil.validationError(
                    res,
                    ['postId, postOwnerId, and source are required'],
                    'Validation failed'
                );
                return;
            }

            // Don't count self-views
            if (viewerId === postOwnerId) {
                ResponseUtil.success(res, null, 'Self-view not recorded');
                return;
            }

            // ✅ NEW: sanity check — negative ya bahut bada duration ignore karo (junk data se bachne ke liye)
            const sanitizedDuration =
                typeof viewDuration === 'number' && viewDuration >= 0 && viewDuration <= 3600
                    ? viewDuration
                    : undefined;

            LoggerUtil.info('Recording smart post impression', {
                viewerId,
                postOwnerId,
                postId,
                source,
                viewDuration: sanitizedDuration,
                correlationId,
            });

            await AnalyticsService.recordPostImpressionSmart(postOwnerId, {
                postId,
                source,
                viewerId,
                sessionId,
                deviceFingerprint,
                viewDuration: sanitizedDuration, // ✅ NEW
            });

            ResponseUtil.success(
                res,
                { recorded: true },
                'Post impression recorded'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Record smart impression failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    // Add these NEW methods:

    static async getPostImpressionsTimeline(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = parseInt(req.query.days as string) || 30;
            const postId = req.query.postId as string;

            const result = await AnalyticsService.getPostImpressionsTimeline(
                userId,
                days,
                postId
            );

            ResponseUtil.success(
                res,
                result,
                'Impressions timeline fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get impressions timeline failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    static async getPostImpressionStats(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { postId } = req.params;

            const result = await AnalyticsService.getPostImpressionStats(
                userId,
                postId
            );

            ResponseUtil.success(
                res,
                result,
                'Post impression stats fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get post impression stats failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }


    /**
 * ✅ RECORD CLICK
 */
    static async recordClick(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const clickerId = req.user.userId;
            const { targetUserId, clickType, targetUrl, postId } = req.body;

            if (!targetUserId || !clickType) {
                ResponseUtil.validationError(
                    res,
                    ['targetUserId and clickType are required'],
                    'Validation failed'
                );
                return;
            }



        // ✅ NEW: Apna khud ka click count nahi karna (jaise LinkedIn)
        if (clickerId === targetUserId) {
            ResponseUtil.success(res, null, 'Self-click not recorded');
            return;
        }

        const validClickTypes = ['profile_link', 'external_link', 'post_link', 'image', 'video', 'document', 'document_download'];
if (!validClickTypes.includes(clickType)) {
    ResponseUtil.validationError(res, ['Invalid clickType'], 'Validation failed');
    return;
}
        

            await AnalyticsService.recordClick(targetUserId, {
                clickType,
                targetUrl,
                postId,
                clickerId,
                referrer: req.headers.referer,
                userAgent: req.headers['user-agent']
            });

            ResponseUtil.success(
                res,
                { recorded: true },
                'Click recorded successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Record click failed', {
                error: error.message,
                correlationId
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RECORD SHARE
     */
    static async recordShare(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const sharerId = req.user.userId;
            const { postOwnerId, postId, shareType } = req.body;

            if (!postOwnerId || !postId || !shareType) {
                ResponseUtil.validationError(
                    res,
                    ['postOwnerId, postId, and shareType are required'],
                    'Validation failed'
                );
                return;
            }

            if (sharerId === postOwnerId) {
                ResponseUtil.success(res, null, 'Self-share not recorded');
                return;
            }

            await AnalyticsService.recordShare(postOwnerId, {
                postId,
                shareType,
                sharerId
            });

            ResponseUtil.success(
                res,
                { recorded: true },
                'Share recorded successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Record share failed', {
                error: error.message,
                correlationId
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RECORD UNIQUE VISITOR
     */
    static async recordUniqueVisitor(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const visitorId = req.user.userId;
            const { profileOwnerId, pageUrl, duration } = req.body;

            if (!profileOwnerId) {
                ResponseUtil.validationError(
                    res,
                    ['profileOwnerId is required'],
                    'Validation failed'
                );
                return;
            }


            if (visitorId === profileOwnerId) {
                ResponseUtil.success(res, null, 'Self-visit not recorded');
                return;

            }

            await AnalyticsService.recordUniqueVisitor(profileOwnerId, {
                visitorId,
                deviceFingerprint: req.headers['user-agent'],
                pageUrl,
                referrer: req.headers.referer,
                duration
            });

            ResponseUtil.success(
                res,
                { recorded: true },
                'Unique visitor recorded successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Record unique visitor failed', {
                error: error.message,
                correlationId
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
    /**
     * ✅ RECORD ENGAGEMENT (like/comment/share/save)
     * POST /api/v1/analytics/record-engagement
     */
    static async recordEngagement(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const viewerId = req.user.userId;
            const { postId, postOwnerId, engagementType } = req.body;

            if (!postId || !postOwnerId || !engagementType) {
                ResponseUtil.validationError(
                    res,
                    ['postId, postOwnerId, and engagementType are required'],
                    'Validation failed'
                );
                return;
            }

            const validTypes = ['like', 'comment', 'share', 'save'];
            if (!validTypes.includes(engagementType)) {
                ResponseUtil.validationError(
                    res,
                    ['Invalid engagementType. Must be one of: ' + validTypes.join(', ')],
                    'Validation failed'
                );
                return;
            }

            // Don't count self-engagement
            if (viewerId === postOwnerId) {
                ResponseUtil.success(res, null, 'Self-engagement not recorded');
                return;
            }

            LoggerUtil.info('Recording engagement', {
                viewerId,
                postOwnerId,
                postId,
                engagementType,
                correlationId,
            });

            await AnalyticsService.recordEngagement(postOwnerId, {
                postId,
                viewerId,
                engagementType,
            });

            ResponseUtil.success(
                res,
                { recorded: true },
                'Engagement recorded successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Record engagement failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    

    /**
     * ✅ GET CLICKS COUNT
     */
    static async getClicksCount(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = req.query.days ? parseInt(req.query.days as string) : undefined;

            const result = await AnalyticsService.getClicksCount(userId, days);

            ResponseUtil.success(
                res,
                result,
                'Clicks count fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get clicks count failed', {
                error: error.message,
                correlationId
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET SHARES COUNT
     */
    static async getSharesCount(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = req.query.days ? parseInt(req.query.days as string) : undefined;

            const result = await AnalyticsService.getSharesCount(userId, days);

            ResponseUtil.success(
                res,
                result,
                'Shares count fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get shares count failed', {
                error: error.message,
                correlationId
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET UNIQUE VISITORS COUNT
     */
    static async getUniqueVisitorsCount(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = req.query.days ? parseInt(req.query.days as string) : undefined;

            const result = await AnalyticsService.getUniqueVisitorsCount(userId, days);

            ResponseUtil.success(
                res,
                result,
                'Unique visitors count fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get unique visitors count failed', {
                error: error.message,
                correlationId
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET PROFILE VIEWS TREND WITH CHANGE
     */
    static async getProfileViewsTrendWithChange(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = parseInt(req.query.days as string) || 30;

            const result = await AnalyticsService.getProfileViewsTrendWithChange(userId, days);

            ResponseUtil.success(
                res,
                result,
                'Profile views trend fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get profile views trend failed', {
                error: error.message,
                correlationId
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET SEARCH APPEARANCES WITH HIGHLIGHTS
     */
    static async getSearchAppearancesWithHighlights(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;

            const result = await AnalyticsService.getSearchAppearancesWithHighlights(
                userId,
                page,
                limit
            );

            ResponseUtil.success(
                res,
                result,
                'Search appearances fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get search appearances failed', {
                error: error.message,
                correlationId
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET DISCOVERY STATS
     */
    static async getDiscoveryStats(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const days = req.query.days ? parseInt(req.query.days as string) : undefined;

            const result = await AnalyticsService.getDiscoveryStats(userId, days);
            ResponseUtil.success(
                res,
                result,
                'Discovery stats fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get discovery stats failed', {
                error: error.message,
                correlationId
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}
export default AnalyticsController;