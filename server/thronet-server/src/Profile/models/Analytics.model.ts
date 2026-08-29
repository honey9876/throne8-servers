import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

export interface IProfileView {
    viewerId?: string;
    viewerName?: string;
    viewerHeadline?: string;
    viewerPhotoUrl?: string;
    viewedAt: Date;
    isAnonymous: boolean;
    ipAddress?: string;
    userAgent?: string;
}

export interface ITimeBasedCount {
    date: string;
    count: number;
    firstViewAt: Date;
    lastViewAt: Date;
}

export interface IPostImpression {
    postId: string;
    source: 'feed' | 'profile' | 'search' | 'hashtag' | 'repost' | 'direct';
    viewerId?: string;
    viewedAt: Date;
    engagementType?: 'like' | 'comment' | 'share' | 'save' | 'view_only' | 'impression';
    engagementTypes?: ('like' | 'comment' | 'share' | 'save')[];   // ← NEW LINE
    deviceType?: 'mobile' | 'desktop' | 'tablet';
    sessionId?: string;
    scrollDepth?: number;
    viewDuration?: number;
    lastViewedAt?: Date;
    viewCount?: number;
    deviceFingerprint?: string;
    timeBasedCounts?: ITimeBasedCount[];
}

export interface ISearchAppearance {
    searchQuery: string;
    searcherId?: string;
    searcherName?: string;        // ✅ NEW
    searcherPhotoUrl?: string;    // ✅ NEW
    appearedAt: Date;
    wasClicked: boolean;
    position?: number;
}

export interface IAnalyticsSummary {
    profileViews: { total: number; inRange: number };
    postImpressions: { total: number; inRange: number };
    searchAppearances: { total: number; inRange: number };
}

export interface IAnalytics extends Document {
    analyticsId: string;
    userId: string;
    isPrivate: boolean;
    profileViews: {
        total: number;
        last7Days: number;
        last30Days: number;
        last90Days: number;
        views: IProfileView[];
    };
    postImpressions: {
        total: number;
        last7Days: number;
        last30Days: number;
        impressions: IPostImpression[];
        sessionId?: string;
        lastViewedAt?: Date;
        viewCount: number;
        deviceType?: 'mobile' | 'desktop' | 'tablet';
        scrollDepth?: number;
    };
    searchAppearances: {
        total: number;
        last7Days: number;
        last30Days: number;
        appearances: ISearchAppearance[];
        topKeywords: Array<{ keyword: string; count: number }>;
    };
    clicks: {
        total: number;
        last7Days: number;
        last30Days: number;
        clicks: Array<{
            clickId: string;
            clickType: 'profile_link' | 'external_link' | 'post_link' | 'image' | 'video' | 'document'| 'document_download';
            targetUrl?: string;
            postId?: string;
            clickedAt: Date;
            clickerId?: string;
            referrer?: string;
            userAgent?: string;
        }>;
    };
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
                duration?: number;
            }>;
        }>;
    };
    demographics: {
        locations: Array<{ location: string; count: number }>;
        jobTitles: Array<{ title: string; count: number }>;
        industries: Array<{ industry: string; count: number }>;
        experienceLevels: Array<{ level: string; count: number }>;
    };
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
        comments: { total: number; last7Days: number; last30Days: number };
        shares: { total: number; last7Days: number; last30Days: number };
        saves: { total: number; last7Days: number; last30Days: number };
    };
    videoViews: {
        total: number;
        last7Days: number;
        last30Days: number;
        views: Array<{
            videoId: string;
            viewerId?: string;
            viewedAt: Date;
            watchDuration: number;
            completionRate: number;
            source: 'feed' | 'profile' | 'direct';
        }>;
    };
    viewerRetention: {
        newViewers: {
            last7Days: number;
            last30Days: number;
            viewers: Array<{ viewerId: string; firstViewAt: Date }>;
        };
        returningViewers: {
            last7Days: number;
            last30Days: number;
            viewers: Array<{ viewerId: string; viewCount: number; lastViewAt: Date }>;
        };
    };
    lastCalculatedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAnalyticsModel extends Model<IAnalytics> {
    findByUserId(userId: string): Promise<IAnalytics | null>;
    recordProfileView(userId: string, viewerData: Partial<IProfileView>): Promise<void>;
    recordPostImpression(userId: string, impressionData: IPostImpression): Promise<void>;
    recordSearchAppearance(userId: string, searchData: ISearchAppearance): Promise<void>;
    getAnalyticsSummary(userId: string, dateRange: number): Promise<IAnalyticsSummary>;
}

