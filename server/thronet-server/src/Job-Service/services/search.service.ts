// src/services/advancedSearch.service.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "@/shared/logger.util";
import { Job, UserInteractionModel , JobApplication, Search } from "../models";
import { User } from "@/auth/models";
import esClient from "@/config/cache/elasticsearch";
import {
  AppError,
  NotFoundError,
  DatabaseError,
  ExternalServiceError,
  ValidationError,
} from "@/shared/errors/app.error";
import { generateSecureId } from "@/shared/security";
import dotenv from 'dotenv';
import CacheUtil from "@/shared/cache.util";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// =============================================
// calculateSimilarityScore
// =============================================
export function calculateSimilarityScore(referenceJob: any, compareJob: any): number {
  let score = 0;
  let maxScore = 0;

  if (referenceJob.skills?.length && compareJob.skills?.length) {
    const refSkills = referenceJob.skills.map((s: any) => s.name?.toLowerCase() ?? "");
    const compSkills = compareJob.skills.map((s: any) => s.name?.toLowerCase() ?? "");
    const intersection = refSkills.filter((skill: string) => compSkills.includes(skill));
    const union = [...new Set([...refSkills, ...compSkills])];
    score += (intersection.length / union.length) * 40;
  }
  maxScore += 40;

  if (referenceJob.jobType === compareJob.jobType) score += 20;
  maxScore += 20;

  if (referenceJob.location?.city === compareJob.location?.city) score += 15;
  maxScore += 15;

  if (referenceJob.experienceLevel === compareJob.experienceLevel) score += 10;
  maxScore += 10;

  if (referenceJob.companyName === compareJob.companyName) score += 10;
  maxScore += 10;

  if (referenceJob.salary?.amount && compareJob.salary?.amount) {
    const salaryDiff = Math.abs(referenceJob.salary.amount - compareJob.salary.amount);
    const avgSalary = (referenceJob.salary.amount + compareJob.salary.amount) / 2;
    const similarity = Math.max(0, 1 - salaryDiff / avgSalary);
    score += similarity * 5;
  }
  maxScore += 5;

  return maxScore > 0 ? (score / maxScore) * 100 : 0;
}

// =============================================
// analyzeSearchHistory
// =============================================
export async function analyzeSearchHistory(searchHistory: any[], userId: string) {
  try {
    const analysis: any = {
      searchPatterns: {
        mostSearchedTerms: new Map<string, number>(),
        searchFrequency: new Map<string, number>(),
        timePatterns: new Map<number, number>(),
        skillTrends: new Map<string, number>(),
        locationTrends: new Map<string, number>(),
      },
      insights: [],
      recommendations: [],
      trends: [],
    };

    searchHistory.forEach((search: any) => {
      if (search.query) {
        analysis.searchPatterns.mostSearchedTerms.set(
          search.query,
          (analysis.searchPatterns.mostSearchedTerms.get(search.query) || 0) + 1
        );
      }

      const day = search.createdAt.toISOString().split("T")[0];
      analysis.searchPatterns.searchFrequency.set(day, (analysis.searchPatterns.searchFrequency.get(day) || 0) + 1);

      const hour = search.createdAt.getHours();
      analysis.searchPatterns.timePatterns.set(hour, (analysis.searchPatterns.timePatterns.get(hour) || 0) + 1);

      if (search.metadata?.filters?.skills) {
        search.metadata.filters.skills.forEach((skill: string) => {
          analysis.searchPatterns.skillTrends.set(skill, (analysis.searchPatterns.skillTrends.get(skill) || 0) + 1);
        });
      }

      if (search.metadata?.filters?.location) {
        search.metadata.filters.location.forEach((loc: string) => {
          analysis.searchPatterns.locationTrends.set(loc, (analysis.searchPatterns.locationTrends.get(loc) || 0) + 1);
        });
      }
    });

    // Line 107, 111, 115 - Use type casting
    analysis.searchPatterns.mostSearchedTerms = Array.from(analysis.searchPatterns.mostSearchedTerms.entries())
      .sort((a, b) => (b as [string, number])[1] - (a as [string, number])[1])
      .slice(0, 10);

    analysis.searchPatterns.skillTrends = Array.from(analysis.searchPatterns.skillTrends.entries())
      .sort((a, b) => (b as [string, number])[1] - (a as [string, number])[1])
      .slice(0, 10);

    analysis.searchPatterns.locationTrends = Array.from(analysis.searchPatterns.locationTrends.entries())
      .sort((a, b) => (b as [string, number])[1] - (a as [string, number])[1])
      .slice(0, 5);
    // analysis.searchPatterns.mostSearchedTerms = Array.from(analysis.searchPatterns.mostSearchedTerms.entries())
    //   .sort(([, a], [, b]) => b - a)
    //   .slice(0, 10);

    // analysis.searchPatterns.skillTrends = Array.from(analysis.searchPatterns.skillTrends.entries())
    //   .sort(([, a], [, b]) => b - a)
    //   .slice(0, 10);

    // analysis.searchPatterns.locationTrends = Array.from(analysis.searchPatterns.locationTrends.entries())
    //   .sort(([, a], [, b]) => b - a)
    //   .slice(0, 5);

    if (analysis.searchPatterns.mostSearchedTerms.length > 0) {
      analysis.insights.push({
        type: "top_search",
        message: `Your most searched term is "${analysis.searchPatterns.mostSearchedTerms[0][0]}" (${analysis.searchPatterns.mostSearchedTerms[0][1]} times)`,
        priority: "high",
      });
    }

    if (analysis.searchPatterns.skillTrends.length > 0) {
      analysis.insights.push({
        type: "skill_focus",
        message: `You're most interested in ${analysis.searchPatterns.skillTrends[0][0]} skills`,
        priority: "medium",
      });
    }

    const topSkills = analysis.searchPatterns.skillTrends.slice(0, 3).map(([skill]: [string, number]) => skill);
    if (topSkills.length > 0) {
      analysis.recommendations.push({
        type: "skill_development",
        message: `Consider taking courses in: ${topSkills.join(", ")}`,
        action: "explore_courses",
      });
    }

    const recentSearches = searchHistory.slice(0, 10);
    const oldSearches = searchHistory.slice(-10);
    if (recentSearches.length > 0 && oldSearches.length > 0) {
      const recentTerms = new Set(recentSearches.map((s: any) => s.query).filter(Boolean));
      const oldTerms = new Set(oldSearches.map((s: any) => s.query).filter(Boolean));
      const newTerms = [...recentTerms].filter((term) => !oldTerms.has(term));
      if (newTerms.length > 0) {
        analysis.trends.push({
          type: "emerging_interest",
          message: `New search interests: ${newTerms.slice(0, 3).join(", ")}`,
          trend: "up",
        });
      }
    }

    return analysis;
  } catch (error: any) {
    logger.error("Failed to analyze search history", { userId });
    throw new DatabaseError("Search history analysis failed");
  }
}

