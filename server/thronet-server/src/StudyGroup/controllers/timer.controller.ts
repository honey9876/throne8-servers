// controllers/timer.controller.ts

import { Request, Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { asyncHandler } from '@/shared/utils/helpers.util';
import ResponseUtil from '@/shared/response.util';
import timerService from '../services/timer.service';

export const startTimer = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;  // was: user?.id
  const result = await timerService.startTimer(userId!, req.body);
  return ResponseUtil.created(res, result, 'Timer started successfully');
});

export const pauseTimer = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const result = await timerService.pauseTimer(userId!);
  return ResponseUtil.success(res, result, 'Timer paused successfully');
});

export const resumeTimer = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const result = await timerService.resumeTimer(userId!);
  return ResponseUtil.success(res, result, 'Timer resumed successfully');
});

export const stopTimer = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { notes } = req.body;
  const result = await timerService.stopTimer(userId!, notes);
  return ResponseUtil.success(res, result, 'Timer stopped and session saved successfully');
});

export const cancelTimer = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  await timerService.cancelTimer(userId!);
  return ResponseUtil.success(res, null, 'Timer cancelled successfully');
});

export const getActiveTimer = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const result = await timerService.getActiveTimer(userId!);
  return ResponseUtil.success(res, result, result ? 'Active timer retrieved successfully' : 'No active timer');
});

export const getAllSessions = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const result = await timerService.getAllSessions(userId!, req.query);
  return ResponseUtil.success(res, result, 'Sessions retrieved successfully');
});

export const getSessionById = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const session = await timerService.getSessionById(req.params.sessionId, userId!);
  return ResponseUtil.success(res, session, 'Session retrieved successfully');
});

export const getTodaySessions = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const result = await timerService.getTodaySessions(userId!);
  return ResponseUtil.success(res, result, "Today's sessions retrieved successfully");
});

export const getSessionStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const stats = await timerService.getSessionStats(userId!);
  return ResponseUtil.success(res, stats, 'Session statistics retrieved successfully');
});

export const deleteSession = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  await timerService.deleteSession(req.params.sessionId, userId!);
  return ResponseUtil.success(res, null, 'Session deleted successfully');
});

export default {
  startTimer, pauseTimer, resumeTimer, stopTimer, cancelTimer,
  getActiveTimer, getAllSessions, getSessionById,
  getTodaySessions, getSessionStats, deleteSession,
};

