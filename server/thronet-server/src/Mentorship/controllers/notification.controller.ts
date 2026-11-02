// src/controllers/notification.controller.ts

import { Notification } from '../models';
import { notificationService } from '../services';
import { NotificationChannel, NotificationType } from '@/Mentorship/services/notification.service';
import { logger } from '@/shared/logger.util';
import { generateSecureId } from '@/shared/security';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import { Request, Response } from 'express';
import notificationRepository from '../repositories/notification.repository';
import { emitNotificationCount } from '@/socket/handlers/notificationHandler';

const VALID_MODULES = ['senior-mentor', 'industry-mentor'] as const;
type NotificationModule = (typeof VALID_MODULES)[number];

function validateModule(
  moduleParam: any,
  required: boolean = true
): { valid: boolean; module?: NotificationModule; error?: string } {
  if (!moduleParam) {
    if (required) {
      return {
        valid: false,
        error: 'Module parameter is required and must be either "senior-mentor" or "industry-mentor"',
      };
    }
    return { valid: true, module: undefined };
  }
  if (!VALID_MODULES.includes(moduleParam as NotificationModule)) {
    return {
      valid: false,
      error: 'Invalid module parameter. Must be "senior-mentor" or "industry-mentor"',
    };
  }
  return { valid: true, module: moduleParam as NotificationModule };
}

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

      const moduleValidation = validateModule(req.query.module, true);
      if (!moduleValidation.valid) {
        ResponseHandler.error(res, moduleValidation.error!, 400);
        return;
      }
      const module = moduleValidation.module!;

      const { page = 1, limit = 20, unreadOnly = false } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const [notifications, total] = await Promise.all([
        notificationRepository.findByUserId(userId, unreadOnly === 'true', skip, Number(limit), module),
        notificationRepository.countByUserId(userId, unreadOnly === 'true', module),
      ]);

      const uniqueActorIds = Array.from(
        new Set(
          (notifications || [])
            .map((n: any) => n?.data?.menteeId || n?.data?.viewerId || n?.data?.replierId || n?.data?.actorId)
            .filter(Boolean)
        )
      ) as string[];

      if (uniqueActorIds.length > 0) {
        try {
          const resolvedActorsMap: Record<string, { name: string; photoUrl: string | null }> = {};
          await Promise.all(
            uniqueActorIds.map(async (actorId) => {
              resolvedActorsMap[actorId] = await notificationService.resolveActorDisplay(actorId);
            })
          );

          notifications.forEach((n: any) => {
            if (!n.data) n.data = {};
            const actorId = n.data.menteeId || n.data.viewerId || n.data.replierId || n.data.actorId;
            if (actorId && resolvedActorsMap[actorId]) {
              const info = resolvedActorsMap[actorId];
              if (!n.data.menteeId) n.data.menteeId = actorId;
              if (!n.data.menteeName && !n.data.actorName && !n.data.viewerName && !n.data.replierName) {
                n.data.menteeName = info.name;
                n.data.actorName = info.name;
              }
              if (!n.data.menteePhoto && !n.data.actorPhoto && !n.data.viewerPhoto && !n.data.replierPhoto) {
                n.data.menteePhoto = info.photoUrl;
                n.data.actorPhoto = info.photoUrl;
              }
            }
          });
        } catch (enrichErr: any) {
          logger.warn('Batch notification actor enrichment skipped:', enrichErr?.message);
        }
      }

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

      if (!userId) {
        ResponseHandler.error(res, 'User ID is required', 401);
        return;
      }

      const moduleValidation = validateModule(req.query.module, false);
      if (!moduleValidation.valid) {
        ResponseHandler.error(res, moduleValidation.error!, 400);
        return;
      }

      const notification = await notificationRepository.findByNotificationId(id, userId, moduleValidation.module);

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

      if (!userId) {
        ResponseHandler.error(res, 'User ID is required', 401);
        return;
      }

      const moduleParam = req.query.module || req.body?.module;
      const moduleValidation = validateModule(moduleParam, false);
      if (!moduleValidation.valid) {
        ResponseHandler.error(res, moduleValidation.error!, 400);
        return;
      }

      const notification = await notificationRepository.markAsRead(id, userId, moduleValidation.module);

      if (!notification) {
        ResponseHandler.notFound(res, 'Notification not found');
        return;
      }

      if (moduleValidation.module) {
        try {
          const io = (req.app as any)?.get('io');
          if (io) {
            const count = await notificationRepository.countByUserId(userId, true, moduleValidation.module);
            emitNotificationCount(io, userId, count, moduleValidation.module);
          }
        } catch (_) {}
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

      if (!userId) {
        ResponseHandler.error(res, 'User ID is required', 401);
        return;
      }

      const moduleParam = req.query.module || req.body?.module;
      const moduleValidation = validateModule(moduleParam, false);
      if (!moduleValidation.valid) {
        ResponseHandler.error(res, moduleValidation.error!, 400);
        return;
      }

      const modifiedCount = await notificationRepository.markAllAsRead(userId, moduleValidation.module);

      if (moduleValidation.module) {
        try {
          const io = (req.app as any)?.get('io');
          if (io) {
            emitNotificationCount(io, userId, 0, moduleValidation.module);
          }
        } catch (_) {}
      }

      ResponseHandler.success(
        res,
        'All notifications marked as read',
        { modifiedCount }
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

      if (!userId) {
        ResponseHandler.error(res, 'User ID is required', 401);
        return;
      }

      const moduleParam = req.query.module || req.body?.module;
      const moduleValidation = validateModule(moduleParam, false);
      if (!moduleValidation.valid) {
        ResponseHandler.error(res, moduleValidation.error!, 400);
        return;
      }

      const success = await notificationRepository.deleteByNotificationId(id, userId, moduleValidation.module);

      if (!success) {
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

      if (!userId) {
        ResponseHandler.error(res, 'User ID is required', 401);
        return;
      }

      const moduleValidation = validateModule(req.query.module, true);
      if (!moduleValidation.valid) {
        ResponseHandler.error(res, moduleValidation.error!, 400);
        return;
      }

      const count = await notificationRepository.countByUserId(userId, true, moduleValidation.module!);

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

      const notification = await Notification.create({
        notificationId: generateSecureId(),
        userId: userId!,
        module: 'industry-mentor',
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
      const { userId, type, data, channels, priority, module } = req.body;

      const result = await notificationService.sendNotification({
        userId,
        type: type as NotificationType,
        channels: channels as NotificationChannel[],
        module,
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
