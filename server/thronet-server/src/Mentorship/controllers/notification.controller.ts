// src/controllers/notification.controller.ts

import { Notification } from '../models';
import { notificationService } from '../services';
import { NotificationChannel, NotificationType } from '@/Mentorship/services/notification.service';
import { logger } from '@/shared/logger.util';
import { generateSecureId } from '@/shared/security';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import { Request, Response } from 'express';
import notificationRepository from '../repositories/notification.repository';


class NotificationController {
  /**
   * Get user notifications
   */
  async getUserNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        ResponseHandler.error(res, 'User ID is required', 401);
        return;
      }

      const { page = 1, limit = 20, unreadOnly = false } = req.query;

      const query: any = { userId };
      if (unreadOnly === 'true') {
        query['status.read'] = false;
      }

      const skip = (Number(page) - 1) * Number(limit);
      // const notifications = await Notification.find(query)
      //   .sort({ createdAt: -1 })
      //   .skip(skip)
      //   .limit(Number(limit))
      //   .lean();

      // const total = await Notification.countDocuments(query);

      const [notifications, total] = await Promise.all([
        notificationRepository.findByUserId(userId, unreadOnly === 'true', skip, Number(limit)),
        notificationRepository.countByUserId(userId, unreadOnly === 'true'),
      ]);

      ResponseHandler.paginated(
        res,
        'Notifications retrieved successfully',
        notifications,
        Number(page),
        Number(limit),
        total
      );
    } catch (error: any) {
      logger.error('Get user notifications error:', error);
      ResponseHandler.serverError(res, 'Failed to retrieve notifications');
    }
  }

  /**
   * Get notification by ID
   */
  async getNotificationById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      // const notification = await Notification.findOne({ _id: id, userId }).lean();
      const notification = await Notification.findOne({ notificationId: id, userId }).lean();

      if (!notification) {
        ResponseHandler.notFound(res, 'Notification not found');
        return;
      }

      ResponseHandler.success(res, 'Notification retrieved successfully', notification);
    } catch (error: any) {
      logger.error('Get notification by ID error:', error);
      ResponseHandler.serverError(res, 'Failed to retrieve notification');
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const notification = await Notification.findOneAndUpdate(
        { notificationId: id, userId },
        {
          $set: {
            'status.read': true,
            'status.readAt': new Date()
          }
        },
        { new: true }
      );

      if (!notification) {
        ResponseHandler.notFound(res, 'Notification not found');
        return;
      }

      ResponseHandler.success(res, 'Notification marked as read', notification);
    } catch (error: any) {
      logger.error('Mark as read error:', error);
      ResponseHandler.serverError(res, 'Failed to mark notification as read');
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      const result = await Notification.updateMany(
        { userId, 'status.read': false },
        {
          $set: {
            'status.read': true,
            'status.readAt': new Date()
          }
        }
      );

      ResponseHandler.success(
        res,
        'All notifications marked as read',
        { modifiedCount: result.modifiedCount }
      );
    } catch (error: any) {
      logger.error('Mark all as read error:', error);
      ResponseHandler.serverError(res, 'Failed to mark all notifications as read');
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const result = await Notification.findOneAndDelete({ notificationId: id, userId });

      if (!result) {
        ResponseHandler.notFound(res, 'Notification not found');
        return;
      }

      ResponseHandler.success(res, 'Notification deleted successfully', null);
    } catch (error: any) {
      logger.error('Delete notification error:', error);
      ResponseHandler.serverError(res, 'Failed to delete notification');
    }
  }

  /**
   * Get unread count
   */
  async getUnreadCount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      const count = await Notification.countDocuments({
        userId,
        'status.read': false
      });

      ResponseHandler.success(res, 'Unread count retrieved successfully', { count });
    } catch (error: any) {
      logger.error('Get unread count error:', error);
      ResponseHandler.serverError(res, 'Failed to get unread count');
    }
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const preferences = req.body;

      // In a real app, you'd store this in a UserPreferences model
      // For now, we'll just return success
      logger.info(`Updated notification preferences for user ${userId}`, preferences);

      ResponseHandler.success(
        res,
        'Notification preferences updated successfully',
        preferences
      );
    } catch (error: any) {
      logger.error('Update preferences error:', error);
      ResponseHandler.serverError(res, 'Failed to update preferences');
    }
  }

  /**
   * Send test notification
   */
  async sendTestNotification(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      // Create in-app notification
      const notification = await Notification.create({
        notificationId: generateSecureId(), // Generate unique ID for notification
        userId: userId!,
        type: NotificationType.PAYMENT_SUCCESS,
        category: 'system',
        title: 'Test Notification',
        message: 'This is a test notification to verify the system is working correctly.',
        priority: 'low',
        channels: {
          inApp: true,
          email: false,
          sms: false,
          push: false,
        },
        status: {
          sent: true,
          read: false,
          clicked: false,
        },
      });

      ResponseHandler.success(res, 'Test notification sent successfully', notification);
    } catch (error: any) {
      logger.error('Send test notification error:', error);
      ResponseHandler.serverError(res, 'Failed to send test notification');
    }
  }

  /**
   * Send notification via service
   */
  async sendNotification(req: Request, res: Response): Promise<void> {
    try {
      const { userId, type, data, channels, priority } = req.body;

      const result = await notificationService.sendNotification({
        userId,
        type: type as NotificationType,
        channels: channels as NotificationChannel[],
        data,
        priority,
        authToken: req.headers.authorization,
      });

      if (result.sent) {
        ResponseHandler.success(res, 'Notification sent successfully', result);
      } else {
        ResponseHandler.error(res, 'Failed to send notification', 500, result);
      }
    } catch (error: any) {
      logger.error('Send notification error:', error);
      ResponseHandler.serverError(res, 'Failed to send notification');
    }
  }
}

export default new NotificationController();