// services/notification.service.ts

import notificationRepository from '../repositories/notification.repository';
import { INotification } from '../interfaces/INotification';
import { CreateNotificationDTO, BulkNotificationDTO } from '../types/notification.types';
import { NotFoundError, BadRequestError } from '@/shared/errors/app.error';
import { LoggerUtil } from '@/shared/logger.util';

class NotificationService {

  async createNotification(data: CreateNotificationDTO): Promise<INotification> {
    try {
      const notification = await notificationRepository.create({
        type: data.type,
        recipient: data.recipient,         // UUID string
        sender: data.sender || null,       // UUID string
        title: data.title,
        message: data.message,
        data: data.data || {},
        link: data.link || null,
        priority: data.priority || 'medium',
        expiresAt: data.expiresAt || null,
        metadata: {
          groupId: data.metadata?.groupId || null,
          taskId: data.metadata?.taskId || null,
          doubtId: data.metadata?.doubtId || null,
          messageId: data.metadata?.messageId || null,
        },
      } as Partial<INotification>);

      LoggerUtil.info(`Notification created: ${notification.notificationId} for user ${data.recipient}`);
      return notification;
    } catch (error: any) {
      LoggerUtil.error(`Error creating notification: ${error.message}`);
      throw error;
    }
  }

  async createBulkNotifications(data: BulkNotificationDTO): Promise<{ created: number; notifications: INotification[] }> {
    try {
      if (!data.recipients || data.recipients.length === 0) {
        throw new BadRequestError('Recipients array cannot be empty');
      }

      // UUID strings — no User.findById validation needed
      // Caller responsibility hai ki valid userIds pass kare
      const notifications = data.recipients.map(recipientId => ({
        type: data.type,
        recipient: recipientId,           // UUID string
        sender: data.sender || null,
        title: data.title,
        message: data.message,
        data: data.data || {},
        link: data.link || null,
        priority: data.priority || 'medium',
      }));

      const result = await notificationRepository.createBulk(
        notifications as Partial<INotification>[]
      );

      LoggerUtil.info(`Bulk notifications created: ${result.length}`);
      return { created: result.length, notifications: result };
    } catch (error: any) {
      LoggerUtil.error(`Error creating bulk notifications: ${error.message}`);
      throw error;
    }
  }

  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filter?: { isRead?: boolean; type?: string }
  ): Promise<any> {
    try {
      const queryFilter: any = {};
      if (filter?.isRead !== undefined) queryFilter.isRead = filter.isRead;
      if (filter?.type) queryFilter.type = filter.type;

      const skip = (page - 1) * limit;

      const [notifications, total, unreadCount] = await Promise.all([
        notificationRepository.findForUser(userId, queryFilter, skip, limit),
        notificationRepository.count({ recipient: userId, ...queryFilter }),
        notificationRepository.count({ recipient: userId, isRead: false }),
      ]);

      return {
        notifications,
        unreadCount,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      };
    } catch (error: any) {
      LoggerUtil.error(`Error fetching user notifications: ${error.message}`);
      throw error;
    }
  }

  async getUnreadNotifications(userId: string, limit: number = 20) {
    try {
      const [notifications, unreadCount] = await Promise.all([
        notificationRepository.findUnread(userId, limit),
        notificationRepository.count({ recipient: userId, isRead: false }),
      ]);
      return { notifications, unreadCount };
    } catch (error: any) {
      LoggerUtil.error(`Error fetching unread notifications: ${error.message}`);
      throw error;
    }
  }

  async markAsRead(notificationId: string, userId: string): Promise<INotification> {
    try {
      // Pehle check karo — already read hai?
      const existing = await notificationRepository.findByNotificationId(notificationId);
      if (!existing || existing.recipient !== userId) {
        throw new NotFoundError('Notification not found');
      }

      if (existing.isRead) return existing;

      const notification = await notificationRepository.markOneAsRead(notificationId, userId);
      if (!notification) throw new NotFoundError('Notification not found');

      LoggerUtil.info(`Notification ${notificationId} marked as read`);
      return notification;
    } catch (error: any) {
      LoggerUtil.error(`Error marking notification as read: ${error.message}`);
      throw error;
    }
  }

  async markAllAsRead(userId: string) {
    try {
      const modifiedCount = await notificationRepository.markAllAsRead(userId);
      LoggerUtil.info(`${modifiedCount} notifications marked as read for user ${userId}`);
      return {
        modifiedCount,
        message: `${modifiedCount} notifications marked as read`,
      };
    } catch (error: any) {
      LoggerUtil.error(`Error marking all notifications as read: ${error.message}`);
      throw error;
    }
  }

  async deleteNotification(notificationId: string, userId: string) {
    try {
      const deleted = await notificationRepository.deleteByNotificationId(notificationId, userId);
      if (!deleted) throw new NotFoundError('Notification not found');

      LoggerUtil.info(`Notification ${notificationId} deleted`);
      return { message: 'Notification deleted successfully' };
    } catch (error: any) {
      LoggerUtil.error(`Error deleting notification: ${error.message}`);
      throw error;
    }
  }

  async getNotificationCount(userId: string) {
    try {
      const [unreadCount, totalCount, { byType, byPriority }] = await Promise.all([
        notificationRepository.count({ recipient: userId, isRead: false }),
        notificationRepository.count({ recipient: userId }),
        notificationRepository.countByTypeAndPriority(userId),
      ]);

      return { unreadCount, totalCount, byType, byPriority };
    } catch (error: any) {
      LoggerUtil.error(`Error getting notification count: ${error.message}`);
      throw error;
    }
  }

  async deleteOldNotifications(days: number = 30) {
    try {
      const deletedCount = await notificationRepository.deleteOld(days);
      LoggerUtil.info(`Deleted ${deletedCount} old notifications`);
      return { deletedCount, message: `${deletedCount} old notifications deleted` };
    } catch (error: any) {
      LoggerUtil.error(`Error deleting old notifications: ${error.message}`);
      throw error;
    }
  }
}

