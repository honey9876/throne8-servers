import mentorService from './mentor.service';
import { SESSION_DURATIONS, SessionType } from '@/shared/constants/sessionTypes';
import { PaymentMethod, PaymentStatus } from '@/Mentorship/interface/session.types';
import { Availability, Mentor, SessionMentor } from '../models';
import { logger } from '@/shared/logger.util';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/shared/errors/app.error';
import { User } from '@/shared/models/index.models';
import { BookingStatus } from '@/shared/constants/bookingStatus';
import sessionRepository from '../repositories/session.repository';
import mentorRepository from '../repositories/mentor.repository';

interface CreateSessionInput {
  mentorId: string;
  menteeId: string;
  sessionType: SessionType;
  scheduledAt: Date;
  timezone: string;
  title: string;
  description?: string;
  notes?: string;
  paymentMethod: PaymentMethod;
  pricing: {
    basePrice: number;
    platformFee: number;
    totalAmount: number;
    currency?: string;
  };
}

interface SessionFilters {
  status?: string;
  sessionType?: SessionType;
  startDate?: Date;
  endDate?: Date;
}

class MentorshipSessionService {
  /**
   * Create a new session
   */
  async createSession(input: CreateSessionInput, authToken?: string): Promise<any> {
    try {
      logger.info(`Creating session: ${input.sessionType}`);

      const mentor = await mentorRepository.findByMentorId(input.mentorId);
      if (!mentor) throw new NotFoundError('MENTOR_NOT_FOUND');

      const user = await User.findOne({ userId: input.menteeId, 'flags.isDeleted': false });
      if (!user) throw new NotFoundError('MENTEE_NOT_FOUND');

      const duration = SESSION_DURATIONS[input.sessionType];
      const isFree   = input.paymentMethod === PaymentMethod.FREE;

      const basePrice   = isFree ? 0 : input.pricing.basePrice;
      const platformFee = isFree ? 0 : input.pricing.platformFee;
      const totalAmount = isFree ? 0 : input.pricing.totalAmount;
      const currency    = input.pricing?.currency || 'INR';

      if (!isFree) {
        const priceKey = this.mapSessionTypeToPrice(input.sessionType);
        await mentorRepository.updateByMentorId(input.mentorId, {
          [`pricing.${String(priceKey)}`]: basePrice,
        });
      }

      const sessionData = {
        mentorId: input.mentorId,
        menteeId: input.menteeId,
        sessionType: input.sessionType,
        status: BookingStatus.PENDING,
        scheduledAt: new Date(input.scheduledAt),
        duration,
        timezone: input.timezone,
        title: input.title,
        description: input.description,
        notes: input.notes,
        pricing: { basePrice, platformFee, totalAmount, currency },
        payment: {
          status: isFree ? PaymentStatus.COMPLETED : PaymentStatus.PENDING,
          method: input.paymentMethod,
        },
        reschedule: { count: 0, previousDates: [] },
      };

      const session = await sessionRepository.create(sessionData);
      logger.info(`✅ Session created: ${session.sessionId}`);
      return session;
    } catch (error: any) {
      logger.error(`Failed to create session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a mentor-side session template (mentor posts an open slot)
   */
  async createMentorSession(mentorUserId: string, input: any): Promise<any> {
    try {
      logger.info(`Creating mentor session template by: ${mentorUserId}`);

      const mentor = await Mentor.findOne({ userId: mentorUserId, isDeleted: false });
      if (!mentor) throw new NotFoundError('Mentor profile not found');

      const sessionData = {
        mentorId: mentor.mentorId,
        menteeId: null,
        status: BookingStatus.AVAILABLE,
        sessionType: input.sessionType,
        scheduledAt: new Date(input.scheduledAt),
        duration: input.duration,
        timezone: input.timezone,
        title: input.title,
        description: input.description,
        pricing: {
          basePrice: input.pricing.basePrice,
          platformFee: input.pricing.platformFee || 0,
          totalAmount: input.pricing.totalAmount,
          currency: input.pricing.currency || 'INR',
        },
        payment: {
          status: PaymentStatus.PENDING,
          method: input.paymentMethod,
        },
        reschedule: { count: 0, previousDates: [] },
      };

      const session = await sessionRepository.create(sessionData);
      logger.info(`✅ Mentor session template created: ${session.sessionId}`);
      return session;
    } catch (error: any) {
      logger.error(`Failed to create mentor session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all sessions for a mentor (no filter)
   */
  async getMentorAssignedSessions(mentorId: string): Promise<any[]> {
    try {
      logger.info(`Fetching assigned sessions for mentor: ${mentorId}`);

      return await SessionMentor.find({ mentorId })
        .sort({ scheduledAt: 1 })
        .lean();
    } catch (error: any) {
      logger.error(`Failed to fetch mentor assigned sessions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Book an existing mentor-posted session slot.
   *
   * ✅ Note: slot-level locking (Redis) should be added here before production
   * if concurrent bookings on the same slot are expected (same as booking.service).
   */
  async bookSession(input: any, authToken?: string): Promise<any> {
    try {
      logger.info(`Booking session: ${input.sessionId} by mentee: ${input.menteeId}`);

      const session = await SessionMentor.findOne({ sessionId: input.sessionId });
      if (!session) throw new NotFoundError('Session not found');

      if (session.status !== BookingStatus.AVAILABLE) {
        throw new BadRequestError('Session is not available for booking');
      }

      const alreadyBooked = (session.bookings || []).some(
        (b: any) => b.menteeId === input.menteeId && b.status !== 'cancelled'
      );
      if (alreadyBooked) {
        throw new BadRequestError('You have already booked this session');
      }

      if (session.mentorId !== input.mentorId) {
        throw new BadRequestError('Session does not belong to this mentor');
      }

      const availability = await Availability.findOne({
        availabilityId: input.availabilityId,
        isDeleted: false,
      });
      if (!availability) throw new NotFoundError('AVAILABILITY_NOT_FOUND');

      const slot = availability.slots.find(
        (s: any) => `${s.startTime} - ${s.endTime}` === input.slotTime
      );
      if (!slot)          throw new BadRequestError('Slot not found');
      if (slot.isBooked)  throw new BadRequestError('Slot already booked');
      if (slot.isBlocked) throw new BadRequestError('Slot is blocked');

      session.bookings = session.bookings || [];
      session.bookings.push({
        menteeId:       input.menteeId,
        bookedBy:       input.menteeId,
        bookedAt:       new Date(),
        status:         'pending',
        slotTime:       input.slotTime,
        scheduledAt:    new Date(input.scheduledAt),
        availabilityId: input.availabilityId,
        payment: {
          status: PaymentStatus.PENDING,
          method: input.paymentMethod,
        },
        pricing: {
          basePrice:   input.pricing.basePrice,
          platformFee: input.pricing.platformFee,
          totalAmount: input.pricing.totalAmount,
          currency:    input.pricing.currency || 'INR',
        },
      } as any);

      await session.save();

      slot.isBooked = true;
      await availability.save();

      logger.info(`✅ Booking added: ${session.sessionId} for mentee: ${input.menteeId}`);

      const myBooking = session.bookings[session.bookings.length - 1];
      return {
        sessionId:     session.sessionId,
        mentorId:      session.mentorId,
        title:         session.title,
        sessionType:   session.sessionType,
        duration:      session.duration,
        booking:       myBooking,
        totalBookings: session.bookings.length,
      };
    } catch (error: any) {
      logger.error(`Failed to book session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get session progress summary for a user
   */
  async getSessionProgress(sessionId: string, userId: string): Promise<any> {
    try {
      const sessions = await SessionMentor.find({
        $or: [{ menteeId: userId }, { mentorId: userId }],
      }).lean();

      const total     = sessions.length;
      const completed = sessions.filter((s) => s.status === BookingStatus.COMPLETED).length;
      const left      = sessions.filter((s) => s.completion?.leftAt !== undefined).length;
      const totalTimeSpent = sessions
        .filter((s) => s.completion?.actualDuration)
        .reduce((acc, s) => acc + (s.completion?.actualDuration || 0), 0);

      return {
        totalSessionsBooked:   total,
        completedSessions:     completed,
        leftSessions:          left,
        totalTimeSpentMinutes: totalTimeSpent,
        completionRate:        total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    } catch (error: any) {
      logger.error(`Failed to fetch session progress: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get session by sessionId.
   *
   * ✅ FIX: Correctly resolves mentor authorization.
   * userId from the JWT token is the user's UUID — not the mentor's mentorId.
   * We look up the mentor profile to get the mentorId, then compare.
   */
  async getSessionById(
    sessionId: string,
    userId?: string,
    _authToken?: string
  ): Promise<any> {
    try {
      logger.info(`Fetching session: ${sessionId}`);

      const session = await SessionMentor.findOne({ sessionId });
      if (!session) throw new NotFoundError('Session not found');

      if (userId) {
        const mentor  = await Mentor.findOne({ userId, isDeleted: false });
        const isMentor = mentor && session.mentorId === mentor.mentorId;
        const isMentee = session.menteeId === userId;

        if (!isMentor && !isMentee) {
          throw new ForbiddenError('You are not authorized to view this session');
        }
      }

      return session;
    } catch (error: any) {
      logger.error(`Failed to fetch session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all sessions for a user with pagination and filters.
   *
   * ✅ FIX: sessionRepository.findAll now returns { data, total }.
   * Previously this was destructured as an array [sessions, total] which was wrong.
   */
  async getAllSessions(
    userId: string,
    role: 'mentor' | 'mentee',
    page: number = 1,
    limit: number = 10,
    filters?: SessionFilters,
    _authToken?: string
  ): Promise<any> {
    try {
      const query: any = {};

      if (role === 'mentor') {
        const mentor = await Mentor.findOne({ userId, isDeleted: false });
        if (!mentor) throw new NotFoundError('MENTOR_NOT_FOUND');
        query.mentorId = mentor.mentorId;
      } else {
        query.menteeId = userId;
      }

      if (filters?.status)      query.status      = filters.status;
      if (filters?.sessionType) query.sessionType  = filters.sessionType;
      if (filters?.startDate || filters?.endDate) {
        query.scheduledAt = {};
        if (filters.startDate) query.scheduledAt.$gte = filters.startDate;
        if (filters.endDate)   query.scheduledAt.$lte = filters.endDate;
      }

      const skip = (page - 1) * limit;

      // ✅ FIX: findAll returns { data, total } — not [sessions, total]
      const { data: sessions, total } = await sessionRepository.findAll(query, skip, limit);

      return { sessions, total, page, limit };
    } catch (error: any) {
      logger.error(`Failed to fetch sessions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get ALL sessions (admin use) — no user filter
   */
  async getAllSessionsFromDB(page: number = 1, limit: number = 10): Promise<any> {
    try {
      logger.info('Fetching all sessions from database');
      const skip = (page - 1) * limit;

      // ✅ FIX: findAll returns { data, total }
      const { data: sessions, total } = await sessionRepository.findAll({}, skip, limit);
      return { sessions, total, page, limit };
    } catch (error: any) {
      logger.error(`Failed to fetch all sessions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get upcoming sessions for a user
   */
  async getUpcomingSessions(
    userId: string,
    role: 'mentor' | 'mentee',
    limit: number = 10,
    _authToken?: string
  ): Promise<any[]> {
    try {
      const query: any = {
        scheduledAt: { $gt: new Date() },
        status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      };

      if (role === 'mentor') {
        query.mentorId = userId;
      } else {
        query.menteeId = userId;
      }

      return await SessionMentor.find(query)
        .sort({ scheduledAt: 1 })
        .limit(limit)
        .lean();
    } catch (error: any) {
      logger.error(`Failed to fetch upcoming sessions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get past sessions for a user
   */
  async getPastSessions(
    userId: string,
    role: 'mentor' | 'mentee',
    limit: number = 10,
    _authToken?: string
  ): Promise<any[]> {
    try {
      const query: any = {
        scheduledAt: { $lt: new Date() },
        status: BookingStatus.COMPLETED,
      };

      if (role === 'mentor') {
        query.mentorId = userId;
      } else {
        query.menteeId = userId;
      }

      return await SessionMentor.find(query)
        .sort({ scheduledAt: -1 })
        .limit(limit)
        .lean();
    } catch (error: any) {
      logger.error(`Failed to fetch past sessions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update session (only allowed fields: notes, description, title)
   *
   * ✅ FIX: Uses getSessionById which correctly resolves mentor authorization.
   */
  async updateSession(
    sessionId: string,
    userId: string,
    updates: Partial<any>,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getSessionById(sessionId, userId, authToken);

      const allowedUpdates = ['notes', 'description', 'title'];
      const isValidUpdate  = Object.keys(updates).every((key) => allowedUpdates.includes(key));

      if (!isValidUpdate) {
        throw new BadRequestError('Invalid update fields. Only notes, description, title are allowed.');
      }

      Object.assign(session, updates);
      await session.save();

      return session;
    } catch (error: any) {
      logger.error(`Failed to update session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Confirm a booking on a session (mentor only)
   */
  async confirmSession(
    sessionId: string,
    userId: string,
    authToken?: string,
    bookingId?: string
  ): Promise<any> {
    try {
      const session = await this.getSessionById(sessionId, userId, authToken);

      const mentor = await Mentor.findOne({ userId });
      if (!mentor || session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the mentor of this session can confirm bookings');
      }

      if (bookingId) {
        const booking = session.bookings?.find((b: any) => b.bookedBy === bookingId);
        if (!booking) throw new BadRequestError('Booking not found');
        if (booking.status !== 'pending') throw new BadRequestError('Booking is not pending');

        session.bookings = session.bookings.map((b: any) =>
          b.bookedBy === bookingId ? { ...b, status: 'confirmed' } : b
        );
      } else {
        const hasPending = session.bookings?.some((b: any) => b.status === 'pending');
        if (!hasPending) throw new BadRequestError('No pending bookings to confirm');

        session.bookings = session.bookings?.map((b: any) =>
          b.status === 'pending' ? { ...b, status: 'confirmed' } : b
        );
      }

      await session.save();
      logger.info(`Session confirmed: ${sessionId}, bookedBy: ${bookingId}`);
      return session;
    } catch (error: any) {
      logger.error(`Failed to confirm session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start session (mentor only).
   *
   * ✅ FIX: Correctly compares mentor.mentorId vs session.mentorId.
   * userId from JWT is the user UUID — must look up mentor profile first.
   */
  async startSession(sessionId: string, userId: string, authToken?: string): Promise<any> {
    try {
      logger.info(`Starting session: ${sessionId}`);

      const session = await this.getSessionById(sessionId, userId, authToken);

      const mentor = await Mentor.findOne({ userId, isDeleted: false });
      if (!mentor || session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the mentor of this session can start it');
      }

      if (session.status !== BookingStatus.CONFIRMED) {
        throw new BadRequestError('Session must be confirmed before starting');
      }

      await session.startSession();
      logger.info(`Session started: ${sessionId}`);
      return session;
    } catch (error: any) {
      logger.error(`Failed to start session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Complete session (mentor only).
   *
   * ✅ FIX: Correctly compares mentor.mentorId vs session.mentorId.
   * Previously compared session.mentorId (UUID format) against userId (user UUID) directly.
   */
  async completeSession(
    sessionId: string,
    userId: string,
    completionData: {
      actualDuration?: number;
      wasSuccessful?: boolean;
      followUpRequired?: boolean;
      followUpNotes?: string;
    },
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getSessionById(sessionId, userId, authToken);

      const mentor = await Mentor.findOne({ userId, isDeleted: false });
      if (!mentor || session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the mentor of this session can complete it');
      }

      await session.completeSession(
        completionData.actualDuration,
        completionData.wasSuccessful,
        completionData.followUpRequired,
        completionData.followUpNotes
      );

      logger.info(`Session completed: ${sessionId}`);

      // TODO: Update mentor stats
      // TODO: Send notification for review request

      return session;
    } catch (error: any) {
      logger.error(`Failed to complete session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cancel session
   *
   * ✅ Note: Refund logic is intentionally not duplicated here.
   * Call refund.service.processRefund() separately after cancelling,
   * or use booking.service.cancelBooking() which does both.
   */
  async cancelSession(
    sessionId: string,
    userId: string,
    reason: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getSessionById(sessionId, userId, authToken);

      const hoursDiff    = (session.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
      const refundEligible = hoursDiff >= 24;

      await session.cancelSession(userId, reason, refundEligible);
      logger.info(`Session cancelled: ${sessionId}`);

      return session;
    } catch (error: any) {
      logger.error(`Failed to cancel session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reschedule session
   */
  async rescheduleSession(
    sessionId: string,
    userId: string,
    newScheduledAt: Date,
    _reason?: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getSessionById(sessionId, userId, authToken);

      const hoursDiff = (session.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursDiff < 24) {
        throw new BadRequestError('Cannot reschedule within 24 hours of session');
      }

      if (newScheduledAt <= new Date()) {
        throw new BadRequestError('New scheduled time must be in the future');
      }

      await session.rescheduleSession(newScheduledAt, userId);
      logger.info(`Session rescheduled: ${sessionId}`);

      // TODO: Update calendar via calendarSync.service
      // TODO: Send notifications via notification.service

      return session;
    } catch (error: any) {
      logger.error(`Failed to reschedule session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add review to completed session
   */
  async addReview(
    sessionId: string,
    userId: string,
    rating: number,
    review: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getSessionById(sessionId, userId, authToken);

      if (session.status !== BookingStatus.COMPLETED) {
        throw new BadRequestError('Can only review completed sessions');
      }

      const mentor       = await Mentor.findOne({ userId, isDeleted: false });
      const reviewerType = mentor && session.mentorId === mentor.mentorId ? 'mentor' : 'mentee';

      await session.addReview(rating, review, reviewerType);
      logger.info(`Review added to session: ${sessionId}`);

      // TODO: Update mentor average rating

      return session;
    } catch (error: any) {
      logger.error(`Failed to add review: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get session statistics for a user
   */
  async getSessionStats(
    userId: string,
    role: 'mentor' | 'mentee',
    _authToken?: string
  ): Promise<any> {
    try {
      const matchField = role === 'mentor' ? 'mentorId' : 'menteeId';

      const stats = await SessionMentor.aggregate([
        { $match: { [matchField]: userId } },
        {
          $group: {
            _id: null,
            total:     { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', BookingStatus.COMPLETED] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', BookingStatus.CANCELLED] }, 1, 0] } },
            upcoming:  {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$scheduledAt', new Date()] },
                      { $in: ['$status', [BookingStatus.PENDING, BookingStatus.CONFIRMED]] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            totalRevenue: { $sum: '$pricing.basePrice' },
          },
        },
      ]);

      return stats[0] || {
        total: 0, completed: 0, cancelled: 0, upcoming: 0, totalRevenue: 0,
      };
    } catch (error: any) {
      logger.error(`Failed to fetch session stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Map session type to pricing field key
   */
  private mapSessionTypeToPrice(sessionType: SessionType): string {
    const mapping: Record<SessionType, string> = {
      [SessionType.QUICK_CALL]:      'quickCall',
      [SessionType.DEEP_DIVE]:       'deepDive',
      [SessionType.RESUME_REVIEW]:   'resumeReview',
      [SessionType.MOCK_INTERVIEW]:  'mockInterview',
      [SessionType.CAREER_PLANNING]: 'careerPlanning',
      [SessionType.PORTFOLIO_REVIEW]:'portfolioReview',
      [SessionType.ASK_QUERY]:       'askQuery',
      [SessionType.GROUP_SESSION]:   'groupSession',
    };
    return mapping[sessionType] as any;
  }
}

export default new MentorshipSessionService();