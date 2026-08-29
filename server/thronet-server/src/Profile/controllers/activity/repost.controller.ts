// src/Profile/controllers/repost.controller.ts

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { RepostService } from '@/Profile/services';

interface UserPayload {
    userId: string;
    role: string;
    email: string;
}

class RepostController {

    /**
     * POST /api/v1/profile/activity/posts/:entryId/repost
     */
    static async createRepost(
        req: Request<{ entryId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { entryId } = req.params;
            const {
                type = 'repost',
                thoughtText,
                visibility = 'public',
                repostSource = 'feed',
            } = req.body;

            const result = await RepostService.createRepost(
                req.user.userId,
                entryId,
                type,
                thoughtText,
                visibility,
                repostSource
            );

            ResponseUtil.created(res, { repost: result }, result.message);

        } catch (error: any) {
            LoggerUtil.error('Create repost failed', {
                error: error.message, correlationId
            });

            if (error.message === 'Original post not found') {
                ResponseUtil.notFound(res, 'Original post not found');
                return;
            }
            if (error.message === 'You have already reposted this post') {
                ResponseUtil.badRequest(res, 'You have already reposted this post');
                return;
            }
            if (error.message === 'Thought text is required for quote repost') {
                ResponseUtil.badRequest(res, 'Thought text is required for quote repost');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
        }
    }

    /**
     * DELETE /api/v1/profile/activity/posts/reposts/:repostId
     */
    static async deleteRepost(
        req: Request<{ repostId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const result = await RepostService.deleteRepost(
                req.params.repostId,
                req.user.userId
            );

            ResponseUtil.success(res, result, 'Repost removed successfully');

        } catch (error: any) {
            if (error.message === 'Repost not found') {
                ResponseUtil.notFound(res, 'Repost not found');
                return;
            }
            if (error.message === 'Unauthorized') {
                ResponseUtil.forbidden(res, 'You can only delete your own reposts');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    /**
     * GET /api/v1/profile/activity/posts/:entryId/reposts
     */
    static async getRepostsByPost(
        req: Request<{ entryId: string }>,
        res: Response
    ): Promise<void> {
        try {
            const result = await RepostService.getRepostsByPost(req.params.entryId);
            ResponseUtil.success(res, result, 'Reposts fetched successfully');
        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    /**
     * GET /api/v1/profile/activity/posts/reposts/my-reposts
     * ✅ FIX: viewerId (= khud req.user.userId) pass kiya, taaki quote-repost
     * ka like-status sahi calculate ho
     */
    static async getMyReposts(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const result = await RepostService.getUserReposts(req.user.userId, req.user.userId);
            ResponseUtil.success(res, result, 'Your reposts fetched successfully');
        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    /**
     * GET /api/v1/profile/activity/posts/:entryId/repost-status
     */
    static async getRepostStatus(
        req: Request<{ entryId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const result = await RepostService.checkRepostStatus(
                req.params.entryId,
                req.user.userId
            );

            ResponseUtil.success(res, result, 'Repost status fetched');
        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    /**
     * ✅ NEW: POST /api/v1/profile/activity/posts/reposts/:repostId/react
     */
    static async likeRepost(
        req: Request<{ repostId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }
            const result = await RepostService.likeRepost(req.params.repostId, req.user.userId);
            ResponseUtil.success(res, result, 'Repost liked');
        } catch (error: any) {
            if (error.message === 'Repost not found') {
                ResponseUtil.notFound(res, 'Repost not found');
                return;
            }
            ResponseUtil.badRequest(res, error.message);
        }
    }

    /**
     * ✅ NEW: DELETE /api/v1/profile/activity/posts/reposts/:repostId/react
     */
    static async unlikeRepost(
        req: Request<{ repostId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }
            const result = await RepostService.unlikeRepost(req.params.repostId, req.user.userId);
            ResponseUtil.success(res, result, 'Repost unliked');
        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
        }
    }
}

export default RepostController;