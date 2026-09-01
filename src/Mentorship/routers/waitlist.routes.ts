// src/routes/waitlist.routes.ts
import express from 'express';
import {
  joinWaitlist,
  getUserPosition,
  getUserWaitlists,
  getMentorWaitlist,
  notifyNextInLine,
  markAsBooked,
  removeFromWaitlist,
  getWaitlistStats,
} from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { body, param, query, validationResult } from 'express-validator';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';

const router = express.Router();

/**
 * Validation error handler
 */
const handleValidationErrors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ResponseHandler.badRequest(res, 'Validation failed', errors.array());
  }
  return next();
};

/**
 * Protected Routes (All require authentication)
 */

// Join waitlist for a mentor
router.post(
  '/join',
  AuthMiddleware.authenticate as any,
  [
    body('mentorId')
      .notEmpty()
      .withMessage('Mentor ID is required')
      .isString()
      .withMessage('Invalid mentor ID'),
    body('preferredDates')
      .isArray({ min: 1 })
      .withMessage('At least one preferred date is required'),
    body('preferredDates.*')
      .isISO8601()
      .withMessage('Invalid date format'),
    body('preferredTimeSlots')
      .isArray({ min: 1 })
      .withMessage('At least one time slot is required'),
    body('preferredTimeSlots.*')
      .isString()
      .withMessage('Invalid time slot format'),
    body('sessionType')
      .notEmpty()
      .withMessage('Session type is required')
      .isString()
      .withMessage('Invalid session type'),
    body('timezone')
      .notEmpty()
      .withMessage('Timezone is required')
      .isString()
      .withMessage('Invalid timezone'),
    body('notes')
      .optional()
      .isString()
      .withMessage('Notes must be a string'),
  ],
  handleValidationErrors,
  joinWaitlist
);

// Get user's position in waitlist for a specific mentor
router.get(
  '/position/:mentorId',
  AuthMiddleware.authenticate as any,
  [
    param('mentorId')
      .notEmpty()
      .withMessage('Mentor ID is required')
      .isString()
      .withMessage('Invalid mentor ID'),
  ],
  handleValidationErrors,
  getUserPosition
);

// Get all waitlist entries for logged-in user
router.get('/my-waitlists', AuthMiddleware.authenticate as any, getUserWaitlists);

// Get waitlist for mentor (Mentor only)
router.get(
  '/mentor/:mentorId',
  AuthMiddleware.authenticate as any,
  [
    param('mentorId')
      .notEmpty()
      .withMessage('Mentor ID is required')
      .isString()
      .withMessage('Invalid mentor ID'),
    query('status')
      .optional()
      .isIn(['active', 'notified', 'booked', 'expired', 'cancelled'])
      .withMessage('Invalid status'),
  ],
  handleValidationErrors,
  getMentorWaitlist
);

// Notify next person in waitlist (Mentor only)
router.post(
  '/notify/:mentorId',
  AuthMiddleware.authenticate as any,
  [
    param('mentorId')
      .notEmpty()
      .withMessage('Mentor ID is required')
      .isString()
      .withMessage('Invalid mentor ID'),
  ],
  handleValidationErrors,
  notifyNextInLine
);

// Mark waitlist entry as booked
router.put(
  '/:waitlistId/book',
  AuthMiddleware.authenticate as any,
  [
    param('waitlistId')
      .isUUID()
      .withMessage('Invalid waitlist ID'),
    body('sessionId')
      .isUUID()
      .withMessage('Invalid session ID'),
  ],
  handleValidationErrors,
  markAsBooked
);

// Remove from waitlist
router.delete(
  '/:waitlistId',
  AuthMiddleware.authenticate as any,
  [
    param('waitlistId')
      .isUUID()
      .withMessage('Invalid waitlist ID'),
    body('reason')
      .optional()
      .isString()
      .withMessage('Reason must be a string'),
  ],
  handleValidationErrors,
  removeFromWaitlist
);

// Get waitlist statistics for mentor
router.get(
  '/stats/:mentorId',
  AuthMiddleware.authenticate as any,
  [
    param('mentorId')
      .notEmpty()
      .withMessage('Mentor ID is required')
      .isString()
      .withMessage('Invalid mentor ID'),
  ],
  handleValidationErrors,
  getWaitlistStats
);

export default router;