/**
 * Post Controller - Handles HTTP Requests for Posts
 * Architecture: One document per user, posts[] array inside
 *
 * @module controllers/post.controller
 * @version 2.2.0 (reach-based feed + connection status + user-specific posts)
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { PostService } from '@/shared/services/index.service';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { Post } from '@/shared/models/index.models';


// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
    sessionId?: string;
    deviceId?: string;
}

// ==================== POST CONTROLLER ====================

class PostController {

    /**
     * ✅ CREATE POST
     * POST /api/v1/activity/create-posts
     */
    static async createPost(
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
            const { title, content } = req.body;

            const files = (req.files as any) || {};
            const images = files.images || [];
            const videos = files.videos || [];
            const documents = files.documents || [];

            LoggerUtil.info('Create post request', {
                userId, title,
                imageCount: images.length,
                videoCount: videos.length,
                documentCount: documents.length,
                correlationId,
            });

            const result = await PostService.createPost(
                userId,
                {
                    title,
                    content,
                    pollData: req.body.pollData,
                    scheduledFor: req.body.scheduledFor,
                    eventData: req.body.eventData,
                },
                images,
                videos,
                documents
            );

            if (result.isScheduled) {
                ResponseUtil.created(
                    res,
                    { post: result },
                    `Post scheduled for ${result.scheduledFor}`
                );
                return;
            }

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'POST_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            entryId: result.entryId,
                            documentPostId: result.documentPostId,
                            mediaCount: images.length + videos.length + documents.length,
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
            LoggerUtil.info('Post created successfully', {
                userId,
                entryId: result.entryId,
                duration,
                correlationId,
            });

            ResponseUtil.created(res, { post: result }, 'Post created successfully');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Post creation failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId: req.user?.userId || null,
                        action: 'POST_CREATE_FAILED',
                        ipAddress: req.ip || 'unknown',
                        status: 'FAILURE',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: { error: error.message, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }
            if (error.message.includes('Maximum') || error.message.includes('dimensions')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production' ? 'Post creation failed' : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ GET ALL POSTS (current user ke saare posts)
     * GET /api/v1/activity/get-all/posts
     */
    static async getAllPosts(
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
            const includeArchived = req.query.includeArchived === 'true';

            const result = await PostService.getAllPosts(userId, includeArchived, userId);

            LoggerUtil.info('All posts fetched', {
                userId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Posts fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all posts failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET POSTS BY USER ID (public/other-user profile view)
     * GET /api/v1/activity/posts/user/:userId
     *
     * Requester must still be authenticated (so we know WHO is viewing —
     * needed for isLikedByCurrentUser etc.) but the posts returned belong
     * to the :userId in the URL, NOT to req.user.userId. This is what
     * powers the "Activity" section on someone else's profile page.
     */
    static async getUserPostsById(
        req: Request<{ userId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const targetUserId = req.params.userId;
            const requestingUserId = req.user.userId;

            if (!targetUserId) {
                ResponseUtil.badRequest(res, 'User ID is required');
                return;
            }

            // Visitors should never see archived/deleted posts of someone else,
            // regardless of any query param they try to pass.
            const includeArchived = targetUserId === requestingUserId
                ? req.query.includeArchived === 'true'
                : false;

            const result = await PostService.getAllPosts(
                targetUserId,       // whose posts to fetch
                includeArchived,
                requestingUserId    // used for isLikedByCurrentUser flag
            );

            LoggerUtil.info('User posts fetched (by userId)', {
                targetUserId,
                requestingUserId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Posts fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get user posts by id failed', {
                error: error.message,
                targetUserId: req.params.userId,
                requestingUserId: req.user?.userId,
                correlationId,
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL POSTS FOR HOME FEED (sabhi users ke posts — reach-based ranking)
     * GET /api/v1/activity/posts/feed/all?page=1&limit=20
     */
    static async getAllPostsForHome(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const currentUserId = req.user.userId;
            const includeArchived = req.query.includeArchived === 'true';
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;

            const result = await PostService.getAllPostsForHome(currentUserId, includeArchived, page, limit);

            LoggerUtil.info('Home feed posts fetched', {
                currentUserId,
                totalPosts: result.total,
                page,
                correlationId,
            });

            ResponseUtil.success(res, result, 'All posts fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all posts for home failed', {
                error: error.message,
                currentUserId: req.user?.userId,
                correlationId,
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET POST BY ID (entryId)
     * GET /api/v1/activity/get-post/:postId
     */
    static async getPostById(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const entryId = req.params.postId;

            if (!entryId) {
                ResponseUtil.badRequest(res, 'Post ID is required');
                return;
            }

            const post = await PostService.getPostById(entryId, userId);

            ResponseUtil.success(res, { post }, 'Post fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get post failed', {
                error: error.message,
                entryId: req.params.postId,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ VOTE ON POLL
     * POST /api/v1/activity/posts/:postId/vote
     */
    static async votePoll(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const entryId = req.params.postId;
            const userId = req.user.userId;
            const { optionId } = req.body;

            if (!entryId) {
                ResponseUtil.badRequest(res, 'Post ID is required');
                return;
            }
            if (!optionId) {
                ResponseUtil.badRequest(res, 'Option ID is required');
                return;
            }

            LoggerUtil.info('Vote poll request', { entryId, userId, optionId, correlationId });

            const result = await PostService.votePoll(entryId, userId, optionId);

            LoggerUtil.info('Poll vote recorded', {
                entryId,
                userId,
                totalVotes: result.pollData.totalVotes,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Vote recorded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Vote poll failed', {
                error: error.message,
                entryId: req.params.postId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Poll not found') {
                ResponseUtil.notFound(res, 'Poll not found');
                return;
            }
            if (error.message === 'Poll has ended') {
                ResponseUtil.badRequest(res, 'This poll has ended');
                return;
            }
            if (error.message === 'You have already voted') {
                ResponseUtil.badRequest(res, 'You have already voted on this poll');
                return;
            }
            if (error.message === 'Invalid option') {
                ResponseUtil.badRequest(res, 'Invalid poll option selected');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE POST
     * PUT /api/v1/activity/update-post/:postId
     */
    static async updatePost(
        req: Request<{ postId: string }> & { user?: UserPayload },
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
            const entryId = req.params.postId;
            const { title, content } = req.body;
            const ipAddress = req.ip || 'unknown';

            if (!entryId) {
                ResponseUtil.badRequest(res, 'Post ID is required');
                return;
            }

            const result = await PostService.updatePost(entryId, userId, { title, content });

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'POST_UPDATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: { entryId: result.entryId, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Post updated successfully', {
                userId, entryId: result.entryId, duration, correlationId,
            });

            ResponseUtil.success(res, { post: result }, 'Post updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Post update failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                entryId: req.params.postId,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production' ? 'Post update failed' : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ DELETE POST
     * DELETE /api/v1/activity/delete-post/:postId
     */
    static async deletePost(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const entryId = req.params.postId;
            const permanent = req.query.permanent === 'true';
            const ipAddress = req.ip || 'unknown';

            const result = await PostService.deletePost(entryId, userId, permanent);

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'POST_DELETED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: { entryId, permanent, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            ResponseUtil.success(res, result, 'Post deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete post failed', {
                error: error.message,
                entryId: req.params.postId,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE POST
     * POST /api/v1/activity/posts/:postId/archive
     */
    static async archivePost(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const entryId = req.params.postId;

            const result = await PostService.archivePost(entryId, userId);

            ResponseUtil.success(res, result, 'Post archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive post failed', { error: error.message, correlationId });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            if (error.message === 'Post is already archived') {
                ResponseUtil.badRequest(res, 'Post is already archived');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE POST
     * POST /api/v1/activity/posts/:postId/restore
     */
    static async restorePost(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const entryId = req.params.postId;

            const result = await PostService.restorePost(entryId, userId);

            ResponseUtil.success(res, result, 'Post restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore post failed', { error: error.message, correlationId });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ PIN POST
     * PUT /api/v1/activity/posts/:postId/pin
     */
    static async pinPost(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const entryId = req.params.postId;
            const { isPinned } = req.body;

            const result = await PostService.pinPost(entryId, userId, isPinned);

            ResponseUtil.success(res, result, `Post ${isPinned ? 'pinned' : 'unpinned'} successfully`);
            return;

        } catch (error: any) {
            LoggerUtil.error('Pin post failed', { error: error.message, correlationId });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ SAVE POST
     * PUT /api/v1/activity/posts/:postId/save
     */
    static async savePost(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const entryId = req.params.postId;
            const { isSaved } = req.body;

            const result = await PostService.savePost(entryId, userId, isSaved);

            ResponseUtil.success(res, result, `Post ${isSaved ? 'saved' : 'unsaved'} successfully`);
            return;

        } catch (error: any) {
            LoggerUtil.error('Save post failed', { error: error.message, correlationId });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

   /**
     * ✅ NEW: GET SAVED POSTS (current logged-in user ke)
     * GET /api/v1/activity/posts/saved
     */
   static async getSavedPosts(
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
        const result = await PostService.getSavedPosts(userId);

        LoggerUtil.info('Saved posts fetched', { userId, count: result.total, correlationId });

        ResponseUtil.success(res, result, 'Saved posts fetched successfully');
        return;

    } catch (error: any) {
        LoggerUtil.error('Get saved posts failed', {
            error: error.message,
            userId: req.user?.userId,
            correlationId,
        });
        ResponseUtil.internalError(res, error.message, error);
        return;
    }
}

/**
 * ✅ GET POST ANALYTICS
 * GET /api/v1/activity/posts/:postId/analytics
 */
static async getPostAnalytics(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const entryId = req.params.postId;

            if (!entryId) {
                ResponseUtil.badRequest(res, 'Post ID is required');
                return;
            }

            const post = await PostService.getPostById(entryId, userId);

            const analytics = {
                entryId: post.entryId,
                title: post.title,
                createdAt: post.createdAt,
                isFreshContent: post.isFreshContent,
                contentClassification: post.contentClassification,
                postTimeScore: post.postTimeScore,
                userActiveHourMatch: post.userActiveHourMatch,
                likesCount: post.likesCount,
                commentsCount: post.commentsCount,
                performanceHistory: post.performanceHistory,
                qualityMetrics: post.qualityMetrics,
                analytics: post.analytics,
                hasExternalLinkPenalty: post.hasExternalLinkPenalty,
                linkPreviewQuality: post.linkPreviewQuality,
                isShadowbanned: post.isShadowbanned,
                shadowbanReason: post.shadowbanReason,
            };

            ResponseUtil.success(res, { analytics }, 'Post analytics fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get post analytics failed', {
                error: error.message,
                entryId: req.params.postId,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET USER POSTS PERFORMANCE
     * GET /api/v1/activity/posts/user/performance
     */
    static async getUserPostsPerformance(
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
            const limit = parseInt(req.query.limit as string) || 10;

            const result = await PostService.getRecentPostsPerformance(userId, limit);

            ResponseUtil.success(res, result, 'Posts performance fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get posts performance failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ TRACK POST VIEW
     * POST /api/v1/activity/posts/:postId/track-view
     */
    static async trackPostView(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const entryId = req.params.postId;
            const { dwellTime, expanded } = req.body;

            if (!entryId) {
                ResponseUtil.badRequest(res, 'Post ID is required');
                return;
            }

            const result = await PostService.trackPostView(
                entryId,
                userId,
                dwellTime || 0,
                expanded || false
            );

            ResponseUtil.success(res, { analytics: result.analytics }, 'View tracked successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Track post view failed', {
                error: error.message,
                entryId: req.params.postId,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ LIKE POST
     * POST /api/v1/activity/posts/:postId/like
     */
    static async likePost(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const entryId = req.params.postId;
            const userId = req.user.userId;

            LoggerUtil.info('Like post request', { entryId, userId, correlationId });

            const result = await PostService.likePost(entryId, userId);

            LoggerUtil.info('Post liked successfully', { entryId, userId, correlationId });

            ResponseUtil.success(res, result, 'Post liked successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Like post failed', {
                error: error.message,
                entryId: req.params.postId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            if (error.message === 'You have already liked this post') {
                ResponseUtil.badRequest(res, 'You have already liked this post');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UNLIKE POST
     * DELETE /api/v1/activity/posts/:postId/like
     */
    static async unlikePost(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const entryId = req.params.postId;
            const userId = req.user.userId;

            LoggerUtil.info('Unlike post request', { entryId, userId, correlationId });

            const result = await PostService.unlikePost(entryId, userId);

            LoggerUtil.info('Post unliked successfully', { entryId, userId, correlationId });

            ResponseUtil.success(res, result, 'Post unliked successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Unlike post failed', {
                error: error.message,
                entryId: req.params.postId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            if (error.message === 'You have not liked this post') {
                ResponseUtil.badRequest(res, 'You have not liked this post');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REACT TO POST
     * POST /api/v1/activity/posts/:postId/react
     * body: { type: 'like' | 'celebrate' | 'support' | 'love' | 'insightful' | 'funny' }
     */
    static async reactToPost(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const entryId = req.params.postId;
            const userId = req.user.userId;
            const { type } = req.body;

            if (!type) {
                ResponseUtil.badRequest(res, 'Reaction type is required');
                return;
            }

            const result = await PostService.reactToPost(entryId, userId, type);

            ResponseUtil.success(res, result, 'Reaction added successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('React to post failed', {
                error: error.message,
                entryId: req.params.postId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            if (error.message === 'Invalid reaction type') {
                ResponseUtil.badRequest(res, 'Invalid reaction type');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REMOVE REACTION
     * DELETE /api/v1/activity/posts/:postId/react
     */
    static async removeReaction(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const entryId = req.params.postId;
            const userId = req.user.userId;

            const result = await PostService.removeReaction(entryId, userId);

            ResponseUtil.success(res, result, 'Reaction removed successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Remove reaction failed', {
                error: error.message,
                entryId: req.params.postId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET USER REACTIONS (for "Reactions" activity tab)
     * GET /api/v1/activity/reactions/user/:userId
     */
    static async getUserReactions(
        req: Request<{ userId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const targetUserId = req.params.userId;
            const result = await PostService.getUserReactions(targetUserId);

            ResponseUtil.success(res, result, 'Reactions fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get user reactions failed', {
                error: error.message,
                targetUserId: req.params.userId,
                correlationId,
            });
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ NEW: Get all users who reacted to a specific post (Reactions modal)
     * GET /api/v1/activity/posts/:postId/reactors
     */
    static async getPostReactors(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const entryId = req.params.postId;
            if (!entryId) {
                ResponseUtil.badRequest(res, 'Post ID is required');
                return;
            }

            const result = await PostService.getPostReactors(entryId);

            ResponseUtil.success(res, result, 'Reactors fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get post reactors failed', {
                error: error.message,
                entryId: req.params.postId,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RECORD POST SEND
     * POST /api/v1/profile/activity/posts/:postId/record-send
     */
    static async recordSend(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const entryId = req.params.postId;
            const userId = req.user.userId;
            const { recipientCount } = req.body;

            if (!entryId) {
                ResponseUtil.badRequest(res, 'Post ID is required');
                return;
            }

            const result = await PostService.recordSend(entryId, userId, recipientCount || 1);

            ResponseUtil.success(res, result, 'Post send recorded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Record post send failed', {
                error: error.message,
                entryId: req.params.postId,
                correlationId,
            });

            if (error.message === 'Post not found') {
                ResponseUtil.notFound(res, 'Post not found');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default PostController;