import mongoose, { Document, Model, Schema } from "mongoose";
import { v4 as uuidv4, validate as uuidValidate } from "uuid";
import { createHash } from "crypto";
import logger from "@/shared/logger.util";
import UserInteractionModel from "./userInteraction.model";
import { generateSecureId, sanitizeUserId, validId } from "@/shared/security";
import {
  searchDuration,
  searchRequests,
  activeSearches,
  cacheHits,
} from "@/shared/metrics";
import JobApplication from "./jobApplication.model";
import { GoogleGenerativeAI } from "@google/generative-ai";
import CacheUtil from "@/shared/cache.util";
import { IUserProfile } from "@/auth/models/UserProfile.model";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const validUUIDRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Type Definitions
interface ISkill {
  name: string;
  weight: number;
}

interface ILocation {
  city?: string;
  state?: string;
  country: string;
}

interface ISalaryRange {
  min?: number;
  max?: number;
  currency: string;
}

interface IFilters {
  skills: ISkill[];
  locations: ILocation[];
  excludeKeywords: string[];
  jobTypes: Array<"full-time" | "part-time" | "contract" | "freelance" | "internship">;
  experienceLevels: Array<"entry" | "junior" | "mid" | "senior" | "lead" | "principal" | "executive">;
  salaryRange?: ISalaryRange;
  companySize?: "startup" | "small" | "medium" | "large" | "enterprise";
  workMode?: "remote" | "onsite" | "hybrid";
  industry?: string;
  postedWithin?: number;
}

interface IMetadata {
  type: "location" | "company" | "keyword" | "title" | "natural";
  filters: IFilters;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
  referrer?: string;
}

interface IStats {
  resultCount: number;
  executionTime: number;
  clickCount: number;
  saveCount: number;
  applyCount: number;
  shareCount: number;
  lastClickedAt?: Date;
  avgClickPosition?: number;
}

interface IQuality {
  relevanceScore?: number;
  userSatisfaction?: number;
  conversionRate?: number;
}

interface IResultMetrics {
  totalResults: number;
  clickedResults: number;
  applicationsMade: number;
  timeSpentOnResults: number;
}

interface IAlertSettings {
  enabled: boolean;
  frequency: "immediate" | "daily" | "weekly";
  lastAlertSent?: Date;
  alertCount: number;
}

interface ISearchPerformance {
  totalRuns: number;
  avgResultCount: number;
  lastResultCount: number;
  lastRunAt?: Date;
}

