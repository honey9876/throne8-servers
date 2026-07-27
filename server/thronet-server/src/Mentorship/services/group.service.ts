import { logger } from "@/shared/logger.util";
import { NotFoundError, BadRequestError, ForbiddenError } from "@/shared/errors/app.error";
import { User } from "@/auth/models";
import { GroupSession } from "../models";
import { generateSecureId } from "@/shared/security";
import groupRepository from "../repositories/group.repository";
import mentorRepository from "../repositories/mentor.repository";



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
}

class GroupService {
  /**
   * Create a new group session
   */
  async createGroupSession(
    input: CreateGroupSessionInput,
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

      // Create group session
      const session = new GroupSession({
        sessionId: generateSecureId(),
        mentorId: mentor.mentorId,
        title: input.title,
        description: input.description,
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

  /**
   * Update group session (mentor only)
   */
  async updateGroupSession(
    sessionId: string,
    mentorId: string,
    updates: any,
    authToken?: string
  ): Promise<any> {
    try {
      const session = await this.getGroupSessionById(sessionId, authToken);

      const mentor = await mentorRepository.findByUserId(mentorId); // mentorId param actually userId hai
      if (!mentor) throw new ForbiddenError('Mentor profile not found');

      if (session.mentorId !== mentor.mentorId) {
        throw new ForbiddenError(
          'Only the mentor can update this session',

        );
      }

      // Allow only certain fields to be updated
      const allowedUpdates = [
        'title',
        'description',
        'agenda',
        'outcomes',
        'resources',
      ];

      Object.keys(updates).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          (session as any)[key] = updates[key];
        }
      });

      // await session.save();

      logger.info(`Group session updated: ${sessionId}`);

      return await groupRepository.updateBySessionId(sessionId, updates);


      // return session;
    } catch (error: any) {
      logger.error(`Failed to update group session:${error}`);
      throw error;
    }
  }

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

      logger.info(`Group session cancelled: ${sessionId}`);

      // TODO: Process refunds for all participants
      // TODO: Send cancellation notifications

      return session;
    } catch (error: any) {
      logger.error(`Failed to cancel group session: ${error}`);
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
      let sessions;

      // if (role === 'mentor') {
      //   sessions = await GroupSession.find({ mentorId: userId })
      //     .sort({ scheduledAt: -1 })
      //     .lean();
      // } else {
      //   sessions = await GroupSession.find({
      //     'participants.menteeId': userId,
      //   })
      //     .sort({ scheduledAt: -1 })
      //     .lean();
      // }

      return await groupRepository.findByUserId(userId, role);

      // return sessions;
    } catch (error: any) {
      logger.error(`Failed to fetch my group sessions: ${error}`);
      throw error;
    }
  }
}

const groupService = new GroupService();
export default groupService;