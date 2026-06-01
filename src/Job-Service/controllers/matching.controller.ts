// controller/matching.controller.ts
import { Request, Response, NextFunction } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Job, UserInteractionModel, Search } from '../models';
import {
  SearchStatsService,
  AdvancedSearchEngine,
  AnalyticsProcessor,
  RecommendationEngine,
  RecommendationUtils,
} from '@/Job-Service/services/search.service.js';

import {
  validateUserProfile,
  validatePaginationParams,
  validateMatchingParams,
} from '@/Job-Service/validations/company.validation.js';
// import generateRecommendations from 

import { generateSecureId, sanitizeInput } from '@/shared/security.js';
// import { withLock, withRetry } from '@/utils/withLocks.js';
import { withLock, withRetry } from '@/shared/utils/withLocks';

import logger from '@/shared/logger.util.js';
import ResponseUtil from '@/shared/response.util.js';
import {
  ValidationError,
  NotFoundError,
  TooManyRequestsError,
} from '@/shared/errors/app.error.js';
import { ai_requestCounter, ai_requestLatency, activeSearches, searchDuration } from '@/shared/metrics.js';
import { PersonalizationEngine } from '@/Job-Service/models/search.model.js';
import CacheUtil from '@/shared/cache.util';
import { Company } from '@/company/models';

// Constants
const SUCCESS_MESSAGES = {
  DATA_RETRIEVED: 'Data retrieved successfully',
  OPERATION_SUCCESSFUL: 'Operation completed successfully',
};

const CACHE_TTL = {
  MATCH_SCORE: 3600,
  RECENT_JOBS: 1800,
};

const RATE_LIMITS = {
  INVITATIONS_PER_USER: { max: 50 },
};

// Stub services (create proper implementations)
class MatchingService {
  static async calculateMatchScore(profile: any, job: any) {
    return { matchScore: 85, breakdown: {}, companySimilarityScore: 0 };
  }
  
  static async getCompanyInvitationLimit(companyId: string) {
    return 100;
  }
  
  static async sendInvitationToApply(data: any) {
    return { invitationId: generateSecureId(), status: 'sent' };
  }
}

class CompanyVectorService {
  static async findSimilarCompanies(query: string, limit: number) {
    return [];
  }
}

// Reusable request context
const withMatchingContext = (endpoint: string, handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    activeSearches.inc();
    ai_requestCounter.inc({ endpoint, status: 'attempt' });
    const latencyTimer = ai_requestLatency.startTimer({ endpoint });

    try {
      await handler(req, res);
      ai_requestCounter.inc({ endpoint, status: 'success' });
    } catch (err) {
      ai_requestCounter.inc({ endpoint, status: 'error' });
      next(err);
    } finally {
      activeSearches.dec();
      latencyTimer();
      const duration = Date.now() - startTime;
      searchDuration.observe(duration);
      if (duration > 1500) {
        logger.warn(`[${requestId}] Slow matching operation`, { duration, endpoint });
      }
    }
  };

