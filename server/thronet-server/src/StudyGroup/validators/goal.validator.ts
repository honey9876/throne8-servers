/**
 * ====================================
 * GOAL VALIDATOR
 * ====================================
 * Validation schemas for goal operations
 */

import Joi from 'joi';



/**
 * Create Goal Validation Schema
 */
export const createGoalSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(200)
    .trim()
    .required()
    .messages({
      'string.empty': 'Goal title is required',
      'string.min': 'Title must be at least 3 characters',
      'string.max': 'Title must not exceed 200 characters',
    }),

  description: Joi.string()
    .max(1000)
    .trim()
    .allow(null, '')
    .optional()
    .messages({
      'string.max': 'Description must not exceed 1000 characters',
    }),

  targetHours: Joi.number()
    .min(1)
    .max(10000)
    .required()
    .messages({
      'number.base': 'Target hours must be a number',
      'number.min': 'Target hours must be at least 1',
      'number.max': 'Target hours must not exceed 10000',
      'any.required': 'Target hours is required',
    }),

  startDate: Joi.date()
    .iso()
    .required()
    .messages({
      'date.base': 'Invalid start date format',
      'any.required': 'Start date is required',
    }),

  endDate: Joi.date()
    .iso()
    .greater(Joi.ref('startDate'))
    .required()
    .messages({
      'date.base': 'Invalid end date format',
      'date.greater': 'End date must be after start date',
      'any.required': 'End date is required',
    }),

  category: Joi.string()
    .max(50)
    .trim()
    .allow(null, '')
    .optional()
    .messages({
      'string.max': 'Category must not exceed 50 characters',
    }),

  tags: Joi.array()
    .items(Joi.string().trim())
    .max(10)
    .optional()
    .messages({
      'array.max': 'Maximum 10 tags allowed',
    }),
});

/**
 * Update Goal Validation Schema
 */
export const updateGoalSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(200)
    .trim()
    .optional()
    .messages({
      'string.min': 'Title must be at least 3 characters',
      'string.max': 'Title must not exceed 200 characters',
    }),

  description: Joi.string()
    .max(1000)
    .trim()
    .allow(null, '')
    .optional()
    .messages({
      'string.max': 'Description must not exceed 1000 characters',
    }),

  targetHours: Joi.number()
    .min(1)
    .max(10000)
    .optional()
    .messages({
      'number.min': 'Target hours must be at least 1',
      'number.max': 'Target hours must not exceed 10000',
    }),

  currentHours: Joi.number()
    .min(0)
    .optional()
    .messages({
      'number.min': 'Current hours cannot be negative',
    }),

  startDate: Joi.date()
    .iso()
    .optional()
    .messages({
      'date.base': 'Invalid start date format',
    }),

  endDate: Joi.date()
    .iso()
    .when('startDate', {
      is: Joi.exist(),
      then: Joi.date().greater(Joi.ref('startDate')),
      otherwise: Joi.date(),
    })
    .optional()
    .messages({
      'date.base': 'Invalid end date format',
      'date.greater': 'End date must be after start date',
    }),

  category: Joi.string()
    .max(50)
    .trim()
    .allow(null, '')
    .optional()
    .messages({
      'string.max': 'Category must not exceed 50 characters',
    }),

  tags: Joi.array()
    .items(Joi.string().trim())
    .max(10)
    .optional()
    .messages({
      'array.max': 'Maximum 10 tags allowed',
    }),
}).min(1).messages({
  'object.min': 'At least one field is required for update',
});

/**
 * Goal ID Validation Schema
 */
export const goalIdSchema = Joi.object({
  goalId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid goal ID format',
      'string.empty': 'Goal ID is required',
    }),
});

/**
 * Update Goal Progress Validation Schema
 */
export const updateGoalProgressSchema = Joi.object({
  hoursToAdd: Joi.number()
    .min(-10000)
    .max(10000)
    .required()
    .messages({
      'number.base': 'Hours to add must be a number',
      'number.min': 'Hours to add must not be less than -10000',
      'number.max': 'Hours to add must not exceed 10000',
      'any.required': 'Hours to add is required',
    }),
});

/**
 * Goal Query Validation Schema
 */
export const goalQuerySchema = Joi.object({
  completed: Joi.boolean()
    .optional(),

  startDate: Joi.date()
    .iso()
    .optional(),

  endDate: Joi.date()
    .iso()
    .when('startDate', {
      is: Joi.exist(),
      then: Joi.date().min(Joi.ref('startDate')),
      otherwise: Joi.date(),
    })
    .optional()
    .messages({
      'date.min': 'End date must be after start date',
    }),

  category: Joi.string()
    .max(50)
    .trim()
    .optional(),

  tags: Joi.alternatives()
    .try(
      Joi.string(),
      Joi.array().items(Joi.string())
    )
    .optional(),

  search: Joi.string()
    .max(100)
    .trim()
    .optional(),

  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .optional(),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .optional(),

  sortBy: Joi.string()
    .valid('createdAt', 'updatedAt', 'endDate', 'targetHours', 'title')
    .default('createdAt')
    .optional(),

  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .optional(),
});

export default {
  createGoalSchema,
  updateGoalSchema,
  goalIdSchema,
  updateGoalProgressSchema,
  goalQuerySchema,
};