/**
 * ====================================
 * GROUP VALIDATORS
 * ====================================
 * Joi validation schemas for group operations
 */

import Joi from 'joi';
import { GroupCategory } from '../enums/GroupCategory.enum';
import { GroupVisibility } from '../enums/GroupVisibility.enum';
import { GROUP_CONSTANTS } from '../utils/constants';


// Validator bhi update karo — objectIdSchema hatao, UUID validate karo
export const groupIdSchema = Joi.string()
  .guid({ version: 'uuidv4' })
  .required()
  .messages({
    'string.guid': 'Invalid group ID format',
  });

/**
 * Create Group Validation Schema
 */
export const createGroupSchema = Joi.object({
  title: Joi.string()
    .min(GROUP_CONSTANTS.TITLE_MIN_LENGTH)
    .max(GROUP_CONSTANTS.TITLE_MAX_LENGTH)
    .required()
    .trim()
    .messages({
      'string.base': 'Title must be a string',
      'string.empty': 'Title is required',
      'string.min': `Title must be at least ${GROUP_CONSTANTS.TITLE_MIN_LENGTH} characters`,
      'string.max': `Title must not exceed ${GROUP_CONSTANTS.TITLE_MAX_LENGTH} characters`,
      'any.required': 'Title is required',
    }),

  description: Joi.string()
    .max(GROUP_CONSTANTS.DESCRIPTION_MAX_LENGTH)
    .trim()
    .allow('')
    .optional()
    .messages({
      'string.max': `Description must not exceed ${GROUP_CONSTANTS.DESCRIPTION_MAX_LENGTH} characters`,
    }),

  category: Joi.string()
    .valid(...Object.values(GroupCategory))
    .required()
    .messages({
      'any.only': 'Invalid group category',
      'any.required': 'Category is required',
    }),

  visibility: Joi.string()
    .valid(...Object.values(GroupVisibility))
    .optional()
    .messages({
      'any.only': 'Visibility must be either public or private',
    }),

  capacity: Joi.number()
    .integer()
    .min(GROUP_CONSTANTS.MIN_CAPACITY)
    .max(GROUP_CONSTANTS.MAX_CAPACITY)
    .optional()
    .messages({
      'number.base': 'Capacity must be a number',
      'number.min': `Capacity must be at least ${GROUP_CONSTANTS.MIN_CAPACITY}`,
      'number.max': `Capacity cannot exceed ${GROUP_CONSTANTS.MAX_CAPACITY}`,
    }),

  goalHours: Joi.number()
    .integer()
    .min(GROUP_CONSTANTS.GOAL_HOURS_MIN)
    .max(GROUP_CONSTANTS.GOAL_HOURS_MAX)
    .optional()
    .messages({
      'number.base': 'Goal hours must be a number',
      'number.min': `Goal hours must be at least ${GROUP_CONSTANTS.GOAL_HOURS_MIN}`,
      'number.max': `Goal hours cannot exceed ${GROUP_CONSTANTS.GOAL_HOURS_MAX}`,
    }),

  tags: Joi.array()
    .items(Joi.string().trim())
    .max(10)
    .optional()
    .messages({
      'array.max': 'Maximum 10 tags allowed',
    }),

  // In createGroupSchema, ADD these fields:
  cameraRequired: Joi.boolean().default(false),
  attendanceRequired: Joi.boolean().default(false),
  minAttendancePercent: Joi.when('attendanceRequired', {
    is: true,
    then: Joi.number().integer().min(50).max(100).required()
      .messages({ 'any.required': 'Minimum attendance % is required when attendance is required' }),
    otherwise: Joi.number().integer().min(50).max(100).optional().allow(null),
  })
});

/**
 * Update Group Validation Schema
 */
