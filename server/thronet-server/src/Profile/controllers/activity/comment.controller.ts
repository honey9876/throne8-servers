/**
 * Comment Controller - Handles HTTP Requests for Comments
 * Supports CREATE, READ, UPDATE, DELETE, RESTORE, LIKE, UNLIKE operations
 * 
 * @module controllers/comment.controller
 * @version 1.0.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CommentService } from '@/shared/services/index.service';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { Comment } from '@/shared/models/index.models';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
    sessionId?: string;
    deviceId?: string;
}

// ==================== COMMENT CONTROLLER ====================

class CommentController {

    /**
     * ✅ CREATE COMMENT
     * POST /api/v1/activity/create-comment/comments
     * 
     * @access Private
     */
    static async createComment(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const ipAddress = req.ip || 'unknown';
            const { postId, content } = req.body;

            LoggerUtil.info('Create comment request', {
                userId,
                postId,
                correlationId,
            });

            const result = await CommentService.createComment(
                userId,
                postId,
                content
            );

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'COMMENT_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            commentId: result.commentId,
                            postId: result.postId,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Comment created successfully', {
                userId,
                commentId: result.commentId,
                duration,
                correlationId,
            });

            ResponseUtil.created(
                res,
                { comment: result },
                'Comment created successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Comment creation failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            // Audit log for error
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId: req.user?.userId || null,
                        action: 'COMMENT_CREATE_FAILED',
                        ipAddress: req.ip || 'unknown',
                        status: 'FAILURE',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            error: error.message,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }

            ResponseUtil.internalError(
                res,
                error.message,
                error
            );
            return;
        }
    }

    static async createReply(
        req: Request<{ commentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const ipAddress = req.ip || 'unknown';
            const { commentId } = req.params;
            const { content } = req.body;

            if (!commentId) {
                ResponseUtil.badRequest(res, 'Comment ID is required');
                return;
            }

            if (!content || content.trim().length === 0) {
                ResponseUtil.badRequest(res, 'Reply content is required');
                return;
            }

            LoggerUtil.info('Create reply request', { userId, commentId, correlationId });

            // ✅ Comment model ab import hai - ye kaam karega
            const parentComment = await Comment.findOne({ commentId, isDeleted: false });
            if (!parentComment) {
                ResponseUtil.notFound(res, 'Comment not found');
                return;
            }

            // ✅ CommentService.createComment reuse with parentCommentId
            const result = await CommentService.createComment(
                userId,
                parentComment.postId,
                content.trim(),
                commentId   // parentCommentId
            );

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'COMMENT_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            commentId: result.commentId,
                            parentCommentId: commentId,
                            postId: result.postId,
                            type: 'reply',
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Reply created successfully', {
                userId,
                replyCommentId: result.commentId,
                parentCommentId: commentId,
                duration,
                correlationId,
            });

            ResponseUtil.created(
                res,
                { comment: result },
                'Reply created successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;
            LoggerUtil.error('Reply creation failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            if (error.message === 'Parent comment not found') {
                ResponseUtil.notFound(res, 'Parent comment not found');
                return;
            }
            if (error.message === 'Maximum thread depth reached') {
                ResponseUtil.badRequest(res, 'Maximum reply depth reached (max 5 levels)');
                return;
            }
            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }
            if (error.message === 'User account is not active') {
                ResponseUtil.forbidden(res, 'User account is not active');
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Reply creation failed'
                    : error.message,
                error
            );
            return;
        }
    }


    /**
     * ✅ GET COMMENTS BY POST ID
     * GET /api/v1/activity/posts/:postId/comments
     */
    static async getCommentsByPostId(
        req: Request<{ postId: string }>,
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { postId } = req.params;

            if (!postId) {
                ResponseUtil.badRequest(res, 'Post ID is required');
                return;
            }

            const result = await CommentService.getCommentsByPostId(postId);

            LoggerUtil.info('Comments fetched for post', {
                postId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Comments fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get comments failed', {
                error: error.message,
                postId: req.params.postId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET COMMENTS BY USER ID (public profile view)
     * GET /api/v1/activity/comments/user/:userId
     * @access Private (any logged-in user can view someone else's public comments)
     */
    static async getCommentsByUserId(
        req: Request<{ userId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { userId } = req.params;

            if (!userId) {
                ResponseUtil.badRequest(res, 'User ID is required');
                return;
            }

            const result = await CommentService.getCommentsByUserId(userId);

            LoggerUtil.info('Comments fetched for specific user', {
                userId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Comments fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get comments by userId failed', {
                error: error.message,
                userId: req.params.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET MY COMMENTS
     * GET /api/v1/activity/comments/my-comments
     */
    static async getMyComments(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;

            const result = await CommentService.getMyComments(userId);

            LoggerUtil.info('User comments fetched', {
                userId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Comments fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get my comments failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET COMMENT BY ID
     * GET /api/v1/activity/comments/:commentId
     */
    static async getCommentById(
        req: Request<{ commentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { commentId } = req.params;

            if (!commentId) {
                ResponseUtil.badRequest(res, 'Comment ID is required');
                return;
            }

            const comment = await CommentService.getCommentById(commentId);

            ResponseUtil.success(
                res,
                { comment },
                'Comment fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get comment failed', {
                error: error.message,
                commentId: req.params.commentId,
                correlationId,
            });

            if (error.message === 'Comment not found') {
                ResponseUtil.notFound(res, 'Comment not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE COMMENT
     * PUT /api/v1/activity/comments/:commentId
     */
    static async updateComment(
        req: Request<{ commentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { commentId } = req.params;
            const { content } = req.body;

            if (!commentId) {
                ResponseUtil.badRequest(res, 'Comment ID is required');
                return;
            }

            LoggerUtil.info('Update comment request', {
                userId,
                commentId,
                correlationId,
            });

            const result = await CommentService.updateComment(
                commentId,
                userId,
                content
            );

            const duration = Date.now() - startTime;
            LoggerUtil.info('Comment updated successfully', {
                userId,
                commentId: result.commentId,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                { comment: result },
                'Comment updated successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Comment update failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                commentId: req.params.commentId,
                duration,
                correlationId,
            });

            if (error.message === 'Comment not found') {
                ResponseUtil.notFound(res, 'Comment not found');
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Comment update failed'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ DELETE COMMENT
     * DELETE /api/v1/activity/comments/:commentId
     */
    static async deleteComment(
        req: Request<{ commentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { commentId } = req.params;
            const permanent = req.query.permanent === 'true';
            const ipAddress = req.ip || 'unknown';

            const result = await CommentService.deleteComment(commentId, userId, permanent);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'COMMENT_DELETED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: { commentId, permanent, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            ResponseUtil.success(res, result, 'Comment deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete comment failed', {
                error: error.message,
                commentId: req.params.commentId,
                correlationId,
            });

            if (error.message === 'Comment not found') {
                ResponseUtil.notFound(res, 'Comment not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE COMMENT
     * POST /api/v1/activity/comments/:commentId/restore
     */
    static async restoreComment(
        req: Request<{ commentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { commentId } = req.params;

            const result = await CommentService.restoreComment(commentId, userId);

            ResponseUtil.success(res, result, 'Comment restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore comment failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Comment not found') {
                ResponseUtil.notFound(res, 'Comment not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ LIKE COMMENT
     * POST /api/v1/activity/comments/:commentId/like
     */
    static async likeComment(
        req: Request<{ commentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { commentId } = req.params;

            const result = await CommentService.likeComment(commentId, userId);

            ResponseUtil.success(res, result, 'Comment liked successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Like comment failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Comment not found') {
                ResponseUtil.notFound(res, 'Comment not found');
                return;
            }

            if (error.message === 'Comment already liked') {
                ResponseUtil.badRequest(res, 'Comment already liked');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UNLIKE COMMENT
     * DELETE /api/v1/activity/comments/:commentId/like
     */
    static async unlikeComment(
        req: Request<{ commentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { commentId } = req.params;

            const result = await CommentService.unlikeComment(commentId, userId);

            ResponseUtil.success(res, result, 'Comment unliked successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Unlike comment failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Comment not found') {
                ResponseUtil.notFound(res, 'Comment not found');
                return;
            }

            if (error.message === 'Comment not liked yet') {
                ResponseUtil.badRequest(res, 'Comment not liked yet');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default CommentController;