export default new NotificationService();

// /**
//  * ====================================
//  * NOTIFICATION SERVICE (PRODUCTION)
//  * ====================================
//  */

// import Notification from '../models/Notification.model';
// import { User } from '@/auth/models';
// import { INotification } from '../interfaces/INotification';
// import { CreateNotificationDTO, BulkNotificationDTO } from '../types/notification.types';
// import { NotFoundError, BadRequestError } from '@/shared/errors/app.error';
// import { LoggerUtil } from '@/shared/logger.util';
// import { Types } from 'mongoose';

// class NotificationService {
//   /**
//    * Create a single notification
//    */
//   async createNotification(data: CreateNotificationDTO): Promise<INotification> {
//     try {
//       const recipient = await User.findById(data.recipient);
//       if (!recipient) {
//         throw new NotFoundError('Recipient user not found');
//       }

//       const notification = await Notification.create({
//         type: data.type,
//         recipient: data.recipient,
//         sender: data.sender || null,
//         title: data.title,
//         message: data.message,
//         data: data.data || {},
//         link: data.link || null,
//         priority: data.priority || 'medium',
//         expiresAt: data.expiresAt || null,
//         metadata: data.metadata || {},
//       });

//       LoggerUtil.info(`✅ Notification created: ${notification._id} for user ${data.recipient}`);

//       return notification;
//     } catch (error: any) {
//       LoggerUtil.error(`❌ Error creating notification: ${error.message}`);
//       throw error;
//     }
//   }

//   /**
//    * Create bulk notifications
//    */
//   async createBulkNotifications(data: BulkNotificationDTO): Promise<{ created: number; notifications: INotification[] }> {
//     try {
//       if (!data.recipients || data.recipients.length === 0) {
//         throw new BadRequestError('Recipients array cannot be empty');
//       }

//       const validRecipients = await User.find({
//         _id: { $in: data.recipients },
//       }).select('_id');

//       const validRecipientIds = validRecipients.map((user) => user._id);

//       if (validRecipientIds.length === 0) {
//         throw new NotFoundError('No valid recipients found');
//       }

//       const notifications = validRecipientIds.map((recipientId) => ({
//         type: data.type,
//         recipient: recipientId,
//         sender: data.sender || null,
//         title: data.title,
//         message: data.message,
//         data: data.data || {},
//         link: data.link || null,
//         priority: data.priority || 'medium',
//       }));

//       const result = await Notification.insertMany(notifications);

//       LoggerUtil.info(`✅ Bulk notifications created: ${result.length} notifications`);

//       return {
//         created: result.length,
//         notifications: result as unknown as INotification[],
//       };
//     } catch (error: any) {
//       LoggerUtil.error(`❌ Error creating bulk notifications: ${error.message}`);
//       throw error;
//     }
//   }

//   /**
//    * Get all notifications for a user (paginated)
//    */
//   async getUserNotifications(
//     userId: string,
//     page: number = 1,
//     limit: number = 20,
//     filter?: { isRead?: boolean; type?: string }
//   ) : Promise<any>{
//     try {
//       const query: any = { recipient: userId };

//       if (filter?.isRead !== undefined) {
//         query.isRead = filter.isRead;
//       }

//       if (filter?.type) {
//         query.type = filter.type;
//       }

//       const skip = (page - 1) * limit;

//       const [notifications, total] = await Promise.all([
//         Notification.find(query)
//           .populate('sender', 'name avatar username')
//           .sort({ priority: -1, createdAt: -1 })
//           .skip(skip)
//           .limit(limit),
//         Notification.countDocuments(query),
//       ]);

