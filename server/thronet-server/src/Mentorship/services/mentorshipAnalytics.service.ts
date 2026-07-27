import { Mentor, SessionMentor, MentorshipReview } from "../models";
import { BookingStatus } from "@/shared/constants/bookingStatus";
import { logger } from "@/shared/logger.util";

class MentorshipAnalyticsService {
  /**
   * Get comprehensive mentor statistics
   */
  async getMentorStats(mentorId: string, startDate?: Date, endDate?: Date): Promise<any> {
    try {
      logger.info(`📊 Fetching stats for mentor: ${mentorId}`);

      const dateFilter: any = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.$gte = startDate;
        if (endDate) dateFilter.createdAt.$lte = endDate;
      }

      // Get mentor details - FIXED: Use findOne with mentorId field
      // const mentor = await Mentor.findOne({ userId: mentorId });
      const mentor = await Mentor.findOne({ mentorId: mentorId });
      if (!mentor) {
        throw new Error('Mentor not found');
      }

      const [sessionStats, sessionTypeBreakdown, reviewStats] = await Promise.all([
        // Session statistics
        SessionMentor.aggregate([
          {
            $match: {
              mentorId,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: null,
              totalSessions: { $sum: 1 },
              completedSessions: {
                $sum: { $cond: [{ $eq: ['$status', BookingStatus.COMPLETED] }, 1, 0] },
              },
              cancelledSessions: {
                $sum: { $cond: [{ $eq: ['$status', BookingStatus.CANCELLED] }, 1, 0] },
              },
              totalEarnings: { $sum: '$pricing.basePrice' },
              averageSessionPrice: { $avg: '$pricing.basePrice' },
            },
          },
        ]),

        // Session type breakdown
        SessionMentor.aggregate([
          {
            $match: {
              mentorId,
              status: BookingStatus.COMPLETED,
              ...dateFilter,
            },
          },
          {
            $group: {
              _id: '$sessionType',
              count: { $sum: 1 },
              revenue: { $sum: '$pricing.basePrice' },
            },
          },
        ]),

        // Review statistics
        MentorshipReview.aggregate([
          {
            $match: {
              mentorId,
              isDeleted: false,
              isPublic: true,
            },
          },
          {
            $group: {
              _id: null,
              averageRating: { $avg: '$rating' },
              totalReviews: { $sum: 1 },
              distribution: {
                $push: '$rating',
              },
            },
          },
        ])
      ]);

      const stats = sessionStats[0] || {
        totalSessions: 0,
        completedSessions: 0,
        cancelledSessions: 0,
        totalEarnings: 0,
        averageSessionPrice: 0,
      };

      const reviews = reviewStats[0] || {
        averageRating: 0,
        totalReviews: 0,
        distribution: [],
      };

      // Calculate rating distribution
      const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      reviews.distribution.forEach((rating: number) => {
        ratingDistribution[rating as keyof typeof ratingDistribution]++;
      });

      return {
        mentor: {
          id: mentor.mentorId,
          userId: mentor.userId,
          title: mentor.title,
          status: mentor.status,
        },
        sessions: {
          total: stats.totalSessions,
          completed: stats.completedSessions,
          cancelled: stats.cancelledSessions,
          completionRate: stats.totalSessions > 0
            ? Math.round((stats.completedSessions / stats.totalSessions) * 100)
            : 0,
          byType: sessionTypeBreakdown,
        },
        earnings: {
          total: stats.totalEarnings,
          average: Math.round(stats.averageSessionPrice || 0),
          currency: 'INR',
        },
        reviews: {
          averageRating: Math.round((reviews.averageRating || 0) * 10) / 10,
          totalReviews: reviews.totalReviews,
          distribution: ratingDistribution,
        },
        period: {
          startDate,
          endDate,
        },
      };
    } catch (error: any) {
      logger.error('❌ Failed to get mentor stats:', error);
      throw error;
    }
  }

  /**
   * Get platform-wide statistics
   */
  async getPlatformStats(startDate?: Date, endDate?: Date): Promise<any> {
    try {
      logger.info('📊 Fetching platform statistics');

      const dateFilter: any = {};
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.$gte = startDate;
        if (endDate) dateFilter.createdAt.$lte = endDate;
      }

      const [mentorStats, sessionStats, reviewStats] = await Promise.all([
        // Mentor statistics
        Mentor.aggregate([
          { $match: { isDeleted: false, ...dateFilter } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
              },
              pending: {
                $sum: { $cond: [{ $eq: ['$status', 'pending_approval'] }, 1, 0] },
              },
            },
          },
        ]),

        // Session statistics
        SessionMentor.aggregate([
          { $match: dateFilter },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ['$status', BookingStatus.COMPLETED] }, 1, 0] },
              },
              cancelled: {
                $sum: { $cond: [{ $eq: ['$status', BookingStatus.CANCELLED] }, 1, 0] },
              },
              totalRevenue: { $sum: '$pricing.totalAmount' },
              platformFees: { $sum: '$pricing.platformFee' },
            },
          },
        ]),

        // Review statistics
        MentorshipReview.aggregate([
          { $match: { isDeleted: false, isPublic: true, ...dateFilter } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              averageRating: { $avg: '$rating' },
            },
          },
        ]),
      ]);

      return {
        mentors: mentorStats[0] || { total: 0, active: 0, pending: 0 },
        sessions: sessionStats[0] || {
          total: 0,
          completed: 0,
          cancelled: 0,
          totalRevenue: 0,
          platformFees: 0,
        },
        reviews: reviewStats[0] || { total: 0, averageRating: 0 },
        period: {
          startDate,
          endDate,
        },
      };
    } catch (error: any) {
      logger.error('❌ Failed to get platform stats:', error);
      throw error;
    }
  }

  /**
   * Get revenue report
   */
  async getRevenueReport(
    startDate?: Date,
    endDate?: Date,
    groupBy: 'day' | 'week' | 'month' = 'day'
  ): Promise<any> {
    try {
      logger.info('💰 Generating revenue report');

      const dateFilter: any = {
        'payment.status': 'COMPLETED',
      };

      if (startDate || endDate) {
        dateFilter['payment.paidAt'] = {};
        if (startDate) dateFilter['payment.paidAt'].$gte = startDate;
        if (endDate) dateFilter['payment.paidAt'].$lte = endDate;
      }

      let groupByFormat: any;
      switch (groupBy) {
        case 'day':
          groupByFormat = { $dateToString: { format: '%Y-%m-%d', date: '$payment.paidAt' } };
          break;
        case 'week':
          groupByFormat = { $week: '$payment.paidAt' };
          break;
        case 'month':
          groupByFormat = { $dateToString: { format: '%Y-%m', date: '$payment.paidAt' } };
          break;
      }

      const report = await SessionMentor.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: groupByFormat,
            totalRevenue: { $sum: '$pricing.totalAmount' },
            platformFees: { $sum: '$pricing.platformFee' },
            mentorEarnings: { $sum: '$pricing.basePrice' },
            sessionCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // const summary = report.reduce(
      //   (acc: any, item: any) => ({
      //     totalRevenue: acc.totalRevenue + item.totalRevenue,
      //     platformFees: acc.platformFees + item.platformFees,
      //     mentorEarnings: acc.mentorEarnings + item.mentorEarnings,
      //     sessionCount: acc.sessionCount + item.sessionCount,
      //   }),
      //   { totalRevenue: 0, platformFees: 0, mentorEarnings: 0, sessionCount: 0 }
      // );

      // return {
      //   summary,
      //   breakdown: report,
      //   groupBy,
      //   period: { startDate, endDate },
      // };

      // ✅ REPLACE WITH
      const result = await SessionMentor.aggregate([
        { $match: dateFilter },
        {
          $facet: {
            // Breakdown — groupBy ke hisaab se
            breakdown: [
              {
                $group: {
                  _id: groupByFormat,
                  totalRevenue: { $sum: '$pricing.totalAmount' },
                  platformFees: { $sum: '$pricing.platformFee' },
                  mentorEarnings: { $sum: '$pricing.basePrice' },
                  sessionCount: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],

            // Summary — DB mein hi total nikalo
            summary: [
              {
                $group: {
                  _id: null,
                  totalRevenue: { $sum: '$pricing.totalAmount' },
                  platformFees: { $sum: '$pricing.platformFee' },
                  mentorEarnings: { $sum: '$pricing.basePrice' },
                  sessionCount: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]);

      // Return statement update karo
      return {
        summary: result[0].summary[0] || {
          totalRevenue: 0,
          platformFees: 0,
          mentorEarnings: 0,
          sessionCount: 0,
        },
        breakdown: result[0].breakdown,
        groupBy,
        period: { startDate, endDate },
      };

    } catch (error: any) {
      logger.error('❌ Failed to generate revenue report:', error);
      throw error;
    }
  }

  /**
   * Get session report
   */
  async getSessionReport(
    startDate?: Date,
    endDate?: Date,
    groupBy: 'day' | 'week' | 'month' | 'type' = 'day'
  ): Promise<any> {
    try {
      logger.info('📋 Generating session report');

      const dateFilter: any = {};
      if (startDate || endDate) {
        dateFilter.scheduledAt = {};
        if (startDate) dateFilter.scheduledAt.$gte = startDate;
        if (endDate) dateFilter.scheduledAt.$lte = endDate;
      }

      let groupByField: any;
      if (groupBy === 'type') {
        groupByField = '$sessionType';
      } else {
        switch (groupBy) {
          case 'day':
            groupByField = { $dateToString: { format: '%Y-%m-%d', date: '$scheduledAt' } };
            break;
          case 'week':
            groupByField = { $week: '$scheduledAt' };
            break;
          case 'month':
            groupByField = { $dateToString: { format: '%Y-%m', date: '$scheduledAt' } };
            break;
        }
      }

      const report = await SessionMentor.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: groupByField,
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', BookingStatus.COMPLETED] }, 1, 0] },
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ['$status', BookingStatus.CANCELLED] }, 1, 0] },
            },
            revenue: { $sum: '$pricing.totalAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      return {
        breakdown: report,
        groupBy,
        period: { startDate, endDate },
      };
    } catch (error: any) {
      logger.error('❌ Failed to generate session report:', error);
      throw error;
    }
  }
}

export default new MentorshipAnalyticsService();