/**
 * ====================================
 * ADMIN ROUTES
 * ====================================
 * Admin panel routes for system management
 * Requires admin authentication and role
 * Production-ready with rate limiting and monitoring
 */

import express from 'express';
import adminController from '../controllers/admin.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { isAdmin } from '../middleware/admin.middleware';

const router = express.Router();

/**
 * ============================================
 * AUTHENTICATION MIDDLEWARE
 * All admin routes require authentication + admin role
 * ============================================
 */
router.use(AuthMiddleware.authenticate as any);
router.use(isAdmin);

/**
 * ============================================
 * DASHBOARD ROUTES
 * ============================================
 */

/**
 * Get admin dashboard overview
 * GET /api/admin/dashboard
 * 
 * Returns comprehensive system statistics:
 * - Total users, active users today, new users today
 * - Total groups, active groups, new groups today
 * - Total messages, doubts, files
 * - Total study hours (all-time and today)
 * - Pending reports count
 * - Top 10 users by rank
 * - Top 10 groups by member count
 * 
 * @requires Admin authentication
 * @response {200} Success - Admin dashboard data
 * @response {401} Unauthorized - Invalid/missing token
 * @response {403} Forbidden - Not an admin
 */
router.get('/dashboard', adminController.getAdminDashboard);

/**
 * Get system analytics
 * GET /api/admin/analytics?period=30days
 * 
 * Query Parameters:
 * - period: '7days' | '30days' | '90days' (default: '30days')
 * 
 * Returns growth analytics:
 * - User growth over time
 * - Group growth over time
 * - Message growth over time
 * - Study activity growth (sessions & hours)
 * 
 * @requires Admin authentication
 * @response {200} Success - System analytics data
 * @response {401} Unauthorized - Invalid/missing token
 * @response {403} Forbidden - Not an admin
 */
router.get('/analytics', adminController.getSystemAnalytics);

/**
 * ============================================
 * USER MANAGEMENT ROUTES
 * ============================================
 */

/**
 * Get all users with pagination and filters
 * GET /api/admin/users?page=1&limit=10&search=john&role=student&isActive=true&sort=-createdAt
 * 
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10, max: 100)
 * - search: string (searches name and email)
 * - role: 'student' | 'mentor' | 'admin'
 * - isActive: 'true' | 'false'
 * - sort: string (default: '-createdAt')
 * 
 * @requires Admin authentication
 * @response {200} Success - Paginated users list
 * @response {401} Unauthorized - Invalid/missing token
 * @response {403} Forbidden - Not an admin
 */
router.get('/users', adminController.getAllUsers);

/**
 * Get user details by ID
 * GET /api/admin/users/:userId
 * 
 * Returns detailed user information:
 * - User profile
 * - Ranking stats
 * - Activity stats (groups, doubts, sessions)
 * - Joined groups list
 * 
 * @param {string} userId - MongoDB ObjectId
 * @requires Admin authentication
 * @response {200} Success - User details
 * @response {401} Unauthorized - Invalid/missing token
 * @response {403} Forbidden - Not an admin
 * @response {404} Not Found - User not found
 */
router.get('/users/:userId', adminController.getUserDetails);

/**
 * Update user status (activate/deactivate)
 * PATCH /api/admin/users/:userId/status
 * 
 * Request Body:
 * {
 *   "isActive": boolean
 * }
 * 
 * @param {string} userId - MongoDB ObjectId
 * @requires Admin authentication
 * @response {200} Success - User status updated
 * @response {400} Bad Request - Invalid body
 * @response {401} Unauthorized - Invalid/missing token
 * @response {403} Forbidden - Not an admin
 * @response {404} Not Found - User not found
 */
router.patch('/users/:userId/status', adminController.updateUserStatus);

/**
 * Delete user account (soft delete)
 * DELETE /api/admin/users/:userId
 * 
 * Deactivates user and removes from all groups
 * 
 * @param {string} userId - MongoDB ObjectId
 * @requires Admin authentication
 * @response {200} Success - User deleted
 * @response {401} Unauthorized - Invalid/missing token
 * @response {403} Forbidden - Not an admin
 * @response {404} Not Found - User not found
 */
router.delete('/users/:userId', adminController.deleteUser);

/**
 * ============================================
 * GROUP MANAGEMENT ROUTES
 * ============================================
 */

/**
 * Get all groups with pagination and filters
 * GET /api/admin/groups?page=1&limit=10&search=physics&category=JEE&isActive=true&sort=-createdAt
 * 
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10, max: 100)
 * - search: string (searches title and description)
 * - category: 'JEE' | 'NEET' | 'College' | 'Working' | 'Other'
 * - isActive: 'true' | 'false'
 * - sort: string (default: '-createdAt')
 * 
 * @requires Admin authentication
 * @response {200} Success - Paginated groups list
 * @response {401} Unauthorized - Invalid/missing token
 * @response {403} Forbidden - Not an admin
 */
router.get('/groups', adminController.getAllGroups);

/**
 * ============================================
 * MODERATION ROUTES
 * ============================================
 */

/**
 * Get pending reports
 * GET /api/admin/reports?page=1&limit=10&type=all
 * 
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10, max: 100)
 * - type: 'user' | 'message' | 'all' (default: 'all')
 * 
 * Returns all pending reports with reporter details
 * 
 * @requires Admin authentication
 * @response {200} Success - Paginated reports list
 * @response {401} Unauthorized - Invalid/missing token
 * @response {403} Forbidden - Not an admin
 */
router.get('/reports', adminController.getPendingReports);

/**
 * Resolve report
 * PATCH /api/admin/reports/:groupId/:reportId/resolve
 * 
 * Request Body:
 * {
 *   "type": "user" | "message",
 *   "action": "resolved" | "dismissed"
 * }
 * 
 * @param {string} groupId - MongoDB ObjectId
 * @param {string} reportId - MongoDB ObjectId
 * @requires Admin authentication
 * @response {200} Success - Report resolved
 * @response {400} Bad Request - Invalid body
 * @response {401} Unauthorized - Invalid/missing token
 * @response {403} Forbidden - Not an admin
 * @response {404} Not Found - Group/Report not found
 */
router.patch('/reports/:groupId/:reportId/resolve', adminController.resolveReport);

export default router;