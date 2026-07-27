// controller/professionalDevelopment.controller.ts
import { Request, Response, NextFunction } from 'express';

// import { professionalDevelopmentService } from '@/services/job-service/premium/professionalDevelopment.service.js';
import { sanitizeInput, generateSecureId, validId, validateUrl } from '@/shared/security.js';

import logger from '@/shared/logger.util.js';
import ResponseUtil from '@/shared/response.util.js';

import {
  ValidationError,
  NotFoundError,
  BadRequestError,
} from '@/shared/errors/app.error.js';
import { professionalDevelopmentService } from '@/Job-Service/services/premium/professionalDevelopment.service';

// Consistent request context helper (same pattern as other controllers)
const withDevelopmentContext = (handler: (req: Request, res: Response) => Promise<void>) =>
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
        logger.warn(`[${requestId}] Slow professional development operation`, { duration });
      }
    }
  };

// POST - Analyze Skills Gap
export const analyzeSkillsGapController = withDevelopmentContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await professionalDevelopmentService.analyzeSkillsGap({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) {
    throw new NotFoundError('Skills gap analysis');
  }

  ResponseUtil.success(res, result, 'Skills gap analysis completed successfully');
});

// GET - Get Existing Skills Gap Analysis
export const getSkillsGapAnalysisController = withDevelopmentContext(async (req: Request, res: Response) => {
  const result = await professionalDevelopmentService.getSkillsGapAnalysis(req.user?.userId!);

  if (!result) {
    throw new NotFoundError('NO_SKILLS_GAP_ANALYSIS_FOUND');
  }

  ResponseUtil.success(res, result, 'SKILLS_GAP_ANALYSIS_RETRIEVED');
});

// POST - Generate Career Path
export const generateCareerPathController = withDevelopmentContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await professionalDevelopmentService.generateCareerPath({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) {
    throw new NotFoundError('Career path suggestions');
  }

  ResponseUtil.success(res, result, 'Career path generated successfully');
});

// GET - Get Career Path Suggestions
export const getCareerPathSuggestionsController = withDevelopmentContext(async (req: Request, res: Response) => {
  const result = await professionalDevelopmentService.getCareerPathSuggestions(req.user?.userId!);

  if (!result) {
    throw new NotFoundError('Career path suggestions');
  }

  ResponseUtil.success(res, result, 'CAREER_PATH_SUGGESTIONS_RETRIEVED');
});

// POST - Create Skill Assessment
export const createSkillAssessmentController = withDevelopmentContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await professionalDevelopmentService.createSkillAssessment({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) {
    throw new BadRequestError('Failed to create skill assessment');
  }

  ResponseUtil.created(res, result, 'Skill assessment created successfully');
});

// POST - Submit Skill Assessment Answers
export const submitAssessmentController = withDevelopmentContext(async (req: Request, res: Response) => {
  const { id: assessmentId } = req.params;
  const { answers } = req.body;

  if (!assessmentId || !Array.isArray(answers) || answers.length === 0) {
    throw new ValidationError('assessmentId and answers array are required');
  }

  if (!validId(assessmentId)) {
    throw new ValidationError('Invalid assessment ID format');
  }

  const result = await professionalDevelopmentService.submitAssessment(
    assessmentId,
    req.user?.userId!,
    sanitizeInput(answers)
  );

  if (!result) {
    throw new NotFoundError('Assessment result');
  }

  ResponseUtil.success(res, result, 'Assessment submitted successfully');
});

// POST - Add Certification
export const addCertificationController = withDevelopmentContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await professionalDevelopmentService.addCertification({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) {
    throw new BadRequestError('INVALID_CERTIFICATION_DATA');
  }

  ResponseUtil.created(res, result, 'Certification added successfully');
});

// GET - Get All Certifications
export const getCertificationsController = withDevelopmentContext(async (req: Request, res: Response) => {
  const result = await professionalDevelopmentService.getCertifications(req.user?.userId!);

  if (!result || result.length === 0) {
    throw new NotFoundError('Certifications');
  }

  ResponseUtil.success(res, result, 'Certifications retrieved successfully');
});

// POST - Connect LinkedIn Learning
export const connectLinkedInLearningController = withDevelopmentContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  if (!validateUrl(req.body.linkedInToken) || !validateUrl(req.body.linkedInLearningUrl)) {
    throw new ValidationError('Invalid LinkedIn Learning URL or token');
  }

  const result = await professionalDevelopmentService.connectLinkedInLearning({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) {
    throw new BadRequestError('Failed to connect LinkedIn Learning');
  }

  ResponseUtil.success(res, result, 'LinkedIn Learning connected successfully');
});

