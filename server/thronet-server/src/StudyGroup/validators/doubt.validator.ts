/**
 * ====================================
 * DOUBT VALIDATORS (PRODUCTION READY)
 * ====================================
 * Comprehensive validation for all doubt operations
 */

import Joi from 'joi';

/**
 * Create Doubt Validation Schema
 */
export const createDoubtSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(5)
    .max(200)
    .required()
    .messages({
      'string.empty': 'Question title is required',
      'string.min': 'Title must be at least 5 characters',
      'string.max': 'Title must not exceed 200 characters',
      'any.required': 'Title is required',
    }),

  description: Joi.string()
    .trim()
    .max(2000)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description must not exceed 2000 characters',
    }),

  category: Joi.string()
    .valid(
      'Mathematics',
      'Physics',
      'Chemistry',
      'Biology',
      'Computer Science',
      'English',
      'Hindi',
      'Social Science',
      'General Knowledge',
      'Aptitude',
      'Reasoning',
      'Current Affairs',
      'Programming',
      'Data Structures',
      'Algorithms',
      'Web Development',
      'Mobile Development',
      'Machine Learning',
      'Artificial Intelligence',
      'Database',
      'Networking',
      'Operating System',
      'Other'
    )
    .optional()
    .default('Other')
    .messages({
      'any.only': 'Invalid category selected',
    }),

  subject: Joi.string()
    .trim()
    .max(50)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Subject must not exceed 50 characters',
    }),

  tags: Joi.array()
    .items(Joi.string().trim().max(30))
    .max(10)
    .optional()
    .messages({
      'array.max': 'Cannot add more than 10 tags',
    }),

  isUrgent: Joi.boolean().optional().default(false),

  difficulty: Joi.string()
    .valid('Easy', 'Medium', 'Hard', 'Expert')
    .optional()
    .default('Medium')
    .messages({
      'any.only': 'Difficulty must be Easy, Medium, Hard, or Expert',
    }),

  taggedMembers: Joi.array()
    .items(Joi.string().uuid())
    .max(10)
    .optional()
    .messages({
      'array.max': 'Cannot tag more than 10 members',
      'string.pattern.base': 'Invalid user ID format',
    }),
});

/**
 * Update Doubt Validation Schema
 */
export const updateDoubtSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(5)
    .max(200)
    .optional()
    .messages({
      'string.min': 'Title must be at least 5 characters',
      'string.max': 'Title must not exceed 200 characters',
    }),

  description: Joi.string()
    .trim()
    .max(2000)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description must not exceed 2000 characters',
    }),

  category: Joi.string()
    .valid(
      'Mathematics',
      'Physics',
      'Chemistry',
      'Biology',
      'Computer Science',
      'English',
      'Other'
    )
    .optional(),

  subject: Joi.string().trim().max(50).optional().allow(''),

  tags: Joi.array().items(Joi.string().trim().max(30)).max(10).optional(),

  isUrgent: Joi.boolean().optional(),

  difficulty: Joi.string().valid('Easy', 'Medium', 'Hard', 'Expert').optional(),
}).min(1);

/**
 * Answer Doubt Validation Schema
 */
export const answerDoubtSchema = Joi.object({
  content: Joi.string()
    .trim()
    .min(10)
    .max(5000)
    .required()
    .messages({
      'string.empty': 'Answer content is required',
      'string.min': 'Answer must be at least 10 characters',
      'string.max': 'Answer must not exceed 5000 characters',
      'any.required': 'Answer content is required',
    }),

  links: Joi.array()
    .items(
      Joi.object({
        url: Joi.string()
          .uri()
          .required()
          .messages({
            'string.uri': 'Please provide a valid URL',
            'any.required': 'Link URL is required',
          }),
        title: Joi.string().trim().max(100).optional(),
      })
    )
    .max(5)
    .optional()
    .messages({
      'array.max': 'Cannot add more than 5 reference links',
    }),
});

/**
 * Update Answer Validation Schema
 */
export const updateAnswerSchema = Joi.object({
  content: Joi.string()
    .trim()
    .min(10)
    .max(5000)
    .required()
    .messages({
      'string.empty': 'Answer content is required',
      'string.min': 'Answer must be at least 10 characters',
      'string.max': 'Answer must not exceed 5000 characters',
    }),

  links: Joi.array()
    .items(
      Joi.object({
        url: Joi.string().uri().required(),
        title: Joi.string().trim().max(100).optional(),
      })
    )
    .max(5)
    .optional(),
});

/**
 * Tag Members Validation Schema
 */
export const tagMembersSchema = Joi.object({
  memberIds: Joi.array()
    .items(Joi.string().uuid())
    .min(1)
    .max(10)
    .required()
    .messages({
      'array.min': 'At least one member must be tagged',
      'array.max': 'Cannot tag more than 10 members',
      'any.required': 'Member IDs are required',
      'string.pattern.base': 'Invalid member ID format',
    }),
});

/**
 * Search/Filter Doubts Validation Schema
 */
export const searchDoubtsSchema = Joi.object({
  query: Joi.string().trim().max(100).optional(),
  category: Joi.string().optional(),
  isSolved: Joi.boolean().optional(),
  isUrgent: Joi.boolean().optional(),
  difficulty: Joi.string().valid('Easy', 'Medium', 'Hard', 'Expert').optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
  sort: Joi.string()
    .valid('recent', 'oldest', 'mostAnswered', 'mostViewed', 'urgent')
    .optional()
    .default('recent'),
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
  createDoubtSchema,
  updateDoubtSchema,
  answerDoubtSchema,
  updateAnswerSchema,
  tagMembersSchema,
  searchDoubtsSchema,
  objectIdSchema,
};