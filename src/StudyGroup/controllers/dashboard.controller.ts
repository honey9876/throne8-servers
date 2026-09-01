/**
 * ====================================
 * DASHBOARD CONTROLLER
 * ====================================
 * User and group dashboard statistics
 */

import { Request, Response } from 'express';
import { asyncHandler } from '@/shared/errors/app.error';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import { NotFoundError, BadRequestError, ForbiddenError } from '@/shared/errors/app.error';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';

// Repositories only — no direct model imports
import groupRepository from '../repositories/group.repository';
import groupMemberRepository from '../repositories/groupMember.repository';
import studySessionRepository from '../repositories/studySession.repository';
import rankingRepository from '../repositories/ranking.repository';
import taskRepository from '../repositories/task.repository';
import goalRepository from '../repositories/goal.repository';
import userRepository from '../repositories/user.repository';

/**
 * Get user dashboard overview
 * GET /api/dashboard/user
 */
export const getUserDashboard = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;

    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    LoggerUtil.info('Fetching user dashboard', { userId });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [user, ranking, activeGroups, todayStudyHours, activeTasks, activeGoals] = await Promise.all([
      userRepository.findByUserId(userId),
      rankingRepository.findByUserId(userId),
      groupMemberRepository.countByUserId(userId),
      studySessionRepository.getTodayHours(userId, today, tomorrow),
      taskRepository.count({ userId: userId, completed: false }),
      goalRepository.count({ user: userId, completed: false }),
    ]);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const todayHours = todayStudyHours
      ? parseFloat((todayStudyHours / 3600).toFixed(2))
      : 0;

    const dashboard = {
      user: {
        id: user.userId,
        name: user.username,
        email: user.email,
        avatar: user.profilePhotoId,
      },
      stats: {
        globalRank: ranking?.globalRank || 0,
        rankScore: ranking?.rankScore || 0,
        currentStreak: ranking?.currentStreak || 0,
        longestStreak: ranking?.longestStreak || 0,
        totalStudyHours: ranking?.totalStudyHours || 0,
        activeGroups,
        todayStudyHours: todayHours,
        activeTasks,
        activeGoals,
      },
    };

    LoggerUtil.info('User dashboard fetched successfully', { userId });

    return ResponseUtil.success(
      res,
      dashboard,
      'User dashboard fetched successfully'
    );
  }
);

/**
 * Get group dashboard statistics
 * GET /api/dashboard/group/:groupId
 */
export const getGroupDashboard = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;
    const { groupId } = req.params;

    if (!groupId) {
      throw new BadRequestError('Group ID is required');
    }

    LoggerUtil.info('Fetching group dashboard', { userId, groupId });

    const membership = await groupMemberRepository.findActiveOne(groupId, userId!);

    if (!membership) {
      throw new ForbiddenError('You are not a member of this group');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      group,
      totalMembers,
      activeMembersToday,
      totalStudyHours,
      todayStudyHours,
    ] = await Promise.all([
      groupRepository.findByGroupId(groupId),
      groupMemberRepository.countByGroupId(groupId),
      groupMemberRepository.countActiveTodayByGroupId(groupId, today),
      studySessionRepository.getTotalHoursByGroupId(groupId),
      studySessionRepository.getTodayHoursByGroupId(groupId, today, tomorrow),
    ]);

    if (!group) {
      throw new NotFoundError('Group not found');
    }

    const totalHours = totalStudyHours
      ? parseFloat((totalStudyHours / 3600).toFixed(2))
      : 0;

    const todayHours = todayStudyHours
      ? parseFloat((todayStudyHours / 3600).toFixed(2))
      : 0;

    const dashboard = {
      group: {
        id: group.groupId,
        title: group.title,
        description: group.description,
        avatar: group.avatar,
        category: group.category,
      },
      stats: {
        totalMembers,
        activeMembersToday,
        totalStudyHours: totalHours,
        todayStudyHours: todayHours,
        activeTasks: 0,
        completedTasks: 0,
      },
    };

    LoggerUtil.info('Group dashboard fetched successfully', { userId, groupId });

    return ResponseUtil.success(
      res,
      dashboard,
      'Group dashboard fetched successfully'
    );
  }
);

/**
 * Get study statistics over time
 * GET /api/dashboard/statistics?period=7days
 */
export const getStudyStatistics = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;
    const { period = '7days' } = req.query;

    LoggerUtil.info('Fetching study statistics', { userId, period });

    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case '7days':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    const statistics = await studySessionRepository.getDailyStats(userId!, startDate, now);

    const formattedStats = statistics.map((stat: any) => ({
      date: stat._id,
      sessions: stat.sessions,
      hours: parseFloat((stat.totalHours / 3600).toFixed(2)),
    }));

    LoggerUtil.info('Study statistics fetched successfully', { userId, period });

    return ResponseUtil.success(
      res,
      {
        period,
        statistics: formattedStats,
      },
      'Study statistics fetched successfully'
    );
  }
);

/**
 * Get performance analytics
 * GET /api/dashboard/analytics
 */
export const getPerformanceAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;

    LoggerUtil.info('Fetching performance analytics', { userId });

    const [totalSessions, totalTasks, totalGoals, ranking] = await Promise.all([
      studySessionRepository.count({ user: userId, status: 'completed' }),
      taskRepository.count({ userId: userId, completed: true }),
      goalRepository.count({ user: userId, completed: true }),
      rankingRepository.findByUserId(userId!),
    ]);

    const analytics = {
      totalSessions,
      totalTasksCompleted: totalTasks,
      totalGoalsAchieved: totalGoals,
      totalStudyHours: ranking?.totalStudyHours || 0,
      globalRank: ranking?.globalRank || 0,
      rankScore: ranking?.rankScore || 0,
      currentStreak: ranking?.currentStreak || 0,
      longestStreak: ranking?.longestStreak || 0,
    };

    LoggerUtil.info('Performance analytics fetched successfully', { userId });

    return ResponseUtil.success(
      res,
      analytics,
      'Performance analytics fetched successfully'
    );
  }
);

export default {
  getUserDashboard,
  getGroupDashboard,
  getStudyStatistics,
  getPerformanceAnalytics,
};

