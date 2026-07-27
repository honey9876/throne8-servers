// src/services/report.service.ts

import { Mentor, MentorshipReview, SessionMentor } from "../models";
import { logger } from "@/shared/logger.util";


interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface RevenueReport {
  totalRevenue: number;
  sessionCount: number;
  averageSessionPrice: number;
  revenueBySessionType: any[];
  revenueByMentor: any[];
  growthRate: number;
}

interface MentorPerformanceReport {
  mentorId: string;
  totalSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  totalRevenue: number;
  averageRating: number;
  totalReviews: number;
  completionRate: number;
  cancellationRate: number;
}

interface PlatformReport {
  totalMentors: number;
  activeMentors: number;
  totalSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  totalRevenue: number;
  averageRating: number;
  userGrowth: number;
  sessionGrowth: number;
  revenueGrowth: number;
}

class ReportService {
  /**
   * Generate revenue report
   */
  async generateRevenueReport(dateRange: DateRange): Promise<RevenueReport> {
    try {
      const { startDate, endDate } = dateRange;

      // Get completed sessions
      const sessions = await SessionMentor.find({
        scheduledAt: { $gte: startDate, $lte: endDate },
        status: 'completed',
      }).lean();

      const totalRevenue = sessions.reduce((sum: any, s: any) => sum + (s.pricing?.totalAmount || 0), 0);
      const sessionCount = sessions.length;
      const averageSessionPrice = sessionCount > 0 ? totalRevenue / sessionCount : 0;

      // Revenue by session type
      const revenueBySessionType = await SessionMentor.aggregate([
        {
          $match: {
            scheduledAt: { $gte: startDate, $lte: endDate },
            status: 'completed',
          },
        },
        {
          $group: {
            _id: '$sessionType',
            totalRevenue: { $sum: '$pricing.totalAmount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalRevenue: -1 } },
      ]);

      // Revenue by mentor
      const revenueByMentor = await SessionMentor.aggregate([
        {
          $match: {
            scheduledAt: { $gte: startDate, $lte: endDate },
            status: 'completed',
          },
        },
        {
          $group: {
            _id: '$mentorId',
            totalRevenue: { $sum: '$pricing.totalAmount' },
            sessionCount: { $sum: 1 },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 },
      ]);

      // Calculate growth rate
      const previousPeriod = this.getPreviousPeriod(startDate, endDate);
      const previousSessions = await SessionMentor.find({
        scheduledAt: { $gte: previousPeriod.startDate, $lte: previousPeriod.endDate },
        status: 'completed',
      }).lean();

      const previousRevenue = previousSessions.reduce((sum: any, s: any) => sum + (s.pricing?.totalAmount || 0), 0);
      const growthRate = previousRevenue > 0 
        ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 
        : 0;

      return {
        totalRevenue,
        sessionCount,
        averageSessionPrice,
        revenueBySessionType,
        revenueByMentor,
        growthRate,
      };
    } catch(error : any) {
      logger.error('Failed to generate revenue report:', error);
      throw error;
    }
  }

  /**
   * Generate mentor performance report
   */
  async generateMentorPerformanceReport(
    mentorId: string,
    dateRange: DateRange
  ): Promise<MentorPerformanceReport> {
    try {
      const { startDate, endDate } = dateRange;

      // Get all sessions
      const allSessions = await SessionMentor.find({
        mentorId,
        scheduledAt: { $gte: startDate, $lte: endDate },
      }).lean();

      const totalSessions = allSessions.length;
      const completedSessions = allSessions.filter((s: any) => s.status === 'completed').length;
      const cancelledSessions = allSessions.filter((s: any) => s.status === 'cancelled').length;

      // Calculate revenue
      const totalRevenue = allSessions
        .filter((s: any) => s.status === 'completed')
        .reduce((sum: any, s: any) => sum + (s.pricing?.totalAmount || 0), 0);

      // Get reviews
      const reviews = await MentorshipReview.find({
        mentorId,
        createdAt: { $gte: startDate, $lte: endDate },
      }).lean();

      const totalReviews = reviews.length;
      const averageRating = totalReviews > 0
        ? reviews.reduce((sum: any, r: any) => sum + r.rating, 0) / totalReviews
        : 0;

      // Calculate rates
      const completionRate = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;
      const cancellationRate = totalSessions > 0 ? (cancelledSessions / totalSessions) * 100 : 0;

      return {
        mentorId,
        totalSessions,
        completedSessions,
        cancelledSessions,
        totalRevenue,
        averageRating,
        totalReviews,
        completionRate,
        cancellationRate,
      };
    } catch(error : any) {
      logger.error('Failed to generate mentor performance report:', error);
      throw error;
    }
  }

  /**
   * Generate platform overview report
   */
  async generatePlatformReport(dateRange: DateRange): Promise<PlatformReport> {
    try {
      const { startDate, endDate } = dateRange;

      // Get mentor stats
      const totalMentors = await Mentor.countDocuments();
      const activeMentors = await Mentor.countDocuments({
        isActive: true,
        isAvailable: true,
      });

      // Get session stats
      const sessions = await SessionMentor.find({
        scheduledAt: { $gte: startDate, $lte: endDate },
      }).lean();

      const totalSessions = sessions.length;
      const completedSessions = sessions.filter((s: any) => s.status === 'completed').length;
      const cancelledSessions = sessions.filter((s: any) => s.status === 'cancelled').length;

      // Calculate revenue
      const totalRevenue = sessions
        .filter((s: any) => s.status === 'completed')
        .reduce((sum: any, s: any) => sum + (s.pricing?.totalAmount || 0), 0);

      // Get average rating
      const reviews = await MentorshipReview.find({
        createdAt: { $gte: startDate, $lte: endDate },
      }).lean()

      const averageRating = reviews.length > 0
        ? reviews.reduce((sum: any, r: any) => sum + r.rating, 0) / reviews.length
        : 0;

      // Calculate growth rates
      const previousPeriod = this.getPreviousPeriod(startDate, endDate);
      
      const previousMentors = await Mentor.countDocuments({
        createdAt: { $gte: previousPeriod.startDate, $lte: previousPeriod.endDate },
      });

      const previousSessions = await SessionMentor.countDocuments({
        scheduledAt: { $gte: previousPeriod.startDate, $lte: previousPeriod.endDate },
      });

      const previousRevenueSessions = await SessionMentor.find({
        scheduledAt: { $gte: previousPeriod.startDate, $lte: previousPeriod.endDate },
        status: 'completed',
      }).lean();

      const previousRevenue = previousRevenueSessions.reduce((sum: any, s: any) => sum + (s.pricing?.totalAmount || 0), 0);

      const userGrowth = previousMentors > 0 
        ? ((totalMentors - previousMentors) / previousMentors) * 100 
        : 0;

      const sessionGrowth = previousSessions > 0
        ? ((totalSessions - previousSessions) / previousSessions) * 100
        : 0;

      const revenueGrowth = previousRevenue > 0
        ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
        : 0;

      return {
        totalMentors,
        activeMentors,
        totalSessions,
        completedSessions,
        cancelledSessions,
        totalRevenue,
        averageRating,
        userGrowth,
        sessionGrowth,
        revenueGrowth,
      };
    } catch(error : any) {
      logger.error('Failed to generate platform report:', error);
      throw error;
    }
  }

  /**
   * Generate session analytics report
   */
  async generateSessionAnalytics(dateRange: DateRange): Promise<any> {
    try {
      const { startDate, endDate } = dateRange;

      // Sessions by type
      const sessionsByType = await SessionMentor.aggregate([
        {
          $match: {
            scheduledAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: '$sessionType',
            count: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
            },
            totalRevenue: { $sum: '$pricing.totalAmount' },
          },
        },
      ]);

      // Sessions by day of week
      const sessionsByDay = await SessionMentor.aggregate([
        {
          $match: {
            scheduledAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $dayOfWeek: '$scheduledAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Sessions by hour
      const sessionsByHour = await SessionMentor.aggregate([
        {
          $match: {
            scheduledAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $hour: '$scheduledAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      return {
        sessionsByType,
        sessionsByDay,
        sessionsByHour,
      };
    } catch(error : any) {
      logger.error('Failed to generate session analytics:', error);
      throw error;
    }
  }

  /**
   * Get previous period for comparison
   */
  private getPreviousPeriod(startDate: Date, endDate: Date): DateRange {
    const duration = endDate.getTime() - startDate.getTime();
    const previousEndDate = new Date(startDate.getTime() - 1);
    const previousStartDate = new Date(previousEndDate.getTime() - duration);

    return {
      startDate: previousStartDate,
      endDate: previousEndDate,
    };
  }

  /**
   * Export report to CSV
   */
  async exportToCSV(data: any[]): Promise<string> {
    try {
      // Convert data to CSV format
      if (data.length === 0) return '';

      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(item => 
        Object.values(item).map(val => 
          typeof val === 'string' ? `"${val}"` : val
        ).join(',')
      );

      return [headers, ...rows].join('\n');
    } catch(error : any) {
      logger.error('Failed to export CSV:', error);
      throw error;
    }
  }
}

export default new ReportService();