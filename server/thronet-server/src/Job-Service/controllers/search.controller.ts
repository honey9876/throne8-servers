// controller/search.controller.ts
import { Request, Response, NextFunction } from 'express';

import { Job, UserInteractionModel, Search } from '../models';
import { CacheManager, PersonalizationEngine } from '@/Job-Service/models/search.model.js';
import {
  validateSearchInput,
  validateRecentlyViewedInput,
  validateOfflineJobsInput,
} from '../validations';
import { generateSecureId, sanitizeInput } from '@/shared/security.js';
import logger from '@/shared/logger.util.js';
import ResponseUtil from '@/shared/response.util.js';
import {
  ValidationError,
  NotFoundError, // if needed in future
  AuthenticationError, AuthorizationError
} from '@/shared/errors/app.error.js';
import {
  AdvancedSearchEngine,
  AnalyticsProcessor,
  generateEnhancedSuggestions,
  SearchEventService,
  SearchStatsService,
  // SearchVectorService,
  SearchMaintenanceService,
  buildRecentlyViewedQuery,
  getSortOptions,
  // SearchIndexMonitoringService,
} from '../services';

import { searchDuration, searchRequests, activeSearches } from '@/shared/metrics.js';
import CacheUtil from '@/shared/cache.util.js';
import { UserProfile } from '@/auth/models';

// Request context helper
const withRequestContext = (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();
    const userId = req.user?.userId;

    activeSearches.inc();

    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    } finally {
      activeSearches.dec();
      const duration = Date.now() - startTime;
      if (duration > 800) {
        logger.warn(`[${requestId}] Slow search operation`, { duration, path: req.path });
      }
    }
  };

// GET /jobs/search/advanced
export const advancedJobSearchController = withRequestContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  // const userType = req.user?.subscription || 'free';


  if (!req.query?.query) {
    throw new ValidationError('Query parameter is required');
  }

  const sanitized = sanitizeInput(req.query);
  const { error, value } = validateSearchInput(sanitized);
  if (error) {
    searchRequests.inc({ search_type: 'advanced', status: 'validation_error' });
    throw new ValidationError('Invalid search input', error.details);
  }

  const { query, page, limit, filters, sort, personalize } = value;

  // Cache check
  const cacheKey = `search:${JSON.stringify({ query, page, limit, filters, sort })}`;
  let result = await CacheManager.getMultiLevel(cacheKey, personalize ? userId : null);

  if (result) {
    searchRequests.inc({ search_type: 'advanced', status: 'cache_hit' });
    ResponseUtil.paginated(res, result.jobs, result.pagination, 'JOBS_RETRIEVED');
  }

  // Personalization
  const userProfile = personalize && userId
    ? await PersonalizationEngine.getUserProfile(userId, req)
    : null;

  // Search with fallback
  try {
    result = await AdvancedSearchEngine.searchElasticsearch(
      query, filters, page, limit, sort, userProfile
    );
  } catch (esErr: any) {
    logger.warn('Elasticsearch failed, falling back to MongoDB', { error: esErr.message });
    result = await AdvancedSearchEngine.searchMongoDB(
      query, filters, page, limit, sort, userProfile
    );
  }

  // Optional personalization-based re-sorting
  if (userProfile && personalize && sort === 'relevance') {
    result.hits.sort((a: any, b: any) => (b.personalizationScore || 0) - (a.personalizationScore || 0));
  }

  const responseData = {
    jobs: result.hits,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNextPage: page < Math.ceil(result.total / limit),
      hasPrevPage: page > 1,
    },
    metadata: {
      searchTime: Date.now() - Date.now(), // adjust if needed
      personalized: !!userProfile,
      source: result.source || 'elasticsearch',
      filters,
      sort,
    },
  };


  // Cache result
  await CacheManager.setMultiLevel(cacheKey, responseData, personalize ? userId : null);

  // Recent searches for logged-in users
  if (userId) {
    await CacheUtil.lpush(
      `recent:searches:${userId}`,
      JSON.stringify({
        type: 'advanced',
        query,
        filters,
        timestamp: new Date().toISOString(),
        resultCount: result.total,
      })
    );
    await CacheUtil.ltrim(`recent:searches:${userId}`, 0, 19);
  }

  // Analytics & activity
  AnalyticsProcessor.addEvent({
    userId,
    type: 'advanced_search',
    query,
    filters,
    resultCount: result.total,
    metadata: { ip: req.ip, userAgent: req.headers['user-agent'], personalized: !!userProfile },
  });

  if (userId) {
    UserInteractionModel.create({
      userId,
      type: 'search',
      metadata: { query, filters, resultCount: result.total, page },
    }).catch(err => logger.error('Activity tracking failed', { err }));
  }

  searchRequests.inc({ search_type: 'advanced', status: 'success' });

  ResponseUtil.paginated(res, responseData.jobs, responseData.pagination, 'JOBS_RETRIEVED');
});

