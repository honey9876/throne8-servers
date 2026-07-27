// controller/premiumSearch.controller.ts
import { Request, Response, NextFunction, response } from 'express';
import { validationResult } from 'express-validator';

import { createJobSearchService,  JobSearchService } from '@/Job-Service/services/premium/premiumJobSearch.service';
import { generateSecureId, sanitizeInput } from '@/shared/security';

import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';

import {
  ValidationError,
  NotFoundError
} from '@/shared/errors/app.error';
import CacheUtil from '@/shared/cache.util';
import esClient from '@/config/cache/elasticsearch';

const jobSearchService = createJobSearchService();


// Request context helper (consistent across controllers)
const withPremiumSearchContext = (handler: (req: Request, res: Response) => Promise<void>) =>
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
        logger.warn(`[${requestId}] Slow premium search operation`, { duration });
      }
    }
  };

// POST/GET - Boolean Search  <
export const booleanSearchController = withPremiumSearchContext(async (req: Request, res: Response): Promise<any> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const results = await jobSearchService.searchJobs(
    sanitizeInput({ ...req.query, ...req.body }),
    req.user?.userId!,
    true // boolean mode
  );

  if (!results || results.total === 0) {
    return ResponseUtil.noContent(res);
  }

  ResponseUtil.paginated(
    res,
    results.hits,
    {
      total: results.total,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      // aggregations: results.aggregations,
      // took: results.took,
    },
    'Boolean search completed successfully'
  );
});

// GET - Jobs in Network (connections)
export const networkJobsController = withPremiumSearchContext(async (req: Request, res: Response): Promise<any> => {
  const limit = parseInt(req.query.limit as string) || 20;

  const jobs = await jobSearchService.getJobsInNetwork(req.user?.userId!, limit);

  if (!jobs || jobs.length === 0) {
    return ResponseUtil.noContent(res,);
  }

  ResponseUtil.success(res, {
    jobs,
    meta: {
      total: jobs.length,
      source: 'network',
    },
  }, 'Network jobs fetched successfully');
});

// GET - Alumni Jobs
export const alumniJobsController = withPremiumSearchContext(async (req: Request, res: Response): Promise<any> => {
  const limit = parseInt(req.query.limit as string) || 20;

  const jobs = await jobSearchService.getAlumniJobs(req.user?.userId!, limit);

  if (!jobs || jobs.length === 0) {
    return ResponseUtil.noContent(res, );
  }

  ResponseUtil.success(res, {
    jobs,
    meta: {
      total: jobs.length,
      source: 'alumni',
    },
  }, 'Alumni jobs fetched successfully');
});

// GET - Trending Jobs
export const trendingJobsController = withPremiumSearchContext(async (req: Request, res: Response): Promise<any> => {
  const limit = parseInt(req.query.limit as string) || 50;

  const jobs = await jobSearchService.getTrendingJobs(limit);

  if (!jobs || jobs.length === 0) {
    return ResponseUtil.noContent(res,);
  }

  ResponseUtil.success(res, {
    jobs,
    meta: {
      total: jobs.length,
      source: 'trending',
      refreshed: new Date().toISOString(),
    },
  }, 'Trending jobs fetched successfully');
});

// GET - New Graduate Jobs
export const newGradJobsController = withPremiumSearchContext(async (req: Request, res: Response): Promise<void> => {
  const results = await jobSearchService.getFilteredJobs('newgrad', sanitizeInput(req.query), req.user?.userId!);

  if (!results || results.total === 0) {
     ResponseUtil.noContent(res, );
  }

  ResponseUtil.success(
    res,
    {
      total: results.total,
      filter: 'new_graduate',
      // aggregations: results.aggregations,
      results: results.hits,
    },
    'New graduate jobs fetched successfully'
  );
});

// GET - Senior Level Jobs
export const seniorJobsController = withPremiumSearchContext(async (req: Request, res: Response): Promise<any> => {
  const results = await jobSearchService.getFilteredJobs('senior', sanitizeInput(req.query), req.user?.userId!);

  if (!results || results.total === 0) {
    return ResponseUtil.noContent(res, );
  }

  ResponseUtil.success(
    res,
    {
      total: results.total,
      filter: 'senior_level',
      // aggregations: results.aggregations,
      results: results.hits,
    },
    'Senior level jobs fetched successfully'
  );
});

// GET - Contract / Freelance Jobs
export const contractJobsController = withPremiumSearchContext(async (req: Request, res: Response) : Promise<any> => {
  const baseParams = { ...sanitizeInput(req.query), jobType: ['contract', 'freelance'] };

  const results = await jobSearchService.searchJobs(baseParams, req.user?.userId!);

  if (!results || results.total === 0) {
    return ResponseUtil.noContent(res, );
  }

  ResponseUtil.success(
    res,
    {
      total: results.total,
      filter: 'contract_freelance',
      // aggregations: results.aggregations,
      results: results.hits,
    },
    'Contract & freelance jobs fetched successfully'
  );
});

