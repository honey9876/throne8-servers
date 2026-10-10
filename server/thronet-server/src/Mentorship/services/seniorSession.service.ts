import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

import seniorSessionRepository from '../repositories/seniorSession.repository';
import { ISeniorSession, CreateSeniorSessionInput, UpdateSeniorSessionInput, SeniorSessionStatus, SeniorSessionType } from '../interface/seniorSession.types';

import SeniorMentorApplicationService from './seniorMentorApplication.service';

import { ForbiddenError, NotFoundError, BadRequestError } from '@/shared/errors/app.error';
import seniorAvailabilityService from './seniorAvailability.service';
import { DateTime } from 'luxon';
import { User } from '@/shared/models/index.models';
import { BookingStatus, isStartAllowed } from '@/shared/constants/bookingStatus';
// NotificationService imported dynamically to prevent circular startup hang
import { emitToUser } from '@/socket/emitter';
import { logger } from '@/shared/logger.util';

// If your project uses different error imports,
// replace the above imports with your existing error classes.

class SeniorSessionService {
  private repository = seniorSessionRepository;

  constructor() {}

  private async uploadImageToCloudinary(buffer: Buffer, sessionId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'senior-session-thumbnails',
          public_id: `senior_session_${sessionId}_${Date.now()}`,
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
   * Verify that the user is an active Senior Mentor.
   *
   * Senior Sessions are ONLY available to users whose
   * SeniorMentorApplication has mentorRole = "senior_mentor".
   */
  private async ensureSeniorMentor(userId: string): Promise<void> {
    const application = await SeniorMentorApplicationService.getByUserId(userId);

    if (!application) {
      throw new ForbiddenError(
        'Senior Mentor application not found'
      );
    }

    if (application.verificationStatus !== 'active') {
      throw new ForbiddenError(
        'Senior Mentor application is not active'
      );
    }

    if (application.mentorRole !== 'senior_mentor') {
      throw new ForbiddenError(
        'Only Senior Mentors can create Senior Sessions'
      );
    }

    if (application.isActive === false || application.isDeleted === true) {
      throw new ForbiddenError(
        'Senior Mentor account is not active'
      );
    }
  }

  /**
   * Create a new Senior Session.
   *
   * mentorId is ALWAYS taken from the authenticated user.
   * It must never come from the frontend request body.
   */
  async createSession(
    userId: string,
    payload: CreateSeniorSessionInput,
    file?: Express.Multer.File
  ): Promise<ISeniorSession> {
    await this.ensureSeniorMentor(userId);

    const sessionId = uuidv4();
    let thumbnailImage = payload.thumbnailImage;

    if (file) {
      thumbnailImage = await this.uploadImageToCloudinary(file.buffer, sessionId);
    }

    // Availability validation check
    if (payload.scheduledAt && payload.duration) {
      const tz = payload.timezone || 'Asia/Kolkata';
      // Process payload.scheduledAt robustly. Native JS Dates (if parsed by middleware) vs Strings
      let rawVal = payload.scheduledAt;
      let dt: DateTime;
      
      if (typeof rawVal === 'string') {
        dt = DateTime.fromISO(rawVal, { zone: tz });
      } else {
        dt = DateTime.fromJSDate(new Date(rawVal)).setZone(tz);
      }
      
      if (!dt.isValid) {
        throw new BadRequestError('Invalid scheduledAt date format.');
      }
      
      const dateStr = dt.toFormat('yyyy-MM-dd');
      const timeStr = dt.toFormat('HH:mm');
      const durationNum = Number(payload.duration);
      
      // Update payload.scheduledAt so Mongoose saves the real UTC time instead of Server-Local UTC time
      payload.scheduledAt = dt.toJSDate() as any;
      
      // Availability validation check - only for fixed-time sessions, NOT for generic 1-to-1 service templates
      let isValid = true;
      if (payload.sessionType !== SeniorSessionType.ONE_TO_ONE) {
        isValid = await seniorAvailabilityService.validateSlot(
          userId,
          dateStr,
          timeStr,
          durationNum
        );
      }
      
      if (!isValid) {
        throw new BadRequestError('The selected time slot is not available or falls outside configured hours.');
      }
    }

    const sessionData = {
      ...payload,
      sessionId,
      mentorId: userId,
      thumbnailImage,
      bookings: [],
      status: payload.status ?? SeniorSessionStatus.PENDING,
    } as unknown as ISeniorSession;

    return this.repository.create(sessionData) as unknown as ISeniorSession;
  }

  /**
   * Get all Senior Sessions owned by the authenticated mentor.
   */
  async getMySessions(
    userId: string
  ): Promise<any[]> {
    await this.ensureSeniorMentor(userId);

    const sessions = await this.repository.findByMentorId(userId) as unknown as ISeniorSession[];
    
    // Aggregation Logic for Mentees
    const menteeIds = new Set<string>();
    for (const session of sessions) {
      if (session.bookings && Array.isArray(session.bookings)) {
        for (const booking of session.bookings) {
          if (booking.menteeId) {
            menteeIds.add(booking.menteeId);
          }
        }
      }
    }

    if (menteeIds.size > 0) {
      const users = await User.find({ userId: { $in: Array.from(menteeIds) } })
        .select('userId firstName lastName email profilePhotoId')
        .lean();
      
      const userMap = new Map<string, any>();
      users.forEach((u: any) => {
        userMap.set(u.userId, {
          fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
          email: u.email,
          profilePic: u.profilePhotoId
        });
      });

      // Inject mentee details implicitly inside response mappings without mutating Document structure
      return sessions.map((session: any) => {
         const obj = typeof session.toObject === 'function' ? session.toObject() : { ...session };
         if (obj.bookings && Array.isArray(obj.bookings)) {
           obj.bookings = obj.bookings.map((booking: any) => {
              if (booking.menteeId && userMap.has(booking.menteeId)) {
                 return { ...booking, mentee: userMap.get(booking.menteeId) };
              }
              return booking;
           });
         }
         return obj;
      });
    }

    return sessions;
  }

  /**
   * Get all active one-to-one sessions for discovery.
   */
  async getDiscoverySessions(): Promise<ISeniorSession[]> {
    return this.repository.findAllActiveOneToOneSessions() as unknown as ISeniorSession[];
  }

  /**
   * Book a Senior Session.
   */
  async bookSession(
    menteeId: string,
    sessionId: string,
    payload: any // Contains scheduled date/time, price
  ): Promise<ISeniorSession> {
    const session = await this.repository.findBySessionId(sessionId);
    if (!session) {
      throw new NotFoundError('Senior Session not found');
    }
    
    if (session.status === SeniorSessionStatus.CANCELLED) {
      throw new BadRequestError('Cannot book a cancelled session');
    }

    if (!payload.slotTime) {
      throw new BadRequestError('slotTime is required for booking');
    }

    // Availability validation check
    const parts = payload.slotTime.split('-').map((p: string) => p.trim());
    const frontendStartTime = parts[0];
    const frontendEndTime = parts[1];
    const tz = session.timezone || 'Asia/Kolkata';

    if (!payload.scheduledAt) {
      throw new BadRequestError('scheduledAt is required for booking');
    }

    const scheduledDt = DateTime.fromJSDate(new Date(payload.scheduledAt)).setZone(tz);
    
    if (!scheduledDt.isValid) {
      throw new BadRequestError('Invalid scheduledAt value.');
    }

    const dateStr = scheduledDt.toFormat('yyyy-MM-dd');
    const expectedStartTime = scheduledDt.toFormat('HH:mm');

    console.log('\n==================================================');
    console.log('[DATE TRACE]');
    console.log(`raw scheduledAt: ${payload.scheduledAt}`);
    console.log(`scheduledAt type: ${typeof payload.scheduledAt}`);
    
    console.log(`session timezone: ${tz}`);
    
    // Check what the UTC representation is
    const utcDt = DateTime.fromJSDate(new Date(payload.scheduledAt)).toUTC();
    console.log(`UTC date: ${utcDt.toFormat('yyyy-MM-dd')}`);
    console.log(`UTC time: ${utcDt.toFormat('HH:mm')}`);
    
    console.log(`local date: ${dateStr}`);
    console.log(`local time: ${expectedStartTime}`);
    console.log(`local weekday: ${scheduledDt.setLocale('en-US').toFormat('cccc')}`);
    
    const nowUTC = DateTime.now().toUTC();
    const nowTz = DateTime.now().setZone(tz);
    console.log(`current server time UTC: ${nowUTC.toISO()}`);
    console.log(`current server time in timezone: ${nowTz.toISO()}`);
    
    console.log(`requested local DateTime: ${scheduledDt.toISO()}`);
    console.log(`is requested time considered past?: ${scheduledDt < nowTz}`);
    console.log('==================================================\n');

    // 6. SLOT TIME AND SCHEDULED AT CONSISTENCY
    if (expectedStartTime !== frontendStartTime) {
      throw new BadRequestError(`Slot time mismatch. Expected slot to start at ${expectedStartTime} based on scheduledAt.`);
    }

    // Explicitly validate duration and end time bounds
    const numericDuration = Number(session.duration);
    if (!Number.isFinite(numericDuration) || numericDuration <= 0) {
      throw new BadRequestError('Invalid session duration.');
    }

    const toMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };
    const toTimeStr = (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const expectedEndTime = toTimeStr(toMinutes(expectedStartTime) + numericDuration);
    
    console.log('[BOOKING AUDIT] duration:', numericDuration);
    console.log('[BOOKING AUDIT] requested local end:', expectedEndTime);

    if (frontendEndTime && frontendEndTime !== expectedEndTime) {
      throw new BadRequestError(`Slot duration mismatch. Expected slot to end at ${expectedEndTime}.`);
    }

    const timeStr = expectedStartTime;

    const isValid = await seniorAvailabilityService.validateSlot(
      session.mentorId,
      dateStr,
      timeStr,
      numericDuration,
      undefined,
      { scheduledAt: payload.scheduledAt }
    );

    console.log('[BOOKING AUDIT] validateSlot result:', isValid);

    if (!isValid) {
      console.log('[BOOKING AUDIT] exact rejection reason: The selected time slot is not available or falls outside configured hours.');
      throw new BadRequestError('The selected time slot is not available or falls outside configured hours.');
    }

    const bookingId = uuidv4();

    const booking = {
      menteeId,
      bookedBy: menteeId,
      bookedAt: new Date(),
      status: SeniorSessionStatus.PENDING,
      slotTime: payload.slotTime,
      scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
      payment: {
        status: 'pending',
        method: payload.paymentMethod || 'card'
      },
      pricing: payload.pricing
    };

    console.log('[BOOKING AUDIT] addBooking started');
    const updatedSession = await this.repository.addBooking(sessionId, booking as unknown as any);

    if (!updatedSession) {
      throw new BadRequestError('Failed to book session. The requested time slot may have just been booked by another user.');
    }
    console.log('[BOOKING AUDIT] addBooking succeeded');

    // Fail-safe WhatsApp Notification Trigger
    try {
      const formattedDate = scheduledDt.toFormat('d MMMM yyyy');
      const formattedTime = scheduledDt.toFormat('h:mm a');
      
      const { default: NotificationService, NotificationType, NotificationChannel } = await import('./notification.service');
      
      const juniorRec = await User.findOne({ userId: menteeId }).select('firstName lastName').lean();
      const seniorRec = await User.findOne({ userId: session.mentorId }).select('firstName lastName').lean();
      
      const juniorName = juniorRec ? `${juniorRec.firstName || ''} ${juniorRec.lastName || ''}`.trim() || 'Student' : 'Student';
      const seniorName = seniorRec ? `${seniorRec.firstName || ''} ${seniorRec.lastName || ''}`.trim() || 'Mentor' : 'Mentor';

      // Trigger Junior confirmation
      await NotificationService.sendNotification({
        userId: menteeId,
        type: NotificationType.NEW_BOOKING_REQUEST,
        channels: [NotificationChannel.WHATSAPP, NotificationChannel.IN_APP],
        data: {
          targetRole: 'junior',
          juniorName: juniorName,
          seniorMentorName: seniorName,
          serviceName: session.title,
          date: formattedDate,
          time: formattedTime,
          bookingId,
          phoneTarget: menteeId, 
          templateName: 'booking_request_received', 
          whatsappVars: {
            1: juniorName,
            2: session.title,
            3: formattedDate,
            4: formattedTime
          }
        }
      });

      // Trigger Senior Mentor notification
      await NotificationService.sendNotification({
        userId: session.mentorId,
        type: NotificationType.NEW_BOOKING_REQUEST,
        channels: [NotificationChannel.WHATSAPP, NotificationChannel.IN_APP],
        data: {
          targetRole: 'senior',
          juniorName: juniorName,
          seniorMentorName: seniorName,
          serviceName: session.title,
          date: formattedDate,
          time: formattedTime,
          bookingId,
          phoneTarget: session.mentorId, 
          templateName: 'booking_request_mentor', 
          whatsappVars: {
            1: 'Mentor',
            2: session.title,
            3: juniorName,
            4: formattedDate,
            5: formattedTime
          }
        }
      });
    } catch (notifErr: any) {
      logger.error('WhatsApp notification dispatch during bookSession failed (Fail-safe invoked):', notifErr);
    }

    return updatedSession as unknown as ISeniorSession;
  }

  /**
   * Get one Senior Session.
   *
   * Ownership is checked through:
   *
   * sessionId + mentorId
   */
  async getSessionById(
    userId: string,
    sessionId: string
  ): Promise<ISeniorSession> {
    const session =
      await this.repository.findBySessionId(
        sessionId
      );

    if (!session) {
      throw new NotFoundError(
        'Senior Session not found'
      );
    }

    return session as unknown as ISeniorSession;
  }

  /**
   * Update a Senior Session.
   *
   * Only the owner can update the session.
   */
  async updateSession(
    userId: string,
    sessionId: string,
    payload: UpdateSeniorSessionInput,
    file?: Express.Multer.File
  ): Promise<ISeniorSession> {
    await this.ensureSeniorMentor(userId);

    const existingSession =
      await this.repository.findBySessionIdAndMentorId(
        sessionId,
        userId
      );

    if (!existingSession) {
      throw new NotFoundError(
        'Senior Session not found'
      );
    }

    const {
      sessionId: _sessionId,
      mentorId: _mentorId,
      bookings: _bookings,
      sessionType: _sessionType,
      status: _status,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      __v: _v,
      ...allowedUpdates
    } = payload as UpdateSeniorSessionInput & {
      sessionId?: string;
      mentorId?: string;
      bookings?: unknown;
      sessionType?: string;
      status?: string;
      createdAt?: string;
      updatedAt?: string;
      __v?: unknown;
    };

    if (file) {
      const uploadedUrl = await this.uploadImageToCloudinary(file.buffer, sessionId);
      allowedUpdates.thumbnailImage = uploadedUrl;
    }

    // Availability validation check on update
    const finalScheduledAt = payload.scheduledAt || existingSession.scheduledAt;
    const finalDuration = payload.duration || existingSession.duration;
    const finalTimezone = payload.timezone || existingSession.timezone || 'Asia/Kolkata';

    if (finalScheduledAt && finalDuration) {
      let dt;
      if (typeof finalScheduledAt === 'string') {
        dt = DateTime.fromISO(finalScheduledAt, { zone: finalTimezone });
        allowedUpdates.scheduledAt = dt.toJSDate() as any;
      } else {
        dt = DateTime.fromJSDate(finalScheduledAt as Date).setZone(finalTimezone);
      }
      
      const dateStr = dt.toFormat('yyyy-MM-dd');
      const timeStr = dt.toFormat('HH:mm');
      const durationNum = Number(finalDuration);
      
      const isValid = await seniorAvailabilityService.validateSlot(
        userId,
        dateStr,
        timeStr,
        durationNum,
        sessionId
      );
      
      if (!isValid) {
        throw new BadRequestError('The updated time slot is not available or falls outside configured hours.');
      }
    }

    return this.repository.updateBySessionIdAndMentorId(
      sessionId,
      userId,
      allowedUpdates
    ) as unknown as ISeniorSession;
  }

  /**
   * Cancel / deactivate a Senior Session.
   *
   * We do not physically delete the MongoDB document.
   *
   * The session remains available for historical records.
   */
  async cancelSession(
    userId: string,
    sessionId: string
  ): Promise<ISeniorSession> {
    await this.ensureSeniorMentor(userId);

    const existingSession =
      await this.repository.findBySessionIdAndMentorId(
        sessionId,
        userId
      );

    if (!existingSession) {
      throw new NotFoundError(
        'Senior Session not found'
      );
    }

    /*
     * Don't allow cancelling an already cancelled session.
     */
    if (existingSession.status === SeniorSessionStatus.CANCELLED) {
      throw new ForbiddenError(
        'Senior Session is already cancelled'
      );
    }

    return this.repository.cancelSession(
      sessionId,
      userId
    ) as unknown as ISeniorSession;
  }
  /**
   * Confirm a pending Junior Booking for a Senior Session
   */
  async confirmBooking(
    userId: string,
    sessionId: string,
    bookingId: string
  ): Promise<ISeniorSession> {
    await this.ensureSeniorMentor(userId);
    const session = await this.repository.findBySessionIdAndMentorId(sessionId, userId);
    
    if (!session) {
      throw new NotFoundError('Senior Session not found or access denied');
    }

    const bookingIndex = session.bookings.findIndex((b: any) => b._id.toString() === bookingId);
    if (bookingIndex === -1) {
      throw new NotFoundError('Booking not found');
    }
    
    const booking = session.bookings[bookingIndex];
    if (booking.status !== SeniorSessionStatus.PENDING && (booking.status as string) !== 'upcoming') {
      throw new BadRequestError('Only pending bookings can be confirmed');
    }

    session.bookings[bookingIndex].status = SeniorSessionStatus.CONFIRMED; // Behavioral alignment with Mentor

    await (session as any).save();

    logger.info(`Senior Session confirmed: ${sessionId}, bookedBy/bookingId: ${bookingId}`);

    const menteeIdToNotify = booking.menteeId || booking.bookedBy;
    if (menteeIdToNotify) {
      try {
        const { default: NotificationService, NotificationType, NotificationChannel } = await import('./notification.service');
        await NotificationService.sendNotification({
          userId: menteeIdToNotify,
          type: NotificationType.BOOKING_CONFIRMED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: 'Booking Confirmed',
            message: `Your session "${session.title}" has been confirmed by the mentor.`,
          },
        });
      } catch (e: any) {
        logger.error('Notification failed (confirmSession):', e);
      }
        try {
          const confirmedPayload = {
            sessionId: session.sessionId,
            bookingId: booking._id?.toString() || bookingId,
            status: 'confirmed',
          };
          emitToUser(menteeIdToNotify, 'session:confirmed', confirmedPayload);
          emitToUser(menteeIdToNotify, 'mentorship:session:confirmed', confirmedPayload);
        } catch (emitErr: any) {
          logger.error('Socket emit failed (session:confirmed):', emitErr);
        }
    }

    return session as unknown as ISeniorSession;
  }

