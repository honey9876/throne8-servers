/**
 * Comment Service - Business Logic for Comments
 * Handles comment operations on posts
 * 
 * @module services/comment.service
 * @version 1.2.0 (feed cache invalidation + @mentions)
 */

import { v4 as uuidv4 } from 'uuid';
import { Comment, Post, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import redisService from '@/services/redis.service';

////////////////////changed modified
import NotificationService from '@/notifications/services/notification.service';
// ==================== INTERFACES ====================

interface CreateCommentResult {
    commentId: string;
    postId: string;
    userId: string;
    content: string;
    likesCount: number;
    createdAt: Date;
}

// ==================== COMMENT SERVICE ====================

class CommentService {

    /**
     * ✅ Create new comment
     */
   static async createComment(
        userId: string,
        postId: string,
        content: string,
        parentCommentId?: string
    ): Promise<CreateCommentResult> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating comment', { userId, postId, correlationId });

            // Step 1: Validate post exists
            const post = await Post.findOne({ 'posts.entryId': postId, });
            if (!post) {
                throw new Error('Post not found');
            }

            const entry = post.posts.find((p: any) => p.entryId === postId && !p.isDeleted);
            if (!entry) throw new Error('Post not found');

            // Step 2: Validate user exists
            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            if (user.status !== 'active') {
                throw new Error('User account is not active');
            }

            let threadDepth = 0;

            if (parentCommentId) {
                const parentComment = await Comment.findOne({
                    commentId: parentCommentId,
                    isDeleted: false
                });

                if (!parentComment) {
                    throw new Error('Parent comment not found');
                }

                threadDepth = parentComment.threadDepth + 1;

                if (threadDepth > 5) {
                    throw new Error('Maximum thread depth reached');
                }

                parentComment.replyCount++;
                await parentComment.save();
            }

            const commentId = uuidv4();

            const comment = new Comment({
                commentId,
                postId,
                userId,
                content,
                parentCommentId,
                threadDepth
            });

            await comment.save();

            await Post.incrementComments(comment.postId);

            await User.findOneAndUpdate(
                { userId },
                {
                    $push: { 'activityIds.commentIds': commentId },
                    $inc: { 'activityStats.totalComments': 1 },
                },
                { new: true }
            );

            // ✅ Post-owner ka feed cache invalidate karo — nayi comment count
            // unki apni feed mein turant dikhe. Non-blocking rakha hai taaki
            // cache clear fail ho to bhi comment-creation flow fail na ho.
            const postOwnerId = post.userId;
            if (postOwnerId) {
                redisService.deleteByPattern(`feed:v1:${postOwnerId}:page:*`).catch(() => {});
            }

            // ✅ Notify post owner (non-blocking, skip if commenting on own post)
            if (postOwnerId && postOwnerId !== userId) {
                setImmediate(async () => {
                    try {
                        await NotificationService.notifyPostCommented(
                            postOwnerId,
                            userId,
                            postId,
                            entry?.title,
                            content
                        );
                        console.log('✅ [NOTIF] Post owner notified of comment:', postId);
                    } catch (err: any) {
                        console.warn('⚠️ [NOTIF] Comment notification failed (non-blocking):', err.message);
                    }
                });
            }

            // ✅ @mentions — comment content se mentioned userIds nikalo aur notify karo
            // Format: @[Display Name](userId) — regex se sirf userId (group 2) extract hota hai
            const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
            const mentionedUserIds = [...new Set(
                Array.from((content || '').matchAll(mentionRegex), m => m[2])
            )].filter(id => id !== userId);

            if (mentionedUserIds.length > 0) {
                setImmediate(async () => {
                    try {
                        for (const mentionedUserId of mentionedUserIds) {
                            await NotificationService.notifyMentioned(mentionedUserId, userId, postId, entry?.title, 'comment');
                        }
                        console.log('✅ [NOTIF] Mentioned users notified for comment:', commentId);
                    } catch (err: any) {
                        console.warn('⚠️ [NOTIF] Mention notification failed (non-blocking):', err.message);
                    }
                });
            }

            LoggerUtil.info('Comment created successfully', {
                commentId, postId, userId, correlationId,
            });

            return {
                commentId: comment.commentId,
                postId: comment.postId,
                userId: comment.userId,
                content: comment.content,
                likesCount: comment.likesCount,
                createdAt: comment.createdAt,
            };

       } catch (error: any) {
    console.error('🔴 RAW COMMENT ERROR:', error); // ✅ TEMPORARY DEBUG LINE
    LoggerUtil.error('Comment creation failed', {
        error: error.message,
        stack: error.stack,
        userId,
        postId,
        correlationId,
    });
    throw error;
}
    }

    /**
     * ✅ Get all comments for a post
     */
    static async getCommentsByPostId(postId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching comments for post', {
                postId,
                correlationId,
            });

            const comments = await Comment.findByPostId(postId);

            LoggerUtil.info('Comments fetched successfully', {
                postId,
                count: comments.length,
                correlationId,
            });

            return {
                comments,
                total: comments.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get comments by post failed', {
                error: error.message,
                postId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get all comments by user
     */
    static async getMyComments(userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching user comments', {
                userId,
                correlationId,
            });

            const comments = await Comment.findByUserId(userId);

            LoggerUtil.info('User comments fetched successfully', {
                userId,
                count: comments.length,
                correlationId,
            });

            return {
                comments,
                total: comments.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get my comments failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get all comments by a SPECIFIC user (public profile view)
     * Same as getMyComments but for any given userId, not just the
     * authenticated user — used when viewing someone else's profile.
     */
    static async getCommentsByUserId(userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching comments for specific user', {
                userId,
                correlationId,
            });

            const comments = await Comment.findByUserId(userId);

            LoggerUtil.info('User comments fetched successfully', {
                userId,
                count: comments.length,
                correlationId,
            });

            return {
                comments,
                total: comments.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get comments by userId failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get single comment by ID
     */
    static async getCommentById(commentId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching comment by ID', {
                commentId,
                correlationId,
            });

            const comment = await Comment.findByCommentId(commentId);

            if (!comment) {
                throw new Error('Comment not found');
            }

            LoggerUtil.info('Comment fetched successfully', {
                commentId,
                correlationId,
            });

            return comment;

        } catch (error: any) {
            LoggerUtil.error('Get comment by ID failed', {
                error: error.message,
                commentId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update comment
     */
    static async updateComment(
        commentId: string,
        userId: string,
        content: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating comment', {
                commentId,
                userId,
                correlationId,
            });

            const comment = await Comment.findOne({
                commentId,
                userId,
                isDeleted: false,
            });

            if (!comment) {
                throw new Error('Comment not found');
            }

            comment.content = content;
            await comment.save();

            LoggerUtil.info('Comment updated successfully', {
                commentId,
                userId,
                correlationId,
            });

            return comment;

        } catch (error: any) {
            LoggerUtil.error('Comment update failed', {
                error: error.message,
                commentId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete comment (soft or permanent)
     */
    static async deleteComment(
        commentId: string,
        userId: string,
        permanent: boolean = false
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting comment', {
                commentId,
                userId,
                permanent,
                correlationId,
            });

            const comment = await Comment.findOne({
                commentId,
                userId,
                isDeleted: false,
            });

            if (!comment) {
                throw new Error('Comment not found');
            }

            if (permanent) {
                // Permanent delete
                await Comment.deleteOne({ commentId });

                // Decrement post comment count
                await Post.decrementComments(comment.postId);

                // ✅ Feed cache invalidate — comment count updated feed mein turant reflect ho
                const ownerDoc = await Post.findOne({ 'posts.entryId': comment.postId });
                if (ownerDoc?.userId) {
                    redisService.deleteByPattern(`feed:v1:${ownerDoc.userId}:page:*`).catch(() => {});
                }

                LoggerUtil.info('Comment permanently deleted', {
                    commentId,
                    userId,
                    correlationId,
                });

                return {
                    commentId,
                    message: 'Comment permanently deleted',
                };
            } else {
                // Soft delete
                comment.isDeleted = true;
                comment.deletedAt = new Date();
                await comment.save();

                // Decrement post comment count
                await Post.decrementComments(comment.postId);

                // ✅ Feed cache invalidate
                const ownerDoc = await Post.findOne({ 'posts.entryId': comment.postId });
                if (ownerDoc?.userId) {
                    redisService.deleteByPattern(`feed:v1:${ownerDoc.userId}:page:*`).catch(() => {});
                }

                LoggerUtil.info('Comment soft deleted', {
                    commentId,
                    userId,
                    correlationId,
                });

                return {
                    commentId,
                    deletedAt: comment.deletedAt,
                    message: 'Comment deleted successfully',
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete comment failed', {
                error: error.message,
                commentId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore deleted comment
     */
    static async restoreComment(commentId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Restoring comment', {
                commentId,
                userId,
                correlationId,
            });

            const comment = await Comment.findOne({
                commentId,
                userId,
            });

            if (!comment) {
                throw new Error('Comment not found');
            }

            comment.isDeleted = false;
            comment.deletedAt = undefined;
            await comment.save();

            // Increment post comment count
            await Post.incrementComments(comment.postId);

            // ✅ Feed cache invalidate
            const ownerDoc = await Post.findOne({ 'posts.entryId': comment.postId });
            if (ownerDoc?.userId) {
                redisService.deleteByPattern(`feed:v1:${ownerDoc.userId}:page:*`).catch(() => {});
            }

            LoggerUtil.info('Comment restored successfully', {
                commentId,
                userId,
                correlationId,
            });

            return {
                commentId: comment.commentId,
                isDeleted: comment.isDeleted,
                message: 'Comment restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore comment failed', {
                error: error.message,
                commentId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Like comment
     */
    static async likeComment(commentId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Liking comment', {
                commentId,
                userId,
                correlationId,
            });

            const comment = await Comment.findOne({
                commentId,
                isDeleted: false,
            });

            if (!comment) {
                throw new Error('Comment not found');
            }

            if (comment.likedBy.includes(userId)) {
                throw new Error('Comment already liked');
            }

            comment.likedBy.push(userId);
            comment.likesCount++;
            await comment.save();

            LoggerUtil.info('Comment liked successfully', {
                commentId,
                userId,
                likesCount: comment.likesCount,
                correlationId,
            });

            return {
                commentId: comment.commentId,
                likesCount: comment.likesCount,
                message: 'Comment liked successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Like comment failed', {
                error: error.message,
                commentId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Unlike comment
     */
    static async unlikeComment(commentId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Unliking comment', {
                commentId,
                userId,
                correlationId,
            });

            const comment = await Comment.findOne({
                commentId,
                isDeleted: false,
            });

            if (!comment) {
                throw new Error('Comment not found');
            }

            const index = comment.likedBy.indexOf(userId);
            if (index === -1) {
                throw new Error('Comment not liked yet');
            }

            comment.likedBy.splice(index, 1);
            comment.likesCount = Math.max(0, comment.likesCount - 1);
            await comment.save();

            LoggerUtil.info('Comment unliked successfully', {
                commentId,
                userId,
                likesCount: comment.likesCount,
                correlationId,
            });

            return {
                commentId: comment.commentId,
                likesCount: comment.likesCount,
                message: 'Comment unliked successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Unlike comment failed', {
                error: error.message,
                commentId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
    * ✅ Add reaction to comment
    */
    static async addReaction(
        commentId: string,
        userId: string,
        reactionType: 'like' | 'celebrate' | 'support' | 'love' | 'insightful' | 'funny'
    ): Promise<any> {
        const comment = await Comment.findOne({ commentId, isDeleted: false });
        if (!comment) throw new Error('Comment not found');

        // Remove from all reaction types first
        Object.keys(comment.reactions).forEach(type => {
            const index = comment.reactions[type as keyof typeof comment.reactions].indexOf(userId);
            if (index > -1) {
                comment.reactions[type as keyof typeof comment.reactions].splice(index, 1);
                comment.reactionStats[type as keyof typeof comment.reactionStats]--;
            }
        });

        // Add new reaction
        comment.reactions[reactionType].push(userId);
        comment.reactionStats[reactionType]++;
        comment.reactionStats.totalReactions = Object.values(comment.reactionStats)
            .filter(v => typeof v === 'number')
            .reduce((sum: number, v) => sum + (v as number), 0);

        await comment.save();

        return {
            commentId: comment.commentId,
            reactions: comment.reactionStats,
            message: `Reacted with ${reactionType}`
        };
    }
}

export default CommentService;