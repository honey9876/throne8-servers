/**
 * ====================================
 * MODERATION VALIDATORS (JOI)
 * ====================================
 * Validation schemas for moderation routes
 */

import Joi from 'joi';

/**
 * MongoDB ObjectId Pattern
 */

/**
 * Set Group Rules Validation Schema
 */
export const setRulesSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
  rules: Joi.string()
    .trim()
    .min(10)
    .max(5000)
    .required()
    .messages({
      'string.empty': 'Rules are required',
      'string.min': 'Rules must be at least 10 characters',
      'string.max': 'Rules must not exceed 5000 characters',
      'any.required': 'Rules are required',
    }),
});

/**
 * Get Group Rules Validation Schema
 */
export const getRulesSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
});

/**
 * Kick Member Validation Schema
 */
export const kickMemberSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
  userId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required',
    }),
  reason: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Reason must not exceed 500 characters',
    }),
});

/**
 * Ban Member Validation Schema
 */
export const banMemberSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
  userId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required',
    }),
  reason: Joi.string()
    .trim()
    .min(10)
    .max(500)
    .required()
    .messages({
      'string.empty': 'Reason is required for banning',
      'string.min': 'Reason must be at least 10 characters',
      'string.max': 'Reason must not exceed 500 characters',
      'any.required': 'Reason is required',
    }),
  duration: Joi.number()
    .integer()
    .min(1)
    .optional()
    .messages({
      'number.base': 'Duration must be a number',
      'number.min': 'Duration must be at least 1 day',
    }),
});

/**
 * Unban Member Validation Schema
 */
export const unbanMemberSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
  userId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required',
    }),
});

/**
 * Warn Member Validation Schema
 */
export const warnMemberSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
  userId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required',
    }),
  message: Joi.string()
    .trim()
    .min(10)
    .max(500)
    .required()
    .messages({
      'string.empty': 'Warning message is required',
      'string.min': 'Warning message must be at least 10 characters',
      'string.max': 'Warning message must not exceed 500 characters',
      'any.required': 'Warning message is required',
    }),
});

/**
 * Assign Moderator Validation Schema
 */
export const assignModeratorSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
  userId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required',
    }),
});

/**
 * Remove Moderator Validation Schema
 */
export const removeModeratorSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
  userId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required',
    }),
});

/**
 * Report User Validation Schema
 */
export const reportUserSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
  reportedUserId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'Reported user ID is required',
    }),
  reason: Joi.string()
    .valid(
      'spam',
      'harassment',
      'inappropriate_content',
      'fake_profile',
      'other'
    )
    .required()
    .messages({
      'any.only': 'Invalid report reason',
      'any.required': 'Reason is required',
    }),
  description: Joi.string()
    .trim()
    .min(20)
    .max(1000)
    .required()
    .messages({
      'string.empty': 'Description is required',
      'string.min': 'Description must be at least 20 characters',
      'string.max': 'Description must not exceed 1000 characters',
      'any.required': 'Description is required',
    }),
});

/**
 * Report Message Validation Schema
 */
export const reportMessageSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
  messageId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid message ID format',
      'any.required': 'Message ID is required',
    }),
  reason: Joi.string()
    .valid(
      'spam',
      'harassment',
      'inappropriate_content',
      'misinformation',
      'other'
    )
    .required()
    .messages({
      'any.only': 'Invalid report reason',
      'any.required': 'Reason is required',
    }),
  description: Joi.string()
    .trim()
    .min(20)
    .max(1000)
    .required()
    .messages({
      'string.empty': 'Description is required',
      'string.min': 'Description must be at least 20 characters',
      'string.max': 'Description must not exceed 1000 characters',
      'any.required': 'Description is required',
    }),
});

/**
 * Get Reports Validation Schema
 */
export const getReportsSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
  status: Joi.string()
    .valid('pending', 'resolved', 'dismissed', 'all')
    .optional()
    .default('all')
    .messages({
      'any.only': 'Invalid status',
    }),
  type: Joi.string()
    .valid('user', 'message', 'all')
    .optional()
    .default('all')
    .messages({
      'any.only': 'Invalid report type',
    }),
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
    .default(20)
    .messages({
      'number.base': 'Limit must be a number',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit must not exceed 100',
    }),
});

export default {
  setRulesSchema,
  getRulesSchema,
  kickMemberSchema,
  banMemberSchema,
  unbanMemberSchema,
  warnMemberSchema,
  assignModeratorSchema,
  removeModeratorSchema,
  reportUserSchema,
  reportMessageSchema,
  getReportsSchema,
};