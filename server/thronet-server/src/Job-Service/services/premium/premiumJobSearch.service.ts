// job-search.service.ts
// import { createCacheService } from '../services/premium/analyticsService.js';
import CacheUtil from '@/shared/cache.util';
import { sanitizeInput } from '@/shared/security.js';
import { searchValidationSchema } from '@/Job-Service/validations/premium.validations';
import crypto from 'crypto';
// import {SearchService} from '@/services';

// Assuming these are defined elsewhere (you can import or define them)
interface SearchParams {
  // Define your actual search params interface here
  [key: string]: any; // e.g. query, location, skills, etc.
}

interface SearchResult {
  took: number;
  total: number;
  hits: any[]; // replace with proper hit type if needed
  // ... other fields from Elasticsearch
}

// ======================
//         TYPES
// ======================
interface JobSearchServiceDependencies {
  searchService: ReturnType<typeof createJobSearchService>;
  // cacheUtil: ReturnType<typeof CacheUtil>;
}

export class JobSearchService {
  private searchService: ReturnType<typeof createJobSearchService>;
  // private cacheUtil: ReturnType<typeof CacheUtil>;

  constructor(deps: JobSearchServiceDependencies) {
    this.searchService = deps.searchService;
    // this.cacheUtil = deps.CacheUtil;
  }

  /**
   * Initialize connections (ping cache, init Kafka if needed)
   */
  async initialize(): Promise<void> {
    await CacheUtil.ping();
    // await initKafka(); // Uncomment if you have this function
    console.log('[JobSearchService] Initialized successfully');
  }

  /**
   * Main search method with validation, sanitization, caching
   */
  async searchJobs(params: SearchParams, userId: string, useScroll = false ): Promise<SearchResult> {
    // TODO: Replace with your actual Joi/Zod schema validation
    const { error, value: validatedParams } = searchValidationSchema.validate(params);
    if (error) throw new Error(`Validation error: ${error.details[0].message}`);

    const sanitizedParams = sanitizeInput(params);

    // Generate deterministic cache key
    const paramHash = crypto
      .createHash('md5')
      .update(JSON.stringify(sanitizedParams))
      .digest('hex');
    const cacheKey = `search:${paramHash}:${userId.slice(-8)}`;

    // Try cache first
    let results = await CacheUtil.get(cacheKey);

    if (!results) {
      // Cache miss → execute search
      results = await this.searchService.searchJobs(sanitizedParams, userId, useScroll)

      // Cache only fast/small results
      if (results.took < 1000 || results.total < 100) {
        await CacheUtil.set(cacheKey, results, 300); // 5 minutes
      }
    }

    // Track event (fire-and-forget)
    this.trackSearchEvent(userId, sanitizedParams, results).catch(console.error);

    return results;
  }

  /**
   * Get trending jobs (cached)
   */
  async getTrendingJobs(limit = 50): Promise<any> {
    const cacheKey = `trending_jobs:${limit}`;
    let trendingJobs = await CacheUtil.get(cacheKey);

    if (!trendingJobs) {
      trendingJobs = await this.searchService.getTrendingJobs(limit);
      await CacheUtil.set(cacheKey, trendingJobs, 600); // 10 minutes
    }

    return trendingJobs;
  }

  /**
   * Jobs from user's network/connections
   */
  async getJobsInNetwork(userId: string, limit = 20): Promise<any> {
    const cacheKey = `network_jobs:${userId}`;
    let networkJobs = await CacheUtil.get(cacheKey);

    if (!networkJobs) {
      const userConnections = await this.getUserConnections(userId);
      networkJobs = await this.searchService.getJobsInNetwork(userId, /*userConnections*/limit);
      await CacheUtil.set(cacheKey, networkJobs, 1800); // 30 minutes
    }

    return networkJobs;
  }

  /**
   * Alumni-related jobs
   */
  async getAlumniJobs(userId: string, limit = 20): Promise<any> {
    const cacheKey = `alumni_jobs:${userId}`;
    let alumniJobs = await CacheUtil.get(cacheKey);

    if (!alumniJobs) {
      const userEducation = await this.getUserEducation(userId);
      alumniJobs = await this.searchService.getAlumniJobs(userId, limit);
      await CacheUtil.set(cacheKey, alumniJobs, 1800); // 30 minutes
    }

    return alumniJobs;
  }

  /**
   * Filtered/special category jobs (e.g. newgrad, senior, startup...)
   */
  async getFilteredJobs(filterType: string, params: SearchParams, userId: string): Promise<SearchResult> {
    const baseParams = { ...params };

    switch (filterType.toLowerCase()) {
      case 'newgrad':
      case 'no_experience':
        baseParams.experienceLevel = 'entry';
        baseParams.noExperienceRequired = true;
        break;
      case 'senior':
        baseParams.experienceLevel = 'senior';
        break;
      case 'executive':
        baseParams.experienceLevel = 'executive';
        break;
      case 'contract':
        baseParams.jobType = 'contract';
        break;
      case 'freelance':
        baseParams.jobType = 'freelance';
        break;
      case 'startup':
        baseParams.companySize = 'startup';
        break;
      case 'fortune500':
        baseParams.companySize = 'fortune500'; // assuming this value exists
        break;
      default:
        // Unknown filter → fallback to normal search
        break;
    }

    return this.searchJobs(baseParams, userId);
  }

  /**
   * Track search event (Kafka/async)
   */
  private async trackSearchEvent(userId: string, params: SearchParams, results: SearchResult): Promise<void> {
    const event = {
      type: 'job_search',
      userId,
      timestamp: new Date().toISOString(),
      searchParams: { ...params, sensitive: undefined }, // remove sensitive data
      resultCount: results.total,
      took: results.took,
    };

    try {
    } catch (err) {
      console.error('Failed to publish search event:', err);
    }
  }

  /**
   * Placeholder - implement actual DB/service call
   */
  private async getUserConnections(userId: string): Promise<string[]> {
    // TODO: Fetch from UserConnections model/service
    return [];
  }

  /**
   * Placeholder - implement actual DB/service call
   */
  private async getUserEducation(userId: string): Promise<any[]> {
    // TODO: Fetch from UserEducation model/service
    return [];
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    await CacheUtil.disconnect?.();
    await this.searchService.disconnect?.();
  }
}


// ======================
//         FACTORY
// ======================
// export const createJobSearchService = (feature: 'core' | string = 'core'): JobSearchService => {
//   const search = createJobSearchService(feature);
//   // const cache = createCacheService(feature);
//   // const cache = CacheUtil;

//   const service = new JobSearchService({ searchService: search, /*cacheService: cache*/ });

//   // Auto-initialize (non-blocking)
//   service.initialize().catch(console.error);

//   return service;
// };

export const createJobSearchService = (feature: 'core' | string = 'core'): JobSearchService => {
  // const search = createJobSearchService(feature); // ❌ Remove this line
  
  const service = new JobSearchService({ 
    searchService: null as any // Ya proper implementation inject karo
  });

  service.initialize().catch(console.error);
  return service;
};

export default createJobSearchService();