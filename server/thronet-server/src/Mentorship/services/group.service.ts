import { logger } from "@/shared/logger.util";
import { NotFoundError, BadRequestError, ForbiddenError } from "@/shared/errors/app.error";
import { User } from "@/auth/models";
import { GroupSession } from "../models";
import { generateSecureId } from "@/shared/security";
import groupRepository from "../repositories/group.repository";
import mentorRepository from "../repositories/mentor.repository";
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import mongoose from 'mongoose';
import { TrustScoreEvents } from '../events/trustScore.events';



interface CreateGroupSessionInput {
  mentorId: string;
  title: string;
  description: string;
  topic: string;
  category?: string;
  scheduledAt: Date;
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
}

class GroupService {
  private async uploadImageToCloudinary(buffer: Buffer, identifier: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'group-session-thumbnails',
          public_id: `group_session_${identifier}_${Date.now()}`,
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
   * Create a new group session
   */
  async createGroupSession(
    input: CreateGroupSessionInput,
    file?: any,
    authToken?: string
  ): Promise<any> {
    try {
      logger.info(`Creating group session for mentor ${input.mentorId}`);

      // ✅ userId se pehle mentor dhundo
      const mentor = await mentorRepository.findByUserId(input.mentorId); // input.mentorId actually userId hai
      if (!mentor) {
        throw new NotFoundError('Mentor profile not found for this user');
      }

      // Validate scheduled time
      const scheduledDate = new Date(input.scheduledAt);
      if (scheduledDate <= new Date()) {
        throw new BadRequestError(
          'Scheduled time must be in the future'
        );
      }

      let thumbnailUrl: string | undefined = undefined;
      if (file) {
        thumbnailUrl = await this.uploadImageToCloudinary(file.buffer, input.mentorId);
      }

      // Create group session
      const session = new GroupSession({
        sessionId: generateSecureId(),
        mentorId: mentor.mentorId,
        title: input.title,
        description: input.description,
        thumbnailImage: thumbnailUrl,
        topic: input.topic,
        category: input.category,
        scheduledAt: scheduledDate,
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
      logger.error(`Failed to create group session:${error}`);
      throw error;
    }
  }

  /**
   * Get group session by ID
   */
  async getGroupSessionById(sessionId: string, _authToken?: string): Promise<any> {
    try {

      // ✅ REPLACE WITH
      const session = await groupRepository.findBySessionId(sessionId);
      if (!session) {
        throw new NotFoundError('Group session not found');
      }

      return session;
    } catch (error: any) {
      logger.error(`Failed to fetch group session:${error}`);
      throw error;
    }
  }

  /**
   * Get all group sessions with filters
   */
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

      // const [sessions, total] = await Promise.all([
      //   GroupSession.find(query)
      //     .sort({ scheduledAt: 1 })
      //     .skip(skip)
      //     .limit(limit)
      //     .lean(),
      //   GroupSession.countDocuments(query),
      // ]);

      // ✅ REPLACE WITH
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

  /**
   * Get upcoming group sessions
   */
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

      // const sessions = await GroupSession.find(query)
      //   .sort({ scheduledAt: 1 })
      //   .limit(limit)
      //   .lean();

      // ✅ REPLACE WITH
      return await groupRepository.findUpcoming(query, limit);

      // return sessions;
    } catch (error: any) {
      logger.error(`Failed to fetch upcoming group sessions:${error}`);
      throw error;
    }
  }

  /**
   * Join a group session
   */
  async joinGroupSession(
    sessionId: string,
    menteeId: string,
    transactionId?: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      // Verify mentee exists
      await User.findByUserId(menteeId);

      // Check if session is open
      if (session.status !== 'open') {
        throw new BadRequestError(
          'Session is not open for registration'
        );
      }

      // Check if already registered
      const isRegistered = session.participants.some(
        (p: any) => p.menteeId === menteeId
      );

      if (isRegistered) {
        throw new BadRequestError(
          'Already registered for this session'
        );
      }

      // Add participant
      await session.addParticipant(menteeId, transactionId);

      logger.info(`User ${menteeId} joined group session: ${sessionId}`);

      // TODO: Send confirmation notification

      return session;
    } catch (error: any) {
      logger.error(`Failed to join group session:${error}`);
      throw error;
    }
  }