// =============================================
// getSkillSuggestions
// =============================================
export async function getSkillSuggestions(query: string, userProfile: any, limit: number = 10): Promise<any> {
  try {
    const esQuery = {
      suggest: {
        skill_suggest: {
          prefix: query.toLowerCase(),
          completion: {
            field: 'skills.name.suggest',
            size: limit,
            fuzzy: { fuzziness: 'AUTO' },
            contexts: userProfile?.behaviorScore ? { skills: userProfile.behaviorScore.topSkills || [] } : undefined,
          },
        },
      },
    };

    if (!esClient) {
      throw new ExternalServiceError("Elasticsearch client not initialized");
    }

    const esResponse = await esClient.search({
      index: 'jobs',
      body: esQuery
    } as any);

    // ✅ Fix: Handle undefined suggest and non-array options
    const skillSuggest = esResponse.suggest?.skill_suggest?.[0];
    const options = skillSuggest?.options;

    if (!options) {
      return [];
    }

    const optionsArray = Array.isArray(options) ? options : [options];

    const suggestions = optionsArray.map((opt: any) => ({
      value: opt.text,
      label: opt.text,
      count: opt._score,
      score: opt._score * (userProfile?.behaviorScore?.topSkills?.includes(opt.text) ? 1.5 : 1),
      personalized: userProfile?.behaviorScore?.topSkills?.includes(opt.text) || false,
    }));

    return suggestions;
  } catch (error: any) {
    logger.warn(`Elasticsearch skill suggestions failed, using MongoDB fallback: ${error.message}`);
    // ... rest of fallback code
  }
}

// =============================================
// getCompanySuggestions
// =============================================
export async function getCompanySuggestions(query: string, userProfile: any, limit: number = 10): Promise<any> {
  try {
    const esQuery = {
      suggest: {
        company_suggest: {
          prefix: query.toLowerCase(),
          completion: {
            field: 'companyName.suggest',
            size: limit,
            fuzzy: { fuzziness: 'AUTO' },
            contexts: userProfile?.behaviorScore ? { location: userProfile.behaviorScore.topLocations || [] } : undefined,
          },
        },
      },
    };

    // ✅ Fix: Change indices.search to search
    if (!esClient) {
      throw new ExternalServiceError("Elasticsearch client not initialized");
    }

    const esResponse = await esClient.search({ index: 'jobs', body: esQuery } as any);

    // ✅ Fix: Handle undefined and non-array
    const companySuggest = esResponse.suggest?.company_suggest?.[0];
    const options = companySuggest?.options;

    if (!options) {
      return [];
    }

    const optionsArray = Array.isArray(options) ? options : [options];

    const suggestions = optionsArray.map((opt: any) => ({
      value: opt.text,
      label: opt.text,
      count: opt._score,
      score: opt._score * (userProfile?.behaviorScore?.topLocations?.length ? 1.2 : 1),
      personalized: !!userProfile?.behaviorScore?.topLocations?.length,
    }));

    return suggestions;
  } catch (error: any) {
    // ... fallback code
  }
}

// =============================================
// getLocationSuggestions
// =============================================
export async function getLocationSuggestions(query: string, userProfile: any, limit: number = 10): Promise<any> {
  try {
    const esQuery = {
      suggest: {
        location_suggest: {
          prefix: query.toLowerCase(),
          completion: {
            field: 'location.city.suggest',
            size: limit,
            fuzzy: { fuzziness: 'AUTO' },
            contexts: userProfile?.behaviorScore ? { location: userProfile.behaviorScore.topLocations || [] } : undefined,
          },
        },
      },
    };

    if (!esClient) {
      throw new ExternalServiceError("Elasticsearch client not initialized");
    }

    const esResponse = await esClient.search({ index: 'jobs', body: esQuery } as any);

    const locationSuggest = esResponse.suggest?.location_suggest?.[0];
    const options = locationSuggest?.options;

    if (!options) {
      return [];
    }

    const optionsArray = Array.isArray(options) ? options : [options];

    const suggestions = optionsArray.map((opt: any) => ({
      value: opt.text,
      label: opt.text,
      count: opt._score,
      score: opt._score * (userProfile?.behaviorScore?.topLocations?.includes(opt.text) ? 1.5 : 1),
      personalized: userProfile?.behaviorScore?.topLocations?.includes(opt.text) || false,
    }));

    return suggestions;
  } catch (error: any) {
    // ... fallback
  }
}

// =============================================
// getJobTitleSuggestions
// =============================================
export async function getJobTitleSuggestions(query: string, userProfile: any, limit: number = 10): Promise<any> {
  try {
    const esQuery = {
      suggest: {
        title_suggest: {
          prefix: query.toLowerCase(),
          completion: {
            field: 'title.suggest',
            size: limit,
            fuzzy: { fuzziness: 'AUTO' },
            contexts: userProfile?.behaviorScore ? { skills: userProfile.behaviorScore.topSkills || [] } : undefined,
          },
        },
      },
    };
    if (!esClient) {
      throw new ExternalServiceError("Elasticsearch client not initialized");
    }

    const esResponse = await esClient.search({ index: 'jobs', body: esQuery } as any);

    const locationSuggest = esResponse.suggest?.location_suggest?.[0];
    const options = locationSuggest?.options;

    if (!options) {
      return [];
    }

    const optionsArray = Array.isArray(options) ? options : [options];

    const suggestions = optionsArray.map((opt: any) => ({
      value: opt.text,
      label: opt.text,
      count: opt._score,
      score: opt._score * (userProfile?.behaviorScore?.topLocations?.includes(opt.text) ? 1.5 : 1),
      personalized: userProfile?.behaviorScore?.topLocations?.includes(opt.text) || false,
    }));

    return suggestions;
  } catch (error: any) {
    logger.warn(`Elasticsearch title suggestions failed, using MongoDB: ${error.message}`);

    const pipeline: any[] = [  // ✅ Add 'any[]' type
      { $match: { 'skills.name': { $regex: query, $options: 'i' }, status: 'active', isDeleted: false } },
      { $unwind: '$skills' },
      { $match: { 'skills.name': { $regex: query, $options: 'i' } } },
      {
        $group: {
          _id: '$skills.name',
          count: { $sum: 1 },
          avgSalary: { $avg: '$salary.amount' },
        },
      },
      { $sort: { count: -1 as -1 } },  // ✅ Type assertion
      { $limit: limit },
      {
        $project: {
          value: '$_id',
          label: '$_id',
          count: 1,
          avgSalary: { $round: ['$avgSalary', 0] },
          score: { $multiply: ['$count', 1] },
        },
      },
    ];

    const results = await Job.aggregate(pipeline);

    if (userProfile?.behaviorScore?.topSkills) {
      results.forEach((result: any) => {
        result.score += 30;
        result.personalized = true;
      });
    }

    return results;
  }
}

