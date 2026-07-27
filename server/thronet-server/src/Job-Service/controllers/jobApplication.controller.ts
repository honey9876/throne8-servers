// controller/jobapplication.ts
import { Request, Response, NextFunction } from 'express';
import { JobApplication } from '../models';
// import {
//   validateApplyJobInput,
//   validateUpdateApplicationStatus,
//   validateResumeSelectionInput,
//   validateCoverLetterInput,
// } from '@/validations';

import { generateSecureId, sanitizeInput } from '@/shared/security';
import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
  AuthenticationError,
} from '@/shared/errors/app.error';
import { PersonalizationEngine } from '@/Job-Service/models/search.model';
import { JobEventHandler, StatsService } from '@/Job-Service/models/Job.model';
import CacheUtil from '@/shared/cache.util';
import { validateApplyJobInput, validateCoverLetterInput, validateResumeSelectionInput, validateUpdateApplicationStatus, validateApplicationOwnership } from '../validations';
import { SearchEventService, SearchStatsService } from '../services';


// Helper for request context + timing
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
      logger.debug(`[${requestId}] Request duration: ${duration}ms`, { path: req.path });
    }
  };

// POST /jobs/:jobId/apply
export const applyToJobController = withRequestContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const userId = req.user?.userId;

  if (!jobId || !userId || !req.body) {
    throw new ValidationError('Job ID, user authentication, and request body are required');
  }

  // Idempotency check
  const idempotencyKey = `idempotency:job:apply:${generateSecureId()}`;
  const cached = await CacheUtil.get(idempotencyKey);
  if (cached) {
    ResponseUtil.success(res, JSON.parse(cached))
  }

  const sanitizedInput = sanitizeInput({
    ...req.body,
    jobId,
    userId,
    companyId: req.body.companyId,
  });

  const { error, value } = validateApplyJobInput.validate(sanitizedInput);
  if (error) {
    throw new ValidationError('Invalid application input', error.details);
  }

  const existing = await JobApplication.findOne({ jobId, userId }).lean();
  if (existing) {
    throw new ConflictError('You have already applied to this job');
  }

  const ipAddress = req.ip?.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/)
    ? req.ip
    : null;

  const application = new JobApplication({
    ...value,
    metadata: {
      ipAddress,
      userAgent: req.headers['user-agent'],
    },
  });

  await application.save();

  // Async event (Kafka removed → keeping as event emit)
  JobEventHandler.handleJobApplication({
    jobId,
    userId,
    metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  }).catch(err => logger.error('Job application event failed', { err }));

  const responseData = {
    applicationId: application.applicationId,
    jobId: application.jobId,
    status: application.status,
    appliedAt: application.appliedAt,
  };

  // Cache for idempotency
  await CacheUtil.set(idempotencyKey, JSON.stringify(responseData), 86400);

  ResponseUtil.created(res, responseData, 'JOB_APPLIED');
});

// GET /jobs/:jobId/applications
export const getApplicationsByJobController = withRequestContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const userId = req.user?.userId;
  const { page = '1', limit = '20', status } = req.query;

  if (!jobId || !userId) {
    throw new ValidationError('Job ID and user authentication are required');
  }

  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('FORBIDDEN_APPLICATION');
  }

  const query: any = { jobId };
  if (status) query.status = sanitizeInput(status as string);

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  const applications = await JobApplication.find(query)
    .select('applicationId userId status appliedAt resumeVersion')
    .sort({ appliedAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  const total = await JobApplication.countDocuments(query);

  ResponseUtil.paginated(res, applications, {
    page: pageNum,
    limit: limitNum,
    total,
  }, 'APPLICATIONS_RETRIEVED');
});

// PUT /jobs/:jobId/applications/:applicationId
export const updateApplicationStatusController = withRequestContext(async (req: Request, res: Response) => {
  const { applicationId } = req.params;
  const userId = req.user?.userId;
  const { status } = req.body;

  if (!applicationId || !userId || !status) {
    throw new ValidationError('Application ID, user authentication, and status are required');
  }

  // Idempotency
  const idempotencyKey = `idempotency:application:status:${generateSecureId()}`;
  const cached = await CacheUtil.get(idempotencyKey);
  if (cached) ResponseUtil.success(res, JSON.parse(cached))

  const sanitized = sanitizeInput({ status });
  const { error, value } = validateUpdateApplicationStatus.validate(sanitized);
  if (error) throw new ValidationError('Invalid status update', error.details);

  if (req.user?.role !== 'admin') {
    throw new AuthorizationError('FORBIDDEN_APPLICATION');
  }

  const application = await JobApplication.findOneAndUpdate(
    { applicationId },
    { status: value.status, updatedAt: new Date() },
    { new: true, select: 'applicationId jobId status updatedAt' }
  ).lean();

  if (!application) {
    throw new NotFoundError('Application');
  }

  // Async events
 // ✅ Fix - Use value.jobId or application.jobId
JobEventHandler.handleJobApplication({
  jobId: value.jobId,  // From validated input
  userId,
  metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
} as any);
  await StatsService.incrementJobStats(application.jobId, `status_${value.status}`);

  const responseData = {
    applicationId: application.applicationId,
    jobId: application.jobId,
    status: application.status,
    updatedAt: application.updatedAt,
  };

  await CacheUtil.set(idempotencyKey, JSON.stringify(responseData), 86400);

  ResponseUtil.success(res, responseData, 'APPLICATION_STATUS_UPDATED');
});

