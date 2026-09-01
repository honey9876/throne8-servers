// src/validators/assignment.validator.ts

import Joi from 'joi';

/**
 * Create Assignment Validation
 */
export const createAssignmentSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .required()
    .messages({
      'string.empty': 'Assignment title is required',
      'string.min': 'Title must be at least 3 characters',
      'string.max': 'Title cannot exceed 200 characters',
    }),

  description: Joi.string()
    .trim()
    .max(2000)
    .required()
    .messages({
      'string.empty': 'Description is required',
      'string.max': 'Description cannot exceed 2000 characters',
    }),

  instructions: Joi.string()
    .trim()
    .max(1000)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Instructions cannot exceed 1000 characters',
    }),

  groupId: Joi.string()
  .uuid()
    .trim()
    .required()
    .messages({
      'string.empty': 'Group ID is required',
    }),

  assignmentType: Joi.string()
    .valid('homework', 'project', 'lab', 'reading')
    .default('homework')
    .messages({
      'any.only': 'Invalid assignment type',
    }),

  subject: Joi.string()
    .trim()
    .max(100)
    .optional()
    .allow(''),

  topics: Joi.array()
    .items(Joi.string().trim().max(100))
    .max(10)
    .optional(),

  totalMarks: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .required()
    .messages({
      'number.base': 'Total marks must be a number',
      'number.min': 'Total marks must be at least 1',
      'number.max': 'Total marks cannot exceed 100',
    }),

  dueDate: Joi.date()
    .greater('now')
    .required()
    .messages({
      'date.base': 'Due date must be a valid date',
      'date.greater': 'Due date must be in the future',
    }),

  lateSubmissionAllowed: Joi.boolean().default(false),

  latePenalty: Joi.number()
    .min(0)
    .max(100)
    .optional()
    .messages({
      'number.min': 'Late penalty cannot be negative',
      'number.max': 'Late penalty cannot exceed 100%',
    }),
});

/**
 * Update Assignment Validation
 */
export const updateAssignmentSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).optional(),
  description: Joi.string().trim().max(2000).optional(),
  instructions: Joi.string().trim().max(1000).optional().allow(''),
  totalMarks: Joi.number().integer().min(1).max(100).optional(),
  dueDate: Joi.date().greater('now').optional(),
  lateSubmissionAllowed: Joi.boolean().optional(),
  latePenalty: Joi.number().min(0).max(100).optional(),
  isActive: Joi.boolean().optional(),
});

/**
 * Submit Assignment Validation
 */
export const submitAssignmentSchema = Joi.object({
  submissionText: Joi.string()
    .trim()
    .max(5000)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Submission text cannot exceed 5000 characters',
    }),
});

/**
 * Grade Assignment Validation
 */
export const gradeAssignmentSchema = Joi.object({
  marksObtained: Joi.number()
    .min(0)
    .required()
    .messages({
      'number.base': 'Marks must be a number',
      'number.min': 'Marks cannot be negative',
    }),

  feedback: Joi.string()
    .trim()
    .max(1000)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Feedback cannot exceed 1000 characters',
    }),
});

/**
 * Assignment List Query Validation
 */
export const assignmentListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  groupId: Joi.string().uuid().optional(),
  status: Joi.string().valid('active', 'completed', 'overdue').optional(),
  assignmentType: Joi.string().valid('homework', 'project', 'lab', 'reading').optional(),
  subject: Joi.string().trim().optional(),
  sortBy: Joi.string().valid('dueDate', 'createdAt', 'title').default('dueDate'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});