// src/Profile/services/repost.service.ts

import { v4 as uuidv4 } from 'uuid';
import { Post, User } from '@/shared/models/index.models';
import Repost from '@/Profile/models/Repost.model';
import { IPostEntry } from '@/Profile/models/Post.model';
import { LoggerUtil } from '@/shared/logger.util';
import AnalyticsService from '../analytics.service';
import redisService from '@/services/redis.service';
import { emitToUser } from '@/socket/index';

class RepostService {

    /**
     * ✅ Create Repost (simple or quote)
     */
    static async createRepost(
        repostedBy: string,
        originalPostEntryId: string,
        repostType: 'repost' | 'quote',
        thoughtText?: string,
        visibility: 'public' | 'connections' | 'private' = 'public',
        repostSource: 'feed' | 'profile' | 'search' | 'other' = 'feed'
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating repost', {
                repostedBy, originalPostEntryId, repostType, correlationId
            });

            const user = await User.findOne({ userId: repostedBy });
            if (!user) throw new Error('User not found');
            if (user.status !== 'active') throw new Error('User account is not active');

            const originalDoc = await Post.findOne({ 'posts.entryId': originalPostEntryId });
            if (!originalDoc) throw new Error('Original post not found');

            const originalEntry = originalDoc.posts.find(
                (p: IPostEntry) => p.entryId === originalPostEntryId && !p.isDeleted
            );
            if (!originalEntry) throw new Error('Original post not found or deleted');

            if (repostType === 'quote' && (!thoughtText || !thoughtText.trim())) {
                throw new Error('Thought text is required for quote repost');
            }

            const alreadyReposted = await Repost.hasUserReposted(originalPostEntryId, repostedBy);
            if (alreadyReposted) throw new Error('You have already reposted this post');

            const repost = new Repost({
                repostId: uuidv4(),
                originalPostEntryId,
                originalPostOwnerId: originalDoc.userId,
                repostedBy,
                repostType,
                thoughtText: repostType === 'quote' ? thoughtText?.trim() : null,
                visibility,
                repostSource,
            });

            await repost.save();

            await User.findOneAndUpdate(
                { userId: originalDoc.userId },
                { $inc: { 'activityStats.totalReposts': 1 } }
            );

            // ✅ FIX: yeh missing tha — originalEntry.repostsCount kabhi
            // increment hi nahi ho raha tha, isliye feed pe repost count
            // kabhi dikhta hi nahi tha. Same document (originalDoc) pe
            // mutate + save karo taaki subdocument change persist ho.
            originalEntry.repostsCount = (originalEntry.repostsCount || 0) + 1;
            await originalDoc.save();

            try {
                await AnalyticsService.recordShare(originalDoc.userId, {
                    postId: originalPostEntryId,
                    shareType: 'direct',
                    sharerId: repostedBy,
                });
            } catch (analyticsError: any) {
                LoggerUtil.error('Failed to record share analytics', {
                    error: analyticsError.message,
                    repostId: repost.repostId,
                });
            }

            try {
                await redisService.deleteByPattern(`feed:v1:${repostedBy}:page:*`);
                // ✅ FIX: original post owner ka feed cache bhi invalidate
                // karo — unki feed pe bhi naya repostsCount turant dikhna
                // chahiye, na ki 3-min TTL expire hone ka wait
                if (originalDoc.userId !== repostedBy) {
                    await redisService.deleteByPattern(`feed:v1:${originalDoc.userId}:page:*`);
                }
            } catch (cacheError: any) {
                LoggerUtil.warn('Feed cache invalidation failed after repost (non-critical)', {
                    error: cacheError.message,
                    repostedBy,
                });
            }

            try {
                emitToUser(repostedBy, 'feed:new-post', {
                    feedItemType: 'repost',
                    repostId: repost.repostId,
                    repostType: repost.repostType,
                    thoughtText: repost.thoughtText,
                    userId: repostedBy,
                    likesCount: 0,
                    isLikedByCurrentUser: false,
                    createdAt: repost.createdAt,
                    originalPost: {
                        entryId: originalEntry.entryId,
                        title: originalEntry.title,
                        content: originalEntry.content,
                        userId: originalDoc.userId,
                        images: originalEntry.images || [],
                        videos: originalEntry.videos || [],
                        documents: originalEntry.documents || [],
                        likesCount: originalEntry.likesCount,
                        commentsCount: originalEntry.commentsCount,
                        // ✅ NEW
                        repostsCount: originalEntry.repostsCount || 0,
                        sendsCount: originalEntry.sendsCount || 0,
                        isLikedByCurrentUser: originalEntry.likedBy?.includes(repostedBy) || false,
                        createdAt: originalEntry.createdAt,
                    },
                });
            } catch (emitError: any) {
                LoggerUtil.warn('Socket emit failed after repost (non-critical)', {
                    error: emitError.message,
                    repostedBy,
                });
            }

            LoggerUtil.info('Repost created successfully', {
                repostId: repost.repostId,
                repostType,
                correlationId,
            });

            return {
                repostId: repost.repostId,
                originalPostEntryId,
                originalPostOwnerId: originalDoc.userId,
                repostedBy,
                repostType,
                thoughtText: repost.thoughtText,
                visibility: repost.visibility,
                createdAt: repost.createdAt,
                repostsCount: originalEntry.repostsCount,
                message: repostType === 'quote'
                    ? 'Quote repost created successfully'
                    : 'Repost created successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Repost creation failed', {
                error: error.message, repostedBy, originalPostEntryId, correlationId
            });
            throw error;
        }
    }

    /**
     * ✅ Delete Repost
     */
    static async deleteRepost(repostId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const repost = await Repost.findOne({ repostId, isDeleted: false });
            if (!repost) throw new Error('Repost not found');
            if (repost.repostedBy !== userId) throw new Error('Unauthorized');

            repost.isDeleted = true;
            repost.deletedAt = new Date();
            await repost.save();

            await User.findOneAndUpdate(
                { userId: repost.originalPostOwnerId },
                { $inc: { 'activityStats.totalReposts': -1 } }
            );

            // ✅ FIX: matching decrement — repostsCount originally increment
            // hota hi nahi tha, ab delete pe symmetric decrement bhi hai
            try {
                const originalDoc = await Post.findOne({ 'posts.entryId': repost.originalPostEntryId });
                if (originalDoc) {
                    const originalEntry = originalDoc.posts.find(
                        (p: IPostEntry) => p.entryId === repost.originalPostEntryId
                    );
                    if (originalEntry) {
                        originalEntry.repostsCount = Math.max(0, (originalEntry.repostsCount || 0) - 1);
                        await originalDoc.save();
                    }
                }
            } catch (decErr: any) {
                LoggerUtil.warn('repostsCount decrement failed (non-critical)', { error: decErr.message, repostId });
            }

            try {
                await redisService.deleteByPattern(`feed:v1:${userId}:page:*`);
                if (repost.originalPostOwnerId !== userId) {
                    await redisService.deleteByPattern(`feed:v1:${repost.originalPostOwnerId}:page:*`);
                }
            } catch (cacheError: any) {
                LoggerUtil.warn('Feed cache invalidation failed after repost delete (non-critical)', {
                    error: cacheError.message,
                    userId,
                });
            }

            LoggerUtil.info('Repost deleted', { repostId, userId, correlationId });

            return { repostId, message: 'Repost removed successfully' };

        } catch (error: any) {
            LoggerUtil.error('Delete repost failed', { error: error.message, repostId, correlationId });
            throw error;
        }
    }

    /**
     * ✅ Get Reposts for a post (who reposted)
     */
    static async getRepostsByPost(originalPostEntryId: string): Promise<any> {
        try {
            const reposts = await Repost.find({
                originalPostEntryId,
                isDeleted: false,
            }).sort({ createdAt: -1 });

            return {
                reposts,
                total: reposts.length,
            };
        } catch (error: any) {
            LoggerUtil.error('Get reposts failed', { error: error.message });
            throw error;
        }
    }

    /**
     * ✅ Get user's reposts (for profile page)
     */
    static async getUserReposts(profileUserId: string, viewerId?: string): Promise<any> {
        try {
            const reposts = await Repost.find({
                repostedBy: profileUserId,
                isDeleted: false,
            }).sort({ createdAt: -1 });

            const effectiveViewerId = viewerId || profileUserId;

            const enriched = await Promise.all(
                reposts.map(async (repost) => {
                    const originalDoc = await Post.findOne({
                        'posts.entryId': repost.originalPostEntryId,
                    });
                    const originalEntry = originalDoc?.posts.find(
                        (p: IPostEntry) => p.entryId === repost.originalPostEntryId
                    );

                    return {
                        repostId: repost.repostId,
                        repostType: repost.repostType,
                        thoughtText: repost.thoughtText,
                        repostedBy: repost.repostedBy,
                        createdAt: repost.createdAt,
                        likesCount: repost.repostType === 'quote' ? repost.likesCount : 0,
                        isLikedByCurrentUser: repost.repostType === 'quote'
                            ? repost.likedBy.includes(effectiveViewerId)
                            : false,
                        originalPost: originalEntry
                            ? {
                                entryId: originalEntry.entryId,
                                title: originalEntry.title,
                                content: originalEntry.content,
                                userId: originalDoc?.userId,
                                images: originalEntry.images,
                                videos: originalEntry.videos,
                                documents: originalEntry.documents,
                                likesCount: originalEntry.likesCount,
                                commentsCount: originalEntry.commentsCount,
                                // ✅ NEW
                                repostsCount: originalEntry.repostsCount || 0,
                                sendsCount: originalEntry.sendsCount || 0,
                                createdAt: originalEntry.createdAt,
                                isLikedByCurrentUser: originalEntry.likedBy?.includes(effectiveViewerId) || false,
                            }
                            : null,
                    };
                })
            );

            return { reposts: enriched, total: enriched.length };

        } catch (error: any) {
            LoggerUtil.error('Get user reposts failed', { error: error.message });
            throw error;
        }
    }

    /**
     * ✅ Check if user reposted a post
     */
    static async checkRepostStatus(
        originalPostEntryId: string,
        userId: string
    ): Promise<any> {
        const repost = await Repost.findOne({
            originalPostEntryId,
            repostedBy: userId,
            isDeleted: false,
        });

        return {
            hasReposted: !!repost,
            repostId: repost?.repostId || null,
            repostType: repost?.repostType || null,
        };
    }

    /**
     * ✅ Get Feed Reposts (home feed ke liye)
     */
    static async getFeedReposts(
        currentUserId: string,
        limit: number = 20,
        skip: number = 0
    ): Promise<any> {
        try {
            const reposts = await Repost.find({ isDeleted: false })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const enriched = await Promise.all(
                reposts.map(async (repost) => {
                    const originalDoc = await Post.findOne({
                        'posts.entryId': repost.originalPostEntryId,
                    });
                    const originalEntry = originalDoc?.posts.find(
                        (p: IPostEntry) => p.entryId === repost.originalPostEntryId
                    );

                    if (!originalEntry) return null;

                    return {
                        feedItemType: 'repost',
                        repostId: repost.repostId,
                        repostType: repost.repostType,
                        thoughtText: repost.thoughtText || null,
                        repostedBy: repost.repostedBy,
                        createdAt: repost.createdAt,
                        likesCount: repost.repostType === 'quote' ? repost.likesCount : 0,
                        isLikedByCurrentUser: repost.repostType === 'quote'
                            ? repost.likedBy.includes(currentUserId)
                            : false,
                        originalPost: {
                            entryId: originalEntry.entryId,
                            title: originalEntry.title,
                            content: originalEntry.content,
                            userId: originalDoc?.userId,
                            images: originalEntry.images || [],
                            videos: originalEntry.videos || [],
                            documents: originalEntry.documents || [],
                            likesCount: originalEntry.likesCount,
                            commentsCount: originalEntry.commentsCount,
                            // ✅ NEW
                            repostsCount: originalEntry.repostsCount || 0,
                            sendsCount: originalEntry.sendsCount || 0,
                            isLikedByCurrentUser: originalEntry.likedBy?.includes(currentUserId) || false,
                            createdAt: originalEntry.createdAt,
                        },
                    };
                })
            );

            return {
                reposts: enriched.filter(Boolean),
                total: enriched.filter(Boolean).length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get feed reposts failed', { error: error.message });
            throw error;
        }
    }

    /**
     * ✅ Like a quote-repost (independent like system, sirf quote type ke liye)
     */
    static async likeRepost(repostId: string, userId: string): Promise<any> {
        const repost = await Repost.findOne({ repostId, isDeleted: false });
        if (!repost) throw new Error('Repost not found');
        if (repost.repostType !== 'quote') {
            throw new Error('Only quote reposts can be liked independently');
        }
        if (repost.likedBy.includes(userId)) {
            throw new Error('Already liked');
        }

        repost.likedBy.push(userId);
        repost.likesCount = repost.likedBy.length;
        await repost.save();

        return {
            repostId: repost.repostId,
            likesCount: repost.likesCount,
            isLikedByCurrentUser: true,
        };
    }

    /**
     * ✅ Unlike a quote-repost
     */
    static async unlikeRepost(repostId: string, userId: string): Promise<any> {
        const repost = await Repost.findOne({ repostId, isDeleted: false });
        if (!repost) throw new Error('Repost not found');

        repost.likedBy = repost.likedBy.filter((id) => id !== userId);
        repost.likesCount = repost.likedBy.length;
        await repost.save();

        return {
            repostId: repost.repostId,
            likesCount: repost.likesCount,
            isLikedByCurrentUser: false,
        };
    }
}

export default RepostService;