//       const unreadCount = await Notification.countDocuments({
//         recipient: userId,
//         isRead: false,
//       });

//       return {
//         notifications,
//         unreadCount,
//         total,
//         page,
//         limit,
//         totalPages: Math.ceil(total / limit),
//         hasNextPage: page < Math.ceil(total / limit),
//         hasPrevPage: page > 1,
//       };
//     } catch (error: any) {
//       LoggerUtil.error(`❌ Error fetching user notifications: ${error.message}`);
//       throw error;
//     }
//   }

//   /**
//    * Get unread notifications
//    */
//   async getUnreadNotifications(userId: string, limit: number = 20) {
//     try {
//       const notifications = await Notification.findUnreadByUser(userId, limit);
//       const unreadCount = await Notification.getUnreadCount(userId);

//       return {
//         notifications,
//         unreadCount,
//       };
//     } catch (error: any) {
//       LoggerUtil.error(`❌ Error fetching unread notifications: ${error.message}`);
//       throw error;
//     }
//   }

//   /**
//    * Mark notification as read
//    */
//   async markAsRead(notificationId: string, userId: string): Promise<INotification> {
//     try {
//       const notification = await Notification.findOne({
//         _id: notificationId,
//         recipient: userId,
//       });

//       if (!notification) {
//         throw new NotFoundError('Notification not found');
//       }

//       if (notification.isRead) {
//         return notification;
//       }

//       await notification.markAsRead();

//       LoggerUtil.info(`✅ Notification ${notificationId} marked as read`);

//       return notification;
//     } catch (error: any) {
//       LoggerUtil.error(`❌ Error marking notification as read: ${error.message}`);
//       throw error;
//     }
//   }

//   /**
//    * Mark all notifications as read
//    */
//   async markAllAsRead(userId: string) {
//     try {
//       const modifiedCount = await Notification.markAllAsReadByUser(userId);

//       LoggerUtil.info(`✅ ${modifiedCount} notifications marked as read for user ${userId}`);

//       return {
//         modifiedCount,
//         message: `${modifiedCount} notifications marked as read`,
//       };
//     } catch (error: any) {
//       LoggerUtil.error(`❌ Error marking all notifications as read: ${error.message}`);
//       throw error;
//     }
//   }

//   /**
//    * Delete a notification
//    */
//   async deleteNotification(notificationId: string, userId: string) {
//     try {
//       const notification = await Notification.findOneAndDelete({
//         _id: notificationId,
//         recipient: userId,
//       });

//       if (!notification) {
//         throw new NotFoundError('Notification not found');
//       }

//       LoggerUtil.info(`✅ Notification ${notificationId} deleted`);

//       return {
//         message: 'Notification deleted successfully',
//       };
//     } catch (error: any) {
//       LoggerUtil.error(`❌ Error deleting notification: ${error.message}`);
//       throw error;
//     }
//   }

//   /**
//    * Get notification count
//    */
//   async getNotificationCount(userId: string) {
//     try {
//       const [unreadCount, totalCount, byType, byPriority] = await Promise.all([
//         Notification.countDocuments({ recipient: userId, isRead: false }),
//         Notification.countDocuments({ recipient: userId }),
//         Notification.aggregate([
//           { $match: { recipient: new Types.ObjectId(userId) } },
//           { $group: { _id: '$type', count: { $sum: 1 } } },
//         ]),
//         Notification.aggregate([
//           { $match: { recipient: new Types.ObjectId(userId) } },
//           { $group: { _id: '$priority', count: { $sum: 1 } } },
//         ]),
//       ]);

//       const byTypeMap: Record<string, number> = {};
//       byType.forEach((item) => {
//         byTypeMap[item._id] = item.count;
//       });

//       const byPriorityMap: Record<string, number> = {};
//       byPriority.forEach((item) => {
//         byPriorityMap[item._id] = item.count;
//       });

//       return {
//         unreadCount,
//         totalCount,
//         byType: byTypeMap,
//         byPriority: byPriorityMap,
//       };
//     } catch (error: any) {
//       LoggerUtil.error(`❌ Error getting notification count: ${error.message}`);
//       throw error;
//     }
//   }

//   /**
//    * Delete old notifications
//    */
//   async deleteOldNotifications(days: number = 30) {
//     try {
//       const deletedCount = await Notification.deleteOldNotifications(days);

//       LoggerUtil.info(`✅ Deleted ${deletedCount} old notifications (older than ${days} days)`);

//       return {
//         deletedCount,
//         message: `${deletedCount} old notifications deleted`,
//       };
//     } catch (error: any) {
//       LoggerUtil.error(`❌ Error deleting old notifications: ${error.message}`);
//       throw error;
//     }
//   }
// }

// export default new NotificationService();