import mongoose from 'mongoose';
import { CompanyAnalytics, CompanyPost } from '../models';
import { ICompanyAnalyticsDocument } from '../models/CompanyAnalytics.model';
import TrackingLog from '../models/TrackingLog.model';

class AnalyticsRepository {

    async findOrCreateToday(companyObjectId: string): Promise<ICompanyAnalyticsDocument> {
        return CompanyAnalytics.findOrCreateToday(companyObjectId);
    }

    async trackEvent(
        companyObjectId: string,
        eventType: string,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        return CompanyAnalytics.trackEvent(companyObjectId, eventType, metadata);
    }

    async getCompanyAnalytics(
        companyObjectId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<ICompanyAnalyticsDocument[]> {
        return CompanyAnalytics.getCompanyAnalytics(companyObjectId, startDate, endDate);
    }

    async getDailyStats(
        companyObjectId: string,
        days = 30
    ): Promise<ICompanyAnalyticsDocument[]> {
        return CompanyAnalytics.getDailyStats(companyObjectId, days);
    }

    async getWeeklyStats(
        companyObjectId: string,
        weeks = 12
    ): Promise<Record<string, unknown>[]> {
        return CompanyAnalytics.getWeeklyStats(companyObjectId, weeks);
    }

    async getMonthlyStats(
        companyObjectId: string,
        months = 12
    ): Promise<Record<string, unknown>[]> {
        return CompanyAnalytics.getMonthlyStats(companyObjectId, months);
    }

    async getYearlyStats(
        companyObjectId: string,
        year?: number
    ): Promise<Record<string, unknown>[]> {
        return CompanyAnalytics.getYearlyStats(companyObjectId, year);
    }

    async getCompanySummary(
        companyObjectId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<Record<string, unknown> | null> {
        return CompanyAnalytics.getCompanySummary(companyObjectId, startDate, endDate);
    }

    async getTrendingCompanies(
        limit = 10,
        days = 7
    ): Promise<Record<string, unknown>[]> {
        return CompanyAnalytics.getTrendingCompanies(limit, days);
    }

    async getTopPosts(
        companyObjectId?: string,
        limit = 10,
        days = 30
    ): Promise<Record<string, unknown>[]> {
        return CompanyAnalytics.getTopPosts(companyObjectId, limit, days);
    }

    // Post analytics — postId = ObjectId (resolvePostUUID se aayega)
    async getPostById(postObjectId: string) {
        if (!mongoose.Types.ObjectId.isValid(postObjectId)) return null;
        return CompanyPost.findPostById(postObjectId);
    }

    async trackWithUser(
        companyObjectId: string,
        userId: string,
        eventType: string,
        extra?: {
            postId?: string;
            searchQuery?: string;
            sessionId?: string
        }
    ): Promise<{ isUnique: boolean }> {

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Aaj same user ne same event already kiya hai kya?
        const existing = await TrackingLog.findOne({
            companyId: new mongoose.Types.ObjectId(companyObjectId),
            userId,
            eventType,
            createdAt: { $gte: today }
        });

        const isUnique = !existing;

        // Har baar log save karo (total count ke liye)
        await TrackingLog.create({
            companyId: new mongoose.Types.ObjectId(companyObjectId),
            userId,
            eventType,
            postId: extra?.postId
                ? new mongoose.Types.ObjectId(extra.postId)
                : undefined,
            searchQuery: extra?.searchQuery,
            sessionId: extra?.sessionId
        });

        return { isUnique };
    }

    async getTrackingStats(
        companyObjectId: string,
        days: number = 30
    ): Promise<{
        searchAppearances: number;
        uniqueSearchUsers: number;
        pageViews: number;
        uniquePageViewUsers: number;
        postImpressions: number;
        uniquePostUsers: number;
    }> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const result = await TrackingLog.aggregate([
            {
                $match: {
                    companyId: new mongoose.Types.ObjectId(companyObjectId),
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$eventType',
                    total: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$userId' }
                }
            },
            {
                $project: {
                    eventType: '$_id',
                    total: 1,
                    uniqueCount: { $size: '$uniqueUsers' }
                }
            }
        ]);

        const stats = {
            searchAppearances: 0,
            uniqueSearchUsers: 0,
            pageViews: 0,
            uniquePageViewUsers: 0,
            postImpressions: 0,
            uniquePostUsers: 0
        };

        result.forEach((r: any) => {
            if (r.eventType === 'search_appearance') {
                stats.searchAppearances = r.total;
                stats.uniqueSearchUsers = r.uniqueCount;
            } else if (r.eventType === 'page_view') {
                stats.pageViews = r.total;
                stats.uniquePageViewUsers = r.uniqueCount;
            } else if (r.eventType === 'post_impression') {
                stats.postImpressions = r.total;
                stats.uniquePostUsers = r.uniqueCount;
            }
        });

        return stats;
    }

    async getFollowerGrowth(
        companyObjectId: string,
        days: number = 30
    ): Promise<Array<{
        date: string;
        gained: number;
        lost: number;
        net: number
    }>> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        return TrackingLog.aggregate([
            {
                $match: {
                    companyId: new mongoose.Types.ObjectId(companyObjectId),
                    eventType: { $in: ['follower_gained', 'follower_lost'] },
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        date: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$createdAt'
                            }
                        },
                        type: '$eventType'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.date',
                    gained: {
                        $sum: {
                            $cond: [
                                { $eq: ['$_id.type', 'follower_gained'] },
                                '$count',
                                0
                            ]
                        }
                    },
                    lost: {
                        $sum: {
                            $cond: [
                                { $eq: ['$_id.type', 'follower_lost'] },
                                '$count',
                                0
                            ]
                        }
                    }
                }
            },
            {
                $addFields: {
                    date: '$_id',
                    net: { $subtract: ['$gained', '$lost'] }
                }
            },
            { $sort: { date: 1 } }
        ]);
    }
}

export default new AnalyticsRepository();