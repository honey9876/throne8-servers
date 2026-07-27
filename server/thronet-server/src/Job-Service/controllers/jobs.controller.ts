// job-service/controller/job.controller.ts
import { Request, Response, NextFunction } from 'express';
import {
  normalizeArrayFields,
  validateSaveSearchInput,
  validateCreateJobInput,
  validateUpdateJobInput,
  validateListJobsFilters,
} from '../validations';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
} from '@/shared/errors/app.error.js';

import {
  generateSecureId,
  sanitizeInput,
  sanitizeUserId,
  validId,
} from '@/shared/security.js';
import ResponseUtil from '@/shared/response.util';
import logger from '@/shared/logger.util';
import { CreateJobDTO, UpdateJobDTO, JobFilterQuery, ApplyJobDTO, ApplicationStatus, JobStatus } from '@/company/interfaces';
import { Job } from '../models';
import { asyncHandler } from '@/shared/errors/app.error.js';
import {
  getClosedJobs, getOpenJobs, applyToJob, getJobApplications, updateApplicationStatus,
  updateJobStatus,
  getUserApplications,
  createJobService
} from '@/Job-Service/services/job.service';
import CacheUtil from '@/shared/cache.util';


// Helper to get requestId & log timing
const withRequestContext = (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    try {
      await handler(req, res, next);
    } catch (err) {
      next(err);
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 500) {
        logger.warn(`[${requestId}] Slow request`, { duration, path: req.path });
      }
    }
  };

// POST /jobs - Create new job
export const createJobController = withRequestContext(async (req: Request, res: Response) => {
  if (!req.body) {
    throw new ValidationError('Request body is required');
  }

  const normalizedBody = normalizeArrayFields(req.body);
  const sanitizedInput = sanitizeInput(normalizedBody);

  const { error, value } = validateCreateJobInput(sanitizedInput);
  if (error) {
    throw new ValidationError('Invalid job creation input', error.details);
  }

  // Authorization check
  if (req.user?.role !== 'admin') {
    throw new AuthorizationError("FORBIDDEN_JOB");
  }

  const createdJob = await createJobService({
    userId: req.user?.userId,
    requestId: generateSecureId(), // or pass from context if needed
    input: value,
  });

  ResponseUtil.created(res, {
    jobId: createdJob.jobId,
    title: createdJob.title,
    companyId: createdJob.companyId,
    status: createdJob.status,
    createdAt: createdJob.createdAt,
  }, "JOB_CREATED");
});

// GET /jobs/:jobId
export const getJobByIdController = withRequestContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;

  if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new ValidationError('Invalid job ID format');
  }

  const job = await getJobById({
    userId: req.user?.userId,
    jobId,
    requestId: generateSecureId(),
  });

  if (!job) {
    throw new NotFoundError('Job');
  }

  ResponseUtil.success(res, job, "JOB_FOUND");
});

// PUT /jobs/:jobId
export const updateJobController = withRequestContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;

  if (!jobId || !validId(jobId)) {
    throw new ValidationError("INVALID_INPUT");
  }

  const sanitizedInput = sanitizeInput(req.body);
  const { error, value } = validateUpdateJobInput(sanitizedInput);

  if (error) {
    throw new ValidationError("INVALID_INPUT", error.details);
  }

  if (req.user?.role !== 'admin') {
    throw new AuthorizationError("FORBIDDEN_JOB");
  }

  const updatedJob = await updateJob({
    jobId,
    userId: req.user?.userId,
    requestId: generateSecureId(),
    updates: value,
  });

  if (!updatedJob) {
    throw new NotFoundError('Job');
  }

  ResponseUtil.success(res, {
    jobId: updatedJob.jobId,
    title: updatedJob.title,
    companyId: updatedJob.companyId,
    status: updatedJob.status,
    updatedAt: updatedJob.updatedAt,
  }, "JOB_UPDATED");
});

// DELETE /jobs/:jobId - Soft delete
export const deleteJobController = withRequestContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;

  if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new ValidationError("INVALID_INPUT");
  }

  if (req.user?.role !== 'admin') {
    throw new AuthorizationError("FORBIDDEN_JOB");
  }

  const updatedBy = sanitizeUserId(req.user?.userId);
  const job = await Job.findOneAndUpdate(
    { jobId, isDeleted: false },
    {
      $set: { isDeleted: true, updatedBy, 'dates.lastUpdated': new Date() },
      $inc: { version: 1 },
    },
    { new: true }
  ).lean();

  if (!job) {
    throw new NotFoundError('Job');
  }

  // Emit event (Kafka removed - you can replace with Redis pub/sub or another system)
  // await JobEventService.emit('job:deleted', {
  //   jobId,
  //   requestId: generateSecureId(),
  // }).catch(err => logger.error('Job deleted event emission failed', { err }));

  ResponseUtil.success(res, {}, "JOB_DELETED");
});