const AnalyticsSchema = new Schema<IAnalytics, IAnalyticsModel>(
    {
        analyticsId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            immutable: true,
        },
        userId: {
            type: String,
            required: [true, 'User ID is required'],
            unique: true,
            validate: {
                validator: (v: string) =>
                    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid User ID format',
            },
        },
        isPrivate: { type: Boolean, default: false },
        profileViews: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            last90Days: { type: Number, default: 0 },
            views: [{
                viewerId: { type: String, default: null },
                viewerName: String,
                viewerHeadline: String,
                viewerPhotoUrl: String,
                viewedAt: { type: Date, default: Date.now },
                isAnonymous: { type: Boolean, default: false },
                ipAddress: String,
                userAgent: String,
            }],
        },
        postImpressions: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            impressions: [{
                postId: { type: String, required: true },
                source: {
                    type: String,
                    enum: ['feed', 'profile', 'search', 'hashtag', 'repost', 'direct'],
                    required: true,
                },
                viewerId: String,
                viewedAt: { type: Date, default: Date.now },
                engagementType: {
                    type: String,
                    enum: ['like', 'comment', 'share', 'save', 'view_only', 'impression'],
                },
                engagementTypes: [{ type: String, enum: ['like', 'comment', 'share', 'save'] }],   // ← NEW LINE
                deviceType: { type: String, enum: ['mobile', 'desktop', 'tablet'] },
                sessionId: String,
                scrollDepth: Number,
                viewDuration: Number,
                lastViewedAt: { type: Date, default: Date.now },
                viewCount: { type: Number, default: 1 },
                deviceFingerprint: String,
                timeBasedCounts: [{
                    date: { type: String, required: true },
                    count: { type: Number, default: 0 },
                    firstViewAt: { type: Date, default: Date.now },
                    lastViewAt: { type: Date, default: Date.now },
                }],
            }],
            viewCount: { type: Number, default: 0 },
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
            comments: { total: { type: Number, default: 0 }, last7Days: { type: Number, default: 0 }, last30Days: { type: Number, default: 0 } },
            shares: { total: { type: Number, default: 0 }, last7Days: { type: Number, default: 0 }, last30Days: { type: Number, default: 0 } },
            saves: { total: { type: Number, default: 0 }, last7Days: { type: Number, default: 0 }, last30Days: { type: Number, default: 0 } },
        },
        videoViews: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            views: [{
                videoId: { type: String, required: true },
                viewerId: String,
                viewedAt: { type: Date, default: Date.now },
                watchDuration: { type: Number, default: 0 },
                completionRate: { type: Number, default: 0 },
                source: { type: String, enum: ['feed', 'profile', 'direct'], default: 'feed' },
            }],
        },
        viewerRetention: {
            newViewers: {
                last7Days: { type: Number, default: 0 },
                last30Days: { type: Number, default: 0 },
                viewers: [{ viewerId: { type: String, required: true }, firstViewAt: { type: Date, default: Date.now } }],
            },
            returningViewers: {
                last7Days: { type: Number, default: 0 },
                last30Days: { type: Number, default: 0 },
                viewers: [{
                    viewerId: { type: String, required: true },
                    viewCount: { type: Number, default: 1 },
                    lastViewAt: { type: Date, default: Date.now },
                }],
            },
        },
        searchAppearances: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            appearances: [{
                searchQuery: { type: String, required: true },
                searcherId: String,
                searcherName: String,        // ✅ NEW
                searcherPhotoUrl: String,    // ✅ NEW
                appearedAt: { type: Date, default: Date.now },
                wasClicked: { type: Boolean, default: false },
                position: Number,
            }],
            topKeywords: [{ keyword: String, count: { type: Number, default: 0 } }],
        },
        clicks: {
            total: { type: Number, default: 0 },
            last7Days: { type: Number, default: 0 },
            last30Days: { type: Number, default: 0 },
            clicks: [{
                clickId: { type: String, default: () => uuidv4() },
                clickType: {
                    type: String,
                    enum: ['profile_link', 'external_link', 'post_link', 'image', 'video', 'document','document_download'],
                    required: true,
                },
                targetUrl: String,
                postId: String,
                clickedAt: { type: Date, default: Date.now },
                clickerId: String,
                referrer: String,
                userAgent: String,
            }],
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
                    required: true,
                },
                sharedAt: { type: Date, default: Date.now },
                sharerId: String,
            }],
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
                    duration: Number,
                }],
            }],
        },
        demographics: {
            locations: [{ location: String, count: { type: Number, default: 0 } }],
            jobTitles: [{ title: String, count: { type: Number, default: 0 } }],
            industries: [{ industry: String, count: { type: Number, default: 0 } }],
            experienceLevels: [{ level: String, count: { type: Number, default: 0 } }],
        },
        lastCalculatedAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
        collection: 'analytics',
        toJSON: {
            virtuals: true,
            transform: (_doc, ret: Record<string, unknown>) => {
                delete ret.__v;
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);


AnalyticsSchema.index({ 'profileViews.views.viewedAt': -1 });
AnalyticsSchema.index({ 'postImpressions.impressions.viewedAt': -1 });
AnalyticsSchema.index({ 'searchAppearances.appearances.appearedAt': -1 });
AnalyticsSchema.index({ lastCalculatedAt: -1 });
AnalyticsSchema.index({ 'engagements.total': -1 });
AnalyticsSchema.index({ 'videoViews.total': -1 });
AnalyticsSchema.index({ 'videoViews.views.viewedAt': -1 });
AnalyticsSchema.index({ 'viewerRetention.newViewers.viewers.firstViewAt': -1 });

AnalyticsSchema.pre('save', function (next) {
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    this.profileViews.last7Days = this.profileViews.views.filter((v) => v.viewedAt >= d7).length;
    this.profileViews.last30Days = this.profileViews.views.filter((v) => v.viewedAt >= d30).length;
    this.profileViews.last90Days = this.profileViews.views.filter((v) => v.viewedAt >= d90).length;
    this.postImpressions.last7Days = this.postImpressions.impressions.filter((i) => i.viewedAt >= d7).length;
    this.postImpressions.last30Days = this.postImpressions.impressions.filter((i) => i.viewedAt >= d30).length;
    this.searchAppearances.last7Days = this.searchAppearances.appearances.filter((a) => a.appearedAt >= d7).length;
    this.searchAppearances.last30Days = this.searchAppearances.appearances.filter((a) => a.appearedAt >= d30).length;
    // ✅ FIX: clicks/shares/uniqueVisitors ke last7/30Days bhi calculate karo
    this.clicks.last7Days = this.clicks.clicks.filter((c) => c.clickedAt >= d7).length;
    this.clicks.last30Days = this.clicks.clicks.filter((c) => c.clickedAt >= d30).length;
    this.shares.last7Days = this.shares.shares.filter((s) => s.sharedAt >= d7).length;
    this.shares.last30Days = this.shares.shares.filter((s) => s.sharedAt >= d30).length;
    this.uniqueVisitors.last7Days = this.uniqueVisitors.visitors.filter((v) => v.lastVisit >= d7).length;
    this.uniqueVisitors.last30Days = this.uniqueVisitors.visitors.filter((v) => v.lastVisit >= d30).length;

    this.lastCalculatedAt = now;
    next();
});

AnalyticsSchema.statics.findByUserId = async function (userId: string): Promise<IAnalytics | null> {
    try {
        return await this.findOne({ userId }).exec();
    } catch (error: unknown) {
        LoggerUtil.error('Find analytics by userId failed', { error: (error as Error).message, userId });
        throw error;
    }
};

AnalyticsSchema.statics.recordProfileView = async function (
    userId: string,
    viewerData: Partial<IProfileView>
): Promise<void> {
    try {
        let analytics = await this.findOne({ userId });
        if (!analytics) analytics = new this({ analyticsId: uuidv4(), userId });

        analytics.profileViews.views.push({
            viewerId: viewerData.viewerId ?? null,
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
    } catch (error: unknown) {
        LoggerUtil.error('Record profile view failed', { error: (error as Error).message, userId });
        throw error;
    }
};

AnalyticsSchema.statics.recordPostImpression = async function (
    userId: string,
    impressionData: IPostImpression
): Promise<void> {
    try {
        let analytics = await this.findOne({ userId });
        if (!analytics) analytics = new this({ analyticsId: uuidv4(), userId });

        analytics.postImpressions.impressions.push({ ...impressionData, viewedAt: new Date() });
        analytics.postImpressions.total++;
        await analytics.save();
    } catch (error: unknown) {
        LoggerUtil.error('Record post impression failed', { error: (error as Error).message, userId });
        throw error;
    }
};

AnalyticsSchema.statics.recordSearchAppearance = async function (
    userId: string,
    searchData: ISearchAppearance
): Promise<void> {
    try {
        let analytics = await this.findOne({ userId });
        if (!analytics) analytics = new this({ analyticsId: uuidv4(), userId });

        analytics.searchAppearances.appearances.push({ ...searchData, appearedAt: new Date() });
        analytics.searchAppearances.total++;

        const keyword = searchData.searchQuery.toLowerCase();
        const existing = analytics.searchAppearances.topKeywords.find((k) => k.keyword === keyword);
        if (existing) {
            existing.count++;
        } else {
            analytics.searchAppearances.topKeywords.push({ keyword, count: 1 });
        }

        analytics.searchAppearances.topKeywords.sort((a, b) => b.count - a.count);
        if (analytics.searchAppearances.topKeywords.length > 10) {
            analytics.searchAppearances.topKeywords = analytics.searchAppearances.topKeywords.slice(0, 10);
        }

        await analytics.save();
    } catch (error: unknown) {
        LoggerUtil.error('Record search appearance failed', { error: (error as Error).message, userId });
        throw error;
    }
};

AnalyticsSchema.statics.getAnalyticsSummary = async function (
    userId: string,
    dateRange = 7
): Promise<IAnalyticsSummary> {
    try {
        const analytics = await this.findOne({ userId });
        if (!analytics) {
            return {
                profileViews: { total: 0, inRange: 0 },
                postImpressions: { total: 0, inRange: 0 },
                searchAppearances: { total: 0, inRange: 0 },
            };
        }
        const cutoff = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);
        return {
            profileViews: {
                total: analytics.profileViews.total,
                inRange: analytics.profileViews.views.filter((v) => v.viewedAt >= cutoff).length,
            },
            postImpressions: {
                total: analytics.postImpressions.total,
                inRange: analytics.postImpressions.impressions.filter((i) => i.viewedAt >= cutoff).length,
            },
            searchAppearances: {
                total: analytics.searchAppearances.total,
                inRange: analytics.searchAppearances.appearances.filter((a) => a.appearedAt >= cutoff).length,
            },
        };
    } catch (error: unknown) {
        LoggerUtil.error('Get analytics summary failed', { error: (error as Error).message, userId });
        throw error;
    }
};

const Analytics = mongoose.model<IAnalytics, IAnalyticsModel>('Analytics', AnalyticsSchema);
export default Analytics;