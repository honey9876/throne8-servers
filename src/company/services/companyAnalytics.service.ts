import { Company } from '../models';
import logger from '@/shared/logger.util';
import CacheUtil from '@/shared/cache.util';
import { ICompanyAnalyticsDocument } from '../models/CompanyAnalytics.model';
import analyticsRepository from '../repositories/analytics.repository';
import companyRepository from '../repositories/company.repository';
import postRepository from '../repositories/post.repository';
import { emitCompanyAnalyticsUpdate } from '@/socket/handlers/connectionHandler';

interface ParsedData {
  Date: string;
  'Page Views': number;
  'Profile Visits': number;
  'Posts Views': number;
  'Posts Published': number;
  Likes: number;
  Comments: number;
  Shares: number;
  'Followers Gained': number;
  'Followers Lost': number;
  'Net Growth': number;
  'Jobs Posted': number;
  'Job Applications': number;
  'Events Hosted': number;
  'Event Attendees': number;
  'Reviews Received': number;
  'Average Rating': number;
  'Organic Traffic': number;
  'Direct Traffic': number;
  'Referral Traffic': number;
  'Social Traffic': number;
}

class CompanyAnalyticsService {
  private readonly CACHE_TTL = 3600;
  private readonly CACHE_PREFIX = 'analytics:';

