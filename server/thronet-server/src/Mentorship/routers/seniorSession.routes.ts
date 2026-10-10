import { Router } from 'express';

import SeniorSessionController from '../controllers/seniorSession.controller';
import SeniorAnalyticsController from '../controllers/seniorAnalytics.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

import {
  createSeniorSessionValidator,
  updateSeniorSessionValidator,
  seniorSessionIdValidator,
} from '../validations/seniorSession.validator';
import { uploadSingle } from '@/shared/upload/upload';

const router = Router();

/**
 * Get all active 1-to-1 Senior Sessions for discovery
 * GET /senior-sessions
 * Public route
 */
router.get(
  '/',
  SeniorSessionController.getDiscoverySessions
);

/**
 * All Senior Session routes require authentication.
 */
router.use(AuthMiddleware.authenticate);

/**
 * Create a Senior Session
 * POST /senior-sessions
 */
router.post(
  '/',
  uploadSingle('thumbnailImage', 'image', false),
  createSeniorSessionValidator,
  SeniorSessionController.createSession
);



/**
 * Get all sessions owned by the authenticated Senior Mentor
 * GET /senior-sessions/my
 */
router.get(
  '/my',
  SeniorSessionController.getMySessions
);

/**
 * Get analytics for the authenticated Senior Mentor
 * GET /senior-sessions/analytics
 */
router.get(
  '/analytics',
  (req, res) => SeniorAnalyticsController.getDashboardStats(req as any, res)
);

/**
 * Get a single Senior Session

 * GET /senior-sessions/:sessionId
 */
router.get(
  '/:sessionId',
  seniorSessionIdValidator,
  SeniorSessionController.getSessionById
);

/**
 * Book a Senior Session
 * POST /senior-sessions/:sessionId/book
 */
router.post(
  '/:sessionId/book',
  seniorSessionIdValidator,
  SeniorSessionController.bookSession
);

/**
 * Confirm a Booking
 * POST /senior-sessions/:sessionId/bookings/:bookingId/confirm
 */
router.post(
  '/:sessionId/bookings/:bookingId/confirm',
  SeniorSessionController.confirmBooking
);

/**
 * Cancel a Booking
 * POST /senior-sessions/:sessionId/bookings/:bookingId/cancel
 */
router.post(
  '/:sessionId/bookings/:bookingId/cancel',
  SeniorSessionController.cancelBooking
);

/**
 * Start a Booking
 * POST /senior-sessions/:sessionId/bookings/:bookingId/start
 */
router.post(
  '/:sessionId/bookings/:bookingId/start',
  SeniorSessionController.startBooking
);

/**
 * Reschedule a Booking
 * POST /senior-sessions/:sessionId/bookings/:bookingId/reschedule
 */
router.post(
  '/:sessionId/bookings/:bookingId/reschedule',
  SeniorSessionController.rescheduleBooking
);

/**
 * Complete a Booking
 * POST /senior-sessions/:sessionId/bookings/:bookingId/complete
 */
router.post(
  '/:sessionId/bookings/:bookingId/complete',
  SeniorSessionController.completeBooking
);

/**
 * Update a Senior Session
 * PUT /senior-sessions/:sessionId
 */
router.put(
  '/:sessionId',
  uploadSingle('thumbnailImage', 'image', false),
  updateSeniorSessionValidator,
  SeniorSessionController.updateSession
);

/**
 * Cancel a Senior Session
 * DELETE /senior-sessions/:sessionId
 */
router.delete(
  '/:sessionId',
  seniorSessionIdValidator,
  SeniorSessionController.cancelSession
);

export default router;