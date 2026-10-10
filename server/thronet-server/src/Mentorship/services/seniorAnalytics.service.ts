import { SeniorSession, Mentor } from "../models";
import { SeniorSessionStatus } from "../interface/seniorSession.types";
import { logger } from "@/shared/logger.util";
import MentorshipAnalytics from '@/Mentorship/models/mentorshipAnalytics';

class SeniorAnalyticsService {
  /**
   * Get basic Senior Session stats (Total sessions, type breakdown, completion rate, earnings).
   */
  async getSeniorStats(mentorId: string, startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const dateFilter: any = {};
      if (startDate || endDate) {
        dateFilter.bookingDate = {};
        if (startDate) dateFilter.bookingDate.$gte = startDate;
        if (endDate) dateFilter.bookingDate.$lte = endDate;
      }

      const [sessionStats, sessionTypeBreakdown] = await Promise.all([
        SeniorSession.aggregate([
          { $match: { mentorId } },
          { $unwind: { path: '$bookings', preserveNullAndEmptyArrays: false } },
          {
            $addFields: {
              bookingDate: { $ifNull: ['$bookings.scheduledAt', '$scheduledAt'] },
              bookingTotalAmount: { $ifNull: ['$bookings.pricing.totalAmount', '$pricing.totalAmount', 0] },
              isValidBooking: {
                $in: ['$bookings.status', [SeniorSessionStatus.CONFIRMED, SeniorSessionStatus.IN_PROGRESS, SeniorSessionStatus.COMPLETED]]
              }
            }
          },
          ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
          {
            $group: {
              _id: null,
              totalBookings: { $sum: { $cond: ['$isValidBooking', 1, 0] } },
              completedBookings: { $sum: { $cond: [{ $eq: ['$bookings.status', SeniorSessionStatus.COMPLETED] }, 1, 0] } },
              cancelledBookings: { $sum: { $cond: [{ $eq: ['$bookings.status', SeniorSessionStatus.CANCELLED] }, 1, 0] } },
              totalEarnings: { $sum: { $cond: ['$isValidBooking', '$bookingTotalAmount', 0] } },
              averageSessionPrice: { $avg: { $cond: ['$isValidBooking', '$bookingTotalAmount', null] } },
            },
          },
        ]),
        SeniorSession.aggregate([
          { $match: { mentorId } },
          { $unwind: { path: '$bookings', preserveNullAndEmptyArrays: false } },
          {
            $addFields: {
              bookingDate: { $ifNull: ['$bookings.scheduledAt', '$scheduledAt'] },
              bookingTotalAmount: { $ifNull: ['$bookings.pricing.totalAmount', '$pricing.totalAmount', 0] },
              isValidBooking: {
                $in: ['$bookings.status', [SeniorSessionStatus.CONFIRMED, SeniorSessionStatus.IN_PROGRESS, SeniorSessionStatus.COMPLETED]]
              }
            }
          },
          { $match: { isValidBooking: true } },
          ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
          { $group: { _id: '$title', count: { $sum: 1 }, revenue: { $sum: '$bookingTotalAmount' } } },
        ])
      ]);

      const stats = sessionStats[0] || {
        totalBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        totalEarnings: 0,
        averageSessionPrice: 0,
      };

      return {
        sessions: {
          total: stats.totalBookings,
          completed: stats.completedBookings,
          cancelled: stats.cancelledBookings,
          completionRate: stats.totalBookings > 0
            ? Math.round((stats.completedBookings / stats.totalBookings) * 100)
            : 0,
          byType: sessionTypeBreakdown,
        },
        earnings: {
          total: stats.totalEarnings,
        }
      };
    } catch (error: any) {
      logger.error('❌ Failed to get senior mentor stats:', error);
      throw error;
    }
  }

  /**
   * 📊 Main Dashboard stats endpoint mimicking normal mentor's format
   */
  async getSeniorDashboardStats(userId: string): Promise<any> {
    try {
      logger.info(`📊 Fetching senior dashboard stats for userId: ${userId}`);

      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const fourMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

      const [
        baseStats,
        viewsThisMonthAgg,
        viewsLastMonthAgg,
        viewsAllTimeAgg,
        durationAgg,
        monthlyEarnings,
        cancellationAgg,
      ] = await Promise.all([
        this.getSeniorStats(userId),

        MentorshipAnalytics.getAggregatedMetrics('mentor', userId, thisMonthStart, now),
        MentorshipAnalytics.getAggregatedMetrics('mentor', userId, lastMonthStart, thisMonthStart),
        MentorshipAnalytics.getAggregatedMetrics('mentor', userId, new Date(0), now),

        SeniorSession.aggregate([
          { $match: { mentorId: userId } },
          { $unwind: { path: '$bookings', preserveNullAndEmptyArrays: false } },
          { $match: { 'bookings.status': SeniorSessionStatus.COMPLETED } },
          { $group: { _id: null, avgDuration: { $avg: '$duration' } } },
        ]),

        SeniorSession.aggregate([
          { $match: { mentorId: userId } },
          { $unwind: { path: '$bookings', preserveNullAndEmptyArrays: false } },
          {
            $addFields: {
              bookingDate: { $ifNull: ['$bookings.scheduledAt', '$scheduledAt'] },
              bookingTotalAmount: { $ifNull: ['$bookings.pricing.totalAmount', '$pricing.totalAmount', 0] }
            }
          },
          {
            $match: {
              'bookings.status': { $in: [SeniorSessionStatus.CONFIRMED, SeniorSessionStatus.IN_PROGRESS, SeniorSessionStatus.COMPLETED] },
              bookingDate: { $gte: fourMonthsAgo },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$bookingDate' } },
              amount: { $sum: '$bookingTotalAmount' },
            },
          },
          { $sort: { _id: -1 } },
          { $limit: 4 },
        ]),

        SeniorSession.aggregate([
          { $match: { mentorId: userId } },
          { $unwind: { path: '$bookings', preserveNullAndEmptyArrays: false } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              cancelled: { $sum: { $cond: [{ $eq: ['$bookings.status', SeniorSessionStatus.CANCELLED] }, 1, 0] } }
            },
          },
        ])
      ]);

      // Handle views (Senior mapping may not exist, resulting uniformly in 0)
      const viewsNow = viewsThisMonthAgg?.totalViews || 0;
      const viewsPrev = viewsLastMonthAgg?.totalViews || 0;
      const viewsChangePct = viewsPrev > 0
        ? Math.round(((viewsNow - viewsPrev) / viewsPrev) * 100)
        : viewsNow > 0 ? 100 : 0;

      const cancellation = cancellationAgg[0] || { total: 0, cancelled: 0 };
      const cancellationRate = cancellation.total > 0
        ? Math.round((cancellation.cancelled / cancellation.total) * 100)
        : 0;

      // Conversion Rate
      const totalBookingsAllTime = baseStats.sessions.total || 0;
      const totalViewsAllTime = viewsAllTimeAgg?.totalViews || 0;
      const viewToBookingRate = totalViewsAllTime > 0
        ? Math.round((totalBookingsAllTime / totalViewsAllTime) * 100)
        : 0;

      return {
        profileViews: {
          value: totalViewsAllTime,
          valueThisMonth: viewsNow,
          changePercent: viewsChangePct,
          trend: viewsChangePct >= 0 ? 'up' : 'down',
        },
        bookingRate: {
          value: baseStats.sessions.completionRate,
          trend: 'up',
        },
        avgSessionDuration: {
          value: Math.round(durationAgg[0]?.avgDuration || 0),
        },
        cancellationRate: {
          value: cancellationRate,
          cancelled: cancellation.cancelled,
          total: cancellation.total,
        },
        conversion: {
          views: totalViewsAllTime,
          bookings: totalBookingsAllTime,
          rate: viewToBookingRate,
        },
        popularServices: baseStats.sessions.byType.map((s: any) => ({
          sessionType: s._id || 'Standard Service',
          bookings: s.count,
          revenue: s.revenue,
        })),
        monthlyEarnings: monthlyEarnings.map((m: any) => ({
          month: m._id,
          amount: m.amount,
        }))
      };
    } catch (error: any) {
      logger.error('❌ Failed to get senior dashboard stats:', error);
      throw error;
    }
  }
}

export default new SeniorAnalyticsService();
