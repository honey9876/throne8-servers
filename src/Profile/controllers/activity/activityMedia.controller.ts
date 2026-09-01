/**
 * Activity Media Controller - Handles HTTP Requests for Activity Media
 * Supports fetching images, videos, documents from user posts
 * 
 * @module controllers/activityMedia.controller
 * @version 1.0.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ActivityMediaService } from '@/shared/services/index.service';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
    sessionId?: string;
    deviceId?: string;
}

// ==================== ACTIVITY MEDIA CONTROLLER ====================

class ActivityMediaController {

    /**
     * ✅ GET USER IMAGES
     * GET /api/v1/activity/media/images
     * 
     * @access Private
     */
    static async getUserImages(
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

            LoggerUtil.info('Get user images request', {
                userId,
                correlationId,
            });

            const result = await ActivityMediaService.getUserImages(userId);

            LoggerUtil.info('User images fetched successfully', {
                userId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Images fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get user images failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET USER VIDEOS
     * GET /api/v1/activity/media/videos
     * 
     * @access Private
     */
    static async getUserVideos(
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

            LoggerUtil.info('Get user videos request', {
                userId,
                correlationId,
            });

            const result = await ActivityMediaService.getUserVideos(userId);

            LoggerUtil.info('User videos fetched successfully', {
                userId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Videos fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get user videos failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET USER DOCUMENTS
     * GET /api/v1/activity/media/documents
     * 
     * @access Private
     */
    static async getUserDocuments(
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

            LoggerUtil.info('Get user documents request', {
                userId,
                correlationId,
            });

            const result = await ActivityMediaService.getUserDocuments(userId);

            LoggerUtil.info('User documents fetched successfully', {
                userId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Documents fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get user documents failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL USER MEDIA
     * GET /api/v1/activity/media/all
     * 
     * @access Private
     */
    static async getUserAllMedia(
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

            LoggerUtil.info('Get all user media request', {
                userId,
                correlationId,
            });

            const result = await ActivityMediaService.getUserAllMedia(userId);

            LoggerUtil.info('All user media fetched successfully', {
                userId,
                totalImages: result.stats.totalImages,
                totalVideos: result.stats.totalVideos,
                totalDocuments: result.stats.totalDocuments,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'All media fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all user media failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET MEDIA BY POST ID
     * GET /api/v1/activity/posts/:postId/media
     * 
     * @access Public
     */
    static async getMediaByPostId(
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

            LoggerUtil.info('Get media by post ID request', {
                postId,
                correlationId,
            });

            const result = await ActivityMediaService.getMediaByPostId(postId);

            LoggerUtil.info('Post media fetched successfully', {
                postId,
                imageCount: result.images.length,
                videoCount: result.videos.length,
                documentCount: result.documents.length,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Post media fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get media by post ID failed', {
                error: error.message,
                postId: req.params.postId,
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
     * ✅ GET MEDIA BY ID
     * GET /api/v1/activity/media/:mediaId
     * 
     * @access Private
     */
    static async getMediaById(
        req: Request<{ mediaId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { mediaId } = req.params;

            if (!mediaId) {
                ResponseUtil.badRequest(res, 'Media ID is required');
                return;
            }

            LoggerUtil.info('Get media by ID request', {
                userId,
                mediaId,
                correlationId,
            });

            const result = await ActivityMediaService.getMediaById(mediaId, userId);

            LoggerUtil.info('Media fetched successfully', {
                userId,
                mediaId,
                correlationId,
            });

            ResponseUtil.success(
                res,
                { media: result },
                'Media fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get media by ID failed', {
                error: error.message,
                mediaId: req.params.mediaId,
                correlationId,
            });

            if (error.message === 'Media not found') {
                ResponseUtil.notFound(res, 'Media not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default ActivityMediaController;
