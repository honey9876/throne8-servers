import { Router } from 'express';
import validationMiddleware from '@/shared/middlewares/validation.middleware';
import { createJobController, deleteJobController, getClosedJobsController, getJobApplicationsController, getJobByIdController, getJobsByCompanyController, getOpenJobsController, getUserApplicationsController, listJobsController, searchJobsController, updateJobController, updateJobStatusController } from '@/Job-Service/controllers/jobs.controller';
import { jobValidators } from '../validations/company.validation';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { applyToJobController, updateApplicationStatusController } from '@/Job-Service/controllers';

const router = Router();

// =====================================================
// PUBLIC ROUTES (No authentication required)
// =====================================================

/**
 * @route   GET /api/jobs
 * @desc    Get all jobs with filters and pagination
 * @access  Public
 * @query   page, pageSize, company, type, experienceLevel, location, search, status, sort
 */
router.get(
    '/',
    validationMiddleware.validateQueryJoi(jobValidators.query),
    listJobsController
);

/**
 * @route   GET /api/jobs/search
 * @desc    Search jobs with advanced filters
 * @access  Public
 * @query   search, page, pageSize, type, location, skills
 */
router.get(
    '/search',
    validationMiddleware.validateQueryJoi(jobValidators.search),
    searchJobsController
);

/**
 * @route   GET /api/jobs/open
 * @desc    Get all open/active jobs
 * @access  Public
 * @query   page, pageSize, type, location, company
 */
router.get(
    '/open',
    validationMiddleware.validateQueryJoi(jobValidators.query),
    getOpenJobsController
);

/**
 * @route   GET /api/jobs/closed
 * @desc    Get all closed jobs
 * @access  Public
 * @query   page, pageSize, company
 */
router.get(
    '/closed',
    validationMiddleware.validateQueryJoi(jobValidators.query),
    getClosedJobsController
);

/**
 * @route   GET /api/jobs/company/:companyId
 * @desc    Get all jobs by company
 * @access  Public
 * @params  companyId - Company ID
 * @query   page, pageSize, status, type, location
 */
router.get(
    '/company/:companyId',
    validationMiddleware.validateParamsJoi(jobValidators.companyId),
    validationMiddleware.validateQueryJoi(jobValidators.query),
    getJobsByCompanyController
);

/**
 * @route   GET /api/jobs/:id
 * @desc    Get job by ID
 * @access  Public
 * @params  id - Job ID
 */
router.get(
    '/:id',
    validationMiddleware.validateParamsJoi(jobValidators.id),
    getJobByIdController
);

// =====================================================
// PROTECTED ROUTES (Authentication required)
// =====================================================

/**
 * @route   POST /api/jobs
 * @desc    Create new job posting
 * @access  Private (Company Admin)
 * @body    title, description, company, type, experienceLevel, location, etc.
 */
router.post(
    '/',
    AuthMiddleware.authenticate as any,
    validationMiddleware.validateJoi(jobValidators.create),
    createJobController
);

/**
 * @route   PUT /api/jobs/:id
 * @desc    Update job posting
 * @access  Private (Company Admin)
 * @params  id - Job ID
 * @body    title, description, type, experienceLevel, location, etc.
 */
router.put(
    '/:id',
    AuthMiddleware.authenticate as any,
    validationMiddleware.validateParamsJoi(jobValidators.id),
    validationMiddleware.validateJoi(jobValidators.update),
    updateJobController
);

/**
 * @route   DELETE /api/jobs/:id
 * @desc    Delete job posting (soft delete)
 * @access  Private (Company Admin)
 * @params  id - Job ID
 */
router.delete(
    '/:id',
    AuthMiddleware.authenticate as any,
    validationMiddleware.validateParamsJoi(jobValidators.id),
    deleteJobController
);

/**
 * @route   POST /api/jobs/:id/apply
 * @desc    Apply to a job
 * @access  Private (Employee)
 * @params  id - Job ID
 * @body    employeeId, resume, coverLetter
 */
router.post(
    '/:id/apply',
    AuthMiddleware.authenticate as any,
    validationMiddleware.validateParamsJoi(jobValidators.id),
    validationMiddleware.validateJoi(jobValidators.apply),
    applyToJobController
);

/**
 * @route   GET /api/jobs/:id/applications
 * @desc    Get all applications for a job
 * @access  Private (Company Admin)
 * @params  id - Job ID
 */
router.get(
    '/:id/applications',
    AuthMiddleware.authenticate as any,
    validationMiddleware.validateParamsJoi(jobValidators.id),
    getJobApplicationsController
);

/**
 * @route   PATCH /api/jobs/:id/application/:applicationId/status
 * @desc    Update application status
 * @access  Private (Company Admin)
 * @params  id - Job ID, applicationId - Application ID
 * @body    status - Application status (Applied, Shortlisted, Rejected, Accepted)
 */
router.patch(
    '/:id/application/:applicationId/status',
    AuthMiddleware.authenticate as any,
    validationMiddleware.validateParamsJoi(jobValidators.id),
    validationMiddleware.validateJoi(jobValidators.updateApplicationStatus),
    updateApplicationStatusController
);

/**
 * @route   GET /api/jobs/applications/user/:userId
 * @desc    Get all applications by user
 * @access  Private (Employee)
 * @params  userId - User/Employee ID
 */
router.get(
    '/applications/user/:userId',
    AuthMiddleware.authenticate as any,
    validationMiddleware.validateParamsJoi(jobValidators.userId),
    getUserApplicationsController
);

/**
 * @route   PATCH /api/jobs/:id/status
 * @desc    Update job status (Open/Closed)
 * @access  Private (Company Admin)
 * @params  id - Job ID
 * @body    status - Job status (Open, Closed, On Hold)
 */
router.patch(
    '/:id/status',
    AuthMiddleware.authenticate as any,
    validationMiddleware.validateParamsJoi(jobValidators.id),
    validationMiddleware.validateJoi(jobValidators.updateStatus),
    updateJobStatusController
);

export default router;