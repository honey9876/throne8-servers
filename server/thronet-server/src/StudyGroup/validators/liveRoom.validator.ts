/**
 * ====================================
 * LIVE ROOM VALIDATORS
 * ====================================
 * Joi validation schemas for live room requests
 */

import Joi from 'joi';

/**
 * Create Live Room Validation
 */
export const createLiveRoomSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
      'any.required': 'Group ID is required',
    }),
  title: Joi.string()
    .trim()
    .min(3)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Live room title is required',
      'string.min': 'Title must be at least 3 characters long',
      'string.max': 'Title cannot exceed 100 characters',
    }),
  description: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description cannot exceed 500 characters',
    }),
  maxParticipants: Joi.number()
    .integer()
    .min(2)
    .max(100)
    .optional()
    .default(50)
    .messages({
      'number.min': 'At least 2 participants required',
      'number.max': 'Maximum 100 participants allowed',
    }),
  settings: Joi.object({
    allowCamera: Joi.boolean().optional().default(true),
    allowMic: Joi.boolean().optional().default(true),
    allowScreenShare: Joi.boolean().optional().default(true),
    requireApproval: Joi.boolean().optional().default(false),
    muteOnEntry: Joi.boolean().optional().default(false),
  }).optional(),
});

/**
 * Update Live Room Validation
 */
export const updateLiveRoomSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(3)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Title must be at least 3 characters long',
      'string.max': 'Title cannot exceed 100 characters',
    }),
  description: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description cannot exceed 500 characters',
    }),
  maxParticipants: Joi.number()
    .integer()
    .min(2)
    .max(100)
    .optional()
    .messages({
      'number.min': 'At least 2 participants required',
      'number.max': 'Maximum 100 participants allowed',
    }),
  settings: Joi.object({
    allowCamera: Joi.boolean().optional(),
    allowMic: Joi.boolean().optional(),
    allowScreenShare: Joi.boolean().optional(),
    requireApproval: Joi.boolean().optional(),
    muteOnEntry: Joi.boolean().optional(),
  }).optional(),
}).min(1);

/**
 * Join Live Room Validation
 */
export const joinLiveRoomSchema = Joi.object({
  cameraOn: Joi.boolean().optional().default(false),
  micOn: Joi.boolean().optional().default(false),
});

/**
 * Toggle Camera Validation
 */
export const toggleCameraSchema = Joi.object({
  cameraOn: Joi.boolean().required().messages({
    'any.required': 'Camera status is required',
  }),
});

/**
 * Toggle Mic Validation
 */
export const toggleMicSchema = Joi.object({
  micOn: Joi.boolean().required().messages({
    'any.required': 'Microphone status is required',
  }),
});

/**
 * Toggle Screen Share Validation
 */
export const toggleScreenShareSchema = Joi.object({
  sharing: Joi.boolean().required().messages({
    'any.required': 'Screen sharing status is required',
  }),
});

/**
 * Live Room Query Filters Validation
 */
export const liveRoomQuerySchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.pattern.base': 'Invalid group ID format',
    }),
  isActive: Joi.boolean().optional(),
  host: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.pattern.base': 'Invalid host ID format',
    }),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(10),
});

/**
 * ObjectId Validation (for params)
 */
export const liveRoomIdSchema = Joi.object({
  roomId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.pattern.base': 'Invalid room ID format',
      'any.required': 'Room ID is required',
    }),
});

export default {
  createLiveRoomSchema,
  updateLiveRoomSchema,
  joinLiveRoomSchema,
  toggleCameraSchema,
  toggleMicSchema,
  toggleScreenShareSchema,
  liveRoomQuerySchema,
  liveRoomIdSchema,
};