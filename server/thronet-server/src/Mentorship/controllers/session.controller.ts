import { Request, Response, NextFunction } from 'express';
import { SessionType } from '@/shared/constants/sessionTypes';
import { getAuthToken } from '@/shared/middlewares/auth.middleware';
import { SessionMentor } from '../models';
import { bookingService, mentorshipSessionService } from '../services';
import { logger } from '@/shared/logger.util';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';

class SessionController {
  /**
   * @route   POST /api/v1/mentorship/sessions
   * @desc    Mentor creates/assigns a session
   * @access  Private (Mentor)
   */
  async createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mentorUserId = req.user?.id;
      if (!mentorUserId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const payload = { ...req.body };
      const file = req.file as Express.Multer.File | undefined;
      const session = await mentorshipSessionService.createMentorSession(mentorUserId, payload, file);
      ResponseHandler.created(res, 'Session assigned successfully', session);
    } catch (error: any) {
      logger.error('Failed to create mentor session:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/sessions/mentor/:mentorId
   * @access  Private (Mentor)
   */
  async getMentorAssignedSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mentorId } = req.params;
      if (!mentorId) {
        ResponseHandler.badRequest(res, 'mentorId is required');
        return;
      }

      const sessions = await mentorshipSessionService.getMentorAssignedSessions(mentorId);
      ResponseHandler.success(res, 'Mentor sessions fetched', sessions);
    } catch (error: any) {
      logger.error('Failed to fetch mentor sessions:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/sessions/book
   * @access  Private (Mentee)
   */
  async bookSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const session = await mentorshipSessionService.bookSession(
        { ...req.body, menteeId: userId },
        authToken
      );
      ResponseHandler.created(res, 'Session booked successfully', session);
    } catch (error: any) {
      logger.error('Failed to book session:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/sessions/:id/progress
   * @access  Private
   */
  async getSessionProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const progress = await mentorshipSessionService.getSessionProgress(id, userId);
      ResponseHandler.success(res, 'Session progress fetched', progress);
    } catch (error: any) {
      logger.error('Failed to fetch session progress:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/sessions/:id
   * @access  Private
   */
  async getSessionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const authToken = getAuthToken(req) || undefined;

      const session = await mentorshipSessionService.getSessionById(id, userId, authToken);
      ResponseHandler.success(res, 'Session retrieved successfully', session);
    } catch (error: any) {
      logger.error('Failed to fetch session:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/sessions
   * @access  Private
   */
  async getAllSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const {
        page = 1,
        limit = 10,
        status,
        sessionType,
        startDate,
        endDate,
        role = 'mentee',
      } = req.query;

      const filters = {
        status: status as string | undefined,
        sessionType: sessionType as SessionType | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      };

      const sessions = await mentorshipSessionService.getAllSessions(
        userId,
        role as 'mentor' | 'mentee',
        Number(page),
        Number(limit),
        filters,
        authToken
      );

      ResponseHandler.paginated(
        res,
        'Sessions retrieved successfully',
        sessions.sessions,
        sessions.page,
        sessions.limit,
        sessions.total
      );
    } catch (error: any) {
      logger.error('Failed to fetch sessions:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/sessions/all-db
   * @access  Private (Admin)
   */
  async getAllSessionsFromDB(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 10 } = req.query;

      const result = await mentorshipSessionService.getAllSessionsFromDB(
        Number(page),
        Number(limit)
      );

      ResponseHandler.paginated(
        res,
        'All sessions retrieved successfully',
        result.sessions,
        result.page,
        result.limit,
        result.total
      );
    } catch (error: any) {
      logger.error('Failed to fetch all sessions from DB:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/sessions/upcoming
   * @access  Private
   */
  async getUpcomingSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { role = 'mentee', limit = 10 } = req.query;
      const authToken = getAuthToken(req) || undefined;

      const sessions = await mentorshipSessionService.getUpcomingSessions(
        userId,
        role as 'mentor' | 'mentee',
        Number(limit),
        authToken
      );

      ResponseHandler.success(res, 'Upcoming sessions retrieved successfully', sessions);
    } catch (error: any) {
      logger.error('Failed to fetch upcoming sessions:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/sessions/past
   * @access  Private
   */
  async getPastSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { role = 'mentee', limit = 10 } = req.query;
      const authToken = getAuthToken(req) || undefined;

      const sessions = await mentorshipSessionService.getPastSessions(
        userId,
        role as 'mentor' | 'mentee',
        Number(limit),
        authToken
      );

      ResponseHandler.success(res, 'Past sessions retrieved successfully', sessions);
    } catch (error: any) {
      logger.error('Failed to fetch past sessions:', error);
      next(error);
    }
  }

  /**
   * @route   PUT /api/v1/mentorship/sessions/:id
   * @access  Private
   */
  async updateSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const payload = { ...req.body };
      const file = req.file as Express.Multer.File | undefined;
      const session = await mentorshipSessionService.updateSession(id, userId, payload, authToken, file);
      ResponseHandler.success(res, 'Session updated successfully', session);
    } catch (error: any) {
      logger.error('Failed to update session:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/sessions/:id/confirm
   * @access  Private
   */
  async confirmSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const { bookingId } = req.body;

      const session = await mentorshipSessionService.confirmSession(id, userId, authToken, bookingId);
      ResponseHandler.success(res, 'Session confirmed successfully', session);
    } catch (error: any) {
      logger.error('Failed to confirm session:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/sessions/:id/start
   * @access  Private (Mentor)
   */
  async startSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const session = await mentorshipSessionService.startSession(id, userId, authToken);
      ResponseHandler.success(res, 'Session started successfully', session);
    } catch (error: any) {
      logger.error('Failed to start session:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/sessions/:id/complete
   * @access  Private (Mentor)
   */
  async completeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const { actualDuration, wasSuccessful, followUpRequired, followUpNotes } = req.body;

      const session = await mentorshipSessionService.completeSession(
        id,
        userId,
        { actualDuration, wasSuccessful, followUpRequired, followUpNotes },
        authToken
      );
      ResponseHandler.success(res, 'Session completed successfully', session);
    } catch (error: any) {
      logger.error('Failed to complete session:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/sessions/:id/cancel
   * @access  Private
   */
  async cancelSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { reason, bookingId } = req.body;
      if (!reason) {
        ResponseHandler.badRequest(res, 'Cancellation reason is required');
        return;
      }
      if (!bookingId) {
        ResponseHandler.badRequest(res, 'bookingId is required to cancel a booking');
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const result = await bookingService.cancelBooking(id, userId, reason, authToken, bookingId);

      ResponseHandler.success(res, 'Session cancelled successfully', {
        session: result.session,
        refund: {
          amount: result.refundAmount,
          eligible: result.refundEligible,
          status: result.refundAmount > 0 ? 'Processing' : 'Not Eligible',
          expectedDays: result.refundAmount > 0 ? '3-5 business days' : null,
        },
      });
    } catch (error: any) {
      logger.error('Failed to cancel session:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/sessions/:id/reschedule
   * @access  Private
   */
  async rescheduleSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { newScheduledAt, reason, bookingId } = req.body;
      if (!newScheduledAt) {
        ResponseHandler.badRequest(res, 'New scheduled time is required');
        return;
      }
      if (!bookingId) {
        ResponseHandler.badRequest(res, 'bookingId is required to reschedule a booking');
        return;
      }

      const session = await SessionMentor.findOne({ sessionId: id });
      if (!session) {
        ResponseHandler.notFound(res, 'Session not found');
        return;
      }

      // 1. Identify the true scheduledAt to compare against the 24h baseline.
      // If it's a specific booking, validate against the booking's start time instead of the overall parent session's start time.
      let existingStartTime = session.scheduledAt;
      if (bookingId && session.bookings && session.bookings.length > 0) {
        const targetBooking = session.bookings.find((b: any) => b._id.toString() === bookingId);
        if (targetBooking && targetBooking.scheduledAt) {
          existingStartTime = targetBooking.scheduledAt;
        }
      }

      const hoursDiff = (existingStartTime.getTime() - Date.now()) / (1000 * 60 * 60);
      
      // LOGIC: The business rule prevents a user from rescheduling a meeting if the CURRENT EXISTNG start time is within 24 hours, or if it already passed.
      if (hoursDiff < 24) {
        ResponseHandler.badRequest(res, 'Cannot reschedule less than 24 hours before start time');
        return;
      }

      const rescheduleCount = session.reschedule?.count || 0;
      if (rescheduleCount >= 2) {
        ResponseHandler.badRequest(res, 'Maximum reschedule limit (2) reached for this session');
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const updatedSession = await bookingService.rescheduleBooking(
        id,
        userId,
        new Date(newScheduledAt),
        reason || 'Rescheduled by user',
        authToken,
        bookingId
      );

      ResponseHandler.success(res, 'Session rescheduled successfully', {
        session: updatedSession,
        reschedule: {
          count: updatedSession.reschedule?.count || 0,
          fee: rescheduleCount === 0 ? 0 : 50,
          remainingReschedules: 2 - (updatedSession.reschedule?.count || 0),
        },
      });
    } catch (error: any) {
      logger.error('Failed to reschedule session:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/sessions/:id/refund-estimate
   * @access  Private
   */
  async getRefundEstimate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const session = await SessionMentor.findOne({ sessionId: id });
      if (!session) {
        ResponseHandler.notFound(res, 'Session not found');
        return;
      }

      // Permission check deferred to underlying service

      const hoursDiff = (session.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);

      let refundPercentage: number;
      let refundAmount: number;
      let refundEligible: boolean;
      let policy: string;

      if (hoursDiff >= 24) {
        refundPercentage = 100;
        refundAmount = session.pricing.totalAmount;
        refundEligible = true;
        policy = '100% refund — Cancelled 24+ hours before session';
      } else if (hoursDiff >= 12) {
        refundPercentage = 50;
        refundAmount = Math.round(session.pricing.totalAmount * 0.5);
        refundEligible = true;
        policy = '50% refund — Cancelled 12-24 hours before session';
      } else {
        refundPercentage = 0;
        refundAmount = 0;
        refundEligible = false;
        policy = 'No refund — Cancelled less than 12 hours before session';
      }

      ResponseHandler.success(res, 'Refund estimate calculated', {
        session: {
          id: session._id,
          scheduledAt: session.scheduledAt,
          totalAmount: session.pricing.totalAmount,
          currency: session.pricing.currency,
        },
        refund: {
          eligible: refundEligible,
          percentage: refundPercentage,
          amount: refundAmount,
          policy,
          hoursUntilSession: Math.round(hoursDiff * 10) / 10,
          processingTime: refundEligible ? '3-5 business days' : null,
        },
        canCancel: hoursDiff >= 0,
        warning:
          hoursDiff < 24 && hoursDiff >= 12
            ? 'You will receive only 50% refund.'
            : hoursDiff < 12 && hoursDiff >= 0
            ? 'No refund available at this time.'
            : null,
      });
    } catch (error: any) {
      logger.error('Failed to get refund estimate:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/sessions/:id/review
   * @access  Private (Mentee)
   */
  async addReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { rating, review } = req.body;
      if (!rating || !review) {
        ResponseHandler.badRequest(res, 'Rating and review are required');
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const session = await mentorshipSessionService.addReview(id, userId, rating, review, authToken);
      ResponseHandler.success(res, 'Review added successfully', session);
    } catch (error: any) {
      logger.error('Failed to add review:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/sessions/stats
   * @access  Private
   */
  async getSessionStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { role = 'mentee' } = req.query;
      const authToken = getAuthToken(req) || undefined;

      const stats = await mentorshipSessionService.getSessionStats(
        userId,
        role as 'mentor' | 'mentee',
        authToken
      );

      ResponseHandler.success(res, 'Session statistics retrieved successfully', stats);
    } catch (error: any) {
      logger.error('Failed to fetch session stats:', error);
      next(error);
    }
  }
}

export default new SessionController();