// =============================================
// generateEnhancedSuggestions
// =============================================
export async function generateEnhancedSuggestions(
  query: string,
  type: string,
  userProfile: any,
  limit: number
) {
  const suggestions: {
    suggestions: any[];
    metadata: {
      query: string;
      type: string;
      personalized: boolean;
      algorithms: string[];
    };
  } = {
    suggestions: [],
    metadata: {
      query,
      type,
      personalized: !!userProfile,
      algorithms: [],
    },
  };

  const queryLower = query.toLowerCase();

  try {
    switch (type) {
      case 'skills':
        suggestions.suggestions = await getSkillSuggestions(queryLower, userProfile, limit);
        suggestions.metadata.algorithms.push('skill_matching');
        break;

      case 'companies':
        suggestions.suggestions = await getCompanySuggestions(queryLower, userProfile, limit);
        suggestions.metadata.algorithms.push('company_matching');
        break;

      case 'locations':
        suggestions.suggestions = await getLocationSuggestions(queryLower, userProfile, limit);
        suggestions.metadata.algorithms.push('location_matching');
        break;

      case 'titles':
        suggestions.suggestions = await getJobTitleSuggestions(queryLower, userProfile, limit);
        suggestions.metadata.algorithms.push('title_matching');
        break;

      case 'mixed':
      default:
        const [skills, companies, locations, jobTitles] = await Promise.all([
          getSkillSuggestions(queryLower, userProfile, Math.ceil(limit * 0.3)),
          getCompanySuggestions(queryLower, userProfile, Math.ceil(limit * 0.25)),
          getLocationSuggestions(queryLower, userProfile, Math.ceil(limit * 0.2)),
          getJobTitleSuggestions(queryLower, userProfile, Math.ceil(limit * 0.25)),
        ]);

        suggestions.suggestions = [
          ...skills.map((s: any) => ({ ...s, category: 'skill' })),
          ...companies.map((s: any) => ({ ...s, category: 'company' })),
          ...locations.map((s: any) => ({ ...s, category: 'location' })),
          ...jobTitles.map((s: any) => ({ ...s, category: 'title' })),
        ].sort((a: any, b: any) => (b.score || 0) - (a.score || 0)).slice(0, limit);

        suggestions.metadata.algorithms.push('mixed_intelligent');
        break;
    }

    return suggestions;
  } catch (error: any) {
    logger.error(`Failed to generate enhanced suggestions: ${error.message}`, {
      error: error.stack,
      query,
      type,
      limit,
    });
    throw new ExternalServiceError("Enhanced suggestions generation failed");
  }
}
// =============================================
// buildRecentlyViewedQuery
// =============================================
export const buildRecentlyViewedQuery = (value: any, userProfile: any) => {
  const query: any = { userId: value.userId, type: "view", entityType: "job" };
  if (userProfile?.preferences?.jobTypes) {
    query["job.jobType"] = { $in: userProfile.preferences.jobTypes };
  }
  return query;
};

// // =============================================
// // getSortOptions
// // =============================================
// export const getSortOptions = (sortBy = "createdAt", sortOrder = "desc") => ({
//   [sortBy]: sortOrder === "asc" ? 1 : -1,
// });

// =============================================
// AdvancedSearchEngine
// =============================================
export class AdvancedSearchEngine {
  static async buildElasticsearchQuery(query: string, filters: any, userProfile: any = null) {
    try {
      const esQuery: any = {  // ✅ Add 'any' type
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: ['title^3', 'description^1.5', 'skills.name^2', 'companyName^2', 'requirements'],
                fuzziness: 'AUTO',
                operator: 'and'
              }
            }
          ],
          filter: [] as any[],  // ✅ Type as any[]
          should: [] as any[]   // ✅ Type as any[]
        }
      };

      esQuery.bool.filter.push({ term: { status: 'active' } });
      esQuery.bool.filter.push({ term: { isDeleted: false } });
      esQuery.bool.filter.push({ range: { 'dates.expires': { gt: new Date().toISOString() } } });

      if (filters.location?.length) {
        esQuery.bool.filter.push({ terms: { 'location.city.keyword': filters.location } });
      }

      if (filters.skills?.length) {
        esQuery.bool.filter.push({ terms: { 'skills.name.keyword': filters.skills } });
      }

      if (filters.experience?.length) {
        esQuery.bool.filter.push({ terms: { 'experienceLevel.keyword': filters.experience } });
      }

      if (filters.jobType?.length) {
        esQuery.bool.filter.push({ terms: { 'jobType.keyword': filters.jobType } });
      }

      if (filters.salary) {
        const salaryRange: any = {};
        if (filters.salary.min) salaryRange.gte = filters.salary.min;
        if (filters.salary.max) salaryRange.lte = filters.salary.max;
        esQuery.bool.filter.push({ range: { 'salary.amount': salaryRange } });
      }

      if (filters.remote === true) {
        esQuery.bool.filter.push({ term: { remote: true } });
      }

      if (filters.companySize?.length) {
        esQuery.bool.filter.push({ terms: { 'companySize.keyword': filters.companySize } });
      }

      if (filters.postedDate) {
        const dateMap: { [key: string]: number } = { '24h': 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30 };
        const daysAgo = dateMap[filters.postedDate] || 30;
        const dateThreshold = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        esQuery.bool.filter.push({ range: { 'dates.posted': { gte: dateThreshold.toISOString() } } });
      }

      if (userProfile?.behaviorScore) {
        if (userProfile.behaviorScore.topSkills?.length) {
          esQuery.bool.should.push({
            terms: {
              'skills.name.keyword': userProfile.behaviorScore.topSkills,
              boost: 2.0
            }
          });
        }

        if (userProfile.behaviorScore.topLocations?.length) {
          esQuery.bool.should.push({
            terms: {
              'location.city.keyword': userProfile.behaviorScore.topLocations,
              boost: 1.5
            }
          });
        }
      }

      return esQuery;
    } catch (error: any) {
      logger.error("Failed to build Elasticsearch query", { error });
      throw new ExternalServiceError("Elasticsearch query building failed");
    }
  }

  static async searchElasticsearch(query: string, filters: any, page: number, limit: number, sort: string, userProfile: any) {
    try {
      const esQuery = await this.buildElasticsearchQuery(query, filters, userProfile);

      const sortOptions: any = {
        relevance: [{ _score: { order: 'desc' } }],
        date: [{ 'dates.posted': { order: 'desc' } }],
        salary: [{ 'salary.amount': { order: 'desc' } }],
        company: [{ 'companyName.keyword': { order: 'asc' } }]
      };

      const searchParams: any = {
        index: 'jobs',
        body: {
          query: esQuery,
          sort: sortOptions[sort] || sortOptions.relevance,
          from: (page - 1) * limit,
          size: limit,
          _source: ['jobId', 'title', 'companyName', 'location', 'salary', 'jobType', 'skills', 'dates.posted', 'remote', 'experienceLevel', 'description'],
          highlight: {
            fields: { title: {}, description: {}, 'skills.name': {} }
          }
        }
      };

      if (!esClient) {
        throw new ExternalServiceError("Elasticsearch client not initialized");
      }

      const response = await esClient.search(searchParams);

      // ✅ Fix: Handle both number and object types for total
      const total = typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value || 0;

      return {
        hits: response.hits.hits.map((hit: any) => ({
          ...hit._source,
          score: hit._score,
          highlights: hit.highlight,
          personalizationScore: userProfile ? this.calculatePersonalizationScore(hit._source, userProfile) : 50
        })),
        total // ✅ Use the fixed total
      };
    } catch (error: any) {
      logger.error("Elasticsearch search failed", { query, page, limit });
      throw new ExternalServiceError("Elasticsearch search failed");
    }
  }

  static async searchMongoDB(query: string, filters: any, page: number, limit: number, sort: string, userProfile: any) {
    try {
      const mongoQuery: any = {
        $text: { $search: query },
        status: 'active',
        isDeleted: false,
        'dates.expires': { $gt: new Date() }
      };

      if (filters.location?.length) mongoQuery['location.city'] = { $in: filters.location };
      if (filters.skills?.length) mongoQuery['skills.name'] = { $in: filters.skills.map((s: string) => new RegExp(s, 'i')) };
      if (filters.experience?.length) mongoQuery.experienceLevel = { $in: filters.experience };
      if (filters.jobType?.length) mongoQuery.jobType = { $in: filters.jobType };

      if (filters.salary) {
        const salaryQuery: any = {};
        if (filters.salary.min) salaryQuery.$gte = filters.salary.min;
        if (filters.salary.max) salaryQuery.$lte = filters.salary.max;
        mongoQuery['salary.amount'] = salaryQuery;
      }

      if (filters.remote === true) mongoQuery.remote = true;
      if (filters.companySize?.length) mongoQuery.companySize = { $in: filters.companySize };

      if (filters.postedDate) {
        const dateMap: { [key: string]: number } = { '24h': 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30 };
        const daysAgo = dateMap[filters.postedDate] || 30;
        const dateThreshold = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        mongoQuery['dates.posted'] = { $gte: dateThreshold };
      }

      const sortOptions: any = {
        relevance: { score: { $meta: 'textScore' } },
        date: { 'dates.posted': -1 },
        salary: { 'salary.amount': -1 },
        company: { companyName: 1 }
      };

      const [jobs, total] = await Promise.all([
        Job.find(mongoQuery)
          .select('jobId title companyName location salary jobType skills dates.posted remote experienceLevel description')
          .sort(sortOptions[sort] || sortOptions.relevance)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Job.countDocuments(mongoQuery)
      ]);

      return {
        hits: jobs.map(job => ({
          ...job,
          personalizationScore: userProfile ? this.calculatePersonalizationScore(job, userProfile) : 50
        })),
        total
      };
    } catch (error: any) {
      logger.error("MongoDB search failed", { query, page, limit });
      throw new DatabaseError("MongoDB search failed");
    }
  }

  static calculatePersonalizationScore(job: any, userProfile: any): number {
    let score = 50;

    if (userProfile?.skills && job.skills) {
      const matchingSkills = userProfile.skills.filter((skill: string) => job.skills.some((js: any) => js.name.toLowerCase().includes(skill.toLowerCase())));
      score += matchingSkills.length * 10;
    }

    if (userProfile?.behaviorScore?.topSkills && job.skills) {
      const matchingTopSkills = userProfile.behaviorScore.topSkills.filter((skill: string) => job.skills.some((js: any) => js.name.toLowerCase().includes(skill.toLowerCase())));
      score += matchingTopSkills.length * 15;
    }

    if (userProfile?.preferences?.location && job.location?.city) {
      score += userProfile.preferences.location === job.location.city ? 20 : 0;
    }

    if (userProfile?.behaviorScore?.topLocations && job.location?.city) {
      score += userProfile.behaviorScore.topLocations.includes(job.location.city) ? 15 : 0;
    }

    return score;
  }
}