export const updateGroupSchema = Joi.object({
  title: Joi.string()
    .min(GROUP_CONSTANTS.TITLE_MIN_LENGTH)
    .max(GROUP_CONSTANTS.TITLE_MAX_LENGTH)
    .trim()
    .optional()
    .messages({
      'string.min': `Title must be at least ${GROUP_CONSTANTS.TITLE_MIN_LENGTH} characters`,
      'string.max': `Title must not exceed ${GROUP_CONSTANTS.TITLE_MAX_LENGTH} characters`,
    }),

  description: Joi.string()
    .max(GROUP_CONSTANTS.DESCRIPTION_MAX_LENGTH)
    .trim()
    .allow('')
    .optional()
    .messages({
      'string.max': `Description must not exceed ${GROUP_CONSTANTS.DESCRIPTION_MAX_LENGTH} characters`,
    }),

  category: Joi.string()
    .valid(...Object.values(GroupCategory))
    .optional()
    .messages({
      'any.only': 'Invalid group category',
    }),

  visibility: Joi.string()
    .valid(...Object.values(GroupVisibility))
    .optional()
    .messages({
      'any.only': 'Visibility must be either public or private',
    }),

  capacity: Joi.number()
    .integer()
    .min(GROUP_CONSTANTS.MIN_CAPACITY)
    .max(GROUP_CONSTANTS.MAX_CAPACITY)
    .optional()
    .messages({
      'number.min': `Capacity must be at least ${GROUP_CONSTANTS.MIN_CAPACITY}`,
      'number.max': `Capacity cannot exceed ${GROUP_CONSTANTS.MAX_CAPACITY}`,
    }),

  goalHours: Joi.number()
    .integer()
    .min(GROUP_CONSTANTS.GOAL_HOURS_MIN)
    .max(GROUP_CONSTANTS.GOAL_HOURS_MAX)
    .optional()
    .messages({
      'number.min': `Goal hours must be at least ${GROUP_CONSTANTS.GOAL_HOURS_MIN}`,
      'number.max': `Goal hours cannot exceed ${GROUP_CONSTANTS.GOAL_HOURS_MAX}`,
    }),

  tags: Joi.array()
    .items(Joi.string().trim())
    .max(10)
    .optional()
    .messages({
      'array.max': 'Maximum 10 tags allowed',
    }),

  avatar: Joi.string().uri().optional().allow('', null),

  coverImage: Joi.string().uri().optional().allow('', null),

  cameraRequired: Joi.boolean().optional(),
  attendanceRequired: Joi.boolean().optional(),
  minAttendancePercent: Joi.when('attendanceRequired', {
    is: true,
    then: Joi.number().integer().min(50).max(100).required(),
    otherwise: Joi.number().integer().min(50).max(100).optional().allow(null),
  }),
}).min(1);

/**
 * Join Group Validation Schema
 */
export const joinGroupSchema = Joi.object({
  joinCode: Joi.string()
    .length(8)
    .uppercase()
    .optional()
    .messages({
      'string.length': 'Join code must be 8 characters',
      'string.uppercase': 'Join code must be uppercase',
    }),
});

/**
 * Group List Query Validation Schema
 */
export const groupListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),

  limit: Joi.number().integer().min(1).max(100).optional().default(10),

  category: Joi.string()
    .valid(...Object.values(GroupCategory))
    .optional(),

  visibility: Joi.string()
    .valid(...Object.values(GroupVisibility))
    .optional(),

  search: Joi.string().trim().min(2).max(100).optional(),

  sortBy: Joi.string()
    .valid('createdAt', 'memberCount', 'title')
    .optional()
    .default('createdAt'),

  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .optional()
    .default('desc'),
});

/**
 * MongoDB ObjectId Validation
 */
export const objectIdSchema = Joi.string()
  .uuid()
  .required()
  .messages({
    'string.pattern.base': 'Invalid ID format',
    'any.required': 'ID is required',
  });

export default {
  createGroupSchema,
  updateGroupSchema,
  joinGroupSchema,
  groupListQuerySchema,
  objectIdSchema,
};