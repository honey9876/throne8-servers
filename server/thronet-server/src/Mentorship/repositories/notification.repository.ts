import Notification from '../models/Notification';
import { v4 as uuidv4 } from 'uuid';

class NotificationRepository {

  async findByNotificationId(notificationId: string, userId?: string): Promise<any | null> {
    const query: any = { notificationId };
    if (userId) query.userId = userId;
    return await Notification.findOne(query).lean();
  }

  async create(data: any): Promise<any> {
    const notification = new Notification({
      notificationId: uuidv4(),
      ...data,
    });
    await notification.save();
    return notification;
  }

  async findByUserId(
    userId: string,
    unreadOnly: boolean = false,
    skip: number = 0,
    limit: number = 20
  ): Promise<any[]> {
    const query: any = { userId };
    if (unreadOnly) query['status.read'] = false;

    return await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async countByUserId(userId: string, unreadOnly: boolean = false): Promise<number> {
    const query: any = { userId };
    if (unreadOnly) query['status.read'] = false;
    return await Notification.countDocuments(query);
  }

  async markAsRead(notificationId: string, userId: string): Promise<any | null> {
    return await Notification.findOneAndUpdate(
      { notificationId, userId },
      { $set: { 'status.read': true, 'status.readAt': new Date() } },
      { new: true }
    );
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await Notification.updateMany(
      { userId, 'status.read': false },
      { $set: { 'status.read': true, 'status.readAt': new Date() } }
    );
    return result.modifiedCount;
  }

  async deleteByNotificationId(notificationId: string, userId: string): Promise<boolean> {
    const result = await Notification.findOneAndDelete({ notificationId, userId });
    return !!result;
  }
}

export default new NotificationRepository();