// =============================================
// AnalyticsProcessor
// =============================================
export class AnalyticsProcessor {
  static analyticsBuffer: any[] = [];
  static BUFFER_SIZE = 100;
  static FLUSH_INTERVAL = 10000;

  static init() {
    setInterval(() => this.flushAnalytics(), this.FLUSH_INTERVAL);
  }

  static addEvent(event: any) {
    this.analyticsBuffer.push({
      ...event,
      timestamp: new Date(),
      id: generateSecureId()
    });

    if (this.analyticsBuffer.length >= this.BUFFER_SIZE) {
      setImmediate(() => this.flushAnalytics());
    }
  }

  static async flushAnalytics() {
    if (this.analyticsBuffer.length === 0) return;

    const events = this.analyticsBuffer.splice(0);

    try {
      await Search.insertMany(events.map((event: any) => ({
        userId: event.userId,
        query: event.query,
        searchType: event.type,
        resultCount: event.resultCount,
        metadata: event.metadata,
        createdAt: event.timestamp
      })));

      // Kafka hata diya - agar zarurat ho to Redis ya queue use karo
      logger.info("Analytics flushed to DB", { count: events.length });
    } catch (error: any) {
      logger.error("Analytics flush failed", { error });
      this.analyticsBuffer.unshift(...events); // retry next time
      throw new DatabaseError("Analytics flush failed");
    }
  }
}

AnalyticsProcessor.init();

// =============================================
// RecommendationEngine
// =============================================
export class RecommendationEngine {
  static async generateRecommendations(userId: string, userProfile: any, type: string, limit: number = 10) {
    const recommendations = {
      jobs: [] as any[],
      metadata: {
        type,
        generatedAt: new Date(),
        algorithms: [] as string[]
      }
    };

    try {
      switch (type) {
        case 'skills':
          recommendations.jobs = await this.getSkillBasedRecommendations(userProfile, limit);
          recommendations.metadata.algorithms.push('content_based_skills');
          break;

        case 'collaborative':
          recommendations.jobs = await this.getCollaborativeRecommendations(userId, userProfile, limit);
          recommendations.metadata.algorithms.push('collaborative_filtering');
          break;

        case 'trending':
          recommendations.jobs = await this.getTrendingRecommendations(userProfile, limit);
          recommendations.metadata.algorithms.push('trending_analysis');
          break;

        case 'mixed':
        default:
          const [skillBased, collaborative, trending] = await Promise.all([
            this.getSkillBasedRecommendations(userProfile, Math.ceil(limit * 0.5)),
            this.getCollaborativeRecommendations(userId, userProfile, Math.ceil(limit * 0.3)),
            this.getTrendingRecommendations(userProfile, Math.ceil(limit * 0.2))
          ]);

          recommendations.jobs = this.mergeAndDedupe([...skillBased, ...collaborative, ...trending], limit);
          recommendations.metadata.algorithms.push('hybrid_mixed');
          break;
      }

      recommendations.jobs = recommendations.jobs.map((job: any) => ({
        ...job,
        recommendationScore: this.calculateRecommendationScore(job, userProfile, type),
        recommendationReason: this.generateRecommendationReason(job, userProfile)
      }));

      recommendations.jobs.sort((a: any, b: any) => b.recommendationScore - a.recommendationScore);

      return recommendations;
    } catch (error: any) {
      logger.error("Recommendation generation failed", { userId, type });
      throw new ExternalServiceError("Failed to generate recommendations");
    }
  }

