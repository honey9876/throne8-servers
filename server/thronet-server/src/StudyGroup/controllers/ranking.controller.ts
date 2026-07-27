// controllers/ranking.controller.ts

import { Request, Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { asyncHandler } from '@/shared/utils/helpers.util';
import { AuthenticationError, NotFoundError } from '@/shared/errors/app.error';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import { GroupCategory } from '../enums/GroupCategory.enum';
import rankingService from '../services/ranking.service';
import rankingRepository from '../repositories/ranking.repository';
import groupRepository from '../repositories/group.repository';

export const getMyRank = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;  // was: user?.id
  if (!userId) throw new AuthenticationError('User not authenticated');

  // getOrCreate + update metrics
  await rankingService.getOrCreateRanking(userId);
  await rankingService.updateRankingMetrics(userId);

  const ranking = await rankingRepository.findByUserIdWithPopulate(userId);
  if (!ranking) throw new NotFoundError('Ranking not found');

  const [totalUsers, totalInCategory, nearbyRanks] = await Promise.all([
    rankingRepository.count({ globalRank: { $gt: 0 } }),
    rankingRepository.count({ category: ranking.category, categoryRank: { $gt: 0 } }),
    rankingService.getNearbyRanks(userId),
  ]);

  const totalInCity = ranking.city
    ? await rankingRepository.count({ city: ranking.city, cityRank: { $gt: 0 } })
    : 0;

  const percentile = ranking.globalRank > 0
    ? parseFloat(((1 - ranking.globalRank / totalUsers) * 100).toFixed(2))
    : 0;

  return ResponseUtil.success(res, {
    globalRank: ranking.globalRank,
    categoryRank: ranking.categoryRank,
    groupRank: ranking.groupRank,
    cityRank: ranking.cityRank,
    totalUsers, totalInCategory, totalInCity,
    percentile,
    rankScore: ranking.rankScore,
    metrics: {
      studyHours: ranking.totalStudyHours,
      attendance: ranking.attendancePercentage,
      streak: ranking.currentStreak,
    },
    nearbyRanks,
    lastUpdated: ranking.lastUpdated,
  }, 'Your ranking retrieved successfully');
});

export const getUserRank = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;   // UUID string — no ObjectId check

  const ranking = await rankingRepository.findByUserIdWithPopulate(userId);
  if (!ranking) return ResponseUtil.notFound(res, 'Ranking not found for this user');

  const user = ranking.userId as any;
  const totalUsers = await rankingRepository.count({ globalRank: { $gt: 0 } });
  const totalInCategory = await rankingRepository.count({
    category: ranking.category,
    categoryRank: { $gt: 0 },
  });

  const percentile = ranking.globalRank > 0
    ? parseFloat(((1 - ranking.globalRank / totalUsers) * 100).toFixed(2))
    : 0;

  return ResponseUtil.success(res, {
    user: {
      id: user.id || userId,
      name: user.name,
      avatar: user.avatar,
    },
    globalRank: ranking.globalRank,
    categoryRank: ranking.categoryRank,
    groupRank: ranking.groupRank,
    cityRank: ranking.cityRank,
    totalUsers, totalInCategory,
    percentile,
    rankScore: ranking.rankScore,
    metrics: {
      studyHours: ranking.totalStudyHours,
      attendance: ranking.attendancePercentage,
      streak: ranking.currentStreak,
      longestStreak: ranking.longestStreak,
    },
    category: ranking.category,
    city: ranking.city,
    lastUpdated: ranking.lastUpdated,
  }, 'User ranking retrieved successfully');
});

export const updateMyRanking = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  if (!userId) return ResponseUtil.error(res, 'User not authenticated', 401);

  const ranking = await rankingService.updateRankingMetrics(userId);
  return ResponseUtil.success(res, ranking, 'Your ranking updated successfully');
});

export const recalculateRankings = asyncHandler(async (_req: Request, res: Response) => {
  LoggerUtil.info('Starting ranking recalculation...');
  const result = await rankingService.recalculateAllRankings();
  return ResponseUtil.success(res, result, 'Rankings recalculated successfully');
});

// Leaderboard controllers
export const getGlobalLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);

  const leaderboardData = await rankingService.getGlobalLeaderboard(page, limit);

  let currentUserEntry = undefined;
  if (userId) {
    const userRanking = await rankingRepository.findByUserId(userId);
    if (userRanking && userRanking.globalRank > 0) {
      currentUserEntry = { rank: userRanking.globalRank, userId, score: userRanking.rankScore };
    }
  }

  return ResponseUtil.success(res, {
    ...leaderboardData,
    currentUser: currentUserEntry,
  }, 'Global leaderboard retrieved successfully');
});

export const getCategoryLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { category } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);

  if (!Object.values(GroupCategory).includes(category as GroupCategory)) {
    return ResponseUtil.badRequest(res, 'Invalid category');
  }

  const leaderboardData = await rankingService.getCategoryLeaderboard(
    category as GroupCategory, page, limit
  );

  let currentUserEntry = undefined;
  if (userId) {
    const userRanking = await rankingRepository.findByUserId(userId);
    if (userRanking && userRanking.categoryRank > 0 && userRanking.category === category) {
      currentUserEntry = { rank: userRanking.categoryRank, userId, score: userRanking.rankScore };
    }
  }

  return ResponseUtil.success(res, {
    ...leaderboardData,
    category,
    currentUser: currentUserEntry,
  }, `${category} leaderboard retrieved successfully`);
});

export const getGroupLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { groupId } = req.params;    // UUID string
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);

  // Group exists check
  const group = await groupRepository.findByGroupId(groupId);
  if (!group) return ResponseUtil.notFound(res, 'Group not found');

  const data = await rankingService.getGroupLeaderboard(groupId, page, limit);

  // Current user rank in group
  const myRank = data.leaderboard.findIndex((u: any) => u.userId === userId) + 1;

  return ResponseUtil.success(res, {
    ...data,
    group: { id: group.groupId, name: group.title, avatar: group.avatar },
    currentUser: myRank ? { rank: myRank } : null,
    lastUpdated: new Date(),
  }, 'Group leaderboard retrieved successfully');
});

export const getWeeklyLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);
  const result = await rankingService.getWeeklyLeaderboard(page, limit);
  return ResponseUtil.success(res, result, 'Weekly leaderboard retrieved successfully');
});

export const getMonthlyLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);
  const result = await rankingService.getMonthlyLeaderboard(page, limit);
  return ResponseUtil.success(res, result, 'Monthly leaderboard retrieved successfully');
});

export default {
  getMyRank, getUserRank, updateMyRanking, recalculateRankings,
  getGlobalLeaderboard, getCategoryLeaderboard, getGroupLeaderboard,
  getWeeklyLeaderboard, getMonthlyLeaderboard,
};
