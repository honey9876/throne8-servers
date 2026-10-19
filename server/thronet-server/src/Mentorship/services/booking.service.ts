import mongoose from 'mongoose';
import sessionService from './mentorshipSession.service';
import videoService from './video.service';
import emailService from './email.service';
import smsService from './sms.service';
import calendarService from './calendar.service';
import refundService from './refund.service';
import { PaymentMethod } from '@/Mentorship/interface/session.types';
import TimezoneUtils from '@/Mentorship/utils/timezone';
import { SessionType } from '@/shared/constants/sessionTypes';
import { logger } from '@/shared/logger.util';
import { User, UserProfile } from '@/shared/models/index.models';
import { SessionMentor, Mentor } from '../models';
import { ConflictError, NotFoundError, BadRequestError, ForbiddenError } from '@/shared/errors/app.error';
import { getRedisClient } from '@/services/redis.service';
import waitlistCron from '@/jobs/waitlistCron';
// ✅ NEW: in-app notification wiring
import NotificationService, { NotificationType, NotificationChannel } from './notification.service';
import {
  acquireBookingLock,
  releaseBookingLock,
  invalidateMentorAvailabilityCache,
} from '@/shared/cache/mentorshipCache';

interface BookingInput {
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

interface BookingResult {
  session: any;
  meetingDetails: any;
  calendarEvent?: any;
  notifications: {
    emailSent: boolean;
    smsSent: boolean;
  };
}

// Last-resort fallback agar Railway me FRONTEND_URL set na ho.
const FALLBACK_FRONTEND_URL = 'https://throne8-client-main.vercel.app';

class BookingService {
  async createBooking(input: BookingInput, authToken?: string): Promise<BookingResult> {
    const scheduledTimestamp = input.scheduledAt.getTime();
    const lock = await acquireBookingLock(input.mentorId, scheduledTimestamp, 60000);
    if (!lock.acquired) {
      throw new ConflictError(
        'This slot is currently being booked by another user. Please try again in a moment.'
      );
    }

    let session: any = null;

    try {
      logger.info(`🎫 Starting booking flow for ${input.sessionType}`);

      session = await sessionService.createSession(input, authToken);
      logger.info(`✅ Session created: ${session._id}`);

      let meetingDetails: any;
      try {
        meetingDetails = await this.createVideoMeeting(session, input.timezone, input.menteeId);
        logger.info(`✅ Video meeting created: ${meetingDetails.meetingUrl}`);
      } catch (videoError: any) {
        logger.error(`❌ Video meeting creation failed, rolling back session: ${videoError.message}`);
        await sessionService.cancelSession(
          session._id.toString(),
          input.menteeId,
          'Video setup failed during booking',
          authToken,
          session.bookings[0]._id.toString()
        );
        throw new Error('Booking failed: Could not create video meeting. Please try again.');
      }

      await session.setMeetingDetails(
        meetingDetails.platform,
        meetingDetails.meetingUrl,
        meetingDetails.meetingId,
        meetingDetails.passcode
      );

      const [mentee, mentor] = await Promise.all([
        User.findOne({ userId: input.menteeId, 'flags.isDeleted': false }),
        User.findOne({ userId: input.mentorId, 'flags.isDeleted': false }),
      ]);

      if (!mentee || !mentor) {
        logger.warn('Mentee or Mentor not found', {
          menteeId: input.menteeId,
          mentorId: input.mentorId,
        });
        throw new Error('User not found');
      }

      let calendarEvent;
      try {
        calendarEvent = await calendarService.createCalendarEvent({
          title: input.title,
          description: input.description || '',
          startTime: input.scheduledAt,
          duration: session.duration,
          timezone: input.timezone,
          meetingUrl: meetingDetails.meetingUrl,
          attendees: [mentee.email, mentor.email],
        });
        logger.info(`✅ Calendar event created`);
      } catch (error: any) {
        logger.warn(`⚠️ Calendar event creation failed: ${error.message}`);
      }

      const notifications = await this.sendBookingNotifications(
        session,
        mentee,
        mentor,
        meetingDetails,
        input.timezone
      );

      logger.info(`🎉 Booking completed successfully: ${session._id}`);

      // Invalidate mentor availability cache immediately after booking
      await invalidateMentorAvailabilityCache(input.mentorId);

      return {
        session,
        meetingDetails,
        calendarEvent,
        notifications,
      };
    } catch (error: any) {
      logger.error(`❌ Booking flow failed: ${error.message}`);
      throw error;
    } finally {
      // Release lock atomically via Lua script (verifies unique token)
      await releaseBookingLock(input.mentorId, scheduledTimestamp, lock.token);
    }
  }

