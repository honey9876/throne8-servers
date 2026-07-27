import { Request, Response, NextFunction } from 'express';
import { SessionMentor } from '../models';
import MentorshipReview from '../models/MentorshipReview';
import { mentorshipanalyticsService, mentorshipReviewService } from '../services';
import { logger } from '@/shared/logger.util';
import PaginationHelper from '@/Mentorship/utils/pagination';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import mentorRepository from '../repositories/mentor.repository';
import sessionRepository from '../repositories/session.repository';
import reviewRepository from '../repositories/review.repository';

class AdminController {
  private isAdmin(req: Request): boolean {
    return req.user?.role === 'admin';
  }

  /**
   * @route   GET /api/v1/mentorship/admin/mentors
   * @access  Private (Admin)
   */
  async getAllMentors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20, status, search } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query: any = { isDeleted: false };
      if (status) query.status = status;
      if (search) query.$text = { $search: search as string };

      const [mentors, total] = await Promise.all([
        mentorRepository.findAll(
          query,
          { createdAt: -1 },
          PaginationHelper.getSkip(validPage, validLimit),
          validLimit
        ),
        mentorRepository.count(query),
      ]);

      ResponseHandler.paginated(res, 'Mentors retrieved successfully', mentors, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch mentors:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/sessions
   * @access  Private (Admin)
   */
  async getAllSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20, status, sessionType } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query: any = {};
      if (status) query.status = status;
      if (sessionType) query.sessionType = sessionType;

      const { data: sessions, total } = await sessionRepository.findAll(
        query,
        PaginationHelper.getSkip(validPage, validLimit),
        validLimit
      );

      ResponseHandler.paginated(res, 'Sessions retrieved successfully', sessions, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch sessions:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/reviews
   * @access  Private (Admin)
   */
  async getAllReviews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20, reported, rating } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query: any = { isDeleted: false };
      if (reported === 'true') query.reportCount = { $gt: 0 };
      if (rating) query.rating = Number(rating);

      const [reviews, total] = await Promise.all([
        MentorshipReview.find(query)
          .sort({ createdAt: -1 })
          .skip(PaginationHelper.getSkip(validPage, validLimit))
          .limit(validLimit)
          .lean(),
        MentorshipReview.countDocuments(query),
      ]);

      ResponseHandler.paginated(res, 'Reviews retrieved successfully', reviews, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch reviews:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/admin/reviews/:id/moderate
   * @access  Private (Admin)
   */
  async moderateReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { id } = req.params;
      const { action, reason } = req.body;

      const review = await mentorshipReviewService.moderateReview(id, action, reason);
      ResponseHandler.success(res, 'Review moderated successfully', review);
    } catch (error: any) {
      logger.error('Failed to moderate review:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/admin/mentors/:id/status
   * @access  Private (Admin)
   */
  async updateMentorStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { id } = req.params;
      const { status } = req.body;

      const mentor = await mentorRepository.updateByMentorId(id, { status });
      if (!mentor) {
        ResponseHandler.notFound(res, 'Mentor not found');
        return;
      }

      ResponseHandler.success(res, 'Mentor status updated successfully', mentor);
    } catch (error: any) {
      logger.error('Failed to update mentor status:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/dashboard
   * @access  Private (Admin)
   */
  async getDashboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const stats = await mentorshipanalyticsService.getPlatformStats();
      ResponseHandler.success(res, 'Dashboard statistics retrieved successfully', stats);
    } catch (error: any) {
      logger.error('Failed to fetch dashboard stats:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/reviews/reported
   * @access  Private (Admin)
   */
  async getReportedReviews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20 } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query = { reportCount: { $gt: 0 }, isDeleted: false };

      const [reviews, total] = await Promise.all([
        MentorshipReview.find(query)
          .sort({ reportCount: -1, createdAt: -1 })
          .skip(PaginationHelper.getSkip(validPage, validLimit))
          .limit(validLimit)
          .lean(),
        MentorshipReview.countDocuments(query),
      ]);

      ResponseHandler.paginated(res, 'Reported reviews retrieved successfully', reviews, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch reported reviews:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/mentors/pending
   * @access  Private (Admin)
   */
  async getPendingMentors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20 } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query = { status: 'pending_approval', isDeleted: false };

      const [mentors, total] = await Promise.all([
        mentorRepository.findAll(
          query,
          { createdAt: -1 },
          PaginationHelper.getSkip(validPage, validLimit),
          validLimit
        ),
        mentorRepository.count(query),
      ]);

      ResponseHandler.paginated(res, 'Pending mentors retrieved successfully', mentors, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch pending mentors:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/payments
   * @access  Private (Admin)
   */
  async getPaymentLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20, status } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query: any = {};
      if (status) query['payment.status'] = status;

      const [sessions, total] = await Promise.all([
        SessionMentor.find(query)
          .select('mentorId menteeId sessionType pricing payment scheduledAt')
          .sort({ 'payment.paidAt': -1 })
          .skip(PaginationHelper.getSkip(validPage, validLimit))
          .limit(validLimit)
          .lean(),
        SessionMentor.countDocuments(query),
      ]);

      ResponseHandler.paginated(res, 'Payment logs retrieved successfully', sessions, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch payment logs:', error);
      next(error);
    }
  }
}

export default new AdminController();