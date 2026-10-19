import { Notification } from "../../models/notification.model";
import { CreateNotificationInput } from "./notification.types";
import { ApiError } from "../../utils/ApiError";

export const createNotification = async (data: CreateNotificationInput) => {
  const notification = new Notification(data);
  return await notification.save();
};

export const getUserNotifications = async (userId: string, limit: number = 50) => {
  return await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

export const getUnreadCount = async (userId: string) => {
  return await Notification.countDocuments({ userId, read: false });
};

export const markAsRead = async (notificationId: string, userId: string) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { read: true },
    { new: true }
  );

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  return notification;
};

export const markAllAsRead = async (userId: string) => {
  await Notification.updateMany({ userId, read: false }, { read: true });
};
