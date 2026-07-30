/**
 * Analytics Model - User Analytics & Insights
 * Tracks profile views, post impressions, search appearances
 * 
 * @module models/Analytics.model
 * @version 1.0.0
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== INTERFACES ====================

export interface IProfileView {
    viewerId?: string;              // null for anonymous
    viewerName?: string;
    viewerHeadline?: string;
    viewerPhotoUrl?: string;
    viewedAt: Date;
    isAnonymous: boolean;
    ipAddress?: string;
    userAgent?: string;
}

export interface IPostImpression {
    postId: string;
    source: 'feed' | 'profile' | 'search' | 'hashtag' | 'direct';
    viewerId?: string;
    viewedAt: Date;
    engagementType?: 'like' | 'comment' | 'share' | 'save' | 'view_only' | 'impression';

    lastViewedAt: Date,           // Track when user last viewed this post
    viewCount: number,              // How many times this post was viewed by this viewer
    sessionId: String,             // Browser session ID
    deviceFingerprint: String,     // Device identification
    timeBasedCounts?: Array<{  // ✅ Add ? for optional
        date: string;
        count: number;
        firstViewAt: Date;
        lastViewAt: Date;
    }>;
}
export interface ISearchAppearance {
    searchQuery: string;
    searcherId?: string;
    appearedAt: Date;
    wasClicked: boolean;
    position?: number;              // Position in search results
}

export interface IViewerDemographic {
    location?: string;
    jobTitle?: string;
    industry?: string;
    experienceLevel?: string;
}

export interface IAnalytics extends Document {
    analyticsId: string;
    userId: string;

    // Privacy Settings
    isPrivate: boolean;             // Private to you toggle

    // Profile Views
    profileViews: {
        total: number;
        last7Days: number;
        last30Days: number;
        last90Days: number;
        views: IProfileView[];
    };

    // Post Impressions
    postImpressions: {
        total: number;
        last7Days: number;
        last30Days: number;
        impressions: IPostImpression[];

        sessionId?: string;           // Track unique sessions
        lastViewedAt?: Date;          // For cooldown check
        viewCount: number;            // How many times this viewer saw this post
        deviceType?: 'mobile' | 'desktop' | 'tablet';
        scrollDepth?: number;
    };

    // Search Appearances
    searchAppearances: {
        total: number;
        last7Days: number;
        last30Days: number;
        appearances: ISearchAppearance[];
        topKeywords: Array<{ keyword: string; count: number }>;
    };

    // Clicks
    clicks: {
        total: number;
        last7Days: number;
        last30Days: number;
        clicks: Array<{
            clickId: string;
            clickType: 'profile_link' | 'external_link' | 'post_link' | 'image' | 'video' | 'document';
            targetUrl: string;
            postId?: string;
            clickedAt: Date;
            clickerId?: string;
            referrer?: string;
            userAgent?: string;
        }>;
    };

    // Shares
    shares: {
        total: number;
        last7Days: number;
        last30Days: number;
        shares: Array<{
            shareId: string;
            postId: string;
            shareType: 'direct' | 'linkedin' | 'twitter' | 'facebook' | 'whatsapp' | 'email' | 'copy_link';
            sharedAt: Date;
            sharerId?: string;
        }>;
    };

    // Unique Visitors
    uniqueVisitors: {
        total: number;
        last7Days: number;
        last30Days: number;
        visitors: Array<{
            visitorId: string;
            firstVisit: Date;
            lastVisit: Date;
            visitCount: number;
            deviceFingerprint?: string;
            visits: Array<{
                visitedAt: Date;
                pageUrl?: string;
                referrer?: string;
                duration?: number;  // in seconds
            }>;
        }>;
    };

    // Viewer Demographics (Aggregated)
    demographics: {
        locations: Array<{ location: string; count: number }>;
        jobTitles: Array<{ title: string; count: number }>;
        industries: Array<{ industry: string; count: number }>;
        experienceLevels: Array<{ level: string; count: number }>;
    };

    // Metadata
    lastCalculatedAt: Date;
    createdAt: Date;
    updatedAt: Date;

    engagements: {
        total: number;
        last7Days: number;
        last30Days: number;
        last90Days: number;
        reactions: {
            total: number;
            like: number;
            love: number;
            celebrate: number;
            support: number;
            insightful: number;
            funny: number;
        };
        comments: {
            total: number;
            last7Days: number;
            last30Days: number;
        };
        shares: {
            total: number;
            last7Days: number;
            last30Days: number;
        };
        saves: {
            total: number;
            last7Days: number;
            last30Days: number;
        };
    };

    // ✅ NEW: Video Analytics
    videoViews: {
        total: number;
        last7Days: number;
        last30Days: number;
        views: Array<{
            videoId: string;
            viewerId?: string;
            viewedAt: Date;
            watchDuration: number; // seconds
            completionRate: number; // 0-100%
            source: 'feed' | 'profile' | 'direct';
        }>;
    };

    // ✅ NEW: Viewer Retention
    viewerRetention: {
        newViewers: {
            last7Days: number;
            last30Days: number;
            viewers: Array<{
                viewerId: string;
                firstViewAt: Date;
            }>;
        };
        returningViewers: {
            last7Days: number;
            last30Days: number;
            viewers: Array<{
                viewerId: string;
                viewCount: number;
                lastViewAt: Date;
            }>;
        };
    };
}

export interface IAnalyticsModel extends Model<IAnalytics> {
    findByUserId(userId: string): Promise<IAnalytics | null>;
    recordProfileView(userId: string, viewerData: Partial<IProfileView>): Promise<void>;
    recordPostImpression(userId: string, impressionData: IPostImpression): Promise<void>;
    recordSearchAppearance(userId: string, searchData: ISearchAppearance): Promise<void>;
    getAnalyticsSummary(userId: string, dateRange: number): Promise<any>;
}

// ==================== SCHEMA ====================

const AnalyticsSchema = new Schema<IAnalytics, IAnalyticsModel>(
    {
        analyticsId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            index: true,
            immutable: true,
        },
        userId: {
            type: String,
            required: [true, 'User ID is required'],
            unique: true,
            // index: true,
            validate: {
                validator: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid User ID format',
            },
        },

        // ==================== PRIVACY SETTINGS ====================
        isPrivate: {
            type: Boolean,
            default: false,
            index: true,
        },

        // ==================== PROFILE VIEWS ====================
        profileViews: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            last90Days: { type: Number, default: 0 },
            views: [
                {
                    viewerId: { type: String, default: null },
                    viewerName: { type: String },
                    viewerHeadline: { type: String },
                    viewerPhotoUrl: { type: String },
                    viewedAt: { type: Date, default: Date.now },
                    isAnonymous: { type: Boolean, default: false },
                    ipAddress: { type: String },
                    userAgent: { type: String },
                }
            ]
        },

        // ==================== POST IMPRESSIONS ====================
        postImpressions: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            impressions: [
                {
                    postId: { type: String, required: true },
                    source: {
                        type: String,
                        enum: ['feed', 'profile', 'search', 'hashtag', 'repost', 'direct'],  // ✅ ADD 'repost'
                        required: true
                    },
                    viewerId: { type: String },
                    viewedAt: { type: Date, default: Date.now },
                    engagementType: {
                        type: String,
                        enum: ['like', 'comment', 'share', 'save', 'view_only', 'impression']  // ✅ ADD 'impression'
                    },
                    // ✅ ADD NEW FIELDS
                    deviceType: { type: String, enum: ['mobile', 'desktop', 'tablet'] },
                    sessionId: { type: String },  // Track unique sessions
                    scrollDepth: { type: Number },  // How much of post was visible
                    viewDuration: { type: Number }  // Time spent viewing (ms)
                }
            ]
        },

        engagements: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            last90Days: { type: Number, default: 0 },
            reactions: {
                total: { type: Number, default: 0 },
                like: { type: Number, default: 0 },
                love: { type: Number, default: 0 },
                celebrate: { type: Number, default: 0 },
                support: { type: Number, default: 0 },
                insightful: { type: Number, default: 0 },
                funny: { type: Number, default: 0 },
            },
            comments: {
                total: { type: Number, default: 0 },
                last7Days: { type: Number, default: 0 },
                last30Days: { type: Number, default: 0 },
            },
            shares: {
                total: { type: Number, default: 0 },
                last7Days: { type: Number, default: 0 },
                last30Days: { type: Number, default: 0 },
            },
            saves: {
                total: { type: Number, default: 0 },
                last7Days: { type: Number, default: 0 },
                last30Days: { type: Number, default: 0 },
            },
        },

        // ✅ NEW: Video Views
        videoViews: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            views: [
                {
                    videoId: { type: String, required: true },
                    viewerId: { type: String },
                    viewedAt: { type: Date, default: Date.now },
                    watchDuration: { type: Number, default: 0 },
                    completionRate: { type: Number, default: 0 },
                    source: {
                        type: String,
                        enum: ['feed', 'profile', 'direct'],
                        default: 'feed',
                    },
                }
            ]
        },

        // ✅ NEW: Viewer Retention
        viewerRetention: {
            newViewers: {
                last7Days: { type: Number, default: 0 },
                last30Days: { type: Number, default: 0 },
                viewers: [
                    {
                        viewerId: { type: String, required: true },
                        firstViewAt: { type: Date, default: Date.now },
                    }
                ]
            },
            returningViewers: {
                last7Days: { type: Number, default: 0 },
                last30Days: { type: Number, default: 0 },
                viewers: [
                    {
                        viewerId: { type: String, required: true },
                        viewCount: { type: Number, default: 1 },
                        lastViewAt: { type: Date, default: Date.now },
                    }
                ]
            }
        },

        // ==================== SEARCH APPEARANCES ====================
        searchAppearances: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            appearances: [
                {
                    searchQuery: { type: String, required: true },
                    searcherId: { type: String },
                    appearedAt: { type: Date, default: Date.now },
                    wasClicked: { type: Boolean, default: false },
                    position: { type: Number }
                }
            ],
            topKeywords: [
                {
                    keyword: { type: String },
                    count: { type: Number, default: 0 }
                }
            ]
        },

        clicks: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            clicks: [{
                clickId: { type: String, default: () => uuidv4() },
                clickType: {
                    type: String,
                    enum: ['profile_link', 'external_link', 'post_link', 'image', 'video', 'document'],
                    required: true
                },
                targetUrl: String,
                postId: String,
                clickedAt: { type: Date, default: Date.now },
                clickerId: String,
                referrer: String,
                userAgent: String
            }]
        },

        shares: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            shares: [{
                shareId: { type: String, default: () => uuidv4() },
                postId: { type: String, required: true },
                shareType: {
                    type: String,
                    enum: ['direct', 'linkedin', 'twitter', 'facebook', 'whatsapp', 'email', 'copy_link'],
                    required: true
                },
                sharedAt: { type: Date, default: Date.now },
                sharerId: String
            }]
        },

        uniqueVisitors: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            visitors: [{
                visitorId: { type: String, required: true },
                firstVisit: { type: Date, default: Date.now },
                lastVisit: { type: Date, default: Date.now },
                visitCount: { type: Number, default: 1 },
                deviceFingerprint: String,
                visits: [{
                    visitedAt: Date,
                    pageUrl: String,
                    referrer: String,
                    duration: Number  // in seconds
                }]
            }]
        },

        // ==================== DEMOGRAPHICS (AGGREGATED) ====================
        demographics: {
            locations: [
                {
                    location: { type: String },
                    count: { type: Number, default: 0 }
                }
            ],
            jobTitles: [
                {
                    title: { type: String },
                    count: { type: Number, default: 0 }
                }
            ],
            industries: [
                {
                    industry: { type: String },
                    count: { type: Number, default: 0 }
                }
            ],
            experienceLevels: [
                {
                    level: { type: String },
                    count: { type: Number, default: 0 }
                }
            ]
        },

        // ==================== METADATA ====================
        lastCalculatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: 'analytics',
        toJSON: {
            virtuals: true,
            transform: function (_doc, ret: any) {
                delete ret.__v;
                return ret;
            },
        },
        toObject: {
            virtuals: true,
        },
    }
);

// ==================== INDEXES ====================

// AnalyticsSchema.index({ userId: 1 }, { unique: true });
AnalyticsSchema.index({ 'profileViews.views.viewedAt': -1 });
AnalyticsSchema.index({ 'postImpressions.impressions.viewedAt': -1 });
AnalyticsSchema.index({ 'searchAppearances.appearances.appearedAt': -1 });
AnalyticsSchema.index({ lastCalculatedAt: -1 });

AnalyticsSchema.index({ 'engagements.total': -1 });
AnalyticsSchema.index({ 'videoViews.total': -1 });
AnalyticsSchema.index({ 'videoViews.views.viewedAt': -1 });
AnalyticsSchema.index({ 'viewerRetention.newViewers.viewers.firstViewAt': -1 });

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Calculate time-based aggregations
 */