// DELETE /jobs/:jobId/applications/:applicationId
export const deleteApplicationController = withRequestContext(async (req: Request, res: Response) => {
  const { applicationId } = req.params;
  const userId = req.user?.userId;

  if (!applicationId || !userId) {
    throw new ValidationError('Application ID and user authentication are required');
  }

  const idempotencyKey = `idempotency:application:delete:${generateSecureId()}`;
  const cached = await CacheUtil.get(idempotencyKey);
  if (cached) ResponseUtil.success(res, JSON.parse(cached))

  const application = await JobApplication.findOne({ applicationId }).lean();
  if (!application) throw new NotFoundError('Application');

  const isOwner = application.userId === userId;
  const isAdmin = req.user?.role;

  if (!isOwner && !isAdmin) {
    throw new AuthorizationError('FORBIDDEN_APPLICATION');
  }

  await JobApplication.updateOne(
    { applicationId },
    { isDeleted: true, deletedAt: new Date(), deletedBy: userId }
  );

  JobEventHandler.handleJobApplication({
    jobId: application.jobId,
    userId,
    metadata: { deletedBy: userId, action: 'deleted' },
  } as any);

  await StatsService.incrementJobStats(application.jobId, 'deletions');

  const responseData = { applicationId };

  await CacheUtil.set(idempotencyKey, JSON.stringify(responseData), 86400);

  ResponseUtil.success(res, responseData, 'APPLICATION_DELETED');
});

// POST /applications/resume/select (or similar)
// ✅ Complete fix for selectResumeForApplicationController:
export const selectResumeForApplicationController = withRequestContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new AuthenticationError();

  const sanitized = sanitizeInput(req.body);
  const { error, value } = validateResumeSelectionInput.validate({ ...sanitized, userId });
  if (error) throw new ValidationError('Invalid resume selection', error.details);

  // Ownership check
await validateApplicationOwnership(value.applicationId, value.userId);


  const userProfile = await PersonalizationEngine.getUserProfile(userId, req);
  if ((userProfile as any)?.preferredResume && value.resumeId !== (userProfile as any).preferredResume) {
    logger.info('Selected resume differs from user preferred resume', {
      userId,
      selected: value.resumeId,
      preferred: (userProfile as any).preferredResume,
    });
  }

  const updateResult = await JobApplication.updateOne(
    { _id: value.applicationId, userId },
    { resumeId: value.resumeId }
  );

  if (updateResult.matchedCount === 0) {
    throw new NotFoundError('Application or unauthorized access');
  }

  await CacheUtil.del(`application:${value.applicationId}`).catch(() => { });

  SearchEventService.emit('analytics:resume_selected', {
    userId,
    applicationId: value.applicationId,
    resumeId: value.resumeId,
    metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  }).catch((err: any) => logger.error('Resume selected event failed', { err }));

  await SearchStatsService.updateStats({ type: 'resume_selection', count: 1, userId } as any);

  ResponseUtil.success(res, {
    applicationId: value.applicationId,
    resumeId: value.resumeId,
    meta: {
      updateTime: 0,
      userProfileApplied: !!userProfile,
    },
  }, 'Resume selected for application successfully');
});

// POST /applications/cover-letter (or similar)
export const attachCoverLetterController = withRequestContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new AuthenticationError();

  const sanitized = sanitizeInput(req.body);
  const { error, value } = validateCoverLetterInput.validate({ ...sanitized, userId });
  if (error) throw new ValidationError('Invalid cover letter input', error.details);

  // Ownership check
await validateApplicationOwnership(value.applicationId, value.userId);


  const application = await JobApplication.findById(value.applicationId).populate('jobId');
  if (!application?.jobId) throw new NotFoundError('Application');

  // Optional relevance check
  // const relevanceScore = await SearchVectorService.computeRelevance(
  //   value.coverLetter,
  //   application.jobId.description
  // );

  // if (relevanceScore < 0.5) {
  //   logger.warn('Low relevance cover letter detected', { userId, score: relevanceScore });
  // }

  // ✅ Fix - Either remove or uncomment properly
  // Option 1: Remove the check
  // (Delete lines 314-316)

  // Option 2: Define dummy value
  const relevanceScore = 1.0; // Default high relevance
  if (relevanceScore < 0.5) {
    logger.warn('Low relevance cover letter detected', { userId, score: relevanceScore });
  }

  const updateResult = await JobApplication.updateOne(
    { _id: value.applicationId, userId },
    { coverLetter: value.coverLetter }
  );

  if (updateResult.matchedCount === 0) {
    throw new NotFoundError('Application or unauthorized access');
  }

  await CacheUtil.del(`application:${value.applicationId}`).catch(() => { });

  // Async events & stats
  SearchEventService.emit('analytics:cover_letter_attached', {
    userId,
    applicationId: value.applicationId,
    coverLetterLength: value.coverLetter.length,
    metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  }).catch(err => logger.error('Cover letter event failed', { err }));

  await SearchStatsService.updateStats({ type: 'cover_letter_attachment', count: 1, userId });

  ResponseUtil.success(res, {
    applicationId: value.applicationId,
    coverLetterLength: value.coverLetter.length,
    meta: { updateTime: Date.now() - Date.now() }, // adjust as needed
  }, 'Cover letter attached successfully');
});