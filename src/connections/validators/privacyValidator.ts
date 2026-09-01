// src/validators/privacyValidator.ts

import Joi from 'joi';

export const privacyValidationSchemas = {
  updatePrivacySettings: Joi.object({
    visibility: Joi.string().valid('public', 'private', 'connections').optional(),
    profileVisibility: Joi.string().valid('public', 'private', 'connections').optional(),
    viewersVisible: Joi.boolean().optional(),
    allowMessagesFrom: Joi.string().valid('everyone', 'connections', 'nobody').optional(),
    showActivityStatus: Joi.boolean().optional(),
    showConnectionList: Joi.boolean().optional(),
    searchable: Joi.boolean().optional(),
    allowTagging: Joi.boolean().optional(),
    dataSharing: Joi.boolean().optional(),
    dataRetentionDays: Joi.number().min(30).max(365).optional()
  }).min(1),

  setVisibility: Joi.object({
    visibility: Joi.string().valid('public', 'private', 'connections').required()
  }),

  blockUser: Joi.object({
    blockedId: Joi.string()
      .required()
      .regex(/^[0-9a-fA-F]{24}$/)
      .messages({
        'string.pattern.base': 'Invalid user ID format'
      })
  }),

  setConnectionVisibility: Joi.object({
    connectionId: Joi.string()
      .required()
      .regex(/^[0-9a-fA-F]{24}$/)
      .messages({
        'string.pattern.base': 'Invalid connection ID format'
      }),
    visibility: Joi.string().valid('public', 'private', 'connections').required()
  }),

  setViewersVisibility: Joi.object({
    visible: Joi.boolean().required()
  }),

  batchUpdate: Joi.object({
    userIds: Joi.array()
      .items(Joi.string().regex(/^[0-9a-fA-F]{24}$/))
      .min(1)
      .max(1000)
      .required()
      .messages({
        'array.max': 'Maximum 1000 users per batch'
      }),
    settings: Joi.object().required()
  }),

  importData: Joi.object({
    data: Joi.string().required()
  })
};

export default privacyValidationSchemas;