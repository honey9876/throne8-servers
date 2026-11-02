//src/Mentorship/services/group.service.ts
import { logger } from "@/shared/logger.util";
import { NotFoundError, BadRequestError, ForbiddenError } from "@/shared/errors/app.error";
import { GroupSession } from "../models";
import { generateSecureId } from "@/shared/security";
import groupRepository from "../repositories/group.repository";

import mentorRepository from "../repositories/mentor.repository";
import availabilityRepository from "../repositories/availability.repository";
import availabilityService from "./availability.service";
import cloudinary, { normalizeCloudinaryError } from '@/config/images/store/cloudinary/cloudinary.config';

import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import { TrustScoreEvents } from '../events/trustScore.events';
import { User } from '@/shared/models/index.models';
import NotificationService, { NotificationType, NotificationChannel } from './notification.service';
import { emitToUser } from '@/socket/emitter';


interface CreateGroupSessionInput {
  mentorId: string;
  title: string;
  description: string;
  topic: string;
  category?: string;
  scheduledAt?: Date;   // optional: absent when isTemplate is true
  duration: number;
  timezone: string;
  maxParticipants: number;
  minParticipants: number;
  pricePerPerson: number;
  agenda?: string;
  outcomes?: string[];
  paymentMethod: string;
  followUp?: {
    allowed: boolean;
    periodDays: number;
  };
  bufferTimeMinutes?: number;
  isTemplate?: boolean;
  meetingUrl?: string;
  meeting?: {
    platform?: string;
    meetingUrl?: string;
  };
}

const MEET_URL_REGEX = /^https:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[A-Za-z0-9]+)(\?.*)?$/;


class GroupService {
  /**
   * Uploads a thumbnail to Cloudinary using the promise API (not
   * upload_stream). The stream variant let the SDK surface a rejection
   * outside our callback, which showed up as "unhandledRejection" and a
   * misleading 500. With `await`, every failure lands in our catch.
   */
  private async uploadImageToCloudinary(
    file: { buffer: Buffer; mimetype?: string },
    identifier: string
  ): Promise<string> {
    const mime = file.mimetype || 'image/jpeg';
    const dataUri = `data:${mime};base64,${file.buffer.toString('base64')}`;

    try {
      const result = await cloudinary.uploader.upload(dataUri, {
        folder: 'group-session-thumbnails',
        public_id: `group_session_${identifier}_${Date.now()}`,
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 1200, crop: 'limit' },
          { quality: 'auto:good' },
        ],
        overwrite: true,
      });

