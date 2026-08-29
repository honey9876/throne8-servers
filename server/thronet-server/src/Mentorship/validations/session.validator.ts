import Joi from 'joi';
import { SessionType } from '@/shared/constants/sessionTypes';
import { PaymentMethod } from '@/Mentorship/interface/session.types';

class SessionValidator {

  /**
   * ✅ Helper for UUID validation
   */
  private static isValidUUID(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  /**
   * Validate session creation
   */
  createSession = Joi.object({
    sessionType: Joi.string()
      .valid(...Object.values(SessionType))
      .required(),

    title: Joi.string().min(5).max(200).required(),

    description: Joi.string().max(1000).optional().allow(''),

    // Price per session (not per min/hr — simple rakhte hain)
    pricing: Joi.object({
      basePrice: Joi.number().min(0).required(),
      platformFee: Joi.number().min(0).default(0),
      totalAmount: Joi.number().min(0).required(),
      currency: Joi.string().default('INR'),
    }).required(),

    paymentMethod: Joi.string()
      .valid(...Object.values(PaymentMethod))
      .required(),

    duration: Joi.number().min(5).max(480).required(), // minutes

    // Schedule — mentor kis time available hai
    scheduledAt: Joi.date().iso().greater('now').required(),
    timezone: Joi.string().required(),

    // Follow-up settings
    followUp: Joi.object({
      allowed: Joi.boolean().default(false),
      periodDays: Joi.number().min(0).max(30).default(0),
    }).optional(),

    bufferTimeMinutes: Joi.number().min(0).max(60).default(0),
  });

  bookSession = Joi.object({
    sessionId: Joi.string().required(),          // ✅ NEW — kis session ko book karna hai
    mentorId: Joi.string().required(),
    availabilityId: Joi.string().required(),
    slotTime: Joi.string().required(),
    scheduledAt: Joi.date().iso().required(),
    timezone: Joi.string().required(),
    paymentMethod: Joi.string().valid(...Object.values(PaymentMethod)).required(),
    pricing: Joi.object({
      basePrice: Joi.number().min(0).required(),
      platformFee: Joi.number().min(0).required(),
      totalAmount: Joi.number().min(0).required(),
      currency: Joi.string().optional().default('INR'),
    }).required(),
  });

  /**
   * Validate session update
   */

  /**
 * Validation Update
 *
 * Replaced the previous permissive `.unknown(true)` approach with an explicit
 * optional schema for all supported update fields.
 *
 * Benefits:
 * - Maintains strict input validation.
 * - Prevents unexpected or arbitrary payload properties.
 * - Preserves backward compatibility for partial updates.
 * - Supports both JSON and multipart/form-data requests (provided
 *   parseFormDataFields executes before validation).
 *
 * Note:
 * Any new updatable field must be explicitly added here to keep the
 * validation layer secure and predictable.
 */

  updateSession = Joi.object({
    sessionType: Joi.string().valid(...Object.values(SessionType)).optional(),
    title: Joi.string().min(5).max(200).optional().messages({
      'string.min': 'Title must be at least 5 characters',
      'string.max': 'Title cannot exceed 200 characters',
    }),
    description: Joi.string().max(1000).optional().allow('').messages({
      'string.max': 'Description cannot exceed 1000 characters',
    }),
    pricing: Joi.object({
      basePrice: Joi.number().min(0).required(),
      platformFee: Joi.number().min(0).default(0),
      totalAmount: Joi.number().min(0).required(),
      currency: Joi.string().default('INR'),
    }).optional(),
    paymentMethod: Joi.string().valid(...Object.values(PaymentMethod)).optional(),
    duration: Joi.number().min(5).max(480).optional(),
    scheduledAt: Joi.date().iso().optional(),
    timezone: Joi.string().optional(),
    followUp: Joi.object({
      allowed: Joi.boolean().default(false),
      periodDays: Joi.number().min(0).max(30).default(0),
    }).optional(),
    bufferTimeMinutes: Joi.number().min(0).max(60).optional(),
    notes: Joi.string().max(2000).optional().allow('').messages({
      'string.max': 'Notes cannot exceed 2000 characters',
    }),
  });

  /**
   * Validate session completion
   */
  completeSession = Joi.object({
    actualDuration: Joi.number()
      .min(0)
      .optional()
      .messages({
        'number.min': 'Actual duration cannot be negative',
      }),

    wasSuccessful: Joi.boolean()
      .optional()
      .default(true),

    followUpRequired: Joi.boolean()
      .optional()
      .default(false),

    followUpNotes: Joi.string()
      .max(2000)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Follow-up notes cannot exceed 2000 characters',
      }),
  });

  /**
   * 🆕 PHASE 10: Validate session cancellation
   */
  cancelSession = Joi.object({
    reason: Joi.string()
      .min(10)
      .max(500)
      .required()
      .messages({
        'string.empty': 'Cancellation reason is required',
        'string.min': 'Reason must be at least 10 characters',
        'string.max': 'Reason cannot exceed 500 characters',
        'any.required': 'Cancellation reason is required',
      }),
    bookingId: Joi.string().required().messages({
      'any.required': 'bookingId is required to cancel a booking',
    }),
  });

  /**
   * 🆕 PHASE 10: Validate session rescheduling
   */
  rescheduleSession = Joi.object({
    newScheduledAt: Joi.date()
      .iso()
      .greater('now')
      .required()
      .messages({
        'date.base': 'Invalid scheduled date',
        'date.greater': 'New scheduled time must be in the future',
        'any.required': 'New scheduled time is required',
      }),

    reason: Joi.string()
      .min(3)
      .max(500)
      .optional()
      .allow('')
      .messages({
        'string.min': 'Reason must be at least 3 characters',
        'string.max': 'Reason cannot exceed 500 characters',
      }),
      
    bookingId: Joi.string().required().messages({
      'any.required': 'bookingId is required to reschedule a booking',
    }),
  });

  /**
   * Validate review submission
   */
  addReview = Joi.object({
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

    review: Joi.string()
      .min(20)
      .max(1000)
      .required()
      .messages({
        'string.empty': 'Review text is required',
        'string.min': 'Review must be at least 20 characters',
        'string.max': 'Review cannot exceed 1000 characters',
        'any.required': 'Review text is required',
      }),
  });

  /**
   * Validate query parameters for listing sessions
   */
  listSessions = Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .optional()
      .default(1)
      .messages({
        'number.min': 'Page must be at least 1',
      }),

    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .optional()
      .default(10)
      .messages({
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100',
      }),

    status: Joi.string()
      .optional()
      .allow(''),

    sessionType: Joi.string()
      .valid(...Object.values(SessionType))
      .optional()
      .messages({
        'any.only': 'Invalid session type',
      }),

    startDate: Joi.date()
      .iso()
      .optional()
      .messages({
        'date.base': 'Invalid start date',
      }),

    endDate: Joi.date()
      .iso()
      .greater(Joi.ref('startDate'))
      .optional()
      .messages({
        'date.base': 'Invalid end date',
        'date.greater': 'End date must be after start date',
      }),

    role: Joi.string()
      .valid('mentor', 'mentee')
      .optional()
      .default('mentee')
      .messages({
        'any.only': 'Role must be either mentor or mentee',
      }),
  });
}

export default new SessionValidator();