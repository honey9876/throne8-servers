/**
 * Analytics Service - Business Logic for User Analytics
 * Handles all 15 analytics features
 * 
 * @module services/analytics.service
 * @version 1.0.0
 */

import { Analytics, User,ProfilePhoto } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import Constants from '@/shared/constants.util';
import { v4 as uuidv4 } from 'uuid';
import { emitToUser } from '@/socket/index';

// ==================== INTERFACES ====================

interface ProfileViewData {
    viewerId?: string;
    viewerName?: string;
    viewerHeadline?: string;
    viewerPhotoUrl?: string;
    ipAddress?: string;
    userAgent?: string;
}

interface PostImpressionData {
    postId: string;
    source: 'feed' | 'profile' | 'search' | 'hashtag' | 'direct';
    viewerId?: string;
    viewedAt: Date;
    engagementType?: 'like' | 'comment' | 'share' | 'save' | 'view_only' | 'impression';
}

interface SearchAppearanceData {
    searchQuery: string;
    searcherId?: string;
    searcherName?: string;        // ✅ NEW
    searcherPhotoUrl?: string;    // ✅ NEW
    appearedAt: Date;
    wasClicked: boolean;
    position?: number;
}

// ==================== ANALYTICS SERVICE ====================

class AnalyticsService {

    // ==================== 1. TOGGLE PRIVACY ====================

