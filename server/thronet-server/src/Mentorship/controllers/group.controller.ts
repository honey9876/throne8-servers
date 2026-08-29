import { Request, Response, NextFunction } from 'express';
import { getAuthToken } from '@/shared/middlewares/auth.middleware';
import { groupService } from '../services';
import { logger } from '@/shared/logger.util';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';

class GroupController {
  /**
   * @route   POST /api/v1/mentorship/group-sessions
   * @access  Private (Mentor)
   */
  async createGroupSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const file = req.file as Express.Multer.File | undefined;
      const session = await groupService.createGroupSession(
        { ...req.body, mentorId: userId },
        file,
        authToken
      );

      ResponseHandler.created(res, 'Group session created successfully', session);
    } catch (error: any) {
      logger.error('Failed to create group session:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/group-sessions/:id
   * @access  Public
   */
  async getGroupSessionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const authToken = getAuthToken(req) || undefined;
      const session = await groupService.getGroupSessionById(id, authToken);

      ResponseHandler.success(res, 'Group session retrieved successfully', session);
    } catch (error: any) {
      logger.error('Failed to fetch group session:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/group-sessions
   * @access  Public
   */
  async getAllGroupSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 10, status, topic, mentorId } = req.query;
      const authToken = getAuthToken(req) || undefined;

      const result = await groupService.getAllGroupSessions(
        Number(page),
        Number(limit),
        {
          status: status as string | undefined,
          topic: topic as string | undefined,
          mentorId: mentorId as string | undefined,
        },
        authToken
      );

      ResponseHandler.paginated(
        res,
        'Group sessions retrieved successfully',
        result.sessions,
        result.page,
        result.limit,
        result.total
      );
    } catch (error: any) {
      logger.error('Failed to fetch group sessions:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/group-sessions/upcoming
   * @access  Public
   */
  async getUpcomingGroupSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mentorId, limit = 10 } = req.query;
      const authToken = getAuthToken(req) || undefined;

      const sessions = await groupService.getUpcomingGroupSessions(
        mentorId as string | undefined,
        Number(limit),
        authToken
      );

      ResponseHandler.success(res, 'Upcoming group sessions retrieved successfully', sessions);
    } catch (error: any) {
      logger.error('Failed to fetch upcoming group sessions:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/group-sessions/:id/join
   * @access  Private (Mentee)
   */
  async joinGroupSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const { transactionId } = req.body;

      const session = await groupService.joinGroupSession(id, userId, transactionId, authToken);
      ResponseHandler.success(res, 'Successfully joined group session', session);
    } catch (error: any) {
      logger.error('Failed to join group session:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/group-sessions/:id/leave
   * @access  Private
   */
  async leaveGroupSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const session = await groupService.leaveGroupSession(id, userId, authToken);
      ResponseHandler.success(res, 'Successfully left group session', session);
    } catch (error: any) {
      logger.error('Failed to leave group session:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/group-sessions/:id/start
   * @access  Private (Mentor)
   */
  async startGroupSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const session = await groupService.startGroupSession(id, userId, authToken);
      ResponseHandler.success(res, 'Group session started successfully', session);
    } catch (error: any) {
      logger.error('Failed to start group session:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/group-sessions/:id/complete
   * @access  Private (Mentor)
   */
  async completeGroupSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { actualDuration, attendees } = req.body;
      const authToken = getAuthToken(req) || undefined;
      const session = await groupService.completeGroupSession(
        id,
        userId,
        actualDuration,
        attendees,
        authToken
      );
      ResponseHandler.success(res, 'Group session completed successfully', session);
    } catch (error: any) {
      logger.error('Failed to complete group session:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/group-sessions/:id/cancel
   * @access  Private (Mentor)
   */
  async cancelGroupSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { reason } = req.body;
      if (!reason) {
        ResponseHandler.badRequest(res, 'Cancellation reason is required');
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const session = await groupService.cancelGroupSession(id, userId, reason, authToken);
      ResponseHandler.success(res, 'Group session cancelled successfully', session);
    } catch (error: any) {
      logger.error('Failed to cancel group session:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/group-sessions/:id/feedback
   * @access  Private
   */
  async addFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { rating, comment } = req.body;
      if (!rating) {
        ResponseHandler.badRequest(res, 'Rating is required');
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const session = await groupService.addFeedback(id, userId, rating, comment, authToken);
      ResponseHandler.success(res, 'Feedback submitted successfully', session);
    } catch (error: any) {
      logger.error('Failed to add feedback:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/group-sessions/my-sessions
   * @access  Private
   */
  async getMyGroupSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id ?? req.user?.userId;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { role = 'mentee' } = req.query;
      const authToken = getAuthToken(req) || undefined;

      const sessions = await groupService.getMyGroupSessions(
        userId,
        role as 'mentor' | 'mentee',
        authToken
      );
      ResponseHandler.success(res, 'My group sessions retrieved successfully', sessions);
    } catch (error: any) {
      logger.error('Failed to fetch my group sessions:', error);
      next(error);
    }
  }

  /**
   * @route   PUT /api/v1/mentorship/group-sessions/:id
   * @access  Private (Mentor)
   */
  async updateGroupSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const file = req.file as Express.Multer.File | undefined;
      const session = await groupService.updateGroupSession(
        id,
        userId,
        req.body,
        file,
        authToken
      );

      ResponseHandler.success(res, 'Group session updated successfully', session);
    } catch (error: any) {
      logger.error('Failed to update group session:', error);
      next(error);
    }
  }
}

export default new GroupController();