  /**
   * Frontend ka base URL (trailing slash ke bina).
   * Railway me FRONTEND_URL set hona chahiye, jaise https://your-domain.com
   */
  private getFrontendBaseUrl(): string {
    const fromEnv = (process.env['FRONTEND_URL'] || '').trim();
    if (!fromEnv) {
      logger.warn('FRONTEND_URL not set, using fallback URL for session room links');
    }
    return (fromEnv || FALLBACK_FRONTEND_URL).replace(/\/+$/, '');
  }

  /**
   * Meeting details banata hai.
   *
   * Video call external provider (Daily/Zoom) pe nahi, app ke apne WebRTC room
   * (/mentorship/session-room/[sessionId]) me hoti hai. Isliye meeting link
   * seedha in-app room ka link hai, aur booking ko kisi video API key pe
   * depend nahi karna padta.
   *
   * Room ID ka client convention (session-room/[sessionId]/page.tsx):
   *   roomId = ?bookingId || sessionId
   *   - 1:1 session: mentee dashboard `?bookingId=<bookingId>` ke saath join
   *     karta hai, isliye link me bhi bookingId chahiye (warna alag room ban jata hai).
   *   - Group session: bookingId nahi hota, room = sessionId.
   */
  private async createVideoMeeting(session: any, _timezone: string, menteeId?: string): Promise<any> {
    const sessionId = session?.sessionId || session?._id?.toString();
    if (!sessionId) {
      logger.error('Cannot build session room link: session has no sessionId');
      throw new Error('Failed to create video meeting');
    }

    let meetingUrl = `${this.getFrontendBaseUrl()}/mentorship/session-room/${encodeURIComponent(String(sessionId))}`;

    // Group sessions me room = sessionId, bookingId nahi jodna.
    const isGroupSession = String(session?.sessionType || '').toLowerCase().includes('group');

    if (!isGroupSession) {
      const bookings: any[] = Array.isArray(session?.bookings) ? session.bookings : [];
      const booking = bookings.find((b: any) => b?.menteeId === menteeId) || bookings[0];
      const bookingId = booking?._id?.toString();

      if (bookingId) {
        meetingUrl += `?bookingId=${encodeURIComponent(bookingId)}`;
      } else {
        logger.warn(`No bookingId found while building room link for session ${sessionId}`);
      }
    }

    return {
      platform: 'custom',
      meetingUrl,
      meetingId: String(sessionId),
      passcode: undefined,
    };
  }