// GET /jobs/autocomplete
export const getAutoCompleteSuggestionsController = withRequestContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { query, type = 'mixed', limit = '15' } = req.query;
  if (!query || String(query).length < 1) {
    throw new ValidationError('Query parameter is required and must be at least 1 character');
  }
  const queryStr = String(query);

  const cacheKey = `autocomplete:enhanced:${type}:${queryStr}:${limit}`;
  let suggestions = await CacheManager.getMultiLevel(cacheKey, userId);

  if (suggestions) {
    ResponseUtil.success(res, suggestions, 'AUTOCOMPLETE_RETRIEVED');
  }

  const userProfile = userId ? await PersonalizationEngine.getUserProfile(userId, req) : null;

  suggestions = await generateEnhancedSuggestions(
    queryStr,
    String(type),
    userProfile,
    parseInt(limit as string)
  );

  await CacheManager.setMultiLevel(cacheKey, suggestions, userId);

  AnalyticsProcessor.addEvent({
    userId,
    type: 'autocomplete',
    query,
    suggestionType: type,
    suggestionCount: suggestions.suggestions?.length || 0,
    metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  });

  ResponseUtil.success(res, suggestions, 'AUTOCOMPLETE_RETRIEVED');
});

// GET /jobs/search/suggestions
export const getSearchSuggestionsController = withRequestContext(async (req: Request, res: Response) => {
  const sanitized = sanitizeInput(req.query);
  const { error, value } = validateSearchInput(sanitized);

  if (error) throw new ValidationError('Invalid suggestion input', error.details);

  const suggestions = await Job.aggregate([
    {
      $match: {
        title: { $regex: `^${value.query}`, $options: 'i' },
        status: 'active',
        isDeleted: false,
        'dates.expires': { $gt: new Date() },
      },
    },
    { $group: { _id: '$title' } },
    { $limit: parseInt(value.limit) },
    { $project: { _id: 0, suggestion: '$_id' } },
  ]);

  // JobEventService.emit('analytics:suggestions', {
  //   userId: req.user?.userId,
  //   query: value.query,
  //   resultCount: suggestions.length,
  //   metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  // }).catch(err => logger.error('Suggestions event failed', { err }));

  ResponseUtil.success(res, { suggestions }, 'SUGGESTIONS_RETRIEVED');
});

// GET /jobs/search/trending
export const getTrendingSearchesController = withRequestContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const sanitized = sanitizeInput(req.query);
  const { error, value } = validateSearchInput(sanitized);

  if (error) throw new ValidationError('Invalid trending input', error.details);

  const cacheKey = userId ? `trending:searches:${userId}` : 'trending:searches:global';
  // let trending = await CacheUtil.lRange(cacheKey, 0, value.limit - 1, 'WITHSCORES');
  // ✅ Fix: lRange only takes 3 arguments (key, start, stop)
  let trending = await CacheUtil.lRange(cacheKey, 0, value.limit - 1);

  let suggestions = [];
  for (let i = 0; i < trending.length; i += 2) {
    suggestions.push({ query: trending[i], score: Number(trending[i + 1]) });
  }

  if (value.query) {
    suggestions = suggestions.filter(s =>
      s.query.toLowerCase().includes(value.query.toLowerCase())
    ).slice(0, value.limit);
  }

  suggestions.sort((a, b) => b.score - a.score);

  // Fallback if empty
  if (!suggestions.length && userId) {
    // Note: You might want to move this logic to service layer in future
    // const history = await Search.find({ userId }).sort({ timestamp: -1 }).limit(50);

    // ✅ Fix: Access searches array properly
    const history = await Search.find({ userId }).sort({ 'searches.createdAt': -1 }).limit(50).lean();
    suggestions = history.flatMap((h: any) =>
      h.searches?.map((s: any) => ({ query: s.query, score: 1 })) || []
    );

    // Simple fallback - you can enhance this
    // suggestions = history.map(h => ({ query: h.query, score: 1 }));
  }

  ResponseUtil.success(res, { suggestions }, 'TRENDING_RETRIEVED');
});