  static async getSkillBasedRecommendations(userProfile: any, limit: number) {
    const skills = userProfile.behaviorScore?.topSkills || userProfile.skills || [];
    if (!skills.length) return [];

    const jobs = await Job.find({
      'skills.name': { $in: skills.map((s: string) => new RegExp(s, 'i')) },
      status: 'active',
      isDeleted: false,
      'dates.expires': { $gt: new Date() }
    })
      .select('jobId title companyName location salary jobType skills dates.posted remote')
      .sort({ 'dates.posted': -1 })
      .limit(limit * 2)
      .lean();

    return jobs.slice(0, limit);
  }

  static async getCollaborativeRecommendations(userId: string, userProfile: any, limit: number) {
    const similarUsers = await this.findSimilarUsers(userId, userProfile);
    if (!similarUsers.length) return [];

    const similarUserIds = similarUsers.map((u: any) => u.userId);
    const applications = await JobApplication.find({
      userId: { $in: similarUserIds },
      createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
    }).populate('jobId').lean();

    const jobIds = [...new Set(applications.map((app: any) => app.jobId?._id).filter(Boolean))];

    const userApplications = await JobApplication.find({ userId }).select('jobId').lean();
    const userJobIds = userApplications.map((app: any) => app.jobId.toString());

    const recommendedJobIds = jobIds.filter((jobId: string) => !userJobIds.includes(jobId.toString()));

    const jobs = await Job.find({
      _id: { $in: recommendedJobIds },
      status: 'active',
      isDeleted: false,
      'dates.expires': { $gt: new Date() }
    })
      .select('jobId title companyName location salary jobType skills dates.posted remote')
      .limit(limit)
      .lean();

    return jobs;
  }

  static async getTrendingRecommendations(userProfile: any, limit: number) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const trendingJobs = await Job.aggregate([
      {
        $match: {
          status: 'active',
          isDeleted: false,
          'dates.expires': { $gt: new Date() },
          'dates.posted': { $gte: thirtyDaysAgo }
        }
      },
      {
        $lookup: {
          from: 'jobapplications',
          localField: '_id',
          foreignField: 'jobId',
          as: 'applications'
        }
      },
      {
        $addFields: {
          applicationCount: { $size: '$applications' },
          trendScore: {
            $add: [
              { $multiply: [{ $size: '$applications' }, 0.7] },
              {
                $multiply: [
                  { $divide: [{ $subtract: [new Date(), '$dates.posted'] }, 86400000] }, -0.3
                ]
              }
            ]
          }
        }
      },
      { $sort: { trendScore: -1 } },
      { $limit: limit },
      {
        $project: {
          jobId: 1,
          title: 1,
          companyName: 1,
          location: 1,
          salary: 1,
          jobType: 1,
          skills: 1,
          'dates.posted': 1,
          remote: 1,
          trendScore: 1,
          applicationCount: 1
        }
      }
    ]);

