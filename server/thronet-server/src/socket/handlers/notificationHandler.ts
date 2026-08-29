import { Server, Socket } from 'socket.io';
import logger, { LogCategory } from '@/shared/logger.util';
import { AuthenticatedSocket } from '../index';
import Notification from '@/notifications/models/Notification.model';
import NotificationService from '@/notifications/services/notification.service';

export const setupNotificationHandlers = (io: Server, socket: AuthenticatedSocket) => {
    const userId = socket.data.userId || socket.userId;
    if (!userId) return;

    // Mark one notification as read
    socket.on('notification:read', async (data: { notificationId: string }) => {
        try {
            await NotificationService.markAsRead(data.notificationId, userId);
            // Send updated count
            const count = await Notification.countDocuments({ recipientId: userId, isRead: false });
            socket.emit('notification:unread:count', { count });
        } catch (err) { /* non-critical */ }
    });

    // Get unread count on connect
    socket.on('notification:get:unread:count', async () => {
        try {
            const count = await Notification.countDocuments({ recipientId: userId, isRead: false });
            socket.emit('notification:unread:count', { count });
        } catch (err) { /* non-critical */ }
    });

    // Emit unread count immediately on connect
    setImmediate(async () => {
        try {
            const count = await Notification.countDocuments({ recipientId: userId, isRead: false });
            socket.emit('notification:unread:count', { count });
        } catch (_) { }
    });
};

// ✅ Emit notification count update
export const emitNotificationCount = (
    io: Server,
    userId: string,
    count: number
) => {
    io.to(`user:${userId}`).emit('notification:unread:count', { count });

    logger.debug('Notification count emitted', {
        category: LogCategory.CONNECTION,
        data: { userId, count },
    });
};