// POST /jobs/bulk-search (Admin only)
export const bulkSearchJobsController = withRequestContext(async (req: Request, res: Response) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Bulk search is restricted to admin users');
  }

  const { queries, filters = {}, limit = 1000 } = req.body;

  if (!Array.isArray(queries) || queries.length === 0) {
    throw new ValidationError('Queries array is required and cannot be empty');
  }

  if (queries.length > 1000) {
    throw new ValidationError('Bulk search limited to 1000 queries per request');
  }

  const sanitizedQueries = queries.map(q => sanitizeInput(q));
  const sanitizedFilters = sanitizeInput(filters);

  const cacheKey = `bulksearch:${JSON.stringify(sanitizedQueries)}:${JSON.stringify(sanitizedFilters)}:${limit}`;
  const cached = await CacheUtil.get(cacheKey);

  if (cached) {
    ResponseUtil.success(res, JSON.parse(cached), 'Bulk search results retrieved from cache');
  }

  const jobs = await Job.aggregate([
    {
      $match: {
        $or: sanitizedQueries.map(q => ({ $text: { $search: q } })),
        ...sanitizedFilters,
        status: 'active',
        isDeleted: false,
        'dates.expires': { $gt: new Date() },
      },
    },
    {
      $project: {
        jobId: 1,
        title: 1,
        companyName: 1,
        location: 1,
        jobType: 1,
        skills: 1,
        createdAt: 1,
        score: { $meta: 'textScore' },
      },
    },
    { $sort: { score: -1, createdAt: -1 } },
    { $limit: parseInt(limit) },
  ]);

  await CacheUtil.set(cacheKey, JSON.stringify(jobs), 600);

  // JobEventService.emit('analytics:bulk_search', {
  //   userId: req.user?.userId,
  //   queries: sanitizedQueries,
  //   filters: sanitizedFilters,
  //   resultCount: jobs.length,
  //   metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  // }).catch(err => logger.error('Bulk search event failed', { err }));

  ResponseUtil.success(res, { jobs, total: jobs.length }, 'Bulk search completed successfully');
});

