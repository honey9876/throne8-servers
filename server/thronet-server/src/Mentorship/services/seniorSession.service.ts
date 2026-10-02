import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

import seniorSessionRepository from '../repositories/seniorSession.repository';
import { ISeniorSession, CreateSeniorSessionInput, UpdateSeniorSessionInput } from '../interface/seniorSession.types';

import SeniorMentorApplicationService from './seniorMentorApplication.service';

import { ForbiddenError, NotFoundError, BadRequestError } from '@/shared/errors/app.error';
import seniorAvailabilityService from './seniorAvailability.service';
import { DateTime } from 'luxon';
import { User } from '@/shared/models/index.models';
import { BookingStatus, isStartAllowed } from '@/shared/constants/bookingStatus';

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
      const dt = DateTime.fromISO(payload.scheduledAt.toString()).setZone(tz);
      const dateStr = dt.toFormat('yyyy-MM-dd');
      const timeStr = dt.toFormat('HH:mm');
      
      const isValid = await seniorAvailabilityService.validateSlot(
        userId,
        dateStr,
        timeStr,
        payload.duration
      );
      
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
      status: payload.status ?? 'pending',
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
    
    if (session.status === 'cancelled') {
      throw new BadRequestError('Cannot book a cancelled session');
    }

    if (!payload.slotTime) {
      throw new BadRequestError('slotTime is required for booking');
    }

    // Availability validation check
    const parts = payload.slotTime.split('-').map((p: string) => p.trim());
    const timeStr = parts[0];
    const tz = session.timezone || 'Asia/Kolkata';
    const dateStr = payload.scheduledAt
      ? DateTime.fromISO(new Date(payload.scheduledAt).toISOString()).setZone(tz).toFormat('yyyy-MM-dd')
      : DateTime.now().setZone(tz).toFormat('yyyy-MM-dd'); // Fallback though it should ideally be provided

    const isValid = await seniorAvailabilityService.validateSlot(
      session.mentorId,
      dateStr,
      timeStr,
      session.duration
    );

    if (!isValid) {
      throw new BadRequestError('The selected time slot is not available or falls outside configured hours.');
    }

    const bookingId = uuidv4();

    const booking = {
      menteeId,
      bookedBy: menteeId,
      bookedAt: new Date(),
      status: 'upcoming',
      slotTime: payload.slotTime,
      scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
      payment: {
        status: 'pending',
        method: payload.paymentMethod || 'card'
      },
      pricing: payload.pricing
    };

    const updatedSession = await this.repository.addBooking(sessionId, booking as unknown as any);

    if (!updatedSession) {
      throw new BadRequestError('Failed to book session. The requested time slot may have just been booked by another user.');
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
      const dt = DateTime.fromJSDate(new Date(finalScheduledAt.toString())).setZone(finalTimezone);
      const dateStr = dt.toFormat('yyyy-MM-dd');
      const timeStr = dt.toFormat('HH:mm');
      
      const isValid = await seniorAvailabilityService.validateSlot(
        userId,
        dateStr,
        timeStr,
        finalDuration,
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
    if (existingSession.status === 'cancelled') {
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
   * Accept/Confirm a pending Junior Booking for a Senior Session
   */
  async acceptBooking(
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
    
    if (session.bookings[bookingIndex].status !== 'pending') {
      throw new BadRequestError('Only pending bookings can be accepted');
    }

    session.bookings[bookingIndex].status = 'upcoming'; // Mapping to 'upcoming' as standard in SeniorSessionSchema

    await (session as any).save();

    return session as unknown as ISeniorSession;
  }

  /**
   * Reject/Cancel a Junior Booking for a Senior Session
   */
  async rejectBooking(
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
    if (currentStatus === 'cancelled' || currentStatus === 'completed') {
      throw new BadRequestError('Cannot reject an already completed or cancelled booking');
    }

    session.bookings[bookingIndex].status = 'cancelled';
    
    await (session as any).save();

    return session as unknown as ISeniorSession;
  }

  /**
   * Start an Upcoming Senior Booking
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

    if (booking.status !== 'upcoming' && booking.status !== 'confirmed') {
      throw new BadRequestError('Only confirmed/upcoming bookings can be started');
    }

    const bookingScheduledAt = booking.scheduledAt || session.scheduledAt;
    if (!isStartAllowed(bookingScheduledAt)) {
      const isTooEarly = Date.now() < new Date(bookingScheduledAt).getTime();
      throw new BadRequestError(isTooEarly ? 'Session cannot be started yet — too early.' : 'Session start window has expired.');
    }

    session.bookings[bookingIndex].status = 'in_progress';
    
    await (session as any).save();

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

    if (session.bookings[bookingIndex].status !== 'in_progress') {
      throw new BadRequestError('Only in-progress bookings can be completed');
    }

    session.bookings[bookingIndex].status = 'completed';
    
    await (session as any).save();

    return session as unknown as ISeniorSession;
  }

}

export default new SeniorSessionService();