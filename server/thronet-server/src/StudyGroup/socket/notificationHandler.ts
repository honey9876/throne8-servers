/**
 * ====================================
 * NOTIFICATION HANDLER
 * ====================================
 * server/thronet-server/src/StudyGroup/socket/notificationHandler.ts
 *
 * Fixes applied:
 *  1. 'send-notification' client event REMOVED — notifications must be
 *     triggered server-side via emitToUser() in socket/index.ts
 *  2. All DB operations implemented (no more placeholder comments)
 *  3. 'get-unread-count' returns real count from DB
 *  4. Input validation on every handler
 *  5. userId read from socket.data.userId
 *
 * How to send a notification from anywhere in the backend:
 *   import { emitToUser } from '@/socket';
 *   emitToUser(targetUserId, 'new-notification', { type, title, message, link });
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../types/Socket.types';
import {
  MarkNotificationReadPayload,
  DeleteNotificationPayload,
} from '../types/Socket.types';
import Notification from '../models/Notification.model';
import { LoggerUtil } from '@/shared/logger.util';

export const notificationHandler = (io: Server, socket: AuthenticatedSocket): void => {
  const userId = socket.data.userId;

  // ── Join personal notification room ────────────────────────────────────────
  // This is kept as a client event for backward compatibility, but the server
  // also joins the room automatically on connection (socket/index.ts), so
  // notifications are delivered even if the client never fires this event.
  socket.on('join-notifications', () => {
    socket.join(`user:${userId}`);
    LoggerUtil.info(`User ${userId} joined notification room (client-initiated)`);
  });

  // ── NOTE: 'send-notification' event intentionally NOT registered here ───────
  // Reason: any connected client could emit it and target any user — this is a
  // critical security hole. Use emitToUser() on the server side instead.

  // ── Mark single notification as read ──────────────────────────────────────
  socket.on('mark-notification-read', async (data: MarkNotificationReadPayload) => {
    try {
      const { notificationId } = data;
      if (!notificationId || typeof notificationId !== 'string') return;

      // Only allow users to mark their own notifications
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { isRead: true, readAt: new Date() },
        { new: true, select: '_id isRead' }
      );

      if (!notification) {
        socket.emit('error', {
          event: 'mark-notification-read',
          message: 'Notification not found or access denied',
        });
        return;
      }

      LoggerUtil.info(`Notification ${notificationId} marked read by ${userId}`);

      socket.emit('notification-read-success', { notificationId });

    } catch (error: any) {
      LoggerUtil.error('Error marking notification as read', { error: error.message, userId });
    }
  });

  // ── Mark all notifications as read ────────────────────────────────────────
  socket.on('mark-all-notifications-read', async () => {
    try {
      const result = await Notification.updateMany(
        { userId, isRead: false },
        { isRead: true, readAt: new Date() }
      );

      LoggerUtil.info(`${result.modifiedCount} notifications marked read for ${userId}`);

      socket.emit('all-notifications-read-success', {
        updatedCount: result.modifiedCount,
      });

    } catch (error: any) {
      LoggerUtil.error('Error marking all notifications as read', { error: error.message, userId });
    }
  });

  // ── Get unread count ───────────────────────────────────────────────────────
  socket.on('get-unread-count', async () => {
    try {
      const count = await Notification.countDocuments({ userId, isRead: false });

      socket.emit('unread-notification-count', { count });

    } catch (error: any) {
      LoggerUtil.error('Error getting unread count', { error: error.message, userId });
      socket.emit('unread-notification-count', { count: 0 });
    }
  });

  // ── Delete notification ────────────────────────────────────────────────────
  socket.on('delete-notification', async (data: DeleteNotificationPayload) => {
    try {
      const { notificationId } = data;
      if (!notificationId || typeof notificationId !== 'string') return;

      // Only allow users to delete their own notifications
      const deleted = await Notification.findOneAndDelete({
        _id: notificationId,
        userId,
      });

      if (!deleted) {
        socket.emit('error', {
          event: 'delete-notification',
          message: 'Notification not found or access denied',
        });
        return;
      }

      LoggerUtil.info(`Notification ${notificationId} deleted by ${userId}`);

      socket.emit('notification-deleted', { notificationId });

    } catch (error: any) {
      LoggerUtil.error('Error deleting notification', { error: error.message, userId });
    }
  });

  // ── Fetch paginated notifications ──────────────────────────────────────────
  socket.on('get-notifications', async (data: { page?: number; limit?: number }) => {
    try {
      const page  = Math.max(1, data?.page  ?? 1);
      const limit = Math.min(50, Math.max(1, data?.limit ?? 20));
      const skip  = (page - 1) * limit;

      const [notifications, total] = await Promise.all([
        Notification.find({ userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Notification.countDocuments({ userId }),
      ]);

      socket.emit('notifications-list', {
        notifications,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });

    } catch (error: any) {
      LoggerUtil.error('Error fetching notifications', { error: error.message, userId });
    }
  });
};

export default notificationHandler;