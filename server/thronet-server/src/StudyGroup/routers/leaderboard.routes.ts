// routes/leaderboard.routes.ts

import express from 'express';
import {
  getGlobalLeaderboard,
  getCategoryLeaderboard,
  getGroupLeaderboard,
  getWeeklyLeaderboard,
  getMonthlyLeaderboard,
} from '../controllers/ranking.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = express.Router();

/**
 * @route   GET /api/v1/leaderboard/global
 * @desc    Get global leaderboard
 * @access  Public (optional auth — logged in users ko currentUser entry milti hai)
 */
router.get('/global',
  // AuthMiddleware.optionalAuthenticate as any,  // was: no auth — userId undefined tha
  getGlobalLeaderboard
);

/**
 * @route   GET /api/v1/leaderboard/category/:category
 * @access  Public (optional auth)
 */
router.get('/category/:category',
  // AuthMiddleware.optionalAuthenticate as any,
  getCategoryLeaderboard
);

/**
 * @route   GET /api/v1/leaderboard/group/:groupId
 * @access  Private
 */
router.get('/group/:groupId',
  AuthMiddleware.authenticate as any,
  getGroupLeaderboard
);

/**
 * @route   GET /api/v1/leaderboard/weekly
 * @access  Public (optional auth)
 */
router.get('/weekly',
  // AuthMiddleware.optionalAuthenticate as any,
  getWeeklyLeaderboard
);

/**
 * @route   GET /api/v1/leaderboard/monthly
 * @access  Public (optional auth)
 */
router.get('/monthly',
  // AuthMiddleware.optionalAuthenticate as any,
  getMonthlyLeaderboard
);

export default router;