//   // =====================================================
//   // DELETE JOB (SOFT DELETE)
//   // =====================================================
//   async deleteJob(id: string): Promise<boolean> {
//     try {
//       logger.info('Deleting job:', { jobId: id });

//       const job = await Job.deleteJob(id);
//       if (!job) {
//         logger.warn('Job not found for deletion:', { jobId: id });
//         return false;
//       }

//       // Clear cache asynchronously
//       this.clearJobCaches(job.company.toString(), id).catch((err) =>
//         logger.error('Cache clear error:', err)
//       );

//       logger.info('Job deleted successfully:', { jobId: id });
//       return true;
//     } catch (error : any) {
//       logger.error('Error deleting job:', error);
//       throw error;
//     }
//   }

// GET /jobs - List & filter jobs


export const listJobsController = withRequestContext(async (req: Request, res: Response) => {
  const sanitizedFilters = sanitizeInput(req.query);
  const { error, value } = validateListJobsFilters(sanitizedFilters);

  if (error) {
    throw new ValidationError("INVALID_INPUT");
  }

  const jobList = await listJobs({
    filters: value,
    requestId: generateSecureId(),
  });

  ResponseUtil.success(res,
    //    {
    //   count: jobList.length,
    // },
    jobList,
    "JOBS_LISTED"
  );
});

// GET /jobs/featured
export const featuredJobsController = withRequestContext(async (req: Request, res: Response) => {
  const jobs = await getFeaturedJobs({ requestId: generateSecureId() });

  if (!jobs || jobs.length === 0) {
    throw new NotFoundError('Featured jobs');
  }

  ResponseUtil.success(res,
    // {
    //   count: jobs.length,
    // }, 
    jobs, "FEATURED_JOBS",);
});

// =====================================================
// GET JOBS BY COMPANY
// =====================================================
export const getJobsByCompanyController = asyncHandler(async (req: Request, res: Response) => {
  const { companyId } = req.params;
  const filters: JobFilterQuery = {
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
    status: req.query.status as JobStatus,
    type: req.query.type as unknown,
    location: req.query.location as string,
  } as JobFilterQuery;

  logger.info(`[${req.user?.userId}] Fetching company jobs:`, { companyId });

  const result = await getJobsByCompany(companyId, filters);

  return ResponseUtil.success(res, {
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
    hasMore: result.hasMore,
    result: result.jobs
  }, 'Company jobs fetched successfully',);
});


// =====================================================
// SEARCH JOBS
// =====================================================
export const searchJobsController = withRequestContext(async (req: Request, res: Response): Promise<any> => {
  const filters: JobFilterQuery = {
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
    search: req.query.search as string,
    type: req.query.type as unknown,
    experienceLevel: req.query.experienceLevel as unknown,
    location: req.query.location as string,
    skills: req.query.skills ? (req.query.skills as string).split(',') : undefined,
    sort: req.query.sort as unknown,
  } as JobFilterQuery;

  logger.info(`[${req.user?.userId}] Searching jobs:`, filters);

  const result = await searchJobs(filters);

  return ResponseUtil.success(res, {
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
    hasMore: result.hasMore,
    result: result.jobs
  }, 'Jobs search completed'
  );
});

// =====================================================
// GET OPEN JOBS
// =====================================================
export const getOpenJobsController = withRequestContext(async (req: Request, res: Response): Promise<any> => {
  const filters: JobFilterQuery = {
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
    type: req.query.type as unknown,
    location: req.query.location as string,
    company: req.query.company as string,
  } as JobFilterQuery;

  logger.info(`[${req.user?.userId}] Fetching open jobs`);

  const result = await getOpenJobs(filters);

  return ResponseUtil.success(res, {
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
    hasMore: result.hasMore,
    result: result.jobs
  }, 'Open jobs fetched successfully'
  );
});

