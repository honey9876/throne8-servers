import { queryService } from '../services';
import { logger } from '@/shared/logger.util';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import { Request, Response } from 'express';
import { getAuthToken } from '@/shared/middlewares/auth.middleware';


class QueryController {
  /**
   * Submit a new query
   * POST /api/v1/queries
   */
  async submitQuery(req: Request, res: Response): Promise<void> {
    try {
      const userId =req.user?.id
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      logger.info(`Submitting query for user: ${userId}`);

      const queryData = {
        ...req.body,
        menteeId: userId,
      };

      const query = await queryService.submitQuery(queryData, authToken);

      ResponseHandler.created(res, 'Query submitted successfully', query);
    } catch (error: any) {
      logger.error('Failed to submit query:', error);
      ResponseHandler.error(res, error.message || 'Failed to submit query', 500);
    }
  }

  /**
   * Get query by ID
   * GET /api/v1/queries/:id
   */
  async getQueryById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id || undefined;
      const authToken = getAuthToken(req) || undefined;

      logger.info(`Fetching query: ${id}`);

      const query = await queryService.getQueryById(id, userId, authToken);

      ResponseHandler.success(res, 'Query retrieved successfully', query);
    } catch (error: any) {
      logger.error('Failed to fetch query:', error);
      ResponseHandler.error(res, error.message || 'Failed to fetch query', 500);
    }
  }

  /**
   * Get all queries for current user
   * GET /api/v1/queries
   */
  async getAllQueries(req: Request, res: Response): Promise<void> {
    try {
      const userId =req.user?.id
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const { page = 1, limit = 10, status, role = 'mentee' } = req.query;

      logger.info(`Fetching queries for user: ${userId}`);

      const queries = await queryService.getAllQueries(
        userId,
        role as 'mentor' | 'mentee',
        Number(page),
        Number(limit),
        status as string | undefined,
        authToken
      );

      ResponseHandler.paginated(
        res,
        'Queries retrieved successfully',
        queries.queries,
        queries.page,
        queries.limit,
        queries.total
      );
    } catch (error: any) {
      logger.error('Failed to fetch queries:', error);
      ResponseHandler.error(res, error.message || 'Failed to fetch queries', 500);
    }
  }

  /**
   * Get pending queries (for mentors)
   * GET /api/v1/queries/pending
   */
  async getPendingQueries(req: Request, res: Response): Promise<void> {
    try {
      const userId =req.user?.id
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      logger.info(`Fetching pending queries for mentor: ${userId}`);

      const queries = await queryService.getPendingQueries(userId, authToken);

      ResponseHandler.success(res, 'Pending queries retrieved successfully', queries);
    } catch (error: any) {
      logger.error('Failed to fetch pending queries:', error);
      ResponseHandler.error(res, error.message || 'Failed to fetch pending queries', 500);
    }
  }

  /**
   * Answer a query (mentor only)
   * POST /api/v1/queries/:id/answer
   * 🔴 FIXED: Single error handling
   */
  async answerQuery(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId =req.user?.id
      
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const { answer } = req.body;

      if (!answer) {
        ResponseHandler.badRequest(res, 'Answer is required');
        return;
      }

      logger.info(`User ${userId} answering query: ${id}`);

      const query = await queryService.answerQuery(id, userId, answer, authToken);

      ResponseHandler.success(res, 'Query answered successfully', query);
    } catch (error: any) {
      logger.error('Answer query error:', error);
      
      // Handle specific error types
      if (error.code === 'UNAUTHORIZED_ANSWER') {
        ResponseHandler.forbidden(res, error.message);
      } else if (error.code === 'INVALID_STATUS') {
        ResponseHandler.badRequest(res, error.message);
      } else if (error.code === 'QUERY_NOT_FOUND') {
        ResponseHandler.notFound(res, error.message);
      } else {
        ResponseHandler.error(res, error.message || 'Failed to answer query', 500);
      }
    }
  }

  /**
   * Submit follow-up question (mentee only)
   * POST /api/v1/queries/:id/follow-up
   */
  async submitFollowUp(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId =req.user?.id
      
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const { question } = req.body;

      if (!question) {
        ResponseHandler.badRequest(res, 'Follow-up question is required');
        return;
      }

      logger.info(`Submitting follow-up for query: ${id}`);

      const query = await queryService.submitFollowUp(id, userId, question, authToken);

      ResponseHandler.success(res, 'Follow-up question submitted successfully', query);
    } catch (error: any) {
      logger.error('Failed to submit follow-up:', error);
      
      if (error.code === 'UNAUTHORIZED_FOLLOWUP') {
        ResponseHandler.forbidden(res, error.message);
      } else if (error.code === 'INVALID_STATUS' || error.code === 'FOLLOWUP_EXISTS') {
        ResponseHandler.badRequest(res, error.message);
      } else if (error.code === 'QUERY_NOT_FOUND') {
        ResponseHandler.notFound(res, error.message);
      } else {
        ResponseHandler.error(res, error.message || 'Failed to submit follow-up', 500);
      }
    }
  }

  /**
   * Answer follow-up question (mentor only)
   * POST /api/v1/queries/:id/follow-up/answer
   */
  async answerFollowUp(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId =req.user?.id
      
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const { answer } = req.body;

      if (!answer) {
        ResponseHandler.badRequest(res, 'Answer is required');
        return;
      }

      logger.info(`Answering follow-up for query: ${id}`);

      const query = await queryService.answerFollowUp(id, userId, answer, authToken);

      ResponseHandler.success(res, 'Follow-up answered successfully', query);
    } catch (error: any) {
      logger.error('Failed to answer follow-up:', error);
      
      if (error.code === 'UNAUTHORIZED_ANSWER') {
        ResponseHandler.forbidden(res, error.message);
      } else if (error.code === 'NO_FOLLOWUP' || error.code === 'FOLLOWUP_ANSWERED') {
        ResponseHandler.badRequest(res, error.message);
      } else if (error.code === 'QUERY_NOT_FOUND') {
        ResponseHandler.notFound(res, error.message);
      } else {
        ResponseHandler.error(res, error.message || 'Failed to answer follow-up', 500);
      }
    }
  }

  /**
   * Add feedback to query
   * POST /api/v1/queries/:id/feedback
   */
  async addFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId =req.user?.id
      
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const authToken = getAuthToken(req) || undefined;
      const { rating, comment } = req.body;

      if (!rating) {
        ResponseHandler.badRequest(res, 'Rating is required');
        return;
      }

      logger.info(`Adding feedback for query: ${id}`);

      const query = await queryService.addFeedback(
        id,
        userId,
        rating,
        comment,
        authToken
      );

      ResponseHandler.success(res, 'Feedback submitted successfully', query);
    } catch (error: any) {
      logger.error('Failed to add feedback:', error);
      
      if (error.code === 'UNAUTHORIZED_FEEDBACK') {
        ResponseHandler.forbidden(res, error.message);
      } else if (error.code === 'INVALID_STATUS' || error.code === 'FEEDBACK_EXISTS') {
        ResponseHandler.badRequest(res, error.message);
      } else if (error.code === 'QUERY_NOT_FOUND') {
        ResponseHandler.notFound(res, error.message);
      } else {
        ResponseHandler.error(res, error.message || 'Failed to add feedback', 500);
      }
    }
  }

  /**
   * Get query statistics
   * GET /api/v1/queries/stats
   */
  async getQueryStats(req: Request, res: Response): Promise<void> {
    try {
      const userId =req.user?.id
      
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { role = 'mentee' } = req.query;
      const authToken = getAuthToken(req) || undefined;

      logger.info(`Fetching query stats for user: ${userId}`);

      const stats = await queryService.getQueryStats(
        userId,
        role as 'mentor' | 'mentee',
        authToken
      );

      ResponseHandler.success(res, 'Query statistics retrieved successfully', stats);
    } catch (error: any) {
      logger.error('Failed to fetch query stats:', error);
      ResponseHandler.error(res, error.message || 'Failed to fetch stats', 500);
    }
  }
}

export default new QueryController();