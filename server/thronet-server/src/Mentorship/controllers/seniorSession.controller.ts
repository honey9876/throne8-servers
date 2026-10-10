import { Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import SeniorSessionService from '../services/seniorSession.service';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';

class SeniorSessionController {
  /**
   * Create a new Senior Session
   * POST /senior-sessions
   */
  async createSession(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;

      const session = await SeniorSessionService.createSession(
        userId,
        req.body,
        (req as any).file
      );

      return ResponseHandler.success(
        res,
        'Senior session created successfully',
        session
      );
    } catch (error: any) {
      console.error('CREATE SESSION ERROR:', error);
      const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
      return ResponseHandler.error(res, error.message || 'Internal Server Error', statusCode, error.stack);
    }
  }

  /**
   * Get all sessions belonging to the authenticated Senior Mentor
   * GET /senior-sessions/my
   */
  async getMySessions(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;

      const sessions = await SeniorSessionService.getMySessions(userId);

      return ResponseHandler.success(
        res,
        'Senior sessions retrieved successfully',
        sessions
      );
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  /**
   * Get all active one-to-one sessions for the discovery page
   * GET /senior-sessions/discovery
   */
  async getDiscoverySessions(req: AuthRequest, res: Response) {
    try {
      const sessions = await SeniorSessionService.getDiscoverySessions();

      return ResponseHandler.success(
        res,
        'Senior sessions retrieved successfully',
        sessions
      );
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  /**
   * Book a Senior Session
   * POST /senior-sessions/:sessionId/book
   */
  async bookSession(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { sessionId } = req.params;

      const session = await SeniorSessionService.bookSession(
        userId,
        sessionId,
        req.body
      );

      return ResponseHandler.success(
        res,
        'Senior session booked successfully',
        session
      );
    } catch (error: any) {
      console.log('>>> [BOOKING_ERROR] catch block triggered in seniorSession controller:', error);
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  /**
   * Get a single Senior Session
   * GET /senior-sessions/:sessionId
   */
  async getSessionById(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { sessionId } = req.params;

      const session = await SeniorSessionService.getSessionById(
        userId,
        sessionId
      );

      return ResponseHandler.success(
        res,
        'Senior session retrieved successfully',
        session
      );
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  /**
   * Update a Senior Session
   * PUT /senior-sessions/:sessionId
   */
  async updateSession(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { sessionId } = req.params;

      console.log('--- UPDATE SESSION CONTROLLER ---');
      console.log('userId:', userId);
      console.log('sessionId:', sessionId);

      const session = await SeniorSessionService.updateSession(
        userId,
        sessionId,
        req.body,
        req.file as Express.Multer.File | undefined
      );

      return ResponseHandler.success(
        res,
        'Senior session updated successfully',
        session
      );
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  /**
   * Cancel/Delete a Senior Session
   * DELETE /senior-sessions/:sessionId
   */
  async cancelSession(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { sessionId } = req.params;

      console.log('--- CANCEL SESSION CONTROLLER ---');
      console.log('Extracted userId:', userId);
      console.log('Extracted sessionId:', sessionId);

      const session = await SeniorSessionService.cancelSession(
        userId,
        sessionId
      );

      return ResponseHandler.success(
        res,
        'Senior session cancelled successfully',
        session
      );
    } catch (error: any) {
      console.error('CANCEL SESSION ERROR:', error);
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  /**
   * Accept a Booking
   * POST /senior-sessions/:sessionId/bookings/:bookingId/accept
   */
  async confirmBooking(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { sessionId, bookingId } = req.params;

      const session = await SeniorSessionService.confirmBooking(userId, sessionId, bookingId);

      return ResponseHandler.success(res, 'Booking confirmed successfully', session);
    } catch (error: any) {
      console.log('>>> [CONFIRM_ERROR] catch block triggered:', error);
      return ResponseHandler.error(res, error.stack || error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  /**
   * Reject a Booking
   * POST /senior-sessions/:sessionId/bookings/:bookingId/reject
   */
  async cancelBooking(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { sessionId, bookingId } = req.params;
      const { reason } = req.body;

      const session = await SeniorSessionService.cancelBooking(userId, sessionId, bookingId, reason);

      return ResponseHandler.success(res, 'Booking cancelled successfully', session);
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  /**
   * Reschedule a Booking
   * POST /senior-sessions/:sessionId/bookings/:bookingId/reschedule
   */
  async rescheduleBooking(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { sessionId, bookingId } = req.params;
      const { newScheduledAt, reason } = req.body;

      if (!newScheduledAt || !reason) {
        return ResponseHandler.error(res, 'New scheduled date and reason are required', 400);
      }

      const session = await SeniorSessionService.rescheduleBooking(userId, sessionId, bookingId, newScheduledAt, reason);

      return ResponseHandler.success(res, 'Booking rescheduled successfully', session);
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  /**
   * Start a Booking
   * POST /senior-sessions/:sessionId/bookings/:bookingId/start
   */
  async startBooking(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { sessionId, bookingId } = req.params;

      const session = await SeniorSessionService.startBooking(userId, sessionId, bookingId);

      return ResponseHandler.success(res, 'Booking started successfully', session);
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }

  /**
   * Complete a Booking
   * POST /senior-sessions/:sessionId/bookings/:bookingId/complete
   */
  async completeBooking(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { sessionId, bookingId } = req.params;

      const session = await SeniorSessionService.completeBooking(userId, sessionId, bookingId);

      return ResponseHandler.success(res, 'Booking completed successfully', session);
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }
}

export default new SeniorSessionController();