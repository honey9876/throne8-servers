// controllers/goal.controller.ts

import { Request, Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { asyncHandler } from '@/shared/utils/helpers.util';
import ResponseUtil from '@/shared/response.util';
import goalService from '../services/goal.service';
import { LoggerUtil } from '@/shared/logger.util';

export const createGoal = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;  // was: user?.id
  const goal = await goalService.createGoal(userId!, req.body);
  LoggerUtil.info('data retrived in goal controller from service', goal)
  return ResponseUtil.created(res, goal, 'Goal created successfully');
});

export const getAllGoals = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const result = await goalService.getAllGoals(userId!, req.query);
  LoggerUtil.info('data retrived in goal controller from service', result)
  return ResponseUtil.success(res, result, 'Goals retrieved successfully');
});

export const getGoalById = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const goal = await goalService.getGoalById(req.params.goalId, userId!);
  LoggerUtil.info('data retrived in goal controller from service', goal)
  return ResponseUtil.success(res, goal, 'Goal retrieved successfully');
});

export const updateGoal = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const goal = await goalService.updateGoal(req.params.goalId, userId!, req.body);
  LoggerUtil.info('data retrived in goal controller from service', goal)
  return ResponseUtil.success(res, goal, 'Goal updated successfully');
});

export const deleteGoal = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  await goalService.deleteGoal(req.params.goalId, userId!);
  LoggerUtil.info('data delete in goal controller from service')
  return ResponseUtil.noContent(res);
});

export const updateGoalProgress = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { hoursToAdd } = req.body;
  const goal = await goalService.updateGoalProgress(req.params.goalId, userId!, hoursToAdd);
  LoggerUtil.info('data retrived in goal controller from service', goal)
  return ResponseUtil.success(res, goal, 'Goal progress updated successfully');
});

export const markGoalComplete = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const goal = await goalService.markGoalComplete(req.params.goalId, userId!);
  LoggerUtil.info('data retrived in goal controller from service', goal)
  return ResponseUtil.success(res, goal, 'Goal marked as completed');
});

export const markGoalIncomplete = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const goal = await goalService.markGoalIncomplete(req.params.goalId, userId!);
  LoggerUtil.info('data retrived in goal controller from service',goal)
  return ResponseUtil.success(res, goal, 'Goal marked as incomplete');
});

export const getActiveGoals = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const goals = await goalService.getActiveGoals(userId!);
  LoggerUtil.info('data retrived in goal controller from service', goals)
  return ResponseUtil.success(res, goals, `Found ${goals.length} active goals`);
});

export const getUpcomingGoals = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const goals = await goalService.getUpcomingGoals(userId!);
  LoggerUtil.info('data retrived in goal controller from service', goals)
  return ResponseUtil.success(res, goals, `Found ${goals.length} upcoming goals`);
});

export const getGoalStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const stats = await goalService.getGoalStats(userId!);
  LoggerUtil.info('data retrived in goal controller from service',stats)
  return ResponseUtil.success(res, stats, 'Goal statistics retrieved successfully');
});

export default {
  createGoal, getAllGoals, getGoalById, updateGoal, deleteGoal,
  updateGoalProgress, markGoalComplete, markGoalIncomplete,
  getActiveGoals, getUpcomingGoals, getGoalStats,
};
