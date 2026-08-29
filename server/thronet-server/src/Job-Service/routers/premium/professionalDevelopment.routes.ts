import express from 'express';
import { validateAssessment, validateCareerPath, validateCertification, validateCoaching, validateInterview, validateLinkedIn, validateReport, validateResume, validateSalary, validateSkillsGap, validateUUID } from '@/shared/middlewares/job-service/premium.professionalDevelopment';
import { analyzeSkillsGapController, connectLinkedInLearningController, completeMockInterviewController, getCoachingPlanController, getMarketReportController, getResumeReviewController, addCertificationController, submitAssessmentController, getCertificationsController, generateCareerPathController, getNegotiationTipsController, syncLinkedInCoursesController, generateMarketReportController, createSkillAssessmentController, getSkillsGapAnalysisController, scheduleMockInterviewController, submitResumeForReviewController, analyzeSalaryBenchmarkController, scheduleCoachingSessionController, getCareerPathSuggestionsController } from '@/Job-Service/controllers';
const router = express.Router();

// Routes
router.post(
  '/skills/analyze',
  // rateLimiter.skillsAnalysisLimit,
  validateSkillsGap,
  analyzeSkillsGapController
);

router.get(
  '/skills/gap',
  //  rateLimiter.generalLimit,
    getSkillsGapAnalysisController
);

router.post(
  '/career/path',
  // rateLimiter.generalLimit,
  validateCareerPath,
  generateCareerPathController
);

router.get(
  '/career/suggestions',
  //  rateLimiter.generalLimit,
   getCareerPathSuggestionsController
);

router.post(
  '/assessments',
  // rateLimiter.assessmentLimit,
  validateAssessment,
  createSkillAssessmentController
);

router.post(
  '/assessments/:id/submit',
  // rateLimiter.assessmentLimit,
  validateUUID,
  submitAssessmentController
);

router.post(
  '/certifications',
  // rateLimiter.generalLimit,
  validateCertification,
  addCertificationController
);

router.get(
  '/certifications',
  // rateLimiter.generalLimit,
  getCertificationsController
);

router.post(
  '/linkedin/connect',
  // rateLimiter.generalLimit,
  validateLinkedIn,
  connectLinkedInLearningController
);

router.post(
  '/linkedin/sync',
  // rateLimiter.generalLimit,
  syncLinkedInCoursesController
);

router.post(
  '/interviews/mock',
  // rateLimiter.interviewLimit,
  validateInterview,
  scheduleMockInterviewController
);

router.post(
  '/interviews/:id/complete',
  // rateLimiter.interviewLimit,
  validateUUID,
  completeMockInterviewController
);

router.post(
  '/resume/review',
  // rateLimiter.resumeLimit,
  validateResume,
  submitResumeForReviewController
);

router.get(
  '/resume/review/:id',
  // rateLimiter.generalLimit,
  validateUUID,
  getResumeReviewController
);

router.post(
  '/coaching/schedule',
  // rateLimiter.coachingLimit,
  validateCoaching,
  scheduleCoachingSessionController
);

router.get(
  '/coaching/plan',
  // rateLimiter.generalLimit,
  getCoachingPlanController
);

router.post(
  '/salary/benchmark',
  // rateLimiter.salaryLimit,
  validateSalary,
  analyzeSalaryBenchmarkController
);

router.get(
  '/salary/tips/:level/:industry',
  // rateLimiter.generalLimit,
  getNegotiationTipsController
);

router.post(
  '/market/report',
  // rateLimiter.reportLimit,
  validateReport,
  generateMarketReportController
);

router.get(
  '/market/report/:id',
  // rateLimiter.generalLimit,
  validateUUID,
  getMarketReportController
);

export default router;
