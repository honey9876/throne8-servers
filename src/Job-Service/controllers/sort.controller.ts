// controller/sort.controller.ts
import { Request, Response, NextFunction } from 'express';
import { Job } from '../models';
import { validateSortInput } from '../validations';
import {
  getSortIndexHint,
  getSortDescription,
  buildSortQuery,
  getSortOptions,
} from '../services';
import { generateSecureId, sanitizeInput } from '@/shared/security.js';
import logger from '@/shared/logger.util.js';
import ResponseUtil from '@/shared/response.util.js';
import { ValidationError } from '@/shared/errors/app.error.js';
import CacheUtil from '@/shared/cache.util';
import { PipelineStage } from 'mongoose';


// Request context helper
const withSortContext = (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 1200) {
        logger.warn(`[${requestId}] Slow sort operation`, { duration });
      }
    }
  };

// Main Unified Sort Endpoint (GET/POST)
export const sortJobsController = withSortContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const startTime = Date.now();

  // Merge query + body + userId
  const sanitizedInput = sanitizeInput({
    ...req.query,
    ...req.body,
    userId,
  });

  const { error, value } = validateSortInput(sanitizedInput);
  if (error) throw new ValidationError('Invalid sort input', error.details);

  // Cache key (includes user for personalization)
  const cacheKey = `sort:${value.sortBy}:${Buffer.from(
    JSON.stringify({ ...value, userId: userId || 'anonymous' })
  ).toString('base64').slice(0, 150)}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    ResponseUtil.success({
      ...JSON.parse(cached),
      cached: true,
    });
  }

  const query = buildSortQuery(value);
  let jobs = [];
  let total = 0;

  // Complex sorts using aggregation
  if (['trending', 'match-score', 'distance', 'urgency'].includes(value.sortBy)) {
    const pipeline: PipelineStage[] = [{ $match: query }];

    // Trending sort
    if (value.sortBy === 'trending') {
      pipeline.push(
        {
          $addFields: {
            daysSincePosted: {
              $divide: [{ $subtract: [new Date(), '$dates.posted'] }, 86400000],
            },
            engagementRate: {
              $divide: [{ $add: ['$applicationsCount', 0] }, { $max: [{ $add: ['$viewsCount', 0] }, 1] }],
            },
          },
        },
        {
          $addFields: {
            trendingScore: {
              $multiply: [
                {
                  $add: [
                    { $multiply: ['$applicationsCount', 3] },
                    { $multiply: ['$viewsCount', 1] },
                    { $multiply: [{ $add: ['$sharesCount', 0] }, 5] },
                    { $multiply: ['$engagementRate', 100] },
                  ],
                },
                { $exp: { $divide: [{ $multiply: ['$daysSincePosted', -1] }, 2] } },
              ],
            },
          },
        },
        { $sort: { trendingScore: -1, 'dates.posted': -1 } }
      );
    }

    // Distance sort (requires user coords)
    else if (value.sortBy === 'distance' && value.userLat && value.userLng) {
      pipeline.push(
        {
          $addFields: {
            distance: {
              $sqrt: {
                $add: [
                  { $pow: [{ $multiply: [{ $subtract: ['$location.coordinates.lat', value.userLat] }, 111] }, 2] },
                  {
                    $pow: [
                      {
                        $multiply: [
                          { $subtract: ['$location.coordinates.lng', value.userLng] },
                          111 * Math.cos((value.userLat * Math.PI) / 180),
                        ],
                      },
                      2,
                    ],
                  },
                ],
              },
            },
          },
        },
        { $sort: { distance: 1, 'dates.posted': -1 } }
      );
    }

    // Urgency sort
    else if (value.sortBy === 'urgency') {
      pipeline.push(
        {
          $addFields: {
            hoursToDeadline: {
              $divide: [{ $subtract: ['$dates.expires', new Date()] }, 3600000],
            },
          },
        },
        {
          $addFields: {
            urgencyScore: {
              $switch: {
                branches: [
                  { case: { $lte: ['$hoursToDeadline', 0] }, then: -1 },
                  { case: { $lte: ['$hoursToDeadline', 24] }, then: 100 },
                  { case: { $lte: ['$hoursToDeadline', 72] }, then: 80 },
                  { case: { $lte: ['$hoursToDeadline', 168] }, then: 60 },
                ],
                default: 20,
              },
            },
          },
        },
        { $sort: { urgencyScore: -1, 'dates.posted': -1 } }
      );
    }

    // Match-score sort (basic version)
else if (value.sortBy === 'match-score') {
  let matchCalc: any = { $literal: 50 };
  if (value.userSkills?.length) {
    matchCalc = {
      $multiply: [
        {
          $divide: [
            { $size: { $setIntersection: ['$skills.name', value.userSkills] } },
            { $max: [{ $size: '$skills.name' }, 1] },
          ],
        },
        100,
      ],
    };
  }
  pipeline.push(
    { $addFields: { matchScore: matchCalc } },
    { $sort: { matchScore: -1, 'dates.posted': -1 } }
  );
}

    // Final facet for pagination + count
    pipeline.push({
      $facet: {
        jobs: [
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
              'dates.posted': 1,
              'dates.expires': 1,
              applicationsCount: 1,
              viewsCount: 1,
              featured: 1,
              trendingScore: 1,
              matchScore: 1,
              distance: 1,
              urgencyScore: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    });

    const [results] = await Job.aggregate(pipeline);
    jobs = results.jobs || [];
    total = results.totalCount?.[0]?.count || 0;
  } else {
    // Simple indexed sorts
    const sortOptions = getSortOptions(value.sortBy, value.sortOrder, null, value.query);

    const [jobResults, totalCount] = await Promise.all([
      Job.find(query)
        .select(
          'jobId title companyId company.name company.logo company.rating location jobType salary experience skills dates applicationsCount viewsCount featured'
        )
        .sort(sortOptions)
        .skip((value.page - 1) * value.limit)
        .limit(value.limit)
        .lean()
        .hint(getSortIndexHint(value.sortBy)),
      Job.countDocuments(query),
    ]);

    jobs = jobResults;
    total = totalCount;
  }

  const responseData = {
    jobs,
    pagination: {
      page: value.page,
      limit: value.limit,
      total,
      totalPages: Math.ceil(total / value.limit),
      hasNext: value.page < Math.ceil(total / value.limit),
      hasPrev: value.page > 1,
    },
    sorting: {
      sortBy: value.sortBy,
      sortOrder: value.sortOrder,
      availableSorts: [
        'relevance', 'date', 'salary-high', 'salary-low', 'company-rating',
        'applications', 'views', 'trending', 'match-score', 'distance', 'urgency', 'featured',
      ],
    },
    meta: {
      searchQuery: value.query || '',
      resultsFound: total,
      searchTime: Date.now() - startTime,
      cached: false,
      sortAlgorithm: getSortDescription(value.sortBy),
    },
  };

  // Cache with dynamic TTL
  const cacheExpiry = ['trending', 'urgency'].includes(value.sortBy) ? 300 : 1800;
  await CacheUtil.set(cacheKey, JSON.stringify(responseData), cacheExpiry).catch(() => { });

  // Async analytics
  // JobEventService.emit('analytics:sort', {
  //   userId,
  //   sortBy: value.sortBy,
  //   sortOrder: value.sortOrder,
  //   query: value.query,
  //   resultCount: jobs.length,
  //   totalResults: total,
  //   searchTime: Date.now() - startTime,
  //   page: value.page,
  //   metadata: { ip: req.ip, userAgent: req.headers['user-agent'], cached: false },
  // }).catch((err: any) => logger.error('Sort analytics event failed', { err }));

  ResponseUtil.paginated(res, jobs, responseData.pagination, 'JOBS_RETRIEVED');
});

// GET - Available Sort Options (dynamic based on context)
export const getSortOptionsControllerController = async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { hasLocation, hasSkills, hasQuery } = req.query;

  const baseOptions = [
    { value: 'relevance', label: 'Most Relevant', default: true },
    { value: 'date', label: 'Most Recent' },
    { value: 'salary-high', label: 'Salary: High to Low' },
    { value: 'salary-low', label: 'Salary: Low to High' },
    { value: 'company-rating', label: 'Company Rating' },
    { value: 'applications', label: 'Most Applied' },
    { value: 'featured', label: 'Featured Jobs' },
  ];

  const conditional = [];

  if (hasLocation === 'true') conditional.push({ value: 'distance', label: 'Distance' });
  if (hasSkills === 'true' || userId) conditional.push({ value: 'match-score', label: 'Best Match' });
  if (hasQuery === 'true') conditional.push({ value: 'trending', label: 'Trending' });

  conditional.push(
    { value: 'urgency', label: 'Urgent' },
    { value: 'alphabetical', label: 'A to Z' }
  );

  ResponseUtil.success(res, {
    sortOptions: [...baseOptions, ...conditional],
  }, 'Available sort options');
};