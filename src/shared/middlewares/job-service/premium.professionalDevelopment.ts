import { body, param } from 'express-validator';

// Validation middleware
export const validateUUID = param('id').isUUID().withMessage('Invalid ID format');

export const validateSkillsGap = [
  body('currentSkills').isArray({ min: 1, max: 100 }),
  body('targetRole').isString().isLength({ max: 100 }),
  body('careerLevel').isIn(['entry', 'junior', 'mid', 'senior', 'lead', 'executive'])
];
export const validateCareerPath = [
  body('currentRole').isString().isLength({ max: 100 }),
  body('currentLevel').isIn(['entry', 'junior', 'mid', 'senior', 'lead', 'executive']),
  body('industry').isString().isLength({ max: 50 }),
  body('careerGoals').isArray({ min: 1, max: 10 })
];
export const validateAssessment = [
  body('skillId').isString().notEmpty(),
  body('assessmentType').isIn(['multiple_choice', 'coding', 'practical', 'portfolio']),
  body('difficulty').isIn(['beginner', 'intermediate', 'advanced', 'expert'])
];
export const validateCertification = [
  body('certificationName').isString().isLength({ max: 200 }),
  body('issuingOrganization').isString().isLength({ max: 100 }),
  body('issueDate').isISO8601()
];
export const validateLinkedIn = [
  body('accessToken').isString().notEmpty(),
  body('syncPreferences.autoSync').isBoolean().optional()
];
export const validateInterview = [
  body('interviewType').isIn(['behavioral', 'technical', 'case_study', 'system_design', 'general']),
  body('jobRole').isString().isLength({ max: 100 }),
  body('experienceLevel').isIn(['entry', 'junior', 'mid', 'senior', 'lead', 'executive'])
];
export const validateResume = [
  body('targetRole').isString().isLength({ max: 100 }),
  body('reviewType').isIn(['basic', 'detailed', 'ats_optimization', 'executive']).optional(),
  body('urgency').isIn(['standard', 'rush', 'same_day']).optional()
];
export const validateCoaching = [
  body('sessionType').isIn(['career_planning', 'interview_prep', 'salary_negotiation', 'skill_development', 'leadership_coaching', 'career_transition']),
  body('scheduledAt').isISO8601().toDate(),
  body('goals').isArray({ min: 1, max: 5 })
];
export const validateSalary = [
  body('jobTitle').isString().isLength({ max: 100 }),
  body('location').isString().isLength({ max: 100 }),
  body('industry').isString().isLength({ max: 50 })
];
export const validateReport = [
  body('reportType').isIn(['industry_overview', 'skill_demand', 'salary_trends', 'hiring_trends', 'competitive_analysis', 'custom']),
  body('filters.industry').isString().isLength({ max: 50 }).optional()
];
