import mentorService from './mentor.service';
import { SESSION_DURATIONS, SessionType } from '@/shared/constants/sessionTypes';
import { PaymentMethod, PaymentStatus, ISessionMentor } from '@/Mentorship/interface/session.types';
import { Types } from 'mongoose';
import { Availability, Mentor, SessionMentor } from '../models';
import { logger } from '@/shared/logger.util';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/shared/errors/app.error';
import { TrustScoreEvents } from '../events/trustScore.events';
/**
 * ============================================================
 * TEMP FIX SUMMARY
 * ------------------------------------------------------------
 * Purpose:
 * Minimal compatibility fixes for the mentorship booking flow.
 *
 * Changes:
 * - Fixed booking lifecycle compatibility.
 * - Fixed mentee session retrieval using bookings[].
 * - Preserved existing API contracts.
 * - No database/schema changes.
 *
 * Notes:
 * These are temporary compatibility fixes only.
 * A future architecture refactor should separate reusable
 * service templates from actual booked session instances.
 * ============================================================
 */
import { User } from '@/shared/models/index.models';
import { BookingStatus } from '@/shared/constants/bookingStatus';
import sessionRepository from '../repositories/session.repository';
import mentorRepository from '../repositories/mentor.repository';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

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
  private async uploadImageToCloudinary(buffer: Buffer, sessionId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'session-thumbnails',
          public_id: `session_${sessionId}_${Date.now()}`,
          resource_type: 'image',
          transformation: [
            { width: 1200, height: 1200, crop: 'limit' },
            { quality: 'auto:good' },
          ],
          overwrite: true,
        },
        (error: any, result: any) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      );
      uploadStream.end(buffer);
    });
  }

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
  async createMentorSession(mentorUserId: string, input: any, file?: any): Promise<any> {
    try {
      logger.info(`Creating mentor session template by: ${mentorUserId}`);

      const mentor = await Mentor.findOne({ userId: mentorUserId, isDeleted: false });
      if (!mentor) throw new NotFoundError('Mentor profile not found');

      if (file) {
        input.thumbnailImage = await this.uploadImageToCloudinary(file.buffer, mentorUserId);
      }

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
        thumbnailImage: input.thumbnailImage,
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

      const sessions = await SessionMentor.find({ mentorId })
        .sort({ scheduledAt: 1 })
        .lean();

      /**
       * Mentee Enrichment
       *
       * We intentionally enrich mentee data on the backend instead of
       * forcing the mobile application to perform N+1 profile requests.
       *
       * Benefits:
       * - Single API request from React Native
       * - Faster rendering on mobile networks
       * - Reduced battery and bandwidth usage
       * - Consistent payload shape for BookingsPage
       *
       * We use a 2-query in-memory mapping strategy instead of MongoDB
       * aggregation lookups because SessionMentor stores UUID strings
       * rather than ObjectId references and nested booking lookups would
       * require expensive unwind/group operations.
       */
      const userIds = new Set<string>();

      sessions.forEach((session: ISessionMentor) => {
        if (session.menteeId) {
          userIds.add(session.menteeId);
        }
        if (session.bookings && Array.isArray(session.bookings)) {
          session.bookings.forEach((booking: any) => {
            if (booking.menteeId) userIds.add(booking.menteeId);
            if (booking.bookedBy) userIds.add(booking.bookedBy);
          });
        }
      });

      if (userIds.size === 0) {
        return sessions;
      }

      const users = await User.find({ userId: { $in: Array.from(userIds) } })
        .select('userId firstName lastName email profilePhotoId')
        .lean();

      interface EnrichedMentee {
        userId: string;
        fullName: string;
        email: string;
        profilePic: string;
      }
      type SessionBooking = NonNullable<ISessionMentor['bookings']>[0];
      interface EnrichedBooking extends SessionBooking {
        mentee?: EnrichedMentee;
      }
      interface EnrichedSession extends Omit<ISessionMentor, 'bookings'> {
        mentee?: EnrichedMentee;
        bookings?: EnrichedBooking[];
      }

      const userMap = new Map<string, EnrichedMentee>();
      users.forEach((u: any) => {
        userMap.set(u.userId, {
          userId: u.userId,
          fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
          email: u.email,
          profilePic: u.profilePhotoId
        });
      });

      const enrichedSessions = sessions.map((session: ISessionMentor) => {
        const enriched: EnrichedSession = { ...session };
        
        if (session.menteeId && userMap.has(session.menteeId)) {
          enriched.mentee = userMap.get(session.menteeId);
        }

        if (session.bookings && Array.isArray(session.bookings)) {
          enriched.bookings = session.bookings.map((booking: SessionBooking) => {
            const bEnriched: EnrichedBooking = { ...booking };
            const targetId = booking.bookedBy || booking.menteeId;
            if (targetId && userMap.has(targetId)) {
              bEnriched.mentee = userMap.get(targetId);
            }
            return bEnriched;
          });
        }
        
        return enriched;
      });

      return enrichedSessions;
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
      console.log('>>> [SERVICE] bookSession started with input:', JSON.stringify(input, null, 2));
      logger.info(`Booking session: ${input.sessionId} by mentee: ${input.menteeId}`);

      let query: any = { sessionId: input.sessionId };
      if (Types.ObjectId.isValid(input.sessionId)) {
        query = { 
          $or: [
            { sessionId: input.sessionId },
            { _id: new Types.ObjectId(input.sessionId) }
          ]
        };
      }
      const session = await SessionMentor.findOne(query);
      if (!session) throw new NotFoundError('Session not found');

      // OLD IMPLEMENTATION (Reference)
      // if (session.status !== BookingStatus.AVAILABLE) {
      //   throw new BadRequestError('Session is not available for booking');
      // }
      
      // TEMP FIX (Pallav)
      // Reason: Session templates hold multiple bookings. Confirming one booking changes the template status, blocking new bookings.
      // Previous: Strictly required AVAILABLE status.
      // Current: Allows booking on active template states (AVAILABLE, CONFIRMED, IN_PROGRESS).
      // TODO: Refactor during architecture cleanup.
      if (
        session.status === BookingStatus.CANCELLED ||
        session.status === BookingStatus.NO_SHOW ||
        session.status === BookingStatus.REFUNDED
      ) {
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

      /**
       * TEMP FIX (Pallav)
       *
       * Compatibility layer for the legacy mentorship architecture.
       *
       * Existing modules (Authorization, Refunds, Notifications,
       * Interview, Cron, etc.) still read the root booking fields.
       *
       * Keep these fields synchronized with the first booking until
       * the backend is fully migrated to bookings[].
       * 
       * Controller logic check the menteeID throguh root 
       * Which was supposed to go though bookings array 
       */
      if (session.bookings.length === 1) {
        session.menteeId = input.menteeId;
        session.bookedBy = input.menteeId;
        session.bookedAt = new Date();
        session.isBooked = true;
      }

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
      console.log('>>> [SERVICE] ERROR in bookSession:', error);
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
      const completed = sessions.filter((s: ISessionMentor) => s.status === BookingStatus.COMPLETED).length;
      const left      = sessions.filter((s: ISessionMentor) => s.completion?.leftAt !== undefined).length;
      const totalTimeSpent = sessions
        .filter((s: ISessionMentor) => s.completion?.actualDuration)
        .reduce((acc: number, s: ISessionMentor) => acc + (s.completion?.actualDuration || 0), 0);

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
        // OLD IMPLEMENTATION (Reference)
        // const isMentee = session.menteeId === userId;
        // END OLD IMPLEMENTATION
        
        // TEMP FIX (Pallav)
        // Reason: Because bookings are appended to an array, the root menteeId is null.
        // Previous: Checked root menteeId only.
        // Current: Checks both root and within the bookings array.
        // TODO: Refactor during architecture cleanup.
        const isMentee = session.menteeId === userId || (session.bookings && session.bookings.some((b: any) => b.menteeId === userId));

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
        // OLD IMPLEMENTATION (Reference)
        // query.menteeId = userId;
        // END OLD IMPLEMENTATION
        
        // TEMP FIX (Pallav)
        // Reason: Because bookings are appended to an array, the root menteeId is null.
        // Previous: Queried root menteeId.
        // Current: Queries bookings.menteeId to allow mentees to see their sessions.
        // TODO: Refactor during architecture cleanup.
        query['bookings.menteeId'] = userId;
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
        // OLD IMPLEMENTATION (Reference)
        // query.menteeId = userId;
        // END OLD IMPLEMENTATION
        
        // TEMP FIX (Pallav)
        // Reason: Because bookings are appended to an array, the root menteeId is null.
        // Previous: Queried root menteeId.
        // Current: Queries bookings.menteeId to allow mentees to see their upcoming sessions.
        // TODO: Refactor during architecture cleanup.
        query['bookings.menteeId'] = userId;
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
        // OLD IMPLEMENTATION (Reference)
        // query.menteeId = userId;
        // END OLD IMPLEMENTATION
        
        // TEMP FIX (Pallav)
        // Reason: Because bookings are appended to an array, the root menteeId is null.
        // Previous: Queried root menteeId.
        // Current: Queries bookings.menteeId to allow mentees to see their past sessions.
        // TODO: Refactor during architecture cleanup.
        query['bookings.menteeId'] = userId;
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
    authToken?: string,
    file?: any
  ): Promise<any> {
    try {
      const session = await this.getSessionById(sessionId, userId, authToken);

      if (file) {
        updates.thumbnailImage = await this.uploadImageToCloudinary(file.buffer, userId);
      }

      const allowedUpdates = ['notes', 'description', 'title', 'thumbnailImage'];
      const isValidUpdate  = Object.keys(updates).every((key) => allowedUpdates.includes(key));

      if (!isValidUpdate) {
        throw new BadRequestError('Invalid update fields. Only notes, description, title, thumbnailImage are allowed.');
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

      if (!bookingId) {
        throw new BadRequestError('bookingId is required to confirm a session booking');
      }

      const booking = session.bookings?.find((b: any) => b._id?.toString() === bookingId);
      if (!booking) {
        const available = session.bookings?.map((b: any) => b._id?.toString());
        throw new BadRequestError(`Booking not found. Expected: ${bookingId}, Available: ${JSON.stringify(available)}`);
      }
      if (booking.status !== 'pending') {
        throw new BadRequestError(`Booking is not pending. Current status: ${booking.status}`);
      }

      // Perform an atomic update to avoid any Document.save() validation issues
      await SessionMentor.updateOne(
        { sessionId, 'bookings._id': bookingId },
        { 
          $set: { 
            'bookings.$.status': BookingStatus.CONFIRMED,
            status: BookingStatus.CONFIRMED
          } 
        }
      );

      logger.info(`Session confirmed: ${sessionId}, bookedBy/bookingId: ${bookingId}`);
      
      // Fetch the updated document returning lean for response
      return await SessionMentor.findOne({ sessionId });
    } catch (error: any) {
      logger.error(`Failed to confirm session (${sessionId}): ${error.message}`);
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

      const hasConfirmedBooking = session.bookings?.some((b: any) => 
        b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.RESCHEDULED
      );

      if (
        session.status !== BookingStatus.CONFIRMED && 
        session.status !== BookingStatus.RESCHEDULED &&
        !hasConfirmedBooking
      ) {
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

      TrustScoreEvents.emit('SessionCompleted', {
        mentorId: session.mentorId,
        sessionId,
        timestamp: new Date()
      });

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
    authToken: string | undefined,
    bookingId: string
  ): Promise<any> {
    try {
      if (!bookingId) {
        throw new BadRequestError('bookingId is required to cancel a session booking');
      }

      const session = await this.getSessionById(sessionId, userId, authToken);

      const booking = session.bookings?.find((b: any) => b._id?.toString() === bookingId);
      if (!booking) {
        throw new BadRequestError('Booking not found');
      }

      const hoursDiff    = (session.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
      const refundEligible = hoursDiff >= 24;

      const updateData: any = {
        $set: { 
          'bookings.$.status': BookingStatus.CANCELLED,
          'cancellation': {
            cancelledBy: userId,
            cancelledAt: new Date(),
            reason,
            refundEligible
          }
        }
      };

      if (session.sessionType !== SessionType.GROUP_SESSION) {
        updateData.$set.status = BookingStatus.CANCELLED;
      }

      await SessionMentor.updateOne(
        { sessionId, 'bookings._id': bookingId },
        updateData
      );

      TrustScoreEvents.emit('SessionCancelled', {
        mentorId: session.mentorId,
        sessionId,
        timestamp: new Date()
      });

      logger.info(`Session cancelled: ${sessionId}`);

      return session;
    } catch (error: any) {
      logger.error(`Failed to cancel session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reschedule sessio# STRICT Runtime Investigation – Determine the Correct Location for Review Submission UI

IMPORTANT

DO NOT MODIFY ANY CODE.

DO NOT CREATE ANY FILES.

DO NOT IMPLEMENT ANY UI.

This is a READ-ONLY investigation.

The previous audit confirmed:

- ReviewService.submitReview() exists.
- The backend review API works.
- There is currently no Review Submission UI.
- Users cannot submit reviews from the React Native app.

Your task is to determine the EXACT place where the review submission feature should live within the existing mentorship architecture.

====================================================
PHASE 1 — Locate the Mentee Completed Sessions
====================================================

Search the React Native project for every screen that displays sessions/bookings belonging to the mentee.

Examples include:

- My Sessions
- Session History
- Bookings
- Completed Sessions
- Dashboard
- Session Details

For every screen found, provide:

- File path
- Purpose
- Whether it displays completed sessions
- Whether it belongs to Mentor or Mentee

====================================================
PHASE 2 — Identify the Correct Entry Point
====================================================

Determine the best location to place the "Leave Review" action.

Do NOT assume.

Verify where the user naturally reaches a completed session.

State:

- Which component renders the completed session card.
- Which component owns the action buttons.
- Which file should be modified.

====================================================
PHASE 3 — Existing Session Data
====================================================

Inspect the completed session object passed to the UI.

Determine whether it already contains:

- sessionId
- mentorId
- mentorName
- mentorAvatar
- sessionStatus
- bookingStatus

Identify every field available without requiring another API call.

====================================================
PHASE 4 — Review Status Detection
====================================================

Determine how the frontend can know whether the session has already been reviewed.

Search for:

- reviewed
- hasReview
- reviewId
- isReviewed

If none exist:

Determine the smallest backend/frontend addition required.

Do NOT implement it.

====================================================
PHASE 5 — Existing UI Components
====================================================

Search for reusable components.

Examples:

- Star Rating
- Rating Input
- Modal
- Bottom Sheet
- TextArea
- Review Card

Determine whether existing components can be reused instead of creating duplicates.

====================================================
PHASE 6 — UX Investigation
====================================================

Determine the best UX.

Should the review be:

A.
A full screen

B.
A modal

C.
A bottom sheet

D.
Embedded inside Session Details

Justify your recommendation using the existing architecture.

====================================================
PHASE 7 — Navigation
====================================================

Verify whether a Session Details screen already exists.

If yes:

Would it be better to launch the review from Session Details?

If no:

Recommend the smallest UI addition.

====================================================
PHASE 8 — API Readiness
====================================================

Verify ReviewService.submitReview().

List its required payload.

Verify that every payload field already exists inside the completed session object.

If any field is missing:

Identify exactly where it should come from.

====================================================
PHASE 9 — Refresh Behaviour
====================================================

After a successful review, determine exactly what should refresh.

Examples:

- Completed sessions
- Mentor profile
- Review list
- Dashboard statistics
- Average rating

Explain which components need refreshing and which do not.

====================================================
PHASE 10 — Final Architecture Recommendation
====================================================

Provide:

1. Exact file that should contain the "Leave Review" button.

2. Exact file that should own the Review Modal.

3. Existing reusable components that should be reused.

4. New components (only if absolutely necessary).

5. Files that require modification.

6. APIs that will be called.

7. Complete user flow from:
Completed Session
→ Leave Review
→ Submit
→ Success
→ UI Refresh

IMPORTANT

Do NOT write code.

Do NOT implement anything.

Only produce the final architectural plan with the smallest possible implementation that follows the existing mentorship module architecture.n
   */
  async rescheduleSession(
    sessionId: string,
    userId: string,
    newScheduledAt: Date,
    reason: string | undefined,
    authToken: string | undefined,
    bookingId: string
  ): Promise<any> {
    try {
      if (!bookingId) {
        throw new BadRequestError('bookingId is required to reschedule a session booking');
      }

      const session = await this.getSessionById(sessionId, userId, authToken);
      const booking = session.bookings?.find((b: any) => b._id?.toString() === bookingId);
      if (!booking) {
        throw new BadRequestError('Booking not found');
      }

      // Use the specific booking's start time for the 24-hour check
      const existingStartTime = booking.scheduledAt || session.scheduledAt;
      const hoursDiff = (existingStartTime.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursDiff < 24) {
        throw new BadRequestError('Cannot reschedule less than 24 hours before start time');
      }

      if (newScheduledAt <= new Date()) {
        throw new BadRequestError('New scheduled time must be in the future');
      }

      const updateData: any = {
        $set: { 
          'bookings.$.status': BookingStatus.RESCHEDULED,
          'bookings.$.scheduledAt': newScheduledAt,
          'reschedule.lastRescheduledAt': new Date(),
          'reschedule.rescheduledBy': userId,
          'reschedule.reason': reason || 'Rescheduled by user'
        },
        $inc: { 'reschedule.count': 1 },
        $push: { 'reschedule.previousDates': session.scheduledAt }
      };

      if (session.sessionType !== SessionType.GROUP_SESSION) {
        updateData.$set.scheduledAt = newScheduledAt;
        updateData.$set.status = BookingStatus.RESCHEDULED;
      }

      await SessionMentor.updateOne(
        { sessionId, 'bookings._id': bookingId },
        updateData
      );
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