// validations/seniorMentorApplication.validator.ts
import { body, param, query } from 'express-validator';
import { Domain } from '@/shared/constants/domains';
import { ExperienceLevel } from '../interface/mentor.types';
import { ApplicationStatus, MentorshipHelpArea } from '../interface/seniorMentorApplication.types';

class SeniorMentorApplicationValidator {
  private static isValidUUID(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  static getById() {
    return [
      param('id')
        .trim()
        .notEmpty()
        .withMessage('Application ID is required')
        .custom((value) => {
          if (!this.isValidUUID(value)) {
            throw new Error('Invalid application ID format');
          }
          return true;
        }),
    ];
  }

  static apply() {
    return [
      body('fullName')
        .trim()
        .notEmpty()
        .withMessage('Full name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be 2-100 characters'),

      body('college')
        .trim()
        .notEmpty()
        .withMessage('College/University is required')
        .isLength({ max: 200 }),

      body('degree').trim().notEmpty().withMessage('Degree is required').isLength({ max: 100 }),

      body('fieldOfStudy')
        .trim()
        .notEmpty()
        .withMessage('Field of study is required')
        .isLength({ max: 100 }),

      body('graduationYear')
        .notEmpty()
        .withMessage('Graduation year is required')
        .isInt({ min: 1980, max: new Date().getFullYear() + 10 })
        .withMessage('Graduation year seems invalid'),

      body('currentRole')
        .trim()
        .notEmpty()
        .withMessage('Current role is required')
        .isLength({ max: 100 }),

      body('currentCompany')
        .trim()
        .notEmpty()
        .withMessage('Current company is required')
        .isLength({ max: 100 }),

      body('shortBio')
        .trim()
        .notEmpty()
        .withMessage('Short bio is required')
        .isLength({ min: 50, max: 1000 })
        .withMessage('Bio must be 50-1000 characters'),

      body('linkedinUrl')
        .trim()
        .notEmpty()
        .withMessage('LinkedIn URL is required')
        .matches(/^https?:\/\/(www\.)?linkedin\.com\/.+/i)
        .withMessage('Invalid LinkedIn URL'),

      body('githubUrl')
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^https?:\/\/(www\.)?github\.com\/.+/i)
        .withMessage('Invalid GitHub URL'),

      body('portfolioUrl').optional({ checkFalsy: true }).trim().isURL().withMessage('Invalid portfolio URL'),

      body('yearsOfExperience')
        .notEmpty()
        .withMessage('Years of experience is required')
        .isFloat({ min: 0, max: 50 })
        .withMessage('Years of experience must be between 0 and 50'),

      body('experienceLevel')
        .notEmpty()
        .withMessage('Experience level is required')
        .isIn(Object.values(ExperienceLevel))
        .withMessage('Invalid experience level'),

      body('primaryExpertise')
        .notEmpty()
        .withMessage('Primary expertise is required')
        .isIn(Object.values(Domain))
        .withMessage('Invalid primary expertise'),

      body('otherSkills').optional().isArray({ max: 20 }).withMessage('Cannot list more than 20 skills'),
      body('technologies')
        .optional()
        .isArray({ max: 30 })
        .withMessage('Cannot list more than 30 technologies'),
      body('achievements')
        .optional()
        .isArray({ max: 15 })
        .withMessage('Cannot list more than 15 achievements'),
      body('certifications')
        .optional()
        .isArray({ max: 15 })
        .withMessage('Cannot list more than 15 certifications'),

      body('helpAreas')
        .isArray({ min: 1, max: 7 })
        .withMessage('Select 1-7 mentorship help areas')
        .custom((areas: string[]) => {
          const valid = Object.values(MentorshipHelpArea);
          const invalid = areas.filter((a) => !valid.includes(a as MentorshipHelpArea));
          if (invalid.length > 0) {
            throw new Error(`Invalid help area(s): ${invalid.join(', ')}`);
          }
          return true;
        }),

      body('motivation')
        .trim()
        .notEmpty()
        .withMessage('Please share why you want to become a Senior Mentor')
        .isLength({ min: 30, max: 1000 })
        .withMessage('Motivation must be 30-1000 characters'),

      body('adviceToJuniorSelf')
        .trim()
        .notEmpty()
        .withMessage('This field is required')
        .isLength({ min: 10, max: 500 })
        .withMessage('Must be 10-500 characters'),
    ];
  }

  static update() {
    return [
      body('fullName').optional().trim().isLength({ min: 2, max: 100 }),
      body('college').optional().trim().isLength({ max: 200 }),
      body('degree').optional().trim().isLength({ max: 100 }),
      body('fieldOfStudy').optional().trim().isLength({ max: 100 }),
      body('graduationYear')
        .optional()
        .isInt({ min: 1980, max: new Date().getFullYear() + 10 }),
      body('currentRole').optional().trim().isLength({ max: 100 }),
      body('currentCompany').optional().trim().isLength({ max: 100 }),
      body('shortBio').optional().trim().isLength({ min: 50, max: 1000 }),
      body('linkedinUrl')
        .optional()
        .trim()
        .matches(/^https?:\/\/(www\.)?linkedin\.com\/.+/i)
        .withMessage('Invalid LinkedIn URL'),
      body('githubUrl')
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^https?:\/\/(www\.)?github\.com\/.+/i)
        .withMessage('Invalid GitHub URL'),
      body('portfolioUrl').optional({ checkFalsy: true }).trim().isURL(),
      body('yearsOfExperience').optional().isFloat({ min: 0, max: 50 }),
      body('experienceLevel').optional().isIn(Object.values(ExperienceLevel)),
      body('primaryExpertise').optional().isIn(Object.values(Domain)),
      body('otherSkills').optional().isArray({ max: 20 }),
      body('technologies').optional().isArray({ max: 30 }),
      body('achievements').optional().isArray({ max: 15 }),
      body('certifications').optional().isArray({ max: 15 }),
      body('helpAreas')
        .optional()
        .isArray({ min: 1, max: 7 })
        .custom((areas: string[]) => {
          const valid = Object.values(MentorshipHelpArea);
          const invalid = areas.filter((a) => !valid.includes(a as MentorshipHelpArea));
          if (invalid.length > 0) {
            throw new Error(`Invalid help area(s): ${invalid.join(', ')}`);
          }
          return true;
        }),
      body('motivation').optional().trim().isLength({ min: 30, max: 1000 }),
      body('adviceToJuniorSelf').optional().trim().isLength({ min: 10, max: 500 }),
    ];
  }

  static reject() {
    return [
      body('reason')
        .trim()
        .notEmpty()
        .withMessage('Rejection reason is required')
        .isLength({ max: 500 })
        .withMessage('Reason cannot exceed 500 characters'),
    ];
  }

  static list() {
    return [
      query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
      query('status').optional().isIn(Object.values(ApplicationStatus)),
      query('primaryExpertise').optional().isIn(Object.values(Domain)),
      query('search').optional().trim(),
    ];
  }
}

export default SeniorMentorApplicationValidator;
