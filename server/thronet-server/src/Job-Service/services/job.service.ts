// services/job.service.ts
import { v4 as uuidv4 } from 'uuid';
import logger from '@/shared/logger.util';
import { generateSecureId, sanitizeInput, sanitizeUserId } from '@/shared/security';
import {
  validateCreateJobInput,
  validateUpdateJobInput,
  validateListJobsFilters,
} from '../validations';
import {Job} from '../models'
import { Company } from '@/company/models';
// import {
//   CreateJobDTO
//   UpdateJobDTO,
//   JobFilterQuery,
//   JobResponseDTO,
//   JobListResponse,
//   ApplyJobDTO,
//   ApplicationStatus, JobStatus
// } from '../interfaces';
// import { IJob, StatsService } from '@/Job-Service/models/Job.model';
import { PaginationMeta } from '@/Mentorship/utils/pagination';
import mongoose from 'mongoose';
import CacheUtil from '@/shared/cache.util';
import { NotFoundError, ValidationError } from '@/shared/errors/app.error';
import constants from '@/shared/constants.util';
import pagination from '@/shared/utils/company/pagination';
import { IJob, StatsService } from '../models/Job.model';
import { ApplicationStatus, JobFilterQuery, JobListResponse, JobResponseDTO, JobStatus } from '@/company/interfaces';


/**
 * Create a new job posting
 */
export const createJobService = async ({
  userId,
  requestId,
  input,
}: {
  userId: string;
  requestId: string;
  input: any;
}) => {
  const startTime = Date.now();

  try {
    // 1. Validate & sanitize input
    const sanitizedInput = sanitizeInput(input);
    const { error, value } = validateCreateJobInput(sanitizedInput);

    if (error) {
      throw new Error(`Invalid job input: ${error.message}`);
    }

    // 2. Prepare job data
    const jobId = generateSecureId();
    const createdBy = sanitizeUserId(userId);

    const jobData = {
      jobId,
      ...value,
      createdBy,
      updatedBy: createdBy,
      stats: {
        views: 0,
        applications: 0,
        saves: 0,
        shares: 0,
        clickThroughRate: 0,
        conversionRate: 0,
      },
      dates: {
        posted: new Date(),
        lastUpdated: new Date(),
      },
    };

    // 3. Create in MongoDB
    const job = await Job.create(jobData);

    // 4. Async side-effects
    Promise.allSettled([
      //   // Event emission
      //   JobEventService.emit('job:created', {
      //     jobId: job.jobId,
      //     companyId: job.companyId,
      //     title: job.title,
      //     skills: job.skills?.map((s: any) => s.name) || [],
      //     location: job.location,
      //     requestId,
      //   }),

      //   // Vector embedding
      //   JobVectorService.generateJobEmbedding(job),

      // Initialize stats in Redis
      StatsService.incrementJobStats(job.jobId, 'views', 0),
    ]).catch((err) => {
      logger.error(`Background tasks failed for job creation`, {
        jobId,
        requestId,
        error: err.message,
      });
    });

    logger.info(`Job created successfully`, {
      jobId,
      userId: createdBy,
      title: job.title,
      durationMs: Date.now() - startTime,
      requestId,
    });

    return job;
  } catch (error : any) {
    logger.error(`Failed to create job`, {
      userId,
      requestId,
      error: (error as Error).message,
      stack: (error as Error).stack,
      input: sanitizeInput(input),
      durationMs: Date.now() - startTime,
    });

    throw new Error("JOB_CREATION_FAILED");
  }
};

/**
 * Get single job by jobId
 */
export const getJobById = async ({
  userId,
  jobId,
  requestId,
}: {
  userId?: string;
  jobId: string;
  requestId: string;
}) => {
  const startTime = Date.now();

  try {
    const job = await Job.findOne({ jobId, isDeleted: false }).lean();

    if (!job) {
      logger.warn(`Job not found`, { jobId, requestId });
      throw new Error("JOB_NOT_FOUND");
    }

    // Async tracking (don't await - fire & forget)
    Promise.allSettled([
      StatsService.incrementJobStats(jobId, 'views'),
      //   JobEventService.emit('analytics:job_viewed', {
      //     jobId,
      //     userId: userId || 'anonymous',
      //     timestamp: new Date().toISOString(),
      //     requestId,
      //   }),
    ]).catch((err) => {
      logger.warn(`Analytics tracking failed`, { jobId, requestId, error: err.message });
    });

    logger.info(`Job fetched`, {
      jobId,
      durationMs: Date.now() - startTime,
      requestId,
    });

    return job;
  } catch (error : any) {
    logger.error(`Failed to fetch job`, {
      jobId,
      userId,
      requestId,
      error: (error as Error).message,
      durationMs: Date.now() - startTime,
    });

    throw error;
  }
};