    /**
     * ✅ Feature 1: Private to you toggle
     */
    static async togglePrivacy(userId: string, isPrivate: boolean): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Toggle analytics privacy', {
                userId,
                isPrivate,
                correlationId,
            });

            // Find or create analytics
            let analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                analytics = new Analytics({
                    analyticsId: uuidv4(),
                    userId,
                    isPrivate,
                });
            } else {
                analytics.isPrivate = isPrivate;
            }

            await analytics.save();

            // Update user model
            await User.findOneAndUpdate(
                { userId },
                { $set: { analyticsId: analytics.analyticsId } },
                { new: true }
            );

            LoggerUtil.info('Privacy toggled successfully', {
                userId,
                isPrivate,
                correlationId,
            });

            return {
                analyticsId: analytics.analyticsId,
                isPrivate: analytics.isPrivate,
                message: isPrivate
                    ? 'Analytics are now private'
                    : 'Analytics are now visible',
            };

        } catch (error: any) {
            LoggerUtil.error('Toggle privacy failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 2. PROFILE VIEWS COUNT ====================

    /**
     * ✅ Feature 2: Get profile views count
     */
    static async getProfileViewsCount(userId: string, dateRange: number = 90): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get profile views count', {
                userId,
                dateRange,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    total: 0,
                    last7Days: 0,
                    last30Days: 0,
                    last90Days: 0,
                };
            }

            return {
                total: analytics.profileViews.total,
                last7Days: analytics.profileViews.last7Days,
                last30Days: analytics.profileViews.last30Days,
                last90Days: analytics.profileViews.last90Days,
            };

        } catch (error: any) {
            LoggerUtil.error('Get profile views count failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 3. PROFILE VIEWS DETAIL ====================

    /**
     * ✅ Feature 3: Get profile views detail (who viewed)
     */
    static async getProfileViewsDetail(
        userId: string,
        isPremium: boolean = false,
        page: number = 1,
        limit: number = 20
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get profile views detail', {
                userId,
                isPremium,
                page,
                limit,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    views: [],
                    total: 0,
                    page,
                    totalPages: 0,
                    isPremium,
                };
            }

            // Check privacy
            if (analytics.isPrivate) {
                // Only show to owner
            }

            // Sort by viewedAt descending
            const sortedViews = analytics.profileViews.views
                .sort((a, b) => b.viewedAt.getTime() - a.viewedAt.getTime());

            // Pagination
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedViews = sortedViews.slice(startIndex, endIndex);

            // Format based on premium status
            const formattedViews = paginatedViews.map(view => {
                if (isPremium) {
                    // Premium: Full viewer identity
                    return {
                        viewerId: view.viewerId,
                        viewerName: view.viewerName,
                        viewerHeadline: view.viewerHeadline,
                        viewerPhotoUrl: view.viewerPhotoUrl,
                        viewedAt: view.viewedAt,
                        isAnonymous: view.isAnonymous,
                    };
                } else {
                    // Free: Limited/anonymized data
                    return {
                        viewerId: null,
                        viewerName: view.isAnonymous ? 'Anonymous Viewer' : 'LinkedIn Member',
                        viewerHeadline: null,
                        viewerPhotoUrl: null,
                        viewedAt: view.viewedAt,
                        isAnonymous: true,
                    };
                }
            });

            const totalPages = Math.ceil(sortedViews.length / limit);

            return {
                views: formattedViews,
                total: sortedViews.length,
                page,
                limit,
                totalPages,
                isPremium,
                message: isPremium
                    ? 'Full viewer details'
                    : 'Limited viewer details (Upgrade to Premium for full access)',
            };

        } catch (error: any) {
            LoggerUtil.error('Get profile views detail failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 4. POST IMPRESSIONS COUNT ====================

    /**
     * ✅ Feature 4: Get post impressions count
     */
    static async getPostImpressionsCount(userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get post impressions count', {
                userId,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    total: 0,
                    last7Days: 0,
                    last30Days: 0,
                };
            }

            return {
                total: analytics.postImpressions.total,
                last7Days: analytics.postImpressions.last7Days,
                last30Days: analytics.postImpressions.last30Days,
            };

        } catch (error: any) {
            LoggerUtil.error('Get post impressions count failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 5. POST IMPRESSIONS DETAIL ====================

    /**
     * ✅ Feature 5: Get post impressions detail (source breakdown)
     */
    static async getPostImpressionsDetail(
        userId: string,
        page: number = 1,
        limit: number = 50
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get post impressions detail', {
                userId,
                page,
                limit,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    impressions: [],
                    sourceBreakdown: {},
                    total: 0,
                };
            }

            // Sort by viewedAt descending
            const sortedImpressions = analytics.postImpressions.impressions
                .sort((a, b) => b.viewedAt.getTime() - a.viewedAt.getTime());

            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedImpressions = sortedImpressions.slice(startIndex, endIndex);

            const enhancedImpressions = paginatedImpressions.map(imp => ({
                ...imp,
                viewFrequency: imp.viewCount || 1,
                lastViewed: imp.lastViewedAt || imp.viewedAt,
                dailyBreakdown: imp.timeBasedCounts || [],
                totalDaysViewed: imp.timeBasedCounts?.length || 1
            }));

            // Source breakdown
            const sourceBreakdown = sortedImpressions.reduce((acc: any, imp) => {
                acc[imp.source] = (acc[imp.source] || 0) + 1;
                return acc;
            }, {});

            return {
                impressions: enhancedImpressions,
                sourceBreakdown,
                total: sortedImpressions.length,
                page,
                limit,
                totalPages: Math.ceil(sortedImpressions.length / limit),
            };

        } catch (error: any) {
            LoggerUtil.error('Get post impressions detail failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 6. POST IMPRESSIONS TIMEFRAME ====================

    /**
     * ✅ Feature 6: Get post impressions for timeframe (Past 7 days)
     */
    static async getPostImpressionsByTimeframe(
        userId: string,
        days: number = 7
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get post impressions by timeframe', {
                userId,
                days,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    impressions: [],
                    total: 0,
                    timeframe: `Last ${days} days`,
                };
            }

            const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            const filteredImpressions = analytics.postImpressions.impressions.filter(
                imp => imp.viewedAt >= cutoffDate
            );

            return {
                impressions: filteredImpressions,
                total: filteredImpressions.length,
                timeframe: `Last ${days} days`,
                cutoffDate,
            };

        } catch (error: any) {
            LoggerUtil.error('Get post impressions by timeframe failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 7. SEARCH APPEARANCES COUNT ====================

    /**
     * ✅ Feature 7: Get search appearances count
     */
    static async getSearchAppearancesCount(userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get search appearances count', {
                userId,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    total: 0,
                    last7Days: 0,
                    last30Days: 0,
                };
            }

            return {
                total: analytics.searchAppearances.total,
                last7Days: analytics.searchAppearances.last7Days,
                last30Days: analytics.searchAppearances.last30Days,
            };

        } catch (error: any) {
            LoggerUtil.error('Get search appearances count failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 8. SEARCH APPEARANCES DETAIL ====================

    /**
     * ✅ Feature 8: Get search appearances detail
     */
    static async getSearchAppearancesDetail(
        userId: string,
        page: number = 1,
        limit: number = 50
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get search appearances detail', {
                userId,
                page,
                limit,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    appearances: [],
                    total: 0,
                };
            }

            // Sort by appearedAt descending
            const sortedAppearances = analytics.searchAppearances.appearances
                .sort((a, b) => b.appearedAt.getTime() - a.appearedAt.getTime());

            // Pagination
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedAppearances = sortedAppearances.slice(startIndex, endIndex);

            return {
                appearances: paginatedAppearances,
                total: sortedAppearances.length,
                page,
                limit,
                totalPages: Math.ceil(sortedAppearances.length / limit),
            };

        } catch (error: any) {
            LoggerUtil.error('Get search appearances detail failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 9. ALL ANALYTICS SUMMARY ====================

    /**
     * ✅ Feature 9: Get all analytics summary
     */
    static async getAllAnalytics(userId: string, dateRange: number = 30): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get all analytics', {
                userId,
                dateRange,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    profileViews: { total: 0, last7Days: 0, last30Days: 0, last90Days: 0 },
                    postImpressions: { total: 0, last7Days: 0, last30Days: 0 },
                    searchAppearances: { total: 0, last7Days: 0, last30Days: 0 },
                    demographics: null,
                    isPrivate: false,
                };
            }

            return {
                analyticsId: analytics.analyticsId,
                isPrivate: analytics.isPrivate,
                profileViews: {
                    total: analytics.profileViews.total,
                    last7Days: analytics.profileViews.last7Days,
                    last30Days: analytics.profileViews.last30Days,
                    last90Days: analytics.profileViews.last90Days,
                },
                postImpressions: {
                    total: analytics.postImpressions.total,
                    last7Days: analytics.postImpressions.last7Days,
                    last30Days: analytics.postImpressions.last30Days,
                },
                searchAppearances: {
                    total: analytics.searchAppearances.total,
                    last7Days: analytics.searchAppearances.last7Days,
                    last30Days: analytics.searchAppearances.last30Days,
                    topKeywords: analytics.searchAppearances.topKeywords,
                },
                demographics: analytics.demographics,
                lastCalculatedAt: analytics.lastCalculatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all analytics failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 10. WHO VIEWED YOUR PROFILE ====================

    /**
     * ✅ Feature 10: Get list of who viewed your profile
     */
    static async getProfileViewersList(
        userId: string,
        isPremium: boolean = false,
        page: number = 1,
        limit: number = 20
    ): Promise<any> {
        // Same as Feature 3 - getProfileViewsDetail
        return this.getProfileViewsDetail(userId, isPremium, page, limit);
    }

    // ==================== 11. VIEWER DEMOGRAPHICS ====================

    /**
     * ✅ Feature 11: Get viewer demographics (aggregated)
     */
    static async getViewerDemographics(userId: string): Promise<any> {
        const correlationId = uuidv4();
        const MIN_SAMPLE_SIZE = 5; // ✅ NEW: jab tak kam se kam 5 unique data points na ho, % misleading hota hai


        try {
            LoggerUtil.info('Get viewer demographics', {
                userId,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    locations: [],
                    jobTitles: [],
                    industries: [],
                    experienceLevels: [],
                    hasEnoughData: false, // ✅ NEW

                };
            }

            // ✅ NEW: helper — count ko percentage me convert karo, total ke against
        const withPercentage = (arr: { count: number;[key: string]: any }[], total: number) =>
            arr.map(item => ({
                ...item,
                percentage: total > 0 ? Math.round((item.count / total) * 100) : 0,
            }));

        const totalLocations = analytics.demographics.locations.reduce((s, l) => s + l.count, 0);
        const totalJobTitles = analytics.demographics.jobTitles.reduce((s, j) => s + j.count, 0);
        const totalIndustries = analytics.demographics.industries.reduce((s, i) => s + i.count, 0);

            return {
                // locations: analytics.demographics.locations
                //     .sort((a, b) => b.count - a.count)
                //     .slice(0, 10),  // Top 10
                // jobTitles: analytics.demographics.jobTitles
                //     .sort((a, b) => b.count - a.count)
                //     .slice(0, 10),
                // industries: analytics.demographics.industries
                //     .sort((a, b) => b.count - a.count)
                //     .slice(0, 10),
                // experienceLevels: analytics.demographics.experienceLevels
                //     .sort((a, b) => b.count - a.count),


                locations: withPercentage(
                    analytics.demographics.locations.sort((a, b) => b.count - a.count).slice(0, 10),
                    totalLocations
                ),
                jobTitles: withPercentage(
                    analytics.demographics.jobTitles.sort((a, b) => b.count - a.count).slice(0, 10),
                    totalJobTitles
                ),
                industries: withPercentage(
                    analytics.demographics.industries.sort((a, b) => b.count - a.count).slice(0, 10),
                    totalIndustries
                ),
                experienceLevels: analytics.demographics.experienceLevels
                    .sort((a, b) => b.count - a.count),

                    // ✅ NEW: frontend ko bata do ki data reliable hai ya nahi
            hasEnoughData: totalLocations >= MIN_SAMPLE_SIZE,
            };

        } catch (error: any) {
            LoggerUtil.error('Get viewer demographics failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 12. SEARCH KEYWORDS USED ====================

    /**
     * ✅ Feature 12: Get search keywords used to find you
     */
    static async getSearchKeywords(userId: string, limit: number = 10): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get search keywords', {
                userId,
                limit,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    topKeywords: [],
                    total: 0,
                };
            }

            const topKeywords = analytics.searchAppearances.topKeywords
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);

            return {
                topKeywords,
                total: topKeywords.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get search keywords failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 13. ANALYTICS DATE RANGE ====================

    /**
     * ✅ Feature 13: Get analytics for custom date range
     */
    static async getAnalyticsByDateRange(
        userId: string,
        startDate: Date,
        endDate: Date
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get analytics by date range', {
                userId,
                startDate,
                endDate,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    profileViews: [],
                    postImpressions: [],
                    searchAppearances: [],
                    startDate,
                    endDate,
                };
            }

            const profileViews = analytics.profileViews.views.filter(
                v => v.viewedAt >= startDate && v.viewedAt <= endDate
            );

            const postImpressions = analytics.postImpressions.impressions.filter(
                i => i.viewedAt >= startDate && i.viewedAt <= endDate
            );

    

            const searchAppearances = analytics.searchAppearances.appearances.filter(
                a => a.appearedAt >= startDate && a.appearedAt <= endDate
            );

            return {
                profileViews: {
                    data: profileViews,
                    count: profileViews.length,
                },
                postImpressions: {
                    data: postImpressions,
                    count: postImpressions.length,
                },
                searchAppearances: {
                    data: searchAppearances,
                    count: searchAppearances.length,
                },
                dateRange: {
                    startDate,
                    endDate,
                    days: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Get analytics by date range failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 14. EXPORT ANALYTICS ====================

    /**
     * ✅ Feature 14: Export analytics (CSV/Excel format)
     */
    static async exportAnalytics(
        userId: string,
        format: 'csv' | 'excel' = 'csv'
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Export analytics', {
                userId,
                format,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                throw new Error('No analytics data found');
            }

            // Prepare data for export
            const exportData = {
                summary: {
                    totalProfileViews: analytics.profileViews.total,
                    totalPostImpressions: analytics.postImpressions.total,
                    totalSearchAppearances: analytics.searchAppearances.total,
                    exportedAt: new Date().toISOString(),
                },
                profileViews: analytics.profileViews.views.map(v => ({
                    viewerName: v.viewerName || 'Anonymous',
                    viewedAt: v.viewedAt,
                    isAnonymous: v.isAnonymous,
                })),
                postImpressions: analytics.postImpressions.impressions.map(i => ({
                    postId: i.postId,
                    source: i.source,
                    viewedAt: i.viewedAt,
                    engagementType: i.engagementType || 'view_only',
                })),
                searchAppearances: analytics.searchAppearances.appearances.map(a => ({
                    searchQuery: a.searchQuery,
                    appearedAt: a.appearedAt,
                    wasClicked: a.wasClicked,
                    position: a.position,
                })),
                demographics: analytics.demographics,
            };

            LoggerUtil.info('Analytics exported successfully', {
                userId,
                format,
                correlationId,
            });

            return {
                data: exportData,
                format,
                exportedAt: new Date(),
                message: `Analytics exported in ${format.toUpperCase()} format`,
            };

        } catch (error: any) {
            LoggerUtil.error('Export analytics failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== 15. ANALYTICS GRAPHS/CHARTS DATA ====================

    /**
     * ✅ Feature 15: Get analytics data for graphs/charts
     */
    static async getAnalyticsGraphData(userId: string, days: number = 30): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get analytics graph data', {
                userId,
                days,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    profileViewsTimeline: [],
                    postImpressionsTimeline: [],
                    searchAppearancesTimeline: [],
                };
            }

            const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            // Group by date
            const groupByDate = (items: any[], dateField: string) => {
                const grouped: { [key: string]: number } = {};

                items.forEach(item => {
                    const date = new Date(item[dateField]);
                    if (date >= cutoffDate) {
                        const dateKey = date.toISOString().split('T')[0];
                        grouped[dateKey] = (grouped[dateKey] || 0) + 1;
                    }
                });

                return Object.entries(grouped)
                    .map(([date, count]) => ({ date, count }))
                    .sort((a, b) => a.date.localeCompare(b.date));
            };

            const profileViewsTimeline = groupByDate(analytics.profileViews.views, 'viewedAt');
            const postImpressionsTimeline = groupByDate(analytics.postImpressions.impressions, 'viewedAt');
            const searchAppearancesTimeline = groupByDate(analytics.searchAppearances.appearances, 'appearedAt');

            return {
                profileViewsTimeline,
                postImpressionsTimeline,
                searchAppearancesTimeline,
                dateRange: {
                    startDate: cutoffDate,
                    endDate: new Date(),
                    days,
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Get analytics graph data failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== HELPER METHODS ====================

    /**
     * Record profile view (called from profile route middleware)
     */
    static async recordProfileView(
        profileOwnerId: string,
        viewerData: ProfileViewData
    ): Promise<void> {
        try {
            // Don't count if viewer is the profile owner
            if (viewerData.viewerId === profileOwnerId) {
                return;
            }
    
            // ✅ NEW: Viewer ka demographic data fetch karke Analytics.demographics me record karo
            if (viewerData.viewerId) {
                try {
                    const viewer = await User.findOne({ userId: viewerData.viewerId });
                    if (viewer) {
                        await AnalyticsService.recordDemographic(profileOwnerId, {
                            location: (viewer as any).location,
                            jobTitle: (viewer as any).currentPosition,
                            industry: (viewer as any).demographics?.industry,
                        });
                    }
                } catch (demoError: any) {
                    LoggerUtil.warn('Demographic enrichment failed', {
                        error: demoError.message,
                        profileOwnerId,
                    });
                    // Don't throw - non-critical
                }
            }
    
            await Analytics.recordProfileView(profileOwnerId, viewerData);
    
            // ✅ NEW: Emit real-time update to profile owner
            emitToUser(profileOwnerId, 'analytics:profile-view', {
                type: 'profile-view',
                timestamp: new Date(),
            });
    
        } catch (error: any) {
            LoggerUtil.error('Record profile view failed', {
                error: error.message,
                profileOwnerId,
            });
            // Don't throw - this is non-critical
        }
    }
    
    /**
     * ✅ NEW: Record viewer demographic (location/jobTitle/industry) — aggregated count
     */
    static async recordDemographic(
        userId: string,
        data: { location?: string; jobTitle?: string; industry?: string }
    ): Promise<void> {
        try {
            let analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                analytics = new Analytics({ analyticsId: uuidv4(), userId });
            }
    
            const bump = (arr: any[], key: string, value?: string) => {
                if (!value) return;
                const existing = arr.find((x: any) => x[key] === value);
                if (existing) {
                    existing.count++;
                } else {
                    arr.push({ [key]: value, count: 1 });
                }
            };
    
            bump(analytics.demographics.locations, 'location', data.location);
            bump(analytics.demographics.jobTitles, 'title', data.jobTitle);
            bump(analytics.demographics.industries, 'industry', data.industry);
    
            await analytics.save();
        } catch (error: any) {
            LoggerUtil.error('Record demographic failed', {
                error: error.message,
                userId,
            });
            // Don't throw - non-critical
        }
    }

    /**
     * Record post impression
     */
    // static async recordPostImpression(
    //     postOwnerId: string,
    //     impressionData: PostImpressionData
    // ): Promise<void> {
    //     try {
    //         await Analytics.recordPostImpression(postOwnerId, impressionData);

    //     } catch (error: any) {
    //         LoggerUtil.error('Record post impression failed', {
    //             error: error.message,
    //             postOwnerId,
    //         });
    //         // Don't throw - this is non-critical
    //     }
    // }

    
    /**
 * Record search appearance
 */
    // static async recordSearchAppearance(
    //     userId: string,
    //     searchData: SearchAppearanceData
    // ): Promise<void> {
    //     try {
    //         let enrichedData = { ...searchData };
    
    //         if (searchData.searcherId) {
    //             try {
    //                 const searcherUser = await User.findOne({ userId: searchData.searcherId });
    //                 if (searcherUser) {
    //                     enrichedData.searcherName =
    //                         (searcherUser as any).fullName ||
    //                         `${(searcherUser as any).firstName || ''} ${(searcherUser as any).lastName || ''}`.trim() ||
    //                         undefined;
    
    //                     const photoId = (searcherUser as any).profilePhotoId;
    //                     if (photoId) {
    //                         const photo = await ProfilePhoto.findOne({ photoId });
    //                         enrichedData.searcherPhotoUrl = (photo as any)?.cloudinarySecureUrl || undefined;
    //                     }
    //                 }
    //             } catch (lookupError: any) {
    //                 LoggerUtil.warn('Failed to fetch searcher details for search appearance', {
    //                     error: lookupError.message,
    //                     searcherId: searchData.searcherId,
    //                 });
    //             }
    //         }
    
    //         await Analytics.recordSearchAppearance(userId, enrichedData);
    
    //         emitToUser(userId, 'analytics:search-appearance', {
    //             type: 'search-appearance',
    //             searchQuery: searchData.searchQuery,
    //             searcherName: enrichedData.searcherName,
    //             timestamp: new Date(),
    //         });
    
    //     } catch (error: any) {
    //         LoggerUtil.error('Record search appearance failed', {
    //             error: error.message,
    //             userId,
    //         });
    //     }
    // }
    static async recordSearchAppearance(
        userId: string,
        searchData: SearchAppearanceData
    ): Promise<void> {
        try {
            // ✅ FIX: searcherName/searcherPhotoUrl ko write-time pe snapshot nahi karte —
            // sync-lag ki wajah se naam permanently missing save ho sakta tha ("LinkedIn Member" bug).
            // Sirf searcherId store karo; naam read-time pe live lookup se nikalega (getSearchAppearancesWithHighlights).
            await Analytics.recordSearchAppearance(userId, searchData);
    
            emitToUser(userId, 'analytics:search-appearance', {
                type: 'search-appearance',
                searchQuery: searchData.searchQuery,
                searcherId: searchData.searcherId,
                timestamp: new Date(),
            });
    
        } catch (error: any) {
            LoggerUtil.error('Record search appearance failed', {
                error: error.message,
                userId,
            });
        }
    }


    /**
    * ✅ NEW: Record post impression (called from feed/profile middleware)
    */
    static async recordPostImpression(
        postOwnerId: string,
        impressionData: {
            postId: string;
            source: 'feed' | 'profile' | 'search' | 'hashtag' | 'repost' | 'direct';
            viewerId?: string;
            deviceType?: 'mobile' | 'desktop' | 'tablet';
            sessionId?: string;
            scrollDepth?: number;
            viewDuration?: number;
        }
    ): Promise<void> {
        try {
            LoggerUtil.info('Recording post impression', {
                postOwnerId,
                postId: impressionData.postId,
                source: impressionData.source,
            });

            let analytics = await Analytics.findOne({ userId: postOwnerId });

            if (!analytics) {
                analytics = new Analytics({
                    analyticsId: uuidv4(),
                    userId: postOwnerId,
                });
            }

            // ✅ ADD IMPRESSION
            analytics.postImpressions.impressions.push({
                postId: impressionData.postId,
                source: impressionData.source,
                viewerId: impressionData.viewerId || undefined,
                viewedAt: new Date(),
                engagementType: 'impression',
                deviceType: impressionData.deviceType,
                sessionId: impressionData.sessionId,
                scrollDepth: impressionData.scrollDepth,
                viewDuration: impressionData.viewDuration,
            } as any);

            analytics.postImpressions.total++;

            await analytics.save();


             // ✅ NEW: Emit real-time update
             emitToUser(postOwnerId, 'analytics:post-impression', {
                type: 'post-impression',
                postId: impressionData.postId,
                timestamp: new Date(),
            });


            LoggerUtil.info('Post impression recorded', {
                postOwnerId,
                postId: impressionData.postId,
            });
        } catch (error: any) {
            LoggerUtil.error('Record post impression failed', {
                error: error.message,
                postOwnerId,
            });
            // Don't throw - this is non-critical
        }
    }

    /**
     * ✅ NEW: Get post impressions by date range
     */
    static async getPostImpressionsByDateRange(
        userId: string,
        startDate: Date,
        endDate: Date,
        postId?: string  // Optional: filter by specific post
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get post impressions by date range', {
                userId,
                startDate,
                endDate,
                postId,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    impressions: [],
                    totalCount: 0,
                    dateRange: { startDate, endDate },
                };
            }

            // ✅ FILTER IMPRESSIONS
            let filteredImpressions = analytics.postImpressions.impressions.filter(
                i => i.viewedAt >= startDate && i.viewedAt <= endDate
            );

            // ✅ OPTIONAL: Filter by postId
            if (postId) {
                filteredImpressions = filteredImpressions.filter(i => i.postId === postId);
            }

            // ✅ GROUP BY DATE
            const dailyBreakdown = filteredImpressions.reduce((acc: any, imp) => {
                const date = imp.viewedAt.toISOString().split('T')[0];
                if (!acc[date]) {
                    acc[date] = { date, count: 0, sources: {} };
                }
                acc[date].count++;
                acc[date].sources[imp.source] = (acc[date].sources[imp.source] || 0) + 1;
                return acc;
            }, {});

            // ✅ SOURCE BREAKDOWN
            const sourceBreakdown = filteredImpressions.reduce((acc: any, imp) => {
                acc[imp.source] = (acc[imp.source] || 0) + 1;
                return acc;
            }, {});

            return {
                impressions: filteredImpressions,
                totalCount: filteredImpressions.length,
                dailyBreakdown: Object.values(dailyBreakdown),
                sourceBreakdown,
                dateRange: { startDate, endDate },
            };
        } catch (error: any) {
            LoggerUtil.error('Get post impressions by date range failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ NEW: Get impressions for specific post with analytics
     */
    static async getPostAnalytics(
        userId: string,
        postId: string,
        days: number = 30
    ): Promise<any> {
        try {
            const analytics = await Analytics.findOne({ userId });
    
            if (!analytics) {
                return {
                    postId,
                    totalImpressions: 0,
                    dailyImpressions: [],
                    sourceBreakdown: {},
                    engagement: {
                        views: 0,
                        likes: 0,
                        comments: 0,
                        shares: 0,
                        saves: 0,
                    },
                };
            }
    
            const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
            const postImpressions = analytics.postImpressions.impressions.filter(
                i => i.postId === postId && i.viewedAt >= cutoffDate
            );
    
            // ✅ NEW: total VIEW EVENTS count karo (repeat views included via viewCount),
            // na ki sirf unique-viewer entries. Har impression ka apna viewCount hota
            // hai (default 1, aur 10+ min baad dobara dekhne pe increment hota hai) —
            // isse denominator realistic rehta hai aur engagement % genuinely <=100% ke
            // range mein aata hai.
            const totalViewCount = postImpressions.reduce(
                (sum, imp: any) => sum + (imp.viewCount || 1),
                0
            );
    
            const postShares = (analytics.shares?.shares || []).filter(
                (s: any) => s.postId === postId && s.sharedAt >= cutoffDate
            );
    
            const dailyBreakdown = postImpressions.reduce((acc: any, imp) => {
                const date = imp.viewedAt.toISOString().split('T')[0];
                if (!acc[date]) {
                    acc[date] = { date, count: 0 };
                }
                acc[date].count++;
                return acc;
            }, {});
    
            const sourceBreakdown = postImpressions.reduce((acc: any, imp) => {
                acc[imp.source] = (acc[imp.source] || 0) + 1;
                return acc;
            }, {});
    
            const engagementBreakdown = postImpressions.reduce((acc: any, imp: any) => {
                const types: string[] = (imp.engagementTypes && imp.engagementTypes.length > 0)
                    ? imp.engagementTypes
                    : (imp.engagementType && !['view_only', 'impression'].includes(imp.engagementType)
                        ? [imp.engagementType]
                        : []);
                types.forEach(t => {
                    acc[t] = (acc[t] || 0) + 1;
                });
                return acc;
            }, { views: totalViewCount }); // ✅ CHANGED: postImpressions.length → totalViewCount
    
            return {
                postId,
                totalImpressions: totalViewCount,   // ✅ CHANGED
                dailyImpressions: Object.values(dailyBreakdown).sort((a: any, b: any) =>
                    a.date.localeCompare(b.date)
                ),
                sourceBreakdown,
                engagement: {
                    views: totalViewCount,          // ✅ CHANGED
                    likes: engagementBreakdown.like || 0,
                    comments: engagementBreakdown.comment || 0,
                    shares: postShares.length,
                    saves: engagementBreakdown.save || 0,
                },
                timeRange: {
                    startDate: cutoffDate,
                    endDate: new Date(),
                    days,
                },
            };
        } catch (error: any) {
            LoggerUtil.error('Get post analytics failed', {
                error: error.message,
                userId,
                postId,
            });
            throw error;
        }
    }

    /**
     * ✅ Feature 1: Get profile views trend graph data
     * Returns daily/weekly breakdown of profile views
     */
    static async getProfileViewsTrend(
        userId: string,
        days: number = 30,
        groupBy: 'day' | 'week' | 'month' = 'day'
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get profile views trend', {
                userId,
                days,
                groupBy,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    trend: [],
                    totalViews: 0,
                    timeRange: { days, groupBy },
                };
            }

            const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            // ✅ FILTER VIEWS BY DATE
            const filteredViews = analytics.profileViews.views.filter(
                v => v.viewedAt >= cutoffDate
            );

           // ✅ FIX: UTC ki jagah IST (India timezone, UTC+5:30) mein date group karo,
            // taaki graph aur "Who Viewed" list ke dates match karein (dono IST mein consistent ho)
            const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

            const toISTDateKey = (utcDate: Date): string => {
                const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);
                return istDate.toISOString().split('T')[0]; // YYYY-MM-DD in IST
            };

            // ✅ GROUP BY TIME PERIOD
            const trendData = filteredViews.reduce((acc: any, view) => {
                let key: string;
                const date = new Date(view.viewedAt);

                if (groupBy === 'day') {
                    key = toISTDateKey(date); // ✅ FIX: IST date, UTC nahi
                } else if (groupBy === 'week') {
                    const istDate = new Date(date.getTime() + IST_OFFSET_MS);
                    const weekStart = new Date(istDate);
                    weekStart.setUTCDate(istDate.getUTCDate() - istDate.getUTCDay());
                    key = weekStart.toISOString().split('T')[0];
                } else { // month
                    const istDate = new Date(date.getTime() + IST_OFFSET_MS);
                    key = `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}`;
                }

                if (!acc[key]) {
                    acc[key] = { date: key, views: 0, uniqueViewers: new Set() };
                }

                acc[key].views++;
                if (view.viewerId) {
                    acc[key].uniqueViewers.add(view.viewerId);
                }

                return acc;
            }, {});

            // ✅ FORMAT RESPONSE
            const trend = Object.values(trendData)
                .map((item: any) => ({
                    date: item.date,
                    views: item.views,
                    uniqueViewers: item.uniqueViewers.size,
                }))
                .sort((a, b) => a.date.localeCompare(b.date));

            return {
                trend,
                totalViews: filteredViews.length,
                timeRange: {
                    startDate: cutoffDate,
                    endDate: new Date(),
                    days,
                    groupBy,
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Get profile views trend failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== FEATURE 2: PROFILE VIEWS % CHANGE ====================

    /**
     * ✅ Feature 2: Get profile views % change vs previous period
     */
    static async getProfileViewsChange(
        userId: string,
        days: number = 30
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get profile views change', {
                userId,
                days,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    currentPeriod: { views: 0, startDate: null, endDate: null },
                    previousPeriod: { views: 0, startDate: null, endDate: null },
                    change: { absolute: 0, percentage: 0 },
                };
            }



            const now = new Date();
            const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

            // ✅ CURRENT PERIOD VIEWS
            const currentViews = analytics.profileViews.views.filter(
                v => v.viewedAt >= currentStart && v.viewedAt <= now
            );

            // ✅ PREVIOUS PERIOD VIEWS
            const previousViews = analytics.profileViews.views.filter(
                v => v.viewedAt >= previousStart && v.viewedAt < currentStart
            );

            const currentCount = currentViews.length;
            const previousCount = previousViews.length;

            // ✅ CALCULATE % CHANGE
            let percentageChange = 0;
            if (previousCount > 0) {
                percentageChange = ((currentCount - previousCount) / previousCount) * 100;
            } else if (currentCount > 0) {
                percentageChange = 100; // 100% increase if previous was 0
            }

            return {
                currentPeriod: {
                    views: currentCount,
                    startDate: currentStart,
                    endDate: now,
                },
                previousPeriod: {
                    views: previousCount,
                    startDate: previousStart,
                    endDate: currentStart,
                },
                change: {
                    absolute: currentCount - previousCount,
                    percentage: Math.round(percentageChange * 100) / 100, // 2 decimal places
                    trend: percentageChange >= 0 ? 'up' : 'down',
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Get profile views change failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }


    // ==================== NEW: POST IMPRESSIONS % CHANGE ====================

/**
 * ✅ Get post impressions % change vs previous period
 */
static async getPostImpressionsChange(
    userId: string,
    days: number = 30
): Promise<any> {
    const correlationId = uuidv4();

    try {
        LoggerUtil.info('Get post impressions change', {
            userId,
            days,
            correlationId,
        });

        const analytics = await Analytics.findOne({ userId });

        if (!analytics) {
            return {
                currentPeriod: { impressions: 0, startDate: null, endDate: null },
                previousPeriod: { impressions: 0, startDate: null, endDate: null },
                change: { absolute: 0, percentage: 0 },
            };
        }

        const now = new Date();
        const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

        const currentImpressions = analytics.postImpressions.impressions.filter(
            i => i.viewedAt >= currentStart && i.viewedAt <= now
        );

        const previousImpressions = analytics.postImpressions.impressions.filter(
            i => i.viewedAt >= previousStart && i.viewedAt < currentStart
        );

        const currentCount = currentImpressions.length;
        const previousCount = previousImpressions.length;

        let percentageChange = 0;
        if (previousCount > 0) {
            percentageChange = ((currentCount - previousCount) / previousCount) * 100;
        } else if (currentCount > 0) {
            percentageChange = 100;
        }

        return {
            currentPeriod: {
                impressions: currentCount,
                startDate: currentStart,
                endDate: now,
            },
            previousPeriod: {
                impressions: previousCount,
                startDate: previousStart,
                endDate: currentStart,
            },
            change: {
                absolute: currentCount - previousCount,
                percentage: Math.round(percentageChange * 100) / 100,
                trend: percentageChange >= 0 ? 'up' : 'down',
            },
        };

    } catch (error: any) {
        LoggerUtil.error('Get post impressions change failed', {
            error: error.message,
            userId,
            correlationId,
        });
        throw error;
    }
}

// ==================== NEW: SEARCH APPEARANCES % CHANGE ====================

/**
 * ✅ Get search appearances % change vs previous period
 */
static async getSearchAppearancesChange(
    userId: string,
    days: number = 30
): Promise<any> {
    const correlationId = uuidv4();

    try {
        LoggerUtil.info('Get search appearances change', {
            userId,
            days,
            correlationId,
        });

        const analytics = await Analytics.findOne({ userId });

        if (!analytics) {
            return {
                currentPeriod: { appearances: 0, startDate: null, endDate: null },
                previousPeriod: { appearances: 0, startDate: null, endDate: null },
                change: { absolute: 0, percentage: 0 },
            };
        }

        const now = new Date();
        const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

        const currentAppearances = analytics.searchAppearances.appearances.filter(
            a => a.appearedAt >= currentStart && a.appearedAt <= now
        );

        const previousAppearances = analytics.searchAppearances.appearances.filter(
            a => a.appearedAt >= previousStart && a.appearedAt < currentStart
        );

        const currentCount = currentAppearances.length;
        const previousCount = previousAppearances.length;

        let percentageChange = 0;
        if (previousCount > 0) {
            percentageChange = ((currentCount - previousCount) / previousCount) * 100;
        } else if (currentCount > 0) {
            percentageChange = 100;
        }

        return {
            currentPeriod: {
                appearances: currentCount,
                startDate: currentStart,
                endDate: now,
            },
            previousPeriod: {
                appearances: previousCount,
                startDate: previousStart,
                endDate: currentStart,
            },
            change: {
                absolute: currentCount - previousCount,
                percentage: Math.round(percentageChange * 100) / 100,
                trend: percentageChange >= 0 ? 'up' : 'down',
            },
        };

    } catch (error: any) {
        LoggerUtil.error('Get search appearances change failed', {
            error: error.message,
            userId,
            correlationId,
        });
        throw error;
    }
}





    // ==================== FEATURE 3: TOTAL ENGAGEMENTS ====================

    /**
     * ✅ Feature 3: Get total engagements (reactions + comments + shares + saves)
     */
    static async getTotalEngagements(
        userId: string,
        days?: number
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get total engagements', {
                userId,
                days,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    total: 0,
                    breakdown: {
                        reactions: 0,
                        comments: 0,
                        shares: 0,
                        saves: 0,
                    },
                    last7Days: 0,
                    last30Days: 0,
                    last90Days: 0,
                };
            }

            // ✅ IF DAYS PROVIDED, FILTER BY DATE
            if (days) {
                const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

                // Filter impressions by date and count engagements
                const engagedImpressions = analytics.postImpressions.impressions.filter(
                    i => i.viewedAt >= cutoffDate &&
                        i.engagementType &&
                        i.engagementType !== 'view_only' &&
                        i.engagementType !== 'impression'
                );

                const breakdown = engagedImpressions.reduce((acc: any, imp) => {
                    if (imp.engagementType === 'like') acc.reactions++;
                    else if (imp.engagementType === 'comment') acc.comments++;
                    else if (imp.engagementType === 'share') acc.shares++;
                    else if (imp.engagementType === 'save') acc.saves++;
                    return acc;
                }, { reactions: 0, comments: 0, shares: 0, saves: 0 });

                const total = breakdown.reactions + breakdown.comments + breakdown.shares + breakdown.saves;

                return {
                    total,
                    breakdown,
                    timeRange: {
                        days,
                        startDate: cutoffDate,
                        endDate: new Date(),
                    },
                };
            }

            // ✅ RETURN ALL-TIME DATA
            return {
                total: analytics.engagements.total,
                breakdown: {
                    reactions: analytics.engagements.reactions.total,
                    comments: analytics.engagements.comments.total,
                    shares: analytics.engagements.shares.total,
                    saves: analytics.engagements.saves.total,
                },
                last7Days: analytics.engagements.last7Days,
                last30Days: analytics.engagements.last30Days,
                last90Days: analytics.engagements.last90Days,
            };

        } catch (error: any) {
            LoggerUtil.error('Get total engagements failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== FEATURE 4: ENGAGEMENT TREND ====================

    /**
     * ✅ Feature 4: Get engagement trend graph data
     */
    static async getEngagementTrend(
        userId: string,
        days: number = 30,
        groupBy: 'day' | 'week' | 'month' = 'day'
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get engagement trend', {
                userId,
                days,
                groupBy,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    trend: [],
                    totalEngagements: 0,
                    timeRange: { days, groupBy },
                };
            }

            const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            // ✅ FILTER ENGAGED IMPRESSIONS
            const engagedImpressions = analytics.postImpressions.impressions.filter(
                i => i.viewedAt >= cutoffDate &&
                    i.engagementType &&
                    i.engagementType !== 'view_only' &&
                    i.engagementType !== 'impression'
            );

            // ✅ GROUP BY TIME PERIOD
            const trendData = engagedImpressions.reduce((acc: any, imp) => {
                let key: string;
                const date = new Date(imp.viewedAt);

                if (groupBy === 'day') {
                    key = date.toISOString().split('T')[0];
                } else if (groupBy === 'week') {
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    key = weekStart.toISOString().split('T')[0];
                } else {
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                }

                if (!acc[key]) {
                    acc[key] = {
                        date: key,
                        total: 0,
                        reactions: 0,
                        comments: 0,
                        shares: 0,
                        saves: 0,
                    };
                }

                acc[key].total++;
                if (imp.engagementType === 'like') acc[key].reactions++;
                else if (imp.engagementType === 'comment') acc[key].comments++;
                else if (imp.engagementType === 'share') acc[key].shares++;
                else if (imp.engagementType === 'save') acc[key].saves++;

                return acc;
            }, {});

            // ✅ FORMAT RESPONSE
            const trend = Object.values(trendData)
                .sort((a: any, b: any) => a.date.localeCompare(b.date));

            return {
                trend,
                totalEngagements: engagedImpressions.length,
                timeRange: {
                    startDate: cutoffDate,
                    endDate: new Date(),
                    days,
                    groupBy,
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Get engagement trend failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== FEATURE 5: ENGAGEMENT % CHANGE ====================

    /**
     * ✅ Feature 5: Get engagement % change vs previous period
     */
    static async getEngagementChange(
        userId: string,
        days: number = 30
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get engagement change', {
                userId,
                days,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    currentPeriod: { engagements: 0 },
                    previousPeriod: { engagements: 0 },
                    change: { absolute: 0, percentage: 0 },
                };
            }

            const now = new Date();
            const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

            // ✅ CURRENT PERIOD ENGAGEMENTS
            const currentEngagements = analytics.postImpressions.impressions.filter(
                i => i.viewedAt >= currentStart &&
                    i.viewedAt <= now &&
                    i.engagementType &&
                    i.engagementType !== 'view_only' &&
                    i.engagementType !== 'impression'
            );

            // ✅ PREVIOUS PERIOD ENGAGEMENTS
            const previousEngagements = analytics.postImpressions.impressions.filter(
                i => i.viewedAt >= previousStart &&
                    i.viewedAt < currentStart &&
                    i.engagementType &&
                    i.engagementType !== 'view_only' &&
                    i.engagementType !== 'impression'
            );

            const currentCount = currentEngagements.length;
            const previousCount = previousEngagements.length;

            // ✅ CALCULATE % CHANGE
            let percentageChange = 0;
            if (previousCount > 0) {
                percentageChange = ((currentCount - previousCount) / previousCount) * 100;
            } else if (currentCount > 0) {
                percentageChange = 100;
            }

            return {
                currentPeriod: {
                    engagements: currentCount,
                    startDate: currentStart,
                    endDate: now,
                },
                previousPeriod: {
                    engagements: previousCount,
                    startDate: previousStart,
                    endDate: currentStart,
                },
                change: {
                    absolute: currentCount - previousCount,
                    percentage: Math.round(percentageChange * 100) / 100,
                    trend: percentageChange >= 0 ? 'up' : 'down',
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Get engagement change failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== FEATURE 6: REACTIONS COUNT ====================

    /**
     * ✅ Feature 6: Get reactions/likes count with breakdown
     */
    static async getReactionsCount(
        userId: string,
        days?: number
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get reactions count', {
                userId,
                days,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    total: 0,
                    breakdown: {
                        like: 0,
                        love: 0,
                        celebrate: 0,
                        support: 0,
                        insightful: 0,
                        funny: 0,
                    },
                };
            }

            // ✅ IF DAYS PROVIDED, FILTER BY DATE
            if (days) {
                const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

                const reactions = analytics.postImpressions.impressions.filter(
                    i => i.viewedAt >= cutoffDate && i.engagementType === 'like'
                );

                // Note: For reaction type breakdown, you'll need to store reactionType in postImpressions
                // For now, return total likes
                return {
                    total: reactions.length,
                    timeRange: {
                        days,
                        startDate: cutoffDate,
                        endDate: new Date(),
                    },
                };
            }

            // ✅ RETURN ALL-TIME DATA
            return {
                total: analytics.engagements.reactions.total,
                breakdown: {
                    like: analytics.engagements.reactions.like,
                    love: analytics.engagements.reactions.love,
                    celebrate: analytics.engagements.reactions.celebrate,
                    support: analytics.engagements.reactions.support,
                    insightful: analytics.engagements.reactions.insightful,
                    funny: analytics.engagements.reactions.funny,
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Get reactions count failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== FEATURE 7: COMMENTS COUNT ====================

    /**
     * ✅ Feature 7: Get comments count
     */
    static async getCommentsCount(
        userId: string,
        days?: number
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get comments count', {
                userId,
                days,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    total: 0,
                    last7Days: 0,
                    last30Days: 0,
                };
            }

            // ✅ IF DAYS PROVIDED, FILTER BY DATE
            if (days) {
                const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

                const comments = analytics.postImpressions.impressions.filter(
                    i => i.viewedAt >= cutoffDate && i.engagementType === 'comment'
                );

                return {
                    total: comments.length,
                    timeRange: {
                        days,
                        startDate: cutoffDate,
                        endDate: new Date(),
                    },
                };
            }

            // ✅ RETURN ALL-TIME DATA
            return {
                total: analytics.engagements.comments.total,
                last7Days: analytics.engagements.comments.last7Days,
                last30Days: analytics.engagements.comments.last30Days,
            };

        } catch (error: any) {
            LoggerUtil.error('Get comments count failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== FEATURE 8: VIDEO VIEWS ====================

    /**
     * ✅ Feature 8: Get video views count and analytics
     */
    static async getVideoViews(
        userId: string,
        days?: number,
        videoId?: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get video views', {
                userId,
                days,
                videoId,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    total: 0,
                    last7Days: 0,
                    last30Days: 0,
                    videos: [],
                };
            }

            let filteredViews = analytics.videoViews.views;

            // ✅ FILTER BY DATE
            if (days) {
                const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                filteredViews = filteredViews.filter(v => v.viewedAt >= cutoffDate);
            }

            // ✅ FILTER BY VIDEO ID
            if (videoId) {
                filteredViews = filteredViews.filter(v => v.videoId === videoId);
            }

            // ✅ CALCULATE METRICS
            const totalViews = filteredViews.length;
            const averageWatchDuration = filteredViews.length > 0
                ? filteredViews.reduce((sum, v) => sum + v.watchDuration, 0) / filteredViews.length
                : 0;
            const averageCompletionRate = filteredViews.length > 0
                ? filteredViews.reduce((sum, v) => sum + v.completionRate, 0) / filteredViews.length
                : 0;

            // ✅ VIDEO-WISE BREAKDOWN
            const videoBreakdown = filteredViews.reduce((acc: any, view) => {
                if (!acc[view.videoId]) {
                    acc[view.videoId] = {
                        videoId: view.videoId,
                        views: 0,
                        totalWatchTime: 0,
                        avgCompletionRate: 0,
                    };
                }
                acc[view.videoId].views++;
                acc[view.videoId].totalWatchTime += view.watchDuration;
                return acc;
            }, {});

            // Calculate average completion rate per video
            Object.values(videoBreakdown).forEach((video: any) => {
                const videoViews = filteredViews.filter(v => v.videoId === video.videoId);
                video.avgCompletionRate = videoViews.reduce((sum, v) => sum + v.completionRate, 0) / videoViews.length;
            });

            return {
                total: totalViews,
                last7Days: analytics.videoViews.last7Days,
                last30Days: analytics.videoViews.last30Days,
                averageWatchDuration: Math.round(averageWatchDuration),
                averageCompletionRate: Math.round(averageCompletionRate * 100) / 100,
                videos: Object.values(videoBreakdown),
                timeRange: days ? {
                    days,
                    startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
                    endDate: new Date(),
                } : undefined,
            };

        } catch (error: any) {
            LoggerUtil.error('Get video views failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== FEATURE 9: NEW VS RETURNING VIEWERS ====================

    /**
     * ✅ Feature 9: Get new vs returning viewers count
     */
    static async getViewerRetention(
        userId: string,
        days: number = 30
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Get viewer retention', {
                userId,
                days,
                correlationId,
            });

            const analytics = await Analytics.findOne({ userId });

            if (!analytics) {
                return {
                    newViewers: { count: 0, percentage: 0 },
                    returningViewers: { count: 0, percentage: 0 },
                    totalViewers: 0,
                };
            }

            const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            // ✅ GET ALL VIEWS IN PERIOD
            const viewsInPeriod = analytics.profileViews.views.filter(v => v.viewedAt >= cutoffDate && v.viewerId);
            // ✅ COUNT UNIQUE VIEWERS
            const uniqueViewers = new Set(viewsInPeriod.map(v => v.viewerId));
            const totalViewers = uniqueViewers.size;

            // ✅ NEW VIEWERS (first view in this period)
            const newViewers = analytics.viewerRetention.newViewers.viewers.filter(
                v => v.firstViewAt >= cutoffDate
            );

            // ✅ RETURNING VIEWERS (viewed before this period)
            const returningViewers = analytics.viewerRetention.returningViewers.viewers.filter(
                v => v.lastViewAt >= cutoffDate && v.viewCount > 1
            );

            const newViewersCount = newViewers.length;
            const returningViewersCount = returningViewers.length;

            const newPercentage = totalViewers > 0
                ? (newViewersCount / totalViewers) * 100
                : 0;
            const returningPercentage = totalViewers > 0
                ? (returningViewersCount / totalViewers) * 100
                : 0;

            return {
                newViewers: {
                    count: newViewersCount,
                    percentage: Math.round(newPercentage * 100) / 100,
                    viewers: newViewers.map(v => ({
                        viewerId: v.viewerId,
                        firstViewAt: v.firstViewAt,
                    })),
                },
                returningViewers: {
                    count: returningViewersCount,
                    percentage: Math.round(returningPercentage * 100) / 100,
                    viewers: returningViewers.map(v => ({
                        viewerId: v.viewerId,
                        viewCount: v.viewCount,
                        lastViewAt: v.lastViewAt,
                    })),
                },
                totalViewers,
                timeRange: {
                    days,
                    startDate: cutoffDate,
                    endDate: new Date(),
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Get viewer retention failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

// ✅ NEW: negative signal config — jab post bahut kam dwell ke saath dekha
    // jaaye (matlab scroll se guzar gaya, ruka nahi), us author ke against
    // per-viewer "ignore" counter badhta hai. LinkedIn doc ka "previous
    // behaviour check" point ka simplified version.
    private static readonly IGNORE_DWELL_THRESHOLD_SECONDS = 4;
    private static readonly IGNORE_SIGNAL_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 din
    private static getIgnoreSignalKey(viewerId: string, authorId: string): string {
        return `feed:ignore:${viewerId}:${authorId}`;
    }

    // ✅ CHANGED: viewDuration accept karta hai. Ab teen jagah update hota hai:
    //   1. Analytics collection (dashboard ke liye)
    //   2. Post model ke us entry ka analytics.avgDwellTime + viewCount (feed scoring ke liye)
    //   3. ✅ NEW: Redis mein per-viewer-per-author "ignore" counter (agar dwell kam raha)
    static async recordPostImpressionSmart(
        postOwnerId: string,
        impressionData: {
            postId: string;
            source: string;
            viewerId?: string;
            sessionId?: string;
            deviceFingerprint?: string;
            viewDuration?: number; // seconds mein
        }
    ): Promise<void> {
        try {

            // Don't count if viewer is the post owner
            if (impressionData.viewerId === postOwnerId) {
                LoggerUtil.info('Impression ignored - viewer is post owner', {
                    postId: impressionData.postId,
                    postOwnerId
                });
                return;
            }
            const MIN_TIME_BETWEEN_COUNTS = 10 * 60 * 1000; // 10 minutes
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

            let analytics = await Analytics.findOne({ userId: postOwnerId });
            if (!analytics) {
                analytics = new Analytics({
                    analyticsId: uuidv4(),
                    userId: postOwnerId,
                });
            }

            // Find existing impression for this viewer + post
            const existingImpression = analytics.postImpressions.impressions.find(
                imp => imp.postId === impressionData.postId &&
                    imp.viewerId === impressionData.viewerId
            );

            const now = new Date();
            let shouldUpdatePostDwellTime = false; // sirf tabhi Post model touch karo jab naya countable view ho

            if (existingImpression) {
                if (!existingImpression.timeBasedCounts) {
                    existingImpression.timeBasedCounts = [];
                }

                const lastViewedAt = existingImpression.lastViewedAt ?? existingImpression.viewedAt;
                const currentViewCount = existingImpression.viewCount ?? 1;

                const timeSinceLastView = now.getTime() - lastViewedAt.getTime();

                if (timeSinceLastView >= MIN_TIME_BETWEEN_COUNTS) {
                    existingImpression.viewCount = currentViewCount + 1;
                    existingImpression.lastViewedAt = now;
                    if (impressionData.viewDuration !== undefined) {
                        (existingImpression as any).viewDuration = impressionData.viewDuration;
                    }
                    shouldUpdatePostDwellTime = true;

                    const todayCount = existingImpression.timeBasedCounts?.find(
                        tc => tc.date === today
                    );

                    if (todayCount) {
                        todayCount.count++;
                        todayCount.lastViewAt = now;
                    } else {
                        existingImpression.timeBasedCounts.push({
                            date: today,
                            count: 1,
                            firstViewAt: now,
                            lastViewAt: now
                        });
                    }

                    analytics.postImpressions.total++;
                } else {
                    LoggerUtil.info('Impression ignored - too soon', {
                        postId: impressionData.postId,
                        viewerId: impressionData.viewerId,
                        timeSinceLastView: `${Math.floor(timeSinceLastView / 1000)}s`
                    });
                }
            } else {
                // FIRST TIME VIEW - ALWAYS COUNT
                analytics.postImpressions.impressions.push({
                    postId: impressionData.postId,
                    source: impressionData.source,
                    viewerId: impressionData.viewerId,
                    viewedAt: now,
                    lastViewedAt: now,
                    viewCount: 1,
                    sessionId: impressionData.sessionId,
                    deviceFingerprint: impressionData.deviceFingerprint,
                    viewDuration: impressionData.viewDuration,
                    timeBasedCounts: [{
                        date: today,
                        count: 1,
                        firstViewAt: now,
                        lastViewAt: now
                    }],
                    engagementType: 'impression'
                } as any);

                analytics.postImpressions.total++;
                shouldUpdatePostDwellTime = true;
            }

            await analytics.save();

            // Post model ke us entry ka avgDwellTime/viewCount update karo
            // — feed ranking yahi se padhta hai, Analytics collection se nahi.
            if (shouldUpdatePostDwellTime && impressionData.viewDuration !== undefined) {
                try {
                    const { Post } = await import('@/shared/models/index.models');

                    const postDoc = await Post.findOne(
                        { userId: postOwnerId, 'posts.entryId': impressionData.postId },
                        { 'posts.$': 1 }
                    );

                    const targetEntry = postDoc?.posts?.[0] as any;

                    if (targetEntry) {
                        const prevAvg = targetEntry.analytics?.avgDwellTime || 0;
                        const prevCount = targetEntry.analytics?.viewCount || 0;
                        const newCount = prevCount + 1;
                        const newAvg = ((prevAvg * prevCount) + impressionData.viewDuration) / newCount;

                        await Post.updateOne(
                            { userId: postOwnerId, 'posts.entryId': impressionData.postId },
                            {
                                $set: {
                                    'posts.$.analytics.avgDwellTime': newAvg,
                                    'posts.$.analytics.viewCount': newCount,
                                },
                            }
                        );
                    }
                } catch (dwellError: any) {
                    LoggerUtil.warn('Post dwell-time update failed (non-critical)', {
                        error: dwellError.message,
                        postId: impressionData.postId,
                        postOwnerId,
                    });
                }
            }

            // ✅ NEW: negative signal — agar dwell time threshold se kam raha,
            // is author ke against viewer ka "ignore" counter badhao
            if (
                shouldUpdatePostDwellTime &&
                impressionData.viewerId &&
                impressionData.viewDuration !== undefined &&
                impressionData.viewDuration < this.IGNORE_DWELL_THRESHOLD_SECONDS
            ) {
                try {
                    const redisService = (await import('@/services/redis.service')).default;
                    const key = this.getIgnoreSignalKey(impressionData.viewerId, postOwnerId);
                    const existingRaw = await redisService.get(key);
                    const existingCount = existingRaw ? parseInt(existingRaw, 10) || 0 : 0;
                    await redisService.set(key, String(existingCount + 1), {
                        ttl: this.IGNORE_SIGNAL_TTL_SECONDS,
                    });
                } catch (ignoreError: any) {
                    LoggerUtil.warn('Ignore-signal update failed (non-critical)', {
                        error: ignoreError.message,
                        viewerId: impressionData.viewerId,
                        postOwnerId,
                    });
                }
            }

            // Emit real-time update
            emitToUser(postOwnerId, 'analytics:post-impression', {
                type: 'post-impression',
                postId: impressionData.postId,
                timestamp: new Date(),
            });

        } catch (error: any) {
            LoggerUtil.error('Smart impression recording failed', {
                error: error.message,
                postOwnerId
            });
        }
    }
 /**
     * ✅ Record Engagement (like/comment/share/save)
     * Updates existing impression's engagementType, or creates a new impression
     * entry if none exists — so getPostAnalytics can count it correctly
     *
     * ✅ CHANGED: ab viewer (jisne like/comment/share kiya) ka apna feed-cache
     * bhi clear karta hai — taaki agli baar feed load ho to naya signal
     * turant reflect ho, purane 180-second cache ka wait na karna pade.
     * (LinkedIn doc: "User interacts -> new signals -> ranking changes")
     */
    static async recordEngagement(
        postOwnerId: string,
        engagementData: {
            postId: string;
            viewerId: string;
            engagementType: 'like' | 'comment' | 'share' | 'save';
        }
    ): Promise<void> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Recording engagement', {
                postOwnerId,
                postId: engagementData.postId,
                engagementType: engagementData.engagementType,
                correlationId,
            });

            let analytics = await Analytics.findOne({ userId: postOwnerId });

            if (!analytics) {
                analytics = new Analytics({
                    analyticsId: uuidv4(),
                    userId: postOwnerId,
                });
            }

            // Same viewer + post ka existing impression dhoondo
            const existingImpression = analytics.postImpressions.impressions.find(
                imp => imp.postId === engagementData.postId && imp.viewerId === engagementData.viewerId
            );

            if (existingImpression) {
                const existing = existingImpression as any;
                if (!existing.engagementTypes) {
                    existing.engagementTypes = existing.engagementType && !['view_only', 'impression'].includes(existing.engagementType)
                        ? [existing.engagementType]
                        : [];
                }
                if (!existing.engagementTypes.includes(engagementData.engagementType)) {
                    existing.engagementTypes.push(engagementData.engagementType);
                }
                existing.engagementType = engagementData.engagementType;
            } else {
                // Agar impression exist nahi karta, naya entry banao
                analytics.postImpressions.impressions.push({
                    postId: engagementData.postId,
                    source: 'feed',
                    viewerId: engagementData.viewerId,
                    viewedAt: new Date(),
                    engagementType: engagementData.engagementType,
                } as any);
            }

            await analytics.save();

            // ✅ NEW: engagement ek positive signal hai — is author ke against
            // viewer ka "ignore" counter reset kar do (agar tha), taaki past
            // ke skips future posts ko galat penalize na karein
            try {
                const redisService = (await import('@/services/redis.service')).default;
                const ignoreKey = `feed:ignore:${engagementData.viewerId}:${postOwnerId}`;
                await redisService.set(ignoreKey, '0', { ttl: 30 * 24 * 60 * 60 });
            } catch (resetError: any) {
                LoggerUtil.warn('Ignore-signal reset failed (non-critical)', {
                    error: resetError.message,
                });
            }

            // ✅ NEW: viewer ka apna feed cache clear karo — real-time re-ranking
            try {
                const redisService = (await import('@/services/redis.service')).default;
                await redisService.deleteByPattern(`feed:v1:${engagementData.viewerId}:page:*`);
            } catch (cacheError: any) {
                LoggerUtil.warn('Feed cache invalidation failed (non-critical)', {
                    error: cacheError.message,
                    viewerId: engagementData.viewerId,
                });
            }

            emitToUser(postOwnerId, 'analytics:engagement', {
                type: 'engagement',
                postId: engagementData.postId,
                engagementType: engagementData.engagementType,
                timestamp: new Date(),
            });

            LoggerUtil.info('Engagement recorded successfully', {
                postOwnerId,
                postId: engagementData.postId,
                correlationId,
            });

        } catch (error: any) {
            LoggerUtil.error('Record engagement failed', {
                error: error.message,
                postOwnerId,
                correlationId,
            });
            // Don't throw - non-critical
        }
    }


    // Add these NEW methods:

    static async getPostImpressionsTimeline(
        userId: string,
        days: number = 30,
        postId?: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Getting impressions timeline', {
                userId,
                days,
                postId,
                correlationId
            });

            const analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                return {
                    timeline: [],
                    totalImpressions: 0,
                    uniqueViewers: 0
                };
            }

            const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

            let impressions = analytics.postImpressions.impressions;

            // Filter by postId if provided
            if (postId) {
                impressions = impressions.filter(imp => imp.postId === postId);
            }

            // Build daily timeline
            const timelineMap: { [date: string]: { count: number; viewers: Set<string>;  engagements: number } } = {};

            impressions.forEach(imp => {
                imp.timeBasedCounts?.forEach(tbc => {
                    if (tbc.date >= cutoffDateStr) {
                        if (!timelineMap[tbc.date]) {
                            timelineMap[tbc.date] = { count: 0, viewers: new Set(), engagements: 0 };
                        }
                        timelineMap[tbc.date].count += tbc.count;
                        if (imp.viewerId) {
                            timelineMap[tbc.date].viewers.add(imp.viewerId);
                        }
                          // ✅ NEW: engagement bhi count karo
                         const types = (imp.engagementTypes && imp.engagementTypes.length > 0)
                         ? imp.engagementTypes
                         : (imp.engagementType && !['view_only', 'impression'].includes(imp.engagementType) ? [imp.engagementType] : []);
                         timelineMap[tbc.date].engagements += types.length;

                    }
                });
            });

            // Convert to array and sort
            const timeline = Object.entries(timelineMap)
                .map(([date, data]) => ({
                    date,
                    impressions: data.count,
                    uniqueViewers: data.viewers.size,
                    engagements: data.engagements   // ✅ NEW

                }))
                .sort((a, b) => a.date.localeCompare(b.date));

            const totalImpressions = timeline.reduce((sum, day) => sum + day.impressions, 0);
            const allViewers = new Set<string>();
            Object.values(timelineMap).forEach(data => {
                data.viewers.forEach(v => allViewers.add(v));
            });

            return {
                timeline,
                totalImpressions,
                uniqueViewers: allViewers.size,
                dateRange: {
                    start: cutoffDateStr,
                    end: new Date().toISOString().split('T')[0],
                    days
                }
            };

        } catch (error: any) {
            LoggerUtil.error('Get impressions timeline failed', {
                error: error.message,
                userId,
                correlationId
            });
            throw error;
        }
    }

    static async getPostImpressionStats(
        userId: string,
        postId: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Getting post impression stats', {
                userId,
                postId,
                correlationId
            });

            const analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                return {
                    postId,
                    totalImpressions: 0,
                    uniqueViewers: 0,
                    avgViewsPerViewer: 0,
                    sourceBreakdown: {},
                    timeBreakdown: []
                };
            }

            

            const postImpressions = analytics.postImpressions.impressions.filter(
                imp => imp.postId === postId
            );
            
            if (postImpressions.length === 0) {
                return {
                    postId,
                    totalImpressions: 0,
                    uniqueViewers: 0,
                    avgViewsPerViewer: 0,
                    sourceBreakdown: {},
                    timeBreakdown: []
                };
            }
            
            // ✅ NEW: shares alag array mein store hote hain, isliye alag se filter karo
            const cutoffDate = new Date(0);
            const postShares = (analytics.shares?.shares || []).filter(
                (s: any) => s.postId === postId && s.sharedAt >= cutoffDate
            );

            // Calculate stats
            const uniqueViewers = new Set(
                postImpressions.map(imp => imp.viewerId).filter(Boolean)
            );

            const totalViews = postImpressions.reduce(
                (sum, imp) => sum + (imp.viewCount || 1),
                0
            );

            const sourceBreakdown = postImpressions.reduce((acc: any, imp) => {
                acc[imp.source] = (acc[imp.source] || 0) + (imp.viewCount || 1);
                return acc;
            }, {});

            // Time-based breakdown
            const timeMap: { [date: string]: number } = {};
            postImpressions.forEach(imp => {
                imp.timeBasedCounts?.forEach(tbc => {
                    timeMap[tbc.date] = (timeMap[tbc.date] || 0) + tbc.count;
                });
            });

            const timeBreakdown = Object.entries(timeMap)
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => a.date.localeCompare(b.date));

            return {
                postId,
                totalImpressions: totalViews,
                uniqueViewers: uniqueViewers.size,
                avgViewsPerViewer: uniqueViewers.size > 0
                    ? (totalViews / uniqueViewers.size).toFixed(2)
                    : 0,
                sourceBreakdown,
                shares: postShares.length,   // ← add this

                timeBreakdown,
                mostActiveViewers: this.getMostActiveViewers(postImpressions, 5)
            };

        } catch (error: any) {
            LoggerUtil.error('Get post impression stats failed', {
                error: error.message,
                userId,
                postId,
                correlationId
            });
            throw error;
        }
    }

    private static getMostActiveViewers(impressions: any[], limit: number = 5): any[] {
        const viewerCounts: { [viewerId: string]: number } = {};

        impressions.forEach(imp => {
            if (imp.viewerId) {
                viewerCounts[imp.viewerId] = (viewerCounts[imp.viewerId] || 0) + (imp.viewCount || 1);
            }
        });

        return Object.entries(viewerCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit)
            .map(([viewerId, count]) => ({ viewerId, viewCount: count }));
    }

    /**
 * ✅ Record Click
 */
    static async recordClick(
        userId: string,
        clickData: {
            clickType: string;
            targetUrl?: string;
            postId?: string;
            clickerId?: string;
            referrer?: string;
            userAgent?: string;
        }
    ): Promise<void> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Recording click', {
                userId,
                clickType: clickData.clickType,
                correlationId
            });

            let analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                analytics = new Analytics({
                    analyticsId: uuidv4(),
                    userId
                });
            }

            analytics.clicks.clicks.push({
                clickId: uuidv4(),
                clickType: clickData.clickType,
                targetUrl: clickData.targetUrl,
                postId: clickData.postId,
                clickedAt: new Date(),
                clickerId: clickData.clickerId,
                referrer: clickData.referrer,
                userAgent: clickData.userAgent
            } as any);

            analytics.clicks.total++;

            await analytics.save();


            // ✅ ADD THIS
    emitToUser(userId, 'analytics:click', {
        type: 'click',
        clickType: clickData.clickType,
        timestamp: new Date(),
    });


            LoggerUtil.info('Click recorded successfully', {
                userId,
                clickType: clickData.clickType,
                correlationId
            });

        } catch (error: any) {
            LoggerUtil.error('Record click failed', {
                error: error.message,
                userId,
                correlationId
            });
            throw error;
        }
    }

    /**
     * ✅ Record Share
     */
    static async recordShare(
        userId: string,
        shareData: {
            postId: string;
            shareType: string;
            sharerId?: string;
        }
    ): Promise<void> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Recording share', {
                userId,
                postId: shareData.postId,
                shareType: shareData.shareType,
                correlationId
            });

            let analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                analytics = new Analytics({
                    analyticsId: uuidv4(),
                    userId
                });
            }

            // ✅ DEDUPE FIX: same sharer + same post ka duplicate call
            // (double-click / race condition) rokne ke liye — agar last 5
            // second ke andar isi sharer ne isi post ko share kiya hai,
            // to naya duplicate entry skip karo
            const now = new Date();
            const isDuplicate = analytics.shares.shares.some((s: any) => {
                if (s.postId !== shareData.postId) return false;
                if (shareData.sharerId && s.sharerId !== shareData.sharerId) return false;
                const diffMs = now.getTime() - new Date(s.sharedAt).getTime();
                return diffMs < 5000;
            });

            if (isDuplicate) {
                LoggerUtil.info('Duplicate share ignored', {
                    userId,
                    postId: shareData.postId,
                    correlationId
                });
                return;
            }

            analytics.shares.shares.push({
                shareId: uuidv4(),
                postId: shareData.postId,
                shareType: shareData.shareType,
                sharedAt: now,
                sharerId: shareData.sharerId
            } as any);

            analytics.shares.total++;

            await analytics.save();

            // ✅ ADD THIS
    emitToUser(userId, 'analytics:share', {
        type: 'share',
        postId: shareData.postId,
        timestamp: new Date(),
    });

            LoggerUtil.info('Share recorded successfully', {
                userId,
                postId: shareData.postId,
                correlationId
            });

        } catch (error: any) {
            LoggerUtil.error('Record share failed', {
                error: error.message,
                userId,
                correlationId
            });
            throw error;
        }
    }

    /**
     * ✅ Record Unique Visitor
     */
    static async recordUniqueVisitor(
        userId: string,
        visitorData: {
            visitorId: string;
            deviceFingerprint?: string;
            pageUrl?: string;
            referrer?: string;
            duration?: number;
        }
    ): Promise<void> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Recording unique visitor', {
                userId,
                visitorId: visitorData.visitorId,
                correlationId
            });

            let analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                analytics = new Analytics({
                    analyticsId: uuidv4(),
                    userId
                });
            }

            // Find existing visitor
            const existingVisitor = analytics.uniqueVisitors.visitors.find(
                v => v.visitorId === visitorData.visitorId
            );

            const now = new Date();

            if (existingVisitor) {
                // Update existing visitor
                existingVisitor.lastVisit = now;
                existingVisitor.visitCount++;
                existingVisitor.visits.push({
                    visitedAt: now,
                    pageUrl: visitorData.pageUrl,
                    referrer: visitorData.referrer,
                    duration: visitorData.duration
                } as any);
            } else {
                // Add new visitor
                analytics.uniqueVisitors.visitors.push({
                    visitorId: visitorData.visitorId,
                    firstVisit: now,
                    lastVisit: now,
                    visitCount: 1,
                    deviceFingerprint: visitorData.deviceFingerprint,
                    visits: [{
                        visitedAt: now,
                        pageUrl: visitorData.pageUrl,
                        referrer: visitorData.referrer,
                        duration: visitorData.duration
                    }]
                } as any);

                analytics.uniqueVisitors.total++;
            }

            await analytics.save();

            // ✅ ADD THIS
    emitToUser(userId, 'analytics:unique-visitor', {
        type: 'unique-visitor',
        isNewVisitor: !existingVisitor,
        timestamp: new Date(),
    });


            LoggerUtil.info('Unique visitor recorded successfully', {
                userId,
                visitorId: visitorData.visitorId,
                isNewVisitor: !existingVisitor,
                correlationId
            });

        } catch (error: any) {
            LoggerUtil.error('Record unique visitor failed', {
                error: error.message,
                userId,
                correlationId
            });
            throw error;
        }
    }

    /**
     * ✅ Get Clicks Count
     */
    static async getClicksCount(userId: string, days?: number): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Getting clicks count', {
                userId,
                days,
                correlationId
            });

            const analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                return {
                    total: 0,
                    last7Days: 0,
                    last30Days: 0,
                    breakdown: {}
                };
            }

            if (days) {
                const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                const filteredClicks = analytics.clicks.clicks.filter(
                    c => c.clickedAt >= cutoffDate
                );

                const breakdown = filteredClicks.reduce((acc: any, click) => {
                    acc[click.clickType] = (acc[click.clickType] || 0) + 1;
                    return acc;
                }, {});

                return {
                    total: filteredClicks.length,
                    breakdown,
                    timeRange: { days, startDate: cutoffDate, endDate: new Date() }
                };
            }

            const breakdown = analytics.clicks.clicks.reduce((acc: any, click) => {
                acc[click.clickType] = (acc[click.clickType] || 0) + 1;
                return acc;
            }, {});

            return {
                total: analytics.clicks.total,
                last7Days: analytics.clicks.last7Days,
                last30Days: analytics.clicks.last30Days,
                breakdown
            };

        } catch (error: any) {
            LoggerUtil.error('Get clicks count failed', {
                error: error.message,
                userId,
                correlationId
            });
            throw error;
        }
    }

    /**
     * ✅ Get Shares Count
     */
    static async getSharesCount(userId: string, days?: number): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Getting shares count', {
                userId,
                days,
                correlationId
            });

            const analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                return {
                    total: 0,
                    last7Days: 0,
                    last30Days: 0,
                    breakdown: {}
                };
            }

            if (days) {
                const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                const filteredShares = analytics.shares.shares.filter(
                    s => s.sharedAt >= cutoffDate
                );

                const breakdown = filteredShares.reduce((acc: any, share) => {
                    acc[share.shareType] = (acc[share.shareType] || 0) + 1;
                    return acc;
                }, {});

                return {
                    total: filteredShares.length,
                    breakdown,
                    timeRange: { days, startDate: cutoffDate, endDate: new Date() }
                };
            }

            const breakdown = analytics.shares.shares.reduce((acc: any, share) => {
                acc[share.shareType] = (acc[share.shareType] || 0) + 1;
                return acc;
            }, {});

            return {
                total: analytics.shares.total,
                last7Days: analytics.shares.last7Days,
                last30Days: analytics.shares.last30Days,
                breakdown
            };

        } catch (error: any) {
            LoggerUtil.error('Get shares count failed', {
                error: error.message,
                userId,
                correlationId
            });
            throw error;
        }
    }

    /**
     * ✅ Get Unique Visitors Count
     */
    static async getUniqueVisitorsCount(userId: string, days?: number): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Getting unique visitors count', {
                userId,
                days,
                correlationId
            });

            const analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                return {
                    total: 0,
                    last7Days: 0,
                    last30Days: 0,
                    returning: 0,
                    new: 0
                };
            }

            if (days) {
                const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

                const activeVisitors = analytics.uniqueVisitors.visitors.filter(
                    v => v.lastVisit >= cutoffDate
                );

                const newVisitors = activeVisitors.filter(
                    v => v.firstVisit >= cutoffDate
                );

                const returningVisitors = activeVisitors.filter(
                    v => v.firstVisit < cutoffDate && v.lastVisit >= cutoffDate
                );

                return {
                    total: activeVisitors.length,
                    new: newVisitors.length,
                    returning: returningVisitors.length,
                    timeRange: { days, startDate: cutoffDate, endDate: new Date() }
                };
            }

            const newVisitors = analytics.uniqueVisitors.visitors.filter(
                v => v.visitCount === 1
            );

            const returningVisitors = analytics.uniqueVisitors.visitors.filter(
                v => v.visitCount > 1
            );

            return {
                total: analytics.uniqueVisitors.total,
                last7Days: analytics.uniqueVisitors.last7Days,
                last30Days: analytics.uniqueVisitors.last30Days,
                new: newVisitors.length,
                returning: returningVisitors.length
            };

        } catch (error: any) {
            LoggerUtil.error('Get unique visitors count failed', {
                error: error.message,
                userId,
                correlationId
            });
            throw error;
        }
    }

    /**
     * ✅ Get Profile Views Trend with % Change
     */
    static async getProfileViewsTrendWithChange(
        userId: string,
        days: number = 30
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                return {
                    trend: [],
                    percentageChange: 0,
                    currentPeriod: { views: 0 },
                    previousPeriod: { views: 0 }
                };
            }

            const now = new Date();
            const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

            // Current period views
            const currentViews = analytics.profileViews.views.filter(
                v => v.viewedAt >= currentStart && v.viewedAt <= now
            );

            // Previous period views
            const previousViews = analytics.profileViews.views.filter(
                v => v.viewedAt >= previousStart && v.viewedAt < currentStart
            );

            // Calculate % change
            const currentCount = currentViews.length;
            const previousCount = previousViews.length;

            let percentageChange = 0;
            if (previousCount > 0) {
                percentageChange = ((currentCount - previousCount) / previousCount) * 100;
            } else if (currentCount > 0) {
                percentageChange = 100;
            }

            // Build daily trend
            const trendMap: { [date: string]: number } = {};
            currentViews.forEach(v => {
                const date = v.viewedAt.toISOString().split('T')[0];
                trendMap[date] = (trendMap[date] || 0) + 1;
            });

            const trend = Object.entries(trendMap)
                .map(([date, views]) => ({ date, views }))
                .sort((a, b) => a.date.localeCompare(b.date));

            return {
                trend,
                percentageChange: Math.round(percentageChange * 100) / 100,
                currentPeriod: {
                    views: currentCount,
                    startDate: currentStart,
                    endDate: now
                },
                previousPeriod: {
                    views: previousCount,
                    startDate: previousStart,
                    endDate: currentStart
                },
                trendDirection: percentageChange >= 0 ? 'up' : 'down'
            };

        } catch (error: any) {
            LoggerUtil.error('Get profile views trend with change failed', {
                error: error.message,
                userId,
                correlationId
            });
            throw error;
        }
    }

    /**
     * ✅ Get Search Appearances with Highlighted Terms
     */


    static async getSearchAppearancesWithHighlights(
        userId: string,
        page: number = 1,
        limit: number = 50
    ): Promise<any> {
        const correlationId = uuidv4();
    
        try {
            const analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                return {
                    appearances: [],
                    total: 0,
                    topTerms: [],
                    clickThroughRate: 0
                };
            }
    
            const sortedAppearances = analytics.searchAppearances.appearances
                .sort((a, b) => b.appearedAt.getTime() - a.appearedAt.getTime());
    
            const totalAppearances = sortedAppearances.length;
            const totalClicks = sortedAppearances.filter(a => a.wasClicked).length;
            const clickThroughRate = totalAppearances > 0
                ? (totalClicks / totalAppearances) * 100
                : 0;
    
            const keywordFrequency: { [key: string]: { count: number; clicks: number } } = {};
            sortedAppearances.forEach(a => {
                const keyword = a.searchQuery.toLowerCase();
                if (!keywordFrequency[keyword]) {
                    keywordFrequency[keyword] = { count: 0, clicks: 0 };
                }
                keywordFrequency[keyword].count++;
                if (a.wasClicked) {
                    keywordFrequency[keyword].clicks++;
                }
            });
    
            const topTerms = Object.entries(keywordFrequency)
                .map(([term, data]) => ({
                    term,
                    count: data.count,
                    clicks: data.clicks,
                    ctr: data.count > 0 ? (data.clicks / data.count) * 100 : 0,
                    isHighlighted: data.clicks > data.count * 0.5
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 20);
    
            // Pagination
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedAppearances = sortedAppearances.slice(startIndex, endIndex);
    
            // Read-time enrichment: live lookup for fresh name/photo
            const uniqueSearcherIds = [
                ...new Set(
                    paginatedAppearances
                        .map((a: any) => a.searcherId)
                        .filter(Boolean)
                )
            ] as string[];
    
            let searcherUsersMap: Record<string, any> = {};
            if (uniqueSearcherIds.length > 0) {
                try {
                    const searcherUsers = await User.find({ userId: { $in: uniqueSearcherIds } });
                    searcherUsersMap = searcherUsers.reduce((acc: Record<string, any>, u: any) => {
                        acc[u.userId] = u;
                        return acc;
                    }, {});
                } catch (bulkLookupError: any) {
                    LoggerUtil.warn('Bulk searcher lookup failed', { error: bulkLookupError.message });
                }
            }
    
            const enrichedAppearances = paginatedAppearances.map((a: any) => {
                // ✅ FIX: Mongoose subdocument ko plain object me convert karo pehle,
                // warna spread ({...a}) ke through appearedAt/searchQuery jaise fields
                // correctly copy nahi hote (Mongoose getters ki wajah se)
                const plain = typeof a.toObject === 'function' ? a.toObject() : a;
            
                const u = plain.searcherId ? searcherUsersMap[plain.searcherId] : null;
                const liveName = u
                    ? (u.fullName?.trim() || `${u.firstName || ''} ${u.lastName || ''}`.trim())
                    : null;
            
                return {
                    ...plain,
                    searcherName: (liveName && liveName.length > 0) ? liveName : (plain.searcherName || undefined),
                };
            });
    
            return {
                appearances: enrichedAppearances,
                total: sortedAppearances.length,
                page,
                limit,
                totalPages: Math.ceil(sortedAppearances.length / limit),
                topTerms,
                clickThroughRate: Math.round(clickThroughRate * 100) / 100
            };
    
        } catch (error: any) {
            LoggerUtil.error('Get search appearances with highlights failed', {
                error: error.message,
                userId,
                correlationId
            });
            throw error;
        }
    }
     static async getDiscoveryStats(userId: string, days?: number): Promise<any> {
        const correlationId = uuidv4();
    
        try {
            const analytics = await Analytics.findOne({ userId });
            if (!analytics) {
                return {
                    totalImpressions: 0,
                    totalEngagements: 0,
                    membersReached: 0,
                    engagementRate: 0
                };
            }
    
            let impressions = analytics.postImpressions.impressions;
            let clicks = analytics.clicks.clicks;
            let shares = analytics.shares.shares;
    
            if (days) {
                const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                impressions = impressions.filter(i => i.viewedAt >= cutoffDate);
                clicks = clicks.filter(c => c.clickedAt >= cutoffDate);
                shares = shares.filter(s => s.sharedAt >= cutoffDate);
            }
    
            const totalImpressions = impressions.reduce(
                (sum, imp) => sum + (imp.viewCount || 1),
                0
            );
    
            // ✅ FIX: likes/comments/saves impressions array se count karo
            // 'share' ko exclude kiya kyunki wo already `shares` collection mein separately count ho raha hai
            const reactionEngagements = impressions.reduce((count: number, imp: any) => {
                const types: string[] = (imp.engagementTypes && imp.engagementTypes.length > 0)
                    ? imp.engagementTypes
                    : (imp.engagementType && !['view_only', 'impression'].includes(imp.engagementType)
                        ? [imp.engagementType]
                        : []);
                const relevantTypes = types.filter(t => ['like', 'comment', 'save'].includes(t));
                return count + relevantTypes.length;
            }, 0);
    
            const totalEngagements = clicks.length + shares.length + reactionEngagements;
    
            const uniqueViewers = new Set(impressions.map(imp => imp.viewerId).filter(Boolean));
            const membersReached = uniqueViewers.size;
    
            const engagementRate = totalImpressions > 0
                ? (totalEngagements / totalImpressions) * 100
                : 0;
    
            return {
                totalImpressions,
                totalEngagements,
                membersReached,
                engagementRate: Math.round(engagementRate * 100) / 100,
                breakdown: {
                    clicks: clicks.length,
                    shares: shares.length,
                    reactions: reactionEngagements   // ✅ naya field, debug ke liye useful
                },
                timeRange: days ? {
                    days,
                    startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
                    endDate: new Date()
                } : undefined
            };
    
        } catch (error: any) {
            LoggerUtil.error('Get discovery stats failed', {
                error: error.message,
                userId,
                correlationId
            });
            throw error;
        }
    }





}

export default AnalyticsService;