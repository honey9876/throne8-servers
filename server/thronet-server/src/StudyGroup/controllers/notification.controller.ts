// controllers/notification.controller.ts

import { Request, Response } from 'express';
import notificationService from '../services/notification.service';
import ResponseUtil from '@/shared/response.util';
import { asyncHandler } from '@/shared/utils/helpers.util';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { BadRequestError } from '@/shared/errors/app.error';

class NotificationController {

  getAllNotifications = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;  // was: user?.id
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const isRead = req.query.isRead === 'true' ? true
      : req.query.isRead === 'false' ? false
      : undefined;
    const type = req.query.type as string | undefined;

    const result = await notificationService.getUserNotifications(userId!, page, limit, {
      isRead, type,
    });

    return ResponseUtil.success(res, result, 'Notifications retrieved successfully');
  });

  getUnreadNotifications = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await notificationService.getUnreadNotifications(userId!, limit);
    return ResponseUtil.success(res, result, 'Unread notifications retrieved successfully');
  });

  getNotificationCount = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;
    const count = await notificationService.getNotificationCount(userId!);
    return ResponseUtil.success(res, count, 'Notification count retrieved successfully');
  });

  markAsRead = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;
    const { notificationId } = req.params;

    if (!notificationId) throw new BadRequestError('Notification ID is required');

    const notification = await notificationService.markAsRead(notificationId, userId!);
    return ResponseUtil.success(res, notification, 'Notification marked as read successfully');
  });

  markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;
    const result = await notificationService.markAllAsRead(userId!);
    return ResponseUtil.success(res, result, 'All notifications marked as read successfully');
  });

  deleteNotification = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;
    const { notificationId } = req.params;

    if (!notificationId) throw new BadRequestError('Notification ID is required');

    const result = await notificationService.deleteNotification(notificationId, userId!);
    return ResponseUtil.success(res, result, 'Notification deleted successfully');
  });

  getPreferences = asyncHandler(async (_req: Request, res: Response) => {
    // TODO: User model mein notificationPreferences field add hone ke baad implement karo
    const preferences = {
      push: true, email: true, sms: false,
      types: {
        groupInvite: true, memberJoined: true, memberLeft: true,
        newMessage: false, messageMention: true,
        taskReminder: true, taskDeadline: true,
        goalReminder: true, goalAchieved: true,
        streakReminder: true, streakMilestone: true,
        doubtAnswered: true, answerUpvoted: true,
        systemUpdate: true,
      },
      quietHours: { enabled: false, start: '22:00', end: '08:00' },
    };
    return ResponseUtil.success(res, preferences, 'Notification preferences retrieved successfully');
  });

  updatePreferences = asyncHandler(async (req: Request, res: Response) => {
    const updates = req.body;
    // TODO: User model mein preferences field add hone ke baad implement karo
    return ResponseUtil.success(res, updates, 'Notification preferences updated successfully');
  });
}

export default new NotificationController();

// /**
//  * ====================================
//  * NOTIFICATION CONTROLLER
//  * ====================================
//  */

// import { Request, Response } from 'express';
// import notificationService from '../services/notification.service';
// import ResponseUtil from '@/shared/response.util';
// import { asyncHandler } from '@/shared/utils/helpers.util';
// import { AuthRequest } from '@/shared/middlewares/auth.middleware';
// import { HttpStatus } from '../enums/HttpStatus.enum';
// import { BadRequestError } from '@/shared/errors/app.error';
// class NotificationController {
//   /**
//    * Get all notifications for logged-in user
//    * GET /api/notifications/all
//    */
//   getAllNotifications = asyncHandler(async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const page = parseInt(req.query.page as string) || 1;
//     const limit = parseInt(req.query.limit as string) || 20;
//     const isRead = req.query.isRead === 'true' ? true : req.query.isRead === 'false' ? false : undefined;
//     const type = req.query.type as string | undefined;

//     const result = await notificationService.getUserNotifications(userId!, page, limit, {
//       isRead,
//       type,
//     });

//     return ResponseUtil.success(
//       res,
//       {
//         page: result.page,
//         limit: result.limit,
//         total: result.total,
//         totalPages: result.totalPages,
//         hasNextPage: result.hasNextPage,
//         hasPrevPage: result.hasPrevPage,
//         unreadCount: result.unreadCount,
//       },
//       'Notifications retrieved successfully',
//       result.notifications,
//     );
//   });

//   /**
//    * Get unread notifications
//    * GET /api/notifications/unread
//    */
//   getUnreadNotifications = asyncHandler(async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const limit = parseInt(req.query.limit as string) || 20;

//     const result = await notificationService.getUnreadNotifications(userId!, limit);

//     return ResponseUtil.success(
//       res,
//       {
//         unreadCount: result.unreadCount,
//         notifications: result.notifications,
//       },
//       'Unread notifications retrieved successfully',
//     );
//   });

//   /**
//    * Get notification count
//    * GET /api/notifications/count
//    */
//   getNotificationCount = asyncHandler(async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;

//     const count = await notificationService.getNotificationCount(userId!);

//     return ResponseUtil.success(res, { count }, 'Notification count retrieved successfully');
//   });

//   /**
//    * Mark notification as read
//    * PATCH /api/notifications/:notificationId/read
//    */
//   markAsRead = asyncHandler(async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const notificationId = req.params.notificationId;

//     if (!notificationId) {
//       throw new BadRequestError('Notification ID is required');
//     }

//     const notification = await notificationService.markAsRead(notificationId, userId!);

//     return ResponseUtil.success(res, notification, 'Notification marked as read successfully');
//   });

//   /**
//    * Mark all notifications as read
//    * PATCH /api/notifications/mark-all-read
//    */
//   markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;

//     const result = await notificationService.markAllAsRead(userId!);

//     return ResponseUtil.success(res, result, 'All notifications marked as read successfully');
//   });

//   /**
//    * Delete notification
//    * DELETE /api/notifications/:notificationId
//    */
//   deleteNotification = asyncHandler(async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const notificationId = req.params.notificationId;

//     if (!notificationId) {
//       throw new BadRequestError('Notification ID is required');
//     }

//     const result = await notificationService.deleteNotification(notificationId, userId!);

//     return ResponseUtil.success(res, result, 'Notification deleted successfully');
//   });

//   /**
//    * Get notification preferences
//    * GET /api/notifications/preferences
//    */
//   getPreferences = asyncHandler(async (_req: Request, res: Response) => {
//     // TODO: Implement when User model has notificationPreferences
//     const preferences = {
//       push: true,
//       email: true,
//       sms: false,
//       types: {
//         groupInvite: true,
//         memberJoined: true,
//         memberLeft: true,
//         newMessage: false,
//         messageMention: true,
//         taskReminder: true,
//         taskDeadline: true,
//         goalReminder: true,
//         goalAchieved: true,
//         streakReminder: true,
//         streakMilestone: true,
//         doubtAnswered: true,
//         answerUpvoted: true,
//         systemUpdate: true,
//       },
//       quietHours: {
//         enabled: false,
//         start: '22:00',
//         end: '08:00',
//       },
//     };

//     return ResponseUtil.success(res, preferences, 'Notification preferences retrieved successfully');
//   });

//   /**
//    * Update notification preferences
//    * PUT /api/notifications/preferences
//    */
//   updatePreferences = asyncHandler(async (req: Request, res: Response) => {
//     const updates = req.body;

//     // TODO: Implement when User model has notificationPreferences
//     return ResponseUtil.success(res, updates, 'Notification preferences updated successfully');
//   });
// }

// export default new NotificationController();