  /**
   * Send booking confirmation notifications (email + SMS + in-app)
   *
   * ✅ NEW: added in-app notifications for BOTH mentee and mentor, on top of
   * the existing email/SMS. In-app failures are swallowed (non-critical —
   * the booking itself must not fail because of a notification hiccup).
   */
  private async sendBookingNotifications(
    session: any,
    mentee: any,
    mentor: any,
    meetingDetails: any,
    timezone: string
  ): Promise<{ emailSent: boolean; smsSent: boolean }> {
    const scheduledAtFormatted = TimezoneUtils.formatInTimezone(
      session.scheduledAt,
      timezone,
      'MMMM dd, yyyy hh:mm a'
    );

    const emailSent = await emailService.sendBookingConfirmation(mentee.email, {
      menteeName: mentee.name || mentee.email,
      mentorName: mentor.name || mentor.email,
      sessionType: session.sessionType,
      scheduledAt: scheduledAtFormatted,
      duration: session.duration,
      meetingUrl: meetingDetails.meetingUrl,
      timezone,
      price: session.pricing.totalAmount,
      transactionId: session.payment.transactionId,
    });

    let smsSent = false;
    if (mentee.phoneNumber) {
      smsSent = await smsService.sendBookingConfirmation(
        mentee.phoneNumber!,
        mentor.name || mentor.email,
        session.sessionType,
        scheduledAtFormatted
      );
    }

    // ✅ NEW: in-app notification to mentee
    NotificationService.sendNotification({
      userId: mentee.userId,
      type: NotificationType.BOOKING_CONFIRMED,
      channels: [NotificationChannel.IN_APP],
      data: {
        title: 'Booking Confirmed',
        message: `Your session with ${mentor.name || mentor.email} on ${scheduledAtFormatted} is booked!`,
      },
    }).catch((e) => logger.error('Notification failed (sendBookingNotifications → mentee):', e));

    // ✅ NEW: in-app notification to mentor
    NotificationService.sendNotification({
      userId: mentor.userId,
      type: NotificationType.BOOKING_CONFIRMED,
      channels: [NotificationChannel.IN_APP],
      data: {
        menteeId: mentee.userId,
        menteeName: mentee.name || mentee.email,
        menteePhoto: (mentee as any).profilePhotoUrl || (mentee as any).profilePhoto || (mentee as any).avatar || null,
        title: 'New Booking',
        message: `${mentee.name || mentee.email} booked a session with you on ${scheduledAtFormatted}.`,
      },
    }).catch((e) => logger.error('Notification failed (sendBookingNotifications → mentor):', e));

    return { emailSent, smsSent };
  }

  /**
   * Cancel booking with refund processing + Waitlist notification
   */
  async cancelBooking(
    sessionId: string,
    userId: string,
    reason: string,
    authToken: string | undefined,
    bookingId: string
  ): Promise<any> {
    try {
      logger.info(`❌ Cancelling booking: ${sessionId}`);

      const session = await SessionMentor.findOne(
        mongoose.Types.ObjectId.isValid(sessionId)
          ? { $or: [{ sessionId }, { _id: sessionId }] }
          : { sessionId }
      );
      if (!session) {
        throw new NotFoundError('Session');
      }

      // ✅ FIX: pass bookingId through so refundService validates/updates
      // the SPECIFIC booking being cancelled, not the session template's
      // top-level menteeId (which only ever reflects whichever mentee
      // booked FIRST). Without this, any other mentee gets wrongly
      // rejected as "not authorized" — a plain Error with no statusCode,
      // which the global error handler turns into a 500.
      const refundResult = await refundService.processRefund({
        sessionId,
        userId,
        reason,
        bookingId,
      });

      // In-app room ('custom' platform) ke liye external meeting delete karne ki
      // zaroorat nahi, wo sirf ek link hai.
      if (session.meeting?.meetingId && session.meeting?.platform !== 'custom') {
        try {
          await videoService.deleteMeeting(session.meeting.meetingId);
        } catch (videoError: any) {
          logger.warn(`⚠️ Video meeting deletion failed: ${videoError.message}`);
        }
      }

      const actualMenteeId = session.menteeId || (session.bookings && session.bookings[0]?.menteeId);
      const mentorDoc = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });
      const [mentee, mentor] = await Promise.all([
        actualMenteeId ? User.findByUserId(actualMenteeId) : null,
        mentorDoc?.userId ? User.findByUserId(mentorDoc.userId) : Promise.resolve(null),
      ]);

      if (!mentee || !mentor) {
        logger.warn('Mentee or Mentor not found for calendar deletion', { sessionId });
      }

      try {
        await calendarService.deleteCalendarEvent(sessionId);
      } catch (error: any) {
        logger.warn(`⚠️ Calendar event deletion failed: ${error.message}`);
      }