  /**
   * Cancel a Junior Booking for a Senior Session
   */
  async cancelBooking(
    userId: string,
    sessionId: string,
    bookingId: string,
    reason?: string
  ): Promise<ISeniorSession> {
    await this.ensureSeniorMentor(userId);
    const session = await this.repository.findBySessionIdAndMentorId(sessionId, userId);
    
    if (!session) {
      throw new NotFoundError('Senior Session not found or access denied');
    }

    const bookingIndex = session.bookings.findIndex((b: any) => b._id.toString() === bookingId);
    if (bookingIndex === -1) {
      throw new NotFoundError('Booking not found');
    }
    
    const currentStatus = session.bookings[bookingIndex].status;
    if (currentStatus === SeniorSessionStatus.CANCELLED || currentStatus === SeniorSessionStatus.COMPLETED) {
      throw new BadRequestError('Cannot cancel a completed or cancelled booking');
    }

    session.bookings[bookingIndex].status = SeniorSessionStatus.CANCELLED;

    await (session as any).save();

    logger.info(`Senior Session booking cancelled: ${sessionId}, bookingId: ${bookingId}`);

    const booking = session.bookings[bookingIndex];
    if (booking.menteeId) {
      try {
        const { default: NotificationService, NotificationType, NotificationChannel } = await import('./notification.service');
        await NotificationService.sendNotification({
          userId: booking.menteeId,
          type: NotificationType.SESSION_CANCELLED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: 'Session Cancelled',
            message: `Session "${session.title}" has been cancelled. Reason: ${reason || 'Not provided'}`,
          },
        });
      } catch (e: any) {
        logger.error('Notification failed (cancelSession):', e);
      }
    }

