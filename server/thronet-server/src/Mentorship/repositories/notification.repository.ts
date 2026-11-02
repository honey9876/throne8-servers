import Notification from '../models/Notification';
import { v4 as uuidv4 } from 'uuid';

class NotificationRepository {

  async findByNotificationId(notificationId: string, userId?: string, module?: string): Promise<any | null> {
    const query: any = { notificationId };
    if (userId) query.userId = userId;
    if (module) query.module = module;
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
    limit: number = 20,
    module?: string
  ): Promise<any[]> {
    const query: any = { userId };
    if (unreadOnly) query['status.read'] = false;
    if (module) query.module = module;

    return await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async countByUserId(userId: string, unreadOnly: boolean = false, module?: string): Promise<number> {
    const query: any = { userId };
    if (unreadOnly) query['status.read'] = false;
    if (module) query.module = module;
    return await Notification.countDocuments(query);
  }

  async markAsRead(notificationId: string, userId: string, module?: string): Promise<any | null> {
    const query: any = { notificationId, userId };
    if (module) query.module = module;
    return await Notification.findOneAndUpdate(
      query,
      { $set: { 'status.read': true, 'status.readAt': new Date() } },
      { new: true }
    );
  }

  async markAllAsRead(userId: string, module?: string): Promise<number> {
    const query: any = { userId, 'status.read': false };
    if (module) query.module = module;
    const result = await Notification.updateMany(
      query,
      { $set: { 'status.read': true, 'status.readAt': new Date() } }
    );
    return result.modifiedCount;
  }

  async deleteByNotificationId(notificationId: string, userId: string, module?: string): Promise<boolean> {
    const query: any = { notificationId, userId };
    if (module) query.module = module;
    const result = await Notification.findOneAndDelete(query);
    return !!result;
  }
}

export default new NotificationRepository();
