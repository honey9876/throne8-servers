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

            const doc = await Post.findOne({ userId });
            const entries = (doc?.posts || []).filter(p => !p.isDeleted);

            const allImages = entries.flatMap(post =>
                (post.images || []).map((image: any) => ({
                    ...(image.toObject ? image.toObject() : image),
                    postId: post.entryId,
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

            const doc = await Post.findOne({ userId });
            const entries = (doc?.posts || []).filter(p => !p.isDeleted);

            const allVideos = entries.flatMap(post =>
                (post.videos || []).map((video: any) => ({
                    ...(video.toObject ? video.toObject() : video),
                    postId: post.entryId,
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

            const doc = await Post.findOne({ userId });
            const entries = (doc?.posts || []).filter(p => !p.isDeleted);

            const allDocuments = entries.flatMap(post =>
                (post.documents || []).map((document: any) => ({
                    ...(document.toObject ? document.toObject() : document),
                    postId: post.entryId,
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
            ].reduce((sum: number, media: any) => sum + (media.fileSize || 0), 0);

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

            const doc = await Post.findOne({
                'posts.entryId': postId,
            });

            if (!doc) {
                throw new Error('Post not found');
            }

            const post = doc.posts.find(p => p.entryId === postId && !p.isDeleted);
            if (!post) {
                throw new Error('Post not found');
            }

            const images = post.images || [];
            const videos = post.videos || [];
            const documents = post.documents || [];

            LoggerUtil.info('Post media fetched successfully', {
                postId,
                imageCount: images.length,
                videoCount: videos.length,
                documentCount: documents.length,
                correlationId,
            });

            return {
                postId: post.entryId,
                postTitle: post.title,
                images,
                videos,
                documents,
                stats: {
                    totalImages: images.length,
                    totalVideos: videos.length,
                    totalDocuments: documents.length,
                    totalMedia: images.length + videos.length + documents.length,
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

            const doc = await Post.findOne({ userId });

            if (!doc) {
                throw new Error('Media not found');
            }

            let foundMedia: any = null;
            let mediaType: string | null = null;
            let parentPost: any = null;

            for (const p of doc.posts || []) {
                if (p.isDeleted) continue;
                const img = (p.images || []).find((m: any) => m.mediaId === mediaId);
                if (img) {
                    foundMedia = img;
                    mediaType = 'image';
                    parentPost = p;
                    break;
                }
                const vid = (p.videos || []).find((m: any) => m.mediaId === mediaId);
                if (vid) {
                    foundMedia = vid;
                    mediaType = 'video';
                    parentPost = p;
                    break;
                }
                const d = (p.documents || []).find((m: any) => m.mediaId === mediaId);
                if (d) {
                    foundMedia = d;
                    mediaType = 'document';
                    parentPost = p;
                    break;
                }
            }

            if (!foundMedia || !parentPost) {
                throw new Error('Media not found');
            }

            LoggerUtil.info('Media fetched successfully', {
                mediaId,
                userId,
                mediaType,
                correlationId,
            });

            return {
                ...(foundMedia.toObject ? foundMedia.toObject() : foundMedia),
                mediaType,
                postId: parentPost.entryId,
                postTitle: parentPost.title,
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