      return result.secure_url;
    } catch (error: any) {
      const details = normalizeCloudinaryError(error);
      logger.error('Cloudinary upload failed', {
        identifier,
        bytes: file.buffer?.length,
        ...details,
      });
      throw new Error(
        `Cloudinary upload failed${details.httpCode ? ` (${details.httpCode})` : ''}: ${details.message}`
      );
    }
  }

  /**
   * Thumbnail is optional. If the upload fails, the session itself should
   * still be created/updated, so this swallows the error (already logged
   * in uploadImageToCloudinary) and returns undefined.
   */
  private async tryUploadThumbnail(file: any, identifier: string): Promise<string | undefined> {
    if (!file?.buffer) return undefined;
    try {
      return await this.uploadImageToCloudinary(file, identifier);
    } catch (error: any) {
      logger.warn(`Thumbnail upload skipped for ${identifier}: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Fire-and-forget notifier for every registered participant of a session.
   * Used on start/cancel/complete so mentees are not left in the dark
   * (previously only the mentor ever got notified on join). Never throws.
   *
   * Only notifies participants whose join request has been ACCEPTED by the
   * mentor. Pending/rejected requesters never joined the session, so they
   * must never receive "session started" / "session cancelled"
   * notifications or be allowed into the live room.
   */
  private async notifyParticipants(
    session: any,
    type: NotificationType,
    title: string,
    message: string
  ): Promise<void> {
    try {
      const menteeIds: string[] = (session.participants || [])
        .filter((p: any) => p.attendanceStatus !== 'cancelled' && p.requestStatus === 'accepted')
        .map((p: any) => p.menteeId);

      if (menteeIds.length === 0) return;

      await Promise.all(
        menteeIds.map((menteeId) =>
          NotificationService.sendNotification({
            userId: menteeId,
        module: 'industry-mentor',
            type,
            channels: [NotificationChannel.IN_APP],
            data: { title, message },
          }).catch((err: any) => {
            logger.error(`Notification failed for participant ${menteeId}:`, err);
          })
        )
      );
    } catch (err: any) {
      logger.error('notifyParticipants failed:', err);
    }
  }

  async createGroupSession(
    input: CreateGroupSessionInput,
    file?: any,
    authToken?: string
  ): Promise<any> {
    try {
      logger.info(`Creating group session for mentor ${input.mentorId}`);

      const mentor = await mentorRepository.findByUserId(input.mentorId);
      if (!mentor) {
        throw new NotFoundError('Mentor profile not found for this user');
      }

      // A template (isTemplate: true) has no fixed scheduledAt, so skip the
      // date validation and parsing for it. Only a fixed-date group session
      // (legacy / isTemplate: false) gets the future-date check.
      let scheduledDate: Date | undefined = undefined;
      if (!input.isTemplate) {
        if (!input.scheduledAt) {
          throw new BadRequestError('Scheduled time is required for a fixed-date group session');
        }
        scheduledDate = new Date(input.scheduledAt);
        if (scheduledDate <= new Date()) {
          throw new BadRequestError('Scheduled time must be in the future');
        }
      }

      // Validate the meeting link before doing any external upload work.
      const rawMeetUrl = input.meetingUrl || input.meeting?.meetingUrl;
      if (!rawMeetUrl || typeof rawMeetUrl !== 'string' || !MEET_URL_REGEX.test(rawMeetUrl.trim())) {
        throw new BadRequestError('A valid Google Meet link is required (e.g. https://meet.google.com/abc-defg-hij)');
      }
      const meetingUrl = rawMeetUrl.trim();

      const thumbnailUrl = await this.tryUploadThumbnail(file, input.mentorId);

      const session = new GroupSession({
        sessionId: generateSecureId(),
        mentorId: mentor.mentorId,
        title: input.title,
        description: input.description,
        thumbnailImage: thumbnailUrl,
        topic: input.topic,
        category: input.category,
        scheduledAt: scheduledDate,
        isTemplate: !!input.isTemplate,
        duration: input.duration,
        timezone: input.timezone,
        status: 'open',
        maxParticipants: input.maxParticipants,
        minParticipants: input.minParticipants,
        currentParticipants: 0,
        participants: [],
        pricing: {
          pricePerPerson: input.pricePerPerson,
          currency: 'INR',
          totalRevenue: 0,
        },
        payment: {
          method: input.paymentMethod,
        },
        settings: {
          followUp: {
            allowed: input.followUp?.allowed || false,
            periodDays: input.followUp?.periodDays || 0,
          },
          bufferTimeMinutes: input.bufferTimeMinutes || 0,
        },
        meeting: {
          platform: 'google_meet',
          meetingUrl: meetingUrl,
        },
        agenda: input.agenda,
        outcomes: input.outcomes,
        chat: {
          enabled: true,
          messageCount: 0,
        },
      });

      await session.save();

      logger.info(`Group session created successfully: ${session._id}`);

      return session;
    } catch (error: any) {
      logger.error(`Failed to create group session: ${error?.message || error}`, {
        name: error?.name,
        httpCode: error?.http_code,
        stack: error?.stack,
      });
      throw error;
    }
  }

  async getGroupSessionById(sessionId: string, _authToken?: string): Promise<any> {
    try {
      const isObjectId = mongoose.isValidObjectId(sessionId);
      const query = isObjectId ? { $or: [{ _id: sessionId }, { sessionId }] } : { sessionId };

      const session = await GroupSession.findOne(query);
      if (!session) {
        throw new NotFoundError('Group session not found');
      }

      return session;
    } catch (error: any) {
      logger.error(`Failed to fetch group session:${error}`);
      throw error;
    }
  }

  async getAllGroupSessions(
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: string;
      topic?: string;
      mentorId?: string;
    },
    _authToken?: string
  ): Promise<{
    sessions: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const query: any = {};

      if (filters?.status) {
        query.status = filters.status;
      }

      if (filters?.topic) {
        query.topic = new RegExp(filters.topic, 'i');
      }

      if (filters?.mentorId) {
        query.mentorId = filters.mentorId;
      }

      const skip = (page - 1) * limit;

      const [sessions, total] = await Promise.all([
        groupRepository.findAll(query, skip, limit),
        groupRepository.count(query),
      ]);

      return {
        sessions,
        total,
        page,
        limit,
      };
    } catch (error: any) {
      logger.error(`Failed to fetch group sessions:${error}`);
      throw error;
    }
  }

  async getUpcomingGroupSessions(
    mentorId?: string,
    limit: number = 10,
    _authToken?: string
  ): Promise<any[]> {
    try {
      const query: any = {
        scheduledAt: { $gt: new Date() },
        status: { $in: ['open', 'full'] },
      };

      if (mentorId) {
        query.mentorId = mentorId;
      }

      return await groupRepository.findUpcoming(query, limit);
    } catch (error: any) {
      logger.error(`Failed to fetch upcoming group sessions:${error}`);
      throw error;
    }
  }

  /**
   * This no longer registers the mentee directly into the session. It
   * creates a PENDING join request (via session.addParticipant, whose
   * internal behaviour changed in the model) and notifies the mentor that a
   * new request is waiting, mirroring the "new request" notification
   * pattern used by 1:1 bookSession(). The mentee is told the request was
   * sent, not that they're confirmed.
   */
  async joinGroupSession(
    sessionId: string,
    menteeId: string,
    transactionId?: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      if (session.status !== 'open') {
        throw new BadRequestError('Session is not open for registration');
      }

      const existing = session.participants.find(
        (p: any) => p.menteeId === menteeId
      );

      if (existing && existing.requestStatus === 'pending') {
        throw new BadRequestError('Join request already sent and awaiting mentor approval');
      }

      if (existing && existing.requestStatus === 'accepted') {
        throw new BadRequestError('Already registered for this session');
      }

      await session.addParticipant(menteeId, transactionId);

      logger.info(`User ${menteeId} requested to join group session: ${sessionId}`);

      (async () => {
        try {
          const [mentorProfile, mentee] = await Promise.all([
            mentorRepository.findByMentorId(session.mentorId),
            User.findOne({ userId: menteeId, 'flags.isDeleted': false }).select('fullName email'),
          ]);

          if (!mentorProfile?.userId) {
            logger.warn(`Could not resolve mentor userId for group session notification: ${session.mentorId}`);
            return;
          }

          const menteeName = mentee?.fullName || mentee?.email || 'A mentee';
          const acceptedCount = session.participants.filter(
            (p: any) => p.requestStatus === 'accepted'
          ).length;

          await NotificationService.sendNotification({
            userId: mentorProfile.userId,
        module: 'industry-mentor',
            type: NotificationType.NEW_BOOKING_REQUEST,
            channels: [NotificationChannel.IN_APP],
            data: {
              menteeId,
              menteeName,
              title: 'New Group Session Join Request',
              message: `${menteeName} requested to join "${session.title}". ${acceptedCount}/${session.maxParticipants} seats filled. Review and accept/reject in your dashboard.`,
            },
          });
        } catch (notifyErr: any) {
          logger.error('Notification failed (joinGroupSession -> mentor):', notifyErr);
        }
      })();

      (async () => {
        try {
          await NotificationService.sendNotification({
            userId: menteeId,
        module: 'industry-mentor',
            type: NotificationType.NEW_BOOKING_REQUEST,
            channels: [NotificationChannel.IN_APP],
            data: {
              title: 'Join Request Sent',
              message: `Your request to join "${session.title}" has been sent to the mentor. You'll be notified once it's reviewed.`,
            },
          });
        } catch (notifyErr: any) {
          logger.error('Notification failed (joinGroupSession -> mentee):', notifyErr);
        }
      })();

      return session;
    } catch (error: any) {
      logger.error(`Failed to join group session:${error}`);
      throw error;
    }
  }

  /**
   * Returns the logged-in mentee's own join-request status for a session.
   * Powers the Join Group / Request Pending / Joined button state on the
   * mentor-card page. Returns null when the mentee has never requested to
   * join (controller maps that to a 404), otherwise returns the
   * participant's current status.
   */
  async getMyJoinRequestStatus(
    sessionId: string,
    menteeId: string,
    authToken?: string
  ): Promise<any | null> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      const participant = session.participants.find(
        (p: any) => p.menteeId === menteeId
      );

      if (!participant) {
        return null;
      }

      return {
        sessionId: session.sessionId,
        menteeId: participant.menteeId,
        requestStatus: participant.requestStatus,
        attendanceStatus: participant.attendanceStatus,
        registeredAt: participant.registeredAt,
        paymentStatus: participant.paymentStatus,
      };
    } catch (error: any) {
      logger.error(`Failed to fetch join request status:${error}`);
      throw error;
    }
  }

  /**
   * Mentor accepts a mentee's pending join request. This is the only place
   * a mentee actually becomes a confirmed participant.
   */
  async acceptJoinRequest(
    sessionId: string,
    mentorId: string,
    menteeId: string,
    authToken?: string
  ): Promise<any> {
    try {
      const mentor = await mentorRepository.findByUserId(mentorId);
      if (!mentor) throw new ForbiddenError('Mentor profile not found');

      const session = await this.getGroupSessionById(sessionId, authToken);

      if (session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the host mentor can accept join requests for this session');
      }

      await session.acceptParticipant(menteeId);

      logger.info(`Mentor ${mentorId} accepted join request from ${menteeId} for session ${sessionId}`);

      (async () => {
        try {
          await NotificationService.sendNotification({
            userId: menteeId,
        module: 'industry-mentor',
            type: NotificationType.BOOKING_CONFIRMED,
            channels: [NotificationChannel.IN_APP],
            data: {
              title: 'Join Request Accepted',
              message: `You're confirmed for "${session.title}" on ${new Date(session.scheduledAt).toLocaleString()}. We'll notify you when the mentor starts the session.`,
            },
          });
        } catch (notifyErr: any) {
          logger.error('Notification failed (acceptJoinRequest -> mentee):', notifyErr);
        }
      })();

      return session;
    } catch (error: any) {
      logger.error(`Failed to accept join request:${error}`);
      throw error;
    }
  }

  /**
   * Mentor rejects a mentee's pending join request.
   */
  async rejectJoinRequest(
    sessionId: string,
    mentorId: string,
    menteeId: string,
    authToken?: string
  ): Promise<any> {
    try {
      const mentor = await mentorRepository.findByUserId(mentorId);
      if (!mentor) throw new ForbiddenError('Mentor profile not found');

      const session = await this.getGroupSessionById(sessionId, authToken);

      if (session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the host mentor can reject join requests for this session');
      }

      await session.rejectParticipant(menteeId);

      logger.info(`Mentor ${mentorId} rejected join request from ${menteeId} for session ${sessionId}`);

      (async () => {
        try {
          await NotificationService.sendNotification({
            userId: menteeId,
        module: 'industry-mentor',
            type: NotificationType.SESSION_CANCELLED,
            channels: [NotificationChannel.IN_APP],
            data: {
              title: 'Join Request Declined',
              message: `Your request to join "${session.title}" was declined by the mentor.`,
            },
          });
        } catch (notifyErr: any) {
          logger.error('Notification failed (rejectJoinRequest -> mentee):', notifyErr);
        }
      })();

      return session;
    } catch (error: any) {
      logger.error(`Failed to reject join request:${error}`);
      throw error;
    }
  }

  /**
   * List of pending join requests across all of a mentor's group sessions.
   * Powers the "Join Requests" panel in the mentor dashboard.
   */
  async getPendingJoinRequestsForMentor(userId: string): Promise<any[]> {
    try {
      const mentor = await mentorRepository.findByUserId(userId);
      const mentorIdQuery = mentor ? [mentor.mentorId, userId] : [userId];

      const sessions = await GroupSession.find({
        mentorId: { $in: mentorIdQuery },
        'participants.requestStatus': 'pending',
      }).lean();

      const menteeIds = new Set<string>();
      const rows: any[] = [];

      for (const session of sessions) {
        for (const participant of (session as any).participants || []) {
          if (participant.requestStatus === 'pending') {
            menteeIds.add(participant.menteeId);
            rows.push({
              sessionId: session.sessionId,
              sessionTitle: session.title,
              scheduledAt: session.scheduledAt,
              menteeId: participant.menteeId,
              requestedAt: participant.registeredAt,
              currentAccepted: (session as any).currentParticipants,
              maxParticipants: session.maxParticipants,
            });
          }
        }
      }

      if (menteeIds.size > 0) {
        const users = await User.find({ userId: { $in: Array.from(menteeIds) } })
          .select('userId fullName email')
          .lean();
        const userMap = new Map(users.map((u: any) => [u.userId, u]));
        for (const row of rows) {
          const u = userMap.get(row.menteeId);
          row.menteeName = u?.fullName || u?.email || 'Unknown';
        }
      }

      rows.sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime());

      return rows;
    } catch (error: any) {
      logger.error(`Failed to fetch pending join requests for mentor: ${error}`);
      throw error;
    }
  }

  /**
   * Leave a group session (mentee-initiated cancellation).
   *
   * The 24-hour lock-in only makes sense for a participant who actually
   * holds a CONFIRMED seat (requestStatus === 'accepted'). A mentee whose
   * join request is still PENDING (never accepted by the mentor, never
   * occupying a seat, never counted in currentParticipants) must always be
   * able to cancel that request, even inside the 24-hour window.
   */
  async leaveGroupSession(
    sessionId: string,
    menteeId: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      const participant = session.participants.find(
        (p: any) => p.menteeId === menteeId
      );

      if (!participant) {
        throw new BadRequestError('Not registered for this session');
      }

      const wasAccepted = participant.requestStatus === 'accepted';

      if (wasAccepted) {
        const hoursDiff = (session.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);

        if (hoursDiff < 24) {
          throw new BadRequestError('Cannot leave within 24 hours of session');
        }
      }

      await session.removeParticipant(menteeId);

      logger.info(`User ${menteeId} left group session: ${sessionId}`);

      // Only notify the mentor when an actual accepted seat was freed. A
      // pending request being cancelled never occupied a seat, so there is
      // nothing for the mentor to act on.
      if (wasAccepted) {
        (async () => {
          try {
            const mentorProfile = await mentorRepository.findByMentorId(session.mentorId);
            if (!mentorProfile?.userId) return;

            await NotificationService.sendNotification({
              userId: mentorProfile.userId,
        module: 'industry-mentor',
              type: NotificationType.SESSION_CANCELLED,
              channels: [NotificationChannel.IN_APP],
              data: {
                menteeId,
                title: 'Group Session Seat Freed',
                message: `A mentee left "${session.title}". ${session.currentParticipants}/${session.maxParticipants} seats filled.`,
              },
            });
          } catch (notifyErr: any) {
            logger.error('Notification failed (leaveGroupSession -> mentor):', notifyErr);
          }
        })();
      }

      // TODO: Process refund

      return session;
    } catch (error: any) {
      logger.error(`Failed to leave group session: ${error}`);
      throw error;
    }
  }

  async startGroupSession(
    sessionId: string,
    mentorId: string,
    authToken?: string
  ): Promise<any> {
    try {
      const mentor = await mentorRepository.findByUserId(mentorId);
      if (!mentor) throw new ForbiddenError('Mentor profile not found');

      const session = await this.getGroupSessionById(sessionId, authToken);

      if (session.mentorId !== mentor.mentorId && session.mentorId !== mentorId) {
        throw new ForbiddenError('Only the mentor can start this session');
      }

      if (session.isTemplate) {
        throw new BadRequestError('Cannot start a template session');
      }

      if (!session.scheduledAt) {
        throw new BadRequestError('Cannot start session: session has no scheduled date');
      }

      if (!session.meeting?.meetingUrl) {
        throw new BadRequestError('Add a Google Meet link before starting');
      }

      try {
        await session.startSession();
      } catch (err: any) {
        if (err instanceof BadRequestError || err instanceof ForbiddenError || err instanceof NotFoundError) {
          throw err;
        }
        throw new BadRequestError(err.message || 'Cannot start session');
      }

      logger.info(`Group session started: ${sessionId}`);

      // Notifications and socket emits in their own try/catch (warn only)
      try {
        await this.notifyParticipants(
          session,
          NotificationType.SESSION_STARTED,
          'Group Session Started',
          `"${session.title}" has started. Join now.`
        );
      } catch (notifyErr: any) {
        logger.warn('Failed to notify participants on group session start:', notifyErr);
      }

      try {
        const acceptedMenteeIds: string[] = (session.participants || [])
          .filter((p: any) => p.attendanceStatus !== 'cancelled' && p.requestStatus === 'accepted')
          .map((p: any) => p.menteeId);

        const sessionStartedPayload = {
          sessionId: session.sessionId,
          roomId: session.sessionId,
          title: session.title,
          startedAt: new Date().toISOString(),
          scheduledAt: session.scheduledAt,
        };

        acceptedMenteeIds.forEach((menteeId) => {
          emitToUser(menteeId, 'session:started', sessionStartedPayload);
          emitToUser(menteeId, 'mentorship:session:started', sessionStartedPayload);
        });
      } catch (socketErr: any) {
        logger.warn('Failed to emit session started sockets:', socketErr);
      }

      return session;
    } catch (error: any) {
      if (error instanceof BadRequestError || error instanceof ForbiddenError || error instanceof NotFoundError) {
        throw error;
      }
      logger.error(`Failed to start group session: ${error}`);
      throw error;
    }
  }

  async completeGroupSession(
    sessionId: string,
    mentorId: string,
    actualDuration?: number,
    attendees?: string[],
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      const mentor = await mentorRepository.findByUserId(mentorId);
      if (!mentor) throw new ForbiddenError('Mentor profile not found');

      if (session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the mentor can complete this session');
      }

      if (attendees && attendees.length > 0) {
        session.participants.forEach((p: any) => {
          if (p.requestStatus === 'accepted') {
            p.attendanceStatus = attendees.includes(p.menteeId) ? 'attended' : 'absent';
          }
        });
      }

      await session.completeSession(actualDuration);

      TrustScoreEvents.emit('GroupSessionCompleted', {
        mentorId: session.mentorId,
        sessionId,
        timestamp: new Date()
      });

      logger.info(`Group session completed: ${sessionId}`);

      await this.notifyParticipants(
        session,
        NotificationType.SESSION_COMPLETED,
        'Session Completed',
        `"${session.title}" has ended. Please share your feedback.`
      );

      return session;
    } catch (error: any) {
      logger.error(`Failed to complete group session:${error}`);
      throw error;
    }
  }

  async cancelGroupSession(
    sessionId: string,
    mentorId: string,
    reason: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      const mentor = await mentorRepository.findByUserId(mentorId);
      if (!mentor) throw new ForbiddenError('Mentor profile not found');

      if (session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the mentor can cancel this session');
      }

      await session.cancelSession(reason);

      TrustScoreEvents.emit('GroupSessionCancelled', {
        mentorId: session.mentorId,
        sessionId,
        timestamp: new Date()
      });

      logger.info(`Group session cancelled: ${sessionId}`);

      await this.notifyParticipants(
        session,
        NotificationType.SESSION_CANCELLED,
        'Group Session Cancelled',
        `"${session.title}" was cancelled by the mentor. Reason: ${reason}`
      );

      // TODO: Process refunds for all participants (payment gateway not wired yet)

      return session;
    } catch (error: any) {
      logger.error(`Failed to cancel group session:${error}`);
      throw error;
    }
  }

  async updateGroupSession(
    sessionId: string,
    userId: string,
    updates: Partial<any>,
    file?: any,
    authToken?: string
  ): Promise<any> {
    try {
      logger.info(`Updating group session ${sessionId} by user ${userId}`);

      const isObjectId = mongoose.isValidObjectId(sessionId);
      const query = isObjectId ? { $or: [{ _id: sessionId }, { sessionId }] } : { sessionId };
      const session = await GroupSession.findOne(query);

      if (!session) {
        throw new NotFoundError('Group session not found');
      }

      const mentor = await mentorRepository.findByUserId(userId);
      if (!mentor || session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the host mentor can update this session');
      }

      const updatePayload: any = { $set: {} };

      if (file) {
        const thumbnailUrl = await this.tryUploadThumbnail(file, sessionId);
        if (thumbnailUrl) {
          updatePayload.$set.thumbnailImage = thumbnailUrl;
        }
      }

      if (updates.title) updatePayload.$set.title = updates.title;
      if (updates.description) updatePayload.$set.description = updates.description;
      if (updates.topic) updatePayload.$set.topic = updates.topic;
      if (updates.category) updatePayload.$set.category = updates.category;
      if (updates.scheduledAt) updatePayload.$set.scheduledAt = new Date(updates.scheduledAt);
      if (updates.duration !== undefined) updatePayload.$set.duration = Number(updates.duration);
      if (updates.timezone) updatePayload.$set.timezone = updates.timezone;
      if (updates.maxParticipants !== undefined) updatePayload.$set.maxParticipants = Number(updates.maxParticipants);
      if (updates.minParticipants !== undefined) updatePayload.$set.minParticipants = Number(updates.minParticipants);

      if (updates.pricePerPerson !== undefined) {
        updatePayload.$set['pricing.pricePerPerson'] = Number(updates.pricePerPerson);
      }

      if (updates.paymentMethod) {
        updatePayload.$set['payment.method'] = updates.paymentMethod;
      }

      if (updates.followUp !== undefined) {
        updatePayload.$set['settings.followUp'] = updates.followUp;
      }

      if (updates.bufferTimeMinutes !== undefined) {
        updatePayload.$set['settings.bufferTimeMinutes'] = Number(updates.bufferTimeMinutes);
      }

      if (updates.status) {
        updatePayload.$set.status = updates.status;
      }

      if (updates.meetingUrl) {
        if (!MEET_URL_REGEX.test(updates.meetingUrl.trim())) {
          throw new BadRequestError('Must be a valid Google Meet link (e.g. https://meet.google.com/abc-defg-hij)');
        }
        updatePayload.$set['meeting.platform'] = 'google_meet';
        updatePayload.$set['meeting.meetingUrl'] = updates.meetingUrl.trim();
      }

      const updatedSession = await GroupSession.findOneAndUpdate(
        query,
        updatePayload,
        { new: true, runValidators: true }
      );

      if (!updatedSession) {
        throw new Error("findOneAndUpdate failed to return document");
      }

      logger.info(`Group session updated successfully: ${session.sessionId}`);
      return updatedSession;
    } catch (error: any) {
      logger.error(`Failed to update group session: ${error.message}`);
      throw error;
    }
  }

  async deleteGroupSession(sessionId: string, userId: string, authToken?: string): Promise<void> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      const mentor = await mentorRepository.findByUserId(userId);
      if (!mentor || session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError('Only the host mentor can delete this session');
      }

      if (session.currentParticipants > 0) {
        throw new BadRequestError('Cannot delete a session with registered participants. Cancel it first.');
      }

      const isObjectId = mongoose.isValidObjectId(sessionId);
      const query = isObjectId ? { $or: [{ _id: sessionId }, { sessionId }] } : { sessionId };
      await GroupSession.deleteOne(query);

      logger.info(`Group session deleted: ${sessionId}`);
    } catch (error: any) {
      logger.error(`Failed to delete group session: ${error.message}`);
      throw error;
    }
  }

  async addFeedback(
    sessionId: string,
    menteeId: string,
    rating: number,
    comment?: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      if (session.status !== 'completed') {
        throw new BadRequestError('Can only provide feedback for completed sessions');
      }

      const participant = session.participants.find(
        (p: any) => p.menteeId === menteeId && p.attendanceStatus === 'attended'
      );

      if (!participant) {
        throw new ForbiddenError('Only attendees can provide feedback');
      }

      await session.addFeedback(menteeId, rating, comment);

      logger.info(`Feedback added for group session: ${sessionId}`);

      return session;
    } catch (error: any) {
      logger.error(`Failed to add feedback:${error}`);
      throw error;
    }
  }

  async getMyGroupSessions(
    userId: string,
    role: 'mentor' | 'mentee',
    _authToken?: string
  ): Promise<any[]> {
    try {
      if (role === 'mentor') {
        const mentor = await mentorRepository.findByUserId(userId);
        const mentorIdQuery = mentor ? [mentor.mentorId, userId] : [userId];
        return await GroupSession.find({ mentorId: { $in: mentorIdQuery } })
          .sort({ scheduledAt: -1 })
          .lean();
      }
      const sessions = await groupRepository.findByUserId(userId, role);
      return await Promise.all(
        sessions.map((s: any) => this.sanitizeGroupSession(s, userId))
      );
    } catch (error: any) {
      logger.error(`Failed to fetch my group sessions: ${error}`);
      throw error;
    }
  }

  /**
   * Group-session participants across a mentor's sessions, grouped into ONE
   * row per session (not one row per participant), each row carrying the
   * full accepted-participant list so the mentor's Booking dashboard can
   * show "2/7 Enrolled" plus a "View Participants" list, instead of
   * spawning a duplicate table row per student in the same session.
   *
   * Only ACCEPTED participants are counted/listed here. Pending requests
   * belong in the Join Requests panel (getPendingJoinRequestsForMentor),
   * not in the confirmed-bookings list. Sessions with zero accepted
   * participants are skipped, since there is nothing for the mentor to
   * manage yet on those.
   */
  async getGroupSessionParticipantsForMentor(userId: string): Promise<any[]> {
    try {
      const mentor = await mentorRepository.findByUserId(userId);
      const mentorIdQuery = mentor ? [mentor.mentorId, userId] : [userId];

      const sessions = await GroupSession.find({ mentorId: { $in: mentorIdQuery } })
        .sort({ scheduledAt: -1 })
        .lean();

      // Collect all accepted menteeIds across every session in one batch,
      // so we hit the User collection once instead of once per session.
      const menteeIds = new Set<string>();
      for (const session of sessions) {
        for (const participant of (session as any).participants || []) {
          if (participant.requestStatus === 'accepted') {
            menteeIds.add(participant.menteeId);
          }
        }
      }

      let userMap = new Map<string, any>();
      if (menteeIds.size > 0) {
        const users = await User.find({ userId: { $in: Array.from(menteeIds) } })
          .select('userId firstName lastName email profilePhotoId')
          .lean();
        userMap = new Map(users.map((u: any) => [u.userId, u]));
      }

      const rows: any[] = [];

      for (const session of sessions) {
        const accepted = ((session as any).participants || []).filter(
          (p: any) => p.requestStatus === 'accepted'
        );

        if (accepted.length === 0) continue;

        const participants = accepted.map((p: any) => {
          const u = userMap.get(p.menteeId);
          return {
            menteeId: p.menteeId,
            menteeName:
              (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '') ||
              u?.email ||
              'Student',
            menteeProfilePhoto: u?.profilePhotoId || null,
            attendanceStatus: p.attendanceStatus,
            registeredAt: p.registeredAt,
          };
        });

        rows.push({
          sessionId: session.sessionId,
          serviceName: `${session.title} (Group Session)`,
          scheduledAt: session.scheduledAt,
          maxParticipants: session.maxParticipants,
          enrolledCount: accepted.length,
          status:
            session.status === 'cancelled'
              ? 'cancelled'
              : session.status === 'completed'
              ? 'completed'
              : session.status === 'in_progress'
              ? 'in_progress'
              : session.status === 'full'
              ? 'full'
              : session.status === 'open'
              ? 'open'
              : 'confirmed',
          isGroupSession: true,
          isTemplate: !!session.isTemplate,
          meetingUrl: session.meeting?.meetingUrl,
          meeting: session.meeting,
          participants,
        });
      }

      return rows;
    } catch (error: any) {
      logger.error(`Failed to fetch group session participants for mentor: ${error}`);
      throw error;
    }
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /**
   * Bookable slots for a group-session TEMPLATE on a given date, derived
   * from the mentor's Availability. A slot comes back one of two ways:
   *  - status 'available': free slot, joining it will spawn a brand-new
   *    instance and book this exact range in Availability.
   *  - status 'joinable': an OPEN instance of THIS template already exists
   *    for that slot (someone else requested it first); joining it just
   *    adds a pending request to that same instance, no re-booking.
   * Slots booked by anything else (a 1:1 session, another template, a
   * closed/full instance) or blocked by the mentor are left out entirely.
   */
  async getTemplateAvailability(templateId: string, date: string): Promise<any[]> {
    try {
      const template = await this.getGroupSessionById(templateId);

      if (!template.isTemplate) {
        throw new BadRequestError('This session is not a template; it has a fixed date/time');
      }

      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        throw new BadRequestError('Invalid date format. Use YYYY-MM-DD');
      }

      const zone = template.timezone || 'Asia/Kolkata';
      const targetDT = DateTime.fromISO(date, { zone });
      const startOfDay = targetDT.startOf('day').toJSDate();
      const endOfDay = targetDT.endOf('day').toJSDate();

      const availability = await availabilityRepository.findByMentorAndDate(
        template.mentorId,
        startOfDay,
        endOfDay
      );

      if (!availability || availability.isDateBlocked) {
        return [];
      }

      const openInstances = await GroupSession.find({
        templateId,
        isTemplate: false,
        status: 'open',
        scheduledAt: { $gte: startOfDay, $lte: endOfDay },
      }).lean();

      // Collect all free (unbooked & unblocked) slots and sort them
      const freeSlots = (availability.slots || [])
        .filter((s: any) => !s.isBooked && !s.isBlocked)
        .map((s: any) => ({
          start: this.timeToMinutes(s.startTime),
          end: this.timeToMinutes(s.endTime),
        }))
        .sort((a: any, b: any) => a.start - b.start);

      // Merge continuous adjacent free slots into windows
      const freeWindows: Array<{ start: number; end: number }> = [];
      for (const s of freeSlots) {
        const last = freeWindows[freeWindows.length - 1];
        if (last && s.start <= last.end) {
          last.end = Math.max(last.end, s.end);
        } else {
          freeWindows.push({ ...s });
        }
      }

      const results: any[] = [];

      // 1. Process existing open instances for booked slots
      for (const slot of availability.slots || []) {
        if (slot.isBlocked) continue;

        if (slot.isBooked) {
          const inst = openInstances.find(
            (i: any) => i.availabilityId === availability.availabilityId && i.sessionId === slot.sessionId
          );
          if (!inst) continue; // booked by something else, hide it

          const acceptedCount = (inst.participants || []).filter(
            (p: any) => p.requestStatus === 'accepted'
          ).length;
          const spotsRemaining = Math.max(0, inst.maxParticipants - acceptedCount);

          results.push({
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: spotsRemaining > 0 ? 'joinable' : 'full',
            instanceId: inst.sessionId,
            spotsRemaining,
            maxParticipants: inst.maxParticipants,
          });
        }
      }

      // 2. Generate slots from free continuous windows divided by template.duration
      for (const w of freeWindows) {
        for (let start = w.start; start + template.duration <= w.end; start += template.duration) {
          const startTime = this.minutesToTime(start);
          const endTime = this.minutesToTime(start + template.duration);

          // Avoid duplicate slot entries if an instance already processed above matches
          if (!results.some((r) => r.startTime === startTime)) {
            results.push({
              startTime,
              endTime,
              status: 'available',
            });
          }
        }
      }

      // Sort final slots chronologically by start time
      results.sort((a, b) => this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime));

      return results;
    } catch (error: any) {
      logger.error(`Failed to fetch template availability: ${error}`);
      throw error;
    }
  }

  /**
   * Mentee picks a date+time slot for a template group session.
   *  - If an OPEN instance already exists for that exact slot, the mentee
   *    just sends a join request to it (no re-booking of Availability).
   *  - Otherwise a new instance is spawned from the template AND the slot
   *    is atomically booked in Availability first (bookRange), so two
   *    mentees racing for the same free slot can't both spawn instances.
   */
  async joinBySlot(
    templateId: string,
    menteeId: string,
    scheduledAt: string,
    transactionId?: string,
    authToken?: string
  ): Promise<any> {
    try {
      const template = await this.getGroupSessionById(templateId, authToken);

      if (!template.isTemplate) {
        throw new BadRequestError('This session is not a template; it has a fixed date/time. Use the regular join endpoint.');
      }

      const slotDate = new Date(scheduledAt);
      if (isNaN(slotDate.getTime())) {
        throw new BadRequestError('Invalid scheduledAt date/time');
      }
      if (slotDate <= new Date()) {
        throw new BadRequestError('Selected slot must be in the future');
      }

      // FIX: deriving startTime from the server's local timezone
      // (Date.getHours()) was wrong in production. The server runs in UTC
      // while availability.slots startTime is stored in the mentor's
      // wall-clock time (IST). That mismatch caused a "This slot is not
      // available" error even when the slot was actually free. Always
      // derive HH:mm via Luxon using template.timezone.
      const zone = template.timezone || 'Asia/Kolkata';
      const slotDT = DateTime.fromJSDate(slotDate, { zone });

      const startTime = slotDT.toFormat('HH:mm');
      const startOfDay = slotDT.startOf('day').toJSDate();
      const endOfDay = slotDT.endOf('day').toJSDate();


      const availability = await availabilityRepository.findByMentorAndDate(
        template.mentorId,
        startOfDay,
        endOfDay
      );

      if (!availability || availability.isDateBlocked) {
        throw new BadRequestError('Mentor is not available on this date');
      }

      const reqStart = this.timeToMinutes(startTime);
      const reqEnd = reqStart + template.duration;

      const exactSlot = availability.slots.find((s: any) => s.startTime === startTime);
      let slot: any;

      if (exactSlot && exactSlot.isBooked) {
        // Already-booked slot: only valid if it's an open instance of this template (checked below)
        slot = exactSlot;
      } else {
        // Free path: the requested range must be fully covered by free, unblocked slots
        const overlapping = (availability.slots || [])
          .filter((s: any) =>
            this.timeToMinutes(s.startTime) < reqEnd &&
            this.timeToMinutes(s.endTime) > reqStart
          )
          .sort((a: any, b: any) => this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime));

        let cursor = reqStart;
        let ok = overlapping.length > 0;
        for (const s of overlapping) {
          if (s.isBlocked || s.isBooked) { ok = false; break; }
          const sStart = this.timeToMinutes(s.startTime);
          const sEnd = this.timeToMinutes(s.endTime);
          if (sStart > cursor) { ok = false; break; }
          cursor = Math.max(cursor, sEnd);
        }

        if (!ok || cursor < reqEnd) {
          logger.warn(`joinBySlot: no free coverage for ${startTime}-${reqEnd} min`, {
            requested: startTime,
            stored: (availability.slots || []).map((s: any) => `${s.startTime}-${s.endTime}`),
          });
          throw new BadRequestError('This slot is not available');
        }

        slot = { isBooked: false };
      }

      let instance: any;

      if (slot.isBooked) {
        // Slot is taken. Only proceed if it's an OPEN instance of THIS template
        instance = await GroupSession.findOne({
          sessionId: slot.sessionId,
          templateId,
          isTemplate: false,
          status: 'open',
        });

        if (!instance) {
          throw new BadRequestError('This slot is no longer available');
        }

        if (instance.isFull) {
          throw new BadRequestError('This time slot is already full');
        }
      } else {
        // Free slot: book it in Availability first, then spawn the instance
        const endTime = this.minutesToTime(this.timeToMinutes(startTime) + template.duration);
        const newSessionId = generateSecureId();

        const booked = await availabilityService.bookRange(
          availability.availabilityId,
          template.mentorId,
          startTime,
          endTime,
          newSessionId
        );

        if (!booked) {
          throw new BadRequestError('This slot was just booked by someone else. Please pick another slot.');
        }

        instance = new GroupSession({
          sessionId: newSessionId,
          mentorId: template.mentorId,
          title: template.title,
          description: template.description,
          thumbnailImage: template.thumbnailImage,
          topic: template.topic,
          category: template.category,
          scheduledAt: slotDate,
          isTemplate: false,
          templateId,
          availabilityId: availability.availabilityId,
          duration: template.duration,
          timezone: template.timezone,
          status: 'open',
          maxParticipants: template.maxParticipants,
          minParticipants: template.minParticipants,
          currentParticipants: 0,
          participants: [],
          pricing: template.pricing,
          payment: template.payment,
          settings: template.settings,
          meeting: {
            platform: 'google_meet',
            meetingUrl: template.meeting?.meetingUrl,
            meetingId: template.meeting?.meetingId,
            passcode: template.meeting?.passcode,
          },
          agenda: template.agenda,
          outcomes: template.outcomes,
          chat: { enabled: true, messageCount: 0 },
        });

        try {
          await instance.save();
        } catch (err) {
          // rollback the Availability booking if instance creation fails
          await availabilityService.releaseRange(availability.availabilityId, startTime, endTime).catch(() => {});
          throw err;
        }
      }

      // Reuse the same pending-request flow as the normal join path
      return await this.joinGroupSession(instance.sessionId, menteeId, transactionId, authToken);
    } catch (error: any) {
      logger.error(`Failed to join group session by slot: ${error}`);
      throw error;
    }
  }

  async sanitizeGroupSession(session: any, currentUserId?: string): Promise<any> {
    if (!session) return session;
    const doc = session.toObject ? session.toObject({ virtuals: true }) : { ...session };

    const origParticipants = Array.isArray(doc.participants) ? doc.participants : [];
    const acceptedCount = origParticipants.filter((p: any) => p.requestStatus === 'accepted').length;
    const maxParticipants = doc.maxParticipants || 0;

    // Keep virtuals (isFull, spotsRemaining) and currentParticipants intact
    if (doc.isFull === undefined) {
      doc.isFull = acceptedCount >= maxParticipants;
    }
    if (doc.spotsRemaining === undefined) {
      doc.spotsRemaining = Math.max(0, maxParticipants - acceptedCount);
    }
    if (doc.currentParticipants === undefined) {
      doc.currentParticipants = acceptedCount;
    }

    let isMentor = false;
    if (currentUserId) {
      if (doc.mentorId === currentUserId) {
        isMentor = true;
      } else {
        const mentor = await mentorRepository.findByUserId(currentUserId);
        if (mentor && mentor.mentorId === doc.mentorId) {
          isMentor = true;
        }
      }
    }

    const isAcceptedMenteeDuringSession = Boolean(
      currentUserId &&
      doc.status === 'in_progress' &&
      origParticipants.some(
        (p: any) => (p.menteeId === currentUserId || p.menteeId?.toString() === currentUserId) && p.requestStatus === 'accepted'
      )
    );

    const canSeeMeeting = isMentor || isAcceptedMenteeDuringSession;

    if (!canSeeMeeting) {
      if (doc.meeting) {
        const { meetingUrl, meetingId, passcode, ...safeMeeting } = doc.meeting;
        doc.meeting = safeMeeting;
      }
      if (doc.meetingUrl) {
        delete doc.meetingUrl;
      }
    }

    // For callers who are not the session's mentor, replace doc.participants with only
    // the caller's own entry (menteeId === currentUserId); anonymous callers get [].
    // Strip transactionId from entries returned to non-mentors. Mentor keeps full list.
    if (!isMentor) {
      if (currentUserId) {
        doc.participants = origParticipants
          .filter(
            (p: any) =>
              p.menteeId === currentUserId ||
              p.menteeId?.toString() === currentUserId
          )
          .map((p: any) => {
            const item = typeof p.toObject === 'function' ? p.toObject() : { ...p };
            delete item.transactionId;
            return item;
          });
      } else {
        doc.participants = [];
      }
    }

    return doc;
  }

  async markMenteeAttendance(
    sessionId: string,
    menteeId: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      if (session.status !== 'in_progress') {
        throw new BadRequestError('Attendance can only be marked while session is in progress');
      }

      const participant = (session.participants || []).find(
        (p: any) => p.menteeId === menteeId
      );

      if (!participant) {
        throw new NotFoundError('Join request not found for this participant');
      }

      if (participant.requestStatus !== 'accepted') {
        throw new ForbiddenError('Only accepted participants can attend');
      }

      if (participant.attendanceStatus !== 'attended') {
        participant.attendanceStatus = 'attended';
        await session.save({ validateModifiedOnly: true });
      }

      return await this.sanitizeGroupSession(session, menteeId);
    } catch (error: any) {
      if (error instanceof BadRequestError || error instanceof ForbiddenError || error instanceof NotFoundError) {
        throw error;
      }
      logger.error(`Failed to mark mentee attendance: ${error}`);
      throw error;
    }
  }

}

const groupService = new GroupService();
export default groupService;