// controller/ai.controller.ts
import { Request, Response, NextFunction } from 'express';
import { aiServiceJob } from '../services';
import { withLock } from '@/shared/utils/withLocks';
import {
  validateResumeOptimization,
  validateJobMatching,
  validateJobAnalysis,
  validateOpenToWork,
  validateFeaturedApplicant,
  validateDirectMessage,
  validateTopApplicantJobs,
  validateCompanyVerification,
  validateSalaryVerification,
  validateApplicationDuplicate,
} from '../validations';
import { generateSecureId, sanitizeInput } from '@/shared/security.js';
import ResponseUtil from '@/shared/response.util.js';
import {
  ValidationError,
  AuthorizationError,
  ForbiddenError,
  TooManyRequestsError
} from '@/shared/errors/app.error';
import { ai_requestCounter, ai_requestLatency } from '@/shared/metrics.js';
import { logger } from '@/shared/logger.util.js';
import constants from '@/shared/constants.util';
import CacheUtil from '@/shared/cache.util';

// Add after imports, before withAiRequestContext
const RATE_LIMITS = {
  RESUME_OPTIMIZATION: { max: 10, windowMs: 60000 },
  JOB_MATCHING: { max: 20, windowMs: 60000 },
  JOB_ANALYSIS: { max: 15, windowMs: 60000 },
  COMPANY_VERIFICATION: { max: 5, windowMs: 60000 },
  SALARY_VERIFICATION: { max: 5, windowMs: 60000 },
};

// Reusable request context + metrics helper
const withAiRequestContext = (endpoint: string, handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    ai_requestCounter.inc({ endpoint, status: 'attempt' });
    const latencyTimer = ai_requestLatency.startTimer({ endpoint });

    try {
      await handler(req, res);
      ai_requestCounter.inc({ endpoint, status: 'success' });
    } catch (err) {
      ai_requestCounter.inc({ endpoint, status: 'error' });
      next(err);
    } finally {
      latencyTimer();
      const duration = Date.now() - startTime;
      logger.debug(`[${requestId}] AI endpoint duration: ${duration}ms`, { endpoint });
    }
  };

// POST - Optimize Resume
export const optimizeResumeController = withAiRequestContext('optimize_resume', async (req: Request, res: Response) => {
  const { error, value } = validateResumeOptimization(req.body);
  if (error) throw new ValidationError('Invalid resume optimization input', error.details);

  const userId = sanitizeInput(req.user?.userId);
  const { resumeData, targetJobId } = value;

  const cacheKey = `resume_optimization:${userId}:${targetJobId}`;
  const rateLimitKey = `rate:resume:${userId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    ResponseUtil.success(res, {
      ...JSON.parse(cached),
      cached: true,
      processingTime: Date.now() - Date.now(), // fix if needed
    }, 'DATA_RETRIEVED');
  }

  await withLock(`resume:${userId}`, 5000, async () => {
    const count = await CacheUtil.incr(rateLimitKey);
    if (count > RATE_LIMITS.RESUME_OPTIMIZATION.max) {
      throw new TooManyRequestsError('Resume optimization limit exceeded');
    }
    await CacheUtil.expire(rateLimitKey, RATE_LIMITS.RESUME_OPTIMIZATION.windowMs / 1000);

    //     const optimized = await aiServiceJob.optimizeResume(
    //   { resumeData, targetJobId, requestId: generateSecureId() },
    //   req
    // );

    // Try this:
    const optimized = await aiServiceJob.optimizeResume(resumeData, req);

    await CacheUtil.set(cacheKey, JSON.stringify(optimized), Number(constants.CACHE_TTLS.RESUME_OPTIMIZATION));

    ResponseUtil.success(res, {
      ...optimized,
      processingTime: Date.now() - Date.now(),
    }, 'OPERATION_SUCCESSFUL');
  });
});

// GET - Job Matches
export const getJobMatchesController = withAiRequestContext('job_matches', async (req: Request, res: Response) => {
  const { error, value } = validateJobMatching(req.query);
  if (error) throw new ValidationError('Invalid job matching parameters', error.details);

  const userId = sanitizeInput(req.user?.userId);
  // Wrong:
  // const preferences = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeInput(v)]));

  // Right:
  const preferences = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeInput(v as string)]));
  const cacheKey = `job_matches:${userId}:${JSON.stringify(preferences).slice(0, 50)}`;
  const rateLimitKey = `rate:matches:${userId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    ResponseUtil.success(res, {
      ...JSON.parse(cached),
      cached: true,
    }, 'DATA_RETRIEVED');
  }

  await withLock(`matches:${userId}`, 5000, async () => {
    const count = await CacheUtil.incr(rateLimitKey);
    if (count > RATE_LIMITS.JOB_MATCHING.max) {
      throw new TooManyRequestsError('Job matching limit exceeded');
    }
    await CacheUtil.expire(rateLimitKey, RATE_LIMITS.JOB_MATCHING.windowMs / 1000);

    // const matches = await aiServiceJob.getJobMatches(
    //   { userId, preferences, requestId: generateSecureId() },
    //   req
    // );

    // Right (userId hatao):
    const matches = await aiServiceJob.getJobMatches(
      {  id: userId!, preferences, requestId: generateSecureId() },
      req
    );

    await CacheUtil.set(cacheKey, JSON.stringify(matches), Number(constants.CACHE_TTLS.JOB_MATCHES),);

    ResponseUtil.success(res, matches, 'DATA_RETRIEVED');
  });
});

