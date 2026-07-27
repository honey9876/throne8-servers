/**
 * Activity Media Service - Business Logic for Activity Media
 * Handles fetching images, videos, documents from user posts
 * 
 * @module services/activityMedia.service
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import { Post } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== ACTIVITY MEDIA SERVICE ====================

class ActivityMediaService {

    /**
     * ✅ Get all images for user
     */
    static async getUserImages(userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching user images', {
                userId,
                correlationId,
            });

            const posts = await Post.find({
                userId,
                isDeleted: false,
                'images.0': { $exists: true },
            }).select('postId title images createdAt');

            const allImages = posts.flatMap(post =>
                post.images.map(image => ({
                    ...image,
                    postId: post.postId,
                    postTitle: post.title,
                }))
            );

            LoggerUtil.info('User images fetched successfully', {
                userId,
                count: allImages.length,
                correlationId,
            });

            return {
                images: allImages,
                total: allImages.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get user images failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get all videos for user
     */
    static async getUserVideos(userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching user videos', {
                userId,
                correlationId,
            });

            const posts = await Post.find({
                userId,
                isDeleted: false,
                'videos.0': { $exists: true },
            }).select('postId title videos createdAt');

            const allVideos = posts.flatMap(post =>
                post.videos.map(video => ({
                    ...video,
                    postId: post.postId,
                    postTitle: post.title,
                }))
            );

            LoggerUtil.info('User videos fetched successfully', {
                userId,
                count: allVideos.length,
                correlationId,
            });

            return {
                videos: allVideos,
                total: allVideos.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get user videos failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get all documents for user
     */
    static async getUserDocuments(userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching user documents', {
                userId,
                correlationId,
            });

            const posts = await Post.find({
                userId,
                isDeleted: false,
                'documents.0': { $exists: true },
            }).select('postId title documents createdAt');

            const allDocuments = posts.flatMap(post =>
                post.documents.map(document => ({
                    ...document,
                    postId: post.postId,
                    postTitle: post.title,
                }))
            );

            LoggerUtil.info('User documents fetched successfully', {
                userId,
                count: allDocuments.length,
                correlationId,
            });

            return {
                documents: allDocuments,
                total: allDocuments.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get user documents failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get all media (images, videos, documents) for user
     */
    static async getUserAllMedia(userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all user media', {
                userId,
                correlationId,
            });

            const [images, videos, documents] = await Promise.all([
                this.getUserImages(userId),
                this.getUserVideos(userId),
                this.getUserDocuments(userId),
            ]);

            const totalSize = [
                ...images.images,
                ...videos.videos,
                ...documents.documents,
            ].reduce((sum, media) => sum + (media.fileSize || 0), 0);

            LoggerUtil.info('All user media fetched successfully', {
                userId,
                totalImages: images.total,
                totalVideos: videos.total,
                totalDocuments: documents.total,
                correlationId,
            });

            return {
                images: images.images,
                videos: videos.videos,
                documents: documents.documents,
                stats: {
                    totalImages: images.total,
                    totalVideos: videos.total,
                    totalDocuments: documents.total,
                    totalMedia: images.total + videos.total + documents.total,
                    totalSize,
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Get all user media failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get all media for a specific post
     */
    static async getMediaByPostId(postId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching media by post ID', {
                postId,
                correlationId,
            });

            const post = await Post.findOne({
                postId,
                isDeleted: false,
            }).select('postId title images videos documents createdAt');

            if (!post) {
                throw new Error('Post not found');
            }

            LoggerUtil.info('Post media fetched successfully', {
                postId,
                imageCount: post.images.length,
                videoCount: post.videos.length,
                documentCount: post.documents.length,
                correlationId,
            });

            return {
                postId: post.postId,
                postTitle: post.title,
                images: post.images,
                videos: post.videos,
                documents: post.documents,
                stats: {
                    totalImages: post.images.length,
                    totalVideos: post.videos.length,
                    totalDocuments: post.documents.length,
                    totalMedia: post.images.length + post.videos.length + post.documents.length,
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Get media by post ID failed', {
                error: error.message,
                postId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get single media item by ID
     */
    static async getMediaById(mediaId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching media by ID', {
                mediaId,
                userId,
                correlationId,
            });

            const post = await Post.findOne({
                userId,
                isDeleted: false,
                $or: [
                    { 'images.mediaId': mediaId },
                    { 'videos.mediaId': mediaId },
                    { 'documents.mediaId': mediaId },
                ],
            });

            if (!post) {
                throw new Error('Media not found');
            }

            let media = null;
            let mediaType = null;

            // Search in images
            media = post.images.find(img => img.mediaId === mediaId);
            if (media) {
                mediaType = 'image';
            }

            // Search in videos
            if (!media) {
                media = post.videos.find(vid => vid.mediaId === mediaId);
                if (media) {
                    mediaType = 'video';
                }
            }

            // Search in documents
            if (!media) {
                media = post.documents.find(doc => doc.mediaId === mediaId);
                if (media) {
                    mediaType = 'document';
                }
            }

            if (!media) {
                throw new Error('Media not found');
            }

            LoggerUtil.info('Media fetched successfully', {
                mediaId,
                userId,
                mediaType,
                correlationId,
            });

            return {
                ...media,
                mediaType,
                postId: post.postId,
                postTitle: post.title,
            };

        } catch (error: any) {
            LoggerUtil.error('Get media by ID failed', {
                error: error.message,
                mediaId,
                userId,
                correlationId,
            });
            throw error;
        }
    }
}

export default ActivityMediaService;