// POST - Calculate Match Score
export const calculateMatchScoreController = withMatchingContext('match_score', async (req: Request, res: Response): Promise<void> => {
  const { error } = validateUserProfile(req.body);
  if (error) throw new ValidationError('Invalid user profile for match calculation', error.details);

  const sanitizedData = {
    ...req.body,
    userId: sanitizeInput(req.body.userId),
    job: {
      ...req.body.job,
      jobId: sanitizeInput(req.body.job.jobId),
    },
  };

  const { job, userId } = sanitizedData;
  const cacheKey = `match_score:${userId}:${job.jobId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    ResponseUtil.success(res, { ...parsed, cached: true }, SUCCESS_MESSAGES.DATA_RETRIEVED);
    return;
  }

  const result = await withRetry(() => MatchingService.calculateMatchScore(sanitizedData, job));

  // Optional: Enhance with company similarity
  // if (job.companyId && sanitizedData.userProfile?.skills) {
  //   const similar = await CompanyVectorService.findSimilarCompanies(
  //     sanitizedData.userProfile.skills.join(' '),
  //     5
  //   );
  //   result.companySimilarityScore = similar.find((c: any) => c.metadata.companyId === job.companyId)?.score || 0;
  // }

  // Problem: TypeScript infer kar raha hai ki similar array type 'never' hai
// Fix: Proper typing add karo

// Line 120-128 ko aise fix karo:
if (job.companyId && sanitizedData.userProfile?.skills) {
  const similar = await CompanyVectorService.findSimilarCompanies(
    sanitizedData.userProfile.skills.join(' '),
    5
  );
  // Type assertion add karo
  const similarCompanies = similar as Array<{ metadata: { companyId: string }, score: number }>;
  result.companySimilarityScore = similarCompanies.find((c) => c.metadata.companyId === job.companyId)?.score || 0;
}

  const enhanced = {
    ...result,
    matchId: generateSecureId(),
    calculatedAt: new Date().toISOString(),
    version: '2.1',
  };

  const ttl = result.matchScore > 80 ? CACHE_TTL.MATCH_SCORE * 2 : CACHE_TTL.MATCH_SCORE;
  await CacheUtil.set(cacheKey, JSON.stringify(enhanced), ttl);

  // Background logging
  setImmediate(async () => {
    try {
      await UserInteractionModel.create({
        activityId: generateSecureId(),
        userId,
        activityType: 'MATCH_CALCULATION',
        metadata: { jobId: job.jobId, matchScore: result.matchScore },
      });
    } catch (err: any) {
      logger.error('Background match analytics failed', { err });
    }
  });

  ResponseUtil.success(res, enhanced, SUCCESS_MESSAGES.OPERATION_SUCCESSFUL);
});

// GET - Personalized Job Recommendations
export const getRecommendedJobsController = withMatchingContext('recommendations', async (req: Request, res: Response): Promise<void> => {
  const { error: profileErr } = validateUserProfile(req.body);
  if (profileErr) throw new ValidationError('Invalid user profile for recommendations', profileErr.details);

  const { error: pagErr } = validatePaginationParams(req.query);
  if (pagErr) throw new ValidationError('Invalid pagination params', pagErr.details);

  const {
    cursor,
    limit = 20,
    minSalary,
    maxSalary,
    location,
    experienceLevel,
    jobType,
    industry,
    skills,
    sortBy = 'relevance',
    includeRemote = false,
    salaryType = 'all',
  } = req.query;

  const filters = {
    minSalary: minSalary ? sanitizeInput(minSalary as string) : undefined,
    maxSalary: maxSalary ? sanitizeInput(maxSalary as string) : undefined,
    location: location ? sanitizeInput(location as string) : undefined,
    experienceLevel: experienceLevel ? sanitizeInput(experienceLevel as string) : undefined,
    jobType: jobType ? sanitizeInput(jobType as string) : undefined,
    industry: industry ? sanitizeInput(industry as string) : undefined,
    skills: skills ? (skills as string).split(',').map((s: string) => sanitizeInput(s.trim())) : undefined,
    includeRemote: includeRemote === 'true',
    salaryType: sanitizeInput(salaryType as string),
  };

  const userId = sanitizeInput(req.user?.userId || req.body.userId);
  const cacheKey = `recommended_jobs:${userId}:${Buffer.from(
    JSON.stringify({ cursor, limit, sortBy, ...filters })
  ).toString('base64')}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    ResponseUtil.success(res, JSON.parse(cached), SUCCESS_MESSAGES.DATA_RETRIEVED);
    return;
  }

  const engine = new RecommendationEngine();
  // const recommendations: any = await withRetry(() =>
  //   engine.generateRecommendations(userId,{
  //     userProfile: req.body,
  //     pagination: { cursor, limit: parseInt(limit as string) },
  //     filters,
  //     sortBy: sanitizeInput(sortBy as string),
  //   })
  // );


// Line 200-210 ko aise change karo:
const recommendations: any = await withRetry(() =>
  RecommendationEngine.generateRecommendations(
    userId,
    {
      userProfile: req.body,
      pagination: { cursor, limit: parseInt(limit as string) },
      filters,
      sortBy: sanitizeInput(sortBy as string),
    },
    'personalized', // yeh 3rd argument 'type' hai (check your service file line 811)
    // {} // optional 4th argument agar chahiye ho
  )
);

// Ya agar type different chahiye:
// 'trending', 'similar', 'recent' etc. jo bhi valid types hain

  const responseData = {
    jobs: (recommendations.jobs || []).map((job: any) => ({
      ...job,
      viewId: generateSecureId(),
      recommendationReason: job.matchExplanation,
      similarityScore: job.matchScore,
      trending: job.trendingScore > 0.7,
    })),
    pagination: {
      page: 1,
      limit: parseInt(limit as string),
      total: recommendations.totalCount || 0,
      totalPages: Math.ceil((recommendations.totalCount || 0) / parseInt(limit as string)),
      nextCursor: recommendations.nextCursor,
    },
    filters: {
      applied: filters,
      available: recommendations.availableFilters || {},
      suggestions: recommendations.filterSuggestions || [],
    },
  };

  const ttl = 1800;
  await CacheUtil.set(cacheKey, JSON.stringify(responseData), ttl);

  setImmediate(async () => {
    try {
      await Search.create({
        searchId: generateSecureId(),
        userId,
        searchType: 'RECOMMENDATION',
        filters,
        resultsCount: recommendations.totalCount || 0,
        timestamp: new Date(),
      });
    } catch (err: any) {
      logger.error('Background recommendation analytics failed', { err });
    }
  });

  ResponseUtil.paginated(res, responseData.jobs, responseData.pagination, SUCCESS_MESSAGES.DATA_RETRIEVED);
});

