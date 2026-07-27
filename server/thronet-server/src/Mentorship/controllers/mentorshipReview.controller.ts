import { mentorshipReviewService } from '../services';
import { logger } from '@/shared/logger.util';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import { Request, Response } from 'express';

class MentorshipReviewController {
  /**
   * Submit a new review
   * POST /api/v1/reviews
   */
  async submitReview(req: Request, res: Response): Promise<void> {
    try {
      const userId =req.user?.id
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { sessionId, mentorId, rating, comment, tags } = req.body;

      logger.info(`📝 User ${userId} submitting review for session ${sessionId}`);

      const review = await mentorshipReviewService.submitReview({
        sessionId,
        mentorId,
        menteeId: userId,
        rating,
        comment,
        tags,
      });

      ResponseHandler.created(res, 'Review submitted successfully', review);
    } catch (error: any) {
      logger.error('❌ Failed to submit review:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to submit review', 400);
      }
    }
  }

  /**
   * Get reviews for a mentor
   * GET /api/v1/reviews/mentor/:mentorId
   */
  async getMentorReviews(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      logger.info(`📋 Fetching reviews for mentor: ${mentorId}`);

      const result = await mentorshipReviewService.getMentorReviews(
        mentorId,
        Number(page),
        Number(limit)
      );

      ResponseHandler.paginated(
        res,
        'Reviews retrieved successfully',
        result.reviews,
        Number(page),
        Number(limit),
        result.total
      );
    } catch (error: any) {
      logger.error('❌ Failed to fetch reviews:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to fetch reviews', 500);
      }
    }
  }

  /**
   * Get review by ID
   * GET /api/v1/reviews/:id
   */
  async getReviewById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      logger.info(`🔍 Fetching review: ${id}`);

      const review = await mentorshipReviewService.getReviewById(id);

      ResponseHandler.success(res, 'Review retrieved successfully', review);
    } catch (error: any) {
      logger.error('❌ Failed to fetch review:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to fetch review', 404);
      }
    }
  }

  /**
   * Update review
   * PUT /api/v1/reviews/:id
   */
  async updateReview(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId =req.user?.id
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { rating, comment, tags } = req.body;

      logger.info(`✏️ User ${userId} updating review: ${id}`);

      const review = await mentorshipReviewService.updateReview(id, userId, {
        rating,
        comment,
        tags,
      });

      ResponseHandler.success(res, 'Review updated successfully', review);
    } catch (error: any) {
      logger.error('❌ Failed to update review:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to update review', 400);
      }
    }
  }

  /**
   * Delete review
   * DELETE /api/v1/reviews/:id
   */
  async deleteReview(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId =req.user?.id
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      logger.info(`🗑️  User ${userId} deleting review: ${id}`);

      await mentorshipReviewService.deleteReview(id, userId);

      ResponseHandler.success(res, 'Review deleted successfully');
    } catch (error: any) {
      logger.error('❌ Failed to delete review:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to delete review', 400);
      }
    }
  }

  /**
   * Add mentor response to review
   * POST /api/v1/reviews/:id/response
   */
  async addMentorResponse(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId =req.user?.id
      if (!userId) {
        ResponseHandler.unauthorized(res);
        return;
      }

      const { response } = req.body;

      if (!response) {
        ResponseHandler.badRequest(res, 'Response text is required');
        return;
      }

      logger.info(`💬 Mentor ${userId} responding to review: ${id}`);

      const review = await mentorshipReviewService.addMentorResponse(id, userId, response);

      ResponseHandler.success(res, 'Response added successfully', review);
    } catch (error: any) {
      logger.error('❌ Failed to add response:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to add response', 400);
      }
    }
  }

  /**
   * Mark review as helpful
   * POST /api/v1/reviews/:id/helpful
   */
  async markHelpful(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      logger.info(`👍 Marking review as helpful: ${id}`);

      const review = await mentorshipReviewService.markHelpful(id);

      ResponseHandler.success(res, 'Review marked as helpful', review);
    } catch (error: any) {
      logger.error('❌ Failed to mark review as helpful:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to mark as helpful', 400);
      }
    }
  }

  /**
   * Report a review
   * POST /api/v1/reviews/:id/report
   */
  async reportReview(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        ResponseHandler.badRequest(res, 'Report reason is required');
        return;
      }

      logger.info(`🚩 Reporting review: ${id}`);

      await mentorshipReviewService.reportReview(id, reason);

      ResponseHandler.success(res, 'Review reported successfully');
    } catch (error: any) {
      logger.error('❌ Failed to report review:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to report review', 400);
      }
    }
  }

  /**
   * Get top reviews for mentor
   * GET /api/v1/reviews/mentor/:mentorId/top
   */
  async getTopReviews(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId } = req.params;
      const { limit = 5 } = req.query;

      logger.info(`⭐ Fetching top reviews for mentor: ${mentorId}`);

      const reviews = await mentorshipReviewService.getTopReviews(mentorId, Number(limit));

      ResponseHandler.success(res, 'Top reviews retrieved successfully', reviews);
    } catch (error: any) {
      logger.error('❌ Failed to fetch top reviews:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to fetch top reviews', 500);
      }
    }
  }

  /**
   * Get review statistics for mentor
   * GET /api/v1/reviews/mentor/:mentorId/stats
   */
  async getReviewStats(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId } = req.params;

      logger.info(`📊 Fetching review stats for mentor: ${mentorId}`);

      const stats = await mentorshipReviewService.getReviewStats(mentorId);

      ResponseHandler.success(res, 'Review statistics retrieved successfully', stats);
    } catch (error: any) {
      logger.error('❌ Failed to fetch review stats:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to fetch stats', 500);
      }
    }
  }

  /**
   * Moderate review (Admin only)
   * POST /api/v1/reviews/:id/moderate
   */
  async moderateReview(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { action, reason } = req.body;

      if (!['approve', 'hide', 'delete'].includes(action)) {
        ResponseHandler.badRequest(res, 'Invalid moderation action');
        return;
      }

      logger.info(`👮 Moderating review: ${id} - Action: ${action}`);

      const review = await mentorshipReviewService.moderateReview(id, action, reason);

      ResponseHandler.success(res, 'Review moderated successfully', review);
    } catch (error: any) {
      logger.error('❌ Failed to moderate review:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to moderate review', 400);
      }
    }
  }
}

export default new MentorshipReviewController();