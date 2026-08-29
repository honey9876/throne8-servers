/**
 * HomePost Controller
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import HomePostService from '@/Profile/services/activity/homePost.service';

interface UserPayload {
    userId: string;
    role: string;
    email: string;
}

class HomePostController {

    /**
     * POST /api/v1/home-post/create
     */
    static async createHomePost(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { title, content, mood, isPublic, scheduledFor, pollData, eventData } = req.body;

            const files = (req.files as any) || {};
            const images = files.images || [];
            const videos = files.videos || [];
            const documents = files.documents || [];

            const result = await HomePostService.createHomePost(
                userId,
                { title, content, mood, isPublic, scheduledFor, pollData, eventData },
                images,
                videos,
                documents
            );

            if (result.isScheduled) {
                ResponseUtil.created(res, result, result.message);
                return;
            }

            ResponseUtil.created(res, result, 'Home post created successfully');

        } catch (error: any) {
            LoggerUtil.error('HomePost controller - create failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }
            if (error.message.includes('Maximum') || error.message.includes('dimensions')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }
            if (error.message.includes('Scheduled time')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
        }
    }

    /**
     * GET /api/v1/home-post/feed
     */
    static async getHomeFeed(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const currentUserId = req.user.userId;
            const page = parseInt(req.query.page as string) || 1;
            const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

            const result = await HomePostService.getHomeFeedPosts(currentUserId, page, limit);

            ResponseUtil.success(res, result, 'Home feed fetched successfully');

        } catch (error: any) {
            LoggerUtil.error('HomePost controller - get feed failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });
            ResponseUtil.internalError(res, error.message, error);
        }
    }
}

export default HomePostController;