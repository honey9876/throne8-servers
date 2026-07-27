import Joi from 'joi';

class QueryValidator {
  /**
   * Validate query submission
   */
  submitQuery = Joi.object({
    mentorId: Joi.string()
      .required()
      .messages({
        'string.empty': 'Mentor ID is required',
        'any.required': 'Mentor ID is required',
      }),

    question: Joi.string()
      .min(20)
      .max(500)
      .required()
      .messages({
        'string.empty': 'Question is required',
        'string.min': 'Question must be at least 20 characters',
        'string.max': 'Question cannot exceed 500 characters',
        'any.required': 'Question is required',
      }),

    context: Joi.string()
      .max(1000)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Context cannot exceed 1000 characters',
      }),

    attachments: Joi.array()
      .items(Joi.string().uri())
      .max(5)
      .optional()
      .messages({
        'array.max': 'Maximum 5 attachments allowed',
      }),

    category: Joi.string()
      .max(50)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Category cannot exceed 50 characters',
      }),

    priority: Joi.string()
      .valid('normal', 'high')
      .optional()
      .default('normal')
      .messages({
        'any.only': 'Priority must be either normal or high',
      }),

    transactionId: Joi.string()
      .optional()
      .messages({
        'string.empty': 'Transaction ID cannot be empty',
      }),
  });

  /**
   * Validate query answer
   */
  answerQuery = Joi.object({
    answer: Joi.string()
      .min(50)
      .max(5000)
      .required()
      .messages({
        'string.empty': 'Answer is required',
        'string.min': 'Answer must be at least 50 characters',
        'string.max': 'Answer cannot exceed 5000 characters',
        'any.required': 'Answer is required',
      }),
  });

  /**
   * Validate follow-up question submission
   */
  submitFollowUp = Joi.object({
    question: Joi.string()
      .min(10)
      .max(300)
      .required()
      .messages({
        'string.empty': 'Follow-up question is required',
        'string.min': 'Follow-up question must be at least 10 characters',
        'string.max': 'Follow-up question cannot exceed 300 characters',
        'any.required': 'Follow-up question is required',
      }),
  });

  /**
   * Validate follow-up answer
   */
  answerFollowUp = Joi.object({
    answer: Joi.string()
      .min(20)
      .max(3000)
      .required()
      .messages({
        'string.empty': 'Answer is required',
        'string.min': 'Answer must be at least 20 characters',
        'string.max': 'Answer cannot exceed 3000 characters',
        'any.required': 'Answer is required',
      }),
  });

  /**
   * Validate feedback submission
   */
  addFeedback = Joi.object({
    rating: Joi.number()
      .integer()
      .min(1)
      .max(5)
      .required()
      .messages({
        'number.base': 'Rating must be a number',
        'number.min': 'Rating must be at least 1',
        'number.max': 'Rating cannot exceed 5',
        'any.required': 'Rating is required',
      }),

    comment: Joi.string()
      .max(500)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Comment cannot exceed 500 characters',
      }),
  });

  /**
   * Validate query listing parameters
   */
listQueries = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(10),
  status: Joi.string().valid('pending', 'answered', 'expired').optional().allow(''),
  role: Joi.string().valid('mentor', 'mentee').optional().default('mentee'),
}).options({ convert: true });  // ← yahan add karo — puri object pe apply hoga
}

export default new QueryValidator();