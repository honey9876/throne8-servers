// controllers/streak.controller.ts

import { Request, Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { asyncHandler } from '@/shared/utils/helpers.util';
import ResponseUtil from '@/shared/response.util';
import {
  getUserStreak,
  getStreakStats,
  getStreakLeaderboard,
  getGroupStreakLeaderboard,
  updateStreakAfterActivity,
} from '../services/streak.service';
import streakRepository from '../repositories/streak.repository';
import groupMemberRepository from '../repositories/groupMember.repository';

const MILESTONES = [7, 14, 30, 60, 90, 100, 180, 365];

export const getCurrentStreak = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;  // was: user?.id
  const streak = await getUserStreak(userId!);

  const nextMilestone = MILESTONES.find(m => m > streak.currentStreak);

  return ResponseUtil.success(res, {
    currentStreak: streak.currentStreak,
    startDate: streak.currentStreakStartDate,
    lastActivityDate: streak.lastActivityDate,
    isActive: streak.isActive,
    daysUntilMilestone: nextMilestone ? nextMilestone - streak.currentStreak : null,
    nextMilestone: nextMilestone || null,
  }, 'Current streak retrieved successfully');
});

export const getLongestStreak = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const streak = await getUserStreak(userId!);

  return ResponseUtil.success(res, {
    longestStreak: streak.longestStreak,
    startDate: streak.longestStreakStartDate,
    endDate: streak.longestStreakEndDate,
    isCurrent: streak.currentStreak === streak.longestStreak && streak.currentStreak > 0,
  }, 'Longest streak retrieved successfully');
});

export const getStreakHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const [streak, stats] = await Promise.all([
    getUserStreak(userId!),
    getStreakStats(userId!),
  ]);

  const nextMilestone = MILESTONES.find(m => m > streak.currentStreak);

  return ResponseUtil.success(res, {
    currentStreak: {
      currentStreak: streak.currentStreak,
      startDate: streak.currentStreakStartDate,
      lastActivityDate: streak.lastActivityDate,
      isActive: streak.isActive,
      daysUntilMilestone: nextMilestone ? nextMilestone - streak.currentStreak : null,
      nextMilestone: nextMilestone || null,
    },
    longestStreak: {
      longestStreak: streak.longestStreak,
      startDate: streak.longestStreakStartDate,
      endDate: streak.longestStreakEndDate,
      isCurrent: streak.currentStreak === streak.longestStreak && streak.currentStreak > 0,
    },
    totalStreakBreaks: streak.streakBreaks,
    totalActiveDays: stats.totalActiveDays,
    averageStreakLength: stats.averageStreakLength,
    milestones: streak.milestones.map(m => ({
      days: m.days,
      achievedAt: m.achievedAt,
      title: `${m.days} Day Streak`,
      description: `Maintained ${m.days} consecutive days of activity`,
    })),
  }, 'Streak history retrieved successfully');
});

export const getGlobalLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const limit = Math.min(Number(req.query.limit || 100), 100);

  const [leaderboard, myRank, myStreak, totalUsers] = await Promise.all([
    getStreakLeaderboard(limit),
    streakRepository.getUserRank(userId!),
    getUserStreak(userId!),
    streakRepository.countActiveStreaks(),
  ]);

  const topUsers = leaderboard.map((entry: any, index: number) => ({
    userId: entry.user.id || entry.user,
    userName: entry.user.name,
    userAvatar: entry.user.avatar,
    currentStreak: entry.currentStreak,
    longestStreak: entry.longestStreak,
    rank: index + 1,
    isCurrentUser: (entry.user.id || entry.user) === userId,
  }));

  return ResponseUtil.success(res, {
    topUsers,
    myRank: myRank || null,
    myStreak: myStreak.currentStreak,
    totalUsers,
    lastUpdated: new Date().toISOString(),
  }, 'Streak leaderboard retrieved successfully');
});

