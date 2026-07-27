import express from 'express';
import notificationController from '../controllers/notification.controller'; // ✅ Default import (not named)
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = express.Router();

// ✅ All routes need authentication
router.use(AuthMiddleware.authenticate as any);

// ========================================
// 📬 GET NOTIFICATIONS
// ========================================

/**
 * @route   GET /api/notifications/all
 * @desc    Get all notifications for logged-in user (paginated)
 * @access  Private
 */
router.get('/all', notificationController.getAllNotifications);

/**
 * @route   GET /api/notifications/unread
 * @desc    Get only unread notifications
 * @access  Private
 */
router.get('/unread', notificationController.getUnreadNotifications);

/**
 * @route   GET /api/notifications/count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get('/count', notificationController.getNotificationCount);

// ========================================
// ✅ MARK AS READ
// ========================================

/**
 * @route   PATCH /api/notifications/:notificationId/read
 * @desc    Mark a single notification as read
 * @access  Private
 */
router.patch('/:notificationId/read', notificationController.markAsRead);

/**
 * @route   PATCH /api/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.patch('/mark-all-read', notificationController.markAllAsRead);

// ========================================
// 🗑️ DELETE NOTIFICATIONS
// ========================================

/**
 * @route   DELETE /api/notifications/:notificationId
 * @desc    Delete a single notification
 * @access  Private
 */
router.delete('/:notificationId', notificationController.deleteNotification);

// ========================================
// ⚙️ NOTIFICATION PREFERENCES
// ========================================

/**
 * @route   GET /api/notifications/preferences
 * @desc    Get user's notification preferences
 * @access  Private
 */
router.get('/preferences', notificationController.getPreferences);

/**
 * @route   PUT /api/notifications/preferences
 * @desc    Update notification preferences
 * @access  Private
 */
router.put('/preferences', notificationController.updatePreferences);

export default router;