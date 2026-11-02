import mentorService from './mentor.service';
import { SESSION_DURATIONS, SessionType } from '@/shared/constants/sessionTypes';
import { PaymentMethod, PaymentStatus, ISessionMentor } from '@/Mentorship/interface/session.types';
import mongoose, { Types } from 'mongoose';
import { Mentor, SessionMentor, SeniorSession, Availability } from '../models';
import { DateTime } from 'luxon';
import availabilityService from './availability.service';
import { computeEndTime, toMinutes, toTimeString } from '@/Mentorship/utils/slotSplitter';
import { logger } from '@/shared/logger.util';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors/app.error';
import { TrustScoreEvents } from '../events/trustScore.events';
import NotificationService, { NotificationType, NotificationChannel } from './notification.service';
import { emitToUser } from '@/socket/emitter';
import { User } from '@/shared/models/index.models';
import { BookingStatus, isStartAllowed, START_LATE_LIMIT_MS } from '@/shared/constants/bookingStatus';
import sessionRepository from '../repositories/session.repository';
import mentorRepository from '../repositories/mentor.repository';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import { computePricingFromBase } from '@/Mentorship/utils/pricing.util';
import { IPayment, GatewayPaymentStatus, PaymentPurpose } from '../models/Payment';

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

  async createSession(input: CreateSessionInput, authToken?: string): Promise<any> {
    try {
      logger.info(`Creating session: ${input.sessionType}`);

      const mentor = await mentorRepository.findByMentorId(input.mentorId);
      if (!mentor) throw new NotFoundError('MENTOR_NOT_FOUND');

      const user = await User.findOne({ userId: input.menteeId, 'flags.isDeleted': false });
      if (!user) throw new NotFoundError('MENTEE_NOT_FOUND');

      const existingSession = await SessionMentor.findOne({
        mentorId: input.mentorId,
        menteeId: input.menteeId,
        scheduledAt: new Date(input.scheduledAt),
        status: { $nin: ['cancelled', 'no_show', 'refunded'] },
      });
      if (existingSession) {
        throw new BadRequestError(
          'You already have a booking with this mentor for this date and time.'
        );
      }

      const duration = SESSION_DURATIONS[input.sessionType];
      const isFree = input.paymentMethod === PaymentMethod.FREE;

      const basePrice = isFree ? 0 : input.pricing.basePrice;
      const platformFee = isFree ? 0 : input.pricing.platformFee;
      const totalAmount = isFree ? 0 : input.pricing.totalAmount;
      const currency = input.pricing?.currency || 'INR';

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
      logger.info(`Session created: ${session.sessionId}`);
      return session;
    } catch (error: any) {
      logger.error(`Failed to create session: ${error.message}`);
      throw error;
    }
  }

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
      logger.info(`Mentor session template created: ${session.sessionId}`);
      return session;
    } catch (error: any) {
      logger.error(`Failed to create mentor session: ${error.message}`);
      throw error;
    }
  }

  async getMentorAssignedSessions(mentorId: string): Promise<any[]> {
    try {
      logger.info(`Fetching assigned sessions for mentor: ${mentorId}`);

      const sessions = (await SessionMentor.find({ mentorId })
        .sort({ scheduledAt: 1 })
        .lean()) as unknown as ISessionMentor[];

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
   * Paid session ke liye options.payment (verified Razorpay payment) zaroori hai.
   * Ye param sirf payment.service se aata hai, HTTP body se nahi.
   */
  async bookSession(
    input: any,
    authToken?: string,
    options?: { payment?: IPayment }
  ): Promise<any> {
    try {
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
      let session = await SessionMentor.findOne(query);
      if (!session) throw new NotFoundError('Session not found');

      if (
        session.status === BookingStatus.CANCELLED ||
        session.status === BookingStatus.NO_SHOW ||
        session.status === BookingStatus.REFUNDED
      ) {
        throw new BadRequestError('Session is not available for booking');
      }

      if (session.mentorId !== input.mentorId) {
        throw new BadRequestError('Session does not belong to this mentor');
      }

      // Price server decide karta hai, client ka pricing ignore
      const pricing = computePricingFromBase(session.pricing?.basePrice);
      const isFreeSession = pricing.totalAmount === 0;
      const paidPayment = options?.payment;

      if (!isFreeSession) {
        if (
          !paidPayment ||
          paidPayment.status !== GatewayPaymentStatus.PAID ||
          paidPayment.purpose !== PaymentPurpose.SESSION_BOOKING ||
          paidPayment.userId !== input.menteeId ||
          paidPayment.context?.sessionId !== session.sessionId
        ) {
          throw new BadRequestError('Payment is required to book this session');
        }
        if (paidPayment.pricing?.totalAmount !== pricing.totalAmount) {
          throw new BadRequestError('Session price has changed. Please try booking again.');
        }
      }

      // Ek mentee ka ek mentor ke saath max active bookings
      const MAX_ACTIVE_PER_MENTOR = 3;
      const activeCount = await SessionMentor.countDocuments({
        mentorId: input.mentorId,
        bookings: {
          $elemMatch: {
            menteeId: input.menteeId,
            status: { $in: ['pending', 'confirmed', 'rescheduled', 'in_progress'] },
          },
        },
      });
      if (activeCount >= MAX_ACTIVE_PER_MENTOR) {
        throw new BadRequestError(
          `You can have at most ${MAX_ACTIVE_PER_MENTOR} active bookings with this mentor.`
        );
      }

      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      const [rawStart, rawEnd] = String(input.slotTime).split(' - ').map((t: string) => t.trim());
      if (!rawStart || !timeRegex.test(rawStart)) {
        throw new BadRequestError('Invalid slot time');
      }
      const slotStart = toTimeString(toMinutes(rawStart));
      const slotEnd = Number(session.duration) > 0
        ? computeEndTime(rawStart, Number(session.duration))
        : rawEnd;
      if (!slotEnd || !timeRegex.test(slotEnd)) {
        throw new BadRequestError('Invalid slot time');
      }

      // Duplicate check availability touch karne se pehle, sirf active statuses
      const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'rescheduled', 'in_progress'];
      const requestedTime = new Date(input.scheduledAt).getTime();
      const duplicateBooking = (session.bookings || []).find(
        (b: any) =>
          b.menteeId === input.menteeId &&
          b.scheduledAt &&
          new Date(b.scheduledAt).getTime() === requestedTime &&
          ACTIVE_BOOKING_STATUSES.includes(b.status)
      );
      if (duplicateBooking) {
        throw new ConflictError(
          'You already have an active booking for this session at this date and time. Please check "My Sessions" or choose a different slot.'
        );
      }

      const bookedRange = await availabilityService.bookRange(
        input.availabilityId,
        input.mentorId,
        slotStart,
        slotEnd,
        session.sessionId
      );
      if (!bookedRange) {
        throw new BadRequestError('This time slot is no longer available. Please pick another slot.');
      }

      const bookingPayment = isFreeSession
        ? {
          status: PaymentStatus.COMPLETED,
          method: PaymentMethod.FREE,
          paidAt: new Date(),
        }
        : {
          status: PaymentStatus.COMPLETED,
          method: 'razorpay',
          transactionId: paidPayment!.razorpayPaymentId,
          gatewayOrderId: paidPayment!.razorpayOrderId,
          gatewayPaymentId: paidPayment!.razorpayPaymentId,
          paidAt: paidPayment!.paidAt || new Date(),
        };

      const updatedSession = await SessionMentor.findOneAndUpdate(
        {
          sessionId: session.sessionId,
          status: { $nin: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW, BookingStatus.REFUNDED] },
          // Duplicate sirf tab maano jab same mentee ki same date/time par active booking ho
          bookings: {
            $not: {
              $elemMatch: {
                menteeId: input.menteeId,
                scheduledAt: new Date(input.scheduledAt),
                status: { $in: ['pending', 'confirmed', 'rescheduled', 'in_progress'] },
              },
            },
          },
        },
        {
          $push: {
            bookings: {
              menteeId: input.menteeId,
              bookedBy: input.menteeId,
              bookedAt: new Date(),
              status: 'pending',
              slotTime: `${slotStart} - ${slotEnd}`,
              scheduledAt: new Date(input.scheduledAt),
              availabilityId: input.availabilityId,
              payment: bookingPayment,
              pricing: {
                basePrice: pricing.basePrice,
                platformFee: pricing.platformFee,
                totalAmount: pricing.totalAmount,
                currency: pricing.currency,
              },
            } as any,
          },
          $set: {
            menteeId: input.menteeId,
            bookedBy: input.menteeId,
            bookedAt: new Date(),
            isBooked: true,
          },
        },
        { new: true }
      );

      if (!updatedSession) {
        await availabilityService.releaseRange(input.availabilityId, slotStart, slotEnd);

        const latest: any = await SessionMentor.findOne({ sessionId: session.sessionId }).lean();
        if (
          !latest ||
          [BookingStatus.CANCELLED, BookingStatus.NO_SHOW, BookingStatus.REFUNDED].includes(latest.status)
        ) {
          throw new BadRequestError('Session is not available for booking');
        }
        throw new ConflictError(
          'You already have an active booking for this session at this date and time.'
        );
      }

      session = updatedSession;

      logger.info(`Booking added: ${session.sessionId} for mentee: ${input.menteeId}`);

      try {
        const [mentorDoc, menteeDoc] = await Promise.all([
          Mentor.findOne({ mentorId: session.mentorId, isDeleted: false }),
          User.findOne({ userId: input.menteeId }),
        ]);

        const menteeName =
          menteeDoc?.fullName ||
          `${menteeDoc?.firstName || ''} ${menteeDoc?.lastName || ''}`.trim() ||
          menteeDoc?.email ||
          'A user';

        if (mentorDoc?.userId) {
          NotificationService.sendNotification({
            userId: mentorDoc.userId,
        module: 'industry-mentor',
            type: NotificationType.NEW_BOOKING_REQUEST,
            channels: [NotificationChannel.IN_APP],
            data: {
              menteeId: input.menteeId,
              menteeName,
              title: 'New Booking Request',
              message: `${menteeName} sent a new booking request for "${session.title}".`,
            },
          }).catch((e) => logger.error('Notification failed (bookSession -> mentor):', e));
        }

        NotificationService.sendNotification({
          userId: input.menteeId,
        module: 'industry-mentor',
          type: NotificationType.BOOKING_CONFIRMED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: 'Booking Request Sent',
            message: `Your booking request for "${session.title}" has been sent to the mentor.`,
          },
        }).catch((e) => logger.error('Notification failed (bookSession -> mentee):', e));

        if (!isFreeSession) {
          NotificationService.sendNotification({
            userId: input.menteeId,
        module: 'industry-mentor',
            type: NotificationType.PAYMENT_SUCCESS,
            channels: [NotificationChannel.IN_APP],
            data: {
              title: 'Payment Successful',
              message: `Your payment of Rs.${pricing.totalAmount} for "${session.title}" was successful.`,
              amount: pricing.totalAmount,
              transactionId: paidPayment!.razorpayPaymentId,
            },
          }).catch((e) => logger.error('Notification failed (bookSession -> payment):', e));
        }
      } catch (notifErr: any) {
        logger.warn(`Failed to send booking-request notification: ${notifErr.message}`);
      }

      const bookings = session.bookings ?? [];
      const myBooking = bookings[bookings.length - 1];
      return {
        sessionId: session.sessionId,
        mentorId: session.mentorId,
        title: session.title,
        sessionType: session.sessionType,
        duration: session.duration,
        booking: myBooking,
        totalBookings: bookings.length,
      };
    } catch (error: any) {
      logger.error(`Failed to book session: ${error.message}`);
      throw error;
    }
  }

  async getSessionProgress(sessionId: string, userId: string): Promise<any> {
    try {
      const sessions = (await SessionMentor.find({
        $or: [{ menteeId: userId }, { mentorId: userId }],
      }).lean()) as unknown as ISessionMentor[];

      const total = sessions.length;
      const completed = sessions.filter((s: ISessionMentor) => s.status === BookingStatus.COMPLETED).length;
      const left = sessions.filter((s: ISessionMentor) => s.completion?.leftAt !== undefined).length;
      const totalTimeSpent = sessions
        .filter((s: ISessionMentor) => s.completion?.actualDuration)
        .reduce((acc: number, s: ISessionMentor) => acc + (s.completion?.actualDuration || 0), 0);

      return {
        totalSessionsBooked: total,
        completedSessions: completed,
        leftSessions: left,
        totalTimeSpentMinutes: totalTimeSpent,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    } catch (error: any) {
      logger.error(`Failed to fetch session progress: ${error.message}`);
      throw error;
    }
  }

  async getSessionById(
    sessionId: string,
    userId?: string,
    _authToken?: string,
    options?: { intent?: string }
  ): Promise<any> {
    try {
      logger.info(`Fetching session: ${sessionId}`);

      const session = await SessionMentor.findOne({ sessionId });
      if (!session) throw new NotFoundError('Session not found');

      if (userId) {
        const mentor = await Mentor.findOne({
          $or: [
            { userId },
            ...(mongoose.isValidObjectId(userId) ? [{ _id: userId }] : []),
            { mentorId: userId },
          ],
          isDeleted: false,
        }).lean();
        const isMentor =
          (mentor && (
            session.mentorId === mentor.mentorId ||
            session.mentorId?.toString() === mentor._id?.toString() ||
            session.mentorId?.toString() === mentor.userId?.toString()
          )) ||
          session.mentorId?.toString() === userId;
        const isMentee =
          session.menteeId === userId ||
          (session.bookings && session.bookings.some((b: any) => b.menteeId === userId || b.bookedBy === userId));

        if (!isMentor && !isMentee) {
          throw new ForbiddenError('You are not authorized to view this session');
        }

        if (options?.intent === 'join') {
          // Mentee tabhi join kar sakta hai jab uski apni booking mentor ne start kar di ho
          // (group session ka flow alag hai, use yahan nahi rokte)
          if (!isMentor && session.sessionType !== SessionType.GROUP_SESSION) {
            const myBooking: any = (session.bookings || []).find(
              (b: any) =>
                (b.menteeId === userId || b.bookedBy === userId) &&
                b.status === BookingStatus.IN_PROGRESS
            );
            if (!myBooking) {
              const err: any = new BadRequestError('The mentor has not started this session yet.');
              err.code = 'NOT_STARTED';
              throw err;
            }
            // Pehla join record karo (idempotent). autoComplete isi se completed / no_show tay karega.
            if (!myBooking.menteeJoinedAt) {
              await SessionMentor.updateOne(
                {
                  sessionId,
                  bookings: { $elemMatch: { _id: myBooking._id, menteeJoinedAt: { $exists: false } } },
                } as any,
                { $set: { 'bookings.$.menteeJoinedAt': new Date() } }
              ).catch((e: any) => logger.warn(`menteeJoinedAt save failed: ${e.message}`));
            }
          }


          // If session is already in_progress, allow participants to join/reconnect
          if (session.status !== 'in_progress') {
            const bookingScheduledAt = (session.bookings && session.bookings[0]?.scheduledAt) || session.scheduledAt;
            const startMs = new Date(bookingScheduledAt).getTime();
            const earlyMinutes = 15;
            const joinOpensAt = startMs - earlyMinutes * 60 * 1000;
            const durationMinutes = Number(session.duration || (session.bookings as any)?.[0]?.slotDuration || 60);
            const bufferMinutes = 60;
            const endMs = session.endedAt
              ? new Date(session.endedAt).getTime()
              : startMs + (durationMinutes + bufferMinutes) * 60 * 1000;
            const now = Date.now();

            if (
              session.status === 'cancelled' ||
              session.status === 'completed' ||
              session.status === 'no_show' ||
              session.status === 'missed' ||
              session.status === 'refunded'
            ) {


              const err: any = new BadRequestError('Session has ended or is no longer active');
              err.code = 'SESSION_ENDED';
              throw err;
            }

            if (now < joinOpensAt) {
              const err: any = new BadRequestError('Session cannot be started yet - too early.');
              err.code = 'TOO_EARLY';
              throw err;
            }

            if (now > endMs) {
              const err: any = new BadRequestError('Session start window has expired.');
              err.code = 'WINDOW_EXPIRED';
              throw err;
            }
          }
        }
      }

      return session;
    } catch (error: any) {
      logger.error(`Failed to fetch session: ${error.message}`);
      throw error;
    }
  }

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
        query['bookings.menteeId'] = userId;
      }

      if (filters?.status) query.status = filters.status;
      if (filters?.sessionType) query.sessionType = filters.sessionType;
      if (filters?.startDate || filters?.endDate) {
        query.scheduledAt = {};
        if (filters.startDate) query.scheduledAt.$gte = filters.startDate;
        if (filters.endDate) query.scheduledAt.$lte = filters.endDate;
      }

      const skip = (page - 1) * limit;

      const { data: sessions, total } = await sessionRepository.findAll(query, skip, limit);

      let mergedSessions = sessions;
      let mergedTotal = total;

      if (role === 'mentee') {
        try {
          const seniorSessions = await SeniorSession.find({
            $or: [
              { 'bookings.menteeId': userId },
              { 'bookings.bookedBy': userId },
            ],
          }).lean();

          if (seniorSessions && seniorSessions.length > 0) {
            mergedSessions = [...sessions, ...seniorSessions];
            mergedTotal = total + seniorSessions.length;
          }
        } catch (seniorErr: any) {
          logger.warn(`Failed to include senior sessions for mentee: ${seniorErr.message}`);
        }
      }

      return { sessions: mergedSessions, total: mergedTotal, page, limit };
    } catch (error: any) {
      logger.error(`Failed to fetch sessions: ${error.message}`);
      throw error;
    }
  }

  async getAllSessionsFromDB(page: number = 1, limit: number = 10): Promise<any> {
    try {
      logger.info('Fetching all sessions from database');
      const skip = (page - 1) * limit;

      const { data: sessions, total } = await sessionRepository.findAll({}, skip, limit);
      return { sessions, total, page, limit };
    } catch (error: any) {
      logger.error(`Failed to fetch all sessions: ${error.message}`);
      throw error;
    }
  }

  async getUpcomingSessions(
    userId: string,
    role: 'mentor' | 'mentee',
    limit: number = 10,
    _authToken?: string
  ): Promise<any[]> {
    try {
      const query: any = {
        scheduledAt: { $gt: new Date() },
        status: {
          $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED],
        },
      };

      if (role === 'mentor') {
        const mentor = await Mentor.findOne({ userId, isDeleted: false });
        if (!mentor) throw new NotFoundError('MENTOR_NOT_FOUND');
        query.mentorId = mentor.mentorId;
      } else {
        query['bookings.menteeId'] = userId;
      }

      const { data } = await sessionRepository.findAll(query, 0, limit, 1);
      if (role === 'mentee') {
        try {
          const seniorSessions = await SeniorSession.find({
            $or: [
              { 'bookings.menteeId': userId },
              { 'bookings.bookedBy': userId },
            ],
            'bookings.status': { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, 'upcoming'] },
          }).lean();
          if (seniorSessions && seniorSessions.length > 0) {
            return [...data, ...seniorSessions];
          }
        } catch (seniorErr: any) {
          logger.warn(`Failed to include senior sessions in getUpcomingSessions: ${seniorErr.message}`);
        }
      }
      return data;
    } catch (error: any) {
      logger.error(`Failed to fetch upcoming sessions: ${error.message}`);
      throw error;
    }
  }

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
        const mentor = await Mentor.findOne({ userId, isDeleted: false });
        if (!mentor) throw new NotFoundError('MENTOR_NOT_FOUND');
        query.mentorId = mentor.mentorId;
      } else {
        query['bookings.menteeId'] = userId;
      }

      const { data } = await sessionRepository.findAll(query, 0, limit);
      return data;
    } catch (error: any) {
      logger.error(`Failed to fetch past sessions: ${error.message}`);
      throw error;
    }
  }

  async updateSession(
    sessionId: string,
    userId: string,
    updates: Partial<any>,
    authToken?: string,
    file?: any
  ): Promise<any> {
    try {
      await this.getSessionById(sessionId, userId, authToken);

      if (file) {
        updates.thumbnailImage = await this.uploadImageToCloudinary(file.buffer, userId);
      }

      const allowedUpdates = ['notes', 'description', 'title', 'thumbnailImage', 'scheduledAt', 'duration', 'pricing', 'followUp', 'bufferTimeMinutes'];
      const isValidUpdate = Object.keys(updates).every((key) => allowedUpdates.includes(key));

      if (!isValidUpdate) {
        throw new BadRequestError('Invalid update fields. Only notes, description, title, thumbnailImage, scheduledAt, duration, pricing, followUp, bufferTimeMinutes are allowed.');
      }

      if (updates.scheduledAt) {
        updates.scheduledAt = new Date(updates.scheduledAt);
      }

      const updatedSession = await SessionMentor.findOneAndUpdate(
        { sessionId },
        { $set: updates },
        { new: true, runValidators: false }
      );

      if (!updatedSession) {
        throw new NotFoundError('Session not found after update');
      }

      return updatedSession;
    } catch (error: any) {
      logger.error(`Failed to update session: ${error.message}`);
      throw error;
    }
  }

  async deleteSession(sessionId: string, userId: string, authToken?: string): Promise<void> {
    try {
      const session = await this.getSessionById(sessionId, userId, authToken);

      const mentor = await Mentor.findOne({ userId, isDeleted: false });
      if (!mentor || session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the mentor of this session can delete it');
      }

      const hasActiveBooking = (session.bookings || []).some(
        (b: any) =>
          ![BookingStatus.CANCELLED, BookingStatus.MISSED, BookingStatus.REFUNDED].includes(b.status)
      );
      if (hasActiveBooking) {
        throw new BadRequestError('Cannot delete a session with active bookings. Cancel the bookings first.');
      }

      await SessionMentor.deleteOne({ sessionId });
      logger.info(`Session deleted: ${sessionId}`);
    } catch (error: any) {
      logger.error(`Failed to delete session: ${error.message}`);
      throw error;
    }
  }

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

      // Slot ka time nikal gaya to accept nahi ho sakta: booking ko missed mark karo
      const bookingStartMs = new Date(booking.scheduledAt || session.scheduledAt).getTime();
      if (!Number.isNaN(bookingStartMs) && Date.now() >= bookingStartMs) {
        await this.ensureMissedIfOverdue(sessionId, bookingId).catch(() => undefined);
        throw new BadRequestError(
          'This booking request has expired because the slot time has passed. It can no longer be accepted.'
        );
      }

      const confirmResult = await SessionMentor.updateOne(
        { sessionId, bookings: { $elemMatch: { _id: bookingId, status: 'pending' } } } as any,
        {
          $set: {
            'bookings.$.status': BookingStatus.CONFIRMED,
            status: BookingStatus.CONFIRMED
          }
        }
      );
      if (confirmResult.modifiedCount === 0) {
        throw new ConflictError('Booking status just changed. Please refresh and try again.');
      }

      logger.info(`Session confirmed: ${sessionId}, bookedBy/bookingId: ${bookingId}`);

      const menteeIdToNotify = booking.menteeId || booking.bookedBy;
      if (menteeIdToNotify) {
        NotificationService.sendNotification({
          userId: menteeIdToNotify,
        module: 'industry-mentor',
          type: NotificationType.BOOKING_CONFIRMED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: 'Booking Confirmed',
            message: `Your session "${session.title}" has been confirmed by the mentor.`,
          },
        }).catch((e) => logger.error('Notification failed (confirmSession):', e));
      }

      return await SessionMentor.findOne({ sessionId });
    } catch (error: any) {
      logger.error(`Failed to confirm session (${sessionId}): ${error.message}`);
      throw error;
    }
  }

  async startSession(
    sessionId: string,
    userId: string,
    authToken?: string,
    bookingId?: string
  ): Promise<any> {
    try {
      logger.info(`Starting session: ${sessionId}, booking: ${bookingId}`);

      const session = await this.getSessionById(sessionId, userId, authToken);

      const mentor = await Mentor.findOne({ userId, isDeleted: false });
      if (!mentor || session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the mentor of this session can start it');
      }

      let targetBooking: any = null;
      if (bookingId) {
        targetBooking = session.bookings?.find((b: any) => b._id?.toString() === bookingId);
        if (!targetBooking) throw new NotFoundError('Booking not found on this session');
      } else {
        const confirmed = (session.bookings || []).filter((b: any) =>
          b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.RESCHEDULED
        );
        if (confirmed.length > 1) {
          throw new BadRequestError('Multiple bookings found on this session - bookingId is required');
        }
        targetBooking = confirmed[0] || null;
      }

      if (!targetBooking || (targetBooking.status !== BookingStatus.CONFIRMED && targetBooking.status !== BookingStatus.RESCHEDULED)) {
        throw new BadRequestError('Booking must be confirmed before starting');
      }

      const bookingScheduledAt = targetBooking.scheduledAt || session.scheduledAt;
      if (!isStartAllowed(bookingScheduledAt)) {
        const isTooEarly = Date.now() < new Date(bookingScheduledAt).getTime();
        const err: any = new Error(
          isTooEarly ? 'Session cannot be started yet - too early.' : 'Session start window has expired.'
        );
        err.code = isTooEarly ? 'TOO_EARLY' : 'WINDOW_EXPIRED';
        throw err;
      }

      const startedAtNow = new Date();
      await SessionMentor.updateOne(
        { sessionId, 'bookings._id': targetBooking._id },
        {
          $set: {
            'bookings.$.status': BookingStatus.IN_PROGRESS,
            'bookings.$.startedAt': startedAtNow,
            status: BookingStatus.IN_PROGRESS,
            startedAt: startedAtNow,
          },
        }
      );

      const updatedSession = await SessionMentor.findOne({ sessionId });
      logger.info(`Session started: ${sessionId}, booking: ${targetBooking._id}`);

      const menteeIdToNotify = targetBooking.menteeId || targetBooking.bookedBy;
      if (menteeIdToNotify) {
        NotificationService.sendNotification({
          userId: menteeIdToNotify,
        module: 'industry-mentor',
          type: NotificationType.SESSION_STARTED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: 'Session Started',
            message: `Your session "${session.title}" has started. Join now!`,
          },
        }).catch((e) => logger.error('Notification failed (startSession):', e));

        try {
          const payload = {
            sessionId: session.sessionId,
            bookingId: targetBooking._id?.toString(),
            roomId: targetBooking._id?.toString(),
            title: session.title,
            startedAt: startedAtNow,
            scheduledAt: targetBooking.scheduledAt || session.scheduledAt,
            meetingUrl: session.meeting?.meetingUrl || null,
          };
          emitToUser(menteeIdToNotify, 'session:started', payload);
          emitToUser(menteeIdToNotify, 'mentorship:session:started', payload);
        } catch (emitErr: any) {
          logger.error('Socket emit failed (session:started):', emitErr);
        }
      }

      return {
        ...(updatedSession?.toJSON ? updatedSession.toJSON() : updatedSession),
        roomId: targetBooking._id?.toString(),
      };
    } catch (error: any) {
      logger.error(`Failed to start session: ${error.message}`);
      throw error;
    }
  }

  async completeSession(
    sessionId: string,
    userId: string,
    completionData: {
      actualDuration?: number;
      wasSuccessful?: boolean;
      followUpRequired?: boolean;
      followUpNotes?: string;
    },
    authToken?: string,
    bookingId?: string
  ): Promise<any> {
    try {
      const session = await this.getSessionById(sessionId, userId, authToken);

      const mentor = await Mentor.findOne({ userId, isDeleted: false });
      if (!mentor || session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the mentor of this session can complete it');
      }

      let targetBooking: any = null;
      if (bookingId) {
        targetBooking = session.bookings?.find((b: any) => b._id?.toString() === bookingId);
        if (!targetBooking) throw new NotFoundError('Booking not found on this session');
      } else {
        const inProgress = (session.bookings || []).filter(
          (b: any) => b.status === BookingStatus.IN_PROGRESS
        );
        if (inProgress.length > 1) {
          throw new BadRequestError('Multiple in-progress bookings found - bookingId is required');
        }
        targetBooking = inProgress[0] || null;
      }

      if (!targetBooking || targetBooking.status !== BookingStatus.IN_PROGRESS) {
        throw new BadRequestError('Booking must be in progress before it can be completed');
      }

      const now = new Date();
      const actualDuration =
        completionData.actualDuration ??
        (targetBooking.startedAt
          ? Math.round((now.getTime() - new Date(targetBooking.startedAt).getTime()) / 60000)
          : session.duration);

      await SessionMentor.updateOne(
        { sessionId, 'bookings._id': targetBooking._id },
        {
          $set: {
            'bookings.$.status': BookingStatus.COMPLETED,
            'bookings.$.completion': {
              completedAt: now,
              actualDuration,
              wasSuccessful: completionData.wasSuccessful ?? true,
              followUpRequired: completionData.followUpRequired ?? false,
              followUpNotes: completionData.followUpNotes,
            },
          },
        }
      );

      let updatedSession = await SessionMentor.findOne({ sessionId });

      const allBookingsFinal = (updatedSession?.bookings || []).every((b: any) =>
        [
          BookingStatus.COMPLETED,
          BookingStatus.CANCELLED,
          BookingStatus.NO_SHOW,
          BookingStatus.MISSED,
          BookingStatus.REFUNDED,
        ].includes(b.status)


      );
      if (allBookingsFinal && updatedSession && updatedSession.status !== BookingStatus.COMPLETED) {
        updatedSession.status = BookingStatus.COMPLETED;
        updatedSession.endedAt = now;
        await updatedSession.save();
      }

      TrustScoreEvents.emit('SessionCompleted', {
        mentorId: session.mentorId,
        sessionId,
        bookingId: targetBooking._id,
        timestamp: now,
      });

      logger.info(`Booking completed: ${sessionId} / ${targetBooking._id}`);

      try {
        const endedPayload = {
          sessionId: session.sessionId,
          bookingId: targetBooking._id?.toString(),
          roomId: targetBooking._id?.toString(),
          endedAt: now.toISOString(),
          endedBy: userId,
          status: BookingStatus.COMPLETED,
          actualDuration,
        };
        const endedMenteeId = targetBooking.menteeId || targetBooking.bookedBy;
        emitToUser(userId, 'session:ended', endedPayload);
        if (endedMenteeId) emitToUser(endedMenteeId, 'session:ended', endedPayload);
      } catch (emitErr: any) {
        logger.error('Socket emit failed (session:ended):', emitErr);
      }

      const menteeIdToNotify = targetBooking.menteeId || targetBooking.bookedBy;
      if (menteeIdToNotify) {
        NotificationService.sendNotification({
          userId: menteeIdToNotify,
        module: 'industry-mentor',
          type: NotificationType.SESSION_COMPLETED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: 'Session Completed',
            message: `Your session "${session.title}" is complete. Please leave a review!`,
            sessionId: session.sessionId,
            actionUrl: `/mentorship/user-dashboard/${menteeIdToNotify}?tab=reviews&review=${encodeURIComponent(session.sessionId)}`,
          },
        }).catch((e) => logger.error('Notification failed (completeSession):', e));
      }

      return updatedSession;
    } catch (error: any) {
      logger.error(`Failed to complete session: ${error.message}`);
      throw error;
    }
  }

  /**
 * Cron: jo bookings mentor ne start kiye (in_progress) par End nahi kiye, unhe
 * scheduled time + grace ke baad auto-complete karo. DB updates completeSession()
 * jaise hi hain, bas mentor auth check aur notifications ke bina.
 */
  async autoCompleteOverdueBookings(graceMinutes = 15): Promise<number> {
    const now = new Date();
    let closed = 0;

    const sessions = await SessionMentor.find({
      bookings: { $elemMatch: { status: BookingStatus.IN_PROGRESS } },
    });

    for (const session of sessions) {
      const durationMinutes = Math.max(Number(session.duration) || 60, 15);

      for (const booking of (session.bookings || []) as any[]) {
        if (booking.status !== BookingStatus.IN_PROGRESS) continue;

        const startMs = new Date(booking.scheduledAt || session.scheduledAt).getTime();
        if (Number.isNaN(startMs)) continue;

              // Mentee kabhi room me aaya? Haan => completed. Nahi => no_show (mentor ki galti nahi)
              const menteeAttended = !!booking.menteeJoinedAt;

              // Dono join hue the to end time ke thodi der baad (5 min) hi complete,
              // nahi to purani grace (15 min) ke baad no_show
              const effectiveGraceMinutes = menteeAttended ? 5 : graceMinutes;
              if (now.getTime() <= startMs + (durationMinutes + effectiveGraceMinutes) * 60000) continue;
              

        try {
          const result = await SessionMentor.updateOne(
            {
              sessionId: session.sessionId,
              bookings: { $elemMatch: { _id: booking._id, status: BookingStatus.IN_PROGRESS } },
            },
            {
              $set: menteeAttended
                ? {
                  'bookings.$.status': BookingStatus.COMPLETED,
                  'bookings.$.completion': {
                    completedAt: now,
                    actualDuration: durationMinutes,
                    wasSuccessful: true,
                    followUpRequired: false,
                  },
                }
                : {
                  'bookings.$.status': BookingStatus.NO_SHOW,
                  'bookings.$.noShowAt': now,
                },
            }
          );
          if (result.modifiedCount === 0) continue; // mentor ne beech me khud End kar diya

          const updated = await SessionMentor.findOne({ sessionId: session.sessionId });
          const allFinal = (updated?.bookings || []).every((b: any) =>
            [
              BookingStatus.COMPLETED,
              BookingStatus.CANCELLED,
              BookingStatus.NO_SHOW,
              BookingStatus.MISSED,
              BookingStatus.REFUNDED,
            ].includes(b.status)
          );
          if (updated && allFinal && updated.status !== BookingStatus.COMPLETED) {
            updated.status = menteeAttended ? BookingStatus.COMPLETED : BookingStatus.NO_SHOW;
            updated.endedAt = now;
            await updated.save();
          }

          if (menteeAttended) {
            TrustScoreEvents.emit('SessionCompleted', {
              mentorId: session.mentorId,
              sessionId: session.sessionId,
              bookingId: booking._id,
              timestamp: now,
            });
          }
          // Manual End jaisa hi: dono UIs refresh ho, mentee ko review ka notification mile
          try {
            const endedPayload = {
              sessionId: session.sessionId,
              bookingId: String(booking._id),
              roomId: String(booking._id),
              endedAt: now.toISOString(),
              endedBy: 'system',

              status: menteeAttended ? BookingStatus.COMPLETED : BookingStatus.NO_SHOW,
              actualDuration: durationMinutes,
              autoCompleted: true,
            };
            const endedMenteeId = booking.menteeId || booking.bookedBy;
            const endedMentor: any = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });
            if (endedMentor?.userId) emitToUser(endedMentor.userId, 'session:ended', endedPayload);
            if (endedMenteeId) {
              emitToUser(endedMenteeId, 'session:ended', endedPayload);

              NotificationService.sendNotification({
                userId: endedMenteeId,
        module: 'industry-mentor',
                type: menteeAttended ? NotificationType.SESSION_COMPLETED : NotificationType.SESSION_NO_SHOW,
                channels: [NotificationChannel.IN_APP],
                data: menteeAttended
                  ? {
                    title: 'Session Completed',
                    message: `Your session "${session.title}" is complete. Please leave a review!`,
                    sessionId: session.sessionId,
                    actionUrl: `/mentorship/user-dashboard/${endedMenteeId}?tab=reviews&review=${encodeURIComponent(session.sessionId)}`,
                  }
                  : {
                    title: 'You missed your session',
                    message: `The mentor started "${session.title}" but you did not join. Refund is not available for a no-show.`,
                    sessionId: session.sessionId,
                    bookingId: String(booking._id),
                    actionUrl: `/mentorship/user-dashboard/${endedMenteeId}?tab=my-bookings`,
                  },
              }).catch((e) => logger.error('Notification failed (auto-complete):', e));
              if (!menteeAttended && endedMentor?.userId) {
                NotificationService.sendNotification({
                  userId: endedMentor.userId,
        module: 'industry-mentor',
                  type: NotificationType.SESSION_NO_SHOW,
                  channels: [NotificationChannel.IN_APP],
                  data: {
                    title: 'Mentee did not join',
                    message: `The mentee did not join "${session.title}". It was marked as a no-show.`,
                    sessionId: session.sessionId,
                    bookingId: String(booking._id),
                  },
                }).catch((e) => logger.error('Notification failed (no-show → mentor):', e));
              }


            }
          } catch (emitErr: any) {
            logger.warn(`Auto-complete notify/emit failed: ${emitErr.message}`);
          }

          closed++;
        } catch (err: any) {
          logger.error(`Auto-complete failed for ${session.sessionId}/${booking._id}: ${err.message}`);
        }
      }
    }

    return closed;
  }


  /**
* Agar booking ka start window band ho chuka hai par cron ne abhi tak missed nahi kiya,
* to use abhi missed mark kar do (atomic). Mentee page ke "Missed" aur DB ke beech ka
* gap khatam karta hai. true return karta hai agar booking ab missed hai.
*/
  async ensureMissedIfOverdue(sessionId: string, bookingId: string): Promise<boolean> {
    const session: any = await SessionMentor.findOne({ sessionId });
    if (!session) return false;
    if (session.sessionType === SessionType.GROUP_SESSION) return false;

    const booking: any = (session.bookings || []).find(
      (b: any) => b._id?.toString() === bookingId
    );
    if (!booking) return false;
    if (booking.status === BookingStatus.MISSED) return true;

    const OPEN = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED];
    if (!OPEN.includes(booking.status)) return false;

    const startMs = new Date(booking.scheduledAt || session.scheduledAt).getTime();
    // Pending request slot start par expire; confirmed/rescheduled start + 15 min par
    const graceMs = booking.status === BookingStatus.PENDING ? 0 : START_LATE_LIMIT_MS;
    if (Number.isNaN(startMs) || Date.now() <= startMs + graceMs) return false;

    const claim = await SessionMentor.updateOne(
      {
        sessionId,
        bookings: { $elemMatch: { _id: booking._id, status: { $in: OPEN } } },
      } as any,
      { $set: { 'bookings.$.status': BookingStatus.MISSED, 'bookings.$.missedAt': new Date() } }
    );
    // modifiedCount 0 ho to cron ne beech me missed kar diya, wo bhi theek hai
    if (claim.modifiedCount === 0) {
      const fresh: any = await SessionMentor.findOne({ sessionId });
      const b2 = (fresh?.bookings || []).find((b: any) => b._id?.toString() === bookingId);
      return b2?.status === BookingStatus.MISSED;
    }

    const othersOpen = (session.bookings || []).some(
      (b: any) =>
        String(b._id) !== String(booking._id) &&
        [...OPEN, BookingStatus.IN_PROGRESS].includes(b.status)
    );
    if (!othersOpen) {
      await SessionMentor.updateOne(
        { sessionId, status: { $in: OPEN } } as any,
        { $set: { status: BookingStatus.MISSED } }
      );
    }
    // Claim humne jeeta, to notification bhi humi bhejenge (cron ab is booking ko skip karega)
    await this.sendMissedNotifications(session, booking, booking.status === BookingStatus.PENDING);
    return true;
  }

  private async sendMissedNotifications(session: any, booking: any, wasPending: boolean): Promise<void> {
    const menteeId: string | undefined = booking.menteeId || booking.bookedBy;
    const bookingId = String(booking._id);
    const paid = Number(booking.pricing?.totalAmount || session.pricing?.totalAmount || 0) > 0;
    const title = session.title || 'your session';
    const startMs = new Date(booking.scheduledAt || session.scheduledAt).getTime();

    if (menteeId) {
      NotificationService.sendNotification({
        userId: menteeId,
        module: 'industry-mentor',
        type: NotificationType.SESSION_MISSED,
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        priority: 'high',
        data: {
          title: wasPending ? 'Booking request expired' : 'Session missed',
          message: wasPending
            ? `The mentor did not respond to your request for "${title}" in time.${paid ? ' You can get a full refund or reschedule.' : ' You can reschedule.'}`
            : `Your session "${title}" did not start.${paid ? ' You can get a full refund or reschedule.' : ' You can reschedule.'}`,
          sessionId: session.sessionId,
          bookingId,
          scheduledAt: new Date(startMs).toISOString(),
          canRefund: paid,
          actions: paid ? ['refund', 'reschedule'] : ['reschedule'],
          actionUrl: `/mentorship/user-dashboard/${menteeId}?tab=my-bookings`,
        },
      }).catch((e) => logger.error('Notification failed (missed → mentee):', e));
    }

    const mentorDoc: any = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false }).catch(() => null);
    if (mentorDoc?.userId) {
      NotificationService.sendNotification({
        userId: mentorDoc.userId,
        module: 'industry-mentor',
        type: NotificationType.SESSION_MISSED,
        channels: [NotificationChannel.IN_APP],
        data: {
          ...(menteeId ? { menteeId } : {}),
          title: wasPending ? 'Booking request expired' : 'Session missed',
          message: wasPending
            ? `A booking request for "${title}" expired without a response.`
            : `You missed "${title}". The student has been notified.`,
          sessionId: session.sessionId,
          bookingId,
        },
      }).catch((e) => logger.error('Notification failed (missed → mentor):', e));
    }
  }


  /**
   * Cron: pending / confirmed / rescheduled booking jiska start window (scheduled + 15 min)
   * band ho gaya aur jo kabhi start nahi hui -> MISSED.
   * Mentee ko "refund ya reschedule" notification, mentor ko info.
   * Atomic claim ki wajah se multi-instance par bhi notification duplicate nahi hoti.
   */
  async markMissedBookings(): Promise<number> {
    const now = new Date();
    const cutoffMs = now.getTime() - START_LATE_LIMIT_MS;
    const ACTIVE = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED];
    const STILL_OPEN = [...ACTIVE, BookingStatus.IN_PROGRESS];
    let missed = 0;

    // Group sessions ka alag flow hai, unhe yahan touch nahi karte
    const sessions = await SessionMentor.find({
      sessionType: { $ne: SessionType.GROUP_SESSION },
      bookings: {
        $elemMatch: {
          $or: [
            { status: BookingStatus.PENDING, scheduledAt: { $lte: now } },
            {
              status: { $in: [BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED] },
              scheduledAt: { $lte: new Date(cutoffMs) },
            },
          ],
        },
      },
    } as any).limit(500);



    for (const session of sessions) {
      const mentorDoc: any = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });

      for (const booking of (session.bookings || []) as any[]) {
        if (!ACTIVE.includes(booking.status)) continue;
        const startMs = new Date(booking.scheduledAt || session.scheduledAt).getTime();
        const wasPending = booking.status === BookingStatus.PENDING;
        // Pending: slot start par expire. Confirmed/rescheduled: start + 15 min par.
        const expireAfterMs = wasPending ? now.getTime() : cutoffMs;
        if (Number.isNaN(startMs) || startMs > expireAfterMs) continue;

        try {
          const claim = await SessionMentor.updateOne(
            {
              sessionId: session.sessionId,
              bookings: { $elemMatch: { _id: booking._id, status: { $in: ACTIVE } } },
            } as any,
            { $set: { 'bookings.$.status': BookingStatus.MISSED, 'bookings.$.missedAt': now } }
          );
          if (claim.modifiedCount === 0) continue; // kisi aur run ne / mentor ne beech me badal diya

          // Top-level status tabhi badlo jab koi aur booking open na ho
          const othersOpen = (session.bookings || []).some(
            (b: any) => String(b._id) !== String(booking._id) && STILL_OPEN.includes(b.status)
          );
          if (!othersOpen) {
            await SessionMentor.updateOne(
              { sessionId: session.sessionId, status: { $in: ACTIVE } } as any,
              { $set: { status: BookingStatus.MISSED } }
            );
          }

          const menteeId: string | undefined = booking.menteeId || booking.bookedBy;
          const bookingId = String(booking._id);
          const paid = Number(booking.pricing?.totalAmount || session.pricing?.totalAmount || 0) > 0;
          const title = session.title || 'your session';

          if (menteeId) {
            NotificationService.sendNotification({
              userId: menteeId,
        module: 'industry-mentor',
              type: NotificationType.SESSION_MISSED,
              channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
              priority: 'high',
              data: {
                title: wasPending ? 'Booking request expired' : 'Session missed',
                message: wasPending
                  ? `The mentor did not respond to your request for "${title}" in time.${paid ? ' You can get a full refund or reschedule.' : ' You can reschedule.'}`
                  : `Your session "${title}" did not start.${paid ? ' You can get a full refund or reschedule.' : ' You can reschedule.'}`,
                sessionId: session.sessionId,
                bookingId,
                scheduledAt: new Date(startMs).toISOString(),
                canRefund: paid,
                actions: paid ? ['refund', 'reschedule'] : ['reschedule'],
                actionUrl: `/mentorship/user-dashboard/${menteeId}?tab=my-bookings`,
              },
            }).catch((e) => logger.error('Notification failed (missed → mentee):', e));
          }

          if (mentorDoc?.userId) {
            NotificationService.sendNotification({
              userId: mentorDoc.userId,
        module: 'industry-mentor',
              type: NotificationType.SESSION_MISSED,
              channels: [NotificationChannel.IN_APP],
              data: {
                ...(menteeId ? { menteeId } : {}),
                title: wasPending ? 'Booking request expired' : 'Session missed',
                message: wasPending
                  ? `A booking request for "${title}" expired without a response.`
                  : `You missed "${title}". The student has been notified.`,
                sessionId: session.sessionId,
                bookingId,
              },
            }).catch((e) => logger.error('Notification failed (missed → mentor):', e));
          }

          missed++;
        } catch (err: any) {
          logger.error(`Mark-missed failed for ${session.sessionId}/${booking._id}: ${err.message}`);
        }
      }
    }

    return missed;
  }

  /**
   * Cancel session
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

      // Booking ka apna scheduledAt use karo (startSession/rescheduleSession jaisa),
      // template ka original time nahi. Reschedule ke baad refund eligibility sahi rahe.
      const bookingScheduledAt = booking.scheduledAt || session.scheduledAt;
      const hoursDiff = (bookingScheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
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

      try {
        const cancellingMenteeId = booking.menteeId || booking.bookedBy;
        const isCancelledByMentee = userId === cancellingMenteeId;

        let otherPartyUserId: string | null = null;
        if (isCancelledByMentee) {
          const mentorDoc = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });
          otherPartyUserId = mentorDoc?.userId || null;
        } else {
          otherPartyUserId = cancellingMenteeId || null;
        }

        if (otherPartyUserId) {
          NotificationService.sendNotification({
            userId: otherPartyUserId,
        module: 'industry-mentor',
            type: NotificationType.SESSION_CANCELLED,
            channels: [NotificationChannel.IN_APP],
            data: {
              ...(isCancelledByMentee && cancellingMenteeId ? { menteeId: cancellingMenteeId } : {}),
              title: 'Session Cancelled',
              message: `Session "${session.title}" has been cancelled. Reason: ${reason}`,
            },
          }).catch((e) => logger.error('Notification failed (cancelSession):', e));
        }
      } catch (notifErr: any) {
        logger.warn(`Failed to send cancellation notification: ${notifErr.message}`);
      }

      return session;
    } catch (error: any) {
      logger.error(`Failed to cancel session: ${error.message}`);
      throw error;
    }
  }


  /**
 * Mentor ka us din ka availability doc dhoondta hai.
 * doc.date UTC date ya doc ke timezone wali date, dono se match karta hai.
 */
  private async findAvailabilityDocForDate(mentorId: string, when: Date): Promise<any | null> {
    const docs: any[] = await Availability.find({
      mentorId,
      isDeleted: false,
      date: {
        $gte: new Date(when.getTime() - 36 * 60 * 60 * 1000),
        $lte: new Date(when.getTime() + 36 * 60 * 60 * 1000),
      },
    }).lean();

    const targetIn = (a: any) =>
      DateTime.fromJSDate(when).setZone(a.timezone || 'Asia/Kolkata').toISODate();

    return (
      docs.find((a: any) => new Date(a.date).toISOString().slice(0, 10) === targetIn(a)) ||
      docs.find(
        (a: any) =>
          DateTime.fromJSDate(new Date(a.date)).setZone(a.timezone || 'Asia/Kolkata').toISODate() === targetIn(a)
      ) ||
      null
    );
  }

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

      // Completed / cancelled / in-progress booking reschedule nahi ho sakti
      const RESCHEDULABLE_BOOKING_STATUSES: string[] = ['pending', 'confirmed', 'rescheduled', 'missed'];
      if (!RESCHEDULABLE_BOOKING_STATUSES.includes(booking.status)) {
        throw new BadRequestError(`A ${booking.status} booking cannot be rescheduled`);
      }

      const existingStartTime = booking.scheduledAt || session.scheduledAt;
      if (booking.status === BookingStatus.MISSED) {
        // Mentor ki wajah se session nahi hua -> 24h rule nahi lagta, aur sirf student reschedule kare
        const bookingMenteeId = booking.menteeId || booking.bookedBy;
        if (userId !== bookingMenteeId) {
          throw new ForbiddenError('Only the student can reschedule a missed session');
        }
      } else {
        const hoursDiff = (existingStartTime.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursDiff < 24) {
          throw new BadRequestError('Cannot reschedule less than 24 hours before start time');
        }
      }

      if (newScheduledAt <= new Date()) {
        throw new BadRequestError('New scheduled time must be in the future');
      }

      // ---- Mentor availability sync: pehle NAYA slot lock karo ----
      const oldSlotParts = String((booking as any).slotTime || '')
        .split(' - ')
        .map((t: string) => t.trim());
      const hasOldSlot = Boolean((booking as any).availabilityId && oldSlotParts[0] && oldSlotParts[1]);
      const slotDurationMin = Number(session.duration) > 0 ? Number(session.duration) : 30;
      let newSlot: { availabilityId: string; startTime: string; endTime: string } | null = null;

      if (session.sessionType !== SessionType.GROUP_SESSION) {
        const newDoc = await this.findAvailabilityDocForDate(session.mentorId, newScheduledAt);
        if (newDoc) {
          const tz = newDoc.timezone || 'Asia/Kolkata';
          const startTime = DateTime.fromJSDate(newScheduledAt).setZone(tz).toFormat('HH:mm');
          const endTime = computeEndTime(startTime, slotDurationMin);
          const locked = await availabilityService.bookRange(
            newDoc.availabilityId,
            session.mentorId,
            startTime,
            endTime,
            session.sessionId
          );
          if (!locked) {
            throw new ConflictError('This time slot is no longer available. Please pick another slot.');
          }
          newSlot = { availabilityId: newDoc.availabilityId, startTime, endTime };
        } else {
          logger.warn(`No availability doc found for reschedule date, mentor ${session.mentorId}`);
        }
      }

      const updateData: any = {
        $set: {
          'bookings.$.status': BookingStatus.RESCHEDULED,
          'bookings.$.scheduledAt': newScheduledAt,
          'bookings.$.reminders.m15': false,
          'bookings.$.reminders.m5': false,
          'bookings.$.reminders.h24': false,
          'bookings.$.reminders.h1': false,
          'bookings.$.reminders.m30': false,
          'reschedule.lastRescheduledAt': new Date(),
          'reschedule.rescheduledBy': userId,
          'reschedule.reason': reason || 'Rescheduled by user'
        },
        $inc: { 'reschedule.count': 1 },
        $push: { 'reschedule.previousDates': session.scheduledAt },
        $unset: { 'bookings.$.missedAt': '' },
      };

      if (session.sessionType !== SessionType.GROUP_SESSION) {
        updateData.$set.scheduledAt = newScheduledAt;
        updateData.$set.status = BookingStatus.RESCHEDULED;
      }

      if (newSlot) {
        updateData.$set['bookings.$.availabilityId'] = newSlot.availabilityId;
        updateData.$set['bookings.$.slotTime'] = `${newSlot.startTime} - ${newSlot.endTime}`;
      }

      // status filter ke saath: agar isi beech refund ho gaya / status badal gaya to ye fail hoga
      const rescheduleResult = await SessionMentor.updateOne(
        {
          sessionId,
          bookings: { $elemMatch: { _id: bookingId, status: { $in: RESCHEDULABLE_BOOKING_STATUSES } } },
        } as any,
        updateData
      );

      if (rescheduleResult.modifiedCount === 0) {
        if (newSlot) {
          await availabilityService.releaseRange(newSlot.availabilityId, newSlot.startTime, newSlot.endTime);
        }

        throw new ConflictError('Booking status just changed. Please refresh and try again.');
      }

      logger.info(`Session rescheduled: ${sessionId}`);

      // Purana slot wapas free (naya slot upar lock ho chuka hai)
      if (hasOldSlot) {
        try {
          await availabilityService.releaseRange(
            String((booking as any).availabilityId),
            oldSlotParts[0],
            oldSlotParts[1]
          );
        } catch (relErr: any) {
          logger.warn(`Old slot release failed after reschedule: ${relErr.message}`);
        }
      }

      try {
        const menteeId = booking.menteeId || booking.bookedBy;
        const isRescheduledByMentee = userId === menteeId;

        let otherPartyUserId: string | null = null;
        if (isRescheduledByMentee) {
          const mentorDoc = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });
          otherPartyUserId = mentorDoc?.userId || null;
        } else {
          otherPartyUserId = menteeId || null;
        }

        if (otherPartyUserId) {
          NotificationService.sendNotification({
            userId: otherPartyUserId,
        module: 'industry-mentor',
            type: NotificationType.SESSION_RESCHEDULED,
            channels: [NotificationChannel.IN_APP],
            data: {
              title: 'Session Rescheduled',
              message: `Session "${session.title}" has been rescheduled to ${newScheduledAt}.`,
            },
          }).catch((e) => logger.error('Notification failed (rescheduleSession):', e));
        }
      } catch (notifErr: any) {
        logger.warn(`Failed to send reschedule notification: ${notifErr.message}`);
      }

      // TODO: Update calendar via calendarSync.service

      return await SessionMentor.findOne({ sessionId });
    } catch (error: any) {
      logger.error(`Failed to reschedule session: ${error.message}`);
      throw error;
    }
  }

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

      const mentor = await Mentor.findOne({ userId, isDeleted: false });
      const reviewerType = mentor && session.mentorId === mentor.mentorId ? 'mentor' : 'mentee';

      await session.addReview(rating, review, reviewerType);
      logger.info(`Review added to session: ${sessionId}`);

      try {
        let reviewedUserId: string | null = null;

        if (reviewerType === 'mentor') {
          const confirmedBooking = session.bookings?.find((b: any) =>
            b.status === BookingStatus.COMPLETED || b.status === BookingStatus.CONFIRMED
          );
          reviewedUserId = session.menteeId || confirmedBooking?.menteeId || confirmedBooking?.bookedBy || null;
        } else {
          const mentorDoc = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });
          reviewedUserId = mentorDoc?.userId || null;
        }

        if (reviewedUserId) {
          NotificationService.sendNotification({
            userId: reviewedUserId,
        module: 'industry-mentor',
            type: NotificationType.REVIEW_RECEIVED,
            channels: [NotificationChannel.IN_APP],
            data: {
              ...(reviewerType === 'mentee' ? { menteeId: userId } : {}),
              title: 'New Review',
              message: `You received a new review with a rating of ${rating} stars.`,
            },
          }).catch((e) => logger.error('Notification failed (addReview):', e));
        }
      } catch (notifErr: any) {
        logger.warn(`Failed to send review notification: ${notifErr.message}`);
      }

      return session;
    } catch (error: any) {
      logger.error(`Failed to add review: ${error.message}`);
      throw error;
    }
  }

  async getSessionReceipt(
    sessionId: string,
    userId: string,
    bookingId?: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getSessionById(sessionId, userId, authToken);

      let targetBooking: any = null;
      if (bookingId) {
        targetBooking = session.bookings?.find((b: any) => b._id?.toString() === bookingId);
        if (!targetBooking) throw new NotFoundError('Booking not found on this session');
      } else {
        targetBooking = (session.bookings || []).find(
          (b: any) => b.status === BookingStatus.COMPLETED
        );
      }

      if (!targetBooking || targetBooking.status !== BookingStatus.COMPLETED) {
        throw new BadRequestError('Receipt is only available for completed bookings');
      }

      const menteeId = targetBooking.menteeId || targetBooking.bookedBy;
      const [menteeDoc, mentorDoc] = await Promise.all([
        menteeId ? User.findOne({ userId: menteeId }) : null,
        Mentor.findOne({ mentorId: session.mentorId, isDeleted: false }),
      ]);

      const menteeName =
        menteeDoc?.fullName ||
        `${menteeDoc?.firstName || ''} ${menteeDoc?.lastName || ''}`.trim() ||
        menteeDoc?.email ||
        'Student';

      const mentorUser = mentorDoc?.userId ? await User.findOne({ userId: mentorDoc.userId }) : null;
      const mentorName =
        mentorDoc?.title ||
        `${mentorUser?.firstName || ''} ${mentorUser?.lastName || ''}`.trim() ||
        'Mentor';

      return {
        bookingId: targetBooking._id?.toString(),
        sessionId: session.sessionId,
        title: session.title,
        menteeName,
        mentorName,
        scheduledAt: targetBooking.scheduledAt || session.scheduledAt,
        slotTime: targetBooking.slotTime || null,
        duration: session.duration,
        status: targetBooking.status,
        pricing: targetBooking.pricing || session.pricing,
        payment: targetBooking.payment || session.payment,
        completedAt: targetBooking.completion?.completedAt || null,
      };
    } catch (error: any) {
      logger.error(`Failed to build session receipt: ${error.message}`);
      throw error;
    }
  }

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
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', BookingStatus.COMPLETED] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', BookingStatus.CANCELLED] }, 1, 0] } },
            upcoming: {
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

  private mapSessionTypeToPrice(sessionType: SessionType): string {
    const mapping: Record<SessionType, string> = {
      [SessionType.QUICK_CALL]: 'quickCall',
      [SessionType.DEEP_DIVE]: 'deepDive',
      [SessionType.RESUME_REVIEW]: 'resumeReview',
      [SessionType.MOCK_INTERVIEW]: 'mockInterview',
      [SessionType.CAREER_PLANNING]: 'careerPlanning',
      [SessionType.PORTFOLIO_REVIEW]: 'portfolioReview',
      [SessionType.ASK_QUERY]: 'askQuery',
      [SessionType.GROUP_SESSION]: 'groupSession',
    };
    return mapping[sessionType] as any;
  }
}

export default new MentorshipSessionService();