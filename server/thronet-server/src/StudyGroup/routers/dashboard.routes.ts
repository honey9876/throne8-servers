/**
 * ====================================
 * DASHBOARD ROUTES
 * ====================================
 * User and group dashboard statistics
 * Secure, scalable, production-ready
 */

import express from 'express';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import dashboardController from '../controllers/dashboard.controller';

const router = express.Router();

/**
 * ============================================
 * AUTHENTICATION MIDDLEWARE
 * All dashboard routes require authentication
 * ============================================
 */
router.use(AuthMiddleware.authenticate as any);

/**
 * ============================================
 * USER DASHBOARD
 * ============================================
 */

/**
 * Get user dashboard overview
 * GET /api/dashboard/user
 * 
 * Returns:
 * - User profile summary
 * - Global rank and rank score
 * - Current streak and longest streak
 * - Active groups count
 * - Today's study hours
 * - Active tasks and goals count
 * 
 * @requires Authentication
 * @response {200} Success - Dashboard data
 * @response {401} Unauthorized - Invalid/missing token
 * @response {404} Not Found - User not found
 */
router.get('/user', dashboardController.getUserDashboard);

/**
 * ============================================
 * GROUP DASHBOARD
 * ============================================
 */

/**
 * Get group dashboard statistics
 * GET /api/dashboard/group/:groupId
 * 
 * Returns:
 * - Group profile summary
 * - Total members and active members today
 * - Total study hours and today's study hours
 * - Active and completed tasks count
 * 
 * @param {string} groupId - MongoDB ObjectId of the group
 * @requires Authentication & Group membership
 * @response {200} Success - Group dashboard data
 * @response {401} Unauthorized - Invalid/missing token
 * @response {404} Not Found - Group not found or not a member
 */
router.get('/group/:groupId', dashboardController.getGroupDashboard);

/**
 * ============================================
 * STUDY STATISTICS
 * ============================================
 */

/**
 * Get study statistics over time
 * GET /api/dashboard/statistics?period=7days
 * 
 * Query Parameters:
 * - period: '7days' | '30days' | '90days' (default: '7days')
 * 
 * Returns:
 * - Day-wise breakdown of study sessions
 * - Total sessions per day
 * - Total hours studied per day
 * 
 * @requires Authentication
 * @response {200} Success - Study statistics data
 * @response {401} Unauthorized - Invalid/missing token
 */
router.get('/statistics', dashboardController.getStudyStatistics);

/**
 * ============================================
 * PERFORMANCE ANALYTICS
 * ============================================
 */

/**
 * Get performance analytics
 * GET /api/dashboard/analytics
 * 
 * Returns:
 * - Total study sessions completed
 * - Total tasks completed
 * - Total goals achieved
 * - Total study hours (lifetime)
 * - Global rank and rank score
 * 
 * @requires Authentication
 * @response {200} Success - Performance analytics data
 * @response {401} Unauthorized - Invalid/missing token
 */
router.get('/analytics', dashboardController.getPerformanceAnalytics);

export default router;