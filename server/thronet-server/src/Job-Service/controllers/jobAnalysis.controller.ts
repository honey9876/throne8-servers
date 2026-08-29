// controller/jobanalysis.ts
import { Request, Response, NextFunction } from 'express';

import { Insights } from '../models';
// import { JobEventHandler } from '@/Job-Service/models/Job.model';
import { generateSecureId, sanitizeInput } from '@/shared/security.js';
import logger from '@/shared/logger.util.js';
import ResponseUtil from '@/shared/response.util.js';

import {
  ValidationError,
  AuthorizationError,
  NotFoundError,
} from '@/shared/errors/app.error.js';
import CacheUtil from '@/shared/cache.util';
import { JobEventHandler } from '../models/Job.model';

// Request context helper (requestId + timing logging)
const withRequestContext = (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 300) {
        logger.warn(`[${requestId}] Slow analytics operation`, { duration, path: req.path });
      }
    }
  };

// POST /jobs/:jobId/view - Record job view (idempotent)
export const incrementViewController = withRequestContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const userId = req.user?.userId;

  if (!jobId) {
    throw new ValidationError('Job ID is required');
  }

  // Idempotency key: unique per job + user/ip + request context
  const idempotencyKey = `idempotency:job:view:${jobId}:${userId || req.ip}:${generateSecureId()}`;
  const cached = await CacheUtil.get(idempotencyKey);

  if (cached) {
    ResponseUtil.success(res, JSON.parse(cached));
  }

  // Async analytics event
  JobEventHandler.handleJobView({
    jobId,
    userId,
    metadata: {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    },
  }).catch(err => logger.error('Job view event failed', { err }));

  const responseData = { jobId };

  // Cache response for 5 minutes
  await CacheUtil.set(idempotencyKey, JSON.stringify(responseData), 300);

  ResponseUtil.success(res, responseData, 'JOB_VIEW_INCREMENTED');
});

// POST /jobs/:jobId/save - Record job save (idempotent)
export const incrementSaveController = withRequestContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const userId = req.user?.userId;

  if (!jobId || !userId) {
    throw new ValidationError('Job ID and user authentication are required');
  }

  const idempotencyKey = `idempotency:job:save:${jobId}:${userId}:${generateSecureId()}`;
  const cached = await CacheUtil.get(idempotencyKey);

  if (cached) {
    ResponseUtil.success(res, JSON.parse(cached))
  }

  // Async event
  JobEventHandler.handleJobSave({
    jobId,
    userId,
    // metadata: {
    //   ip: req.ip,
    //   userAgent: req.headers['user-agent'],
    // },
  }).catch(err => logger.error('Job save event failed', { err }));

  const responseData = { jobId };

  // Cache for 24 hours
  await CacheUtil.set(idempotencyKey, JSON.stringify(responseData), 86400);

  ResponseUtil.success(res, responseData, 'JOB_SAVE_INCREMENTED');
});

// GET /jobs/:jobId/analytics - Get job analytics (paginated)
export const getInsightsController = withRequestContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const userId = req.user?.userId;
  const { startDate, endDate, page = '1', limit = '30' } = req.query;

  if (!jobId || !userId) {
    throw new ValidationError('Job ID and user authentication are required');
  }

  if (req.user?.role !=='admin') {
    throw new AuthorizationError('FORBIDDEN_ANALYTICS');
  }

  const query: any = { jobId };

  if (startDate && endDate) {
    query.date = {
      $gte: sanitizeInput(startDate as string),
      $lte: sanitizeInput(endDate as string),
    };
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  const analytics = await Insights.find(query)
    .sort({ date: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  const total = await Insights.countDocuments(query);

  if (analytics.length === 0 && total === 0) {
    // Optional: you can throw NotFoundError if you want strict behavior
    // throw new NotFoundError('Analytics data for this job');
    // Or just return empty paginated response (common practice)
  }

  ResponseUtil.paginated(
    res,
    analytics,
    {
      page: pageNum,
      limit: limitNum,
      total,
    },
    'ANALYTICS_RETRIEVED'
  );
});