      try {
        const notifiedCount = await waitlistCron.notifyWaitlistForSession(sessionId);
        if (notifiedCount > 0) {
          logger.info(`📢 Notified ${notifiedCount} users from waitlist`);
        }
      } catch (error: any) {
        logger.warn(`⚠️ Waitlist notification failed: ${error.message}`);
      }

      // ✅ NEW: notify refund outcome (mentee side, since refunds always go to the payer)
      if (mentee?.userId) {
        NotificationService.sendNotification({
          userId: mentee.userId,
          type: NotificationType.REFUND_PROCESSED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: refundResult.refundEligible ? 'Refund Processed' : 'Booking Cancelled',
            message: refundResult.refundEligible
              ? `Your refund for the cancelled session is being processed.`
              : `Your session was cancelled. Reason: ${reason}`,
          },
        }).catch((e) => logger.error('Notification failed (cancelBooking → mentee):', e));
      }

      logger.info(`✅ Booking cancelled successfully: ${sessionId}`);

      const updatedSession = await SessionMentor.findById(session._id);

      return {
        session: updatedSession || session,
        refundAmount: refundResult.refundAmount,
        refundEligible: refundResult.refundEligible,
      };
    } catch (error: any) {
      logger.error(`❌ Booking cancellation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reschedule booking
   */
  async rescheduleBooking(
    sessionId: string,
    userId: string,
    newScheduledAt: Date,
    reason: string,
    authToken: string | undefined,
    bookingId: string
  ): Promise<any> {
    try {
      logger.info(`🔄 Rescheduling booking: ${sessionId}`);

      const session = await SessionMentor.findOne({ sessionId });
      if (!session) {
        throw new Error('Session not found');
      }

      const oldScheduledAt = session.scheduledAt;

      const updatedSession = await sessionService.rescheduleSession(
        sessionId,
        userId,
        newScheduledAt,
        reason,
        authToken,
        bookingId
      );

      const actualMenteeId = updatedSession.menteeId || (updatedSession.bookings && updatedSession.bookings[0]?.menteeId);
      const mentorDoc = await Mentor.findOne({ mentorId: updatedSession.mentorId, isDeleted: false });
      const [mentee, mentor] = await Promise.all([
        actualMenteeId ? User.findByUserId(actualMenteeId) : null,
        mentorDoc?.userId ? User.findByUserId(mentorDoc.userId) : Promise.resolve(null),
      ]);

      if (!mentee || !mentor) {
        logger.warn('Mentee or Mentor not found for reschedule notifications', { sessionId });
        return updatedSession;
      }

      try {
        await calendarService.updateCalendarEvent(sessionId, {
          startTime: newScheduledAt,
          title: updatedSession.title,
          description: updatedSession.description,
          duration: updatedSession.duration,
          timezone: updatedSession.timezone,
          meetingUrl: updatedSession.meeting?.meetingUrl || '',
        });
      } catch (error: any) {
        logger.warn(`⚠️ Calendar event update failed: ${error.message}`);
      }

      const oldTimeFormatted = TimezoneUtils.formatInTimezone(
        oldScheduledAt,
        updatedSession.timezone,
        'MMMM dd, yyyy hh:mm a'
      );

      const newTimeFormatted = TimezoneUtils.formatInTimezone(
        newScheduledAt,
        updatedSession.timezone,
        'MMMM dd, yyyy hh:mm a'
      );

      await emailService.sendRescheduleConfirmation(
        mentee.email,
        mentee.fullName || mentee.email,
        mentor.fullName || mentor.email,
        updatedSession.sessionType,
        oldTimeFormatted,
        newTimeFormatted,
        updatedSession.timezone,
        updatedSession.meeting?.meetingUrl || ''
      );

      if (mentee.phoneNumber) {
        await smsService.sendRescheduleNotification(
          mentee.phoneNumber!,
          mentor.fullName || mentor.email,
          newTimeFormatted
        );
      }

      // Note: in-app SESSION_RESCHEDULED notification is already sent inside
      // sessionService.rescheduleSession() above — not duplicated here.

      logger.info(`✅ Booking rescheduled successfully: ${sessionId}`);
      return updatedSession;
    } catch (error: any) {
      logger.error(`❌ Booking reschedule failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send session reminders
   */
  async sendSessionReminder(sessionId: string, hoursUntil: number): Promise<void> {
    try {
      const session = await SessionMentor.findOne({ sessionId });
      if (!session) return;

      const actualMenteeId = session.menteeId || (session.bookings && session.bookings[0]?.menteeId);
      const mentorDoc = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });
      const [mentee, mentor] = await Promise.all([
        actualMenteeId ? User.findByUserId(actualMenteeId) : null,
        mentorDoc?.userId ? User.findByUserId(mentorDoc.userId) : Promise.resolve(null),
      ]);

      if (!mentee || !mentor) {
        logger.warn('Mentee or Mentor not found for session reminder', { sessionId });
        return;
      }

      const scheduledAtFormatted = TimezoneUtils.formatInTimezone(
        session.scheduledAt,
        session.timezone,
        'MMMM dd, yyyy hh:mm a'
      );

      await emailService.sendSessionReminder(mentee.email, {
        userName: mentee.fullName || mentee.email,
        mentorName: mentor.fullName || mentor.email,
        sessionType: session.sessionType,
        scheduledAt: scheduledAtFormatted,
        meetingUrl: session.meeting?.meetingUrl || '',
        timezone: session.timezone,
        hoursUntil,
      });

      if (mentee.phoneNumber) {
        await smsService.sendSessionReminder(
          mentee.phoneNumber!,
          mentor.fullName || mentor.email,
          hoursUntil,
          session.meeting?.meetingUrl || ''
        );
      }

      // ✅ NEW: in-app reminder
      NotificationService.sendNotification({
        userId: mentee.userId,
        type: NotificationType.SESSION_REMINDER,
        channels: [NotificationChannel.IN_APP],
        data: {
          title: 'Upcoming Session',
          message: `Your session with ${mentor.fullName || mentor.email} starts in ${hoursUntil} hours.`,
        },
      }).catch((e) => logger.error('Notification failed (sendSessionReminder):', e));

      logger.info(`⏰ Reminder sent for session: ${sessionId} (${hoursUntil}h)`);
    } catch (error: any) {
      logger.error(`❌ Failed to send reminder: ${error.message}`);
    }
  }

  /**
   * Get booking details
   */
  async getBookingDetails(sessionId: string, authToken?: string): Promise<any> {
    try {
      const session = await sessionService.getSessionById(sessionId, undefined, authToken);

      const actualMenteeId = session.menteeId || (session.bookings && session.bookings[0]?.menteeId);
      const mentorDoc = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });
      const [menteeUser, mentorUser, menteeProfile, mentorProfile] = await Promise.all([
        actualMenteeId ? User.findByUserId(actualMenteeId) : null,
        mentorDoc?.userId ? User.findByUserId(mentorDoc.userId) : Promise.resolve(null),
        actualMenteeId ? UserProfile.findByUserIdCached(actualMenteeId) : null,
        mentorDoc?.userId ? UserProfile.findByUserIdCached(mentorDoc.userId) : Promise.resolve(null),
      ]);

      if (!menteeUser || !mentorUser) {
        throw new NotFoundError('User');
      }

      return {
        session,
        mentee: {
          id: menteeUser.userId,
          name: menteeUser.fullName || menteeUser.email,
          email: menteeUser.email,
          photo: menteeProfile?.avatar?.url || '',
        },
        mentor: {
          id: mentorUser.userId,
          name: mentorUser.fullName || mentorUser.email,
          email: mentorUser.email,
          photo: mentorProfile?.avatar?.url || '',
        },
      };
    } catch (error: any) {
      logger.error(`Failed to get booking details: ${error.message}`);
      throw error;
    }
  }
}

export default new BookingService();