// POST - Sync LinkedIn Courses
export const syncLinkedInCoursesController = withDevelopmentContext(async (req: Request, res: Response) => {
  const result = await professionalDevelopmentService.syncLinkedInCourses(req.user?.userId!);

  if (!result) {
    throw new NotFoundError('No courses to sync');
  }

  ResponseUtil.success(res, result, 'LinkedIn courses synced successfully');
});

// POST - Schedule Mock Interview
export const scheduleMockInterviewController = withDevelopmentContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await professionalDevelopmentService.scheduleMockInterview({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) {
    throw new BadRequestError('Failed to schedule mock interview');
  }

  ResponseUtil.created(res, result, 'Mock interview scheduled successfully');
});

// POST - Complete Mock Interview
export const completeMockInterviewController = withDevelopmentContext(async (req: Request, res: Response) => {
  const { id: sessionId } = req.params;
  const { answers } = req.body;

  if (!sessionId || !Array.isArray(answers) || answers.length === 0) {
    throw new ValidationError('sessionId and answers array are required');
  }

  if (!validId(sessionId)) {
    throw new ValidationError('Invalid session ID');
  }

  const result = await professionalDevelopmentService.completeMockInterview(
    sessionId,
    req.user?.userId!,
    sanitizeInput(answers)
  );

  if (!result) {
    throw new NotFoundError('Mock interview result');
  }

  ResponseUtil.success(res, result, 'Mock interview completed successfully');
});

// POST - Submit Resume for Review
export const submitResumeForReviewController = withDevelopmentContext(async (req: Request, res: Response) => {
  const resumeFile = req.file;

  if (!resumeFile) {
    throw new ValidationError('No resume file uploaded');
  }

  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (!allowedTypes.includes(resumeFile.mimetype)) {
    throw new ValidationError('Unsupported resume file format');
  }

  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await professionalDevelopmentService.submitResumeForReview(
    {
      ...sanitizeInput(req.body),
      userId: req.user?.userId!,
    },
    resumeFile
  );

  if (!result) {
    throw new BadRequestError('Failed to process resume review');
  }

  ResponseUtil.success(res, result, 'Resume submitted for review successfully');
});

// GET - Get Resume Review Result
export const getResumeReviewController = withDevelopmentContext(async (req: Request, res: Response) => {
  const { id: reviewId } = req.params;

  if (!validId(reviewId)) {
    throw new ValidationError('Invalid review ID');
  }

  const result = await professionalDevelopmentService.getResumeReview(reviewId, req.user?.userId!);

  if (!result) {
    throw new NotFoundError('Resume review result');
  }

  ResponseUtil.success(res, result, 'Resume review retrieved successfully');
});

// POST - Schedule Coaching Session
export const scheduleCoachingSessionController = withDevelopmentContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await professionalDevelopmentService.scheduleCoachingSession({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) {
    throw new BadRequestError('Failed to schedule coaching session');
  }

  ResponseUtil.created(res, result, 'Coaching session scheduled successfully');
});

// GET - Get Coaching Plan
export const getCoachingPlanController = withDevelopmentContext(async (req: Request, res: Response) => {
  const result = await professionalDevelopmentService.getCoachingPlan(req.user?.userId!);

  if (!result) {
    throw new NotFoundError('Coaching plan');
  }

  ResponseUtil.success(res, result, 'Coaching plan retrieved successfully');
});

// POST - Analyze Salary Benchmark
export const analyzeSalaryBenchmarkController = withDevelopmentContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await professionalDevelopmentService.analyzeSalaryBenchmark({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) {
    throw new NotFoundError('Salary benchmark analysis');
  }

  ResponseUtil.success(res, result, 'Salary benchmark analysis completed');
});

// GET - Get Negotiation Tips
export const getNegotiationTipsController = withDevelopmentContext(async (req: Request, res: Response) => {
  const { level, industry } = req.params;

  if (!level || !industry) {
    throw new ValidationError('Level and industry parameters are required');
  }

  const result = await professionalDevelopmentService.getNegotiationTips(level, industry);

  if (!result) {
    throw new NotFoundError('Negotiation tips');
  }

  ResponseUtil.success(res, result, 'Negotiation tips retrieved successfully');
});

// POST - Generate Market Report
export const generateMarketReportController = withDevelopmentContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await professionalDevelopmentService.generateMarketReport({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) {
    throw new BadRequestError('Failed to generate market report');
  }

  ResponseUtil.success(res, result, 'Market report generated successfully');
});

// GET - Get Existing Market Report
export const getMarketReportController = withDevelopmentContext(async (req: Request, res: Response) => {
  const { id: reportId } = req.params;

  if (!validId(reportId)) {
    throw new ValidationError('Invalid report ID');
  }

  const result = await professionalDevelopmentService.getMarketReport(reportId, req.user?.userId!);

  if (!result) {
    throw new NotFoundError('Market report');
  }

  ResponseUtil.success(res, result, 'Market report retrieved successfully');
});