// src/routes/notification.routes.ts

import { Router } from 'express';
import { notificationController } from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { rateLimitGeneral, rateLimitStrict } from '@/Mentorship/middlewares/rateLimit.middleware';

const router = Router();

// Apply authentication to all routes
router.use(AuthMiddleware.authenticate as any);

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get(
  '/',
  rateLimitGeneral,
  notificationController.getUserNotifications
);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get(
  '/unread-count',
  rateLimitGeneral,
  notificationController.getUnreadCount
);

/**
 * @route   GET /api/notifications/:id
 * @desc    Get notification by ID
 * @access  Private
 */
router.get(
  '/:id',
  rateLimitGeneral,
  notificationController.getNotificationById
);


/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put(
  '/read-all',
  rateLimitGeneral,
  notificationController.markAllAsRead
);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification
 * @access  Private
 */
router.delete(
  '/:id',
  rateLimitGeneral,
  notificationController.deleteNotification
);

/**
 * @route   PUT /api/notifications/preferences
 * @desc    Update notification preferences
 * @access  Private
 */
router.put(
  '/preferences',
  rateLimitStrict,
  notificationController.updatePreferences
);


/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put(
  '/:id/read',
  rateLimitGeneral,
  notificationController.markAsRead
);

/**
 * @route   POST /api/notifications/test
 * @desc    Send test notification
 * @access  Private
 */
router.post(
  '/test',
  rateLimitStrict,
  notificationController.sendTestNotification
);

export default router;