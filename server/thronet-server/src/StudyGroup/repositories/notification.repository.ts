// repositories/notification.repository.ts

import { BaseRepository } from './base.repository';
import Notification from '../models/Notification.model';
import { INotification } from '../interfaces/INotification';

export class NotificationRepository extends BaseRepository<INotification> {
  constructor() {
    super(Notification);
  }

  // notificationId UUID se find
  async findByNotificationId(notificationId: string): Promise<INotification | null> {
    try {
      return await this.model.findOne({ notificationId }).exec();
    } catch (error: any) {
      throw new Error(`Error finding notification: ${error}`);
    }
  }

  // User ke liye paginated notifications
  async findForUser(
    userId: string,
    filter: any,
    skip: number,
    limit: number
  ): Promise<INotification[]> {
    try {
      return await this.model
        .find({ recipient: userId, ...filter })
        .populate('sender', 'name avatar username')
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec() as unknown as INotification[];
    } catch (error: any) {
      throw new Error(`Error finding notifications for user: ${error}`);
    }
  }

  // Unread notifications
  async findUnread(userId: string, limit: number = 20): Promise<INotification[]> {
    try {
      return await this.model
        .find({ recipient: userId, isRead: false })
        .populate('sender', 'name avatar username')
        .sort({ priority: -1, createdAt: -1 })
        .limit(limit)
        .lean()
        .exec() as unknown as INotification[];
    } catch (error: any) {
      throw new Error(`Error finding unread notifications: ${error}`);
    }
  }

  // Count
  async count(filter: any): Promise<number> {
    try {
      return await this.model.countDocuments(filter).exec();
    } catch (error: any) {
      throw new Error(`Error counting notifications: ${error}`);
    }
  }

  // Count by type/priority — string userId, no ObjectId wrap
  async countByTypeAndPriority(userId: string): Promise<{
    byType: Record<string, number>;
    byPriority: Record<string, number>;
  }> {
    try {
      const [byType, byPriority] = await Promise.all([
        this.model.aggregate([
          { $match: { recipient: userId } },    // string — no ObjectId wrap
          { $group: { _id: '$type', count: { $sum: 1 } } },
        ]),
        this.model.aggregate([
          { $match: { recipient: userId } },    // string
          { $group: { _id: '$priority', count: { $sum: 1 } } },
        ]),
      ]);

      const byTypeMap: Record<string, number> = {};
      byType.forEach(item => { byTypeMap[item._id] = item.count; });

      const byPriorityMap: Record<string, number> = {};
      byPriority.forEach(item => { byPriorityMap[item._id] = item.count; });

      return { byType: byTypeMap, byPriority: byPriorityMap };
    } catch (error: any) {
      throw new Error(`Error counting by type/priority: ${error}`);
    }
  }

  // Mark single as read — notificationId UUID se
  async markOneAsRead(notificationId: string, userId: string): Promise<INotification | null> {
    try {
      return await this.model.findOneAndUpdate(
        { notificationId, recipient: userId },
        { $set: { isRead: true, readAt: new Date() } },
        { new: true }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error marking notification as read: ${error}`);
    }
  }

  // Mark all as read
  async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await this.model.updateMany(
        { recipient: userId, isRead: false },
        { $set: { isRead: true, readAt: new Date() } }
      ).exec();
      return result.modifiedCount;
    } catch (error: any) {
      throw new Error(`Error marking all as read: ${error}`);
    }
  }

  // Delete by notificationId UUID
  async deleteByNotificationId(notificationId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.model.findOneAndDelete({
        notificationId,
        recipient: userId,
      }).exec();
      return result !== null;
    } catch (error: any) {
      throw new Error(`Error deleting notification: ${error}`);
    }
  }

  // Bulk create
  async createBulk(notifications: Partial<INotification>[]): Promise<INotification[]> {
    try {
      return await this.model.insertMany(notifications) as unknown as INotification[];
    } catch (error: any) {
      throw new Error(`Error creating bulk notifications: ${error}`);
    }
  }

  // Old notifications delete karo — cron job ke liye
  async deleteOld(days: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const result = await this.model.deleteMany({
        createdAt: { $lt: cutoffDate },
        isRead: true,
      }).exec();
      return result.deletedCount;
    } catch (error: any) {
      throw new Error(`Error deleting old notifications: ${error}`);
    }
  }
}

export default new NotificationRepository();