interface ISearch {
  searchId: string;
  query: string;
  queryHash?: string;
  metadata: IMetadata;
  stats: IStats;
  resultJobIds: string[];
  searchKeywords: string[];
  embedding?: number[];
  priority: number;
  quality?: IQuality;
  searchType: "simple" | "boolean" | "advanced";
  booleanOperators: Array<"AND" | "OR" | "NOT">;
  searchContext?: "trending" | "network" | "alumni" | "newgrad" | "senior" | "contract" | "startup" | "fortune500" | "no_experience";
  resultMetrics: IResultMetrics;
  isSaved: boolean;
  saveName: string;
  alertSettings: IAlertSettings;
  searchPerformance: ISearchPerformance;
  isAdvancedSearch: boolean;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ITemplate {
  id: string;
  name: string;
  coverLetter?: string;
  customization: Record<string, any>;
  createdAt: Date;
}

interface IQuickApplySettings {
  enabled: boolean;
  maxApplicationsPerDay: number;
  resumeId?: string;
  source: "direct" | "linkedin" | "referral" | "job-board";
  templates: ITemplate[];
}

interface ISearchFilters {
  skills: string[];
  locations: string[];
  experienceLevel: Array<"entry" | "mid" | "senior" | "executive">;
  salaryRange?: {
    min?: number;
    max?: number;
  };
  jobType: Array<"full-time" | "part-time" | "contract" | "internship" | "remote">;
}

interface IPreferences {
  searchFilters: ISearchFilters;
  quickApplySettings: IQuickApplySettings;
}

interface ISearchDocument extends Document {
  userId: string;
  searches: ISearch[];
  preferences: IPreferences;
  createdBy: string;
  updatedBy?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ISearchModel extends Model<ISearchDocument> {
  findUserSearches(
    userId: string,
    pagination?: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 1 | -1;
    }
  ): Promise<ISearchDocument | null>;
  findPopularSearches(timeFrame?: "7d" | "30d", limit?: number): Promise<any[]>;
  getActiveAlerts(frequency: "immediate" | "daily" | "weekly", limit?: number): Promise<any[]>;
  updateLastAlertSent(userId: string, searchId: string): Promise<any>;
}

interface IPagination {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 1 | -1;
}

// interface IUserProfile {
//   skills: string[];
//   preferences: Record<string, any>;
//   behaviorScore: {
//     topSkills: string[];
//     topLocations: string[];
//   };
//   applicationPattern: {
//     topCompanyTypes: string[];
//     topJobTypes: string[];
//     avgSalaryExpectation: number;
//     frequentSkills: string[];
//   };
//   lastActive: Date;
// }

interface IActivity {
  type: string;
  metadata?: {
    skills?: string[];
    location?: string;
  };
}

interface IJobApplication {
  jobId?: {
    skills?: string[];
    location?: string;
    salary?: number;
    jobType?: string;
    companySize?: string;
  };
}

// Schema Definition
const searchSchema = new Schema<ISearchDocument>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v: string) => validUUIDRegex.test(v),
        message: "Invalid userId UUID",
      },
    },
    searches: [
      {
        searchId: {
          type: String,
          default: uuidv4,
          validate: {
            validator: uuidValidate,
            message: "Invalid searchId UUID",
          },
        },
        query: {
          type: String,
          required: true,
          trim: true,
          maxlength: 500,
          validate: {
            validator: (v: string) =>
              !/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(v),
            message: "Query contains unsafe content",
          },
        },
        queryHash: { type: String },
        metadata: {
          type: {
            type: String,
            enum: ["location", "company", "keyword", "title", "natural"],
            required: true,
          },
          filters: {
            skills: [
              {
                name: {
                  type: String,
                  maxlength: 50,
                  lowercase: true,
                  trim: true,
                },
                weight: { type: Number, min: 0, max: 1, default: 0.5 },
              },
            ],
            locations: [
              {
                city: String,
                state: String,
                country: { type: String, default: "India" },
              },
            ],
            excludeKeywords: [
              { type: String, maxlength: 50, lowercase: true, trim: true },
            ],
            jobTypes: [
              {
                type: String,
                enum: [
                  "full-time",
                  "part-time",
                  "contract",
                  "freelance",
                  "internship",
                ],
              },
            ],
            experienceLevels: [
              {
                type: String,
                enum: [
                  "entry",
                  "junior",
                  "mid",
                  "senior",
                  "lead",
                  "principal",
                  "executive",
                ],
              },
            ],
            salaryRange: {
              min: { type: Number, min: 0 },
              max: { type: Number, min: 0 },
              currency: { type: String, default: "INR" },
            },
            companySize: {
              type: String,
              enum: ["startup", "small", "medium", "large", "enterprise"],
            },
            workMode: { type: String, enum: ["remote", "onsite", "hybrid"] },
            industry: { type: String, maxlength: 100, trim: true },
            postedWithin: { type: Number, min: 0 },
          },
          ip: { type: String, maxlength: 45 },
          userAgent: { type: String, maxlength: 500 },
          sessionId: { type: String, maxlength: 50 },
          referrer: { type: String, maxlength: 200 },
        },
        stats: {
          resultCount: { type: Number, default: 0, min: 0 },
          executionTime: { type: Number, default: 0, min: 0 },
          clickCount: { type: Number, default: 0, min: 0 },
          saveCount: { type: Number, default: 0, min: 0 },
          applyCount: { type: Number, default: 0, min: 0 },
          shareCount: { type: Number, default: 0, min: 0 },
          lastClickedAt: { type: Date },
          avgClickPosition: { type: Number, min: 0 },
        },
        resultJobIds: [{ type: String, maxlength: 36 }],
        searchKeywords: [{ type: String, maxlength: 50, lowercase: true }],
        embedding: { type: [Number], select: false },
        priority: { type: Number, default: 0, min: 0, max: 10 },
        quality: {
          relevanceScore: { type: Number, min: 0, max: 1 },
          userSatisfaction: { type: Number, min: 0, max: 5 },
          conversionRate: { type: Number, min: 0, max: 1 },
        },
        searchType: {
          type: String,
          enum: ["simple", "boolean", "advanced"],
          default: "simple",
        },
        booleanOperators: [{ type: String, enum: ["AND", "OR", "NOT"] }],
        searchContext: {
          type: String,
          enum: [
            "trending",
            "network",
            "alumni",
            "newgrad",
            "senior",
            "contract",
            "startup",
            "fortune500",
            "no_experience",
          ],
        },
        resultMetrics: {
          totalResults: { type: Number, default: 0 },
          clickedResults: { type: Number, default: 0 },
          applicationsMade: { type: Number, default: 0 },
          timeSpentOnResults: { type: Number, default: 0 },
        },
        isSaved: { type: Boolean, default: false },
        saveName: {
          type: String,
          maxlength: 100,
          trim: true,
          default: "My Search",
        },
        alertSettings: {
          enabled: { type: Boolean, default: true },
          frequency: {
            type: String,
            enum: ["immediate", "daily", "weekly"],
            default: "daily",
          },
          lastAlertSent: { type: Date },
          alertCount: { type: Number, default: 0 },
        },
        searchPerformance: {
          totalRuns: { type: Number, default: 0 },
          avgResultCount: { type: Number, default: 0 },
          lastResultCount: { type: Number, default: 0 },
          lastRunAt: { type: Date },
        },
        isAdvancedSearch: { type: Boolean, default: false },
        expiresAt: {
          type: Date,
          default: () => new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000),
        },
      },
    ],
    preferences: {
      searchFilters: {
        skills: [{ type: String, maxlength: 50 }],
        locations: [{ type: String, maxlength: 100 }],
        experienceLevel: [
          { type: String, enum: ["entry", "mid", "senior", "executive"] },
        ],
        salaryRange: {
          min: { type: Number, min: 0 },
          max: { type: Number, min: 0 },
        },
        jobType: [
          {
            type: String,
            enum: [
              "full-time",
              "part-time",
              "contract",
              "internship",
              "remote",
            ],
          },
        ],
      },
      quickApplySettings: {
        enabled: { type: Boolean, default: false },
        maxApplicationsPerDay: { type: Number, min: 1, max: 50, default: 10 },
        resumeId: {
          type: String,
          validate: {
            validator: (v: string) => !v || validUUIDRegex.test(v),
            message: "Invalid resumeId UUID",
          },
        },
        source: {
          type: String,
          enum: ["direct", "linkedin", "referral", "job-board"],
          default: "direct",
        },
        templates: [
          {
            id: {
              type: String,
              default: generateSecureId,
              validate: validUUIDRegex,
            },
            name: { type: String, maxlength: 100, required: true },
            coverLetter: { type: String, maxlength: 2000 },
            customization: { type: Object, default: {} },
            createdAt: { type: Date, default: Date.now },
          },
        ],
      },
    },
    createdBy: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => validUUIDRegex.test(v),
        message: "Invalid createdBy UUID",
      },
    },
    updatedBy: {
      type: String,
      validate: {
        validator: (v: string) => !v || validUUIDRegex.test(v),
        message: "Invalid updatedBy UUID",
      },
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "searches",
    // @ts-ignore - shardKey is valid but not in type definitions
    shardKey: { userId: 1 },
  }
);

