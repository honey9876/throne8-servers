import { body, param, query } from 'express-validator';
import { Domain } from '@/shared/constants/domains';
import { ExperienceLevel } from '@/Mentorship/interface/mentor.types';

/**
 * Common validation rules
 */

// MongoDB ObjectId validation
export const validateMongoId = (field: string = 'id') => {
  return param(field)
    .matches(/^[0-9a-fA-F]{24}$/)
    .withMessage(`Invalid ${field} format`);
};

// Email validation
export const validateEmail = (field: string = 'email') => {
  return body(field)
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email format');
};

// Phone validation
export const validatePhone = (field: string = 'phone') => {
  return body(field)
    .optional()
    .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .withMessage('Invalid phone number format');
};

// URL validation
export const validateUrl = (field: string, required: boolean = false) => {
  const validator = body(field);
  if (!required) validator.optional();
  return validator.isURL().withMessage(`Invalid ${field} URL format`);
};

// Date validation
export const validateDate = (field: string, options?: { past?: boolean; future?: boolean }) => {
  const validator = body(field)
    .isISO8601()
    .withMessage(`Invalid ${field} date format`);

  if (options?.past) {
    validator.custom((value) => {
      const date = new Date(value);
      if (date > new Date()) {
        throw new Error(`${field} must be in the past`);
      }
      return true;
    });
  }

  if (options?.future) {
    validator.custom((value) => {
      const date = new Date(value);
      if (date < new Date()) {
        throw new Error(`${field} must be in the future`);
      }
      return true;
    });
  }

  return validator;
};

// Array validation
export const validateArray = (
  field: string,
  minLength?: number,
  maxLength?: number
) => {
  const validator = body(field)
    .isArray()
    .withMessage(`${field} must be an array`);

  if (minLength !== undefined) {
    validator.custom((value) => {
      if (value.length < minLength) {
        throw new Error(`${field} must have at least ${minLength} items`);
      }
      return true;
    });
  }

  if (maxLength !== undefined) {
    validator.custom((value) => {
      if (value.length > maxLength) {
        throw new Error(`${field} must have at most ${maxLength} items`);
      }
      return true;
    });
  }

  return validator;
};

// Number range validation
export const validateNumberRange = (
  field: string,
  min?: number,
  max?: number
) => {
  const validator = body(field)
    .isNumeric()
    .withMessage(`${field} must be a number`);

  if (min !== undefined) {
    validator.custom((value) => {
      if (parseFloat(value) < min) {
        throw new Error(`${field} must be at least ${min}`);
      }
      return true;
    });
  }

  if (max !== undefined) {
    validator.custom((value) => {
      if (parseFloat(value) > max) {
        throw new Error(`${field} must be at most ${max}`);
      }
      return true;
    });
  }

  return validator;
};

// String length validation
export const validateStringLength = (
  field: string,
  minLength?: number,
  maxLength?: number
) => {
  const validator = body(field)
    .isString()
    .trim()
    .withMessage(`${field} must be a string`);

  if (minLength !== undefined) {
    validator.isLength({ min: minLength })
      .withMessage(`${field} must be at least ${minLength} characters`);
  }

  if (maxLength !== undefined) {
    validator.isLength({ max: maxLength })
      .withMessage(`${field} must be at most ${maxLength} characters`);
  }

  return validator;
};

// Enum validation
export const validateEnum = (field: string, enumValues: any) => {
  return body(field)
    .isIn(Object.values(enumValues))
    .withMessage(`${field} must be one of: ${Object.values(enumValues).join(', ')}`);
};

/**
 * Domain-specific validators
 */

// Domain validation
export const validateDomains = () => {
  return body('domains')
    .isArray({ min: 1, max: 5 })
    .withMessage('Must provide 1-5 domains')
    .custom((domains: string[]) => {
      const validDomains = Object.values(Domain);
      const invalidDomains = domains.filter(d => !validDomains.includes(d as Domain));
      if (invalidDomains.length > 0) {
        throw new Error(`Invalid domains: ${invalidDomains.join(', ')}`);
      }
      return true;
    });
};

// Skills validation
export const validateSkills = () => {
  return body('skills')
    .isArray({ min: 1, max: 20 })
    .withMessage('Must provide 1-20 skills')
    .custom((skills: string[]) => {
      if (skills.some(s => typeof s !== 'string' || s.trim().length === 0)) {
        throw new Error('All skills must be non-empty strings');
      }
      return true;
    });
};

// Experience validation
export const validateExperience = () => {
  return [
    body('experience.total')
      .isInt({ min: 0, max: 50 })
      .withMessage('Total experience must be between 0 and 50 years'),
    body('experience.level')
      .isIn(Object.values(ExperienceLevel))
      .withMessage('Invalid experience level'),
    body('experience.currentRole')
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Current role must be 2-100 characters'),
  ];
};

// Pricing validation
export const validatePricing = () => {
  const sessionTypes = [
    'quickCall',
    'deepDive',
    'resumeReview',
    'mockInterview',
    'careerPlanning',
    'portfolioReview',
    'askQuery',
    'groupSession',
  ];

  return sessionTypes.map(type =>
    body(`pricing.${type}`)
      .isFloat({ min: 0 })
      .withMessage(`${type} price must be a positive number`)
  );
};

// Availability validation
export const validateAvailability = () => {
  return [
    body('availability.timezone')
      .isString()
      .withMessage('Timezone is required'),
    body('availability.daysAvailable')
      .isArray({ min: 1 })
      .withMessage('Must provide at least one available day')
      .custom((days: string[]) => {
        const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const invalidDays = days.filter(d => !validDays.includes(d.toLowerCase()));
        if (invalidDays.length > 0) {
          throw new Error(`Invalid days: ${invalidDays.join(', ')}`);
        }
        return true;
      }),
    body('availability.maxSessionsPerDay')
      .optional()
      .isInt({ min: 1, max: 15 })
      .withMessage('Max sessions per day must be between 1 and 15'),
  ];
};

// Pagination query validation
export const validatePaginationQuery = () => {
  return [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ];
};

// Search query validation
export const validateSearchQuery = () => {
  return [
    query('keyword')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Keyword must be 2-100 characters'),
    query('minPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Min price must be a positive number'),
    query('maxPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Max price must be a positive number'),
    query('minRating')
      .optional()
      .isFloat({ min: 0, max: 5 })
      .withMessage('Min rating must be between 0 and 5'),
  ];
};

/**
 * Helper functions
 */

// Check if value is valid MongoDB ObjectId
export const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

// Check if value is valid email
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Check if value is valid URL
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Sanitize string input
export const sanitizeString = (str: string): string => {
  return str.trim().replace(/[<>]/g, '');
};

// Sanitize array of strings
export const sanitizeStringArray = (arr: string[]): string[] => {
  return arr.map(sanitizeString).filter(s => s.length > 0);
};

export default {
  validateMongoId,
  validateEmail,
  validatePhone,
  validateUrl,
  validateDate,
  validateArray,
  validateNumberRange,
  validateStringLength,
  validateEnum,
  validateDomains,
  validateSkills,
  validateExperience,
  validatePricing,
  validateAvailability,
  validatePaginationQuery,
  validateSearchQuery,
  isValidObjectId,
  isValidEmail,
  isValidUrl,
  sanitizeString,
  sanitizeStringArray,
};