export const getGroupLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { groupId } = req.params;
  const limit = Math.min(Number(req.query.limit || 50), 50);

  // Group members fetch karo repository se — was: empty array TODO
  const members = await groupMemberRepository.findByGroupId(groupId);
  const userIds = members.map((m: any) => m.userId);

  const leaderboard = await getGroupStreakLeaderboard(userIds, limit);

  const topUsers = leaderboard.map((entry: any, index: number) => ({
    userId: entry.user.id || entry.user,
    userName: entry.user.name,
    userAvatar: entry.user.avatar,
    currentStreak: entry.currentStreak,
    longestStreak: entry.longestStreak,
    rank: index + 1,
    isCurrentUser: (entry.user.id || entry.user) === userId,
  }));

  const myRank = topUsers.findIndex(u => u.isCurrentUser) + 1;

  return ResponseUtil.success(res, {
    groupId,
    leaderboard: topUsers,
    myRank: myRank || null,
    totalMembers: userIds.length,
  }, 'Group streak leaderboard retrieved successfully');
});

export const manualUpdateStreak = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const streak = await updateStreakAfterActivity(userId!);

  return ResponseUtil.success(res, {
    currentStreak: streak.currentStreak,
    lastActivityDate: streak.lastActivityDate,
    isActive: streak.isActive,
  }, 'Streak updated successfully');
});

export default {
  getCurrentStreak,
  getLongestStreak,
  getStreakHistory,
  getGlobalLeaderboard,
  getGroupLeaderboard,
  manualUpdateStreak,
};



// /**
//  * ====================================
//  * STREAK CONTROLLER
//  * ====================================
//  * HTTP handlers for streak tracking
//  */

// import { Request, Response } from 'express';
// import ResponseUtil from '@/shared/response.util';
// import { asyncHandler } from '@/shared/utils/helpers.util';
// import {
//   getUserStreak,
//   getStreakStats,
//   getStreakLeaderboard,
//   updateStreakAfterActivity,
// } from '../services/streak.service';
// import Streak from '../models/Streak.model';
// import { AuthRequest } from '@/shared/middlewares/auth.middleware';

// /**
//  * @route   GET /api/streak/current
//  * @desc    Get current streak
//  * @access  Private
//  */
// export const getCurrentStreak = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const streak = await getUserStreak(userId!);

//     const milestones = [7, 14, 30, 60, 90, 100, 180, 365];
//     const nextMilestone = milestones.find((m) => m > streak.currentStreak);
//     const daysUntilMilestone = nextMilestone
//       ? nextMilestone - streak.currentStreak
//       : null;

//     return ResponseUtil.success(
//       res,
//       {
//         userId: streak.user,
//         currentStreak: streak.currentStreak,
//         startDate: streak.currentStreakStartDate,
//         lastActivityDate: streak.lastActivityDate,
//         isActive: streak.isActive,
//         daysUntilMilestone,
//         nextMilestone,
//       },
//       'Current streak retrieved successfully'
//     );
//   }
// );

// /**
//  * @route   GET /api/streak/longest
//  * @desc    Get longest streak
//  * @access  Private
//  */
// export const getLongestStreak = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const streak = await getUserStreak(userId!);

//     return ResponseUtil.success(
//       res,
//       {
//         longestStreak: streak.longestStreak,
//         startDate: streak.longestStreakStartDate,
//         endDate: streak.longestStreakEndDate,
//         achievedAt: streak.longestStreakStartDate,
//         isCurrent: streak.currentStreak === streak.longestStreak,
//       },
//       'Longest streak retrieved successfully'
//     );
//   }
// );

// /**
//  * @route   GET /api/streak/history
//  * @desc    Get streak history
//  * @access  Private
//  */
// export const getStreakHistory = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const streak = await getUserStreak(userId!);
//     const stats = await getStreakStats(userId!);

//     const milestones = [7, 14, 30, 60, 90, 100, 180, 365];
//     const nextMilestone = milestones.find((m) => m > streak.currentStreak);

//     return ResponseUtil.success(
//       res,
//       {
//         currentStreak: {
//           userId: streak.user,
//           currentStreak: streak.currentStreak,
//           startDate: streak.currentStreakStartDate,
//           lastActivityDate: streak.lastActivityDate,
//           isActive: streak.isActive,
//           daysUntilMilestone: nextMilestone
//             ? nextMilestone - streak.currentStreak
//             : null,
//           nextMilestone,
//         },
//         longestStreak: {
//           longestStreak: streak.longestStreak,
//           startDate: streak.longestStreakStartDate,
//           endDate: streak.longestStreakEndDate,
//           achievedAt: streak.longestStreakStartDate,
//           isCurrent: streak.currentStreak === streak.longestStreak,
//         },
//         totalStreakBreaks: streak.streakBreaks,
//         totalActiveDays: stats.totalActiveDays,
//         averageStreakLength: stats.averageStreakLength,
//         milestones: streak.milestones.map((m) => ({
//           days: m.days,
//           achievedAt: m.achievedAt,
//           title: `${m.days} Day Streak`,
//           description: `Maintained ${m.days} consecutive days of activity`,
//         })),
//       },
//       'Streak history retrieved successfully'
//     );
//   }
// );