// GET - Startup Jobs
export const startupJobsController = withPremiumSearchContext(async (req: Request, res: Response) : Promise<any> => {
  const results = await jobSearchService.getFilteredJobs('startup', sanitizeInput(req.query), req.user?.userId!);

  if (!results || results.total === 0) {
    return ResponseUtil.noContent(res);
  }

  ResponseUtil.success(
    res,
    {
      total: results.total,
      filter: 'startup',
      // aggregations: results.aggregations,
      results: results.hits,
    },
    'Startup jobs fetched successfully'
  );
});

// GET - Fortune 500 Jobs
export const fortune500JobsController = withPremiumSearchContext(async (req: Request, res: Response): Promise<any> => {
  const results = await jobSearchService.getFilteredJobs('fortune500', sanitizeInput(req.query), req.user?.userId!);

  if (!results || results.total === 0) {
    return ResponseUtil.noContent(res, );
  }

  ResponseUtil.success(
    res,
    {
      total: results.total,
      filter: 'fortune500',
      // aggregations: results.aggregations,
      results: results.hits,
    },
    'Fortune 500 jobs fetched successfully'
  );
});

// GET - No Experience Required Jobs
export const noExperienceJobsController = withPremiumSearchContext(async (req: Request, res: Response): Promise<any> => {
  const results = await jobSearchService.getFilteredJobs('no_experience', sanitizeInput(req.query), req.user?.userId!);

  if (!results || results.total === 0) {
    return ResponseUtil.noContent(res);
  }

  ResponseUtil.success(
    res,
    {
      total: results.total,
      filter: 'no_experience_required',
      // aggregations: results.aggregations,
      results: results.hits,
    },
    'No experience required jobs fetched successfully'
  );
});

// GET - Search Suggestions (autocomplete)
export const searchSuggestionsController = withPremiumSearchContext(async (req: Request, res: Response): Promise<any> => {
  const { q } = req.query;

  if (!q || (q as string).length < 2) {
    return ResponseUtil.success(res, { suggestions: [] }, 'Search suggestions');
  }

  const cacheKey = `suggestions:${(q as string).toLowerCase()}`;
  let suggestions = await CacheUtil.get(cacheKey);

  if (!suggestions) {
    const body = {
      suggest: {
        job_titles: {
          prefix: q,
          completion: {
            field: 'title.suggest',
            size: 10,
            fuzzy: { fuzziness: 1 },
          },
        },
        companies: {
          prefix: q,
          completion: {
            field: 'company.name.suggest',
            size: 10,
            fuzzy: { fuzziness: 1 },
          },
        },
        skills: {
          prefix: q,
          completion: {
            field: 'skills.suggest',
            size: 10,
            fuzzy: { fuzziness: 1 },
          },
        },
        locations: {
          prefix: q,
          completion: {
            field: 'location.city.suggest',
            size: 10,
            fuzzy: { fuzziness: 1 },
          },
        },
      },
    };

    if(!esClient) {
      throw new Error('Elasticsearch client not initialized');
    }

    // const response = await JobSearchService.searchService.client.search({
    //   index: JobSearchService.searchService.jobsIndex,
    //   body,
    // });

    const esResponse = await esClient?.search({
      index: jobSearchService['searchService'],
      body: body,
    } as any);

    // ✅ Fix: Handle undefined suggest and non-array options
    const skillSuggest = esResponse.suggest?.skill_suggest?.[0];
    const options = skillSuggest?.options;

    if (!options) {
      return [];
    }

    const optionsArray = Array.isArray(options) ? options : [options];

    const suggestions = optionsArray.map((opt: any) => ({
      job_titles: opt.text,
      companies: opt.text,
      skills: opt.text,
      locations: opt.text,
    }));

    // suggestions = {
    //   titles: esResponse.suggest?.job_titles?.[0]?.options?.map((opt: any) => opt.text) || [],
    //   companies: esResponse.suggest?.companies?.[0]?.options?.map((opt: any) => opt.text) || [],
    //   skills: esResponse.suggest?.skills?.[0]?.options?.map((opt: any) => opt.text) || [],
    //   locations: esResponse.suggest?.locations?.[0]?.options?.map((opt: any) => opt.text) || [],
    // };

    await CacheUtil.set(cacheKey, suggestions, 3600); // 1 hour
  }

  ResponseUtil.success(res, suggestions, 'Search suggestions fetched successfully');
});