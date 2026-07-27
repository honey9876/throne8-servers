import { body, param, query } from 'express-validator';

export const getHeadlineByIdValidation = [
    param('headlineId')
        .notEmpty().withMessage('Headline ID is required')
        .isUUID().withMessage('Invalid headline ID format')
];

export const getAllHeadlinesValidation = [
    query('type')
        .optional()
        .isIn(['login_success', 'dashboard', 'notification', 'alert', 'announcement', 'welcome'])
        .withMessage('Invalid headline type'),
    query('status')
        .optional()
        .isIn(['ACTIVE', 'INACTIVE', 'SCHEDULED', 'EXPIRED'])
        .withMessage('Invalid status'),
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

export const updateHeadlineValidation = [
    param('headlineId')
        .notEmpty().withMessage('Headline ID is required')
        .isUUID().withMessage('Invalid headline ID format'),
    body('title')
        .optional()
        .isLength({ min: 3, max: 100 }).withMessage('Title must be between 3 and 100 characters'),
    body('message')
        .optional()
        .isLength({ min: 10, max: 500 }).withMessage('Message must be between 10 and 500 characters'),
    body('priority')
        .optional()
        .isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).withMessage('Invalid priority'),
    body('status')
        .optional()
        .isIn(['ACTIVE', 'INACTIVE', 'SCHEDULED', 'EXPIRED']).withMessage('Invalid status')
];