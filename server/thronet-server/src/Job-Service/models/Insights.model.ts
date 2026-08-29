// src/models/insights.model.ts
import mongoose, { Schema, Document, Model } from 'mongoose';
import logger from '@/shared/logger.util';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import CacheUtil from '@/shared/cache.util.js';

// ==================== TYPES & INTERFACES ====================
const validUUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface IOfferMetrics {
  offerCount: number;
  averageSalary: number;
  averageEquity: number;
}

interface IJobMetrics {
  views: number;
  uniqueViews: number;
  applications: number;
  saves: number;
  shares: number;
  clicks: number;
}

interface ITrafficSources {
  direct: number;
  linkedin: number;
  google: number;
  referral: number;
}

interface IJobAnalytics {
  jobId: string;
  offerMetrics: IOfferMetrics;
  trendingScore: number;
  metrics: IJobMetrics;
  sources: ITrafficSources;
  createdAt: Date;
  updatedAt: Date;
}

interface IMarketData {
  percentile25?: number;
  percentile50?: number;
  percentile75?: number;
  percentile90?: number;
  average?: number;
  dataPoints?: number;
  lastUpdated?: Date;
}

interface IComparableRole {
  title: string;
  salaryRange: {
    min: number;
    max: number;
  };
  similarity: number;
}

interface INegotiationStrategy {
  suggestedOffer?: number;
  negotiationPoints?: string[];
  marketPosition?: string;
  recommendedApproach?: string;
}

interface ISalaryNegotiation {
  jobTitle?: string;
  location?: string;
  industry?: string;
  experienceYears?: number;
  currentSalary?: number;
  offerSalary?: number;
  marketData?: IMarketData;
  comparableRoles?: IComparableRole[];
  benchmarkScore?: number;
  negotiationStrategy?: INegotiationStrategy;
  lastAnalyzed?: Date;
}

interface IReportData {
  demandTrends?: string[];
  topSkills?: string[];
  salaryTrends?: {
    median?: number;
    growthRate?: string;
  };
  hiringTrends?: {
    activeListings?: number;
    growthRate?: string;
  };
}

interface IMarketReport {
  reportId: string;
  reportType?: string;
  filters?: {
    industry?: string;
    location?: string;
    experienceLevel?: string;
  };
  generatedAt: Date;
  summary?: string;
  data?: IReportData;
  recommendations?: string[];
}