/**
 * Update existing job
 */
export const updateJob = async ({
  jobId,
  userId,
  requestId,
  updates,
}: {
  jobId: string;
  userId: string;
  requestId: string;
  updates: any;
}) => {
  const startTime = Date.now();

  try {
    // Validate jobId format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
      throw new Error('Invalid job ID format');
    }

    // Validate & sanitize updates
    const sanitizedUpdates = sanitizeInput(updates);
    const { error, value } = validateUpdateJobInput(sanitizedUpdates);

    if (error) {
      throw new ValidationError(`Invalid update payload: ${error.message}`);
    }

    const updatedBy = sanitizeUserId(userId);

    const updatedJob = await Job.findOneAndUpdate(
      { jobId, isDeleted: false },
      {
        $set: {
          ...value,
          updatedBy,
          'dates.lastUpdated': new Date(),
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedJob) {
      throw new NotFoundError("JOB_NOT_FOUND");
    }

    // Async side-effects
    // Promise.allSettled([
    // Event
    //   JobEventService.emit('job:updated', {
    //     jobId,
    //     changes: Object.keys(value),
    //     requestId,
    //   }),

    // Re-generate embedding if critical fields changed
    //   (value.title ||
    //     value.description ||
    //     value.skills ||
    //     value.requirements) &&
    //     JobVectorService.generateJobEmbedding(updatedJob),
    // ]).catch((err) => {
    //   logger.warn(`Background update tasks failed`, { jobId, requestId, error: err.message });
    // });

    logger.info(`Job updated successfully`, {
      jobId,
      userId: updatedBy,
      changes: Object.keys(value),
      durationMs: Date.now() - startTime,
      requestId,
    });

    return updatedJob;
  } catch (error : any) {
    logger.error(`Failed to update job`, {
      jobId,
      userId,
      requestId,
      error: (error as Error).message,
      durationMs: Date.now() - startTime,
    });

    throw error;
  }
};

/**
 * List jobs with filters & pagination
 */
export const listJobs = async ({
  filters,
  requestId,
}: {
  filters: any;
  requestId: string;
}) => {
  const startTime = Date.now();

  try {
    const { page = 1, limit = 20, ...queryFilters } = filters;

    // Validate filters
    const validation = validateListJobsFilters(queryFilters);
    if (validation.error) {
      throw new Error(`Invalid filters: ${validation.error.message}`);
    }

    // Build MongoDB query
    const query: any = { isDeleted: false };

    if (queryFilters.title) query.title = new RegExp(queryFilters.title, 'i');
    if (queryFilters.companyId) query.companyId = queryFilters.companyId;
    if (queryFilters.jobType) query.jobType = queryFilters.jobType;

    if (queryFilters.location) {
      if (queryFilters.location.city)
        query['location.city'] = new RegExp(queryFilters.location.city, 'i');
      if (queryFilters.location.state)
        query['location.state'] = new RegExp(queryFilters.location.state, 'i');
      if (queryFilters.location.country)
        query['location.country'] = new RegExp(queryFilters.location.country, 'i');
      if (queryFilters.location.isRemote !== undefined)
        query['location.isRemote'] = queryFilters.location.isRemote;
    }

    if (queryFilters.experience?.level)
      query['experience.level'] = queryFilters.experience.level;

    if (queryFilters.skills?.length)
      query['skills.name'] = { $in: queryFilters.skills.map((s: string) => s.toLowerCase()) };

    if (queryFilters.industry) query.industry = queryFilters.industry;
    if (queryFilters.isFeatured) query.isFeatured = true;
    if (queryFilters.isUrgent) query.isUrgent = true;
    if (queryFilters.diversityTags?.length)
      query.diversityTags = { $in: queryFilters.diversityTags };

    // Execute query
    const [jobs, totalCount] = await Promise.all([
      Job.find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ 'dates.posted': -1 })
        .lean(),
      Job.countDocuments(query),
    ]);

    // Async analytics tracking (fire & forget)
    jobs.forEach((job) => {
      Promise.allSettled([
        StatsService.incrementJobStats(job.jobId, 'views'),
        // JobEventService.emit('analytics:job_viewed', {
        //   jobId: job.jobId,
        //   timestamp: new Date().toISOString(),
        //   requestId,
        // }),
      ]).catch((err) => {
        logger.warn(`Analytics tracking failed for job`, { jobId: job.jobId, error: err.message });
      });
    });

    const result = {
      jobs,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        hasNext: jobs.length === limit,
      },
    };

    logger.info(`Jobs listed successfully`, {
      resultCount: jobs.length,
      totalCount,
      durationMs: Date.now() - startTime,
      requestId,
    });

    return result;
  } catch (error : any) {
    logger.error(`Failed to list jobs`, {
      requestId,
      filters,
      error: (error as Error).message,
      durationMs: Date.now() - startTime,
    });

    throw error;
  }
};