  // =====================================================
  // TRACK EVENT — companyUUID resolve karo
  // =====================================================
  async trackEvent(
    companyUUID: string,
    eventType: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      // ✅ UUID → ObjectId resolve karo
      const company = await companyRepository.findByUUID(companyUUID);
      if (!company) throw new Error('Company not found');

      await analyticsRepository.trackEvent(
        company._id.toString(),
        eventType,
        metadata
      );

      await this.invalidateCompanyCache(company._id.toString());
      logger.info(`Event tracked: ${eventType} for company ${companyUUID}`);
    } catch (error: any) {
      logger.error('Error tracking event:', error);
      throw new Error('Failed to track event');
    }
  }

  // =====================================================
  // GET DASHBOARD — companyUUID resolve karo
  // =====================================================
  async getDashboard(companyUUID: string): Promise<Record<string, unknown>> {
    try {
      const company = await companyRepository.findByUUID(companyUUID);
      if (!company) throw new Error('Company not found');

      const companyObjectId = company._id.toString();
      const cacheKey = `${this.CACHE_PREFIX}dashboard:${companyObjectId}`;

      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const [today, last7Days, last30Days, last90Days] = await Promise.all([
        analyticsRepository.getDailyStats(companyObjectId, 1),
        analyticsRepository.getDailyStats(companyObjectId, 7),
        analyticsRepository.getDailyStats(companyObjectId, 30),
        analyticsRepository.getDailyStats(companyObjectId, 90),
      ]);

      const todayStats = today[0] || this.getEmptyStats();
      const week = this.aggregateStats(last7Days);
      const month = this.aggregateStats(last30Days);
      const quarter = this.aggregateStats(last90Days);

      const previousWeek = await analyticsRepository.getDailyStats(companyObjectId, 14);
      const previousWeekStats = this.aggregateStats(previousWeek.slice(0, 7));

      const trends = {
        pageViews: this.calculateGrowth(week.totalPageViews, previousWeekStats.totalPageViews),
        engagement: this.calculateGrowth(week.totalEngagement, previousWeekStats.totalEngagement),
        followers: this.calculateGrowth(week.followersGained, previousWeekStats.followersGained),
        posts: this.calculateGrowth(week.totalPostsPublished, previousWeekStats.totalPostsPublished),
      };

      const topPosts = await analyticsRepository.getTopPosts(companyObjectId, 5, 30);

      const dashboard = {
        today: todayStats,
        week,
        month,
        quarter,
        trends,
        topPosts,
        lastUpdated: new Date(),
      };

      await CacheUtil.set(cacheKey, dashboard, this.CACHE_TTL);
      return dashboard;
    } catch (error: any) {
      logger.error('Error getting dashboard:', error);
      throw error;
    }
  }

  // =====================================================
  // GET COMPANY ANALYTICS (companyObjectId aayega middleware se)
  // =====================================================
  async getCompanyAnalytics(
    companyObjectId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Record<string, unknown>> {
    try {
      const company = await Company.findById(companyObjectId);
      if (!company) throw new Error('Company not found');

      const cacheKey = `${this.CACHE_PREFIX}company:${companyObjectId}:${startDate?.toISOString()}:${endDate?.toISOString()}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const [analytics, summary] = await Promise.all([
        analyticsRepository.getCompanyAnalytics(companyObjectId, startDate, endDate),
        analyticsRepository.getCompanySummary(companyObjectId, startDate, endDate),
      ]);

      const result = {
        company: {
          id: company._id,
          name: company.companyName,
          slug: company.companySlug,
        },
        period: {
          startDate: startDate || analytics[analytics.length - 1]?.date,
          endDate: endDate || analytics[0]?.date,
        },
        summary,
        dailyData: analytics,
      };

      await CacheUtil.set(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (error: any) {
      logger.error('Error getting company analytics:', error);
      throw error;
    }
  }

  // =====================================================
  // GET DAILY STATS (companyObjectId middleware se)
  // =====================================================
  async getDailyStats(
    companyObjectId: string,
    days = 30
  ): Promise<ICompanyAnalyticsDocument[]> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}daily:${companyObjectId}:${days}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const stats = await analyticsRepository.getDailyStats(companyObjectId, days);
      await CacheUtil.set(cacheKey, stats, this.CACHE_TTL);
      return stats;
    } catch (error: any) {
      logger.error('Error getting daily stats:', error);
      throw new Error('Failed to fetch daily stats');
    }
  }

  // =====================================================
  // GET WEEKLY STATS (companyObjectId middleware se)
  // =====================================================
  async getWeeklyStats(
    companyObjectId: string,
    weeks = 12
  ): Promise<Record<string, unknown>[]> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}weekly:${companyObjectId}:${weeks}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const stats = await analyticsRepository.getWeeklyStats(companyObjectId, weeks);
      await CacheUtil.set(cacheKey, stats, this.CACHE_TTL);
      return stats;
    } catch (error: any) {
      logger.error('Error getting weekly stats:', error);
      throw new Error('Failed to fetch weekly stats');
    }
  }

  // =====================================================
  // GET MONTHLY STATS (companyObjectId middleware se)
  // =====================================================
  async getMonthlyStats(
    companyObjectId: string,
    months = 12
  ): Promise<Record<string, unknown>[]> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}monthly:${companyObjectId}:${months}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const stats = await analyticsRepository.getMonthlyStats(companyObjectId, months);
      await CacheUtil.set(cacheKey, stats, this.CACHE_TTL);
      return stats;
    } catch (error: any) {
      logger.error('Error getting monthly stats:', error);
      throw new Error('Failed to fetch monthly stats');
    }
  }

  // =====================================================
  // GET YEARLY STATS (companyObjectId middleware se)
  // =====================================================
  async getYearlyStats(
    companyObjectId: string,
    year?: number
  ): Promise<Record<string, unknown>[]> {
    try {
      const targetYear = year || new Date().getFullYear();
      const cacheKey = `${this.CACHE_PREFIX}yearly:${companyObjectId}:${targetYear}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const stats = await analyticsRepository.getYearlyStats(companyObjectId, targetYear);
      await CacheUtil.set(cacheKey, stats, 86400);
      return stats;
    } catch (error: any) {
      logger.error('Error getting yearly stats:', error);
      throw new Error('Failed to fetch yearly stats');
    }
  }

  // =====================================================
  // GET POST ANALYTICS (postObjectId resolvePostUUID se)
  // =====================================================
  async getPostAnalytics(postObjectId: string): Promise<Record<string, unknown>> {
    try {
      const post = await analyticsRepository.getPostById(postObjectId);
      if (!post) throw new Error('Post not found');

      const cacheKey = `${this.CACHE_PREFIX}post:${postObjectId}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const analytics = {
        postId: post.postId,   // ✅ UUID expose karo
        title: post.title,
        slug: post.slug,
        publishedAt: post.publishedAt,
        metrics: {
          views: post.engagementMetrics.viewsCount,
          likes: post.engagementMetrics.likesCount,
          comments: post.engagementMetrics.commentsCount,
          shares: post.engagementMetrics.sharesCount,
          totalEngagement:
            post.engagementMetrics.likesCount +
            post.engagementMetrics.commentsCount +
            post.engagementMetrics.sharesCount,
        },
        engagementRate:
          post.engagementMetrics.viewsCount > 0
            ? (
              ((post.engagementMetrics.likesCount +
                post.engagementMetrics.commentsCount +
                post.engagementMetrics.sharesCount) /
                post.engagementMetrics.viewsCount) *
              100
            ).toFixed(2)
            : 0,
      };

      await CacheUtil.set(cacheKey, analytics, 600);
      return analytics;
    } catch (error: any) {
      logger.error('Error getting post analytics:', error);
      throw error;
    }
  }

  // =====================================================
  // GET ENGAGEMENT METRICS — companyUUID resolve karo
  // =====================================================
  async getEngagementMetrics(
    companyUUID: string,
    days = 30
  ): Promise<Record<string, unknown>> {
    try {
      const company = await companyRepository.findByUUID(companyUUID);
      if (!company) throw new Error('Company not found');

      const companyObjectId = company._id.toString();
      const stats = await this.getDailyStats(companyObjectId, days);

      const totalEngagement = stats.reduce(
        (sum, day) =>
          sum +
          (day.metrics?.postsEngagement?.likes || 0) +
          (day.metrics?.postsEngagement?.comments || 0) +
          (day.metrics?.postsEngagement?.shares || 0),
        0
      );

      const totalViews = stats.reduce(
        (sum, day) => sum + (day.metrics?.postsViews || 0),
        0
      );

      const byType = {
        likes: stats.reduce((sum, day) => sum + (day.metrics?.postsEngagement?.likes || 0), 0),
        comments: stats.reduce((sum, day) => sum + (day.metrics?.postsEngagement?.comments || 0), 0),
        shares: stats.reduce((sum, day) => sum + (day.metrics?.postsEngagement?.shares || 0), 0),
      };

      return {
        companyId: companyUUID,
        period: { days, startDate: stats[0]?.date, endDate: stats[stats.length - 1]?.date },
        totalEngagement,
        totalViews,
        engagementRate: totalViews > 0 ? parseFloat(((totalEngagement / totalViews) * 100).toFixed(2)) : 0,
        byType,
        dailyAverage: stats.length > 0 ? totalEngagement / stats.length : 0,
      };
    } catch (error: any) {
      logger.error('Error getting engagement metrics:', error);
      throw new Error('Failed to fetch engagement metrics');
    }
  }

  // =====================================================
  // GET TRENDS — companyUUID resolve karo
  // =====================================================
  async getTrends(companyUUID: string, days = 30): Promise<Record<string, unknown>> {
    try {
      const company = await companyRepository.findByUUID(companyUUID);
      if (!company) throw new Error('Company not found');

      const companyObjectId = company._id.toString();
      const [current, previous] = await Promise.all([
        this.getDailyStats(companyObjectId, days),
        this.getDailyStats(companyObjectId, days * 2),
      ]);

      const currentStats = this.aggregateStats(current);
      const previousStats = this.aggregateStats(previous.slice(0, days));

      return {
        pageViews: this.calculateTrend(currentStats.totalPageViews, previousStats.totalPageViews),
        profileVisits: this.calculateTrend(currentStats.totalProfileVisits, previousStats.totalProfileVisits),
        engagement: this.calculateTrend(currentStats.totalEngagement, previousStats.totalEngagement),
        followers: this.calculateTrend(currentStats.followersGained, previousStats.followersGained),
        posts: this.calculateTrend(currentStats.totalPostsPublished, previousStats.totalPostsPublished),
      };
    } catch (error: any) {
      logger.error('Error getting trends:', error);
      throw new Error('Failed to fetch trends');
    }
  }

  // =====================================================
  // GET TOP POSTS — companyUUID optional resolve karo
  // =====================================================
  async getTopPosts(
    companyUUID?: string,
    limit = 10,
    days = 30
  ): Promise<Record<string, unknown>[]> {
    try {
      let companyObjectId: string | undefined;

      if (companyUUID) {
        const company = await companyRepository.findByUUID(companyUUID);
        if (company) companyObjectId = company._id.toString();
      }

      const cacheKey = `${this.CACHE_PREFIX}top-posts:${companyObjectId || 'all'}:${limit}:${days}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const topPosts = await analyticsRepository.getTopPosts(companyObjectId, limit, days);
      await CacheUtil.set(cacheKey, topPosts, this.CACHE_TTL);
      return topPosts;
    } catch (error: any) {
      logger.error('Error getting top posts:', error);
      throw new Error('Failed to fetch top posts');
    }
  }

  // =====================================================
  // GET TOP COMPANIES — NO UUID (aggregate data)
  // =====================================================
  async getTopCompanies(limit = 10, days = 7): Promise<Record<string, unknown>[]> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}top-companies:${limit}:${days}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const topCompanies = await analyticsRepository.getTrendingCompanies(limit, days);
      await CacheUtil.set(cacheKey, topCompanies, this.CACHE_TTL);
      return topCompanies;
    } catch (error: any) {
      logger.error('Error getting top companies:', error);
      throw new Error('Failed to fetch top companies');
    }
  }

  // =====================================================
  // EXPORT TO CSV — companyUUID resolve karo
  // =====================================================
  async exportToCSV(
    companyUUID: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<string> {
    try {
      const company = await companyRepository.findByUUID(companyUUID);
      if (!company) throw new Error('Company not found');

      const analytics = await analyticsRepository.getCompanyAnalytics(
        company._id.toString(),
        startDate,
        endDate
      );

      if (!analytics || analytics.length === 0) {
        throw new Error('No analytics data found for export');
      }

      const flatData: ParsedData[] = analytics.map((record: ICompanyAnalyticsDocument) => ({
        Date: new Date(record.date).toISOString().split('T')[0],
        'Page Views': record.metrics.pageViews || 0,
        'Profile Visits': record.metrics.profileVisits || 0,
        'Posts Views': record.metrics.postsViews || 0,
        'Posts Published': record.metrics.postsPublished || 0,
        Likes: record.metrics.postsEngagement.likes || 0,
        Comments: record.metrics.postsEngagement.comments || 0,
        Shares: record.metrics.postsEngagement.shares || 0,
        'Followers Gained': record.metrics.followersGained || 0,
        'Followers Lost': record.metrics.followersLost || 0,
        'Net Growth': (record.metrics.followersGained || 0) - (record.metrics.followersLost || 0),
        'Jobs Posted': record.metrics.jobsPosted || 0,
        'Job Applications': record.metrics.jobApplications || 0,
        'Events Hosted': record.metrics.eventsHosted || 0,
        'Event Attendees': record.metrics.eventAttendees || 0,
        'Reviews Received': record.metrics.reviewsReceived || 0,
        'Average Rating': record.metrics.averageRating || 0,
        'Organic Traffic': record.traffic.organic || 0,
        'Direct Traffic': record.traffic.direct || 0,
        'Referral Traffic': record.traffic.referral || 0,
        'Social Traffic': record.traffic.social || 0,
      }));

      const headers = Object.keys(flatData[0]).join(',');
      const rows = flatData.map(row => Object.values(row).join(',')).join('\n');
      return `${headers}\n${rows}`;
    } catch (error: any) {
      logger.error('Error exporting to CSV:', error);
      throw new Error('Failed to export analytics data');
    }
  }

  async trackUserEvent(
    companyUUID: string,
    userId: string,
    eventType: 'search_appearance' | 'page_view' | 'post_impression' | 'follower_gained' | 'follower_lost',
    extra?: {
      postId?: string;
      searchQuery?: string;
      sessionId?: string
    }
  ): Promise<void> {
    try {
      const company = await companyRepository.findByUUID(companyUUID);
      if (!company) throw new Error('Company not found');

      const companyObjectId = company._id.toString();

      // 1. Granular log save karo with userId
      const { isUnique } = await analyticsRepository.trackWithUser(
        companyObjectId,
        userId,
        eventType,
        extra
      );

      // 2. Existing aggregate counter bhi update karo
      const eventTypeMap: Record<string, string> = {
        'page_view': 'page_view',
        'search_appearance': 'page_view',
        'post_impression': 'post_view',
        'follower_gained': 'follower_gained',
        'follower_lost': 'follower_lost'
      };

      const mappedEvent = eventTypeMap[eventType];
      if (mappedEvent) {
        await analyticsRepository.trackEvent(companyObjectId, mappedEvent);
      }

      // 3. Cache invalidate karo
      await this.invalidateCompanyCache(companyObjectId);

      // 4. Real-time Socket.IO emit - sirf unique events par
      // (har page view par emit karna heavy hoga)
      if (isUnique || eventType === 'follower_gained' || eventType === 'follower_lost') {
        const updatedStats = await analyticsRepository.getTrackingStats(
          companyObjectId,
          30
        );

        emitCompanyAnalyticsUpdate(companyObjectId, {
          event: eventType,
          isUnique,
          stats: updatedStats
        });
      }

      logger.info(`User event tracked: ${eventType} by ${userId}`);
    } catch (error: any) {
      // Silently fail - tracking should never break user experience
      logger.error('Error tracking user event:', error);
    }
  }

  async getAnalyticsDashboardV2(
    companyUUID: string,
    days = 30
  ): Promise<Record<string, unknown>> {
    const company = await companyRepository.findByUUID(companyUUID);
    if (!company) throw new Error('Company not found');

    const companyObjectId = company._id.toString();

    const cacheKey = `${this.CACHE_PREFIX}dashboard-v2:${companyObjectId}:${days}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return cached;

    const [trackingStats, followerGrowth, dailyStats] = await Promise.all([
      analyticsRepository.getTrackingStats(companyObjectId, days),
      analyticsRepository.getFollowerGrowth(companyObjectId, days),
      analyticsRepository.getDailyStats(companyObjectId, days)
    ]);

    const result = {
      summary: {
        searchAppearances: trackingStats.searchAppearances,
        uniqueSearchUsers: trackingStats.uniqueSearchUsers,
        pageViews: trackingStats.pageViews,
        uniquePageViewUsers: trackingStats.uniquePageViewUsers,
        postImpressions: trackingStats.postImpressions,
      },
      followerGrowth,
      dailyStats,
      period: { days }
    };

    await CacheUtil.set(cacheKey, result, 300); // 5 min cache
    return result;
  }

  // =====================================================
  // HELPERS
  // =====================================================
  private aggregateStats(stats: ICompanyAnalyticsDocument[]): Record<string, number> {
    return {
      totalPageViews: stats.reduce((sum, s) => sum + (s.metrics?.pageViews || 0), 0),
      totalProfileVisits: stats.reduce((sum, s) => sum + (s.metrics?.profileVisits || 0), 0),
      totalPostsViews: stats.reduce((sum, s) => sum + (s.metrics?.postsViews || 0), 0),
      totalPostsPublished: stats.reduce((sum, s) => sum + (s.metrics?.postsPublished || 0), 0),
      totalEngagement: stats.reduce(
        (sum, s) =>
          sum +
          (s.metrics?.postsEngagement?.likes || 0) +
          (s.metrics?.postsEngagement?.comments || 0) +
          (s.metrics?.postsEngagement?.shares || 0),
        0
      ),
      followersGained: stats.reduce((sum, s) => sum + (s.metrics?.followersGained || 0), 0),
      followersLost: stats.reduce((sum, s) => sum + (s.metrics?.followersLost || 0), 0),
      jobsPosted: stats.reduce((sum, s) => sum + (s.metrics?.jobsPosted || 0), 0),
      eventsHosted: stats.reduce((sum, s) => sum + (s.metrics?.eventsHosted || 0), 0),
    };
  }

  private calculateGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return parseFloat((((current - previous) / previous) * 100).toFixed(2));
  }

  private calculateTrend(current: number, previous: number): Record<string, unknown> {
    const growth = this.calculateGrowth(current, previous);
    return {
      current,
      previous,
      growth,
      direction: growth > 0 ? 'up' : growth < 0 ? 'down' : 'stable',
    };
  }

  private getEmptyStats(): Record<string, unknown> {
    return {
      metrics: {
        pageViews: 0, profileVisits: 0, postsViews: 0, postsPublished: 0,
        postsEngagement: { likes: 0, comments: 0, shares: 0 },
        followersGained: 0, followersLost: 0, jobsPosted: 0,
        jobApplications: 0, eventsHosted: 0, eventAttendees: 0,
        reviewsReceived: 0, averageRating: 0,
      },
      traffic: { organic: 0, direct: 0, referral: 0, social: 0 },
    };
  }

  private async invalidateCompanyCache(companyObjectId: string): Promise<void> {
    try {
      await CacheUtil.clearByPattern(`${this.CACHE_PREFIX}*${companyObjectId}*`);
    } catch (error: any) {
      logger.error('Error invalidating cache:', error);
    }
  }
}

export default new CompanyAnalyticsService();