// controller/qualityTrust.controller.ts
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

import { qualityTrustService } from '@/Job-Service/services/qualityTrust.service';
import {
  // validateCompanyVerification,
  // validateJobSpamCheck,
  // validateSalaryVerification,
  // validateDuplicateApplication,
  // validateJobQuality,
} from '@/Job-Service/validations/qualityTrust.validations';
import {
  validateCompanyVerification, validateJobSpamCheck, validateSalaryVerification, validateDuplicateApplication, validateJobQuality
} from '../validations';

import { generateSecureId, sanitizeInput, validId } from '@/shared/security';
import { withLock } from '@/shared/utils/withLocks';

import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';

import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from '@/shared/errors/app.error';

import { requestCounter, requestLatency } from '@/shared/metrics';
import CacheUtil from '@/shared/cache.util';
import constants from '@/shared/constants.util';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';

const SUCCESS_MESSAGES = {
  DATA_RETRIEVED: 'Data retrieved successfully',
  OPERATION_SUCCESSFUL: 'Operation successful'
};

const RATE_LIMITS = {
  COMPANY_VERIFICATION: { max: 10, windowMs: 60000 },
  JOB_SPAM: { max: 20, windowMs: 60000 },
  SALARY_VERIFICATION: { max: 15, windowMs: 60000 },
  DUPLICATE_APPLICATION: { max: 30, windowMs: 60000 },
  JOB_QUALITY: { max: 25, windowMs: 60000 }
};

// const Number(constants.CACHE_TTLS =) {
//   COMPANY_VERIFICATION: 3600,
//   JOB_SPAM: 1800,
//   SALARY_VERIFICATION: 3600,
//   DUPLICATE_APPLICATION: 1800,
//   JOB_QUALITY: 3600
// };

// Reusable context helper for quality/trust endpoints
const withQualityContext = (
  endpoint: string, 
  handler: (req: AuthRequest, res: Response) => Promise<any>  // AuthRequest use karo
) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    requestCounter.inc({ endpoint, status: 'attempt' });
    const latencyTimer = requestLatency.startTimer({ endpoint });

    try {
         await handler(req as AuthRequest, res);  
      requestCounter.inc({ endpoint, status: 'success' });
    } catch (err) {
      requestCounter.inc({ endpoint, status: 'error' });
      next(err);
    } finally {
      latencyTimer();
      const duration = Date.now() - startTime;
      if (duration > 1200) {
        logger.warn(`[${requestId}] Slow quality operation`, { duration, endpoint });
      }
    }
  };

