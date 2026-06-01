/**
 * ====================================
 * COMMON VALIDATORS
 * ====================================
 * Reusable validation schemas for common data types
 */

import Joi from 'joi';

/**
 * MongoDB ObjectId validation
 */
export const objectIdSchema = Joi.string()
  .regex(/^[0-9a-fA-F]{24}$/)
  .required()
  .messages({
    'string.pattern.base': 'Invalid ID format. Must be a valid MongoDB ObjectId',
    'any.required': 'ID is required',
    'string.empty': 'ID cannot be empty',
  });

/**
 * Optional MongoDB ObjectId validation
 */
export const optionalObjectIdSchema = Joi.string()
  .regex(/^[0-9a-fA-F]{24}$/)
  .optional()
  .allow(null, '')
  .messages({
    'string.pattern.base': 'Invalid ID format. Must be a valid MongoDB ObjectId',
  });

/**
 * Email validation
 */
export const emailSchema = Joi.string()
  .email()
  .lowercase()
  .trim()
  .required()
  .messages({
    'string.email': 'Please provide a valid email address',
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
  });

/**
 * Optional email validation
 */
export const optionalEmailSchema = Joi.string()
  .email()
  .lowercase()
  .trim()
  .optional()
  .allow(null, '')
  .messages({
    'string.email': 'Please provide a valid email address',
  });

/**
 * Phone number validation (Indian format)
 */
export const phoneSchema = Joi.string()
  .pattern(/^[6-9]\d{9}$/)
  .required()
  .messages({
    'string.pattern.base': 'Please provide a valid 10-digit phone number starting with 6-9',
    'string.empty': 'Phone number is required',
    'any.required': 'Phone number is required',
  });

/**
 * Optional phone number validation
 */
export const optionalPhoneSchema = Joi.string()
  .pattern(/^[6-9]\d{9}$/)
  .optional()
  .allow(null, '')
  .messages({
    'string.pattern.base': 'Please provide a valid 10-digit phone number starting with 6-9',
  });

/**
 * URL validation
 */
export const urlSchema = Joi.string()
  .uri()
  .required()
  .messages({
    'string.uri': 'Please provide a valid URL',
    'string.empty': 'URL is required',
    'any.required': 'URL is required',
  });

/**
 * Optional URL validation
 */
export const optionalUrlSchema = Joi.string()
  .uri()
  .optional()
  .allow(null, '')
  .messages({
    'string.uri': 'Please provide a valid URL',
  });

/**
 * Date validation (ISO 8601 format)
 */
export const dateSchema = Joi.date()
  .iso()
  .required()
  .messages({
    'date.base': 'Please provide a valid date',
    'date.format': 'Date must be in ISO 8601 format',
    'any.required': 'Date is required',
  });

/**
 * Optional date validation
 */
export const optionalDateSchema = Joi.date()
  .iso()
  .optional()
  .allow(null)
  .messages({
    'date.base': 'Please provide a valid date',
    'date.format': 'Date must be in ISO 8601 format',
  });

/**
 * Future date validation
 */
export const futureDateSchema = Joi.date()
  .iso()
  .greater('now')
  .required()
  .messages({
    'date.greater': 'Date must be in the future',
    'any.required': 'Date is required',
  });

/**
 * Past date validation
 */
export const pastDateSchema = Joi.date()
  .iso()
  .less('now')
  .required()
  .messages({
    'date.less': 'Date must be in the past',
    'any.required': 'Date is required',
  });

/**
 * Pagination validation
 */
export const paginationSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .optional()
    .default(1)
    .messages({
      'number.base': 'Page must be a number',
      'number.min': 'Page must be at least 1',
    }),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .messages({
      'number.base': 'Limit must be a number',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100',
    }),
});

/**
 * Sort order validation
 */
export const sortOrderSchema = Joi.string()
  .valid('asc', 'desc', '1', '-1')
  .optional()
  .default('desc')
  .messages({
    'any.only': 'Sort order must be either "asc" or "desc"',
  });

/**
 * Search query validation
 */
export const searchQuerySchema = Joi.string()
  .trim()
  .min(2)
  .max(100)
  .optional()
  .messages({
    'string.min': 'Search query must be at least 2 characters',
    'string.max': 'Search query must not exceed 100 characters',
  });

/**
 * Array of ObjectIds validation
 */
export const objectIdArraySchema = Joi.array()
  .items(
    Joi.string().regex(/^[0-9a-fA-F]{24}$/).messages({
      'string.pattern.base': 'Each ID must be a valid MongoDB ObjectId',
    })
  )
  .min(1)
  .required()
  .messages({
    'array.min': 'At least one ID is required',
    'any.required': 'IDs array is required',
  });

/**
 * Optional array of ObjectIds validation
 */
export const optionalObjectIdArraySchema = Joi.array()
  .items(
    Joi.string().regex(/^[0-9a-fA-F]{24}$/).messages({
      'string.pattern.base': 'Each ID must be a valid MongoDB ObjectId',
    })
  )
  .optional()
  .messages({
    'array.base': 'Must be an array of IDs',
  });

