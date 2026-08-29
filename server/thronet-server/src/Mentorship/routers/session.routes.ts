import { Router } from 'express';
import { sessionController } from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validateJoi } from '@/shared/middlewares/validation.middleware';
import sessionValidator from '../validations/session.validator';
import { uploadSingle } from '@/shared/upload/upload';
import { NextFunction, Request, Response } from 'express';

const router = Router();

const parseFormDataFields = (req: Request, res: Response, next: NextFunction): void => {
  const fieldsToParse = ['pricing', 'followUp', 'meeting'];
  for (const field of fieldsToParse) {
    const body = req.body as Record<string, any>;
    if (body[field] && typeof body[field] === 'string') {
      try {
        body[field] = JSON.parse(body[field]);
      } catch (e) {
        // ignore
      }
    }
  }
  next();
};

// All routes require authentication
router.use(AuthMiddleware.authenticate as any);

// ============================================================
// COLLECTION ROUTES (specific paths - /:id se pehle hone chahiye)
// ============================================================

/**
 * @route   POST /api/v1/sessions/create
 * @desc    Naya session assign hoga (mentor karta hai)
 * @body    sessionType, session name, price assign per min or hrs, scheduledAt date + time wise, timezone, paymentMethod, duration, Follow-up Period, Follow-up Allowed, Buffer Time
 * @access  Private (Mentor)
 * @flow    Validation → pricing given by body → mentor DB me update → session create
 */
router.post(
  '/create',
  uploadSingle('thumbnailImage'),
  parseFormDataFields,
  validateJoi(sessionValidator.createSession),
  sessionController.createSession
);

/**
 * @route   GET /api/v1/mentorship/sessions/mentor/:mentorId
 * @desc    Mentor ke saare assigned sessions (user ke profile page ke liye)
 * @access  Public
 */
router.get(
  '/mentor/:mentorId',
  sessionController.getMentorAssignedSessions
);

/**
 * @route   GET /api/v1/sessions/get-all-db
 * @desc    DB me stored saare sessions lo (all users ke)
 * @query   page=1, limit=10
 * @access  Private
 */
router.get('/get-all-db', sessionController.getAllSessionsFromDB);

/**
 * @route   GET /api/v1/sessions/get-all
 * @desc    Current user ke saare sessions lo (mentor ya mentee dono ke liye)
 * @query   role=mentee|mentor, page=1, limit=10, status, sessionType, startDate, endDate
 * @access  Private
 * @flow    userId + role se filter karo → paginated list return karo
 */
router.get('/get-all', sessionController.getAllSessions);

/**
 * @route   POST /api/v1/sessions/book
 * @desc    Full booking — slot select + availability mark + session create
 * @body    mentorId, sessionType, scheduledAt, slotTime, timezone, title, pricing, paymentMethod, availabilityId
 * @access  Private (Mentee)
 */
router.post('/book', validateJoi(sessionValidator.bookSession), sessionController.bookSession);

/**
 * @route   GET /api/v1/sessions/:id/progress
 * @desc    Mentee ka session progress — completed, left, total
 * @access  Private
 */
router.get('/:id/progress', sessionController.getSessionProgress);

/**
 * @route   GET /api/v1/sessions/:id
 * @desc    Get session details by ID
 * @access  Private
 */
router.get('/:id', sessionController.getSessionById);

/**
 * @route   GET /api/v1/sessions/upcoming
 * @desc    Get upcoming sessions
 * @access  Private
 */
router.get('/upcoming', sessionController.getUpcomingSessions);

/**
 * @route   GET /api/v1/sessions/stats
 * @desc    Get session statistics
 * @access  Private
 */
router.get('/stats', sessionController.getSessionStats);


/**
 * @route   POST /api/v1/sessions/:id/confirm
 * @desc    Confirm session booking (Mentor only)
 * @access  Private (Mentor)
 */
router.post('/:id/confirm', sessionController.confirmSession);

/**
 * @route   POST /api/v1/sessions/:id/start
 * @desc    Start a session (Mentor only)
 * @access  Private (Mentor)
 */
router.post('/:id/start', sessionController.startSession);

/**
 * @route   POST /api/v1/sessions/:id/complete
 * @desc    Complete a session (Mentor only)
 * @access  Private (Mentor)
 */
router.post(
  '/:id/complete',
  validateJoi(sessionValidator.completeSession),
  sessionController.completeSession
);


/**
 * @route   GET /api/v1/sessions/past
 * @desc    Get past/completed sessions
 * @access  Private
 */
router.get('/past', sessionController.getPastSessions);


/**
 * 🆕 PHASE 10: Get refund estimate
 * @route   GET /api/v1/sessions/:id/refund-estimate
 * @desc    Get refund estimate before cancellation
 * @access  Private
 */
router.get('/:id/refund-estimate', sessionController.getRefundEstimate);

/**
 * @route   PUT /api/v1/sessions/:id
 * @desc    Update session details
 * @access  Private
 */
router.put(
  '/:id',
  uploadSingle('thumbnailImage'),
  parseFormDataFields,
  validateJoi(sessionValidator.updateSession),
  sessionController.updateSession
);


/**
 * 🆕 PHASE 10: Cancel session
 * @route   POST /api/v1/sessions/:id/cancel
 * @desc    Cancel a session with refund
 * @access  Private
 */
router.post(
  '/:id/cancel',
  validateJoi(sessionValidator.cancelSession),
  sessionController.cancelSession
);

/**
 * 🆕 PHASE 10: Reschedule session
 * @route   POST /api/v1/sessions/:id/reschedule
 * @desc    Reschedule a session to new date/time
 * @access  Private
 */
router.post(
  '/:id/reschedule',
  validateJoi(sessionValidator.rescheduleSession),
  sessionController.rescheduleSession
);

/**
 * @route   POST /api/v1/sessions/:id/review
 * @desc    Add review for a completed session
 * @access  Private
 */
router.post(
  '/:id/review',
  validateJoi(sessionValidator.addReview),
  sessionController.addReview
);

export default router;