// POST/GET - Verify Company
export const qualityTrustverifyCompanyqtController = withQualityContext('verify_company', async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'admin')
    throw new ForbiddenError('Only admins can verify companies');


  const { error, value } = validateCompanyVerification(req.params);
  if (error) throw new ValidationError('Invalid company verification params', error.details);

  const { companyId } = value;
  const sanitizedCompanyId = validId(sanitizeInput(companyId));
  const cacheKey = `company_verification:${sanitizedCompanyId}`;
  const rateLimitKey = `rate:verify_company:${req.user?.userId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    return ResponseUtil.success(res, {
      ...JSON.parse(cached),
      cached: true,
    }, SUCCESS_MESSAGES.DATA_RETRIEVED);
  }

  await withLock(`verify_company:${sanitizedCompanyId}`, 5000, async () => {
    const count = await CacheUtil.incr(rateLimitKey);
    if (count > RATE_LIMITS.COMPANY_VERIFICATION.max) {
      throw new TooManyRequestsError('Company verification limit exceeded');
    }
    await CacheUtil.expire(rateLimitKey, RATE_LIMITS.COMPANY_VERIFICATION.windowMs / 1000);

    const result = await qualityTrustService.verifyCompany({
      companyId: sanitizedCompanyId.toString(), // har jagah ObjectId use ho rahi hai waha .toString() lagao
      verifiedBy: req.user!.userId || '',
      requestId: generateSecureId(),
    });

    await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.COMPANY_VERIFICATION), );

    ResponseUtil.success(res, result, SUCCESS_MESSAGES.OPERATION_SUCCESSFUL);
  });
});

// POST - Check Job Spam
export const checkJobSpamController = withQualityContext('check_job_spam', async (req: AuthRequest, res: Response) => {
  const { error, value } = validateJobSpamCheck(req.params);
  if (error) throw new ValidationError('Invalid job spam check params', error.details);

  const { jobId } = value;
  const sanitizedJobId = validId(sanitizeInput(jobId));
  const cacheKey = `job_spam:${sanitizedJobId}`;
  const rateLimitKey = `rate:spam_check:${req.user?.userId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    return ResponseUtil.success(res, {
      ...JSON.parse(cached),
      cached: true,
    }, SUCCESS_MESSAGES.DATA_RETRIEVED);
  }

  await withLock(`spam_check:${sanitizedJobId}`, 5000, async () => {
    const count = await CacheUtil.incr(rateLimitKey);
    if (count > RATE_LIMITS.JOB_SPAM.max) {
      throw new TooManyRequestsError('Job spam check limit exceeded');
    }
    await CacheUtil.expire(rateLimitKey, RATE_LIMITS.JOB_SPAM.windowMs / 1000);

    const spamCheck = await qualityTrustService.checkJobSpam({
      jobId: sanitizedJobId.toString(),
      requestId: generateSecureId(),
    });

    await CacheUtil.set(cacheKey, JSON.stringify(spamCheck), Number(constants.CACHE_TTLS.JOB_SPAM),);

    ResponseUtil.success(res, spamCheck, SUCCESS_MESSAGES.DATA_RETRIEVED);
  });
});

// POST - Verify Salary
export const verifySalaryqtController = withQualityContext('verify_salary', async (req: AuthRequest, res: Response) => {
  const { error, value } = validateSalaryVerification(req.body);
  if (error) throw new ValidationError('Invalid salary verification input', error.details);

  const { jobId, salaryData } = value;
  const sanitizedData = {
    jobId: validId(sanitizeInput(jobId)),
    salaryData: {
      amount: Number(sanitizeInput(salaryData.amount)),
      currency: sanitizeInput(salaryData.currency),
      period: sanitizeInput(salaryData.period),
    },
  };

  const cacheKey = `salary_verification:${sanitizedData.jobId}`;
  const rateLimitKey = `rate:verify_salary:${req.user?.userId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    ResponseUtil.success(res, {
      ...JSON.parse(cached),
      cached: true,
    }, SUCCESS_MESSAGES.DATA_RETRIEVED);
  }

  await withLock(`verify_salary:${sanitizedData.jobId}`, 5000, async () => {
    const count = await CacheUtil.incr(rateLimitKey);
    if (count > RATE_LIMITS.SALARY_VERIFICATION.max) {
      throw new TooManyRequestsError('Salary verification limit exceeded');
    }
    await CacheUtil.expire(rateLimitKey, RATE_LIMITS.SALARY_VERIFICATION.windowMs / 1000);

    const verification = await qualityTrustService.verifySalary({
      jobId: sanitizedData.jobId.toString(),
      salaryData: sanitizedData.salaryData,
      requestId: generateSecureId(),
    });

    await CacheUtil.set(cacheKey, JSON.stringify(verification), Number(constants.CACHE_TTLS.SALARY_VERIFICATION),);

    ResponseUtil.success(res, verification, SUCCESS_MESSAGES.OPERATION_SUCCESSFUL);
  });
});

// POST - Check Duplicate Application
export const checkDuplicateApplicationController = withQualityContext('duplicate_application', async (req: AuthRequest, res: Response) => {
  const { error, value } = validateDuplicateApplication(req.body);
  if (error) throw new ValidationError('Invalid duplicate application input', error.details);

  const { jobId } = value;
  const userId = req.user!.userId;
  const sanitizedJobId = validId(sanitizeInput(jobId));

  const cacheKey = `duplicate_application:${userId}:${sanitizedJobId}`;
  const rateLimitKey = `rate:duplicate_check:${userId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    return ResponseUtil.success(res, {
      ...JSON.parse(cached),
      cached: true,
    }, SUCCESS_MESSAGES.DATA_RETRIEVED);
  }

  await withLock(`duplicate_check:${userId}:${sanitizedJobId}`, 5000, async () => {
    const count = await CacheUtil.incr(rateLimitKey);
    if (count > RATE_LIMITS.DUPLICATE_APPLICATION.max) {
      throw new TooManyRequestsError('Duplicate application check limit exceeded');
    }
    await CacheUtil.expire(rateLimitKey, RATE_LIMITS.DUPLICATE_APPLICATION.windowMs / 1000);

    const duplicateCheck = await qualityTrustService.checkDuplicateApplication({
      userId: userId || req.user!.userId,
      jobId: sanitizedJobId.toString(),
      requestId: generateSecureId(),
    });

    await CacheUtil.set(cacheKey, JSON.stringify(duplicateCheck), Number(constants.CACHE_TTLS.DUPLICATE_APPLICATION));

    ResponseUtil.success(res, duplicateCheck, SUCCESS_MESSAGES.DATA_RETRIEVED);
  });
});

