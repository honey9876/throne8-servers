/**
 * message.validator.ts
 * Input validation rules for all message routes.
 * Uses express-validator — same pattern as your existing auth validators.
 */

import { body, query, param } from 'express-validator';
import { MessageType } from '../types/message.types';

// ==================== COMMON RULES ====================

const uuidRule = (field: string) =>
    param(field)
        .isUUID(4)
        .withMessage(`${field} must be a valid UUID`);

const uuidBodyRule = (field: string) =>
    body(field)
        .isUUID(4)
        .withMessage(`${field} must be a valid UUID`);

// ==================== VALIDATORS ====================

export const sendMessageValidator = [
    uuidBodyRule('conversationId'),

    body('type')
        .optional()
        .isIn(Object.values(MessageType))
        .withMessage(`type must be one of: ${Object.values(MessageType).join(', ')}`),

    body('text')
        .if(body('type').not().equals(MessageType.VOICE))
        .if(body('type').not().equals(MessageType.IMAGE))
        .notEmpty()
        .withMessage('text is required for text messages')
        .isLength({ max: 4000 })
        .withMessage('text cannot exceed 4000 characters')
        .trim(),

    body('mediaUrl')
        .optional()
        .isURL()
        .withMessage('mediaUrl must be a valid URL'),

    body('mediaDuration')
        .optional()
        .isInt({ min: 0 })
        .withMessage('mediaDuration must be a positive integer (seconds)'),
];

export const getHistoryValidator = [
    uuidRule('conversationId'),

    query('cursor')
        .optional()
        .isISO8601()
        .withMessage('cursor must be a valid ISO 8601 timestamp'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('limit must be between 1 and 50'),
];

export const searchMessagesValidator = [
    uuidRule('conversationId'),

    query('keyword')
        .notEmpty()
        .withMessage('keyword is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('keyword must be between 2 and 100 characters')
        .trim(),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('limit must be between 1 and 50'),

    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('page must be a positive integer'),
];

export const messageIdValidator = [
    uuidRule('messageId'),
];

export const reactionValidator = [
    uuidBodyRule('messageId'),

    body('emoji')
        .notEmpty()
        .withMessage('emoji is required')
        .isLength({ max: 10 })
        .withMessage('emoji must be at most 10 characters'),
];

export const createDirectConversationValidator = [
    uuidBodyRule('targetUserId'),
];

export const markSeenValidator = [
    uuidRule('conversationId'),
];