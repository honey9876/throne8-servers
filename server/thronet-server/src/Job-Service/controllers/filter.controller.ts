// controller/searchAndFilter.controller.ts
import { Request, Response, NextFunction } from 'express';
import { Job, Search } from '../models';
import { generateSecureId, sanitizeInput } from '@/shared/security.js';
import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { ValidationError } from '@/shared/errors/app.error';
import { PersonalizationEngine } from '@/Job-Service/models/search.model';
import CacheUtil from '@/shared/cache.util';
import { validateCompleteFilterInput, buildOptimizedQuery, getSortOptions, } from '../validations';
import { IUserProfile } from '@/auth/models/UserProfile.model';

// Request context helper (add metrics if needed)
const withSearchContext = (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        logger.warn(`[${requestId}] Slow search operation`, { duration, path: req.path });
      }
    }
  };

// Main Unified Search & Filter
export const searchAndFilterJobsController = withSearchContext(async (req: Request, res: Response): Promise<any> => {
  const startTime = Date.now()
  const userId = req.user?.userId;

  // Input validation
  const sanitizedInput = sanitizeInput(req.query);
  const { error, value } = validateCompleteFilterInput(sanitizedInput);

  if (error) {
    throw new ValidationError('Invalid search/filter input', error.details);
  }

  // Personalization profile
  // Personalization profile - Use null consistently
  let userProfile: IUserProfile | null = null;

  userProfile = userId ? await PersonalizationEngine.getUserProfile(userId, req) : null;

  // Cache key (includes user for personalized results)
  const cacheKey = `jobs:unified:${Buffer.from(
    JSON.stringify({ ...value, userId: userId || 'anonymous' })
  ).toString('base64').slice(0, 200)}`;

  // Cache hit?
  const cached = await CacheUtil.get(cacheKey).catch(() => null);
  if (cached) {
    return res.status(200).json({
      ...JSON.parse(cached),
      cached: true,
    });
  }

  // Build query with personalization
  const query = buildOptimizedQuery(value, userProfile);
  const sortOptions = getSortOptions(value.sortBy, value.sortOrder);

  // Optimized aggregation pipeline
  const aggregationPipeline = [
    { $match: query },
    {
      $lookup: {
        from: 'companies',
        localField: 'companyId',
        foreignField: '_id',
        as: 'companyDetails',
        pipeline: [{ $project: { name: 1, logo: 1, rating: 1, size: 1, type: 1 } }],
      },
    },
    { $addFields: { company: { $arrayElemAt: ['$companyDetails', 0] } } },
    {
      $facet: {
        jobs: [
          { $sort: sortOptions },
          { $skip: (value.page - 1) * value.limit },
          { $limit: value.limit },
          {
            $project: {
              jobId: 1,
              title: 1,
              companyId: 1,
              'company.name': 1,
              'company.logo': 1,
              'company.rating': 1,
              location: 1,
              jobType: 1,
              salary: 1,
              experience: 1,
              skills: { $slice: ['$skills', 5] },
              features: 1,
              benefits: { $slice: ['$benefits', 3] },
              'dates.posted': 1,
              'dates.expires': 1,
              applicationsCount: 1,
              viewsCount: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
        facets: [
          {
            $group: {
              _id: null,
              locations: { $addToSet: '$location.city' },
              companies: { $addToSet: '$company.name' },
              jobTypes: { $addToSet: '$jobType' },
              industries: { $addToSet: '$industry' },
              experienceLevels: { $addToSet: '$experience.level' },
              salaryRanges: {
                $push: {
                  $cond: [
                    { $lt: ['$salary.max', 300000] },
                    '0-3L',
                    {
                      $cond: [
                        { $lt: ['$salary.max', 600000] },
                        '3L-6L',
                        {
                          $cond: [
                            { $lt: ['$salary.max', 1000000] },
                            '6L-10L',
                            {
                              $cond: [
                                { $lt: ['$salary.max', 1500000] },
                                '10L-15L',
                                '15L+'
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              },  // <-- Make sure all parentheses are balanced
              benefits: { $addToSet: '$benefits' },
              diversityTags: { $addToSet: '$diversityTags' },
              workCulture: { $addToSet: '$workCulture' },
            },
          },
        ],
      },
    },
  ];

  const [results] = await Job.aggregate(aggregationPipeline).option({ maxTimeMS: 30000 });

  const jobs = results.jobs || [];
  const totalCount = results.totalCount?.[0]?.count || 0;
  const facets = results.facets?.[0] || {};

  const responseData = {
    jobs,
    pagination: {
      page: value.page,
      limit: value.limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / value.limit),
      hasNext: value.page < Math.ceil(totalCount / value.limit),
      hasPrev: value.page > 1,
    },
    facets: {
      locations: (facets.locations || []).filter(Boolean).slice(0, 20),
      companies: (facets.companies || []).filter(Boolean).slice(0, 20),
      jobTypes: facets.jobTypes || [],
      industries: facets.industries || [],
      experienceLevels: facets.experienceLevels || [],
      salaryRanges: facets.salaryRanges || [],
      benefits: (facets.benefits || []).filter(Boolean).slice(0, 20),
      diversityTags: (facets.diversityTags || []).filter(Boolean).slice(0, 10),
      workCulture: facets.workCulture || [],
    },
    appliedFilters: {
      count: Object.keys(value).filter(k =>
        value[k] !== undefined && value[k] !== null && value[k] !== '' &&
        !['page', 'limit', 'sortBy', 'sortOrder'].includes(k)
      ).length,
      active: Object.fromEntries(
        Object.entries(value).filter(([k, v]) =>
          v !== undefined && v !== null && v !== '' &&
          !['page', 'limit', 'sortBy', 'sortOrder'].includes(k)
        )
      ),
    },
    meta: {
      searchQuery: value.q || '',
      resultsFound: totalCount,
      searchTime: Date.now() - startTime,
      sortedBy: value.sortBy,
      cached: false,
      userProfileApplied: !!userProfile,
    },
  };

  // Cache response (shorter TTL for fresh/recent searches)
  const cacheExpiry = value.datePosted === 'past-24h' ? 300 : 1800; // 5min vs 30min
  await CacheUtil.set(cacheKey, JSON.stringify(responseData), cacheExpiry)

  // Async analytics event
  // JobEventService.emit('analytics:search', {
  //   userId,
  //   searchQuery: value.q,
  //   filters: value,
  //   resultCount: jobs.length,
  //   totalResults: totalCount,
  //   searchTime: Date.now() - startTime,
  //   page: value.page,
  //   metadata: { ip: req.ip, userAgent: req.headers['user-agent'], cached: false },
  // }).catch(err => logger.error('Search analytics event failed', { err }));

  ResponseUtil.paginated(res, jobs, responseData.pagination, 'JOBS_RETRIEVED');
});

// GET - Filter Suggestions (autocomplete)
export const getFilterSuggestionsController = async (req: Request, res: Response) => {
  const { type, query } = req.query;

  const cacheKey = `suggestions:${type}:${query}`;
  const cached = await CacheUtil.get(cacheKey);
  if (cached) return res.status(200).json(JSON.parse(cached));

  let suggestions: string[] = [];

  switch (type) {
    case 'skills':
    suggestions = (await Job.distinct('skills.name', {
      'skills.name': { $regex: query, $options: 'i' },
      status: 'active',
    }).limit(10)) as string[]; 
      break;
    case 'companies':
      suggestions = (await Job.distinct('company.name', {
        'company.name': { $regex: query, $options: 'i' },
        status: 'active',
      }).limit(10))as string[];;
      break;
    case 'locations':
      suggestions = await Job.distinct('location.city', {
        'location.city': { $regex: query, $options: 'i' },
        status: 'active',
      }).limit(10);
      break;
    case 'titles':
      suggestions = await Job.distinct('title', {
        title: { $regex: query, $options: 'i' },
        status: 'active',
      }).limit(10);
      break;
    default:
      throw new ValidationError('Invalid suggestion type');
  }

  const response = { suggestions: suggestions.filter(Boolean) };
  await CacheUtil.set(cacheKey, JSON.stringify(response), 3600);

  ResponseUtil.success(res, response, 'Filter suggestions retrieved');
};

// GET - Popular Filters (trending/quick filters)
export const getPopularFiltersController = async (req: Request, res: Response) => {
  const cacheKey = 'popular:filters';
  const cached = await CacheUtil.get(cacheKey);

  if (cached) return res.status(200).json(JSON.parse(cached));

  const popularFilters = {
    skills: ['JavaScript', 'React', 'Python', 'Node.js', 'Java', 'AWS', 'MySQL', 'MongoDB'],
    locations: ['Mumbai', 'Bangalore', 'Delhi', 'Pune', 'Chennai', 'Hyderabad', 'Kolkata'],
    companies: ['TCS', 'Infosys', 'Wipro', 'Amazon', 'Google', 'Microsoft', 'Accenture'],
    jobTypes: ['full-time', 'part-time', 'contract', 'internship'],
    experienceLevels: ['fresher', 'mid-level', 'senior-level'],
    industries: ['technology', 'finance', 'healthcare', 'education'],
    salaryRanges: ['3L-6L', '6L-10L', '10L-15L', '15L-25L'],
  };

  await CacheUtil.set(cacheKey, JSON.stringify(popularFilters), 86400);

  ResponseUtil.success(res, popularFilters, 'Popular filters retrieved');
};

// POST - Save Search Query
export const saveSearchQueryController = async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new ValidationError('Authentication required');

  const { name, filters, alertFrequency } = req.body;

  const savedSearch = {
    userId,
    name: name || 'My Saved Search',
    filters,
    alertFrequency: alertFrequency || 'daily',
    createdAt: new Date(),
    isActive: true,
    lastAlertSent: null,
  };

  const result = await Search.create(savedSearch);

  ResponseUtil.created(res, {
    searchId: result._id,
    ...savedSearch,
  }, 'Search saved successfully');
};