// POST - Calculate Job Quality
export const calculateJobQualityController = withQualityContext('job_quality', async (req: AuthRequest, res: Response) => {
  const { error, value } = validateJobQuality(req.params);
  if (error) throw new ValidationError('Invalid job quality params', error.details);

  const { jobId } = value;
  const sanitizedJobId = validId(sanitizeInput(jobId));
  const cacheKey = `job_quality:${sanitizedJobId}`;
  const rateLimitKey = `rate:job_quality:${req.user?.userId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    return ResponseUtil.success(res, {
      ...JSON.parse(cached),
      cached: true,
    }, SUCCESS_MESSAGES.DATA_RETRIEVED);
  }

  await withLock(`job_quality:${sanitizedJobId}`, 5000, async () => {
    const count = await CacheUtil.incr(rateLimitKey);
    if (count > RATE_LIMITS.JOB_QUALITY.max) {
      throw new TooManyRequestsError('Job quality calculation limit exceeded');
    }
    await CacheUtil.expire(rateLimitKey, RATE_LIMITS.JOB_QUALITY.windowMs / 1000);

    const qualityScore = await qualityTrustService.calculateJobQuality({
      jobId: sanitizedJobId.toString(),
      requestId: generateSecureId(),
    });

    await CacheUtil.set(cacheKey, JSON.stringify(qualityScore), Number(constants.CACHE_TTLS.JOB_QUALITY));

    ResponseUtil.success(res, qualityScore, SUCCESS_MESSAGES.OPERATION_SUCCESSFUL);
  });
});

// GET - Company Verification Status
export const getCompanyVerificationController = withQualityContext('get_company_verification', async (req: AuthRequest, res: Response) => {
  const { error, value } = validateCompanyVerification(req.params);
  if (error) throw new ValidationError('Invalid company verification params', error.details);

  const { companyId } = value;
  const sanitizedCompanyId = validId(sanitizeInput(companyId));
  const cacheKey = `company_verification_status:${sanitizedCompanyId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    return ResponseUtil.success(res, {
      ...JSON.parse(cached),
      cached: true,
    }, SUCCESS_MESSAGES.DATA_RETRIEVED);
  }

  const verification = await qualityTrustService.getCompanyVerification({
    companyId: sanitizedCompanyId.toString(),
    requestId: generateSecureId(),
  });

  await CacheUtil.set(cacheKey, JSON.stringify(verification), Number(constants.CACHE_TTLS.COMPANY_VERIFICATION));

  ResponseUtil.success(res, verification, SUCCESS_MESSAGES.DATA_RETRIEVED);
});