/**
 * Get featured/active/promoted jobs (quick access)
 */
export const getFeaturedJobs = async ({ requestId }: { requestId: string }) => {
  const startTime = Date.now();

  try {
    const jobs = await Job.find({
      isFeatured: true,
      isDeleted: false,
      isActive: true,
    })
      .limit(10)
      .sort({ 'dates.posted': -1 })
      .lean();

    // Track views asynchronously
    jobs.forEach((job) => {
      Promise.allSettled([
        StatsService.incrementJobStats(job.jobId, 'views'),
        // JobEventService.emit('analytics:job_viewed', {
        //   jobId: job.jobId,
        //   userId: 'featured_fetch', // or pass real user if available
        //   timestamp: new Date().toISOString(),
        //   requestId,
        // }),
      ]).catch(() => { });
    });

    logger.info(`Featured jobs fetched`, {
      count: jobs.length,
      durationMs: Date.now() - startTime,
      requestId,
    });

    return jobs;
  } catch (error : any) {
    logger.error(`Failed to fetch featured jobs`, {
      requestId,
      error: (error as Error).message,
      durationMs: Date.now() - startTime,
    });

    throw error;
  }
};

// =====================================================
// GET JOBS BY COMPANY (Optimized)
// =====================================================
export const getJobsByCompany = async (companyId: string, filters?: JobFilterQuery): Promise<JobListResponse> => {
  try {
    const { page = 1, pageSize = 20 } = filters || {};
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));

    // Cache key
    const cacheKey = `company:${companyId}:jobs:${JSON.stringify({ ...filters, page: safePage, pageSize: safePageSize })}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch jobs with DB-level pagination
    const skip = (safePage - 1) * safePageSize;
    const [jobs, total] = await Promise.all([
      Job.findJobsByCompany(companyId, { ...filters, skip, limit: safePageSize }),
      Job.countDocuments({ company: companyId, isActive: true }),
    ]);

    const meta = pagination.getMeta(total, safePage, safePageSize);

    const response: JobListResponse = {
      jobs: jobs.map((job: any) => formatJobResponse(job)),
      total,
      page: meta.page,
      pageSize: meta.pageSize,
      totalPages: meta.totalPages,
      hasMore: meta.hasMore,
    };

    // Cache export consthronously = 
    CacheUtil.set(cacheKey, response, constants.CACHE_TTLS.JOB_LIST).catch((err) =>
      logger.error('Cache set error:', err)
    );

    return response;
  } catch (error : any) {
    logger.error('Error fetching company jobs:', error);
    throw error;
  }
}

// =====================================================
// SEARCH JOBS
// =====================================================
export const searchJobs = async (filters: JobFilterQuery ): Promise<JobListResponse> => {
  try {
    return listJobs(filters);
  } catch (error : any) {
    logger.error('Error searching jobs:', error);
    throw error;
  }
}

// =====================================================
// GET OPEN JOBS (High-traffic endpoint optimization)
// =====================================================
export const getOpenJobs = async (filters?: JobFilterQuery): Promise<JobListResponse> => {
  try {
    const { page = 1, pageSize = 20 } = filters || {};
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));

    const cacheKey = `jobs:open:${JSON.stringify({ ...filters, page: safePage, pageSize: safePageSize })}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return cached;

    // DB-level pagination
    const skip = (safePage - 1) * safePageSize;
    const [jobs, total] = await Promise.all([
      Job.getOpenJobs({ ...filters, skip, limit: safePageSize }),
      Job.countDocuments({ status: JobStatus.OPEN, isActive: true }),
    ]);

    const meta = pagination.getMeta(total, safePage, safePageSize);

    const response: JobListResponse = {
      jobs: jobs.map((job) => formatJobResponse(job)),
      total,
      page: meta.page,
      pageSize: meta.pageSize,
      totalPages: meta.totalPages,
      hasMore: meta.hasMore,
    };

    // Longer cache for open jobs (more stable data)
    CacheUtil.set(cacheKey, response, Number(constants.CACHE_TTLS.OPEN_JOBS)).catch((err) =>
      logger.error('Cache set error:', err)
    );

    return response;
  } catch (error : any) {
    logger.error('Error fetching open jobs:', error);
    throw error;
  }
}

