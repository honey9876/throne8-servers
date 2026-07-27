/**
 * ====================================
 * PROGRESS ROUTES
 * ====================================
 * Routes for progress tracking
 */

import { Router } from 'express';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import {
  getDailyProgress,
  getWeeklyProgress,
  getTotalProgress,
  getGraphData,
} from '../controllers/progress.controller';

const router = Router();

/**
 * All routes require authentication
 */
router.use(AuthMiddleware.authenticate as any);

/**
 * @route   GET /api/progress/daily
 * @desc    Get today's progress
 * @access  Private
 */
router.get('/daily', getDailyProgress);

/**
 * @route   GET /api/progress/weekly
 * @desc    Get this week's progress
 * @access  Private
 */
router.get('/weekly', getWeeklyProgress);

/**
 * @route   GET /api/progress/total
 * @desc    Get total lifetime progress
 * @access  Private
 */
router.get('/total', getTotalProgress);

/**
 * @route   GET /api/progress/graph-data
 * @desc    Get graph data for charts
 * @query   period: 7days | 30days | 3months | 6months | 1year
 * @access  Private
 */
router.get('/graph-data', getGraphData);

export default router;