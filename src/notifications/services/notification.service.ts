import { v4 as uuidv4 } from 'uuid';
import Notification, { INotification } from '../models/Notification.model';
import { getIO } from '@/socket';
import { LoggerUtil as logger } from '@/shared/logger.util';
import Connection from '@/connections/models/Connection';
import User from '@/auth/models/User.model';
import ProfilePhoto from '@/Profile/models/ProfilePhoto.model';

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
            let posterPhoto = null;
            if (poster.profilePhotoId) {
                const photo = await ProfilePhoto.findOne({ photoId: poster.profilePhotoId }).lean();
                if (photo) {
                    posterPhoto = photo.cloudinarySecureUrl;
                }
            }

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

    static async sendNotification(
        payload: {
            recipientId: string;
            senderId: string;
            type: 'post_created' | 'post_liked' | 'post_commented' | 'connection_request' | 'connection_accepted';
            entityId: string;
            entityType: 'post' | 'connection';
            message: string;
        }
    ): Promise<void> {
        try {
            const { recipientId, senderId, type, entityId, entityType, message } = payload;
            
            // 1. Get sender's profile
            const sender = await User.findOne({ userId: senderId }).select('firstName lastName profilePhotoId').lean();
            if (!sender) return;

            const senderName = `${sender.firstName} ${sender.lastName || ''}`.trim();
            let senderPhoto = null;
            if (sender.profilePhotoId) {
                const photo = await ProfilePhoto.findOne({ photoId: sender.profilePhotoId }).lean();
                if (photo) {
                    senderPhoto = photo.cloudinarySecureUrl;
                }
            }

            const doc = {
                notificationId: uuidv4(),
                recipientId,
                senderId,
                senderName,
                senderPhoto,
                type,
                entityId,
                entityType,
                message,
                isRead: false,
            };

            await Notification.create(doc);

            // Emit real-time event
            try {
                const io = getIO();
                io.to(`user:${recipientId}`).emit('notification:new', {
                    ...doc,
                    createdAt: new Date().toISOString(),
                });
                
                // Update unread count
                const unreadCount = await Notification.countDocuments({ recipientId, isRead: false });
                io.to(`user:${recipientId}`).emit('notification:unread:count', { count: unreadCount });
            } catch (socketErr) {
                logger.warn('Socket emit failed for notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info(`Notification sent to ${recipientId}`, { type, senderId, entityId });
        } catch (err) {
            logger.error('sendNotification failed', {
                error: err instanceof Error ? err.message : 'unknown',
                payload,
            });
        }
    }

    static async createConnectionNotification(
        recipientId: string,
        senderId: string,
        type: 'connection_request' | 'connection_accepted',
        connectionId: string
    ): Promise<void> {
        const message = type === 'connection_request' 
            ? 'sent you a connection request.'
            : 'accepted your connection request.';
            
        // The senderName is dynamically prefixed on the frontend, but we'll include it in the message just in case
        const sender = await User.findOne({ userId: senderId }).select('firstName lastName').lean();
        const senderName = sender ? `${sender.firstName} ${sender.lastName || ''}`.trim() : 'Someone';
        const fullMessage = `${senderName} ${message}`;

        await this.sendNotification({
            recipientId,
            senderId,
            type,
            entityId: connectionId,
            entityType: 'connection',
            message: fullMessage,
        });
    }

    /** Fetch paginated notifications for a user */
    static async getNotifications(
        userId: string,
        page = 1,
        limit = 20
    ): Promise<{ notifications: any[]; unreadCount: number; total: number }> {
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

        // Fix existing UUID senderPhotos
        const photoIds = notifications.map(n => n.senderPhoto).filter(p => p && !p.startsWith('http'));
        const photoMap = new Map();
        if (photoIds.length > 0) {
            const photos = await ProfilePhoto.find({ photoId: { $in: photoIds } }).lean();
            photos.forEach(p => photoMap.set(p.photoId, p.cloudinarySecureUrl));
        }

        const mappedNotifications = notifications.map(n => {
            if (n.senderPhoto && !n.senderPhoto.startsWith('http') && photoMap.has(n.senderPhoto)) {
                n.senderPhoto = photoMap.get(n.senderPhoto);
            }
            return n;
        });

        return { notifications: mappedNotifications, unreadCount, total };
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