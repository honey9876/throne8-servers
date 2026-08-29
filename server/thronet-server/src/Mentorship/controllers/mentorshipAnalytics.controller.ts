//mentorship/analytics.controller.ts

import logger from '@/config/logging/logger.config';
import { mentorshipanalyticsService } from '../services';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import { Request, Response } from 'express';
import { Mentor } from '../models';


class AnalyticsController {
  /**
   * Check if user is admin or the mentor
   */
  private async canAccessMentorAnalytics(req: Request, mentorId: string): Promise<boolean> {
    const userId = req.user?.id;
    if (req.user?.role === 'admin') return true;
    
    // Log for debugging
    console.log({
      authUserId: req.user?.id,
      requestedMentorId: req.params.mentorId || mentorId,
    });

    const mentor = await Mentor.findOne({
      userId: req.user?.id,
      isDeleted: false,
    });

    console.log({
      mentorFound: !!mentor,
      mentorProfileId: mentor?.mentorId,
    });

    return mentor?.mentorId === mentorId;
  }

  /**
   * Check if user is admin
   */
  private isAdmin(req: Request): boolean {
    return req.user?.role === 'admin';
  }

  /**
   * Get mentor statistics
   * GET /api/v1/analytics/mentor/:mentorId/stats
   */
  async getMentorStats(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId } = req.params;
      const { startDate, endDate } = req.query;

      if (!(await this.canAccessMentorAnalytics(req, mentorId))) {
        ResponseHandler.forbidden(res, 'Access denied');
        return;
      }

      logger.info(`📊 Fetching stats for mentor: ${mentorId}`);

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const stats = await mentorshipanalyticsService.getMentorStats(mentorId, start, end);

      ResponseHandler.success(res, 'Mentor statistics retrieved successfully', stats);
    } catch (error: any) {
      logger.error('❌ Failed to fetch mentor stats:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to fetch statistics', 500);
      }
    }
  }

  /**
   * Get mentor earnings breakdown
   * GET /api/v1/analytics/mentor/:mentorId/earnings
   */
  async getMentorEarnings(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId } = req.params;
      const { startDate, endDate } = req.query;

      if (!(await this.canAccessMentorAnalytics(req, mentorId))) {
        ResponseHandler.forbidden(res, 'Access denied');
        return;
      }

      logger.info(`💰 Fetching earnings for mentor: ${mentorId}`);

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const stats = await mentorshipanalyticsService.getMentorStats(mentorId, start, end);

      ResponseHandler.success(res, 'Earnings retrieved successfully', {
        earnings: stats.earnings,
        Sessions: stats.Sessions,
        period: stats.period,
      });
    } catch (error: any) {
      logger.error('❌ Failed to fetch earnings:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to fetch earnings', 500);
      }
    }
  }

  /**
   * Get mentor session analytics
   * GET /api/v1/analytics/mentor/:mentorId/sessions
   */
  async getMentorSessions(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId } = req.params;
      const { startDate, endDate } = req.query;

      if (!(await this.canAccessMentorAnalytics(req, mentorId))) {
        ResponseHandler.forbidden(res, 'Access denied');
        return;
      }

      logger.info(`📋 Fetching session analytics for mentor: ${mentorId}`);

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const stats = await mentorshipanalyticsService.getMentorStats(mentorId, start, end);

      ResponseHandler.success(res, 'session analytics retrieved successfully', {
        Sessions: stats.Sessions,
        period: stats.period,
      });
    } catch (error: any) {
      logger.error('❌ Failed to fetch session analytics:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to fetch analytics', 500);
      }
    }
  }

  /**
   * Get mentor review analytics
   * GET /api/v1/analytics/mentor/:mentorId/reviews
   */
  async getMentorReviews(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId } = req.params;

      if (!(await this.canAccessMentorAnalytics(req, mentorId))) {
        ResponseHandler.forbidden(res, 'Access denied');
        return;
      }

      logger.info(`⭐ Fetching review analytics for mentor: ${mentorId}`);

      const stats = await mentorshipanalyticsService.getMentorStats(mentorId);

      ResponseHandler.success(res, 'Review analytics retrieved successfully', {
        reviews: stats.reviews,
      });
    } catch (error: any) {
      logger.error('❌ Failed to fetch review analytics:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to fetch analytics', 500);
      }
    }
  }

  /**
   * Get platform statistics (Admin only)
   * GET /api/v1/analytics/platform/stats
   */
  async getPlatformStats(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { startDate, endDate } = req.query;

      logger.info('📊 Fetching platform statistics');

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const stats = await mentorshipanalyticsService.getPlatformStats(start, end);

      ResponseHandler.success(res, 'Platform statistics retrieved successfully', stats);
    } catch (error: any) {
      logger.error('❌ Failed to fetch platform stats:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to fetch statistics', 500);
      }
    }
  }

  /**
   * Get revenue report (Admin only)
   * GET /api/v1/analytics/platform/revenue
   */
  async getRevenueReport(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { startDate, endDate, groupBy = 'day' } = req.query;

      logger.info('💰 Generating revenue report');

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const report = await mentorshipanalyticsService.getRevenueReport(
        start,
        end,
        groupBy as 'day' | 'week' | 'month'
      );

      ResponseHandler.success(res, 'Revenue report generated successfully', report);
    } catch (error: any) {
      logger.error('❌ Failed to generate revenue report:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to generate report', 500);
      }
    }
  }

  /**
   * Get session report (Admin only)
   * GET /api/v1/analytics/platform/sessions
   */
  async getSessionReport(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { startDate, endDate, groupBy = 'day' } = req.query;

      logger.info('📋 Generating session report');

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const report = await mentorshipanalyticsService.getSessionReport(
        start,
        end,
        groupBy as 'day' | 'week' | 'month' | 'type'
      );

      ResponseHandler.success(res, 'session report generated successfully', report);
    } catch (error: any) {
      logger.error('❌ Failed to generate session report:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to generate report', 500);
      }
    }
  }

  /**
   * Get mentor analytics (Admin only)
   * GET /api/v1/analytics/platform/mentors
   */
  async getMentorAnalytics(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      logger.info('👨‍💼 Fetching mentor analytics');

      const stats = await mentorshipanalyticsService.getPlatformStats();

      ResponseHandler.success(res, 'Mentor analytics retrieved successfully', {
        mentors: stats.mentors,
      });
    } catch (error: any) {
      logger.error('❌ Failed to fetch mentor analytics:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to fetch analytics', 500);
      }
    }
  }

  /**
   * Get growth metrics (Admin only)
   * GET /api/v1/analytics/platform/growth
   */
  async getGrowthMetrics(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { startDate, endDate } = req.query;

      logger.info('📈 Fetching growth metrics');

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const stats = await mentorshipanalyticsService.getPlatformStats(start, end);

      ResponseHandler.success(res, 'Growth metrics retrieved successfully', stats);
    } catch (error: any) {
      logger.error('❌ Failed to fetch growth metrics:', error);
      if (!res.headersSent) {
        ResponseHandler.error(res, error.message || 'Failed to fetch metrics', 500);
      }
    }
  }
}

export default new AnalyticsController();