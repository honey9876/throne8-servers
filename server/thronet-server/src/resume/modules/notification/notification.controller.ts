import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import * as notificationService from "./notification.service";

export const getNotifications = async (req: AuthRequest, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  const notifications = await notificationService.getUserNotifications(req.userId!, limit);
  
  res.json({
    success: true,
    data: notifications,
  });
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  const count = await notificationService.getUnreadCount(req.userId!);
  
  res.json({
    success: true,
    data: { count },
  });
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  const notification = await notificationService.markAsRead(req.params.id as string, req.userId!);
  
  res.json({
    success: true,
    data: notification,
  });
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  await notificationService.markAllAsRead(req.userId!);
  
  res.json({
    success: true,
    message: "All notifications marked as read",
  });
};