// =====================================================
// GET CLOSED JOBS
// =====================================================
export const getClosedJobs = async (filters?: JobFilterQuery): Promise<JobListResponse> => {
  try {
    const { page = 1, pageSize = 20 } = filters || {};
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));

    const skip = (safePage - 1) * safePageSize;
    const [jobs, total] = await Promise.all([
      Job.getClosedJobs({ ...filters, skip, limit: safePageSize }),
      Job.countDocuments({ status: JobStatus.CLOSED, isActive: true }),
    ]);

    const meta = pagination.getMeta(total, safePage, safePageSize);

    return {
      jobs: jobs.map((job) => this.formatJobResponse(job)),
      total,
      page: meta.page,
      pageSize: meta.pageSize,
      totalPages: meta.totalPages,
      hasMore: meta.hasMore,
    };
  } catch (error : any) {
    logger.error('Error fetching closed jobs:', error);
    throw error;
  }
}

// =====================================================
// APPLY TO JOB (✅ FIXED WITH ATOMIC CHECK)
// =====================================================
export const applyToJob = async (data: ApplyJobDTO): Promise<boolean> => {
  try {
    logger.info('Applying to job:', { jobId: data.jobId, employeeId: data.employeeId });

    // ✅ ATOMIC OPERATION: Check and insert in one query
    const result = await Job.findOneAndUpdate(
      {
        _id: data.jobId,
        isActive: true,
        status: JobStatus.OPEN,
        // ✅ Ensure employee hasn't already applied
        'applications.employee': { $ne: new mongoose.Types.ObjectId(data.employeeId) },
      },
      {
        $push: {
          applications: {
            employee: new mongoose.Types.ObjectId(data.employeeId),
            resume: data.resume,
            coverLetter: data.coverLetter,
            status: ApplicationStatus.PENDING,
            appliedAt: new Date(),
          },
        },
        $inc: { applicationsCount: 1 },
      },
      { new: true }
    );

    if (!result) {
      // Check if job exists
      const job = await Job.findById(data.jobId);
      if (!job) {
        logger.warn('Job not found for application:', { jobId: data.jobId });
        throw new Error('Job not found');
      }

      if (!job.isActive) {
        throw new Error('Job is no longer active');
      }

      if (job.status !== 'open') {
        throw new Error('Job is not open for applications');
      }

      // Must be duplicate application
      logger.warn('Duplicate application detected:', { jobId: data.jobId, employeeId: data.employeeId });
      throw new Error('You have already applied to this job');
    }

    // Clear specific cache only
    CacheUtil.del(`job:${data.jobId}`).catch((err) =>
      logger.error('Cache del error:', err)
    );

    logger.info('✅ Application submitted successfully');
    return true;
  } catch (error : any) {
    logger.error('Error applying to job:', error);
    throw error;
  }
}

