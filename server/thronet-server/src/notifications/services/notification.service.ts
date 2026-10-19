//src/notifications/services/notification.service.ts

import { v4 as uuidv4 } from 'uuid';
import Notification, { INotification } from '../models/Notification.model';
import { NotificationCacheRepository } from '@/shared/cache/notificationCache';
import { getIO } from '@/socket';
import { LoggerUtil as logger } from '@/shared/logger.util';
import Connection from '@/connections/models/Connection';
import User from '@/auth/models/User.model';
import { Follow } from '@/connections/models/Follow';
import ProfilePhoto from '@/Profile/models/ProfilePhoto.model';

class NotificationService {

    /**
     * Unified post notification.
     * Notifies ALL followers + ALL accepted connections of the poster.
     * Recipients who belong to both groups receive only ONE notification.
     */
    static async notifyPostRecipients(
        posterId: string,
        entryId: string,
        _postTitle: string
    ): Promise<void> {
        try {
            // ── 1. Poster profile ──────────────────────────────────────────
            const poster = await User.findOne({ userId: posterId })
                .select('firstName lastName profilePhotoId')
                .lean();
            if (!poster) return;

            const posterName = `${poster.firstName} ${(poster as any).lastName || ''}`.trim();

            // Resolve real Cloudinary URL (profilePhotoId is a UUID reference, not a URL)
            let posterPhoto: string | null = null;
            if ((poster as any).profilePhotoId) {
                const photoDoc = await ProfilePhoto.findOne({
                    photoId: (poster as any).profilePhotoId,
                }).select('cloudinarySecureUrl').lean();
                posterPhoto = (photoDoc as any)?.cloudinarySecureUrl || null;
            }

            // ── 2. Fetch followers + connections in parallel ───────────────
            const [followers, connections] = await Promise.all([
                Follow.find({
                    followingId: posterId,
                    status: 'active',
                    isBlocked: false,
                }).select('followerId').lean(),

                Connection.find({
                    $or: [{ fromUserId: posterId }, { toUserId: posterId }],
                    status: 'active',
                    isArchived: false,
                }).select('fromUserId toUserId').lean(),
            ]);

            const followerIds: string[] = followers.map((f: any) => f.followerId);
            const connectionIds: string[] = connections.map((c: any) =>
                c.fromUserId === posterId ? c.toUserId : c.fromUserId
            );



            // ── 3. Merge + deduplicate across both groups ──────────────────
            const allRecipientIds = [...new Set([...followerIds, ...connectionIds])];

            // Remove the poster themselves from recipients (safety guard)
            const candidateIds = allRecipientIds.filter((id) => id !== posterId);



            if (!candidateIds.length) return;

            // ── 4. Guard against re-insertion (e.g. retry) ────────────────
            const existingNotifs = await Notification.find({
                entityId: entryId,
                type: 'post_created',
                recipientId: { $in: candidateIds },
            }).select('recipientId').lean();

            const alreadyNotified = new Set(existingNotifs.map((n: any) => n.recipientId));
            const recipientIds = candidateIds.filter((id) => !alreadyNotified.has(id));



            if (!recipientIds.length) return;

            // ── 5. Build and insert notification documents ────────────────
            const message = `${posterName} created a new post.`;

            const docs = recipientIds.map((recipientId: string) => {
                const doc: any = {
                    notificationId: uuidv4(),
                    recipientId,
                    senderId: posterId,
                    senderName: posterName,
                    type: 'post_created',
                    entityId: entryId,
                    entityType: 'post',
                    message,
                    isRead: false,
                };
                if (posterPhoto) doc.senderPhoto = posterPhoto;
                return doc;
            });

            await Notification.insertMany(docs, { ordered: false });


            // ── 6. Real-time Socket.IO emit ────────────────────────────────
            try {
                const io = getIO();
                recipientIds.forEach((recipientId: string) => {
                    const payload = {
                        notificationId: docs.find((d: any) => d.recipientId === recipientId)?.notificationId,
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
                // Socket is non-critical — DB record already saved
                logger.warn('Socket emit failed for post notifications', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Post notifications sent', {
                posterId,
                entryId,
                followerCount: followerIds.length,
                connectionCount: connectionIds.length,
                uniqueRecipientCount: recipientIds.length,
            });
        } catch (err) {
            logger.error('notifyPostRecipients failed', {
                error: err instanceof Error ? err.message : 'unknown',
                posterId,
                entryId,
            });
        }
    }

    /**
     * Called by the PYMK cron job to notify a user about new connection suggestions.
     */
    static async notifyPymk(recipientId: string, suggestions: any[]): Promise<void> {
        try {
            if (!suggestions || suggestions.length === 0) return;

            const firstSuggestion = suggestions[0];
            const senderId = firstSuggestion.id;
            const senderName = firstSuggestion.name;
            const senderPhoto = firstSuggestion.image && firstSuggestion.image !== 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSdYRNQDghH1JvFXro2Yz3iWNmmFAubFZ-RGQ&s'
                ? firstSuggestion.image
                : null;

            let message = '';
            if (suggestions.length === 1) {
                message = `${suggestions[0].name} is on Throne8. Connect with them!`;
            } else if (suggestions.length === 2) {
                message = `${suggestions[0].name} and ${suggestions[1].name} are on Throne8. See your connection suggestions.`;
            } else {
                message = `${suggestions[0].name}, ${suggestions[1].name} and ${suggestions.length - 2} others you may know are on Throne8.`;
            }

            const entityIds = suggestions.map((s: any) => s.id);
            const notificationId = uuidv4();

            const doc = {
                notificationId,
                recipientId,
                senderId,
                senderName,
                senderPhoto,
                type: 'pymk_suggestion',
                entityId: senderId, // Main ID for frontend routing if needed
                entityIds,
                entityType: 'user',
                message,
                isRead: false,
            };

            await Notification.create(doc);

            try {
                const io = getIO();
                io.to(`user:${recipientId}`).emit('notification:new', {
                    ...doc,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for PYMK notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('PYMK notification sent', { recipientId, suggestionCount: suggestions.length });
        } catch (err) {
            logger.error('notifyPymk failed', {
                error: err instanceof Error ? err.message : 'unknown',
                recipientId,
            });
        }
    }


    /**
     * @deprecated Use notifyPostRecipients instead.
     * Kept for backward compatibility — delegates to the unified function.
     */
    static async notifyFollowersOnPost(
        posterId: string,
        entryId: string,
        postTitle: string
    ): Promise<void> {
        return NotificationService.notifyPostRecipients(posterId, entryId, postTitle);
    }

    /**
     * @deprecated Use notifyPostRecipients instead.
     * Kept for backward compatibility — delegates to the unified function.
     */
    static async notifyConnectionsOnPost(
        posterId: string,
        entryId: string,
        postTitle: string
    ): Promise<void> {
        return NotificationService.notifyPostRecipients(posterId, entryId, postTitle);
    }


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

    /**
     * Called after a post is reposted.
     * Notifies the original post owner (unless they reposted their own post).
     * Duplicate-repost protection is already enforced by Repost.hasUserReposted()
     * in repost.service.ts, but we add a belt-and-suspenders DB guard here to
     * prevent a duplicate notification in any edge-case retry scenario.
     */
    static async notifyPostReposted(
        postOwnerId: string,
        reposterId: string,
        originalPostEntryId: string
    ): Promise<void> {
        try {
            if (postOwnerId === reposterId) return; // don't notify yourself

            const reposter = await User.findOne({ userId: reposterId })
                .select('firstName lastName profilePhotoId')
                .lean();
            if (!reposter) return;

            const reposterName = `${reposter.firstName} ${(reposter as any).lastName || ''}`.trim();

            // Resolve real Cloudinary URL — profilePhotoId is a UUID ref, not a URL
            let reposterPhoto: string | null = null;
            if ((reposter as any).profilePhotoId) {
                const photoDoc = await ProfilePhoto.findOne({
                    photoId: (reposter as any).profilePhotoId,
                }).select('cloudinarySecureUrl').lean();
                reposterPhoto = (photoDoc as any)?.cloudinarySecureUrl || null;
            }

            const message = `${reposterName} reposted your post`;
            const notificationId = uuidv4();

            // Guard: only one repost-notification per (reposter, postOwner, post) pair
            const existing = await Notification.findOne({
                recipientId: postOwnerId,
                senderId: reposterId,
                type: 'post_reposted',
                entityId: originalPostEntryId,
            }).select('_id').lean();
            if (existing) return;

            await Notification.create({
                notificationId,
                recipientId: postOwnerId,
                senderId: reposterId,
                senderName: reposterName,
                senderPhoto: reposterPhoto,
                type: 'post_reposted' as const,
                entityId: originalPostEntryId,
                entityType: 'post' as const,
                message,
                isRead: false,
            });

            try {
                const io = getIO();
                io.to(`user:${postOwnerId}`).emit('notification:new', {
                    notificationId,
                    type: 'post_reposted',
                    senderId: reposterId,
                    senderName: reposterName,
                    senderPhoto: reposterPhoto,
                    entityId: originalPostEntryId,
                    entityType: 'post',
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for repost notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Repost notification sent', { postOwnerId, reposterId, originalPostEntryId });
        } catch (err) {
            logger.error('notifyPostReposted failed', {
                error: err instanceof Error ? err.message : 'unknown',
                postOwnerId,
                reposterId,
                originalPostEntryId,
            });
        }
    }


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

    /**
     * Called after a comment is liked.
     * Notifies the comment owner (unless they liked their own comment).
     */
    static async notifyCommentLiked(
        commentOwnerId: string,
        likerId: string,
        postId: string,
        commentId: string,
        postTitle?: string
    ): Promise<void> {
        try {
            if (commentOwnerId === likerId) return; // don't notify yourself

            const liker = await User.findOne({ userId: likerId }).select('firstName lastName profilePhotoId').lean();
            if (!liker) return;

            const likerName = `${liker.firstName} ${(liker as any).lastName || ''}`.trim();
            const likerPhoto = (liker as any).profilePhotoId || null;

            const shortTitle = postTitle ? `"${postTitle.slice(0, 60)}${postTitle.length > 60 ? '...' : ''}"` : 'a post';
            const message = `${likerName} liked your comment on ${shortTitle}`;

            const notificationId = uuidv4();
            const idempotencyKey = `comment_liked_${likerId}_${commentId}`;

            // Use findOneAndUpdate with upsert to prevent duplicates on unlike/re-like
            const existing = await Notification.findOne({ idempotencyKey }).lean();
            if (existing) {
                // Already notified for this like — update timestamp so it resurfaces
                await Notification.updateOne(
                    { idempotencyKey },
                    { $set: { isRead: false, senderName: likerName, senderPhoto: likerPhoto, message } }
                );
                return;
            }

            await Notification.create({
                notificationId,
                recipientId: commentOwnerId,
                senderId: likerId,
                senderName: likerName,
                senderPhoto: likerPhoto,
                type: 'comment_liked',
                entityId: postId,
                entityIds: [commentId],
                entityType: 'post',
                message,
                isRead: false,
                idempotencyKey,
            });

            try {
                const io = getIO();
                io.to(`user:${commentOwnerId}`).emit('notification:new', {
                    notificationId,
                    type: 'comment_liked',
                    senderId: likerId,
                    senderName: likerName,
                    senderPhoto: likerPhoto,
                    entityId: postId,
                    entityIds: [commentId],
                    entityType: 'post',
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for comment like notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Comment like notification sent', { commentOwnerId, likerId, commentId });
        } catch (err) {
            logger.error('notifyCommentLiked failed', {
                error: err instanceof Error ? err.message : 'unknown',
                commentOwnerId,
                likerId,
                commentId,
            });
        }
    }

    /**
     * Called after someone replies to a comment.
     * Notifies the parent comment owner (unless they replied to themselves).
     */
    static async notifyCommentReplied(
        commentOwnerId: string,
        replierId: string,
        postId: string,
        parentCommentId: string,
        replyCommentId: string,
        postTitle?: string
    ): Promise<void> {
        try {
            if (commentOwnerId === replierId) return; // don't notify yourself

            const replier = await User.findOne({ userId: replierId }).select('firstName lastName profilePhotoId').lean();
            if (!replier) return;

            const replierName = `${replier.firstName} ${(replier as any).lastName || ''}`.trim();
            const replierPhoto = (replier as any).profilePhotoId || null;

            const shortTitle = postTitle ? `"${postTitle.slice(0, 60)}${postTitle.length > 60 ? '...' : ''}"` : 'a post';
            const message = `${replierName} replied to your comment on ${shortTitle}`;

            const notificationId = uuidv4();

            await Notification.create({
                notificationId,
                recipientId: commentOwnerId,
                senderId: replierId,
                senderName: replierName,
                senderPhoto: replierPhoto,
                type: 'comment_replied',
                entityId: postId,
                entityIds: [parentCommentId, replyCommentId],
                entityType: 'post',
                message,
                isRead: false,
            });

            try {
                const io = getIO();
                io.to(`user:${commentOwnerId}`).emit('notification:new', {
                    notificationId,
                    type: 'comment_replied',
                    senderId: replierId,
                    senderName: replierName,
                    senderPhoto: replierPhoto,
                    entityId: postId,
                    entityIds: [parentCommentId, replyCommentId],
                    entityType: 'post',
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for comment reply notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Comment reply notification sent', { commentOwnerId, replierId, replyCommentId });
        } catch (err) {
            logger.error('notifyCommentReplied failed', {
                error: err instanceof Error ? err.message : 'unknown',
                commentOwnerId,
                replierId,
                replyCommentId,
            });
        }
    }

     /**
     * Removes a comment-like notification when the like is retracted (unlike).
     */
    static async removeCommentLikeNotification(likerId: string, commentId: string): Promise<void> {
        try {
            const idempotencyKey = `comment_liked_${likerId}_${commentId}`;
            await Notification.deleteOne({ idempotencyKey, isRead: false });
        } catch (err) {
            logger.warn('removeCommentLikeNotification failed', {
                error: err instanceof Error ? err.message : 'unknown',
                likerId,
                commentId,
            });
        }
    }

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

    /**
     * Called when User A follows User B (new follow, or reactivation of a
     * previously-unfollowed relationship — follow.service.ts calls this from
     * both followUser() paths). Notifies User B (unless following themselves).
     */
    static async notifyNewFollower(
        followerId: string,
        followingId: string
    ): Promise<void> {
        try {
            if (followerId === followingId) return;

            const follower = await User.findOne({ userId: followerId })
                .select('firstName lastName profilePhotoId')
                .lean();
            if (!follower) return;

            const followerName = `${follower.firstName} ${(follower as any).lastName || ''}`.trim();

            let followerPhoto: string | null = null;
            if ((follower as any).profilePhotoId) {
                const photoDoc = await ProfilePhoto.findOne({
                    photoId: (follower as any).profilePhotoId,
                }).select('cloudinarySecureUrl').lean();
                followerPhoto = (photoDoc as any)?.cloudinarySecureUrl || null;
            }

            const message = `${followerName} started following you`;
            const notificationId = uuidv4();

            // Guard against duplicate notifications on rapid unfollow/refollow —
            // only notify once per (follower, followingId) pair per rolling day.
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const existing = await Notification.findOne({
                recipientId: followingId,
                senderId: followerId,
                type: 'new_follower',
                createdAt: { $gte: oneDayAgo },
            }).select('_id').lean();
            if (existing) return;

            await Notification.create({
                notificationId,
                recipientId: followingId,
                senderId: followerId,
                senderName: followerName,
                senderPhoto: followerPhoto,
                type: 'new_follower' as const,
                entityId: followerId,
                entityType: 'user' as const,
                message,
                isRead: false,
            });

            try {
                const io = getIO();
                io.to(`user:${followingId}`).emit('notification:new', {
                    notificationId,
                    type: 'new_follower',
                    senderId: followerId,
                    senderName: followerName,
                    senderPhoto: followerPhoto,
                    entityId: followerId,
                    entityType: 'user',
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for new_follower notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('New follower notification sent', { followerId, followingId });
        } catch (err) {
            logger.error('notifyNewFollower failed', {
                error: err instanceof Error ? err.message : 'unknown',
                followerId,
                followingId,
            });
        }
    }

    /**
     * Called by the birthday/work-anniversary cron. Notifies every active
     * connection of `userId` that it's their birthday or work anniversary today.
     * One notification per (recipient, celebrant, occasion, day) — the cron
     * itself is responsible for only calling this once per user per day.
     */
    static async notifyBirthdayOrAnniversary(
        celebrantUserId: string,
        occasion: 'birthday' | 'work_anniversary',
        recipientIds: string[]
    ): Promise<void> {
        try {
            if (!recipientIds.length) return;

            const celebrant = await User.findOne({ userId: celebrantUserId })
                .select('firstName lastName profilePhotoId')
                .lean();
            if (!celebrant) return;

            const celebrantName = `${celebrant.firstName} ${(celebrant as any).lastName || ''}`.trim();

            let celebrantPhoto: string | null = null;
            if ((celebrant as any).profilePhotoId) {
                const photoDoc = await ProfilePhoto.findOne({
                    photoId: (celebrant as any).profilePhotoId,
                }).select('cloudinarySecureUrl').lean();
                celebrantPhoto = (photoDoc as any)?.cloudinarySecureUrl || null;
            }

            const message = occasion === 'birthday'
                ? `Today is ${celebrantName}'s birthday`
                : `Today is ${celebrantName}'s work anniversary`;

            const ids = recipientIds.filter((id) => id !== celebrantUserId);
            if (!ids.length) return;

            const docs = ids.map((recipientId: string) => ({
                notificationId: uuidv4(),
                recipientId,
                senderId: celebrantUserId,
                senderName: celebrantName,
                senderPhoto: celebrantPhoto,
                type: occasion,
                entityId: celebrantUserId,
                entityType: 'user' as const,
                message,
                isRead: false,
            }));

            await Notification.insertMany(docs, { ordered: false });

            try {
                const io = getIO();
                ids.forEach((recipientId: string) => {
                    const doc = docs.find((d) => d.recipientId === recipientId);
                    io.to(`user:${recipientId}`).emit('notification:new', {
                        notificationId: doc?.notificationId,
                        type: occasion,
                        senderId: celebrantUserId,
                        senderName: celebrantName,
                        senderPhoto: celebrantPhoto,
                        entityId: celebrantUserId,
                        entityType: 'user',
                        message,
                        isRead: false,
                        createdAt: new Date().toISOString(),
                    });
                });
            } catch (socketErr) {
                logger.warn(`Socket emit failed for ${occasion} notifications`, {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info(`${occasion} notifications sent`, {
                celebrantUserId,
                recipientCount: ids.length,
            });
        } catch (err) {
            logger.error('notifyBirthdayOrAnniversary failed', {
                error: err instanceof Error ? err.message : 'unknown',
                celebrantUserId,
                occasion,
            });
        }
    }

    /**
     * Notifies a single connection about a user's birthday.
     * Prevents duplicate notifications per recipient-celebrant-date using idempotencyKey.
     */
    static async notifyConnectionBirthday(
        recipientId: string,
        celebrantUserId: string
    ): Promise<void> {
        try {
            // Never notify the celebrant themselves
            if (!recipientId || !celebrantUserId || recipientId === celebrantUserId) {
                return;
            }

            // Generate today's Asia/Kolkata date string (YYYY-MM-DD)
            const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const idempotencyKey = `${recipientId}:${celebrantUserId}:connection_birthday:${todayDateStr}`;

            // Prevent duplicate notifications using the idempotency key (pre-check)
            const existing = await Notification.findOne({ idempotencyKey }).select('_id').lean();
            if (existing) {
                logger.debug('Birthday notification already exists for today, skipping', {
                    recipientId,
                    celebrantUserId,
                    idempotencyKey,
                });
                return;
            }

            // Fetch the celebrant from User using userId
            const celebrant = await User.findOne({ userId: celebrantUserId })
                .select('firstName lastName profilePhotoId')
                .lean();
            if (!celebrant) {
                logger.warn('notifyConnectionBirthday: celebrant not found', { celebrantUserId });
                return;
            }

            // Resolve firstName + lastName
            const celebrantName = `${celebrant.firstName} ${(celebrant as any).lastName || ''}`.trim();

            // Resolve profilePhotoId through ProfilePhoto and use cloudinarySecureUrl
            let celebrantPhoto: string | null = null;
            if ((celebrant as any).profilePhotoId) {
                const photoDoc = await ProfilePhoto.findOne({
                    photoId: (celebrant as any).profilePhotoId,
                }).select('cloudinarySecureUrl').lean();
                celebrantPhoto = (photoDoc as any)?.cloudinarySecureUrl || null;
            }

            const message = `Today is ${celebrantName}'s birthday 🎂`;
            const notificationId = uuidv4();

            try {
                await Notification.create({
                    notificationId,
                    recipientId,
                    senderId: celebrantUserId,
                    senderName: celebrantName,
                    senderPhoto: celebrantPhoto,
                    type: 'connection_birthday' as const,
                    entityId: celebrantUserId,
                    entityType: 'user' as const,
                    message,
                    isRead: false,
                    idempotencyKey,
                });
            } catch (createErr: any) {
                if (createErr.code === 11000) {
                    logger.info('Duplicate connection_birthday notification suppressed by unique index', {
                        idempotencyKey,
                        recipientId,
                        celebrantUserId,
                    });
                    return;
                }
                throw createErr;
            }

            // Emit notification:new through Socket.IO to user:${recipientId}
            try {
                const io = getIO();
                io.to(`user:${recipientId}`).emit('notification:new', {
                    notificationId,
                    type: 'connection_birthday',
                    senderId: celebrantUserId,
                    senderName: celebrantName,
                    senderPhoto: celebrantPhoto,
                    entityId: celebrantUserId,
                    entityType: 'user',
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr: any) {
                logger.warn('Socket emit failed for connection_birthday notification', {
                    recipientId,
                    celebrantUserId,
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Connection birthday notification sent successfully', {
                recipientId,
                celebrantUserId,
                idempotencyKey,
            });
        } catch (err: any) {
            logger.error('notifyConnectionBirthday failed', {
                recipientId,
                celebrantUserId,
                error: err instanceof Error ? err.message : 'unknown',
            });
        }
    }

    /**
     * Batch notification helper for connection birthdays.
     * Inserts documents with { ordered: false } to handle partial/duplicate cases safely,
     * and emits Socket.IO only for newly inserted notifications.
     */
    static async notifyConnectionBirthdaysBatch(
        celebrantUserId: string,
        recipientIds: string[]
    ): Promise<{ notifiedCount: number }> {
        try {
            if (!celebrantUserId || !recipientIds?.length) return { notifiedCount: 0 };

            // Remove self-references and duplicates
            const cleanRecipients = Array.from(
                new Set(recipientIds.filter((id) => id && id !== celebrantUserId))
            );
            if (!cleanRecipients.length) return { notifiedCount: 0 };

            const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

            // Check which idempotency keys already exist
            const possibleKeys = cleanRecipients.map(
                (rId) => `${rId}:${celebrantUserId}:connection_birthday:${todayDateStr}`
            );
            const existingDocs = await Notification.find({
                idempotencyKey: { $in: possibleKeys },
            }).select('idempotencyKey').lean();

            const existingKeySet = new Set(existingDocs.map((d: any) => d.idempotencyKey));
            const newRecipientIds = cleanRecipients.filter(
                (rId) => !existingKeySet.has(`${rId}:${celebrantUserId}:connection_birthday:${todayDateStr}`)
            );

            if (!newRecipientIds.length) {
                logger.debug('All connection birthday notifications already exist for today', {
                    celebrantUserId,
                    totalRecipients: cleanRecipients.length,
                });
                return { notifiedCount: 0 };
            }

            // Fetch celebrant info
            const celebrant = await User.findOne({ userId: celebrantUserId })
                .select('firstName lastName profilePhotoId')
                .lean();
            if (!celebrant) {
                logger.warn('notifyConnectionBirthdaysBatch: celebrant not found', { celebrantUserId });
                return { notifiedCount: 0 };
            }

            const celebrantName = `${celebrant.firstName} ${(celebrant as any).lastName || ''}`.trim();

            let celebrantPhoto: string | null = null;
            if ((celebrant as any).profilePhotoId) {
                const photoDoc = await ProfilePhoto.findOne({
                    photoId: (celebrant as any).profilePhotoId,
                }).select('cloudinarySecureUrl').lean();
                celebrantPhoto = (photoDoc as any)?.cloudinarySecureUrl || null;
            }

            const message = `Today is ${celebrantName}'s birthday 🎂`;

            const docsToInsert = newRecipientIds.map((recipientId) => ({
                notificationId: uuidv4(),
                recipientId,
                senderId: celebrantUserId,
                senderName: celebrantName,
                senderPhoto: celebrantPhoto,
                type: 'connection_birthday' as const,
                entityId: celebrantUserId,
                entityType: 'user' as const,
                message,
                isRead: false,
                idempotencyKey: `${recipientId}:${celebrantUserId}:connection_birthday:${todayDateStr}`,
            }));

            let insertedDocs: any[] = [];
            try {
                insertedDocs = await Notification.insertMany(docsToInsert, { ordered: false });
            } catch (insertErr: any) {
                if (insertErr.insertedDocs && Array.isArray(insertErr.insertedDocs)) {
                    insertedDocs = insertErr.insertedDocs;
                }
                logger.warn('Some birthday notifications may have been duplicate or errored in batch', {
                    celebrantUserId,
                    error: insertErr.message,
                });
            }

            const actuallyInserted = insertedDocs && insertedDocs.length > 0 ? insertedDocs : docsToInsert;

            // Emit Socket.IO only for newly inserted notifications
            try {
                const io = getIO();
                actuallyInserted.forEach((doc: any) => {
                    io.to(`user:${doc.recipientId}`).emit('notification:new', {
                        notificationId: doc.notificationId,
                        type: 'connection_birthday',
                        senderId: celebrantUserId,
                        senderName: celebrantName,
                        senderPhoto: celebrantPhoto,
                        entityId: celebrantUserId,
                        entityType: 'user',
                        message,
                        isRead: false,
                        createdAt: new Date().toISOString(),
                    });
                });
            } catch (socketErr: any) {
                logger.warn('Socket emit failed for connection_birthday batch', {
                    celebrantUserId,
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Connection birthday batch notifications processed', {
                celebrantUserId,
                attemptedCount: newRecipientIds.length,
                insertedCount: actuallyInserted.length,
            });

            return { notifiedCount: actuallyInserted.length };
        } catch (err: any) {
            logger.error('notifyConnectionBirthdaysBatch failed', {
                celebrantUserId,
                error: err instanceof Error ? err.message : 'unknown',
            });
            return { notifiedCount: 0 };
        }
    }

    /**
     * Called by the profile-view cron per-view-record.
     * Creates ONE Notification per viewer, named, with their real photo.
     * No grouping, no anonymous fallback, no "Someone / N people" text.
     */
    static async notifyProfileViewed(
        recipientId: string,
        viewerId: string,
        viewId: string
    ): Promise<void> {
        try {
            // Resolve the viewer's real name + photo
            const viewer = await User.findOne({ userId: viewerId })
                .select('firstName lastName profilePhotoId userId')
                .lean();

            if (!viewer) {
                logger.warn('notifyProfileViewed: viewer not found, skipping', { viewerId });
                return;
            }

            const senderName = `${(viewer as any).firstName} ${(viewer as any).lastName || ''}`.trim();

            let senderPhoto: string | null = null;
            if ((viewer as any).profilePhotoId) {
                const photoDoc = await ProfilePhoto.findOne({
                    photoId: (viewer as any).profilePhotoId,
                }).select('cloudinarySecureUrl').lean();
                senderPhoto = (photoDoc as any)?.cloudinarySecureUrl || null;
            }

            const message = `${senderName} viewed your profile`;
            const notificationId = uuidv4();

            await Notification.create({
                notificationId,
                recipientId,
                senderId: viewerId,
                senderName,
                senderPhoto,
                type: 'profile_viewed' as const,
                // entityId = viewerId so clicking navigates to the viewer's profile
                entityId: viewerId,
                entityType: 'user' as const,
                message,
                isRead: false,
            });

            // Emit real-time socket event if the recipient is online
            try {
                const io = getIO();
                io.to(`user:${recipientId}`).emit('notification:new', {
                    notificationId,
                    type: 'profile_viewed',
                    senderId: viewerId,
                    senderName,
                    senderPhoto,
                    entityId: viewerId,
                    entityType: 'user',
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for profile_viewed notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Profile viewed notification sent', {
                recipientId,
                viewerId,
                viewId,
            });
        } catch (err) {
            logger.error('notifyProfileViewed failed', {
                error: err instanceof Error ? err.message : 'unknown',
                recipientId,
                viewerId,
            });
        }
    }

    /**
 * Called by the profile-view digest cron. Groups multiple unnotified
 * viewers into ONE notification, LinkedIn-style:
 * "A, B and N others viewed your profile"
 */
    static async notifyProfileViewedBatch(
        recipientId: string,
        viewerIds: string[]
    ): Promise<void> {
        try {
            if (!viewerIds || viewerIds.length === 0) return;

            // Get unique viewer IDs (someone may have viewed multiple times)
            const uniqueViewerIds = Array.from(new Set(viewerIds));

            const viewers = await User.find({ userId: { $in: uniqueViewerIds } })
                .select('userId firstName lastName profilePhotoId')
                .lean();

            if (!viewers.length) return;

            // Build display names in the same order as uniqueViewerIds
            const viewerMap = new Map(viewers.map((v: any) => [v.userId, v]));
            const names = uniqueViewerIds
                .map((id) => {
                    const v: any = viewerMap.get(id);
                    return v ? `${v.firstName} ${v.lastName || ''}`.trim() : null;
                })
                .filter((n): n is string => !!n);

            if (!names.length) return;

            // First viewer's photo is used as the notification's icon
            const firstViewer: any = viewerMap.get(uniqueViewerIds[0]);
            let senderPhoto: string | null = null;
            if (firstViewer?.profilePhotoId) {
                const photoDoc = await ProfilePhoto.findOne({
                    photoId: firstViewer.profilePhotoId,
                }).select('cloudinarySecureUrl').lean();
                senderPhoto = (photoDoc as any)?.cloudinarySecureUrl || null;
            }

            let message = '';
            if (names.length === 1) {
                message = `${names[0]} viewed your profile`;
            } else if (names.length === 2) {
                message = `${names[0]} and ${names[1]} viewed your profile`;
            } else {
                message = `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length - 2 > 1 ? 's' : ''} viewed your profile`;
            }

            const notificationId = uuidv4();

            await Notification.create({
                notificationId,
                recipientId,
                senderId: uniqueViewerIds[0],
                senderName: names[0],
                senderPhoto,
                type: 'profile_viewed' as const,
                entityId: uniqueViewerIds[0],
                entityIds: uniqueViewerIds,
                entityType: 'user' as const,
                message,
                isRead: false,
            });

            try {
                const io = getIO();
                io.to(`user:${recipientId}`).emit('notification:new', {
                    notificationId,
                    type: 'profile_viewed',
                    senderId: uniqueViewerIds[0],
                    senderName: names[0],
                    senderPhoto,
                    entityId: uniqueViewerIds[0],
                    entityIds: uniqueViewerIds,
                    entityType: 'user',
                    message,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                });
            } catch (socketErr) {
                logger.warn('Socket emit failed for profile_viewed batch notification', {
                    error: socketErr instanceof Error ? socketErr.message : 'unknown',
                });
            }

            logger.info('Profile viewed BATCH notification sent', {
                recipientId,
                viewerCount: uniqueViewerIds.length,
            });
        } catch (err) {
            logger.error('notifyProfileViewedBatch failed', {
                error: err instanceof Error ? err.message : 'unknown',
                recipientId,
            });
        }
    }




    /** Fetch paginated notifications for a user */
    /** Fetch paginated notifications for a user (cached) */
    static async getNotifications(
        userId: string,
        page = 1,
        limit = 20
    ): Promise<{ notifications: INotification[]; unreadCount: number; total: number }> {
        // Try cache first
        const cached = await NotificationCacheRepository.getNotificationList(userId, page, limit);
        if (cached) {
            return cached as { notifications: INotification[]; unreadCount: number; total: number };
        }

        const skip = (page - 1) * limit;

        const [notifications, unreadCount, total] = await Promise.all([
            Notification.find({ recipientId: userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean<INotification[]>(),
            Notification.countDocuments({ recipientId: userId, isRead: false }),
            Notification.countDocuments({ recipientId: userId }),
        ]);

        const result = {
            notifications,
            unreadCount: Math.max(0, unreadCount),
            total,
        };

        // Cache both list and unread count
        await NotificationCacheRepository.setNotificationList(userId, page, limit, result);
        await NotificationCacheRepository.setUnreadCount(userId, result.unreadCount);

        return result;
    }

    /** Fetch unread count for user (cached) */
    static async getUnreadCount(userId: string): Promise<number> {
        const cached = await NotificationCacheRepository.getUnreadCount(userId);
        if (cached !== null) {
            return cached;
        }

        const count = await Notification.countDocuments({ recipientId: userId, isRead: false });
        const safeCount = Math.max(0, count);
        await NotificationCacheRepository.setUnreadCount(userId, safeCount);
        return safeCount;
    }

    /** Mark one notification as read */
    static async markAsRead(notificationId: string, userId: string): Promise<void> {
        await Notification.updateOne(
            { notificationId, recipientId: userId },
            { $set: { isRead: true } }
        );
        await NotificationCacheRepository.invalidateUser(userId);
    }

    /** Mark all notifications as read */
    static async markAllAsRead(userId: string): Promise<void> {
        await Notification.updateMany(
            { recipientId: userId, isRead: false },
            { $set: { isRead: true } }
        );
        await NotificationCacheRepository.invalidateUser(userId);
    }

    /** Delete a notification */
    static async deleteNotification(notificationId: string, userId: string): Promise<void> {
        await Notification.deleteOne({ notificationId, recipientId: userId });
        await NotificationCacheRepository.invalidateUser(userId);
    }
}

export default NotificationService;