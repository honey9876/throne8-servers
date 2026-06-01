// controllers/progress.controller.ts  (ya index.ts mein export karo)

import { Request, Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { asyncHandler } from '@/shared/utils/helpers.util';
import ResponseUtil from '@/shared/response.util';
import progressService from '../services/progress.service';

export const getDailyProgress = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;  // was: user?.id
  const result = await progressService.getDailyProgress(userId!);
  return ResponseUtil.success(res, result, 'Daily progress retrieved successfully');
});

export const getWeeklyProgress = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const result = await progressService.getWeeklyProgress(userId!);
  return ResponseUtil.success(res, result, 'Weekly progress retrieved successfully');
});

export const getTotalProgress = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const result = await progressService.getTotalProgress(userId!);
  return ResponseUtil.success(res, result, 'Total progress retrieved successfully');
});

export const getGraphData = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { period = '7days' } = req.query;
  const result = await progressService.getGraphData(userId!, period as string);
  return ResponseUtil.success(res, result, 'Graph data retrieved successfully');
});

export default { getDailyProgress, getWeeklyProgress, getTotalProgress, getGraphData };

// /**
//  * ====================================
//  * PROGRESS CONTROLLER
//  * ====================================
//  * HTTP handlers for progress tracking
//  */

// import { Request, Response } from 'express';
// import { AuthRequest } from '@/shared/middlewares/auth.middleware';
// import Progress from '../models/Progress.model';
// import StudySession from '../models/StudySession.model';
// import Task from '../models/Task.model';
// import Goal from '../models/Goal.model';
// import ResponseUtil from '@/shared/response.util';
// import { asyncHandler } from '@/shared/utils/helpers.util';
// import { getStartOfDay, getEndOfDay, getStartOfWeek, getEndOfWeek, formatDate } from '../utils/dateHelper';
// import { SessionStatus } from '../interfaces/IStudySession';
// import { TaskStatus } from '../enums/TaskStatus.enum';

// /**
//  * @route   GET /api/progress/daily
//  * @desc    Get today's progress
//  * @access  Private
//  */
// export const getDailyProgress = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const today = new Date();
//     const startOfDay = getStartOfDay(today);
//     const endOfDay = getEndOfDay(today);

//     // Get today's completed sessions
//     const sessions = await StudySession.find({
//       user: userId,
//       status: SessionStatus.COMPLETED,
//       createdAt: { $gte: startOfDay, $lte: endOfDay },
//     });

//     const totalStudyHours = sessions.reduce(
//       (sum, session) => sum + session.durationInHours,
//       0
//     );

//     // Get today's completed tasks
//     const completedTasks = await Task.countDocuments({
//       user: userId,
//       status: TaskStatus.COMPLETED,
//       updatedAt: { $gte: startOfDay, $lte: endOfDay },
//     });

//     // Get today's goal
//     const goal = await Goal.findOne({
//       user: userId,
//       type: 'daily',
//       startDate: { $lte: endOfDay },
//       endDate: { $gte: startOfDay },
//     });

//     const goalHours = goal?.targetHours || 0;
//     const progress =
//       goalHours > 0
//         ? parseFloat(((totalStudyHours / goalHours) * 100).toFixed(2))
//         : 0;

//     return ResponseUtil.success(
//       res,
//       {
//         date: formatDate(today),
//         studyHours: parseFloat(totalStudyHours.toFixed(2)),
//         goalHours,
//         progress: Math.min(100, progress),
//         sessionsCompleted: sessions.length,
//         tasksCompleted: completedTasks,
//         isGoalAchieved: totalStudyHours >= goalHours,
//       },
//       'Daily progress retrieved successfully'
//     );
//   }
// );

// /**
//  * @route   GET /api/progress/weekly
//  * @desc    Get this week's progress
//  * @access  Private
//  */
// export const getWeeklyProgress = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const today = new Date();
//     const weekStart = getStartOfWeek(today);
//     const weekEnd = getEndOfWeek(today);

//     // Get this week's completed sessions
//     const sessions = await StudySession.find({
//       user: userId,
//       status: SessionStatus.COMPLETED,
//       createdAt: { $gte: weekStart, $lte: weekEnd },
//     });

//     const totalStudyHours = sessions.reduce(
//       (sum, session) => sum + session.durationInHours,
//       0
//     );

//     // Get weekly goal
//     const goal = await Goal.findOne({
//       user: userId,
//       type: 'weekly',
//       startDate: { $lte: weekEnd },
//       endDate: { $gte: weekStart },
//     });

//     const goalHours = goal?.targetHours || 0;
//     const progress =
//       goalHours > 0
//         ? parseFloat(((totalStudyHours / goalHours) * 100).toFixed(2))
//         : 0;

//     // Daily breakdown
//     const dailyBreakdown = [];
//     for (let i = 0; i < 7; i++) {
//       const date = new Date(weekStart);
//       date.setDate(date.getDate() + i);
//       const dayStart = getStartOfDay(date);
//       const dayEnd = getEndOfDay(date);