// Optimized Indexes for 10M+ Users
searchSchema.index({ userId: 1, "searches.createdAt": -1 });
searchSchema.index({ "searches.searchId": 1 });
searchSchema.index({ "searches.queryHash": 1 });
searchSchema.index({ "searches.metadata.type": 1, "searches.createdAt": -1 });
searchSchema.index({ "searches.priority": -1, "searches.createdAt": -1 });
searchSchema.index({ isDeleted: 1 });
searchSchema.index({ "searches.stats.resultCount": 1 });
searchSchema.index({ "searches.metadata.sessionId": 1 });
searchSchema.index(
  { "searches.searchKeywords": "text" },
  { name: "search_text_index" }
);
searchSchema.index({ "searches.expiresAt": 1 }, { expireAfterSeconds: 0 });
searchSchema.index({ "searches.alertSettings.lastAlertSent": 1 });
searchSchema.index({
  "searches.alertSettings.frequency": 1,
  "searches.isActive": 1,
});

// Analytics Event Logger (Replaces Kafka)
class AnalyticsLogger {
  private static async logEvent(eventType: string, data: Record<string, any>): Promise<void> {
    try {
      // Log to application logger
      logger.info(`Analytics Event: ${eventType}`, data);

      // Store in Redis for batch processing
      const event = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
      };

      await CacheUtil.lpush('analytics:events', JSON.stringify(event));
      await CacheUtil.ltrim('analytics:events', 0, 9999); // Keep last 10k events

      // Optionally: Send to external analytics service via HTTP
      // await this.sendToAnalyticsService(event);
    } catch (error : any) {
      logger.error('Failed to log analytics event:', error);
    }
  }

  static async searchCreated(data: {
    searchId: string;
    userId: string;
    query: string;
    type: string;
    filters: any;
  }): Promise<void> {
    await this.logEvent('analytics:search_created', data);
  }

  static async searchUpdated(data: {
    searchId: string;
    changes: string[];
  }): Promise<void> {
    await this.logEvent('analytics:search_updated', data);
  }
}