// GET /jobs/recently-viewed
export const getRecentlyViewedJobsController = withRequestContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  const sanitized = sanitizeInput(req.query);
  const { error, value } = validateRecentlyViewedInput.validate({ ...sanitized, userId });

  if (error) {
    throw new ValidationError('Invalid recently viewed input', error.details);
  }

  // Async check: user has at least one view activity
  const hasActivity = await UserInteractionModel.exists({
    userId: value.userId,
    type: 'view',
    entityType: 'job',
  });

  if (!hasActivity) {
    throw new NotFoundError('No job view activity found for this user');
  }

  const userProfile = userId ? await PersonalizationEngine.getUserProfile(userId, req) : null;

  const cacheKey = `jobs:recently_viewed:${Buffer.from(
    JSON.stringify({ ...value, userId: userId || 'anonymous' })
  ).toString('base64').slice(0, 200)}`;

  // ✅ Fix: Await the promise
  const cached = await CacheUtil.get(cacheKey).catch(() => null);
  if (cached) {
    ResponseUtil.success(res, JSON.parse(cached), 'Bulk search results retrieved from cache');
  }

  const query = buildRecentlyViewedQuery(value, userProfile);
  const sortOptions = getSortOptions(value.sortBy, value.sortOrder);

  const [results] = await UserInteractionModel.aggregate([
    { $match: query },
    {
      $lookup: {
        from: 'jobs',
        localField: 'entityId',
        foreignField: '_id',
        as: 'job',
        pipeline: [{ $project: { title: 1, companyId: 1, location: 1, jobType: 1, salary: 1, skills: 1 } }],
      },
    },
    { $unwind: '$job' },
    { $replaceRoot: { newRoot: '$job' } },
    {
      $facet: {
        jobs: [
          { $sort: sortOptions },
          { $skip: (value.page - 1) * value.limit },
          { $limit: value.limit },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]).option({ maxTimeMS: 30000 });

  let jobs = results.jobs || [];
  const total = results.totalCount?.[0]?.count || 0;

  // Optional vector re-ranking
  // if (userProfile?.vectorEmbeddings) {
  //   jobs = await SearchVectorService.reRankJobs(jobs, userProfile.vectorEmbeddings);
  //   jobs = jobs.slice(0, value.limit);
  // }

  const responseData = {
    jobs,
    pagination: {
      page: value.page,
      limit: value.limit,
      total,
      totalPages: Math.ceil(total / value.limit),
    },
    meta: {
      resultsFound: total,
      searchTime: Date.now() - Date.now(), // fix calculation if needed
      userProfileApplied: !!userProfile,
    },
  };

  await CacheUtil.set(cacheKey, JSON.stringify(responseData), 600).catch(() => { });

  SearchEventService.emit('analytics:recently_viewed', {
    userId,
    resultCount: jobs.length,
    totalResults: total,
    metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  }).catch(() => { });
// ✅ Fix: Ensure userId is always a string
await SearchStatsService.updateStats({ 
  type: 'recently_viewed', 
  count: jobs.length, 
  userId: userId || 'anonymous' 
});
  logger.info('Recently viewed stats', { type: 'recently_viewed', count: jobs.length, userId });

  ResponseUtil.paginated(res, jobs, responseData.pagination, 'JOBS_RETRIEVED');
});

// GET /jobs/offline
export const getOfflineJobsController = withRequestContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  const sanitized = sanitizeInput(req.query);
  const { error, value } = validateOfflineJobsInput({ ...sanitized, userId });

  if (error) throw new ValidationError('Invalid offline jobs input', error.details);

  const userProfile = userId ? await PersonalizationEngine.getUserProfile(userId, req) : null;

  const cacheKey = `jobs:offline:${Buffer.from(
    JSON.stringify({ ...value, userId: userId || 'anonymous' })
  ).toString('base64').slice(0, 200)}`;

  const cached = await CacheUtil.get(cacheKey).catch(() => null);
  if (cached) ResponseUtil.success(res, JSON.parse(cached));

  let query: any = {
    status: 'active',
    isDeleted: false,
    'dates.expires': { $gt: new Date() },
    offlineAvailable: true,
  };

  // ✅ Fix: Use searchFilters.locations
  // ✅ Fix: Access the correct property path
// if (userProfile?.preferences?.searchFilters?.locations) {
//   query['location.city'] = { $in: userProfile.preferences.searchFilters.locations };
// }

// Alternative if the structure is different:
if (userProfile?.location) {
  query['location.city'] = { $in: userProfile.location};
}
  const [results] = await Job.aggregate([
    { $match: query },
    {
      $lookup: {
        from: 'companies',
        localField: 'companyId',
        foreignField: '_id',
        as: 'company',
        pipeline: [{ $project: { name: 1, logo: 1 } }],
      },
    },
    { $unwind: '$company' },
    {
      $facet: {
        jobs: [
          { $sort: getSortOptions(value.sortBy, value.sortOrder) },
          { $skip: (value.page - 1) * value.limit },
          { $limit: value.limit },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]).option({ maxTimeMS: 30000 });

  let jobs = results.jobs || [];
  const total = results.totalCount?.[0]?.count || 0;

  const maintenance = await SearchMaintenanceService.getStatus('offline_jobs');
  if (maintenance.active) {
    jobs = [];
    logger.warn('Offline jobs currently under maintenance');
  }

  const responseData = {
    jobs,
    pagination: {
      page: value.page,
      limit: value.limit,
      total,
      totalPages: Math.ceil(total / value.limit),
    },
    meta: { resultsFound: total, userProfileApplied: !!userProfile },
  };

  await CacheUtil.set(cacheKey, JSON.stringify(responseData), 600).catch(() => { });

  SearchEventService.emit('analytics:offline_jobs', {
    userId,
    resultCount: jobs.length,
    totalResults: total,
    metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  }).catch(() => { });

  // await SearchStatsService.updateStats({ type: 'offline_jobs', count: jobs.length, userId });

  // ✅ Fix: Ensure userId is string
  await SearchStatsService.updateStats({
    type: 'offline_jobs',
    count: jobs.length,
    userId: userId || 'anonymous'
  });

  ResponseUtil.paginated(res, jobs, responseData.pagination, 'JOBS_RETRIEVED');
});