/**
 * Tags array validation
 */
export const tagsArraySchema = Joi.array()
  .items(Joi.string().trim().max(50))
  .max(10)
  .optional()
  .messages({
    'array.max': 'Maximum 10 tags allowed',
    'string.max': 'Each tag must not exceed 50 characters',
  });

/**
 * File size validation (in bytes)
 */
export const fileSizeSchema = Joi.number()
  .integer()
  .max(10485760) // 10MB
  .required()
  .messages({
    'number.max': 'File size must not exceed 10MB',
    'any.required': 'File size is required',
  });

/**
 * Image URL validation
 */
export const imageUrlSchema = Joi.string()
  .uri()
  .pattern(/\.(jpg|jpeg|png|gif|webp|svg)$/i)
  .optional()
  .allow(null, '')
  .messages({
    'string.uri': 'Please provide a valid image URL',
    'string.pattern.base': 'Image must be in JPG, PNG, GIF, WEBP, or SVG format',
  });

/**
 * Password validation
 */
export const passwordSchema = Joi.string()
  .min(6)
  .max(128)
  .required()
  .messages({
    'string.min': 'Password must be at least 6 characters',
    'string.max': 'Password must not exceed 128 characters',
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  });

/**
 * Strong password validation (with requirements)
 */
export const strongPasswordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters',
    'string.max': 'Password must not exceed 128 characters',
    'string.pattern.base':
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  });

/**
 * Username validation
 */
export const usernameSchema = Joi.string()
  .alphanum()
  .min(3)
  .max(30)
  .lowercase()
  .trim()
  .required()
  .messages({
    'string.alphanum': 'Username must contain only letters and numbers',
    'string.min': 'Username must be at least 3 characters',
    'string.max': 'Username must not exceed 30 characters',
    'string.empty': 'Username is required',
    'any.required': 'Username is required',
  });

/**
 * Optional username validation
 */
export const optionalUsernameSchema = Joi.string()
  .alphanum()
  .min(3)
  .max(30)
  .lowercase()
  .trim()
  .optional()
  .allow(null, '')
  .messages({
    'string.alphanum': 'Username must contain only letters and numbers',
    'string.min': 'Username must be at least 3 characters',
    'string.max': 'Username must not exceed 30 characters',
  });

/**
 * Boolean validation
 */
export const booleanSchema = Joi.boolean()
  .required()
  .messages({
    'boolean.base': 'Must be a boolean value (true or false)',
    'any.required': 'This field is required',
  });

/**
 * Optional boolean validation
 */
export const optionalBooleanSchema = Joi.boolean()
  .optional()
  .messages({
    'boolean.base': 'Must be a boolean value (true or false)',
  });

/**
 * Coordinates validation (latitude, longitude)
 */
export const coordinatesSchema = Joi.object({
  latitude: Joi.number()
    .min(-90)
    .max(90)
    .required()
    .messages({
      'number.min': 'Latitude must be between -90 and 90',
      'number.max': 'Latitude must be between -90 and 90',
      'any.required': 'Latitude is required',
    }),

  longitude: Joi.number()
    .min(-180)
    .max(180)
    .required()
    .messages({
      'number.min': 'Longitude must be between -180 and 180',
      'number.max': 'Longitude must be between -180 and 180',
      'any.required': 'Longitude is required',
    }),
});

/**
 * OTP validation
 */
export const otpSchema = Joi.string()
  .length(6)
  .pattern(/^\d{6}$/)
  .required()
  .messages({
    'string.length': 'OTP must be exactly 6 digits',
    'string.pattern.base': 'OTP must contain only numbers',
    'string.empty': 'OTP is required',
    'any.required': 'OTP is required',
  });

/**
 * Color hex code validation
 */
export const hexColorSchema = Joi.string()
  .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
  .optional()
  .messages({
    'string.pattern.base': 'Must be a valid hex color code (e.g., #FF5733)',
  });

/**
 * Rating validation (1-5)
 */
export const ratingSchema = Joi.number()
  .integer()
  .min(1)
  .max(5)
  .required()
  .messages({
    'number.min': 'Rating must be between 1 and 5',
    'number.max': 'Rating must be between 1 and 5',
    'any.required': 'Rating is required',
  });

export default {
  objectIdSchema,
  optionalObjectIdSchema,
  emailSchema,
  optionalEmailSchema,
  phoneSchema,
  optionalPhoneSchema,
  urlSchema,
  optionalUrlSchema,
  dateSchema,
  optionalDateSchema,
  futureDateSchema,
  pastDateSchema,
  paginationSchema,
  sortOrderSchema,
  searchQuerySchema,
  objectIdArraySchema,
  optionalObjectIdArraySchema,
  tagsArraySchema,
  fileSizeSchema,
  imageUrlSchema,
  passwordSchema,
  strongPasswordSchema,
  usernameSchema,
  optionalUsernameSchema,
  booleanSchema,
  optionalBooleanSchema,
  coordinatesSchema,
  otpSchema,
  hexColorSchema,
  ratingSchema,
};