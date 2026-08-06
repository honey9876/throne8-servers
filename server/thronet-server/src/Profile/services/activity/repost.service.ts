// src/Profile/services/repost.service.ts

import { v4 as uuidv4 } from 'uuid';
import { Post, User } from '@/shared/models/index.models';
import Repost from '@/Profile/models/Repost.model';
import { IPostEntry } from '@/Profile/models/Post.model';
import { LoggerUtil } from '@/shared/logger.util';
import AnalyticsService from '../analytics.service';

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

            // Step 1: Validate user
            const user = await User.findOne({ userId: repostedBy });
            if (!user) throw new Error('User not found');
            if (user.status !== 'active') throw new Error('User account is not active');

            // Step 2: Find original post
            const originalDoc = await Post.findOne({ 'posts.entryId': originalPostEntryId });
            if (!originalDoc) throw new Error('Original post not found');

            const originalEntry = originalDoc.posts.find(
                (p: IPostEntry) => p.entryId === originalPostEntryId && !p.isDeleted
            );
            if (!originalEntry) throw new Error('Original post not found or deleted');

            // Step 3: Quote repost ke liye thoughtText required
            if (repostType === 'quote' && (!thoughtText || !thoughtText.trim())) {
                throw new Error('Thought text is required for quote repost');
            }

            // Step 4: Check duplicate repost
            const alreadyReposted = await Repost.hasUserReposted(originalPostEntryId, repostedBy);
            if (alreadyReposted) throw new Error('You have already reposted this post');

            // Step 5: Create repost record
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

            // Step 6: Update original post analytics (reposts count)
            // Post model me reposts field nahi hai directly,
            // isliye User stats update karo
            await User.findOneAndUpdate(
                { userId: originalDoc.userId },
                { $inc: { 'activityStats.totalReposts': 1 } }
            );




            // ✅ Step 6.5 (NEW): Record share event so shares count / discovery stats update
            try {
                await AnalyticsService.recordShare(originalDoc.userId, {
                    postId: originalPostEntryId,
                    shareType: 'direct',
                    sharerId: repostedBy,
                });
            } catch (analyticsError: any) {
                // Analytics failure repost creation ko fail nahi karni chahiye
                LoggerUtil.error('Failed to record share analytics', {
                    error: analyticsError.message,
                    repostId: repost.repostId,
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

            // Revert analytics
            await User.findOneAndUpdate(
                { userId: repost.originalPostOwnerId },
                { $inc: { 'activityStats.totalReposts': -1 } }
            );

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
    static async getUserReposts(userId: string): Promise<any> {
        try {
            const reposts = await Repost.find({
                repostedBy: userId,
                isDeleted: false,
            }).sort({ createdAt: -1 });

            // Enrich with original post data
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
                                createdAt: originalEntry.createdAt,
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
     * Posts + Reposts combine karke sort karta hai
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
                            isLikedByCurrentUser: originalEntry.likedBy?.includes(currentUserId),
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
}

export default RepostService;