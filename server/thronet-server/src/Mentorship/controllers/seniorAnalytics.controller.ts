import { Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import SeniorAnalyticsService from '../services/seniorAnalytics.service';

class SeniorAnalyticsController {
  /**
   * Get Senior Mentor Dashboard Analytics
   */
  async getDashboardStats(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id; // Senior Mentors always act via their robust active user identity

      const stats = await SeniorAnalyticsService.getSeniorDashboardStats(userId);

      return ResponseHandler.success(res, 'Senior mentor analytics fetched successfully', stats);
    } catch (error: any) {
      return ResponseHandler.error(res, error.message || 'Internal Server Error', error.statusCode || 500, error.stack);
    }
  }
}

export default new SeniorAnalyticsController();
