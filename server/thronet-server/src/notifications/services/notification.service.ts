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

    ////////Changed Modified
    /**
         * Called after a post is liked.
         * Notifies the post owner (unless they liked their own post).
         */
    static async notifyPostLiked(
        postOwnerId: string,
        likerId: string,
        entryId: string,
        postTitle?: string
    ): Promise<void> {
        try {
            if (postOwnerId === likerId) return; // don't notify yourself

            const liker = await User.findOne({ userId: likerId }).select('firstName lastName profilePhotoId').lean();
            if (!liker) return;

            const likerName = `${liker.firstName} ${liker.lastName || ''}`.trim();
            const likerPhoto = liker.profilePhotoId || null;

            const shortTitle = postTitle ? `"${postTitle.slice(0, 60)}${postTitle.length > 60 ? '...' : ''}"` : 'your post';
            const message = `${likerName} liked ${shortTitle}`;

            const notificationId = uuidv4();

            await Notification.create({
                notificationId,
                recipientId: postOwnerId,
                senderId: likerId,
                senderName: likerName,
                senderPhoto: likerPhoto,
                type: 'post_liked',
                entityId: entryId,
                entityType: 'post',
                message,
                isRead: false,
            });

            try {
                const io = getIO();
                io.to(`user:${postOwnerId}`).emit('notification:new', {
                    notificationId,
                    type: 'post_liked',
                    senderId: likerId,
                    senderName: likerName,
                    senderPhoto: likerPhoto,
                    entityId: entryId,
                    entityType: 'post',
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for like notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Like notification sent', { postOwnerId, likerId, entryId });
        } catch (err) {
            logger.error('notifyPostLiked failed', {
                error: err instanceof Error ? err.message : 'unknown',
                postOwnerId,
                likerId,
                entryId,
            });
        }
    }

    ////////////////////////////////Changed Modified
    /**
     * Called after a comment is added to a post.
     * Notifies the post owner (unless they commented on their own post).
     */
    static async notifyPostCommented(
        postOwnerId: string,
        commenterId: string,
        entryId: string,
        postTitle?: string,
        commentContent?: string
    ): Promise<void> {
        try {
            if (postOwnerId === commenterId) return; // don't notify yourself

            const commenter = await User.findOne({ userId: commenterId }).select('firstName lastName profilePhotoId').lean();
            if (!commenter) return;

            const commenterName = `${commenter.firstName} ${commenter.lastName || ''}`.trim();
            const commenterPhoto = commenter.profilePhotoId || null;

            const shortTitle = postTitle ? `"${postTitle.slice(0, 60)}${postTitle.length > 60 ? '...' : ''}"` : 'your post';
            const message = `${commenterName} commented on ${shortTitle}`;

            const notificationId = uuidv4();

            await Notification.create({
                notificationId,
                recipientId: postOwnerId,
                senderId: commenterId,
                senderName: commenterName,
                senderPhoto: commenterPhoto,
                type: 'post_commented',
                entityId: entryId,
                entityType: 'post',
                message,
                isRead: false,
            });

            try {
                const io = getIO();
                io.to(`user:${postOwnerId}`).emit('notification:new', {
                    notificationId,
                    type: 'post_commented',
                    senderId: commenterId,
                    senderName: commenterName,
                    senderPhoto: commenterPhoto,
                    entityId: entryId,
                    entityType: 'post',
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for comment notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Comment notification sent', { postOwnerId, commenterId, entryId });
        } catch (err) {
            logger.error('notifyPostCommented failed', {
                error: err instanceof Error ? err.message : 'unknown',
                postOwnerId,
                commenterId,
                entryId,
            });
        }
    }


    ////////////////////////////////Changed Modified
    /**
     * Called after someone is @mentioned in a post or comment.
     * Notifies the mentioned user (unless they mentioned themselves).
     */
    static async notifyMentioned(
        mentionedUserId: string,
        mentionerId: string,
        entryId: string,
        contextTitle?: string,
        context: 'post' | 'comment' = 'post'
    ): Promise<void> {
        try {
            if (mentionedUserId === mentionerId) return; // don't notify yourself

            const mentioner = await User.findOne({ userId: mentionerId }).select('firstName lastName profilePhotoId').lean();
            if (!mentioner) return;

            const mentionerName = `${mentioner.firstName} ${mentioner.lastName || ''}`.trim();
            const mentionerPhoto = mentioner.profilePhotoId || null;

            const shortTitle = contextTitle ? `"${contextTitle.slice(0, 60)}${contextTitle.length > 60 ? '...' : ''}"` : 'a post';
            const message = context === 'comment'
                ? `${mentionerName} mentioned you in a comment on ${shortTitle}`
                : `${mentionerName} mentioned you in ${shortTitle}`;

            const notificationId = uuidv4();

            await Notification.create({
                notificationId,
                recipientId: mentionedUserId,
                senderId: mentionerId,
                senderName: mentionerName,
                senderPhoto: mentionerPhoto,
                type: 'mentioned',
                entityId: entryId,
                entityType: context,
                message,
                isRead: false,
            });

            try {
                const io = getIO();
                io.to(`user:${mentionedUserId}`).emit('notification:new', {
                    notificationId,
                    type: 'mentioned',
                    senderId: mentionerId,
                    senderName: mentionerName,
                    senderPhoto: mentionerPhoto,
                    entityId: entryId,
                    entityType: context,
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for mention notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Mention notification sent', { mentionedUserId, mentionerId, entryId, context });
        } catch (err) {
            logger.error('notifyMentioned failed', {
                error: err instanceof Error ? err.message : 'unknown',
                mentionedUserId,
                mentionerId,
                entryId,
            });
        }
    }

    /**
     * Called when User A sends a connection request to User B.
     * Creates a persistent Notification for User B and emits notification:new.
     */
    static async notifyConnectionRequest(
        fromUserId: string,
        toUserId: string,
        requestId: string
    ): Promise<void> {
        try {
            if (fromUserId === toUserId) return;

            const sender = await User.findOne({ userId: fromUserId })
                .select('firstName lastName profilePhotoId')
                .lean();
            if (!sender) return;

            const senderName = `${sender.firstName} ${sender.lastName || ''}`.trim();
            const senderPhoto = (sender as any).profilePhotoId || null;
            const message = `${senderName} sent you a connection request`;
            const notificationId = uuidv4();

            await Notification.create({
                notificationId,
                recipientId: toUserId,
                senderId: fromUserId,
                senderName,
                senderPhoto,
                type: 'connection_request' as const,
                entityId: requestId,
                entityType: 'connection' as const,
                message,
                isRead: false,
            });

            try {
                const io = getIO();
                io.to(`user:${toUserId}`).emit('notification:new', {
                    notificationId,
                    type: 'connection_request',
                    senderId: fromUserId,
                    senderName,
                    senderPhoto,
                    entityId: requestId,
                    entityType: 'connection',
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for connection_request notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Connection request notification sent', { fromUserId, toUserId, requestId });
        } catch (err) {
            logger.error('notifyConnectionRequest failed', {
                error: err instanceof Error ? err.message : 'unknown',
                fromUserId,
                toUserId,
                requestId,
            });
        }
    }

    /**
     * Called when User B accepts User A's connection request.
     * Creates a persistent Notification for User A and emits notification:new.
     */
    static async notifyConnectionAccepted(
        acceptedByUserId: string,
        originalSenderId: string,
        connectionId: string
    ): Promise<void> {
        try {
            if (acceptedByUserId === originalSenderId) return;

            const acceptor = await User.findOne({ userId: acceptedByUserId })
                .select('firstName lastName profilePhotoId')
                .lean();
            if (!acceptor) return;

            const acceptorName = `${acceptor.firstName} ${acceptor.lastName || ''}`.trim();
            const acceptorPhoto = (acceptor as any).profilePhotoId || null;
            const message = `${acceptorName} accepted your connection request`;
            const notificationId = uuidv4();

            await Notification.create({
                notificationId,
                recipientId: originalSenderId,
                senderId: acceptedByUserId,
                senderName: acceptorName,
                senderPhoto: acceptorPhoto,
                type: 'connection_accepted' as const,
                entityId: connectionId,
                entityType: 'connection' as const,
                message,
                isRead: false,
            });

            try {
                const io = getIO();
                io.to(`user:${originalSenderId}`).emit('notification:new', {
                    notificationId,
                    type: 'connection_accepted',
                    senderId: acceptedByUserId,
                    senderName: acceptorName,
                    senderPhoto: acceptorPhoto,
                    entityId: connectionId,
                    entityType: 'connection',
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for connection_accepted notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Connection accepted notification sent', { acceptedByUserId, originalSenderId, connectionId });
        } catch (err) {
            logger.error('notifyConnectionAccepted failed', {
                error: err instanceof Error ? err.message : 'unknown',
                acceptedByUserId,
                originalSenderId,
                connectionId,
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
                .lean<INotification>(),
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