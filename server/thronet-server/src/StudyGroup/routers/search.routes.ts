/**
 * ====================================
 * SEARCH ROUTES
 * ====================================
 * Routes for group search and filtering
 */

import { Router } from 'express';
import {
  searchGroups,
  getPopularGroups,
  getTrendingGroups,
  getRecommendedGroups,
  getGroupsByCategory,
  getAvailableGroups,
  searchGroupsByTags,
} from '../controllers/search.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = Router();

router.use(AuthMiddleware.authenticateOptional as any)

/**
 * @route   GET /api/search/groups
 * @desc    Search groups with filters
 * @access  Public
 * @params  ?search=text&category=JEE&visibility=public&tags=physics&hasSpace=true&minHours=5&maxHours=10&sort=newest&page=1&limit=10
 */
router.get('/groups', searchGroups);

/**
 * @route   GET /api/search/groups/popular
 * @desc    Get popular groups (most members)
 * @access  Public
 * @params  ?limit=10
 */
router.get('/groups/popular', getPopularGroups);

/**
 * @route   GET /api/search/groups/trending
 * @desc    Get trending groups (recently active)
 * @access  Public
 * @params  ?limit=10
 */
router.get('/groups/trending', getTrendingGroups);

/**
 * @route   GET /api/search/groups/recommended
 * @desc    Get recommended groups
 * @access  Public (better with auth for personalized results)
 * @params  ?category=JEE&limit=10
 */
router.get('/groups/recommended', getRecommendedGroups);

/**
 * @route   GET /api/search/groups/category/:category
 * @desc    Get groups by category
 * @access  Public
 * @params  :category (JEE/NEET/College/Working/Other)
 */
router.get(
  '/groups/category/:category',
   getGroupsByCategory);

/**
 * @route   GET /api/search/groups/available
 * @desc    Get groups with available space
 * @access  Public
 * @params  ?page=1&limit=10
 */
router.get('/groups/available', getAvailableGroups);

/**
 * @route   GET /api/search/groups/tags
 * @desc    Search groups by tags
 * @access  Public
 * @params  ?tags=physics&tags=chemistry&page=1&limit=10
 */
router.get('/groups/tags', searchGroupsByTags);

export default router;