// Embedding Service (Replaces Vector DB)
class EmbeddingService {
  private static model = genAI.getGenerativeModel({ model: "embedding-001" });

  static async generateSearchEmbedding(search: ISearch): Promise<void> {
    // try {
    //   // Generate embedding using Gemini
    //   const text = `${search.query} ${search.searchKeywords.join(' ')}`;
    //   const result = await this.model.embedContent(text);
    //   search.embedding = result.embedding.values;

    //   // Store in Redis for similarity search
    //   const key = `embedding:${search.searchId}`;
    //   await CacheUtil.set(key, JSON.stringify(search.embedding), 86400 );
    // } catch (error : any) {
    //   logger.error('Failed to generate embedding:', error);
    // }
  }

  static async findSimilarSearches(embedding: number[], limit: number = 10) {
    //   try {
    //     // Retrieve stored embeddings from Redis
    //     // const keys = await CacheUtil.keys('embedding:*');
    //   //   const similarities: Array<{ id: string; score: number }> = [];

    //   //   for (const key of keys.slice(0, 100)) { // Limit to prevent performance issues
    //   //     const storedEmbedding = await CacheUtil.get(key);
    //   //     if (storedEmbedding) {
    //   //       const parsed = JSON.parse(storedEmbedding);
    //   //       const similarity = this.cosineSimilarity(embedding, parsed);
    //   //       similarities.push({
    //   //         id: key.replace('embedding:', ''),
    //   //         score: similarity,
    //   //       });
    //   //     }
    //   //   }

    //   //   return similarities
    //   //     .sort((a, b) => b.score - a.score)
    //   //     .slice(0, limit)
    //   //     .map(s => s.id);
    //   // } catch (error : any) {
    //   //   logger.error('Failed to find similar searches:', error);
    //   //   return [];
    //   // }
    // }

    // private static cosineSimilarity(a: number[], b: number[]): number {
    //   const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    //   const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    //   const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    //   return dotProduct / (magA * magB);
    // }
  }
}

// Pre-save Middleware
searchSchema.pre("save", async function (next) {
  try {
    this.updatedAt = new Date();
    if (this.createdBy) this.createdBy = sanitizeUserId(this.createdBy);
    if (this.updatedBy) this.updatedBy = sanitizeUserId(this.updatedBy);

    for (const search of this.searches) {
      if (!search.queryHash) {
        search.queryHash = createHash("md5")
          .update(
            `${this.userId}:${search.query}:${JSON.stringify(
              search.metadata.filters
            )}`
          )
          .digest("hex");
      }

      search.searchKeywords = [
        ...search.query.toLowerCase().split(/\s+/),
        ...search.metadata.filters.skills.map((s) => s.name),
        ...search.metadata.filters.excludeKeywords,
        search.metadata.type,
      ]
        .filter(Boolean)
        .filter((item, index, arr) => arr.indexOf(item) === index)
        .slice(0, 20);

      if (search.stats.clickCount > 0) {
        search.priority = Math.min(10, search.stats.clickCount * 2);
      }

      // Replace Kafka events with AnalyticsLogger
      if (this.isNew || (search as any).isNew) {
        await AnalyticsLogger.searchCreated({
          searchId: search.searchId,
          userId: this.userId,
          query: search.query,
          type: search.metadata.type,
          filters: search.metadata.filters,
        });
      } else if (this.isModified()) {
        await AnalyticsLogger.searchUpdated({
          searchId: search.searchId,
          changes: this.modifiedPaths(),
        });
      }

      // Replace Vector DB with EmbeddingService
      await EmbeddingService.generateSearchEmbedding(search);
    }

    next();
  } catch (error : any) {
    logger.error("Search pre-save error:", error);
    next(error as Error);
  }
});