// GET - Recently Posted Jobs

// Line 320-332 ko aise change karo:
export const getRecentlyPostedJobsController = withMatchingContext('recent_jobs', async (req: Request, res: Response): Promise<void> => {
  const { error } = validatePaginationParams(req.query);
  if (error) throw new ValidationError('Invalid pagination parameters', error.details);

  const {
    cursor,
    limit = 50,
    industry,
    location,
    jobType,
    experienceLevel,
    postedWithin = 7,
    includeExpired = false,
    sortBy = 'newest',
  } = req.query;

  const filters = {
    industry: industry ? sanitizeInput(industry as string) : undefined,
    location: location ? [sanitizeInput(location as string)] : undefined,
    jobType: jobType ? [sanitizeInput(jobType as string)] : undefined,
    experience: experienceLevel ? [sanitizeInput(experienceLevel as string)] : undefined,
    postedDate: `${Math.min(parseInt(postedWithin as string) || 7, 30)}d`, // '7d', '14d', etc.
    includeExpired: includeExpired === 'true',
  };

  const page = cursor ? parseInt(cursor as string) : 1;
  const limitNum = parseInt(limit as string);

  const cacheKey = `recent_jobs:${Buffer.from(JSON.stringify({ page, limit, ...filters })).toString('base64')}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    res.status(200).json({ ...JSON.parse(cached), cached: true });
    return;
  }

  // Use existing searchMongoDB method
  const result: any = await withRetry(() =>
    AdvancedSearchEngine.searchMongoDB(
      '', // empty query for recent jobs
      filters,
      page,
      limitNum,
      'date', // sort by date for recent jobs
      null // no user profile
    )
  );

  const responseData = {
    jobs: (result.hits || []).map((job: any) => ({
      ...job,
      viewId: generateSecureId(),
      postedAgo: new Date(job.dates?.posted).toISOString(),
      trending: job.personalizationScore > 60,
    })),
    pagination: {
      page: page,
      limit: limitNum,
      total: result.total || 0,
      totalPages: Math.ceil((result.total || 0) / limitNum),
      nextCursor: page < Math.ceil((result.total || 0) / limitNum) ? (page + 1).toString() : null,
    },
  };

  await CacheUtil.set(cacheKey, JSON.stringify(responseData), CACHE_TTL.RECENT_JOBS);

  ResponseUtil.paginated(res, responseData.jobs, responseData.pagination, 'Recent jobs retrieved');
});

// export const getRecentlyPostedJobsController = withMatchingContext('recent_jobs', async (req: Request, res: Response): Promise<void> => {
//   const { error } = validatePaginationParams(req.query);
//   if (error) throw new ValidationError('Invalid pagination parameters', error.details);

//   const {
//     cursor,
//     limit = 50,
//     industry,
//     location,
//     jobType,
//     experienceLevel,
//     postedWithin = 7,
//     includeExpired = false,
//     sortBy = 'newest',
//   } = req.query;

//   const filters = {
//     industry: industry ? sanitizeInput(industry as string) : undefined,
//     location: location ? sanitizeInput(location as string) : undefined,
//     jobType: jobType ? sanitizeInput(jobType as string) : undefined,
//     experienceLevel: experienceLevel ? sanitizeInput(experienceLevel as string) : undefined,
//     postedWithin: Math.min(parseInt(postedWithin as string) || 7, 30),
//     includeExpired: includeExpired === 'true',
//     sortBy: sanitizeInput(sortBy as string),
//   };

//   const cacheKey = `recent_jobs:${Buffer.from(JSON.stringify({ cursor, limit, ...filters })).toString('base64')}`;

//   const cached = await CacheUtil.get(cacheKey);
//   if (cached) {
//     res.status(200).json({ ...JSON.parse(cached), cached: true });
//     return;
//   }

//   // const engine = new AdvancedSearchEngine();
//   // const result: any = await withRetry(() =>
//   //   engine.findRecentJobs({
//   //     pagination: { cursor, limit: parseInt(limit as string) },
//   //     filters,
//   //   })
//   // );

//   // Pehle check karo AdvancedSearchEngine mein kaunsa method hai
// // Possible methods: searchJobs, search, findJobs, etc.

// const engine = new AdvancedSearchEngine();
// const result: any = await withRetry(() =>
//   engine.search({ // ya jo bhi correct method name ho
//     pagination: { cursor, limit: parseInt(limit as string) },
//     filters,
//     sortBy: 'newest',
//     type: 'recent', // agar type parameter chahiye
//   })
// );
  
//   const responseData = {
//     jobs: (result.jobs || []).map((job: any) => ({
//       ...job,
//       viewId: generateSecureId(),
//       postedAgo: new Date(job.postedAt).toISOString(),
//       trending: job.trendingScore > 0.6,
//     })),
//     pagination: {
//       page: 1,
//       limit: parseInt(limit as string),
//       total: result.totalCount || 0,
//       totalPages: Math.ceil((result.totalCount || 0) / parseInt(limit as string)),
//       nextCursor: result.nextCursor,
//     },
//   };

//   await CacheUtil.set(cacheKey, JSON.stringify(responseData), CACHE_TTL.RECENT_JOBS);

//   ResponseUtil.paginated(res, responseData.jobs, responseData.pagination, 'Recent jobs retrieved');
// });

// POST - Send Invitation to Apply



export const sendInvitationToApplyController = withMatchingContext('invitation', async (req: Request, res: Response): Promise<void> => {
  const { error: profileErr } = validateUserProfile(req.body);
  if (profileErr) throw new ValidationError('Invalid user profile for invitation', profileErr.details);

  const { error: paramsErr } = validateMatchingParams(req.params);
  if (paramsErr) throw new ValidationError('Invalid invitation parameters', paramsErr.details);

  const { jobId } = req.params;
  const { userId, companyId, personalizedMessage, deliveryChannels = ['email', 'sms', 'in-app'] } = req.body;

  const sanitized = {
    jobId: sanitizeInput(jobId),
    userId: sanitizeInput(userId),
    companyId: sanitizeInput(companyId),
    personalizedMessage: personalizedMessage ? sanitizeInput(personalizedMessage) : undefined,
    deliveryChannels: deliveryChannels.map((ch: string) => sanitizeInput(ch)),
  };

  const invitationKey = `invitation:${sanitized.userId}:${sanitized.jobId}`;

  const result = await withLock(invitationKey, 5000, async () => {
    const recent = await CacheUtil.get(invitationKey);

    if (recent) throw new TooManyRequestsError('Invitation already sent recently');

    const [job, company] = await Promise.all([
      Job.findOne({ jobId: sanitized.jobId, isDeleted: false }),
      Company.findOne({ companyId: sanitized.companyId, isDeleted: false }),
    ]);

    if (!job) throw new NotFoundError('Job');
    if (!company) throw new NotFoundError('Company');

    let message = sanitized.personalizedMessage;
    if (!message) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      const prompt = `Generate professional personalized job invitation (100-150 words) for user ${sanitized.userId} for job ${sanitized.jobId} at ${sanitized.companyId}.`;
      const aiResult = await model.generateContent(prompt);
      message = aiResult.response.text();
    }

    const matchScore = await MatchingService.calculateMatchScore(req.body, { jobId: sanitized.jobId })
      .then((r: any) => r.matchScore);

    const invitation = await MatchingService.sendInvitationToApply({
      userId: sanitized.userId,
      jobId: sanitized.jobId,
      companyId: sanitized.companyId,
      personalizedMessage: message,
      deliveryChannels: sanitized.deliveryChannels,
    });

    await CacheUtil.set(invitationKey, JSON.stringify({ sentAt: Date.now() }), 24 * 60 * 60);

    return { invitation, message, matchScore };
  });

  ResponseUtil.created(res, {
    invitationId: result.invitation.invitationId,
    status: result.invitation.status,
    matchScore: result.matchScore,
    personalizedMessage: result.message,
  }, 'Invitation sent successfully');
});