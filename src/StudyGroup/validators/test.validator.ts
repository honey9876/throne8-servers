// src/validators/test.validator.ts

import Joi from 'joi';

/**
 * Create Test Validation
 */
export const createTestSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .required()
    .messages({
      'string.empty': 'Test title is required',
      'string.min': 'Title must be at least 3 characters',
      'string.max': 'Title cannot exceed 200 characters',
    }),

  description: Joi.string()
    .trim()
    .max(1000)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description cannot exceed 1000 characters',
    }),

  groupId: Joi.string()
    .trim()
    .required()
    .messages({
      'string.empty': 'Group ID is required',
    }),

  totalMarks: Joi.number()
    .integer()
    .min(1)
    .required()
    .messages({
      'number.base': 'Total marks must be a number',
      'number.min': 'Total marks must be at least 1',
    }),

  passingMarks: Joi.number()
    .integer()
    .min(0)
    .max(Joi.ref('totalMarks'))
    .required()
    .messages({
      'number.base': 'Passing marks must be a number',
      'number.min': 'Passing marks cannot be negative',
      'number.max': 'Passing marks cannot exceed total marks',
    }),

  duration: Joi.number()
    .integer()
    .min(5)
    .max(300)
    .required()
    .messages({
      'number.base': 'Duration must be a number',
      'number.min': 'Duration must be at least 5 minutes',
      'number.max': 'Duration cannot exceed 300 minutes',
    }),

  scheduledStartTime: Joi.date()
    .optional()
    .allow(null),

  scheduledEndTime: Joi.date()
    .optional()
    .allow(null)
    .when('scheduledStartTime', {
      is: Joi.exist(),
      then: Joi.date().greater(Joi.ref('scheduledStartTime')),
    })
    .messages({
      'date.greater': 'End time must be after start time',
    }),

  testType: Joi.string()
    .valid('practice', 'mock', 'assignment')
    .default('practice')
    .messages({
      'any.only': 'Test type must be practice, mock, or assignment',
    }),

  settings: Joi.object({
    shuffleQuestions: Joi.boolean().default(false),
    showAnswersAfterSubmit: Joi.boolean().default(true),
    allowReAttempt: Joi.boolean().default(false),
    maxAttempts: Joi.number().integer().min(1).max(10).default(1),
    negativeMarking: Joi.boolean().default(false),
    negativeMarksPerQuestion: Joi.number().min(0).max(10).optional(),
  }).optional(),

  subject: Joi.string().trim().max(100).optional().allow(''),

  topics: Joi.array()
    .items(Joi.string().trim().max(100))
    .max(10)
    .optional(),
});

/**
 * Update Test Validation
 */
export const updateTestSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).optional(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  totalMarks: Joi.number().integer().min(1).optional(),
  passingMarks: Joi.number().integer().min(0).optional(),
  duration: Joi.number().integer().min(5).max(300).optional(),
  scheduledStartTime: Joi.date().optional().allow(null),
  scheduledEndTime: Joi.date().optional().allow(null),
  testType: Joi.string().valid('practice', 'mock', 'assignment').optional(),
  settings: Joi.object({
    shuffleQuestions: Joi.boolean().optional(),
    showAnswersAfterSubmit: Joi.boolean().optional(),
    allowReAttempt: Joi.boolean().optional(),
    maxAttempts: Joi.number().integer().min(1).max(10).optional(),
    negativeMarking: Joi.boolean().optional(),
    negativeMarksPerQuestion: Joi.number().min(0).max(10).optional(),
  }).optional(),
  subject: Joi.string().trim().max(100).optional().allow(''),
  topics: Joi.array().items(Joi.string().trim().max(100)).max(10).optional(),
  isActive: Joi.boolean().optional(),
  isPublished: Joi.boolean().optional(),
});

/**
 * Add Question to Test Validation
 */
export const addQuestionSchema = Joi.object({
  questionText: Joi.string()
    .trim()
    .min(10)
    .max(2000)
    .required()
    .messages({
      'string.empty': 'Question text is required',
      'string.min': 'Question must be at least 10 characters',
      'string.max': 'Question cannot exceed 2000 characters',
    }),

  questionType: Joi.string()
    .valid('mcq', 'true-false', 'short-answer', 'long-answer')
    .required()
    .messages({
      'any.only': 'Invalid question type',
    }),

  options: Joi.array()
    .items(Joi.string().trim())
    .when('questionType', {
      is: 'mcq',
      then: Joi.array().min(2).max(6).required(),
      otherwise: Joi.when('questionType', {
        is: 'true-false',
        then: Joi.array().length(2).required(),
        otherwise: Joi.forbidden(),
      }),
    })
    .messages({
      'array.min': 'MCQ must have at least 2 options',
      'array.max': 'MCQ cannot have more than 6 options',
      'array.length': 'True/False must have exactly 2 options',
    }),

  correctAnswer: Joi.alternatives()
    .try(
      Joi.string(),
      Joi.array().items(Joi.string())
    )
    .when('questionType', {
      is: Joi.string().valid('mcq', 'true-false'),
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),

  maxWords: Joi.number()
    .integer()
    .min(10)
    .max(1000)
    .optional(),

  sampleAnswer: Joi.string()
    .trim()
    .max(5000)
    .optional()
    .allow(''),

  marks: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .required()
    .messages({
      'number.base': 'Marks must be a number',
      'number.min': 'Marks must be at least 1',
      'number.max': 'Marks cannot exceed 100',
    }),

  difficulty: Joi.string()
    .valid('easy', 'medium', 'hard')
    .default('medium'),

  subject: Joi.string().trim().max(100).optional().allow(''),
  topic: Joi.string().trim().max(100).optional().allow(''),
  
  explanation: Joi.string()
    .trim()
    .max(1000)
    .optional()
    .allow(''),

  imageUrl: Joi.string().uri().optional().allow(''),
  
  order: Joi.number()
    .integer()
    .min(1)
    .required()
    .messages({
      'number.min': 'Order must be at least 1',
    }),
});

/**
 * Submit Test Attempt Validation
 */
export const submitTestSchema = Joi.object({
  answers: Joi.array()
    .items(
      Joi.object({
        questionId: Joi.string().required(),
        answer: Joi.alternatives().try(
          Joi.string(),
          Joi.array().items(Joi.string())
        ).required(),
        timeSpent: Joi.number().integer().min(0).optional(), // seconds
      })
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one answer is required',
    }),

  timeTaken: Joi.number()
    .integer()
    .min(0)
    .required()
    .messages({
      'number.min': 'Time taken cannot be negative',
    }),
});

/**
 * Test List Query Validation
 */
export const testListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  groupId: Joi.string().optional(),
  testType: Joi.string().valid('practice', 'mock', 'assignment').optional(),
  isPublished: Joi.boolean().optional(),
  subject: Joi.string().trim().optional(),
  sortBy: Joi.string().valid('createdAt', 'title', 'scheduledStartTime').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});