// Static Methods
searchSchema.statics.findUserSearches = async function (
  userId: string,
  pagination: IPagination = {}
): Promise<ISearchDocument | null> {
  const {
    page = 1,
    limit = 20,
    sortBy = "searches.createdAt",
    sortOrder = -1,
  } = pagination;
  return this.findOne({ userId, isDeleted: false })
    .select("searches preferences")
    .slice("searches", [(page - 1) * limit, limit])
    .sort({ [sortBy]: sortOrder })
    .lean();
};

searchSchema.statics.findPopularSearches = async function (
  timeFrame: "7d" | "30d" = "7d",
  limit: number = 10
): Promise<any[]> {
  const days = timeFrame === "7d" ? 7 : 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.aggregate([
    { $match: { isDeleted: false } },
    { $unwind: "$searches" },
    { $match: { "searches.createdAt": { $gte: startDate } } },
    {
      $group: {
        _id: "$searches.queryHash",
        query: { $first: "$searches.query" },
        count: { $sum: 1 },
        avgResults: { $avg: "$searches.stats.resultCount" },
        totalClicks: { $sum: "$searches.stats.clickCount" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
};

searchSchema.statics.getActiveAlerts = async function (
  frequency: "immediate" | "daily" | "weekly",
  limit: number = 1000
): Promise<any[]> {
  return this.find({
    "searches.alertSettings.frequency": frequency,
    "searches.isActive": true,
    $or: [
      {
        "searches.alertSettings.lastAlertSent": {
          $lte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      { "searches.alertSettings.lastAlertSent": null },
    ],
  })
    .select("userId searches")
    .slice("searches", limit)
    .lean();
};

searchSchema.statics.updateLastAlertSent = async function (
  userId: string,
  searchId: string
): Promise<any> {
  return this.updateOne(
    { userId, "searches.searchId": searchId, "searches.isActive": true },
    { $set: { "searches.$.alertSettings.lastAlertSent": new Date() } }
  );
};

const SearchModel = mongoose.model<ISearchDocument, ISearchModel>("Search", searchSchema);

// Cache Manager
export class CacheManager {
  static async getMultiLevel(key: string, userId: string | null = null): Promise<any> {
    const userKey = userId ? `${key}:${userId}` : key;

    try {
      // L1 Cache: Hot data (30 seconds)
      let result = await CacheUtil.get(`hot:${userKey}`);
      if (result) {
        cacheHits.inc({ cache_type: "hot" });
        return JSON.parse(result);
      }

      // L2 Cache: Warm data (5 minutes)
      result = await CacheUtil.get(`warm:${userKey}`);
      if (result) {
        cacheHits.inc({ cache_type: "warm" });
        // Promote to hot cache
        await CacheUtil.set(`hot:${userKey}`, result, 30);
        return JSON.parse(result);
      }

      // L3 Cache: Cold data (30 minutes)
      result = await CacheUtil.get(`cold:${key}`);
      if (result) {
        cacheHits.inc({ cache_type: "cold" });
        return JSON.parse(result);
      }
    } catch (error: any) {
      logger.error("Cache get error:", { error: error.message, stack: error.stack });
    }

    return null;
  }

  static async setMultiLevel(key: string, data: any, userId: string | null = null): Promise<void> {
    const userKey = userId ? `${key}:${userId}` : key;
    const dataStr = JSON.stringify(data);

    try {
      await Promise.all([
        CacheUtil.set(`hot:${userKey}`, dataStr, 30),
        CacheUtil.set(`warm:${userKey}`, dataStr, 300),
        CacheUtil.set(`cold:${key}`, dataStr, 1800),
      ]);
    } catch (error: any) {
      logger.error("Cache set error:", { error: error.message, stack: error.stack });
      throw error;
    }
  }
}

// Personalization Engine
export class PersonalizationEngine {
  static async getUserProfile(userId: string, req: any): Promise<IUserProfile> {
    const cacheKey = `user:profile:${userId}`;
    let profile = await CacheManager.getMultiLevel(cacheKey, userId);

    if (!validId(userId)) {
      throw new Error("User ID is not valid in PersonalizationEngine");
    }

    if (!profile) {
      const user = req.user || { skills: [], preferences: {} };

      const activities = await UserInteractionModel.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const applications = await JobApplication.find({ userId })
        .populate("jobId", "skills location salary jobType companySize")
        .limit(20)
        .lean();

      profile = {
        skills: user.skills || [],
        preferences: user.preferences || {},
        behaviorScore: this.calculateBehaviorScore(activities),
        applicationPattern: this.analyzeApplicationPattern(applications),
        lastActive: new Date(),
      };

      await CacheManager.setMultiLevel(cacheKey, profile, userId);
    }

    return profile;
  }

  static calculateBehaviorScore(activities: any[]): {
  topSkills: string[];
  topLocations: string[];
} {
  const scores = {
    skillInterest: new Map<string, number>(),
    locationInterest: new Map<string, number>(),
    companyTypeInterest: new Map<string, number>(),
    salaryRangeInterest: new Map<string, number>(),
  };

  activities.forEach((activity) => {
    if (activity.activityType === "job_view" || activity.activityType === "job_click") {
      const weight = activity.activityType === "job_click" ? 2 : 1;

      if (activity.metadata?.skills) {
        activity.metadata.skills.forEach((skill: string) => {
          scores.skillInterest.set(
            skill,
            (scores.skillInterest.get(skill) || 0) + weight
          );
        });
      }

      if (activity.metadata?.location) {
        scores.locationInterest.set(
          activity.metadata.location,
          (scores.locationInterest.get(activity.metadata.location) || 0) + weight
        );
      }
    }
  });

  return {
    topSkills: Array.from(scores.skillInterest.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([skill]) => skill),
    topLocations: Array.from(scores.locationInterest.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([location]) => location),
  };
}

  static analyzeApplicationPattern(applications: any[]): {
  topCompanyTypes: string[];
  topJobTypes: string[];
  avgSalaryExpectation: number;
  frequentSkills: string[];
} {
  if (!applications.length) return {
    topCompanyTypes: [],
    topJobTypes: [],
    avgSalaryExpectation: 0,
    frequentSkills: [],
  };

  const patterns = {
    preferredCompanyTypes: new Map<string, number>(),
    preferredJobTypes: new Map<string, number>(),
    salaryExpectations: [] as number[],
    skillFrequency: new Map<string, number>(),
  };

  applications.forEach((app) => {
    // ✅ Fix: Handle populated jobId which could be an object
    const job = typeof app.jobId === 'object' ? app.jobId : null;
    
    if (job) {
      const companyType = job.companySize || "unknown";
      patterns.preferredCompanyTypes.set(
        companyType,
        (patterns.preferredCompanyTypes.get(companyType) || 0) + 1
      );

      if (job.jobType) {
        patterns.preferredJobTypes.set(
          job.jobType,
          (patterns.preferredJobTypes.get(job.jobType) || 0) + 1
        );
      }

      if (job.salary?.amount) {
        patterns.salaryExpectations.push(job.salary.amount);
      }

      if (job.skills && Array.isArray(job.skills)) {
        job.skills.forEach((skillObj: any) => {
          const skillName = typeof skillObj === 'string' ? skillObj : skillObj.name;
          if (skillName) {
            patterns.skillFrequency.set(
              skillName,
              (patterns.skillFrequency.get(skillName) || 0) + 1
            );
          }
        });
      }
    }
  });

  return {
    topCompanyTypes: Array.from(patterns.preferredCompanyTypes.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([type]) => type),
    topJobTypes: Array.from(patterns.preferredJobTypes.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([type]) => type),
    avgSalaryExpectation:
      patterns.salaryExpectations.length > 0
        ? patterns.salaryExpectations.reduce((a, b) => a + b, 0) /
        patterns.salaryExpectations.length
        : 0,
    frequentSkills: Array.from(patterns.skillFrequency.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([skill]) => skill),
  };
}
}

export { AnalyticsLogger, EmbeddingService };
export default SearchModel;