import { Server, Socket } from 'socket.io';
import logger, { LogCategory } from '@/shared/logger.util';
import { AuthenticatedSocket } from '../index';
import { Notification } from '@/Mentorship/models';

const VALID_MODULES = ['senior-mentor', 'industry-mentor'] as const;

export const setupNotificationHandlers = (io: Server, socket: AuthenticatedSocket) => {
    const userId = socket.data.userId;
    if (!userId) return;

    // Join module room
    socket.on('notification:join:module', (data: { module: string }) => {
        if (!data?.module || !VALID_MODULES.includes(data.module as any)) return;
        socket.join(`user:${userId}:${data.module}`);
        logger.debug(`Socket joined module room: user:${userId}:${data.module}`);
    });

    // Leave module room
    socket.on('notification:leave:module', (data: { module: string }) => {
        if (!data?.module || !VALID_MODULES.includes(data.module as any)) return;
        socket.leave(`user:${userId}:${data.module}`);
        logger.debug(`Socket left module room: user:${userId}:${data.module}`);
    });

    // Mark one notification as read
    socket.on('notification:read', async (data: { notificationId: string; module?: string }) => {
        try {
            if (!data?.notificationId) return;
            const module = data.module && VALID_MODULES.includes(data.module as any) ? data.module : undefined;
            const query: any = { notificationId: data.notificationId, userId };
            if (module) query.module = module;

            await Notification.findOneAndUpdate(
                query,
                { $set: { 'status.read': true, 'status.readAt': new Date() } }
            );
            const countQuery: any = { userId, 'status.read': false };
            if (module) countQuery.module = module;
            const count = await Notification.countDocuments(countQuery);
            emitNotificationCount(io, userId, count, module);
        } catch (err) {
            logger.error('notification:read failed', err);
        }
    });

    // Mark ALL as read
    socket.on('notification:read:all', async (data?: { module?: string }) => {
        try {
            const module = data?.module && VALID_MODULES.includes(data.module as any) ? data.module : undefined;
            const query: any = { userId, 'status.read': false };
            if (module) query.module = module;

            await Notification.updateMany(
                query,
                { $set: { 'status.read': true, 'status.readAt': new Date() } }
            );
            emitNotificationCount(io, userId, 0, module);
        } catch (err) {
            logger.error('notification:read:all failed', err);
        }
    });

    // Get unread count on connect
    socket.on('notification:get:unread:count', async (data?: { module?: string }) => {
        try {
            const module = data?.module && VALID_MODULES.includes(data.module as any) ? data.module : undefined;
            const query: any = { userId, 'status.read': false };
            if (module) query.module = module;
            const count = await Notification.countDocuments(query);
            socket.emit('notification:unread:count', { count, module });
        } catch (err) { /* non-critical */ }
    });

    // Emit unread count immediately on connect
    setImmediate(async () => {
        try {
            const count = await Notification.countDocuments({ userId, 'status.read': false });
            socket.emit('notification:unread:count', { count });
        } catch (_) { }
    });
};

// Emit notification count update
export const emitNotificationCount = (
    io: Server,
    userId: string,
    count: number,
    module?: string
) => {
    const room = module ? `user:${userId}:${module}` : `user:${userId}`;
    io.to(room).emit('notification:unread:count', { count, ...(module ? { module } : {}) });

    logger.debug('Notification count emitted', {
        category: LogCategory.CONNECTION,
        data: { userId, count, module },
    });
};