// =====================================================
// GET CLOSED JOBS
// =====================================================
export const getClosedJobsController = withRequestContext(async (req: Request, res: Response): Promise<any> => {
  const filters: JobFilterQuery = {
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
    company: req.query.company as string,
  } as JobFilterQuery;

  logger.info(`[${req.user?.userId}] Fetching closed jobs`);

  const result = await getClosedJobs(filters);

  return ResponseUtil.success(res, {
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
    hasMore: result.hasMore,
    result: result.jobs
  }
    , 'Closed jobs fetched successfully');
});

// =====================================================
// APPLY TO JOB
// =====================================================
export const applyToJobController = withRequestContext(async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { employeeId, resume, coverLetter } = req.body;

  const data: ApplyJobDTO = {
    jobId: id,
    employeeId,
    resume,
    coverLetter,
  };

  logger.info(`[${req.user?.userId}] Applying to job:`, { jobId: id, employeeId });

  const success = await applyToJob(data);

  if (!success) {
    return ResponseUtil.badRequest(res, 'Failed to apply to job');
  }

  return ResponseUtil.success(res, null, 'Application submitted successfully');
});

// =====================================================
// GET JOB APPLICATIONS
// =====================================================
export const getJobApplicationsController = withRequestContext(async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;

  logger.info(`[${req.user?.userId}] Fetching job applications:`, { jobId: id });

  const applications = await getJobApplications(id);

  if (!applications) {
    return ResponseUtil.notFound(res, 'Job not found');
  }

  return ResponseUtil.success(res, applications, 'Job applications fetched successfully');
});

// =====================================================
// UPDATE APPLICATION STATUS
// =====================================================
export const updateApplicationStatusController = withRequestContext(async (req: Request, res: Response): Promise<any> => {
  const { id, applicationId } = req.params;
  const { status } = req.body;

  logger.info(`[${req.user?.userId}] Updating application status:`, {
    jobId: id,
    applicationId,
    status,
  });

  const success = await updateApplicationStatus(
    id,
    applicationId,
    status as ApplicationStatus
  );

  if (!success) {
    return ResponseUtil.notFound(res, 'Job or application not found');
  }

  return ResponseUtil.success(res, null, 'Application status updated successfully');
});

// =====================================================
// GET USER APPLICATIONS
// =====================================================
export const getUserApplicationsController = withRequestContext(async (req: Request, res: Response): Promise<any> => {
  const { userId } = req.params;

  logger.info(`[${req.user?.userId}] Fetching user applications:`, { userId });

  const applications = await getUserApplications(userId);

  return ResponseUtil.success(res, applications, 'User applications fetched successfully');
});

// =====================================================
// UPDATE JOB STATUS (OPEN/CLOSE)
// =====================================================
export const updateJobStatusController = withRequestContext(async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { status } = req.body;

  logger.info(`[${req.user?.userId}] Updating job status:`, { jobId: id, status });

  const success = await updateJobStatus(id, status as JobStatus);

  if (!success) {
    return ResponseUtil.notFound(res, 'Job not found');
  }

  return ResponseUtil.success(res, null, `Job ${status === JobStatus.CLOSED ? 'closed' : 'reopened'} successfully`);
});

// POST /jobs/save-search
export const saveJobsController = withRequestContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AuthenticationError();
  }

  const { type, query } = req.body;
  const sanitizedInput = sanitizeInput({ type, query });
  const { error, value } = validateSaveSearchInput(sanitizedInput);

  if (error) {
    throw new ValidationError('Invalid save search input', error.details);
  }

  // // Redis operations
  // if (!redisClient.isOpen) {
  //   await redisClient.connect();
  // }

  await CacheUtil.lpush(
    `saved:searches:${userId}`,
    JSON.stringify({
      type: value.type,
      query: value.query,
      timestamp: new Date().toISOString(),
    })
  );

  await CacheUtil.ltrim(`saved:searches:${userId}`, 0, 9);
  await CacheUtil.incr('trending:searches', value.query);

  // Kafka removed - replaced with simple event emit (or remove completely if not needed)
  // Alternative: use Redis pub/sub, BullMQ, or just remove analytics event
  // JobEventService.emit('analytics:save_search', {
  //   userId,
  //   type: value.type,
  //   query: value.query,
  //   metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  // }).catch(err => logger.error('Save search event failed', { err }));

  ResponseUtil.success(res, {
    type: value.type,
    query: value.query,
  }, 'Search saved successfully');
});