//       const daySessions = sessions.filter((s) => {
//         const sessionDate = new Date(s.createdAt);
//         return sessionDate >= dayStart && sessionDate <= dayEnd;
//       });

//       const dayHours = daySessions.reduce(
//         (sum, session) => sum + session.durationInHours,
//         0
//       );

//       dailyBreakdown.push({
//         date: formatDate(date),
//         day: date.toLocaleDateString('en-US', { weekday: 'short' }),
//         studyHours: parseFloat(dayHours.toFixed(2)),
//         goalHours: goalHours / 7,
//         achieved: dayHours >= goalHours / 7,
//       });
//     }

//     // Find best and worst days
//     const sortedDays = [...dailyBreakdown].sort(
//       (a, b) => b.studyHours - a.studyHours
//     );
//     const bestDay = sortedDays[0]?.day || 'N/A';
//     const worstDay = sortedDays[sortedDays.length - 1]?.day || 'N/A';

//     return ResponseUtil.success(
//       res,
//       {
//         weekStartDate: formatDate(weekStart),
//         weekEndDate: formatDate(weekEnd),
//         totalStudyHours: parseFloat(totalStudyHours.toFixed(2)),
//         totalGoalHours: goalHours,
//         progress: Math.min(100, progress),
//         dailyBreakdown,
//         averageDailyHours: parseFloat((totalStudyHours / 7).toFixed(2)),
//         bestDay,
//         worstDay,
//       },
//       'Weekly progress retrieved successfully'
//     );
//   }
// );

// /**
//  * @route   GET /api/progress/total
//  * @desc    Get total lifetime progress
//  * @access  Private
//  */
// export const getTotalProgress = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;

//     // Get progress record
//     let progress = await Progress.findOne({ user: userId });

//     if (!progress) {
//       // Create if doesn't exist
//       progress = await Progress.create({ user: userId });
//     }

//     return ResponseUtil.success(
//       res,
//       {
//         totalStudyHours: parseFloat(progress.totalStudyHours.toFixed(2)),
//         totalSessions: progress.totalSessions,
//         averageSessionDuration: parseFloat(
//           progress.averageSessionDuration.toFixed(2)
//         ),
//         studyDaysCount: progress.studyDaysCount,
//         consecutiveStudyDays: progress.consecutiveStudyDays,
//         completionRate: progress.completionRate,
//         consistencyScore: progress.consistency,
//         productivityScore: progress.productivity,
//       },
//       'Total progress retrieved successfully'
//     );
//   }
// );

// /**
//  * @route   GET /api/progress/graph-data
//  * @desc    Get graph data for charts
//  * @access  Private
//  */
// export const getGraphData = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const { period = '7days' } = req.query;

//     let days = 7;
//     if (period === '30days') days = 30;
//     else if (period === '3months') days = 90;
//     else if (period === '6months') days = 180;
//     else if (period === '1year') days = 365;

//     const endDate = new Date();
//     const startDate = new Date();
//     startDate.setDate(startDate.getDate() - days);

//     const sessions = await StudySession.find({
//       user: userId,
//       status: SessionStatus.COMPLETED,
//       createdAt: { $gte: startDate, $lte: endDate },
//     });

//     const graphData = [];
//     let totalStudyHours = 0;
//     let peakHours = 0;
//     let peakDay = '';

//     for (let i = 0; i < days; i++) {
//       const date = new Date(startDate);
//       date.setDate(date.getDate() + i);
//       const dayStart = getStartOfDay(date);
//       const dayEnd = getEndOfDay(date);

//       const daySessions = sessions.filter((s) => {
//         const sessionDate = new Date(s.createdAt);
//         return sessionDate >= dayStart && sessionDate <= dayEnd;
//       });

//       const dayHours = daySessions.reduce(
//         (sum, session) => sum + session.durationInHours,
//         0
//       );

//       totalStudyHours += dayHours;

//       if (dayHours > peakHours) {
//         peakHours = dayHours;
//         peakDay = formatDate(date);
//       }

//       graphData.push({
//         date: formatDate(date),
//         studyHours: parseFloat(dayHours.toFixed(2)),
//         goalHours: 0, // Can be added later
//         sessionsCompleted: daySessions.length,
//       });
//     }

//     return ResponseUtil.success(
//       res,
//       {
//         period,
//         startDate: formatDate(startDate),
//         endDate: formatDate(endDate),
//         data: graphData,
//         totalStudyHours: parseFloat(totalStudyHours.toFixed(2)),
//         averageDailyHours: parseFloat((totalStudyHours / days).toFixed(2)),
//         peakDay,
//         peakHours: parseFloat(peakHours.toFixed(2)),
//       },
//       'Graph data retrieved successfully'
//     );
//   }
// );

// export default {
//   getDailyProgress,
//   getWeeklyProgress,
//   getTotalProgress,
//   getGraphData,
// };