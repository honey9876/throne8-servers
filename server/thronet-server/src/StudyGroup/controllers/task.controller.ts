// controllers/task.controller.ts

import { Request, Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { asyncHandler } from '@/shared/utils/helpers.util';
import ResponseUtil from '@/shared/response.util';
import taskService from '../services/task.service';
import { LoggerUtil } from '@/shared/logger.util';

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;  // was: user?.id
  const task = await taskService.createTask(userId!, req.body);
  return ResponseUtil.created(res, task, 'Task created successfully');
});

export const getAllTasks = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const result = await taskService.getAllTasks(userId!, req.query);
  return ResponseUtil.success(res, result, 'Tasks retrieved successfully');
});

export const getTaskById = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const task = await taskService.getTaskById(req.params.taskId, userId!);
  return ResponseUtil.success(res, task, 'Task retrieved successfully');
});

export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const task = await taskService.updateTask(req.params.taskId, userId!, req.body);
  return ResponseUtil.success(res, task, 'Task updated successfully');
});

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  await taskService.deleteTask(req.params.taskId, userId!);
  return ResponseUtil.noContent(res);
});

export const markTaskComplete = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const task = await taskService.markTaskComplete(req.params.taskId, userId!);
  return ResponseUtil.success(res, task, 'Task marked as completed');
});

export const markTaskIncomplete = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const task = await taskService.markTaskIncomplete(req.params.taskId, userId!);
  return ResponseUtil.success(res, task, 'Task marked as incomplete');
});

export const getOverdueTasks = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const tasks = await taskService.getOverdueTasks(userId!);
  return ResponseUtil.success(res, tasks, `Found ${tasks.length} overdue tasks`);
});

export const getUpcomingTasks = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const days = Math.min(parseInt(req.query.days as string, 10) || 7, 30);
  const tasks = await taskService.getUpcomingTasks(userId!, days);
  return ResponseUtil.success(res, tasks, `Found ${tasks.length} upcoming tasks`);
});

export const getTaskStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const stats = await taskService.getTaskStats(userId!);
  return ResponseUtil.success(res, stats, 'Task statistics retrieved successfully');
});

export default {
  createTask, getAllTasks, getTaskById, updateTask, deleteTask,
  markTaskComplete, markTaskIncomplete, getOverdueTasks,
  getUpcomingTasks, getTaskStats,
};

