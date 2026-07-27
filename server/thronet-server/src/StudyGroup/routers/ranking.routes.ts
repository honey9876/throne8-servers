/**
 * ====================================
 * RANKING ROUTES
 * ====================================
 * Individual user ranking routes only
 */

import express from 'express';
import {
  getMyRank,
  getUserRank,
  recalculateRankings,
  updateMyRanking,
} from '../controllers/ranking.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = express.Router();

// ==========================================
// INDIVIDUAL RANKING ROUTES
// ==========================================

/**
 * @route   GET /api/v1/ranking/my-rank
 * @desc    Get current user's ranking
 * @access  Private
 */
router.get('/my-rank', 
  AuthMiddleware.authenticate as any,
   getMyRank
  );

/**
 * @route   GET /api/v1/ranking/user/:userId
 * @desc    Get specific user's ranking
 * @access  Private
 */
router.get('/user/:userId', 
  AuthMiddleware.authenticate as any,
   getUserRank
  );

/**
 * @route   PUT /api/v1/ranking/update
 * @desc    Update current user's ranking metrics
 * @access  Private
 */
router.put('/update', 
  AuthMiddleware.authenticate as any,
   updateMyRanking
  );

/**
 * @route   POST /api/v1/ranking/recalculate
 * @desc    Recalculate all rankings (Admin only)
 * @access  Private (Admin)
 */
router.post('/recalculate', 
  AuthMiddleware.authenticate as any,
   recalculateRankings
  );

export default router;