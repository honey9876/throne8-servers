import { Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import ResponseUtil from '@/shared/response.util';
import logger from '@/shared/logger.util';
import { CompanyAnalyticsService } from '../services';

class CompanyAnalyticsController {

  // POST /track — body me companyId UUID
  trackEvent = async (req: AuthRequest, res: Response) => {
    try {
      const { companyId, eventType, metadata } = req.body;
      await CompanyAnalyticsService.trackEvent(companyId, eventType, metadata);
      ResponseUtil.success(res, null, 'Event tracked successfully');
    } catch (error: any) {
      logger.error('Error in trackEvent:', error);
      ResponseUtil.error(res, error.message || 'Failed to track event');
    }
  };

  trackUserEvent = async (req: AuthRequest, res: Response) => {
    try {
      const { companyId, eventType, postId, searchQuery } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        ResponseUtil.unauthorized(res, 'Authentication required');
        return;
      }

      // Fire and forget - response wait nahi karega
      CompanyAnalyticsService.trackUserEvent(
        companyId,
        userId,
        eventType,
        { postId, searchQuery }
      );

      // Immediately respond - tracking ko wait mat karo
      ResponseUtil.success(res, null, 'Event tracked');
    } catch (error: any) {
      logger.error('Error in trackUserEvent:', error);
      ResponseUtil.error(res, 'Failed to track event');
    }
  };

  getDashboardV2 = async (req: AuthRequest, res: Response) => {
    try {
      const { companyId, days } = req.query;

      if (!companyId || typeof companyId !== 'string') {
        ResponseUtil.badRequest(res, 'Company ID is required');
        return;
      }

      const daysNum = days ? parseInt(days as string, 10) : 30;
      const data = await CompanyAnalyticsService.getAnalyticsDashboardV2(
        companyId,
        daysNum
      );

      ResponseUtil.success(res, data, 'Dashboard fetched successfully');
    } catch (error: any) {
      logger.error('Error in getDashboardV2:', error);
      ResponseUtil.error(res, error.message || 'Failed to fetch dashboard');
    }
  };

  // GET /dashboard?companyId=UUID
  getDashboard = async (req: AuthRequest, res: Response) => {
    try {
      const { companyId } = req.query;
      if (!companyId || typeof companyId !== 'string') {
        ResponseUtil.badRequest(res, 'Company ID is required');
        return;
      }
      const dashboard = await CompanyAnalyticsService.getDashboard(companyId);
      ResponseUtil.success(res, dashboard, 'Dashboard data fetched successfully');
    } catch (error: any) {
      logger.error('Error in getDashboard:', error);
      ResponseUtil.error(res, error.message || 'Failed to fetch dashboard');
    }
  };

  // GET /company/:id — ✅ resolvedObjectId use karo
  getCompanyAnalytics = async (req: AuthRequest, res: Response) => {
    try {
      const objectId = (req as any).resolvedObjectId;
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const analytics = await CompanyAnalyticsService.getCompanyAnalytics(objectId, start, end);
      ResponseUtil.success(res, analytics, 'Company analytics fetched successfully');
    } catch (error: any) {
      logger.error('Error in getCompanyAnalytics:', error);
      if (error.message === 'Company not found') {
        ResponseUtil.notFound(res, 'Company not found');
        return;
      }
      ResponseUtil.error(res, error.message || 'Failed to fetch analytics');
    }
  };

  // GET /company/:id/daily — ✅ resolvedObjectId use karo
  getDailyStats = async (req: AuthRequest, res: Response) => {
    try {
      const objectId = (req as any).resolvedObjectId;
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;

      const stats = await CompanyAnalyticsService.getDailyStats(objectId, days);
      ResponseUtil.success(res, stats, `Daily stats fetched successfully`);
    } catch (error: any) {
      logger.error('Error in getDailyStats:', error);
      ResponseUtil.error(res, error.message || 'Failed to fetch daily stats');
    }
  };

  // GET /company/:id/weekly — ✅ resolvedObjectId use karo
  getWeeklyStats = async (req: AuthRequest, res: Response) => {
    try {
      const objectId = (req as any).resolvedObjectId;
      const weeks = req.query.weeks ? parseInt(req.query.weeks as string, 10) : 12;

      const stats = await CompanyAnalyticsService.getWeeklyStats(objectId, weeks);
      ResponseUtil.success(res, stats, 'Weekly stats fetched successfully');
    } catch (error: any) {
      logger.error('Error in getWeeklyStats:', error);
      ResponseUtil.error(res, error.message || 'Failed to fetch weekly stats');
    }
  };

  // GET /company/:id/monthly — ✅ resolvedObjectId use karo
  getMonthlyStats = async (req: AuthRequest, res: Response) => {
    try {
      const objectId = (req as any).resolvedObjectId;
      const months = req.query.months ? parseInt(req.query.months as string, 10) : 12;

      const stats = await CompanyAnalyticsService.getMonthlyStats(objectId, months);
      ResponseUtil.success(res, stats, 'Monthly stats fetched successfully');
    } catch (error: any) {
      logger.error('Error in getMonthlyStats:', error);
      ResponseUtil.error(res, error.message || 'Failed to fetch monthly stats');
    }
  };

  // GET /company/:id/yearly — ✅ resolvedObjectId use karo
  getYearlyStats = async (req: AuthRequest, res: Response) => {
    try {
      const objectId = (req as any).resolvedObjectId;
      const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;

      const stats = await CompanyAnalyticsService.getYearlyStats(objectId, year);
      ResponseUtil.success(res, stats, 'Yearly stats fetched successfully');
    } catch (error: any) {
      logger.error('Error in getYearlyStats:', error);
      ResponseUtil.error(res, error.message || 'Failed to fetch yearly stats');
    }
  };

  // GET /posts/:id — ✅ resolvedObjectId use karo (post UUID)
  getPostAnalytics = async (req: AuthRequest, res: Response) => {
    try {
      const objectId = (req as any).resolvedObjectId;

      const analytics = await CompanyAnalyticsService.getPostAnalytics(objectId);
      ResponseUtil.success(res, analytics, 'Post analytics fetched successfully');
    } catch (error: any) {
      logger.error('Error in getPostAnalytics:', error);
      if (error.message === 'Post not found') {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }
      ResponseUtil.error(res, error.message || 'Failed to fetch post analytics');
    }
  };

  // GET /engagement?companyId=UUID — UUID query me aayega
  getEngagementMetrics = async (req: AuthRequest, res: Response) => {
    try {
      const { companyId, days } = req.query;
      if (!companyId || typeof companyId !== 'string') {
        ResponseUtil.badRequest(res, 'Company ID is required');
        return;
      }
      const daysNum = days ? parseInt(days as string, 10) : 30;
      const metrics = await CompanyAnalyticsService.getEngagementMetrics(companyId, daysNum);
      ResponseUtil.success(res, metrics, 'Engagement metrics fetched successfully');
    } catch (error: any) {
      logger.error('Error in getEngagementMetrics:', error);
      ResponseUtil.error(res, error.message || 'Failed to fetch engagement metrics');
    }
  };

  // GET /trends?companyId=UUID
  getTrends = async (req: AuthRequest, res: Response) => {
    try {
      const { companyId, days } = req.query;
      if (!companyId || typeof companyId !== 'string') {
        ResponseUtil.badRequest(res, 'Company ID is required');
        return;
      }
      const daysNum = days ? parseInt(days as string, 10) : 30;
      const trends = await CompanyAnalyticsService.getTrends(companyId, daysNum);
      ResponseUtil.success(res, trends, 'Trends fetched successfully');
    } catch (error: any) {
      logger.error('Error in getTrends:', error);
      ResponseUtil.error(res, error.message || 'Failed to fetch trends');
    }
  };

  // GET /top-posts?companyId=UUID (optional)
  getTopPosts = async (req: AuthRequest, res: Response) => {
    try {
      const { companyId, limit, days } = req.query;
      const limitNum = limit ? parseInt(limit as string, 10) : 10;
      const daysNum = days ? parseInt(days as string, 10) : 30;

      const topPosts = await CompanyAnalyticsService.getTopPosts(
        companyId as string | undefined,
        limitNum,
        daysNum
      );
      ResponseUtil.success(res, topPosts, 'Top posts fetched successfully');
    } catch (error: any) {
      logger.error('Error in getTopPosts:', error);
      ResponseUtil.error(res, error.message || 'Failed to fetch top posts');
    }
  };

  // GET /top-companies
  getTopCompanies = async (req: AuthRequest, res: Response) => {
    try {
      const { limit, days } = req.query;
      const limitNum = limit ? parseInt(limit as string, 10) : 10;
      const daysNum = days ? parseInt(days as string, 10) : 7;

      const topCompanies = await CompanyAnalyticsService.getTopCompanies(limitNum, daysNum);
      ResponseUtil.success(res, topCompanies, 'Top companies fetched successfully');
    } catch (error: any) {
      logger.error('Error in getTopCompanies:', error);
      ResponseUtil.error(res, error.message || 'Failed to fetch top companies');
    }
  };

  // GET /export?companyId=UUID
  exportAnalytics = async (req: AuthRequest, res: Response) => {
    try {
      const { companyId, startDate, endDate } = req.query;
      if (!companyId || typeof companyId !== 'string') {
        ResponseUtil.badRequest(res, 'Company ID is required');
        return;
      }

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const csv = await CompanyAnalyticsService.exportToCSV(companyId, start, end);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${companyId}-${Date.now()}.csv`);
      res.status(200).send(csv);
    } catch (error: any) {
      logger.error('Error in exportAnalytics:', error);
      ResponseUtil.error(res, error.message || 'Failed to export analytics');
    }
  };
}

export default new CompanyAnalyticsController();