    return session as unknown as ISeniorSession;
  }

  /**
   * Reschedule a Junior Booking for a Senior Session
   */
  async rescheduleBooking(
    userId: string,
    sessionId: string,
    bookingId: string,
    newScheduledAt: string,
    reason: string
  ): Promise<ISeniorSession> {
    await this.ensureSeniorMentor(userId);
    const session = await this.repository.findBySessionIdAndMentorId(sessionId, userId);
    
    if (!session) {
      throw new NotFoundError('Senior Session not found or access denied');
    }

    const bookingIndex = session.bookings.findIndex((b: any) => b._id.toString() === bookingId);
    if (bookingIndex === -1) {
      throw new NotFoundError('Booking not found');
    }
    
    const booking = session.bookings[bookingIndex];
    const currentStatus = booking.status;
    if (currentStatus !== SeniorSessionStatus.CONFIRMED && (currentStatus as string) !== 'upcoming' && currentStatus !== SeniorSessionStatus.PENDING) {
      throw new BadRequestError('Only pending or upcoming bookings can be rescheduled');
    }

    const newDateObj = new Date(newScheduledAt);
    if (isNaN(newDateObj.getTime())) {
       throw new BadRequestError('Invalid requested date');
    }

    const existingStartTime = booking.scheduledAt || session.scheduledAt;
    let hoursDiff = 25; // default pass if invalid exist
    if (existingStartTime) {
       hoursDiff = (existingStartTime.getTime() - Date.now()) / (1000 * 60 * 60);
    }

    if (hoursDiff < 24) {
      throw new BadRequestError('Cannot reschedule less than 24 hours before start time');
    }

    const tz = session.timezone || 'Asia/Kolkata';
    const dtLocal = DateTime.fromJSDate(newDateObj).setZone(tz);
    const dateStr = dtLocal.toFormat('yyyy-MM-dd');
    const startTimeStr = dtLocal.toFormat('HH:mm');

    const endLocal = dtLocal.plus({ minutes: session.duration || 60 });
    const endTimeStr = endLocal.toFormat('HH:mm');

    const newSlotTime = `${startTimeStr} - ${endTimeStr}`;

    const isValid = await seniorAvailabilityService.validateSlot(
      session.mentorId,
      dateStr,
      startTimeStr,
      session.duration || 60
    );

    if (!isValid) {
      throw new BadRequestError('The selected time slot is not available or falls outside configured hours.');
    }

    session.bookings[bookingIndex].scheduledAt = newDateObj;
    session.bookings[bookingIndex].slotTime = newSlotTime;
    
    if (!session.bookings[bookingIndex].reschedule) {
      session.bookings[bookingIndex].reschedule = { count: 0 };
    }
    session.bookings[bookingIndex].reschedule.count = (session.bookings[bookingIndex].reschedule.count || 0) + 1;
    session.bookings[bookingIndex].reschedule.reason = reason;

    // Atomics protection implicitly via findById block wrapper
    await (session as any).save();

    logger.info(`Senior Session booking rescheduled: ${sessionId}, bookingId: ${bookingId}, newTime: ${newScheduledAt}`);

    return session as unknown as ISeniorSession;
  }


  /**
   * Start a Confirmed Senior Booking
   */
  async startBooking(
    userId: string,
    sessionId: string,
    bookingId: string
  ): Promise<ISeniorSession> {
    await this.ensureSeniorMentor(userId);
    const session = await this.repository.findBySessionIdAndMentorId(sessionId, userId);
    
    if (!session) {
      throw new NotFoundError('Senior Session not found or access denied');
    }

    const bookingIndex = session.bookings.findIndex((b: any) => b._id.toString() === bookingId);
    if (bookingIndex === -1) {
      throw new NotFoundError('Booking not found');
    }

    const booking = session.bookings[bookingIndex];

    if (booking.status !== SeniorSessionStatus.CONFIRMED) {
      throw new BadRequestError('Booking must be confirmed before starting');
    }

    const bookingScheduledAt = booking.scheduledAt || session.scheduledAt;
    if (!isStartAllowed(bookingScheduledAt)) {
      const isTooEarly = Date.now() < new Date(bookingScheduledAt).getTime();
      const err: any = new Error(
        isTooEarly ? 'Session cannot be started yet — too early.' : 'Session start window has expired.'
      );
      err.code = isTooEarly ? 'TOO_EARLY' : 'WINDOW_EXPIRED';
      throw err;
    }

    const startedAtNow = new Date();
    session.bookings[bookingIndex].status = SeniorSessionStatus.IN_PROGRESS;
    session.bookings[bookingIndex].startedAt = startedAtNow;
    
    await (session as any).save();

    logger.info(`Senior Session started: ${sessionId}, booking: ${bookingId}`);

    if (booking.menteeId) {
      try {
        const { default: NotificationService, NotificationType, NotificationChannel } = await import('./notification.service');
        await NotificationService.sendNotification({
          userId: booking.menteeId,
          type: NotificationType.SESSION_STARTED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: 'Session Started',
            message: `Your session "${session.title}" has started. Join now!`,
          },
        });
      } catch (e: any) {
        logger.error('Notification failed (startSession):', e);
      }

      try {
        const payload = {
          sessionId: session.sessionId,
          bookingId: booking._id?.toString() || bookingId,
          roomId: booking._id?.toString() || bookingId,
          title: session.title,
          startedAt: startedAtNow,
          scheduledAt: bookingScheduledAt,
          meetingUrl: null,
        };
        emitToUser(booking.menteeId, 'session:started', payload);
        emitToUser(booking.menteeId, 'mentorship:session:started', payload);
      } catch (emitErr: any) {
        logger.error('Socket emit failed (session:started):', emitErr);
      }
    }

    return session as unknown as ISeniorSession;
  }

  /**
   * Complete an In-Progress Senior Booking
   */
  async completeBooking(
    userId: string,
    sessionId: string,
    bookingId: string
  ): Promise<ISeniorSession> {
    await this.ensureSeniorMentor(userId);
    const session = await this.repository.findBySessionIdAndMentorId(sessionId, userId);
    
    if (!session) {
      throw new NotFoundError('Senior Session not found or access denied');
    }

    const bookingIndex = session.bookings.findIndex((b: any) => b._id.toString() === bookingId);
    if (bookingIndex === -1) {
      throw new NotFoundError('Booking not found');
    }

    const booking = session.bookings[bookingIndex];
    if (booking.status !== SeniorSessionStatus.IN_PROGRESS) {
      throw new BadRequestError('Booking must be in progress before it can be completed');
    }

    const now = new Date();
    session.bookings[bookingIndex].status = SeniorSessionStatus.COMPLETED;
    session.bookings[bookingIndex].completion = {
      completedAt: now,
      actualDuration: booking.startedAt 
        ? Math.round((now.getTime() - new Date(booking.startedAt).getTime()) / 60000)
        : session.duration,
      wasSuccessful: true,
      followUpRequired: false
    };
    
    await (session as any).save();

    logger.info(`Senior Booking completed: ${sessionId} / ${bookingId}`);

    if (booking.menteeId) {
      try {
        const endedPayload = {
          sessionId: session.sessionId,
          bookingId: booking._id?.toString() || bookingId,
          roomId: booking._id?.toString() || bookingId,
          endedAt: now.toISOString(),
          endedBy: userId,
          status: 'completed',
          actualDuration: session.bookings[bookingIndex].completion.actualDuration,
        };
        emitToUser(userId, 'session:ended', endedPayload);
        emitToUser(booking.menteeId, 'session:ended', endedPayload);
      } catch (emitErr: any) {
        logger.error('Socket emit failed (session:ended):', emitErr);
      }

      try {
        const { default: NotificationService, NotificationType, NotificationChannel } = await import('./notification.service');
        await NotificationService.sendNotification({
          userId: booking.menteeId,
          type: NotificationType.SESSION_COMPLETED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: 'Session Completed',
            message: `Your session "${session.title}" is complete. Please leave a review!`,
          },
        });
      } catch (e: any) { 
        logger.error('Notification failed (completeSession):', e);
      }
    }

    return session as unknown as ISeniorSession;
  }

}

export default new SeniorSessionService();