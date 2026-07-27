/**
 * ====================================
 * CHAT VALIDATOR
 * ====================================
 * Validation schemas for chat operations
 */

import Joi from 'joi';
import { MessageType } from '../enums/MessageType.enum';

/**
 * Send Message Validation
 */
export const sendMessageSchema = Joi.object({
  content: Joi.string()
    .required()
    .min(1)
    .max(2000)
    .trim()
    .messages({
      'string.empty': 'Message content cannot be empty',
      'string.min': 'Message must be at least 1 character',
      'string.max': 'Message cannot exceed 2000 characters',
      'any.required': 'Message content is required',
    }),
  messageType: Joi.string()
    .valid(...Object.values(MessageType))
    .default(MessageType.TEXT)
    .messages({
      'any.only': 'Invalid message type',
    }),
  fileUrl: Joi.string().uri().allow(null, '').messages({
    'string.uri': 'File URL must be a valid URI',
  }),
  fileName: Joi.string().max(255).allow(null, '').messages({
    'string.max': 'File name cannot exceed 255 characters',
  }),
  fileSize: Joi.number().positive().allow(null).messages({
    'number.positive': 'File size must be a positive number',
  }),
  replyTo: Joi.string().uuid().allow(null, '').messages({
    'string.pattern.base': 'Invalid reply message ID',
  }),
});

/**
 * Edit Message Validation
 */
export const editMessageSchema = Joi.object({
  content: Joi.string()
    .required()
    .min(1)
    .max(2000)
    .trim()
    .messages({
      'string.empty': 'Message content cannot be empty',
      'string.min': 'Message must be at least 1 character',
      'string.max': 'Message cannot exceed 2000 characters',
      'any.required': 'Message content is required',
    }),
});

/**
 * React to Message Validation
 */
export const reactToMessageSchema = Joi.object({
  emoji: Joi.string()
    .required()
    .valid('👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏', '🎉', '✅')
    .messages({
      'any.required': 'Emoji is required',
      'any.only': 'Invalid emoji. Use: 👍 ❤️ 😂 😮 😢 😡 🔥 👏 🎉 ✅',
    }),
});

/**
 * Get Messages Query Validation
 */
export const getMessagesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    'number.min': 'Page must be at least 1',
    'number.base': 'Page must be a number',
  }),
  limit: Joi.number().integer().min(1).max(100).default(50).messages({
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit cannot exceed 100',
    'number.base': 'Limit must be a number',
  }),
  before: Joi.string().uuid().messages({
    'string.pattern.base': 'Invalid message ID format',
  }),
  after: Joi.string().uuid().messages({
    'string.pattern.base': 'Invalid message ID format',
  }),
});