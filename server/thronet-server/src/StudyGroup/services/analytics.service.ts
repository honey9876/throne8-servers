/**
 * ====================================
 * ANALYTICS SERVICE - PRODUCTION READY
 * ====================================
 * Advanced analytics for study patterns, user performance, and group insights
 * Provides data for dashboards, reports, and trend analysis
 */

import { LoggerUtil } from '@/shared/logger.util';
import { User } from '@/auth/models';
import StudySession from '../models/StudySession.model';
import Task from '../models/Task.model';
import Goal from '../models/Goal.model';
import Attendance from '../models/Attendance.model';
import Streak from '../models/Streak.model';
import Ranking from '../models/Ranking.model';
import Message from '../models/Message.model';
import Doubt from '../models/Doubt.model';
import redisConfig from '@/config/cache/redis.config';
import CacheUtil from '@/shared/cache.util';
import Group from '../models/Group.model';
import GroupMember from '../models/GroupMember.model';

/**
 * ========================================
 * USER ANALYTICS
 * ========================================
 */

export const UserAnalytics = {
  /**
   * Get comprehensive user statistics
   */
  getUserStats: async (userId: string) => {
    try {
      LoggerUtil.info(`Fetching user statistics for: ${userId}`);

      const [
        totalSessions,
        totalHours,
        totalTasks,
        completedTasks,
        totalGoals,
        completedGoals,
        attendanceRate,
        streak,
        ranking,
      ] = await Promise.all([
        // Total study sessions
        StudySession.countDocuments({ user: userId, status: 'completed' }),

        // Total study hours
        StudySession.aggregate([
          { $match: { user: userId, status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$duration' } } },
        ]),

        // Tasks
        Task.countDocuments({ assignedTo: userId }),
        Task.countDocuments({ assignedTo: userId, status: 'completed' }),

        // Goals
        Goal.countDocuments({ user: userId }),
        Goal.countDocuments({ user: userId, status: 'completed' }),

        // Attendance rate
        Attendance.aggregate([
          { $match: { user: userId } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              present: {
                $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] },
              },
            },
          },
        ]),

        // Streak
        Streak.findOne({ user: userId }),

        // Ranking
        Ranking.findOne({ userId }),
      ]);

      const totalStudyHours = totalHours[0]?.total
        ? parseFloat((totalHours[0].total / 3600).toFixed(2))
        : 0;

      const avgSessionLength =
        totalSessions > 0 ? (totalStudyHours / totalSessions).toFixed(2) : '0';

      const taskCompletionRate =
        totalTasks > 0
          ? parseFloat(((completedTasks / totalTasks) * 100).toFixed(2))
          : 0;

      const goalCompletionRate =
        totalGoals > 0
          ? parseFloat(((completedGoals / totalGoals) * 100).toFixed(2))
          : 0;

      const attendancePercentage =
        attendanceRate[0]?.total > 0
          ? parseFloat(
            ((attendanceRate[0].present / attendanceRate[0].total) * 100).toFixed(2)
          )
          : 0;

      return {
        studyStats: {
          totalSessions,
          totalStudyHours,
          averageSessionLength: parseFloat(avgSessionLength),
        },
        productivity: {
          totalTasks,
          completedTasks,
          taskCompletionRate,
          totalGoals,
          completedGoals,
          goalCompletionRate,
        },
        attendance: {
          totalDays: attendanceRate[0]?.total || 0,
          presentDays: attendanceRate[0]?.present || 0,
          attendancePercentage,
        },
        engagement: {
          currentStreak: streak?.currentStreak || 0,
          longestStreak: streak?.longestStreak || 0,
          lastActive: streak?.lastActivityDate || null,
        },
        ranking: {
          globalRank: ranking?.globalRank || 0,
          rankScore: ranking?.rankScore || 0,
          categoryRank: ranking?.categoryRank || {},
        },
      };
    } catch (error: any) {
      LoggerUtil.error(`Error fetching user stats for ${userId}:`, error.message);
      throw error;
    }
  },

  /**
   * Get study patterns and trends
   */
  getStudyPatterns: async (userId: string, days: number = 30) => {
    try {
      LoggerUtil.info(`Analyzing study patterns for: ${userId} (${days} days)`);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get hourly distribution
      const hourlyDistribution = await StudySession.aggregate([
        {
          $match: {
            user: userId,
            status: 'completed',
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            sessions: { $sum: 1 },
            totalHours: { $sum: '$duration' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Get day-of-week distribution
      const weekdayDistribution = await StudySession.aggregate([
        {
          $match: {
            user: userId,
            status: 'completed',
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dayOfWeek: '$createdAt' },
            sessions: { $sum: 1 },
            totalHours: { $sum: '$duration' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Get daily trend
      const dailyTrend = await StudySession.aggregate([
        {
          $match: {
            user: userId,
            status: 'completed',
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            sessions: { $sum: 1 },
            totalHours: { $sum: '$duration' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Find most productive hour
      const mostProductiveHour = hourlyDistribution.reduce(
        (max, current) => (current.totalHours > max.totalHours ? current : max),
        { _id: 0, totalHours: 0 }
      );

      // Find most productive day
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const mostProductiveDay = weekdayDistribution.reduce(
        (max, current) => (current.totalHours > max.totalHours ? current : max),
        { _id: 1, totalHours: 0 }
      );

      return {
        hourlyPattern: hourlyDistribution.map((h) => ({
          hour: h._id,
          sessions: h.sessions,
          hours: parseFloat((h.totalHours / 3600).toFixed(2)),
        })),
        weekdayPattern: weekdayDistribution.map((d) => ({
          day: dayNames[d._id - 1],
          dayNumber: d._id,
          sessions: d.sessions,
          hours: parseFloat((d.totalHours / 3600).toFixed(2)),
        })),
        dailyTrend: dailyTrend.map((d) => ({
          date: d._id,
          sessions: d.sessions,
          hours: parseFloat((d.totalHours / 3600).toFixed(2)),
        })),
        insights: {
          mostProductiveHour: mostProductiveHour._id,
          mostProductiveDay: dayNames[mostProductiveDay._id - 1],
          totalDaysAnalyzed: days,
        },
      };
    } catch (error: any) {
      LoggerUtil.error(`Error analyzing study patterns for ${userId}:`, error.message);
      throw error;
    }
  },

  /**
   * Get performance comparison (user vs average)
   */
  getPerformanceComparison: async (userId: string, category?: string) => {
    try {
      LoggerUtil.info(`Comparing performance for: ${userId}`);

      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const matchQuery: any = {};
      // Only filter by category if explicitly provided
      if (category) {
        matchQuery.category = category;
      }

      // Get user stats
      const userRanking = await Ranking.findOne({ userId });

      // Get average stats
      const averageStats = await Ranking.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            avgStudyHours: { $avg: '$totalStudyHours' },
            avgStreak: { $avg: '$currentStreak' },
            avgRankScore: { $avg: '$rankScore' },
          },
        },
      ]);

      const avg = averageStats[0] || {
        avgStudyHours: 0,
        avgStreak: 0,
        avgRankScore: 0,
      };

      const userHours = userRanking?.totalStudyHours || 0;
      const userStreak = userRanking?.currentStreak || 0;
      const userScore = userRanking?.rankScore || 0;

      return {
        user: {
          studyHours: userHours,
          streak: userStreak,
          rankScore: userScore,
        },
        average: {
          studyHours: parseFloat(avg.avgStudyHours.toFixed(2)),
          streak: parseFloat(avg.avgStreak.toFixed(2)),
          rankScore: parseFloat(avg.avgRankScore.toFixed(2)),
        },
        comparison: {
          studyHoursVsAvg:
            avg.avgStudyHours > 0
              ? parseFloat((((userHours - avg.avgStudyHours) / avg.avgStudyHours) * 100).toFixed(2))
              : 0,
          streakVsAvg:
            avg.avgStreak > 0
              ? parseFloat((((userStreak - avg.avgStreak) / avg.avgStreak) * 100).toFixed(2))
              : 0,
          rankScoreVsAvg:
            avg.avgRankScore > 0
              ? parseFloat((((userScore - avg.avgRankScore) / avg.avgRankScore) * 100).toFixed(2))
              : 0,
        },
      };
    } catch (error: any) {
      LoggerUtil.error(`Error comparing performance for ${userId}:`, error.message);
      throw error;
    }
  },

  /**
   * Get study consistency score (0-100)
   */
  getConsistencyScore: async (userId: string, days: number = 30) => {
    try {
      LoggerUtil.info(`Calculating consistency score for: ${userId}`);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get daily study data
      const dailyData = await StudySession.aggregate([
        {
          $match: {
            user: userId,
            status: 'completed',
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            hours: { $sum: '$duration' },
          },
        },
      ]);

      if (dailyData.length === 0) {
        return {
          consistencyScore: 0,
          activeDays: 0,
          totalDays: days,
          averageHoursPerDay: 0,
          variance: 0,
        };
      }

      // Calculate metrics
      const activeDays = dailyData.length;
      const totalHours = dailyData.reduce((sum, day) => sum + day.hours, 0) / 3600;
      const avgHoursPerDay = totalHours / activeDays;

      // Calculate variance
      const variance =
        dailyData.reduce((sum, day) => {
          const diff = day.hours / 3600 - avgHoursPerDay;
          return sum + diff * diff;
        }, 0) / activeDays;

      const standardDeviation = Math.sqrt(variance);

      // Consistency score calculation (0-100)
      const activityScore = (activeDays / days) * 50; // 50% weight for activity
      const varianceScore = Math.max(0, 50 - standardDeviation * 10); // 50% weight for low variance

      const consistencyScore = Math.min(100, Math.round(activityScore + varianceScore));

      return {
        consistencyScore,
        activeDays,
        totalDays: days,
        averageHoursPerDay: parseFloat(avgHoursPerDay.toFixed(2)),
        variance: parseFloat(variance.toFixed(2)),
        standardDeviation: parseFloat(standardDeviation.toFixed(2)),
      };
    } catch (error: any) {
      LoggerUtil.error(`Error calculating consistency score for ${userId}:`, error.message);
      throw error;
    }
  },
};

/**
 * ========================================
 * GROUP ANALYTICS
 * ========================================
 */

export const GroupAnalytics = {
  /**
   * Get comprehensive group statistics
   */
  getGroupStats: async (groupId: string) => {
    try {
      LoggerUtil.info(`Fetching group statistics for: ${groupId}`);

      const [
        group,
        totalMembers,
        activeMembers,
        totalStudyHours,
        totalMessages,
        totalDoubts,
        solvedDoubts,
        totalTasks,
        completedTasks,
      ] = await Promise.all([
        Group.findById(groupId),
        GroupMember.countDocuments({ group: groupId, status: 'active' }),
        GroupMember.countDocuments({
          group: groupId,
          status: 'active',
          lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }),

        // Get total study hours of all members
        StudySession.aggregate([
          {
            $lookup: {
              from: 'groupmembers',
              let: { userId: '$user' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$user', '$$userId'] },
                        { $eq: ['$group', groupId] },
                        { $eq: ['$status', 'active'] },
                      ],
                    },
                  },
                },
              ],
              as: 'membership',
            },
          },
          { $match: { status: 'completed', membership: { $ne: [] } } },
          { $group: { _id: null, total: { $sum: '$duration' } } },
        ]),

        Message.countDocuments({ group: groupId }),
        Doubt.countDocuments({ group: groupId }),
        Doubt.countDocuments({ group: groupId, status: 'solved' }),
        Task.countDocuments({ group: groupId }),
        Task.countDocuments({ group: groupId, status: 'completed' }),
      ]);

      if (!group) throw new Error('Group not found');

      const avgStudyHours =
        totalMembers > 0 && totalStudyHours[0]?.total
          ? parseFloat(((totalStudyHours[0].total / 3600 / totalMembers).toFixed(2)))
          : 0;

      return {
        group: {
          id: group._id,
          title: group.title,
          category: group.category,
          createdAt: group.createdAt,
        },
        membership: {
          totalMembers,
          activeMembers,
          activePercentage:
            totalMembers > 0
              ? parseFloat(((activeMembers / totalMembers) * 100).toFixed(2))
              : 0,
        },
        activity: {
          totalStudyHours: totalStudyHours[0]?.total
            ? parseFloat((totalStudyHours[0].total / 3600).toFixed(2))
            : 0,
          averageHoursPerMember: avgStudyHours,
          totalMessages,
          totalDoubts,
          solvedDoubts,
          doubtSolutionRate:
            totalDoubts > 0
              ? parseFloat(((solvedDoubts / totalDoubts) * 100).toFixed(2))
              : 0,
        },
        productivity: {
          totalTasks,
          completedTasks,
          taskCompletionRate:
            totalTasks > 0
              ? parseFloat(((completedTasks / totalTasks) * 100).toFixed(2))
              : 0,
        },
      };
    } catch (error: any) {
      LoggerUtil.error(`Error fetching group stats for ${groupId}:`, error.message);
      throw error;
    }
  },

  /**
   * Get top contributors in a group
   */
  getTopContributors: async (groupId: string, limit: number = 10) => {
    try {
      LoggerUtil.info(`Fetching top contributors for group: ${groupId}`);

      const members = await GroupMember.find({
        group: groupId,
        status: 'active',
      })
        .populate('user', 'name email avatar')
        .lean();

      const memberIds = members.map((m) => m.user);

      // Get contribution scores
      const contributions = await Promise.all(
        memberIds.map(async (userId: any) => {
          const [studyHours, messagesCount, doubtsAnswered, tasksCompleted] =
            await Promise.all([
              StudySession.aggregate([
                { $match: { user: userId._id, status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$duration' } } },
              ]),
              Message.countDocuments({ sender: userId._id, group: groupId }),
              Doubt.countDocuments({ 'answers.author': userId._id }),
              Task.countDocuments({
                group: groupId,
                assignedTo: userId._id,
                status: 'completed',
              }),
            ]);

          const hours = studyHours[0]?.total
            ? parseFloat((studyHours[0].total / 3600).toFixed(2))
            : 0;

          // Calculate contribution score
          const score =
            hours * 10 + // 10 points per hour
            messagesCount * 1 + // 1 point per message
            doubtsAnswered * 5 + // 5 points per answer
            tasksCompleted * 3; // 3 points per task

          return {
            user: {
              id: userId._id,
              name: userId.name,
              email: userId.email,
              avatar: userId.avatar,
            },
            stats: {
              studyHours: hours,
              messagesCount,
              doubtsAnswered,
              tasksCompleted,
            },
            contributionScore: Math.round(score),
          };
        })
      );

      // Sort by contribution score and limit
      const topContributors = contributions
        .sort((a, b) => b.contributionScore - a.contributionScore)
        .slice(0, limit);

      return topContributors;
    } catch (error: any) {
      LoggerUtil.error(
        `Error fetching top contributors for group ${groupId}:`,
        error.message
      );
      throw error;
    }
  },

  /**
   * Get group activity timeline
   */
  getActivityTimeline: async (groupId: string, days: number = 7) => {
    try {
      LoggerUtil.info(`Fetching activity timeline for group: ${groupId} (${days} days)`);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [studyActivity, messageActivity, doubtActivity] = await Promise.all([
        // Study sessions
        StudySession.aggregate([
          {
            $lookup: {
              from: 'groupmembers',
              let: { userId: '$user' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$user', '$$userId'] },
                        { $eq: ['$group', groupId] },
                        { $eq: ['$status', 'active'] },
                      ],
                    },
                  },
                },
              ],
              as: 'membership',
            },
          },
          {
            $match: {
              status: 'completed',
              createdAt: { $gte: startDate },
              membership: { $ne: [] },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              sessions: { $sum: 1 },
              hours: { $sum: '$duration' },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        // Messages
        Message.aggregate([
          {
            $match: {
              group: groupId,
              createdAt: { $gte: startDate },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        // Doubts
        Doubt.aggregate([
          {
            $match: {
              group: groupId,
              createdAt: { $gte: startDate },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              posted: { $sum: 1 },
              solved: {
                $sum: { $cond: [{ $eq: ['$status', 'solved'] }, 1, 0] },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

      return {
        study: studyActivity.map((s) => ({
          date: s._id,
          sessions: s.sessions,
          hours: parseFloat((s.hours / 3600).toFixed(2)),
        })),
        messages: messageActivity.map((m) => ({
          date: m._id,
          count: m.count,
        })),
        doubts: doubtActivity.map((d) => ({
          date: d._id,
          posted: d.posted,
          solved: d.solved,
        })),
      };
    } catch (error: any) {
      LoggerUtil.error(
        `Error fetching activity timeline for group ${groupId}:`,
        error.message
      );
      throw error;
    }
  },
};

/**
 * ========================================
 * PLATFORM ANALYTICS
 * ========================================
 */

export const PlatformAnalytics = {
  /**
   * Get overall platform statistics
   */
  getPlatformStats: async () => {
    try {
      LoggerUtil.info('Fetching platform-wide statistics');

      // Check cache first
      // const cacheKey = 'analytics:platform:stats';
      const cacheKey = `${redisConfig.getKeyPrefixes().analyticsDaily}platform:stats`;
      // const cached = await AnalyticsCache.getDaily(cacheKey);
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const [
        totalUsers,
        activeUsers,
        totalGroups,
        activeGroups,
        totalStudyHours,
        totalSessions,
        totalMessages,
        totalDoubts,
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({
          updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }),
        Group.countDocuments({ isActive: true }),
        Group.countDocuments({
          isActive: true,
          updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }),
        StudySession.aggregate([
          { $match: { status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$duration' } } },
        ]),
        StudySession.countDocuments({ status: 'completed' }),
        Message.countDocuments(),
        Doubt.countDocuments(),
      ]);

      const stats = {
        users: {
          total: totalUsers,
          activeThisWeek: activeUsers,
          activePercentage:
            totalUsers > 0
              ? parseFloat(((activeUsers / totalUsers) * 100).toFixed(2))
              : 0,
        },
        groups: {
          total: totalGroups,
          activeThisWeek: activeGroups,
          activePercentage:
            totalGroups > 0
              ? parseFloat(((activeGroups / totalGroups) * 100).toFixed(2))
              : 0,
        },
        activity: {
          totalStudyHours: totalStudyHours[0]?.total
            ? parseFloat((totalStudyHours[0].total / 3600).toFixed(2))
            : 0,
          totalSessions,
          totalMessages,
          totalDoubts,
        },
      };

      // Cache for 1 hour
      // await AnalyticsCache.setDaily(cacheKey, stats, CACHE_TTL.VERY_LONG);
      await CacheUtil.set(cacheKey, stats, redisConfig.getCacheTTL().analyticsDaily);
      return stats;
    } catch (error: any) {
      LoggerUtil.error('Error fetching platform stats:', error.message);
      throw error;
    }
  },

  /**
   * Get growth metrics
   */
  getGrowthMetrics: async (days: number = 30) => {
    try {
      LoggerUtil.info(`Fetching growth metrics (${days} days)`);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [userGrowth, groupGrowth, activityGrowth] = await Promise.all([
        User.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        Group.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        StudySession.aggregate([
          { $match: { createdAt: { $gte: startDate }, status: 'completed' } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              sessions: { $sum: 1 },
              hours: { $sum: '$duration' },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

      return {
        users: userGrowth.map((u) => ({ date: u._id, count: u.count })),
        groups: groupGrowth.map((g) => ({ date: g._id, count: g.count })),
        activity: activityGrowth.map((a) => ({
          date: a._id,
          sessions: a.sessions,
          hours: parseFloat((a.hours / 3600).toFixed(2)),
        })),
      };
    } catch (error: any) {
      LoggerUtil.error(`Error fetching growth metrics:`, error.message);
      throw error;
    }
  },
};

/**
 * ========================================
 * EXPORT UTILITIES
 * ========================================
 */

export const ExportUtilities = {
  /**
   * Export user report as JSON
   */
  exportUserReport: async (userId: string) => {
    try {
      const [stats, patterns, comparison, consistency] = await Promise.all([
        UserAnalytics.getUserStats(userId),
        UserAnalytics.getStudyPatterns(userId),
        UserAnalytics.getPerformanceComparison(userId),
        UserAnalytics.getConsistencyScore(userId),
      ]);

      return {
        userId,
        generatedAt: new Date(),
        stats,
        patterns,
        comparison,
        consistency,
      };
    } catch (error: any) {
      LoggerUtil.error(`Error exporting user report for ${userId}:`, error.message);
      throw error;
    }
  },

  /**
   * Export group report as JSON
   */
  exportGroupReport: async (groupId: string) => {
    try {
      const [stats, contributors, timeline] = await Promise.all([
        GroupAnalytics.getGroupStats(groupId),
        GroupAnalytics.getTopContributors(groupId),
        GroupAnalytics.getActivityTimeline(groupId),
      ]);

      return {
        groupId,
        generatedAt: new Date(),
        stats,
        topContributors: contributors,
        activityTimeline: timeline,
      };
    } catch (error: any) {
      LoggerUtil.error(`Error exporting group report for ${groupId}:`, error.message);
      throw error;
    }
  },
};

/**
 * Export all analytics services
 */
export default {
  UserAnalytics,
  GroupAnalytics,
  PlatformAnalytics,
  ExportUtilities,
};