// =====================================================
// GET JOB APPLICATIONS
// =====================================================
export const getJobApplications = async (jobId: string) => {
  try {
    const job = await Job.getApplications(jobId);
    if (!job) {
      return null;
    }

    return {
      jobId: job._id,
      title: job.title,
      applications: job.applications,
      totalApplications: job.stats.applicationsCount,
    };
  } catch (error : any) {
    logger.error('Error fetching job applications:', error);
    throw error;
  }
}

// =====================================================
// UPDATE APPLICATION STATUS
// =====================================================
export const updateApplicationStatus = async (
  jobId: string,
  applicationId: string,
  status: ApplicationStatus
): Promise<boolean> => {
  try {
    logger.info('Updating application status:', { jobId, applicationId, status });

    const job = await Job.updateApplicationStatus(jobId, applicationId, status);
    if (!job) {
      logger.warn('Job or application not found');
      return false;
    }

    // Clear specific cache
    CacheUtil.del(`job:${jobId}`).catch((err) =>
      logger.error('Cache del error:', err)
    );

    logger.info('Application status updated successfully');
    return true;
  } catch (error : any) {
    logger.error('Error updating application status:', error);
    throw error;
  }
}

// =====================================================
// GET USER APPLICATIONS
// =====================================================
export const getUserApplications = async (employeeId: string) => {
  try {
    const jobs = await Job.getUserApplications(employeeId);

    return jobs.map((job) => ({
      job: formatJobResponse(job),
      application: job.applications.find(
        (app) => app.employee.toString() === employeeId
      ),
    }));
  } catch (error : any) {
    logger.error('Error fetching user applications:', error);
    throw error;
  }
}

// =====================================================
// UPDATE JOB STATUS (OPEN/CLOSE)
// =====================================================
export const updateJobStatus = async (id: string, status: JobStatus): Promise<boolean> => {
  try {
    logger.info('Updating job status:', { jobId: id, status });

    const job = await Job.findById(id);
    if (!job) {
      logger.warn('Job not found:', { jobId: id });
      return false;
    }

    if (status === JobStatus.CLOSED) {
      await job.close();
    } else if (status === JobStatus.OPEN) {
      await job.reopen();
    }

    // Clear cache
    clearJobCaches(job.companyId, id).catch((err) =>
      logger.error('Cache clear error:', err)
    );

    logger.info('Job status updated successfully');
    return true;
  } catch (error : any) {
    logger.error('Error updating job status:', error);
    throw error;
  }
}


  // =====================================================
  // HELPER: Clear job caches efficiently
  // =====================================================
  const clearJobCaches = async (companyId: string, jobId?: string): Promise<void> => {
    const patterns = [
      'jobs:*',
      `company:${companyId}:jobs:*`,
    ];

    if (jobId) {
      await CacheUtil.del(`job:${jobId}`);
    }

    await Promise.all(patterns.map((pattern) => CacheUtil.clearByPattern(pattern)));
  }

  // =====================================================
  // HELPER: Build filter object for queries
  // =====================================================
  const buildJobFilter = (filters: JobFilterQuery): Record<string, unknown> => {
    const filter: Record<string, unknown> = { isActive: true };

    if (filters.company) filter.company = filters.company;
    if (filters.type) filter.type = filters.type;
    if (filters.experienceLevel) filter.experienceLevel = filters.experienceLevel;
    if (filters.location) filter.location = { $regex: filters.location, $options: 'i' };
    if (filters.status) filter.status = filters.status;
    if (filters.search) {
      filter.$or = [
        { title: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ];
    }

    return filter;
  }

// =====================================================
// FORMAT JOB RESPONSE
// =====================================================
const formatJobResponse = (job: IJob): JobResponseDTO => {
  const companyData = job.company as unknown as {
    _id?: string;
    name?: string;
    logo?: string;
  };

  return {
    _id: job._id.toString(),
    title: job.title,
    slug: job.slug,
    description: job.description,
    company: {
      _id: companyData._id?.toString() || job.company.toString(),
      name: companyData.name || '',
      logo: companyData.logo,
    },
    department: job.department,
    type: job.type,
    experienceLevel: job.experience.level,
    salary: job.salary,
    location: job.location,
    skills: job.skills,
    benefits: job.benefits,
    applicationsCount: job.stats.applicationsCount,
    status: job.status,
    postedDate: job.postedDate,
    closingDate: job.closingDate,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}