  /**
   * Leave a group session
   */
  async leaveGroupSession(
    sessionId: string,
    menteeId: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      // Check if registered
      const participant = session.participants.find(
        (p: any) => p.menteeId === menteeId
      );

      if (!participant) {
        throw new BadRequestError(
          'Not registered for this session'
        );
      }

      // Check cancellation policy (24 hours before)
      const hoursDiff = (session.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);

      if (hoursDiff < 24) {
        throw new BadRequestError(
          'Cannot leave within 24 hours of session'
        );
      }

      // Remove participant
      await session.removeParticipant(menteeId);

      logger.info(`User ${menteeId} left group session: ${sessionId}`);

      // TODO: Process refund

      return session;
    } catch (error: any) {
      logger.error(`Failed to leave group session:$ {error}`);
      throw error;
    }
  }

  // NOTE: updateGroupSession is implemented below with full file upload + partial update support.

  /**
   * Start group session (mentor only)
   */
  async startGroupSession(
    sessionId: string,
    mentorId: string,
    authToken?: string
  ): Promise<any> {
    try {
      const mentor = await mentorRepository.findByUserId(mentorId); // mentorId param actually userId hai
      if (!mentor) throw new ForbiddenError('Mentor profile not found');

      const session = await this.getGroupSessionById(sessionId, authToken);

      if (session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError(
          'Only the mentor can start this session',

        );
      }

      if (session.currentParticipants < session.minParticipants) {
        throw new BadRequestError(
          `Minimum ${session.minParticipants} participants required`,
        );
      }

      await session.startSession();

      logger.info(`Group session started: ${sessionId}`);

      return session;
    } catch (error: any) {
      logger.error(`Failed to start group session:${error}`);
      throw error;
    }
  }

  /**
   * Complete group session (mentor only)
   */
  async completeGroupSession(
    sessionId: string,
    mentorId: string,
    actualDuration?: number,
    attendees?: string[],
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      const mentor = await mentorRepository.findByUserId(mentorId); // mentorId param actually userId hai
      if (!mentor) throw new ForbiddenError('Mentor profile not found');

      if (session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError(
          'Only the mentor can complete this session'
        );
      }

      // Mark attendance
      if (attendees && attendees.length > 0) {
        session.participants.forEach((p: any) => {
          p.attendanceStatus = attendees.includes(p.menteeId) ? 'attended' : 'absent';
        });
      }

      await session.completeSession(actualDuration);

      TrustScoreEvents.emit('GroupSessionCompleted', {
        mentorId: session.mentorId,
        sessionId,
        timestamp: new Date()
      });

      logger.info(`Group session completed: ${sessionId}`);

      // TODO: Send feedback request to attendees

      return session;
    } catch (error: any) {
      logger.error(`Failed to complete group session:${error}`);
      throw error;
    }
  }

  /**
   * Cancel group session (mentor only)
   */
  async cancelGroupSession(
    sessionId: string,
    mentorId: string,
    reason: string,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      const mentor = await mentorRepository.findByUserId(mentorId); // mentorId param actually userId hai
      if (!mentor) throw new ForbiddenError('Mentor profile not found');

      if (session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError(
          'Only the mentor can cancel this session'
        );
      }

      await session.cancelSession(reason);

      TrustScoreEvents.emit('GroupSessionCancelled', {
        mentorId: session.mentorId,
        sessionId,
        timestamp: new Date()
      });

      logger.info(`Group session cancelled: ${sessionId}`);

      // TODO: Process refunds for all participants
      // TODO: Send cancellation notifications

      return session;
    } catch (error: any) {
      logger.error(`Failed to cancel group session:${error}`);
      throw error;
    }
  }

  /**
   * Update an existing group session
   */
  async updateGroupSession(
    sessionId: string,
    userId: string,
    updates: Partial<CreateGroupSessionInput>,
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

      if (file) {
        session.thumbnailImage = await this.uploadImageToCloudinary(file.buffer, sessionId);
      }

      if (updates.title) session.title = updates.title;
      if (updates.description) session.description = updates.description;
      if (updates.topic) session.topic = updates.topic;
      if (updates.category) session.category = updates.category;
      if (updates.scheduledAt) session.scheduledAt = new Date(updates.scheduledAt);
      if (updates.duration) session.duration = updates.duration;
      if (updates.timezone) session.timezone = updates.timezone;
      if (updates.maxParticipants) session.maxParticipants = updates.maxParticipants;
      if (updates.minParticipants) session.minParticipants = updates.minParticipants;
      if (updates.pricePerPerson !== undefined && session.pricing) {
        session.pricing.pricePerPerson = updates.pricePerPerson;
      }
      if (updates.agenda) session.agenda = updates.agenda;
      if (updates.outcomes) session.outcomes = updates.outcomes;

      await session.save();
      logger.info(`Group session updated successfully: ${session.sessionId}`);
      return session;
    } catch (error: any) {
      logger.error(`Failed to update group session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add feedback to group session
   */
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
        throw new BadRequestError(
          'Can only provide feedback for completed sessions'
        );
      }

      // Check if user attended
      const participant = session.participants.find(
        (p: any) => p.menteeId === menteeId && p.attendanceStatus === 'attended'
      );

      if (!participant) {
        throw new ForbiddenError(
          'Only attendees can provide feedback'
        );
      }

      await session.addFeedback(menteeId, rating, comment);

      logger.info(`Feedback added for group session: ${sessionId}`);

      return session;
    } catch (error: any) {
      logger.error(`Failed to add feedback:${error}`);
      throw error;
    }
  }

  /**
   * Get my group sessions
   */
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
      return await groupRepository.findByUserId(userId, role);
    } catch (error: any) {
      logger.error(`Failed to fetch my group sessions: ${error}`);
      throw error;
    }
  }
}

const groupService = new GroupService();
export default groupService;