AnalyticsSchema.pre('save', function (next) {
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Profile Views
    this.profileViews.last7Days = this.profileViews.views.filter(
        v => v.viewedAt >= last7Days
    ).length;

    this.profileViews.last30Days = this.profileViews.views.filter(
        v => v.viewedAt >= last30Days
    ).length;

    this.profileViews.last90Days = this.profileViews.views.filter(
        v => v.viewedAt >= last90Days
    ).length;

    // Post Impressions
    this.postImpressions.last7Days = this.postImpressions.impressions.filter(
        i => i.viewedAt >= last7Days
    ).length;

    this.postImpressions.last30Days = this.postImpressions.impressions.filter(
        i => i.viewedAt >= last30Days
    ).length;

    // Search Appearances
    this.searchAppearances.last7Days = this.searchAppearances.appearances.filter(
        a => a.appearedAt >= last7Days
    ).length;

    this.searchAppearances.last30Days = this.searchAppearances.appearances.filter(
        a => a.appearedAt >= last30Days
    ).length;

    this.lastCalculatedAt = now;

    next();
});

// ==================== STATIC METHODS ====================

/**
 * Find analytics by userId
 */
AnalyticsSchema.statics.findByUserId = async function (userId: string): Promise<IAnalytics | null> {
    try {
        return await this.findOne({ userId }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find analytics by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Record profile view
 */
AnalyticsSchema.statics.recordProfileView = async function (
    userId: string,
    viewerData: Partial<IProfileView>
): Promise<void> {
    try {
        let analytics = await this.findOne({ userId });

        if (!analytics) {
            analytics = new this({
                analyticsId: uuidv4(),
                userId,
            });
        }

        // Add view
        analytics.profileViews.views.push({
            viewerId: viewerData.viewerId || null,
            viewerName: viewerData.viewerName,
            viewerHeadline: viewerData.viewerHeadline,
            viewerPhotoUrl: viewerData.viewerPhotoUrl,
            viewedAt: new Date(),
            isAnonymous: !viewerData.viewerId,
            ipAddress: viewerData.ipAddress,
            userAgent: viewerData.userAgent,
        } as IProfileView);

        analytics.profileViews.total++;

        await analytics.save();

        LoggerUtil.info('Profile view recorded', {
            userId,
            viewerId: viewerData.viewerId,
        });
    } catch (error : any) {
        LoggerUtil.error('Record profile view failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Record post impression
 */
AnalyticsSchema.statics.recordPostImpression = async function (
    userId: string,
    impressionData: IPostImpression
): Promise<void> {
    try {
        let analytics = await this.findOne({ userId });

        if (!analytics) {
            analytics = new this({
                analyticsId: uuidv4(),
                userId,
            });
        }

        analytics.postImpressions.impressions.push({
            ...impressionData,
            viewedAt: new Date(),
        });

        analytics.postImpressions.total++;

        await analytics.save();

        LoggerUtil.info('Post impression recorded', {
            userId,
            postId: impressionData.postId,
            source: impressionData.source,
        });
    } catch (error : any) {
        LoggerUtil.error('Record post impression failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Record search appearance
 */
AnalyticsSchema.statics.recordSearchAppearance = async function (
    userId: string,
    searchData: ISearchAppearance
): Promise<void> {
    try {
        let analytics = await this.findOne({ userId });

        if (!analytics) {
            analytics = new this({
                analyticsId: uuidv4(),
                userId,
            });
        }

        analytics.searchAppearances.appearances.push({
            ...searchData,
            appearedAt: new Date(),
        });

        analytics.searchAppearances.total++;

        // Update top keywords
        const keyword = searchData.searchQuery.toLowerCase();
        const existingKeyword = analytics.searchAppearances.topKeywords.find(
            k => k.keyword === keyword
        );

        if (existingKeyword) {
            existingKeyword.count++;
        } else {
            analytics.searchAppearances.topKeywords.push({
                keyword,
                count: 1,
            });
        }

        // Sort by count descending
        analytics.searchAppearances.topKeywords.sort((a, b) => b.count - a.count);

        // Keep only top 10
        if (analytics.searchAppearances.topKeywords.length > 10) {
            analytics.searchAppearances.topKeywords = analytics.searchAppearances.topKeywords.slice(0, 10);
        }

        await analytics.save();

        LoggerUtil.info('Search appearance recorded', {
            userId,
            searchQuery: searchData.searchQuery,
        });
    } catch (error : any) {
        LoggerUtil.error('Record search appearance failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get analytics summary for date range
 */
AnalyticsSchema.statics.getAnalyticsSummary = async function (
    userId: string,
    dateRange: number = 7
): Promise<any> {
    try {
        const analytics = await this.findOne({ userId });

        if (!analytics) {
            return {
                profileViews: { total: 0, inRange: 0 },
                postImpressions: { total: 0, inRange: 0 },
                searchAppearances: { total: 0, inRange: 0 },
            };
        }

        const cutoffDate = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);

        return {
            profileViews: {
                total: analytics.profileViews.total,
                inRange: analytics.profileViews.views.filter(
                    v => v.viewedAt >= cutoffDate
                ).length,
            },
            postImpressions: {
                total: analytics.postImpressions.total,
                inRange: analytics.postImpressions.impressions.filter(
                    i => i.viewedAt >= cutoffDate
                ).length,
            },
            searchAppearances: {
                total: analytics.searchAppearances.total,
                inRange: analytics.searchAppearances.appearances.filter(
                    a => a.appearedAt >= cutoffDate
                ).length,
            },
        };
    } catch (error : any) {
        LoggerUtil.error('Get analytics summary failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const Analytics = mongoose.model<IAnalytics, IAnalyticsModel>('Analytics', AnalyticsSchema);
export default Analytics;



// 1. Core Analytics APIs

// Privacy toggle (public/private)
// Profile views count (total, 7d, 30d, 90d)
// Profile views detail (with premium/free differentiation)
// Post impressions count
// Post impressions detail
// Post impressions by timeframe
// Search appearances count
// Search appearances detail
// All analytics summary endpoint
// Analytics by custom date range
// Export analytics (CSV/Excel)
// Analytics graph data

// 2. Recording Mechanisms

// Record profile view (with viewer details)
// Record post impression (with source tracking)
// Record search appearance (with click tracking)

// 3. Data Models

// Analytics schema with all necessary fields
// Profile views storage
// Post impressions storage
// Search appearances storage
// Demographics aggregation
// Engagement tracking structure
// Video views structure
// Viewer retention structure