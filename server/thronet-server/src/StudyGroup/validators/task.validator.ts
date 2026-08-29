/**
 * ====================================
 * TASK VALIDATOR
 * ====================================
 * Validation schemas for task operations
 */

import Joi from 'joi';
import { TaskStatus } from '../enums/TaskStatus.enum';
import { TaskPriority } from '../enums/TaskPriority.enum';

// taskIdSchema — ObjectId pattern hatao, UUID validate karo
export const taskIdSchema = Joi.object({
  taskId: Joi.string()
    .guid({ version: 'uuidv4' })  // was: /^[0-9a-fA-F]{24}$/
    .required()
    .messages({
      'string.guid': 'Invalid task ID format',
      'string.empty': 'Task ID is required',
    }),
});

/**
 * Create Task Validation Schema
 */
export const createTaskSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(200)
    .trim()
    .required()
    .messages({
      'string.empty': 'Task title is required',
      'string.min': 'Title must be at least 3 characters',
      'string.max': 'Title must not exceed 200 characters',
    }),

  groupId: Joi.string()
    .uuid()
    .optional()
    .allow(null, ''),

  description: Joi.string()
    .max(1000)
    .trim()
    .allow(null, '')
    .optional()
    .messages({
      'string.max': 'Description must not exceed 1000 characters',
    }),

  priority: Joi.string()
    .valid(...Object.values(TaskPriority))
    .optional()
    .messages({
      'any.only': 'Invalid priority value',
    }),

  deadline: Joi.date()
    .iso()
    .min('now')
    .allow(null)
    .optional()
    .messages({
      'date.base': 'Invalid deadline format',
      'date.min': 'Deadline must be in the future',
    }),

  tags: Joi.array()
    .items(Joi.string().trim())
    .max(10)
    .optional()
    .messages({
      'array.max': 'Maximum 10 tags allowed',
    }),

  reminderAt: Joi.date()
    .iso()
    .min('now')
    .allow(null)
    .optional()
    .messages({
      'date.base': 'Invalid reminder time format',
      'date.min': 'Reminder time must be in the future',
    }),
});

/**
 * Update Task Validation Schema
 */
export const updateTaskSchema = Joi.object({
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

  status: Joi.string()
    .valid(...Object.values(TaskStatus))
    .optional()
    .messages({
      'any.only': 'Invalid status value',
    }),

  priority: Joi.string()
    .valid(...Object.values(TaskPriority))
    .optional()
    .messages({
      'any.only': 'Invalid priority value',
    }),

  deadline: Joi.date()
    .iso()
    .allow(null)
    .optional()
    .messages({
      'date.base': 'Invalid deadline format',
    }),

  tags: Joi.array()
    .items(Joi.string().trim())
    .max(10)
    .optional()
    .messages({
      'array.max': 'Maximum 10 tags allowed',
    }),

  reminderAt: Joi.date()
    .iso()
    .allow(null)
    .optional()
    .messages({
      'date.base': 'Invalid reminder time format',
    }),
}).min(1).messages({
  'object.min': 'At least one field is required for update',
});

// /**
//  * Task ID Validation Schema
//  */
// export const taskIdSchema = Joi.object({
//   taskId: Joi.string()
//     .pattern(/^[0-9a-fA-F]{24}$/)
//     .required()
//     .messages({
//       'string.pattern.base': 'Invalid task ID format',
//       'string.empty': 'Task ID is required',
//     }),
// });

/**
 * Task Query Validation Schema
 */
export const taskQuerySchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(TaskStatus))
    .optional(),

  priority: Joi.string()
    .valid(...Object.values(TaskPriority))
    .optional(),

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
    .valid('createdAt', 'updatedAt', 'deadline', 'priority', 'title')
    .default('createdAt')
    .optional(),

  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .optional(),
});

export default {
  createTaskSchema,
  updateTaskSchema,
  taskIdSchema,
  taskQuerySchema,
};