// POST - Analyze Job Description
export const analyzeJobDescriptionController = withAiRequestContext('job_analysis', async (req: Request, res: Response) => {
  const { error, value } = validateJobAnalysis(req.body);
  if (error) throw new ValidationError('Invalid job analysis input', error.details);

  const { jobId, description } = value;
  const cacheKey = `job_analysis:${jobId}`;
  const rateLimitKey = `rate:analysis:${req.user?.userId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    ResponseUtil.success(res, {
      ...JSON.parse(cached),
      cached: true,
    }, 'DATA_RETRIEVED');
  }

  await withLock(`analysis:${jobId}`, 5000, async () => {
    const count = await CacheUtil.incr(rateLimitKey);
    if (count > RATE_LIMITS.JOB_ANALYSIS.max) {
      throw new TooManyRequestsError('Job analysis limit exceeded');
    }
    await CacheUtil.expire(rateLimitKey, RATE_LIMITS.JOB_ANALYSIS.windowMs / 1000);

    const analysis = await aiServiceJob.analyzeJobDescription(
      { jobId, description, requestId: generateSecureId() },
      req
    );

    await CacheUtil.set(cacheKey, JSON.stringify(analysis), Number(constants.CACHE_TTLS.JOB_ANALYSIS),);

    ResponseUtil.success(res, analysis, 'DATA_RETRIEVED');
  });
});

// POST - Update Open to Work
export const updateOpenToWorkController = withAiRequestContext('open_to_work', async (req: Request, res: Response) => {
  const { error, value } = validateOpenToWork(req.body);
  if (error) throw new ValidationError('Invalid open to work input', error.details);

  const userId = sanitizeInput(req.user?.userId);
  const { isOpenToWork, preferences } = value;

  const result = await aiServiceJob.updateOpenToWorkStatus(
    { id: userId!, isOpenToWork, preferences, requestId: generateSecureId() },
    req
  );

  ResponseUtil.success(res, result, 'OPERATION_SUCCESSFUL');
});

// POST - Set Featured Applicant (Company/Recruiter)
export const setFeaturedApplicantController = withAiRequestContext('featured_applicant', async (req: Request, res: Response) => {
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('Unauthorized to set featured applicants');
  }

  const { error, value } = validateFeaturedApplicant(req.body);
  if (error) throw new ValidationError('Invalid featured applicant input', error.details);

  const result = await aiServiceJob.setFeaturedApplicant(
    {
      applicationId: value.applicationId,
      jobId: value.jobId,
      companyId: sanitizeInput(value.companyId),
      requestId: generateSecureId(),
    },
    req
  );

  ResponseUtil.success(res, result, 'OPERATION_SUCCESSFUL');
});

// POST - Send Direct Message (Recruiter)
export const sendDirectMessageController = withAiRequestContext('direct_message', async (req: Request, res: Response) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'moderator') {
    throw new ForbiddenError('Unauthorized to send direct messages');
  }

  const { error, value } = validateDirectMessage(req.body);
  if (error) throw new ValidationError('Invalid direct message input', error.details);

  const result = await aiServiceJob.sendDirectMessage(
    {
      senderId: sanitizeInput(req.user?.userId),
      recipientId: value.recipientId,
      message: value.message,
      jobId: value.jobId,
      requestId: generateSecureId(),
    },
    req
  );

  ResponseUtil.created(res, result, 'OPERATION_SUCCESSFUL');
});

// GET - Top Applicant Jobs
export const getTopApplicantJobsController = withAiRequestContext('top_applicant_jobs', async (req: Request, res: Response): Promise<any> => {
  const { error, value } = validateTopApplicantJobs(req.query);
  if (error) throw new ValidationError('Invalid top applicant jobs query', error.details);

  const userId = sanitizeInput(req.user?.userId);
  const { limit = 10, cursor } = value;

  const cacheKey = `top_applicant_jobs:${userId}:${cursor || '0'}:${limit}`;
  const cached = await CacheUtil.get(cacheKey);

  if (cached) {
    return ResponseUtil.success(res, JSON.parse(cached), 'DATA_RETRIEVED');
  }

  const jobsData = await aiServiceJob.getTopApplicantJobs(
    { id: userId!, pagination: { limit, cursor }, requestId: generateSecureId() },
    req
  );

  const response = {
    jobs: jobsData.items,
    pagination: {
      nextCursor: jobsData.nextCursor,
      totalJobs: jobsData.totalCount,
      limit,
    },
  };

  await CacheUtil.set(cacheKey, JSON.stringify(response), Number(constants.CACHE_TTLS.TOP_APPLICANT_JOBS));

  ResponseUtil.success(res, response, 'DATA_RETRIEVED');
});

// POST - Verify Company
export const verifyCompanyController = withAiRequestContext('company_verification', async (req: Request, res: Response) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'moderator') {
    throw new AuthorizationError('Unauthorized to verify companies');
  }

  const { error, value } = validateCompanyVerification(req.body);
  if (error) throw new ValidationError('Invalid company verification input', error.details);

  await withLock(`verify_company:${value.companyId}`, 5000, async () => {
    const rateKey = `rate:verify_company:${req.user?.userId}`;
    const count = await CacheUtil.incr(rateKey);
    if (count > RATE_LIMITS.COMPANY_VERIFICATION.max) {
      throw new TooManyRequestsError('Company verification limit exceeded');
    }
    await CacheUtil.expire(rateKey, RATE_LIMITS.COMPANY_VERIFICATION.windowMs / 1000);

    const result = await aiServiceJob.verifyCompany(
      { companyId: value.companyId, verificationData: value.verificationData, requestId: generateSecureId() },
      req
    );

    await CacheUtil.set(`company_verification:${value.companyId}`, JSON.stringify(result), Number(constants.CACHE_TTLS.COMPANY_VERIFICATION));

    ResponseUtil.success(res, result, 'OPERATION_SUCCESSFUL');
  });
});

// POST - Verify Salary
export const verifySalaryController = withAiRequestContext('salary_verification', async (req: Request, res: Response) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'moderator') {
    throw new AuthorizationError('Unauthorized to verify salaries');
  }

  const { error, value } = validateSalaryVerification(req.body);
  if (error) throw new ValidationError('Invalid salary verification input', error.details);

  await withLock(`verify_salary:${value.jobId}`, 5000, async () => {
    const rateKey = `rate:verify_salary:${req.user?.userId}`;
    const count = await CacheUtil.incr(rateKey);
    if (count > RATE_LIMITS.SALARY_VERIFICATION.max) {
      throw new TooManyRequestsError('Salary verification limit exceeded');
    }
    await CacheUtil.expire(rateKey, RATE_LIMITS.SALARY_VERIFICATION.windowMs / 1000);

    const result = await aiServiceJob.verifySalary(
      { jobId: value.jobId, salaryData: value.salaryData, requestId: generateSecureId() },
      req
    );

    await CacheUtil.set(`salary_verification:${value.jobId}`, JSON.stringify(result), Number(constants.CACHE_TTLS.JOB_ANALYSIS));

    ResponseUtil.success(res, result, 'OPERATION_SUCCESSFUL');
  });
});

// POST - Detect Duplicate Application
export const detectDuplicateApplicationController = withAiRequestContext('duplicate_application', async (req: Request, res: Response) => {
  const { error, value } = validateApplicationDuplicate(req.body);
  if (error) throw new ValidationError('Invalid duplicate detection input', error.details);

  const result = await aiServiceJob.detectDuplicateApplication(
    {
      userId: value.userId,
      jobId: value.jobId,
      applicationData: value.applicationData,
      requestId: generateSecureId(),
    },
    req
  );

  ResponseUtil.success(res, result, 'DATA_RETRIEVED');
});

// POST - Calculate Job Quality Score
export const calculateJobQualityScoreController = withAiRequestContext('job_quality_score', async (req: Request, res: Response): Promise<any> => {
  const { error, value } = validateJobAnalysis(req.body);
  if (error) throw new ValidationError('Invalid job quality input', error.details);

  const { jobId, description } = value;
  const cacheKey = `job_quality:${jobId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    ResponseUtil.success(res, JSON.parse(cached), 'DATA_RETRIEVED');
  }

  const result = await aiServiceJob.calculateJobQualityScore(
    { jobId, description, requestId: generateSecureId() },
    req
  );

  await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.JOB_ANALYSIS),);

  ResponseUtil.success(res, result, 'DATA_RETRIEVED');
});

// POST - Detect Spam Job
export const detectSpamJobController = withAiRequestContext('spam_job_detection', async (req: Request, res: Response) => {
  const { error, value } = validateJobAnalysis(req.body);
  if (error) throw new ValidationError('Invalid spam detection input', error.details);

  const { jobId, description } = value;
  const cacheKey = `spam_detection:${jobId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    ResponseUtil.success(res, JSON.parse(cached), 'DATA_RETRIEVED');
  }

  const result = await aiServiceJob.detectSpamJob(
    { jobId, description, requestId: generateSecureId() },
    req
  );

  await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.JOB_ANALYSIS));

  ResponseUtil.success(res, result, 'DATA_RETRIEVED');
});