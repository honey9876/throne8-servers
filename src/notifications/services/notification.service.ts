import { v4 as uuidv4 } from 'uuid';
import Notification, { INotification } from '../models/Notification.model';
import { getIO } from '@/socket';
import { LoggerUtil as logger } from '@/shared/logger.util';
import Connection from '@/connections/models/Connection';
import User from '@/auth/models/User.model';

class NotificationService {

    /**
     * Called after a post is created.
     * Finds all connections of the poster and sends them a real-time notification.
     */
    static async notifyConnectionsOnPost(
        posterId: string,
        entryId: string,
        postTitle: string
    ): Promise<void> {
        try {
            // 1. Get poster's profile
            const poster = await User.findOne({ userId: posterId }).select('firstName lastName profilePhotoId').lean();
            if (!poster) return;

            const posterName = `${poster.firstName} ${poster.lastName || ''}`.trim();
            const posterPhoto = poster.profilePhotoId || null;

            // 2. Get all active connections of the poster
            const connections = await Connection.find({
                $or: [{ fromUserId: posterId }, { toUserId: posterId }],
                status: 'active',
                isArchived: false,
            }).select('fromUserId toUserId').lean();

            if (!connections.length) return;

            // 3. Extract the "other" user in each connection
            const recipientIds = connections.map((conn) =>
                conn.fromUserId === posterId ? conn.toUserId : conn.fromUserId
            );

            const message = `${posterName} shared a new post: "${postTitle.slice(0, 60)}${postTitle.length > 60 ? '...' : ''}"`;

            // 4. Bulk insert notifications into DB
            const docs = recipientIds.map((recipientId) => ({
                notificationId: uuidv4(),
                recipientId,
                senderId: posterId,
                senderName: posterName,
                senderPhoto: posterPhoto,
                type: 'post_created' as const,
                entityId: entryId,
                entityType: 'post' as const,
                message,
                isRead: false,
            }));

            await Notification.insertMany(docs, { ordered: false });

            // 5. Emit real-time events via Socket.IO
            try {
                const io = getIO();
                recipientIds.forEach((recipientId) => {
                    const payload = {
                        notificationId: docs.find((d) => d.recipientId === recipientId)?.notificationId,
                        type: 'post_created',
                        senderId: posterId,
                        senderName: posterName,
                        senderPhoto: posterPhoto,
                        entityId: entryId,
                        entityType: 'post',
                        message,
                        isRead: false,
                        createdAt: new Date().toISOString(),
                    };
                    io.to(`user:${recipientId}`).emit('notification:new', payload);
                });
            } catch (socketErr) {
                // Socket not critical — DB record already saved
                logger.warn('Socket emit failed for post notifications', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Post notifications sent', {
                posterId,
                entryId,
                recipientCount: recipientIds.length,
            });
        } catch (err) {
            logger.error('notifyConnectionsOnPost failed', {
                error: err instanceof Error ? err.message : 'unknown',
                posterId,
                entryId,
            });
        }
    }

    /** Fetch paginated notifications for a user */
    static async getNotifications(
        userId: string,
        page = 1,
        limit = 20
    ): Promise<{ notifications: INotification[]; unreadCount: number; total: number }> {
        const skip = (page - 1) * limit;

        const [notifications, unreadCount, total] = await Promise.all([
            Notification.find({ recipientId: userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Notification.countDocuments({ recipientId: userId, isRead: false }),
            Notification.countDocuments({ recipientId: userId }),
        ]);

        return { notifications, unreadCount, total };
    }

    /** Mark one notification as read */
    static async markAsRead(notificationId: string, userId: string): Promise<void> {
        await Notification.updateOne(
            { notificationId, recipientId: userId },
            { $set: { isRead: true } }
        );
    }

    /** Mark all notifications as read */
    static async markAllAsRead(userId: string): Promise<void> {
        await Notification.updateMany(
            { recipientId: userId, isRead: false },
            { $set: { isRead: true } }
        );
    }

    /** Delete a notification */
    static async deleteNotification(notificationId: string, userId: string): Promise<void> {
        await Notification.deleteOne({ notificationId, recipientId: userId });
    }
}

export default NotificationService;