export interface IInsights extends Document {
  userId: string;
  jobAnalytics: IJobAnalytics[];
  salaryNegotiation?: ISalaryNegotiation;
  marketReports: IMarketReport[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== UPDATE METRICS INTERFACE ====================
export interface IMetricsUpdate {
  offerCount?: number;
  views?: number;
  uniqueViews?: number;
  applications?: number;
  saves?: number;
  shares?: number;
  clicks?: number;
  averageSalary?: number;
  averageEquity?: number;
  trendingScore?: number;
  sources?: Partial<ITrafficSources>;
}

// ==================== PAGINATION INTERFACE ====================
export interface IPagination {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 1 | -1;
}

// ==================== POPULAR JOBS RESULT ====================
export interface IPopularJob {
  _id: string;
  trendingScore: number;
  totalViews: number;
  totalApplications: number;
}

// ==================== MODEL STATIC METHODS ====================
interface IInsightsModel extends Model<IInsights> {
  updateJobMetrics(
    userId: string,
    jobId: string,
    metrics: IMetricsUpdate
  ): Promise<any>;
  
  findUserInsights(
    userId: string,
    pagination?: IPagination
  ): Promise<IInsights | null>;
  
  findPopularJobs(
    timeFrame?: '7d' | '30d',
    limit?: number
  ): Promise<IPopularJob[]>;
}

// ==================== SCHEMA DEFINITION ====================
const insightsSchema = new Schema<IInsights, IInsightsModel>(
  {
    userId: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => validUUIDRegex.test(v),
        message: 'Invalid userId UUID',
      },
    },
    jobAnalytics: [
      {
        jobId: {
          type: String,
          required: true,
          validate: {
            validator: (v: string) => validUUIDRegex.test(v),
            message: 'Invalid jobId UUID',
          },
        },
        offerMetrics: {
          offerCount: { type: Number, default: 0, min: 0 },
          averageSalary: { type: Number, default: 0, min: 0 },
          averageEquity: { type: Number, default: 0, min: 0 },
        },
        trendingScore: { type: Number, default: 0, min: 0, max: 100 },
        metrics: {
          views: { type: Number, default: 0, min: 0 },
          uniqueViews: { type: Number, default: 0, min: 0 },
          applications: { type: Number, default: 0, min: 0 },
          saves: { type: Number, default: 0, min: 0 },
          shares: { type: Number, default: 0, min: 0 },
          clicks: { type: Number, default: 0, min: 0 },
        },
        sources: {
          direct: { type: Number, default: 0, min: 0 },
          linkedin: { type: Number, default: 0, min: 0 },
          google: { type: Number, default: 0, min: 0 },
          referral: { type: Number, default: 0, min: 0 },
        },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    salaryNegotiation: {
      jobTitle: String,
      location: String,
      industry: String,
      experienceYears: Number,
      currentSalary: Number,
      offerSalary: Number,
      marketData: {
        percentile25: Number,
        percentile50: Number,
        percentile75: Number,
        percentile90: Number,
        average: Number,
        dataPoints: Number,
        lastUpdated: Date,
      },
      comparableRoles: [
        {
          title: String,
          salaryRange: { min: Number, max: Number },
          similarity: Number,
        },
      ],
      benchmarkScore: Number,
      negotiationStrategy: {
        suggestedOffer: Number,
        negotiationPoints: [String],
        marketPosition: String,
        recommendedApproach: String,
      },
      lastAnalyzed: Date,
    },
    marketReports: [
      {
        reportId: {
          type: String,
          default: uuidv4,
          validate: { 
            validator: uuidValidate, 
            message: 'Invalid reportId UUID' 
          },
        },
        reportType: String,
        filters: {
          industry: String,
          location: String,
          experienceLevel: String,
        },
        generatedAt: { type: Date, default: Date.now },
        summary: String,
        data: {
          demandTrends: [String],
          topSkills: [String],
          salaryTrends: { median: Number, growthRate: String },
          hiringTrends: { activeListings: Number, growthRate: String },
        },
        recommendations: [String],
      },
    ],
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'insights',
    // @ts-ignore - MongoDB shardKey option
    shardKey: { userId: 1 },
  }
);

// ==================== OPTIMIZED INDEXES FOR 10M+ USERS ====================
insightsSchema.index({ userId: 1, 'jobAnalytics.createdAt': -1 });
insightsSchema.index({ 'jobAnalytics.jobId': 1, 'jobAnalytics.trendingScore': -1 });
insightsSchema.index({ 'marketReports.reportId': 1 });
insightsSchema.index({ 'salaryNegotiation.lastAnalyzed': 1 });
insightsSchema.index({ isDeleted: 1 });
insightsSchema.index(
  { 'jobAnalytics.createdAt': 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // TTL: 90 days
);

// ==================== PRE-SAVE MIDDLEWARE ====================
insightsSchema.pre('save', async function (next) {
  try {
    this.updatedAt = new Date();

    // Update timestamps for job analytics
    for (const job of this.jobAnalytics) {
      if (!job.createdAt) job.createdAt = new Date();
      job.updatedAt = new Date();
    }

    // ✅ REMOVED: Kafka/Vector DB event emission
    // Only log the update
    if (this.isNew || this.isModified()) {
      logger.info('📊 [INSIGHTS] Document updated', {
        userId: this.userId,
        jobCount: this.jobAnalytics.length,
        reportCount: this.marketReports.length,
      });
    }

    next();
  } catch (error : any) {
    logger.error('❌ [INSIGHTS] Pre-save error', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    next(error as Error);
  }
});

// ==================== STATIC METHODS ====================

/**
 * Update job metrics (incremental updates)
 */
insightsSchema.statics.updateJobMetrics = async function (
  userId: string,
  jobId: string,
  metrics: IMetricsUpdate
) {
  const update: any = {
    $inc: {
      'jobAnalytics.$.offerMetrics.offerCount': metrics.offerCount || 0,
      'jobAnalytics.$.metrics.views': metrics.views || 0,
      'jobAnalytics.$.metrics.uniqueViews': metrics.uniqueViews || 0,
      'jobAnalytics.$.metrics.applications': metrics.applications || 0,
      'jobAnalytics.$.metrics.saves': metrics.saves || 0,
      'jobAnalytics.$.metrics.shares': metrics.shares || 0,
      'jobAnalytics.$.metrics.clicks': metrics.clicks || 0,
      'jobAnalytics.$.sources.direct': metrics.sources?.direct || 0,
      'jobAnalytics.$.sources.linkedin': metrics.sources?.linkedin || 0,
      'jobAnalytics.$.sources.google': metrics.sources?.google || 0,
      'jobAnalytics.$.sources.referral': metrics.sources?.referral || 0,
    },
    $set: { 'jobAnalytics.$.updatedAt': new Date() },
  };

  // Set fields (not increment)
  if (metrics.averageSalary) {
    update.$set['jobAnalytics.$.offerMetrics.averageSalary'] = metrics.averageSalary;
  }
  if (metrics.averageEquity) {
    update.$set['jobAnalytics.$.offerMetrics.averageEquity'] = metrics.averageEquity;
  }
  if (metrics.trendingScore !== undefined) {
    update.$set['jobAnalytics.$.trendingScore'] = metrics.trendingScore;
  }

  return this.updateOne(
    { userId, 'jobAnalytics.jobId': jobId },
    update,
    { upsert: true }
  );
};

/**
 * Find user insights with pagination
 */
insightsSchema.statics.findUserInsights = async function (
  userId: string,
  pagination: IPagination = {}
) {
  const {
    page = 1,
    limit = 20,
    sortBy = 'jobAnalytics.createdAt',
    sortOrder = -1,
  } = pagination;

  return this.findOne({ userId, isDeleted: false })
    .select('jobAnalytics salaryNegotiation marketReports')
    .slice('jobAnalytics', [(page - 1) * limit, limit])
    .slice('marketReports', [(page - 1) * limit, limit])
    .sort({ [sortBy]: sortOrder })
    .lean();
};

/**
 * Find popular jobs by trending score
 */
insightsSchema.statics.findPopularJobs = async function (
  timeFrame: '7d' | '30d' = '7d',
  limit = 10
): Promise<IPopularJob[]> {
  const days = timeFrame === '7d' ? 7 : 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return this.aggregate([
    { $match: { isDeleted: false } },
    { $unwind: '$jobAnalytics' },
    { $match: { 'jobAnalytics.createdAt': { $gte: startDate } } },
    {
      $group: {
        _id: '$jobAnalytics.jobId',
        trendingScore: { $avg: '$jobAnalytics.trendingScore' },
        totalViews: { $sum: '$jobAnalytics.metrics.views' },
        totalApplications: { $sum: '$jobAnalytics.metrics.applications' },
      },
    },
    { $sort: { trendingScore: -1 } },
    { $limit: limit },
  ]);
};

// ==================== CACHE MANAGER ====================
export class CacheManager {
  /**
   * Multi-level cache get (hot → warm → cold)
   */
  static async getMultiLevel<T = any>(
    key: string,
    userId: string | null = null
  ): Promise<T | null> {
    const userKey = userId ? `${key}:${userId}` : key;

    try {
      // Check hot cache (30s TTL)
      let result = await CacheUtil.get(`hot:${userKey}`);
      if (result) {
        logger.debug('✅ [CACHE] Hot cache hit', { key: userKey });
        return JSON.parse(result) as T;
      }

      // Check warm cache (5min TTL)
      result = await CacheUtil.get(`warm:${userKey}`);
      if (result) {
        logger.debug('✅ [CACHE] Warm cache hit', { key: userKey });
        // Promote to hot cache
        await CacheUtil.set(`hot:${userKey}`, result, 30);
        return JSON.parse(result) as T;
      }

      // Check cold cache (30min TTL)
      result = await CacheUtil.get(`cold:${key}`);
      if (result) {
        logger.debug('✅ [CACHE] Cold cache hit', { key });
        return JSON.parse(result) as T;
      }
    } catch (error : any) {
      logger.error('❌ [CACHE] Get error', {
        key: userKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * Multi-level cache set (hot + warm + cold)
   */
  static async setMultiLevel(
    key: string,
    data: any,
    userId: string | null = null
  ): Promise<void> {
    const userKey = userId ? `${key}:${userId}` : key;
    const dataStr = JSON.stringify(data);

    try {
      await Promise.all([
        CacheUtil.set(`hot:${userKey}`, dataStr, 30), // 30 seconds
        CacheUtil.set(`warm:${userKey}`, dataStr, 300), // 5 minutes
        CacheUtil.set(`cold:${key}`, dataStr, 1800), // 30 minutes
      ]);

      logger.debug('✅ [CACHE] Multi-level cache set', { key: userKey });
    } catch (error : any) {
      logger.error('❌ [CACHE] Set error', {
        key: userKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Invalidate all cache levels for a key
   */
  static async invalidate(
    key: string,
    userId: string | null = null
  ): Promise<void> {
    const userKey = userId ? `${key}:${userId}` : key;

    try {
      await Promise.all([
        CacheUtil.del(`hot:${userKey}`),
        CacheUtil.del(`warm:${userKey}`),
        CacheUtil.del(`cold:${key}`),
      ]);

      logger.debug('✅ [CACHE] Cache invalidated', { key: userKey });
    } catch (error : any) {
      logger.error('❌ [CACHE] Invalidation error', {
        key: userKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ==================== MODEL EXPORT ====================
export const Insights = mongoose.model<IInsights, IInsightsModel>(
  'Insights',
  insightsSchema
);

export default Insights;



////////////////////////////////////===============================================
// usage exxampleeee
/////////////////////////////==============================================

/*

// Import
import Insights, { CacheManager, IInsights, IMetricsUpdate } from './models/insights.model.js';

// Update metrics (type-safe)
const metrics: IMetricsUpdate = {
  views: 1,
  applications: 1,
  sources: { direct: 1 }
};
await Insights.updateJobMetrics('user-123', 'job-456', metrics);

// Find with cache
const cacheKey = 'user-insights';
let data = await CacheManager.getMultiLevel<IInsights>(cacheKey, 'user-123');

if (!data) {
  data = await Insights.findUserInsights('user-123', { page: 1, limit: 20 });
  if (data) {
    await CacheManager.setMultiLevel(cacheKey, data, 'user-123');
  }
}

// Get popular jobs
const popularJobs = await Insights.findPopularJobs('7d', 10);

// Invalidate cache
await CacheManager.invalidate('user-insights', 'user-123');
*/