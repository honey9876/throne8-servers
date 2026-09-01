// routes/leaderboard.routes.ts

import express from 'express';
import {
  getGlobalLeaderboard,
  getCategoryLeaderboard,
  getGroupLeaderboard,
  getWeeklyLeaderboard,
  getMonthlyLeaderboard,
} from '../controllers';
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


// /**
//  * ====================================
//  * LEADERBOARD ROUTES
//  * ====================================
//  * All routes for leaderboard endpoints
//  */

// import express from 'express';
// import {
//   getGlobalLeaderboard,
//   getCategoryLeaderboard,
//   getGroupLeaderboard,
//   getWeeklyLeaderboard,
//   getMonthlyLeaderboard,
// } from '../controllers';
// import AuthMiddleware from '@/shared/middlewares/auth.middleware';

// const router = express.Router();

// // ==========================================
// // LEADERBOARD ROUTES
// // ==========================================

// /**
//  * @route   GET /api/v1/leaderboard/global
//  * @desc    Get global leaderboard
//  * @access  Public
//  * @query   ?page=1&limit=100
//  */
// router.get('/global', getGlobalLeaderboard);

// /**
//  * @route   GET /api/v1/leaderboard/category/:category
//  * @desc    Get category-specific leaderboard
//  * @access  Public
//  * @params  category: JEE | NEET | College | Working | Other
//  * @query   ?page=1&limit=100
//  */
// router.get('/category/:category', getCategoryLeaderboard);

// /**
//  * @route   GET /api/v1/leaderboard/group/:groupId
//  * @desc    Get group-specific leaderboard
//  * @access  Private
//  * @params  groupId: MongoDB ObjectId
//  * @query   ?page=1&limit=100
//  */
// router.get('/group/:groupId', AuthMiddleware.authenticate as any, getGroupLeaderboard);

// /**
//  * @route   GET /api/v1/leaderboard/weekly
//  * @desc    Get weekly leaderboard
//  * @access  Public
//  * @query   ?page=1&limit=100
//  */
// router.get('/weekly', getWeeklyLeaderboard);

// /**
//  * @route   GET /api/v1/leaderboard/monthly
//  * @desc    Get monthly leaderboard
//  * @access  Public
//  * @query   ?page=1&limit=100
//  */
// router.get('/monthly', getMonthlyLeaderboard);

// export default router;