// /**
//  * @route   GET /api/streak/leaderboard
//  * @desc    Get global streak leaderboard
//  * @access  Private
//  */
// export const getGlobalLeaderboard = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const { limit = '100' } = req.query;

//     const leaderboard = await getStreakLeaderboard(Number(limit));

//     // Find user's rank
//     const userStreak = await getUserStreak(userId!);
//     const allStreaks = await Streak.find({ isActive: true })
//       .sort({ currentStreak: -1, longestStreak: -1 })
//       .select('user currentStreak')
//       .lean();

//     const myRank =
//       allStreaks.findIndex(
//         (s) => s.user.toString() === userId!.toString()
//       ) + 1;

//     const topUsers = leaderboard.map((entry: any, index: number) => ({
//       userId: entry.user._id,
//       userName: entry.user.name,
//       userAvatar: entry.user.avatar,
//       currentStreak: entry.currentStreak,
//       longestStreak: entry.longestStreak,
//       rank: index + 1,
//       isCurrentUser: entry.user._id.toString() === userId!.toString(),
//     }));

//     return ResponseUtil.success(
//       res,
//       {
//         topUsers,
//         myRank: myRank || null,
//         myStreak: userStreak.currentStreak,
//         totalUsers: allStreaks.length,
//         lastUpdated: new Date().toISOString(),
//       },
//       'Streak leaderboard retrieved successfully'
//     );
//   }
// );

// /**
//  * @route   GET /api/streak/group-leaderboard/:groupId
//  * @desc    Get group streak leaderboard
//  * @access  Private
//  */
// export const getGroupLeaderboard = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const { groupId } = req.params;
//     const { limit = '50' } = req.query;

//     // TODO: Get group members from GroupMember model
//     // For now, returning empty array
//     const groupMembers: any[] = [];

//     const userIds = groupMembers.map((m: any) => m.user);

//     const leaderboard = await Streak.find({
//       user: { $in: userIds },
//       isActive: true,
//     })
//       .sort({ currentStreak: -1, longestStreak: -1 })
//       .limit(Number(limit))
//       .populate('user', 'name email avatar')
//       .lean();

//     const myRank =
//       leaderboard.findIndex(
//         (s: any) => s.user._id.toString() === userId?.toString()
//       ) + 1;

//     const topUsers = leaderboard.map((entry: any, index: number) => ({
//       userId: entry.user._id,
//       userName: entry.user.name,
//       userAvatar: entry.user.avatar,
//       currentStreak: entry.currentStreak,
//       longestStreak: entry.longestStreak,
//       rank: index + 1,
//       isCurrentUser: entry.user._id.toString() === userId?.toString(),
//     }));

//     return ResponseUtil.success(
//       res,
//       {
//         groupId,
//         leaderboard: topUsers,
//         myRank: myRank || null,
//         totalMembers: userIds.length,
//       },
//       'Group streak leaderboard retrieved successfully'
//     );
//   }
// );

// /**
//  * @route   POST /api/streak/update
//  * @desc    Manually update streak (for testing)
//  * @access  Private
//  */
// export const manualUpdateStreak = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const streak = await updateStreakAfterActivity(userId!);

//     return ResponseUtil.success(
//       res,
//       {
//         currentStreak: streak.currentStreak,
//         lastActivityDate: streak.lastActivityDate,
//         isActive: streak.isActive,
//       },
//       'Streak updated successfully'
//     );
//   }
// );

// export default {
//   getCurrentStreak,
//   getLongestStreak,
//   getStreakHistory,
//   getGlobalLeaderboard,
//   getGroupLeaderboard,
//   manualUpdateStreak,
// };