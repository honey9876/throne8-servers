import { param, body, query } from 'express-validator';
import { Domain } from '@/shared/constants/domains';
import { ExperienceLevel, MentorStatus } from '../interface/mentor.types';

class MentorValidator {
  /**
   * ✅ FIXED: Validate UUID v4 format (not ObjectId)
   */
  private static isValidUUID(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  /**
   * ✅ UPDATED: Validate mentorId (UUID v4)
   */
  static getMentorById() {
    return [
      param('id')
        .trim()
        .notEmpty()
        .withMessage('Mentor ID is required')
        .custom((value) => {
          if (!this.isValidUUID(value)) {
            throw new Error('Invalid mentor ID format');
          }
          return true;
        }),
    ];
  }

  /**
   * ✅ UPDATED: Validate userId (UUID v4)
   */
  static getMentorByUserId() {
    return [
      param('userId')
        .trim()
        .notEmpty()
        .withMessage('User ID is required')
        .custom((value) => {
          if (!this.isValidUUID(value)) {
            throw new Error('Invalid user ID format');
          }
          return true;
        }),
    ];
  }

  /**
   * ✅ Create mentor validation
   */
  static createMentor() {
    return [
      // body('userId')
      //   .trim()
      //   .notEmpty()
      //   .withMessage('User ID is required')
      //   .custom((value) => {
      //     if (!this.isValidUUID(value)) {
      //       throw new Error('Invalid user ID format');
      //     }
      //     return true;
      //   }),
      
      body('companyId')
        .optional()
        .trim()
        .custom((value) => {
          if (value && !this.isValidUUID(value)) {
            throw new Error('Invalid company ID format');
          }
          return true;
        }),
      
      body('title')
        .trim()
        .notEmpty()
        .withMessage('Title is required')
        .isLength({ min: 5, max: 100 })
        .withMessage('Title must be 5-100 characters'),
      
      body('bio')
        .trim()
        .notEmpty()
        .withMessage('Bio is required')
        .isLength({ min: 50, max: 2000 })
        .withMessage('Bio must be 50-2000 characters'),
      
      body('tagline')
        .optional()
        .trim()
        .isLength({ max: 150 })
        .withMessage('Tagline cannot exceed 150 characters'),
      
      body('domains')
        .isArray({ min: 1, max: 5 })
        .withMessage('Must provide 1-5 domains')
        .custom((domains: string[]) => {
          const validDomains = Object.values(Domain);
          const allValid = domains.every(d => validDomains.includes(d as Domain));
          if (!allValid) {
            throw new Error('Invalid domain(s)');
          }
          return true;
        }),
      
      body('skills')
        .isArray({ min: 1, max: 20 })
        .withMessage('Must provide 1-20 skills'),
      
      // CHANGE: languages optional
body('languages')
  .optional()  // ADD .optional()
  .isArray({ min: 1 })
  .withMessage('At least one language is required'),

      body('experience.total').toInt()
        .isInt({ min: 0, max: 50 })
        .withMessage('Experience must be 0-50 years'),
      
     // CHANGE: experience.level optional (backend set karega)
body('experience.level')
  .optional()  // ADD .optional()
  .isIn(Object.values(ExperienceLevel))
  .withMessage('Invalid experience level'),

      body('experience.currentRole')
        .trim()
        .notEmpty()
        .withMessage('Current role is required'),
      
      body('pricing.quickCall').optional()
        .isInt({ min: 0 })
        .withMessage('Quick call price must be >= 0'),
      
      body('pricing.deepDive').optional()
        .isInt({ min: 0 })
        .withMessage('Deep dive price must be >= 0'),
      
      body('pricing.resumeReview').optional()
        .isInt({ min: 0 })
        .withMessage('Resume review price must be >= 0'),
      
      body('pricing.mockInterview').optional()
        .isInt({ min: 0 })
        .withMessage('Mock interview price must be >= 0'),
      
      body('pricing.careerPlanning').optional()
        .isInt({ min: 0 })
        .withMessage('Career planning price must be >= 0'),
      
      body('pricing.portfolioReview').optional()
        .isInt({ min: 0 })
        .withMessage('Portfolio review price must be >= 0'),
      
      body('pricing.askQuery').optional()
        .isInt({ min: 0 })
        .withMessage('Ask query price must be >= 0'),
      
      body('pricing.groupSession').optional()
        .isInt({ min: 0 })
        .withMessage('Group session price must be >= 0'),
      
      body('availability.timezone').optional()
        .trim()
        .notEmpty()
        .withMessage('Timezone is required'),
      
      body('availability.daysAvailable').optional()
        .isArray({ min: 1 })
        .withMessage('At least one available day is required'),
      
      body('availability.autoAcceptBookings').optional()
        .isBoolean()
        .withMessage('Auto accept bookings must be boolean'),
      
      body('availability.maxSessionsPerDay').optional()
        .isInt({ min: 1, max: 15 })
        .withMessage('Max sessions per day must be 1-15'),
      
      body('availability.bufferBetweenSessions').optional()
        .isInt({ min: 0 })
        .withMessage('Buffer must be >= 0'),
    ];
  }

  /**
   * ✅ UPDATED: Update mentor validation
   */
  static updateMentor() {
    return [
      param('id')
        .trim()
        .notEmpty()
        .withMessage('Mentor ID is required')
        .custom((value) => {
          if (!this.isValidUUID(value)) {
            throw new Error('Invalid mentor ID format');
          }
          return true;
        }),
      
      body('title')
        .optional()
        .trim()
        .isLength({ min: 5, max: 100 })
        .withMessage('Title must be 5-100 characters'),
      
      body('bio')
        .optional()
        .trim()
        .isLength({ min: 50, max: 2000 })
        .withMessage('Bio must be 50-2000 characters'),
      
      body('tagline')
        .optional()
        .trim()
        .isLength({ max: 150 })
        .withMessage('Tagline cannot exceed 150 characters'),
      
      body('domains')
        .optional()
        .isArray({ min: 1, max: 5 })
        .withMessage('Must provide 1-5 domains'),
      
      body('skills')
        .optional()
        .isArray({ min: 1, max: 20 })
        .withMessage('Must provide 1-20 skills'),
      
      body('languages')
        .optional()
        .isArray({ min: 1 })
        .withMessage('At least one language is required'),
      
      body('status')
        .optional()
        .isIn(Object.values(MentorStatus))
        .withMessage('Invalid status'),
    ];
  }

  /**
   * ✅ UPDATED: Delete mentor validation
   */
  static deleteMentor() {
    return [
      param('id')
        .trim()
        .notEmpty()
        .withMessage('Mentor ID is required')
        .custom((value) => {
          if (!this.isValidUUID(value)) {
            throw new Error('Invalid mentor ID format');
          }
          return true;
        }),
    ];
  }

  /**
   * ✅ UPDATED: Get mentor stats validation
   */
  static getMentorStats() {
    return [
      param('id')
        .trim()
        .notEmpty()
        .withMessage('Mentor ID is required')
        .custom((value) => {
          if (!this.isValidUUID(value)) {
            throw new Error('Invalid mentor ID format');
          }
          return true;
        }),
    ];
  }

  /**
   * ✅ Get pagination validation
   */
  static getPagination() {
    return [
      query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be >= 1')
        .toInt(),
      
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be 1-100')
        .toInt(),
      
      query('sortBy')
        .optional()
        .isIn(['rating', 'experience', 'price', 'sessions', 'createdAt'])
        .withMessage('Invalid sort field'),
      
      query('sortOrder')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Sort order must be asc or desc'),
      
      query('domains')
        .optional()
        .custom((value) => {
          const domains = Array.isArray(value) ? value : [value];
          const validDomains = Object.values(Domain);
          const allValid = domains.every(d => validDomains.includes(d as Domain));
          if (!allValid) {
            throw new Error('Invalid domain(s)');
          }
          return true;
        }),
      
      query('minRating')
        .optional()
        .isFloat({ min: 0, max: 5 })
        .withMessage('Min rating must be 0-5')
        .toFloat(),
      
      query('minExperience')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Min experience must be >= 0')
        .toInt(),
      
      query('featured')
        .optional()
        .isBoolean()
        .withMessage('Featured must be boolean')
        .toBoolean(),
    ];
  }
}

export default MentorValidator;

















// import { body, param, query } from 'express-validator';
// import { Domain } from '@/shared/constants/domains';
// import { ExperienceLevel, MentorStatus } from '@/Mentorship/interface/mentor.types';


// export class MentorValidator {
//   /**
//    * Validate mentor creation
//    */
//   static createMentor() {
//     return [
//       // ❌ REMOVED userId validation - it comes from req.user
      
//       body('companyId')
//         .optional()
//         .isString()
//         .withMessage('Company ID must be a string'),

//       body('title')
//         .notEmpty()
//         .withMessage('Title is required')
//         .isString()
//         .isLength({ min: 5, max: 100 })
//         .withMessage('Title must be 5-100 characters'),

//       body('bio')
//         .notEmpty()
//         .withMessage('Bio is required')
//         .isString()
//         .isLength({ min: 50, max: 2000 })
//         .withMessage('Bio must be 50-2000 characters'),

//       body('tagline')
//         .optional()
//         .isString()
//         .isLength({ max: 150 })
//         .withMessage('Tagline cannot exceed 150 characters'),

//       body('domains')
//         .isArray({ min: 1, max: 5 })
//         .withMessage('Must have 1-5 domains')
//         .custom((domains: string[]) => {
//           return domains.every((d) => Object.values(Domain).includes(d as Domain));
//         })
//         .withMessage('Invalid domain(s)'),

//       body('skills')
//         .isArray({ min: 1, max: 20 })
//         .withMessage('Must have 1-20 skills'),

//       body('languages')
//         .isArray({ min: 1 })
//         .withMessage('At least one language is required'),

//       body('experience.total')
//         .isInt({ min: 0, max: 50 })
//         .withMessage('Experience must be 0-50 years'),

//       body('experience.level')
//         .isIn(Object.values(ExperienceLevel))
//         .withMessage('Invalid experience level'),

//       body('experience.currentRole')
//         .notEmpty()
//         .withMessage('Current role is required')
//         .isString(),

//       body('experience.previousRoles')
//         .optional()
//         .isArray()
//         .withMessage('Previous roles must be an array'),

//       body('pricing.quickCall')
//         .isFloat({ min: 0 })
//         .withMessage('Quick call price must be >= 0'),

//       body('pricing.deepDive')
//         .isFloat({ min: 0 })
//         .withMessage('Deep dive price must be >= 0'),

//       body('pricing.resumeReview')
//         .isFloat({ min: 0 })
//         .withMessage('Resume review price must be >= 0'),

//       body('pricing.mockInterview')
//         .isFloat({ min: 0 })
//         .withMessage('Mock interview price must be >= 0'),

//       body('pricing.careerPlanning')
//         .isFloat({ min: 0 })
//         .withMessage('Career planning price must be >= 0'),

//       body('pricing.portfolioReview')
//         .isFloat({ min: 0 })
//         .withMessage('Portfolio review price must be >= 0'),

//       body('pricing.askQuery')
//         .isFloat({ min: 0 })
//         .withMessage('Ask query price must be >= 0'),

//       body('pricing.groupSession')
//         .isFloat({ min: 0 })
//         .withMessage('Group session price must be >= 0'),

//       body('availability.timezone')
//         .notEmpty()
//         .withMessage('Timezone is required')
//         .isString(),

//       body('availability.daysAvailable')
//         .isArray({ min: 1 })
//         .withMessage('At least one available day is required'),

//       body('availability.maxSessionsPerDay')
//         .optional()
//         .isInt({ min: 1, max: 15 })
//         .withMessage('Max sessions per day must be 1-15'),
//     ];
//   }

//   /**
//    * Validate mentor update
//    */
//   static updateMentor() {
//     return [
//       param('id').isMongoId().withMessage('Invalid mentor ID'),

//       body('title')
//         .optional()
//         .isString()
//         .isLength({ min: 5, max: 100 })
//         .withMessage('Title must be 5-100 characters'),

//       body('bio')
//         .optional()
//         .isString()
//         .isLength({ min: 50, max: 2000 })
//         .withMessage('Bio must be 50-2000 characters'),

//       body('tagline')
//         .optional()
//         .isString()
//         .isLength({ max: 150 })
//         .withMessage('Tagline cannot exceed 150 characters'),

//       body('domains')
//         .optional()
//         .isArray({ min: 1, max: 5 })
//         .withMessage('Must have 1-5 domains')
//         .custom((domains: string[]) => {
//           return domains.every((d) => Object.values(Domain).includes(d as Domain));
//         })
//         .withMessage('Invalid domain(s)'),

//       body('skills')
//         .optional()
//         .isArray({ min: 1, max: 20 })
//         .withMessage('Must have 1-20 skills'),

//       body('languages').optional().isArray().withMessage('Languages must be an array'),

//       body('experience.total')
//         .optional()
//         .isInt({ min: 0, max: 50 })
//         .withMessage('Experience must be 0-50 years'),

//       body('experience.level')
//         .optional()
//         .isIn(Object.values(ExperienceLevel))
//         .withMessage('Invalid experience level'),

//       body('status')
//         .optional()
//         .isIn(Object.values(MentorStatus))
//         .withMessage('Invalid status'),
//     ];
//   }

//   /**
//    * Validate get mentor by ID
//    */
//   static getMentorById() {
//     return [param('id').isMongoId().withMessage('Invalid mentor ID')];
//   }

//   /**
//    * Validate delete mentor
//    */
//   static deleteMentor() {
//     return [param('id').isMongoId().withMessage('Invalid mentor ID')];
//   }

//   /**
//    * Validate get mentor stats
//    */
//   static getMentorStats() {
//     return [param('id').isMongoId().withMessage('Invalid mentor ID')];
//   }

//   /**
//    * Validate pagination params
//    */
//   static getPagination() {
//     return [
//       query('page')
//         .optional()
//         .isInt({ min: 1 })
//         .withMessage('Page must be >= 1'),

//       query('limit')
//         .optional()
//         .isInt({ min: 1, max: 100 })
//         .withMessage('Limit must be 1-100'),
//     ];
//   }
// }

// export default MentorValidator;