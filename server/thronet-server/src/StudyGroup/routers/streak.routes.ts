/**
 * ====================================
 * STREAK ROUTES
 * ====================================
 * Routes for streak tracking
 */

import { Router } from 'express';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import streakController  from '../controllers/streak.controller';

const router = Router();

/**
 * All routes require authentication
 */
router.use(AuthMiddleware.authenticate as any);

/**
 * @route   GET /api/streak/current
 * @desc    Get current streak
 * @access  Private
 */
router.get('/current', 
  streakController.getCurrentStreak
);

/**
 * @route   GET /api/streak/longest
 * @desc    Get longest streak
 * @access  Private
 */
router.get('/longest', 
  streakController.getLongestStreak
);

/**
 * @route   GET /api/streak/history
 * @desc    Get streak history with milestones
 * @access  Private
 */
router.get('/history', 
  streakController.getStreakHistory
);

/**
 * @route   GET /api/streak/leaderboard
 * @desc    Get global streak leaderboard
 * @query   limit: number (default: 100)
 * @access  Private
 */
router.get('/leaderboard', 
  streakController.getGlobalLeaderboard
);

/**
 * @route   GET /api/streak/group-leaderboard/:groupId
 * @desc    Get group streak leaderboard
 * @query   limit: number (default: 50)
 * @access  Private
 */
router.get('/group-leaderboard/:groupId', 
  streakController.getGroupLeaderboard
);

/**
 * @route   POST /api/streak/update
 * @desc    Manually update streak (for testing)
 * @access  Private
 */
router.post('/update', 
  streakController.manualUpdateStreak
);

export default router;