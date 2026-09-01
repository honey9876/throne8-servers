/**
 * ====================================
 * MOTIVATION ROUTES
 * ====================================
 * Routes for badge system and motivational features
 */

import { Router } from 'express';
import {motivationController } from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = Router();

/**
 * ========================================
 * BADGE ROUTES
 * ========================================
 */

/**
 * GET /api/motivation/badges
 * Get all available badges
 * @access Public
 */
router.get('/badges', motivationController.getAllBadges);

/**
 * GET /api/motivation/badges/category/:category
 * Get badges by category
 * @access Public
 */
router.get('/badges/category/:category', motivationController.getBadgesByCategory);

/**
 * GET /api/motivation/my-badges
 * Get user's earned badges
 * @access Private
 */
router.get('/my-badges', AuthMiddleware.authenticate as any, motivationController.getUserBadges);

/**
 * GET /api/motivation/badge-progress
 * Get badge progress for current user
 * @access Private
 */
router.get('/badge-progress', AuthMiddleware.authenticate as any, motivationController.getBadgeProgress);

/**
 * POST /api/motivation/check-badges
 * Check and award badges to user
 * @access Private
 */
router.post('/check-badges', AuthMiddleware.authenticate as any, motivationController.checkAndAwardBadges);

/**
 * ========================================
 * MOTIVATIONAL ROUTES
 * ========================================
 */

/**
 * GET /api/motivation/quote
 * Get random motivational quote
 * @access Public
 */
router.get('/quote', motivationController.getMotivationalQuote);

/**
 * GET /api/motivation/achievements
 * Get user achievements summary
 * @access Private
 */
router.get('/achievements', AuthMiddleware.authenticate as any, motivationController.getAchievementsSummary);

export default router;