    return trendingJobs;
  }

  static mergeAndDedupe(jobs: any[], limit: number) {
    const seen = new Set();
    const deduped = jobs.filter((job: any) => {
      const key = job.jobId || job._id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return deduped.slice(0, limit);
  }

  static calculateRecommendationScore(job: any, userProfile: any, type: string): number {
    let score = 50;

    if (job.skills && userProfile.behaviorScore?.topSkills) {
      const skillMatches = job.skills.filter((skill: any) =>
        userProfile.behaviorScore.topSkills.some((userSkill: string) =>
          skill.name?.toLowerCase().includes(userSkill.toLowerCase())
        )
      ).length;
      score += (skillMatches / userProfile.behaviorScore.topSkills.length) * 30;
    }

    if (userProfile.behaviorScore?.topLocations?.includes(job.location?.city)) {
      score += 15;
    }

    if (userProfile.applicationPattern?.topJobTypes?.includes(job.jobType)) {
      score += 10;
    }

    const daysOld = (Date.now() - new Date(job.dates?.posted).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) score += 10;
    else if (daysOld < 30) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  static generateRecommendationReason(job: any, userProfile: any): string {
    const reasons: string[] = [];

    if (job.skills && userProfile.behaviorScore?.topSkills) {
      const matchingSkills = job.skills.filter((skill: any) =>
        userProfile.behaviorScore.topSkills.some((userSkill: string) =>
          skill.name?.toLowerCase().includes(userSkill.toLowerCase())
        )
      );
      if (matchingSkills.length > 0) {
        reasons.push(`Matches your skills: ${matchingSkills.slice(0, 2).map((s: any) => s.name).join(', ')}`);
      }
    }

    if (userProfile.behaviorScore?.topLocations?.includes(job.location?.city)) {
      reasons.push(`In your preferred location: ${job.location.city}`);
    }

    if (userProfile.applicationPattern?.topJobTypes?.includes(job.jobType)) {
      reasons.push(`Matches your job type preference: ${job.jobType}`);
    }

    const daysOld = (Date.now() - new Date(job.dates?.posted).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 3) reasons.push("Recently posted");

    return reasons.length > 0 ? reasons.join(' • ') : 'Recommended based on your profile';
  }

  static async findSimilarUsers(userId: string, userProfile: any) {
    const userSkills = userProfile.behaviorScore?.topSkills || [];
    if (!userSkills.length) return [];

    const similarUsers = await User.aggregate([
      {
        $match: {
          userId: { $ne: userId },
          'skills.name': { $in: userSkills }
        }
      },
      {
        $addFields: {
          skillMatchCount: {
            $size: {
              $setIntersection: ['$skills.name', userSkills]
            }
          }
        }
      },
      { $match: { skillMatchCount: { $gte: Math.ceil(userSkills.length * 0.3) } } },
      { $sort: { skillMatchCount: -1 } },
      { $limit: 20 },
      { $project: { userId: '$_id', skillMatchCount: 1 } }
    ]);

    return similarUsers;
  }
}

// =============================================
// RecommendationUtils (extra helpers)
// =============================================
export class RecommendationUtils {
  static async findSimilarUsers(userId: string, userProfile: any) {
    return RecommendationEngine.findSimilarUsers(userId, userProfile);
  }

  static mergeAndDedupe(jobs: any[], limit: number) {
    return RecommendationEngine.mergeAndDedupe(jobs, limit);
  }

  static calculateRecommendationScore(job: any, userProfile: any, type: string) {
    return RecommendationEngine.calculateRecommendationScore(job, userProfile, type);
  }

  static generateRecommendationReason(job: any, userProfile: any) {
    return RecommendationEngine.generateRecommendationReason(job, userProfile);
  }
}

// =============================================
// SearchStatsService
// =============================================

export class SearchStatsService {

  // ✅ New method: Increment stats (more efficient than updateStats)
  static async incrementStats(params: {
    type: string;
    userId: string;
    incrementBy?: number;
    metric?: 'clickCount' | 'resultCount' | 'saveCount' | 'applyCount' | 'shareCount';
  }) {
    try {
      const { type, userId, incrementBy = 1, metric = 'clickCount' } = params;

      // Option 1: Increment in cache (fastest)
      const cacheKey = `stats:${type}:${metric}:${userId}`;
      await CacheUtil.incr(cacheKey);
      await CacheUtil.expire(cacheKey, 86400); // 24h TTL

      // Option 2: Batch update in background (async)
      setImmediate(async () => {
        try {
          await Search.updateOne(
            { userId, 'searches.metadata.type': type },
            {
              $inc: { [`searches.$.stats.${metric}`]: incrementBy },
              $set: { updatedAt: new Date() }
            }
          );
        } catch (err) {
          logger.error('Background stats increment failed', { err, type, userId });
        }
      });

      logger.debug('Stats incremented', { type, userId, metric, incrementBy });
      return true;
    } catch (error: any) {
      logger.error('Failed to increment stats', {
        type: params.type,
        userId: params.userId,
        error: error.message
      });
      return false;
    }
  }

  // ✅ Existing method: Update stats (bulk update)
  static async updateStats(params: { type: string; count: number; userId: string }) {
    try {
      const { type, count, userId } = params;

      // Option 1: Update in database
      await Search.updateOne(
        { userId, 'searches.metadata.type': type },
        {
          $inc: {
            'searches.$.stats.clickCount': count,
            'searches.$.stats.resultCount': count
          },
          $set: { updatedAt: new Date() }
        }
      );

      // Option 2: Track in cache (faster)
      const cacheKey = `stats:${type}:${userId}`;
      await CacheUtil.set(cacheKey, count.toString(), 86400); // 24h TTL

      logger.debug('Stats updated', { type, count, userId });
      return true;
    } catch (error: any) {
      logger.error('Failed to update stats', {
        type: params.type,
        userId: params.userId,
        error: error.message
      });
      return false;
    }
  }

  // ✅ New method: Get current stats from cache
  static async getStats(params: {
    type: string;
    userId: string;
    metric?: 'clickCount' | 'resultCount' | 'saveCount' | 'applyCount' | 'shareCount';
  }) {
    try {
      const { type, userId, metric = 'clickCount' } = params;
      const cacheKey = `stats:${type}:${metric}:${userId}`;

      const cached = await CacheUtil.get(cacheKey);
      return cached ? parseInt(cached, 10) : 0;
    } catch (error: any) {
      logger.error('Failed to get stats', { error: error.message });
      return 0;
    }
  }

  // ✅ New method: Batch increment for multiple metrics
  static async batchIncrementStats(params: {
    type: string;
    userId: string;
    metrics: {
      clickCount?: number;
      resultCount?: number;
      saveCount?: number;
      applyCount?: number;
      shareCount?: number;
    };
  }) {
    try {
      const { type, userId, metrics } = params;

      // Build increment object
      const incrementObj: any = {};
      Object.entries(metrics).forEach(([key, value]) => {
        if (value && value > 0) {
          incrementObj[`searches.$.stats.${key}`] = value;
        }
      });

      if (Object.keys(incrementObj).length === 0) {
        return true;
      }

      // Update in database
      await Search.updateOne(
        { userId, 'searches.metadata.type': type },
        {
          $inc: incrementObj,
          $set: { updatedAt: new Date() }
        }
      );

      // Update cache for each metric
      await Promise.all(
        Object.entries(metrics).map(async ([metric, value]) => {
          if (value && value > 0) {
            const cacheKey = `stats:${type}:${metric}:${userId}`;
            await CacheUtil.incr(cacheKey, value);
            await CacheUtil.expire(cacheKey, 86400);
          }
        })
      );

      logger.debug('Batch stats updated', { type, userId, metrics });
      return true;
    } catch (error: any) {
      logger.error('Failed to batch update stats', {
        type: params.type,
        userId: params.userId,
        error: error.message
      });
      return false;
    }
  }

  // ✅ New method: Reset stats
  static async resetStats(params: {
    type: string;
    userId: string;
  }) {
    try {
      const { type, userId } = params;
      const keys: string[] = [];

      // Delete from cache using scan
      const pattern = `stats:${type}:*:${userId}`;

      let cursor = '0';
      do {
        const [nextCursor, foundKeys] = await CacheUtil.scan(cursor, pattern, 100);
        keys.push(...foundKeys);
        cursor = nextCursor;
      } while (cursor !== '0');

      if (keys.length > 0) {
        // Delete each key individually or use clearByPattern
        for (const key of keys) {
          await CacheUtil.del(key);
        }
      }

      // Reset in database
      await Search.updateOne(
        { userId, 'searches.metadata.type': type },
        {
          $set: {
            'searches.$.stats': {
              resultCount: 0,
              executionTime: 0,
              clickCount: 0,
              saveCount: 0,
              applyCount: 0,
              shareCount: 0,
            },
            updatedAt: new Date()
          }
        }
      );

      logger.info('Stats reset', { type, userId });
      return true;
    } catch (error: any) {
      logger.error('Failed to reset stats', {
        type: params.type,
        userId: params.userId,
        error: error.message
      });
      return false;
    }
  }

  static async getUserSearchStats(userId: string, timeFrame: string = "30d") {
    try {
      const timeMap: { [key: string]: number } = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
      const days = timeMap[timeFrame] || 30;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const stats = await Search.aggregate([
        {
          $match: {
            userId,
            createdAt: { $gte: startDate },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: null,
            totalSearches: { $sum: 1 },
            totalClicks: { $sum: "$stats.clickCount" },
            totalResults: { $sum: "$stats.resultCount" },
            avgExecutionTime: { $avg: "$stats.executionTime" },
            avgResultCount: { $avg: "$stats.resultCount" },
            avgClickCount: { $avg: "$stats.clickCount" },
            topSearchTypes: { $push: "$metadata.type" },
          },
        },
      ]);

      return stats[0] || {};
    } catch (error: any) {
      logger.error("Failed to get user search stats", { userId, timeFrame });
      throw new DatabaseError("Failed to retrieve user search stats");
    }
  }

  static async getGlobalSearchStats(timeFrame: string = "30d") {
    const cacheKey = `global_search_stats:${timeFrame}`;

    try {
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (error: any) {
      logger.warn("Redis cache miss for global stats", { timeFrame });
    }

    try {
      const timeMap: { [key: string]: number } = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
      const days = timeMap[timeFrame] || 30;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const stats = await Search.aggregate([
        { $match: { createdAt: { $gte: startDate }, isDeleted: false } },
        {
          $group: {
            _id: null,
            totalSearches: { $sum: 1 },
            uniqueUsers: { $addToSet: "$userId" },
            totalClicks: { $sum: "$stats.clickCount" },
            avgExecutionTime: { $avg: "$stats.executionTime" },
            searchTypes: { $push: "$metadata.type" },
          },
        },
        {
          $project: {
            totalSearches: 1,
            uniqueUsers: { $size: "$uniqueUsers" },
            totalClicks: 1,
            avgExecutionTime: 1,
            searchTypes: 1,
          },
        },
      ]);

      const result = stats[0] || {};
      await CacheUtil.set(cacheKey, JSON.stringify(result), 300);
      return result;
    } catch (error: any) {
      logger.error("Failed to get global search stats", { timeFrame });
      throw new DatabaseError("Failed to retrieve global search stats");
    }
  }

  static async getTrendingSearches(limit: number = 10, timeFrame: string = "24h") {
    try {
      const hours = timeFrame === "24h" ? 24 : 168;
      const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

      return await Search.aggregate([
        { $match: { createdAt: { $gte: startDate }, isDeleted: false } },
        { $unwind: "$searchKeywords" },
        {
          $group: {
            _id: "$searchKeywords",
            count: { $sum: 1 },
            avgResults: { $avg: "$stats.resultCount" },
            avgClicks: { $avg: "$stats.clickCount" },
          },
        },
        { $sort: { count: -1 } },
        { $limit: limit },
      ]);
    } catch (error: any) {
      logger.error("Failed to get trending searches", { timeFrame });
      throw new DatabaseError("Failed to retrieve trending searches");
    }
  }
}
// export class SearchStatsService {
//   // Add this method in SearchStatsService class

//   static async updateStats(params: { type: string; count: number; userId: string }) {
//   try {
//     const { type, count, userId } = params; // ✅ Destructure all params first

//     // Option 1: Update in database
//     await Search.updateOne(
//       { userId, 'metadata.type': type },
//       {
//         $inc: {
//           'stats.clickCount': count,
//           'stats.resultCount': count
//         },
//         $set: { updatedAt: new Date() }
//       }
//     );

//     // Option 2: Track in cache (faster)
//     const cacheKey = `stats:${type}:${userId}`;
//     await CacheUtil.incr(cacheKey, 86400); // 24h TTL

//     logger.debug('Stats updated', { type, count, userId }); // ✅ Now all variables exist
//     return true;
//   } catch (error: any) {
//     logger.error('Failed to update stats', { type: params.type, userId: params.userId, error: error.message });
//     return false;
//   }
// }

//   static async getUserSearchStats(userId: string, timeFrame: string = "30d") {
//     try {
//       const timeMap: { [key: string]: number } = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
//       const days = timeMap[timeFrame] || 30;
//       const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

//       const stats = await Search.aggregate([
//         {
//           $match: {
//             userId,
//             createdAt: { $gte: startDate },
//             isDeleted: false,
//           },
//         },
//         {
//           $group: {
//             _id: null,
//             totalSearches: { $sum: 1 },
//             totalClicks: { $sum: "$stats.clickCount" },
//             totalResults: { $sum: "$stats.resultCount" },
//             avgExecutionTime: { $avg: "$stats.executionTime" },
//             avgResultCount: { $avg: "$stats.resultCount" },
//             avgClickCount: { $avg: "$stats.clickCount" },
//             topSearchTypes: { $push: "$metadata.type" },
//           },
//         },
//       ]);

//       return stats[0] || {};
//     } catch (error: any) {
//       logger.error("Failed to get user search stats", { userId, timeFrame });
//       throw new DatabaseError("Failed to retrieve user search stats");
//     }
//   }

//   static async getGlobalSearchStats(timeFrame: string = "30d") {
//     const cacheKey = `global_search_stats:${timeFrame}`;

//     try {
//       const cached = await CacheUtil.get(cacheKey);
//       if (cached) return JSON.parse(cached);
//     } catch (error: any) {
//       logger.warn("Redis cache miss for global stats", { timeFrame });
//     }

//     try {
//       const timeMap: { [key: string]: number } = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
//       const days = timeMap[timeFrame] || 30;
//       const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

//       const stats = await Search.aggregate([
//         { $match: { createdAt: { $gte: startDate }, isDeleted: false } },
//         {
//           $group: {
//             _id: null,
//             totalSearches: { $sum: 1 },
//             uniqueUsers: { $addToSet: "$userId" },
//             totalClicks: { $sum: "$stats.clickCount" },
//             avgExecutionTime: { $avg: "$stats.executionTime" },
//             searchTypes: { $push: "$metadata.type" },
//           },
//         },
//         {
//           $project: {
//             totalSearches: 1,
//             uniqueUsers: { $size: "$uniqueUsers" },
//             totalClicks: 1,
//             avgExecutionTime: 1,
//             searchTypes: 1,
//           },
//         },
//       ]);

//       const result = stats[0] || {};
//       await CacheUtil.set(cacheKey, JSON.stringify(result), 300);
//       return result;
//     } catch (error: any) {
//       logger.error("Failed to get global search stats", { timeFrame });
//       throw new DatabaseError("Failed to retrieve global search stats");
//     }
//   }

//   static async getTrendingSearches(limit: number = 10, timeFrame: string = "24h") {
//     try {
//       const hours = timeFrame === "24h" ? 24 : 168;
//       const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

//       return await Search.aggregate([
//         { $match: { createdAt: { $gte: startDate }, isDeleted: false } },
//         { $unwind: "$searchKeywords" },
//         {
//           $group: {
//             _id: "$searchKeywords",
//             count: { $sum: 1 },
//             avgResults: { $avg: "$stats.resultCount" },
//             avgClicks: { $avg: "$stats.clickCount" },
//           },
//         },
//         { $sort: { count: -1 } },
//         { $limit: limit },
//       ]);
//     } catch (error: any) {
//       logger.error("Failed to get trending searches", { timeFrame });
//       throw new DatabaseError("Failed to retrieve trending searches");
//     }
//   }
// }

// =============================================
// SearchEventService
// =============================================
export class SearchEventService {
  static async emit(eventType: string, data: any) {
    try {
      logger.info(`Search Event: ${eventType}`, data);
      const eventKey = `search_event:${eventType}:${Date.now()}`;
      await CacheUtil.set(eventKey, JSON.stringify(data), 3600);

      if (eventType === "analytics:search_created") {
        await this.handleSearchCreated(data);
      } else if (eventType === "analytics:search_clicked") {
        await this.handleSearchClicked(data);
      }
    } catch (error: any) {
      logger.error("Search event emission failed", { eventType });
      throw new ExternalServiceError("Failed to emit search event");
    }
  }

  static async handleSearchCreated(data: any) {
    try {
      await UserInteractionModel.create({
        userId: data.userId,
        activityType: "search",
        metadata: {
          searchId: data.searchId,
          query: data.query,
          type: data.type,
        },
      });
    } catch (error: any) {
      logger.error("Failed to handle search created event", { data });
      throw new DatabaseError("Failed to handle search created event");
    }
  }

  static async handleSearchClicked(data: any) {
    try {
      await Search.updateOne(
        { searchId: data.searchId },
        {
          $inc: { "stats.clickCount": 1 },
          $set: { "stats.lastClickedAt": new Date() },
        }
      );
    } catch (error: any) {
      logger.error("Failed to handle search clicked event", { data });
      throw new DatabaseError("Failed to handle search clicked event");
    }
  }
}


// =============================================
// SearchMaintenanceService
// =============================================

export class SearchMaintenanceService {
  // Add this new method
  static async getStatus(serviceType?: string) {
    try {
      const cacheKey = serviceType
        ? `maintenance:status:${serviceType}`
        : 'maintenance:status:global';

      // Check if maintenance mode is active in cache
      const cachedStatus = await CacheUtil.get(cacheKey);

      if (cachedStatus) {
        return JSON.parse(cachedStatus);
      }

      // Default status if not in cache
      const status = {
        active: false,
        serviceType: serviceType || 'global',
        message: 'Service is operational',
        scheduledMaintenance: null,
        lastMaintenanceAt: null,
      };

      // Cache the status for 5 minutes
      await CacheUtil.set(cacheKey, JSON.stringify(status), 300);

      return status;
    } catch (error: any) {
      logger.error('Failed to get maintenance status', { error });
      return {
        active: false,
        serviceType: serviceType || 'global',
        message: 'Status check failed, assuming operational',
      };
    }
  }

  // Optional: Add method to set maintenance mode
  static async setMaintenanceMode(
    serviceType: string,
    active: boolean,
    message?: string,
    duration?: number // duration in seconds
  ) {
    try {
      const cacheKey = `maintenance:status:${serviceType}`;

      const status = {
        active,
        serviceType,
        message: message || (active ? 'Service under maintenance' : 'Service is operational'),
        scheduledMaintenance: active ? new Date() : null,
        lastMaintenanceAt: active ? new Date() : null,
      };

      const ttl = duration || 3600; // Default 1 hour
      await CacheUtil.set(cacheKey, JSON.stringify(status), ttl);

      logger.info(`Maintenance mode ${active ? 'enabled' : 'disabled'} for ${serviceType}`, status);

      return status;
    } catch (error: any) {
      logger.error('Failed to set maintenance mode', { error });
      throw new DatabaseError('Failed to set maintenance mode');
    }
  }

  // Optional: Check if service is under maintenance
  static async isUnderMaintenance(serviceType: string): Promise<boolean> {
    try {
      const status = await this.getStatus(serviceType);
      return status.active;
    } catch (error : any) {
      logger.error('Failed to check maintenance status', { error });
      return false; // Assume operational on error
    }
  }

  static async cleanupOldSearches() {
    try {
      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const result = await Search.deleteMany({
        createdAt: { $lt: cutoffDate },
        isDeleted: true,
      });

      logger.info(`Cleaned up ${result.deletedCount} old search records`);
      return result.deletedCount;
    } catch (error: any) {
      logger.error("Search cleanup failed", { error });
      throw new DatabaseError("Failed to clean up old searches");
    }
  }

  static async archiveInactiveSearches() {
    try {
      const cutoffDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      const result = await Search.updateMany(
        {
          createdAt: { $lt: cutoffDate },
          "stats.clickCount": 0,
          isDeleted: false,
        },
        {
          $set: { isDeleted: true, archivedAt: new Date() },
        }
      );

      logger.info(`Archived ${result.modifiedCount} inactive searches`);
      return result.modifiedCount;
    } catch (error: any) {
      logger.error("Search archival failed", { error });
      throw new DatabaseError("Failed to archive inactive searches");
    }
  }

  static async deduplicateSearches() {
    try {
      const duplicates = await Search.aggregate([
        {
          $group: {
            _id: { userId: "$userId", queryHash: "$queryHash" },
            count: { $sum: 1 },
            docs: { $push: "$_id" },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ]);

      let removedCount = 0;
      for (const duplicate of duplicates) {
        const [keep, ...remove] = duplicate.docs;
        await Search.deleteMany({ _id: { $in: remove } });
        removedCount += remove.length;
      }

      logger.info(`Removed ${removedCount} duplicate searches`);
      return removedCount;
    } catch (error: any) {
      logger.error("Search deduplication failed", { error });
      throw new DatabaseError("Failed to deduplicate searches");
    }
  }

  // Optional: Get maintenance statistics
  static async getMaintenanceStats() {
    try {
      const stats = {
        totalSearches: await Search.countDocuments({ isDeleted: false }),
        deletedSearches: await Search.countDocuments({ isDeleted: true }),
        oldSearches: await Search.countDocuments({
          createdAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          isDeleted: true,
        }),
        inactiveSearches: await Search.countDocuments({
          createdAt: { $lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
          "stats.clickCount": 0,
          isDeleted: false,
        }),
        lastCleanup: await CacheUtil.get('maintenance:last_cleanup'),
        lastArchive: await CacheUtil.get('maintenance:last_archive'),
      };

      return stats;
    } catch (error: any) {
      logger.error('Failed to get maintenance stats', { error });
      throw new DatabaseError('Failed to get maintenance statistics');
    }
  }
}
// export class SearchMaintenanceService {
//   static async cleanupOldSearches() {
//     try {
//       const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

//       const result = await Search.deleteMany({
//         createdAt: { $lt: cutoffDate },
//         isDeleted: true,
//       });

//       logger.info(`Cleaned up ${result.deletedCount} old search records`);
//       return result.deletedCount;
//     } catch (error: any) {
//       logger.error("Search cleanup failed", { error });
//       throw new DatabaseError("Failed to clean up old searches");
//     }
//   }

//   static async archiveInactiveSearches() {
//     try {
//       const cutoffDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

//       const result = await Search.updateMany(
//         {
//           createdAt: { $lt: cutoffDate },
//           "stats.clickCount": 0,
//           isDeleted: false,
//         },
//         {
//           $set: { isDeleted: true, archivedAt: new Date() },
//         }
//       );

//       logger.info(`Archived ${result.modifiedCount} inactive searches`);
//       return result.modifiedCount;
//     } catch (error: any) {
//       logger.error("Search archival failed", { error });
//       throw new DatabaseError("Failed to archive inactive searches");
//     }
//   }

//   static async deduplicateSearches() {
//     try {
//       const duplicates = await Search.aggregate([
//         {
//           $group: {
//             _id: { userId: "$userId", queryHash: "$queryHash" },
//             count: { $sum: 1 },
//             docs: { $push: "$_id" },
//           },
//         },
//         { $match: { count: { $gt: 1 } } },
//       ]);

//       let removedCount = 0;
//       for (const duplicate of duplicates) {
//         const [keep, ...remove] = duplicate.docs;
//         await Search.deleteMany({ _id: { $in: remove } });
//         removedCount += remove.length;
//       }

//       logger.info(`Removed ${removedCount} duplicate searches`);
//       return removedCount;
//     } catch (error: any) {
//       logger.error("Search deduplication failed", { error });
//       throw new DatabaseError("Failed to deduplicate searches");
//     }
//   }
// }