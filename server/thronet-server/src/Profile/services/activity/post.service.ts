
/**
 * Post Service - Business Logic for Posts
 * Architecture: One document per user, posts[] array inside
 *
 * @module services/post.service
 * @version 2.1.0 (reach-based feed + connection status)
 */

import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import sharp from 'sharp';
import Constants from '@/shared/constants.util';
import { Post, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import { IPostEntry } from '@/Profile/models/Post.model';
import NotificationService from '@/notifications/services/notification.service';

// ==================== INTERFACES ====================

interface PostData {
    [x: string]: any;
    title: string;
    content?: string;
    mood?: string;
    isPublic?: boolean;
}

interface CreatePostResult {
    documentPostId: string;
    entryId: string;
    title: string;
    content?: string;
    postUrl?: string;
    images?: any[];
    videos?: any[];
    documents?: any[];
    isPinned?: boolean;
    isSaved?: boolean;
    isArchived?: boolean;
    createdAt?: Date;
    scheduledFor?: Date;
    isScheduled?: boolean;
    message?: string;
    mood?: string;
    isPublic?: boolean;
}

interface PostAnalysisResult {
    isFreshContent: boolean;
    contentClassification: any;
    postTimeScore: number;
    userActiveHourMatch: boolean;
    performanceHistory: any;
    qualityMetrics: any;
    hasExternalLinkPenalty: boolean;
    linkPreviewQuality: number;
}

type ConnectionStatus = 'self' | 'connected' | 'pending_sent' | 'pending_received' | 'none';

// ==================== POST SERVICE ====================

class PostService {

    /**
     * ✅ Create new post — upsert into user's document
     */
    static async createPost(
        userId: string,
        postData: PostData,
        images: Express.Multer.File[] = [],
        videos: Express.Multer.File[] = [],
        documents: Express.Multer.File[] = []
    ): Promise<CreatePostResult> {
        console.log('🔥🔥🔥 CREATE POST FUNCTION HIT 🔥🔥🔥', { userId, title: postData.title });
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating post', { userId, title: postData.title, correlationId });

            // Step 1: Validate user
            const user = await User.findOne({ userId });
            if (!user) throw new Error('User not found');
            if (user.status !== 'active') throw new Error('User account is not active');

            // Step 2: Validate media counts
            if (images.length > Constants.ACTIVITY_VALIDATION.POST.MAX_IMAGES_PER_POST) {
                throw new Error(`Maximum ${Constants.ACTIVITY_VALIDATION.POST.MAX_IMAGES_PER_POST} images allowed`);
            }
            if (videos.length > Constants.ACTIVITY_VALIDATION.POST.MAX_VIDEOS_PER_POST) {
                throw new Error(`Maximum ${Constants.ACTIVITY_VALIDATION.POST.MAX_VIDEOS_PER_POST} videos allowed`);
            }
            if (documents.length > Constants.ACTIVITY_VALIDATION.POST.MAX_DOCUMENTS_PER_POST) {
                throw new Error(`Maximum ${Constants.ACTIVITY_VALIDATION.POST.MAX_DOCUMENTS_PER_POST} documents allowed`);
            }

            // Step 2.5: Process Poll Data
            let pollSetup = null;
            if (postData.pollData) {
                const pollEndsAt = new Date();
                pollEndsAt.setDate(pollEndsAt.getDate() + postData.pollData.duration);
                pollSetup = {
                    question: postData.pollData.question,
                    options: postData.pollData.options.map((opt: string) => ({
                        optionId: uuidv4(),
                        text: opt,
                        votes: 0,
                        votedBy: [],
                    })),
                    duration: postData.pollData.duration,
                    endsAt: pollEndsAt,
                    totalVotes: 0,
                    isActive: true,
                };
            }

            // Step 2.6: Process Scheduled Post
            let scheduledSetup: { scheduledFor: Date; isScheduled: boolean } | null = null;
            if (postData.scheduledFor) {
                const scheduledTime = new Date(postData.scheduledFor);
                const minFutureTime = new Date(Date.now() + 5 * 60 * 1000);
                if (scheduledTime < minFutureTime) {
                    throw new Error('Scheduled time must be at least 5 minutes in the future');
                }
                scheduledSetup = { scheduledFor: scheduledTime, isScheduled: true };
            }

            // Step 2.7: Process Event Data
            let eventSetup = null;
            if (postData.eventData) {
                const eventStartDateTime = new Date(
                    `${postData.eventData.startDate}T${postData.eventData.startTime}`
                );
                if (eventStartDateTime <= new Date()) {
                    throw new Error('Event start time must be in the future');
                }
                eventSetup = {
                    ...postData.eventData,
                    startDate: new Date(postData.eventData.startDate),
                    endDate: postData.eventData.endDate
                        ? new Date(postData.eventData.endDate)
                        : undefined,
                    currentAttendees: 0,
                    isOnline: ['online', 'hybrid'].includes(postData.eventData.eventType),
                };
            }

            // Step 3: Analyze post
            const analysis = await this.analyzePost(postData, userId, images, videos, documents);

            // Step 4: Upload media to Cloudinary
            const uploadedImages = await Promise.all(
                images.map(async (file) => {
                    const metadata = await sharp(file.buffer).metadata();
                    if (!metadata.width || !metadata.height) {
                        throw new Error('Unable to read image dimensions');
                    }
                    if (
                        metadata.width < Constants.ACTIVITY_VALIDATION.IMAGE.MIN_WIDTH ||
                        metadata.height < Constants.ACTIVITY_VALIDATION.IMAGE.MIN_HEIGHT
                    ) {
                        throw new Error(
                            `Image dimensions must be at least ${Constants.ACTIVITY_VALIDATION.IMAGE.MIN_WIDTH}x${Constants.ACTIVITY_VALIDATION.IMAGE.MIN_HEIGHT}px`
                        );
                    }
                    const uploadResult = await this.uploadToCloudinary(
                        file.buffer, userId, 'image',
                        Constants.ACTIVITY_VALIDATION.IMAGE.CLOUDINARY_FOLDER
                    );
                    return {
                        mediaId: uuidv4(),
                        type: 'image' as const,
                        cloudinaryPublicId: uploadResult.public_id,
                        cloudinaryUrl: uploadResult.url,
                        cloudinarySecureUrl: uploadResult.secure_url,
                        originalName: file.originalname,
                        mimeType: file.mimetype,
                        fileSize: uploadResult.bytes,
                        width: uploadResult.width,
                        height: uploadResult.height,
                        format: uploadResult.format,
                        uploadedAt: new Date(),
                    };
                })
            );

            const uploadedVideos = await Promise.all(
                videos.map(async (file) => {
                    const uploadResult = await this.uploadToCloudinary(
                        file.buffer, userId, 'video',
                        Constants.ACTIVITY_VALIDATION.VIDEO.CLOUDINARY_FOLDER
                    );
                    return {
                        mediaId: uuidv4(),
                        type: 'video' as const,
                        cloudinaryPublicId: uploadResult.public_id,
                        cloudinaryUrl: uploadResult.url,
                        cloudinarySecureUrl: uploadResult.secure_url,
                        originalName: file.originalname,
                        mimeType: file.mimetype,
                        fileSize: uploadResult.bytes,
                        duration: uploadResult.duration,
                        format: uploadResult.format,
                        uploadedAt: new Date(),
                    };
                })
            );

            const uploadedDocuments = await Promise.all(
                documents.map(async (file) => {
                    const uploadResult = await this.uploadToCloudinary(
                        file.buffer, userId, 'raw',
                        Constants.ACTIVITY_VALIDATION.DOCUMENT.CLOUDINARY_FOLDER
                    );
                    const fileExtension = file.originalname.split('.').pop()?.toLowerCase() || 'pdf';
                    return {
                        mediaId: uuidv4(),
                        type: 'document' as const,
                        cloudinaryPublicId: uploadResult.public_id,
                        cloudinaryUrl: uploadResult.url,
                        cloudinarySecureUrl: uploadResult.secure_url,
                        originalName: file.originalname,
                        mimeType: file.mimetype,
                        fileSize: uploadResult.bytes,
                        format: fileExtension,
                        uploadedAt: new Date(),
                    };
                })
            );

            // Step 5: Build the new post entry
            const entryId = uuidv4();
            const postUrl = `/posts/${entryId}`;
            const accountType = user.accountType || 'personal';
            const creatorModeEnabled = accountType === 'creator';

            const newEntry: any = {
                entryId,
                title: postData.title,
                content: postData.content,
                mood: postData.mood || null,
                isPublic: postData.isPublic !== false,
                postUrl,
                ...(uploadedImages.length > 0 && { images: uploadedImages }),
                ...(uploadedVideos.length > 0 && { videos: uploadedVideos }),
                ...(uploadedDocuments.length > 0 && { documents: uploadedDocuments }),

                likesCount: 0,
                commentsCount: 0,
                likedBy: [],
                isPinned: false,
                isSaved: false,
                isArchived: false,
                isDeleted: false,

                analytics: {
                    avgDwellTime: 0,
                    textExpansionRate: 0,
                    engagementVelocity: 0,
                    viewCount: 0,
                    uniqueViewers: [],
                    expandedTextViewers: [],
                },

                ...(pollSetup && { hasPoll: true, pollData: pollSetup }),
                ...(scheduledSetup && scheduledSetup),
                ...(eventSetup && { eventData: eventSetup }),

                isFreshContent: analysis.isFreshContent,
                contentClassification: analysis.contentClassification,
                postTimeScore: analysis.postTimeScore,
                userActiveHourMatch: analysis.userActiveHourMatch,
                performanceHistory: analysis.performanceHistory,
                qualityMetrics: analysis.qualityMetrics,
                hasExternalLinkPenalty: analysis.hasExternalLinkPenalty,
                linkPreviewQuality: analysis.linkPreviewQuality,
                isShadowbanned: false,
            };

            // Step 6: Upsert — user ka document dhundo ya naya banao
            let userPostDoc = await Post.findOne({ userId });

            if (userPostDoc) {
                userPostDoc.posts.push(newEntry);
                userPostDoc.totalPosts += 1;
                userPostDoc.creatorModeEnabled = creatorModeEnabled;
                await userPostDoc.save();
            } else {
                userPostDoc = new Post({
                    postId: uuidv4(),
                    userId,
                    creatorModeEnabled,
                    totalPosts: 1,
                    posts: [newEntry],
                });
                await userPostDoc.save();
            }

            // Step 7: User stats update
            await User.findOneAndUpdate(
                { userId },
                {
                    $push: { 'activityIds.postIds': entryId },
                    $inc: { 'activityStats.totalPosts': 1 },
                },
                { new: true }
            );

            setImmediate(async () => {
                try {
                    await NotificationService.notifyConnectionsOnPost(
                        userId,
                        entryId,
                        postData.title
                    );
                    console.log('✅ [NOTIF] Connections notified for post:', entryId);
                } catch (err: any) {
                    console.warn('⚠️ [NOTIF] Notification failed (non-blocking):', err.message);
                }
            });

            if (user.trackActivityTime) {
                await user.trackActivityTime();
            }

            const savedEntry = userPostDoc.posts[userPostDoc.posts.length - 1];

            if (savedEntry.isScheduled && savedEntry.scheduledFor) {
                LoggerUtil.info('Post scheduled', {
                    entryId,
                    scheduledFor: savedEntry.scheduledFor,
                    correlationId,
                });
                return {
                    documentPostId: userPostDoc.postId,
                    entryId: savedEntry.entryId,
                    title: savedEntry.title,
                    scheduledFor: savedEntry.scheduledFor,
                    isScheduled: true,
                    message: `Post scheduled for ${savedEntry.scheduledFor.toLocaleString()}`,
                };
            }

            LoggerUtil.info('Post created successfully', {
                entryId,
                userId,
                qualityScore: analysis.qualityMetrics.overallQuality,
                correlationId,
            });

            return {
                documentPostId: userPostDoc.postId,
                entryId: savedEntry.entryId,
                title: savedEntry.title,
                content: savedEntry.content,
                mood: savedEntry.mood,
                isPublic: savedEntry.isPublic,
                postUrl: savedEntry.postUrl,
                ...(savedEntry.images?.length > 0 && { images: savedEntry.images }),
                ...(savedEntry.videos?.length > 0 && { videos: savedEntry.videos }),
                ...(savedEntry.documents?.length > 0 && { documents: savedEntry.documents }),
                isPinned: savedEntry.isPinned,
                isSaved: savedEntry.isSaved,
                isArchived: savedEntry.isArchived,
                createdAt: savedEntry.createdAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Post creation failed', {
                error: error.message,
                stack: error.stack,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload buffer to Cloudinary
     */
    private static async uploadToCloudinary(
        buffer: Buffer,
        userId: string,
        resourceType: 'image' | 'video' | 'raw',
        folder: string
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    public_id: `${userId}_${Date.now()}`,
                    resource_type: resourceType,
                    overwrite: true,
                },
                (error, result) => {
                    if (error) {
                        LoggerUtil.error('Cloudinary upload failed', { error: error.message });
                        return reject(error);
                    }
                    resolve(result);
                }
            );
            uploadStream.end(buffer);
        });
    }

    /**
     * ✅ Vote on a poll (entryId se dhundo)
     */
    static async votePoll(entryId: string, userId: string, optionId: string): Promise<any> {
        const doc = await Post.findOne({ 'posts.entryId': entryId });
        if (!doc) throw new Error('Poll not found');

        const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
        if (!entry || !entry.pollData) throw new Error('Poll not found');

        if (!entry.pollData.isActive || new Date() > entry.pollData.endsAt) {
            throw new Error('Poll has ended');
        }

        const hasVoted = entry.pollData.options.some((opt) => opt.votedBy.includes(userId));
        if (hasVoted) throw new Error('You have already voted');

        const option = entry.pollData.options.find((opt) => opt.optionId === optionId);
        if (!option) throw new Error('Invalid option');

        option.votes++;
        option.votedBy.push(userId);
        entry.pollData.totalVotes++;

        await doc.save();

        return {
            entryId: entry.entryId,
            pollData: entry.pollData,
            message: 'Vote recorded successfully',
        };
    }

    static async getAllPosts(
        userId: string,
        includeArchived: boolean = false,
        currentUserId?: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all posts', { userId, includeArchived, correlationId });

            const userPostDoc = await Post.findOne({ userId });

            if (!userPostDoc) {
                return { posts: [], total: 0, pinnedPosts: [], savedPosts: [] };
            }

            let entries = userPostDoc.posts.filter((p: IPostEntry) => !p.isDeleted);
            if (!includeArchived) {
                entries = entries.filter((p: IPostEntry) => !p.isArchived);
            }

            entries.sort((a: IPostEntry, b: IPostEntry) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

            const cleanPost = (obj: any): any => {
                if (!obj.images?.length) delete obj.images;
                if (!obj.videos?.length) delete obj.videos;
                if (!obj.documents?.length) delete obj.documents;
                if (!obj.pollData?.question) delete obj.pollData;
                if (!obj.eventData?.eventType) delete obj.eventData;
                if (!obj.shadowbanReason) delete obj.shadowbanReason;
                if (!obj.scheduledFor) delete obj.scheduledFor;
                if (!obj.publishedAt) delete obj.publishedAt;
                if (!obj.pinnedAt) delete obj.pinnedAt;
                if (!obj.savedAt) delete obj.savedAt;
                if (!obj.archivedAt) delete obj.archivedAt;
                if (!obj.deletedAt) delete obj.deletedAt;
                return obj;
            };

            const postsWithLikeStatus = entries.map((p: IPostEntry) => {
                const obj = (p as any).toObject ? (p as any).toObject() : { ...p };
                return cleanPost({
                    ...obj,
                    userId,
                    documentPostId: userPostDoc.postId,
                    isLikedByCurrentUser: currentUserId
                        ? (obj.likedBy || []).includes(currentUserId)
                        : false,
                });
            });

            LoggerUtil.info('Posts fetched successfully', {
                userId,
                count: postsWithLikeStatus.length,
                correlationId,
            });

            return {
                posts: postsWithLikeStatus,
                total: postsWithLikeStatus.length,
                pinnedPosts: postsWithLikeStatus.filter((p: any) => p.isPinned),
                savedPosts: postsWithLikeStatus.filter((p: any) => p.isSaved),
            };

        } catch (error: any) {
            LoggerUtil.error('Get all posts failed', { error: error.message, userId, correlationId });
            throw error;
        }
    }

    // ==================== ✅ NEW: FEED SCORING (reach-based, LinkedIn style) ====================

    /**
     * Feed score calculate karta hai — engagement / age-decay + fatigue penalty
     */
   private static calculateFeedScore(
        post: any,
        currentUserId: string,
        connectionDegree: 1 | 2 | 3 | null = null
    ): number {
        const ageInHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);

        // ✅ FIX: reposts ka likesCount/commentsCount top-level pe nahi hota —
        // originalPost se fallback lo taaki reposts hamesha 0 score na paayein
        const likes = post.likesCount ?? post.originalPost?.likesCount ?? 0;
        const comments = post.commentsCount ?? post.originalPost?.commentsCount ?? 0;
        const pollVotes = post.pollData?.totalVotes || 0;

        const engagementScore = likes * 3 + comments * 5 + pollVotes * 2;
        const decay = Math.pow(ageInHours + 2, 1.5);

        let score = engagementScore / decay;

        // ✅ NEW: Connection degree boost — LinkedIn jaisa, 1st degree ko sabse zyada weight
        if (connectionDegree === 1) score += 40;
        else if (connectionDegree === 2) score += 15;
        else if (connectionDegree === 3) score += 5;

        const alreadyViewed = post.analytics?.uniqueViewers?.includes(currentUserId);
        if (alreadyViewed && ageInHours > 6) {
            score = score * 0.05;
        }

        if (ageInHours < 1) {
            score += 50;
        }

        return score;
    }

    /**
     * ✅ Connection status batch fetch — current user vs sab post-authors
     */
    private static async getConnectionStatusMap(
        currentUserId: string,
        authorIds: string[]
    ): Promise<Record<string, ConnectionStatus>> {
        const { Connection, ConnectionRequest } = await import('@/connections/models');

        const uniqueAuthorIds = [...new Set(authorIds)].filter((id) => id !== currentUserId);
        const statusMap: Record<string, ConnectionStatus> = {};

        if (uniqueAuthorIds.length === 0) return statusMap;

        const [connections, requests] = await Promise.all([
            Connection.find({
                $or: [
                    { fromUserId: currentUserId, toUserId: { $in: uniqueAuthorIds } },
                    { fromUserId: { $in: uniqueAuthorIds }, toUserId: currentUserId },
                ],
                status: 'active',
            }).lean().select('fromUserId toUserId'),

            ConnectionRequest.find({
                $or: [
                    { fromUserId: currentUserId, toUserId: { $in: uniqueAuthorIds } },
                    { fromUserId: { $in: uniqueAuthorIds }, toUserId: currentUserId },
                ],
                status: 'pending',
            }).lean().select('fromUserId toUserId'),
        ]);

        uniqueAuthorIds.forEach((id) => (statusMap[id] = 'none'));

        connections.forEach((c: any) => {
            const otherId = c.fromUserId === currentUserId ? c.toUserId : c.fromUserId;
            statusMap[otherId] = 'connected';
        });

        requests.forEach((r: any) => {
            const otherId = r.fromUserId === currentUserId ? r.toUserId : r.fromUserId;
            if (statusMap[otherId] === 'connected') return;
            statusMap[otherId] = r.fromUserId === currentUserId ? 'pending_sent' : 'pending_received';
        });

        return statusMap;
    }

    /**
     * ✅ Connection DEGREE batch fetch — 1st/2nd/3rd, BFS over the same Connection collection
     * used by getConnectionStatusMap (Mongo-based, not Neo4j — keeps this consistent
     * with what's already working for connectionStatus).
     */
    private static async getConnectionDegreeMap(
        currentUserId: string,
        authorIds: string[]
    ): Promise<Record<string, 1 | 2 | 3 | null>> {
        const { Connection } = await import('@/connections/models');

        const uniqueAuthorIds = [...new Set(authorIds)].filter((id) => id !== currentUserId);
        const degreeMap: Record<string, 1 | 2 | 3 | null> = {};
        uniqueAuthorIds.forEach((id) => (degreeMap[id] = null));

        if (uniqueAuthorIds.length === 0) return degreeMap;

        const allConnections = await Connection.find({ status: 'active' })
            .lean()
            .select('fromUserId toUserId');

        const adjacency: Record<string, Set<string>> = {};
        allConnections.forEach((c: any) => {
            if (!adjacency[c.fromUserId]) adjacency[c.fromUserId] = new Set();
            if (!adjacency[c.toUserId]) adjacency[c.toUserId] = new Set();
            adjacency[c.fromUserId].add(c.toUserId);
            adjacency[c.toUserId].add(c.fromUserId);
        });

        const visited = new Set<string>([currentUserId]);
        let frontier = new Set<string>([currentUserId]);

        for (let depth = 1; depth <= 3; depth++) {
            const nextFrontier = new Set<string>();

            frontier.forEach((userId) => {
                const neighbors = adjacency[userId] || new Set();
                neighbors.forEach((neighborId) => {
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        nextFrontier.add(neighborId);
                        if (uniqueAuthorIds.includes(neighborId)) {
                            degreeMap[neighborId] = depth as 1 | 2 | 3;
                        }
                    }
                });
            });

            frontier = nextFrontier;
            if (frontier.size === 0) break;
        }

        return degreeMap;
    }

    /**
     * ✅ Get ALL posts from all users for home feed — reach-based + connection status
     */
    static async getAllPostsForHome(
    currentUserId: string,
    includeArchived: boolean = false,
    page: number = 1,
    limit: number = 20
): Promise<any> {
    const correlationId = uuidv4();

    try {
        LoggerUtil.info('Fetching all posts for home feed', { currentUserId, correlationId });

        const allUserDocs = await Post.find({}).lean();

        const cleanPost = (obj: any): any => {
            if (!obj.images?.length) delete obj.images;
            if (!obj.videos?.length) delete obj.videos;
            if (!obj.documents?.length) delete obj.documents;
            if (!obj.pollData?.question) delete obj.pollData;
            if (!obj.eventData?.eventType) delete obj.eventData;
            if (!obj.shadowbanReason) delete obj.shadowbanReason;
            if (!obj.scheduledFor) delete obj.scheduledFor;
            if (!obj.publishedAt) delete obj.publishedAt;
            if (!obj.pinnedAt) delete obj.pinnedAt;
            if (!obj.savedAt) delete obj.savedAt;
            if (!obj.archivedAt) delete obj.archivedAt;
            if (!obj.deletedAt) delete obj.deletedAt;
            return obj;
        };

        let allPosts: any[] = [];
        const authorIds: string[] = [];

        allUserDocs.forEach((doc: any) => {
            const entries = (doc.posts || [])
                .filter((p: any) => !p.isDeleted && (includeArchived || !p.isArchived) && !p.isShadowbanned)
                .map((p: any) => {
                    authorIds.push(doc.userId);
                    return cleanPost({
                        ...p,
                        userId: doc.userId,
                        documentPostId: doc.postId,
                        isLikedByCurrentUser: (p.likedBy || []).includes(currentUserId),
                    });
                });
            allPosts.push(...entries);
        });

        // ✅ Reposts bhi feed mein merge karo — YAHIN, forEach ke turant baad
        const { default: Repost } = await import('@/Profile/models/Repost.model');
        const allReposts = await Repost.find({ isDeleted: false }).lean();

        const repostEntries = await Promise.all(
    allReposts.map(async (repost: any) => {
        const originalDoc = allUserDocs.find((d: any) =>
            (d.posts || []).some((p: any) => p.entryId === repost.originalPostEntryId)
        );
        const originalEntry = originalDoc?.posts.find(
            (p: any) => p.entryId === repost.originalPostEntryId && !p.isDeleted
        );
        if (!originalEntry || !originalDoc) return null;   // 👈 yahan originalDoc bhi check karo

        authorIds.push(repost.repostedBy);

        return cleanPost({
            feedItemType: 'repost',
            repostId: repost.repostId,
            repostType: repost.repostType,
            thoughtText: repost.thoughtText || null,
            repostedBy: repost.repostedBy,
            createdAt: repost.createdAt,
            userId: repost.repostedBy,
            originalPost: {
                entryId: originalEntry.entryId,
                title: originalEntry.title,
                content: originalEntry.content,
                userId: originalDoc.userId,   // 👈 ab TypeScript ko pata hai yeh defined hai
                images: originalEntry.images || [],
                videos: originalEntry.videos || [],
                documents: originalEntry.documents || [],
                likesCount: originalEntry.likesCount,
                commentsCount: originalEntry.commentsCount,
                isLikedByCurrentUser: (originalEntry.likedBy || []).includes(currentUserId),
                createdAt: originalEntry.createdAt,
            },
        });
    })
);

        allPosts.push(...repostEntries.filter(Boolean));

        // ── Ab yahan se aage sab same hai ──

       const connectionStatusMap = await this.getConnectionStatusMap(currentUserId, authorIds);
        const connectionDegreeMap = await this.getConnectionDegreeMap(currentUserId, authorIds);

        allPosts = allPosts.map((post) => {
            const degree =
                post.userId === currentUserId ? null : connectionDegreeMap[post.userId] ?? null;

            return {
                ...post,
                feedScore: this.calculateFeedScore(post, currentUserId, degree),
                connectionStatus:
                    post.userId === currentUserId ? 'self' : connectionStatusMap[post.userId] || 'none',
                connectionDegree: degree,
            };
        });

        allPosts.sort((a, b) => b.feedScore - a.feedScore);

        const total = allPosts.length;
        const start = (page - 1) * limit;
        const paginated = allPosts.slice(start, start + limit);

        LoggerUtil.info('All posts fetched for home feed', {
            currentUserId,
            totalPosts: total,
            page,
            correlationId,
        });

        return { posts: paginated, total, page, hasMore: start + limit < total };

    } catch (error: any) {
        LoggerUtil.error('Get all posts for home failed', {
            error: error.message,
            currentUserId,
            correlationId,
        });
        throw error;
    }
}

    /**
     * ✅ Get single post entry by entryId
     */
    static async getPostById(entryId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching post by entryId', { entryId, userId, correlationId });

            const doc = await Post.findOne({ userId });
            if (!doc) throw new Error('Post not found');

            const entry = doc.posts.find(
                (p: IPostEntry) => p.entryId === entryId && !p.isDeleted
            );
            if (!entry) throw new Error('Post not found');

            if (entry.pollData && entry.pollData.isActive) {
                if (new Date() > entry.pollData.endsAt) {
                    entry.pollData.isActive = false;
                    await doc.save();
                }
            }

            LoggerUtil.info('Post fetched successfully', { entryId, userId, correlationId });

            return {
                ...(entry as any).toObject ? (entry as any).toObject() : entry,
                userId,
                documentPostId: doc.postId,
            };

        } catch (error: any) {
            LoggerUtil.error('Get post by entryId failed', {
                error: error.message,
                entryId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update post entry
     */
    static async updatePost(
        entryId: string,
        userId: string,
        updateData: PostData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating post', { entryId, userId, correlationId });

            if (updateData.pollData || updateData.eventData || updateData.scheduledFor) {
                throw new Error('Cannot update poll, event, or scheduled time after creation');
            }

            const doc = await Post.findOne({ userId });
            if (!doc) throw new Error('Post not found');

            const entry = doc.posts.find(
                (p: IPostEntry) => p.entryId === entryId && !p.isDeleted
            );
            if (!entry) throw new Error('Post not found');

            if (updateData.title) entry.title = updateData.title;
            if (updateData.content !== undefined) entry.content = updateData.content;

            await doc.save();

            LoggerUtil.info('Post updated successfully', { entryId, userId, correlationId });

            return {
                ...(entry as any).toObject ? (entry as any).toObject() : entry,
                userId,
                documentPostId: doc.postId,
            };

        } catch (error: any) {
            LoggerUtil.error('Post update failed', { error: error.message, entryId, userId, correlationId });
            throw error;
        }
    }

    /**
     * ✅ Delete post entry (soft or permanent)
     */
    static async deletePost(
        entryId: string,
        userId: string,
        permanent: boolean = false
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting post', { entryId, userId, permanent, correlationId });

            const doc = await Post.findOne({ userId });
            if (!doc) throw new Error('Post not found');

            const entryIndex = doc.posts.findIndex(
                (p: IPostEntry) => p.entryId === entryId && !p.isDeleted
            );
            if (entryIndex === -1) throw new Error('Post not found');

            const entry = doc.posts[entryIndex];

            if (permanent) {
                const allMedia = [
                    ...(entry.images || []),
                    ...(entry.videos || []),
                    ...(entry.documents || []),
                ];

                await Promise.all(
                    allMedia.map((media) => cloudinary.uploader.destroy(media.cloudinaryPublicId))
                );

                doc.posts.splice(entryIndex, 1);
                doc.totalPosts = Math.max(0, doc.totalPosts - 1);
                await doc.save();

                LoggerUtil.info('Post permanently deleted', { entryId, userId, correlationId });
                return { entryId, message: 'Post permanently deleted' };
            } else {
                entry.isDeleted = true;
                entry.deletedAt = new Date();
                await doc.save();

                LoggerUtil.info('Post soft deleted', { entryId, userId, correlationId });
                return { entryId, deletedAt: entry.deletedAt, message: 'Post deleted successfully' };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete post failed', { error: error.message, entryId, userId, correlationId });
            throw error;
        }
    }

    /**
     * ✅ Archive post entry
     */
    static async archivePost(entryId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const doc = await Post.findOne({ 'posts.entryId': entryId });
            if (!doc) throw new Error('Post not found');

            const entry = doc.posts.find(
                (p: IPostEntry) => p.entryId === entryId && !p.isDeleted
            );
            if (!entry) throw new Error('Post not found');
            if (entry.isArchived) throw new Error('Post is already archived');

            entry.isArchived = true;
            entry.archivedAt = new Date();
            await doc.save();

            LoggerUtil.info('Post archived', { entryId, userId, correlationId });

            return {
                entryId: entry.entryId,
                isArchived: entry.isArchived,
                archivedAt: entry.archivedAt,
                message: 'Post archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive post failed', { error: error.message, entryId, correlationId });
            throw error;
        }
    }

    /**
     * ✅ Restore post entry (archived or soft-deleted)
     */
    static async restorePost(entryId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const doc = await Post.findOne({ userId });
            if (!doc) throw new Error('Post not found');

            const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId);
            if (!entry) throw new Error('Post not found');

            entry.isArchived = false;
            entry.archivedAt = undefined;
            entry.isDeleted = false;
            entry.deletedAt = undefined;
            await doc.save();

            LoggerUtil.info('Post restored', { entryId, userId, correlationId });

            return {
                entryId: entry.entryId,
                isArchived: entry.isArchived,
                isDeleted: entry.isDeleted,
                message: 'Post restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore post failed', { error: error.message, entryId, correlationId });
            throw error;
        }
    }

    /**
     * ✅ Pin/Unpin post entry
     */
    static async pinPost(entryId: string, userId: string, isPinned: boolean): Promise<any> {
        const correlationId = uuidv4();

        try {
            const entry = await Post.setPinned(entryId, userId, isPinned);

            LoggerUtil.info('Post pin status updated', { entryId, userId, isPinned, correlationId });

            return {
                entryId: entry.entryId,
                isPinned: entry.isPinned,
                pinnedAt: entry.pinnedAt,
                message: `Post ${isPinned ? 'pinned' : 'unpinned'} successfully`,
            };

        } catch (error: any) {
            LoggerUtil.error('Pin post failed', { error: error.message, entryId, correlationId });
            throw error;
        }
    }

    /**
     * ✅ Save/Unsave post entry
     */
    static async savePost(entryId: string, userId: string, isSaved: boolean): Promise<any> {
        const correlationId = uuidv4();

        try {
            const entry = await Post.setSaved(entryId, userId, isSaved);

            LoggerUtil.info('Post save status updated', { entryId, userId, isSaved, correlationId });

            return {
                entryId: entry.entryId,
                isSaved: entry.isSaved,
                savedAt: entry.savedAt,
                message: `Post ${isSaved ? 'saved' : 'unsaved'} successfully`,
            };

        } catch (error: any) {
            LoggerUtil.error('Save post failed', { error: error.message, entryId, correlationId });
            throw error;
        }
    }

    /**
     * ✅ Get recent posts performance for a user
     */
    static async getRecentPostsPerformance(userId: string, limit: number = 10): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching recent posts performance', { userId, limit, correlationId });

            const doc = await Post.findOne({ userId });
            if (!doc) {
                return {
                    posts: [],
                    stats: {
                        totalPosts: 0,
                        avgEngagement: '0.00',
                        avgEngagementRate: '0.00',
                        bestPost: null,
                        worstPost: null,
                    },
                };
            }

            const entries = doc.posts
                .filter((p: IPostEntry) => !p.isDeleted && !p.isArchived)
                .sort(
                    (a: IPostEntry, b: IPostEntry) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )
                .slice(0, limit);

            const performance = entries.map((entry: IPostEntry) => {
                const ageInHours =
                    (Date.now() - new Date(entry.createdAt).getTime()) / (1000 * 60 * 60);
                const engagementRate = (
                    (entry.likesCount + entry.commentsCount) / Math.max(ageInHours, 1)
                ).toFixed(2);

                return {
                    entryId: entry.entryId,
                    title: entry.title,
                    likes: entry.likesCount,
                    comments: entry.commentsCount,
                    totalEngagement: entry.likesCount + entry.commentsCount,
                    engagementRate: parseFloat(engagementRate),
                    ageInHours: Math.floor(ageInHours),
                    createdAt: entry.createdAt,
                };
            });

            const avgEngagement =
                performance.reduce((sum, p) => sum + p.totalEngagement, 0) /
                Math.max(performance.length, 1);
            const avgEngagementRate =
                performance.reduce((sum, p) => sum + p.engagementRate, 0) /
                Math.max(performance.length, 1);

            return {
                posts: performance,
                stats: {
                    totalPosts: performance.length,
                    avgEngagement: avgEngagement.toFixed(2),
                    avgEngagementRate: avgEngagementRate.toFixed(2),
                    bestPost: performance[0] || null,
                    worstPost: performance[performance.length - 1] || null,
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Get recent posts performance failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Track post view analytics
     */
    static async trackPostView(
        entryId: string,
        userId: string,
        dwellTime: number,
        expanded: boolean = false
    ): Promise<any> {
        try {
            const doc = await Post.findOne({ 'posts.entryId': entryId });
            if (!doc) throw new Error('Post not found');

            const entry = doc.posts.find(
                (p: IPostEntry) => p.entryId === entryId && !p.isDeleted
            );
            if (!entry) throw new Error('Post not found');

            if (!entry.analytics) {
                entry.analytics = {
                    avgDwellTime: 0,
                    textExpansionRate: 0,
                    engagementVelocity: 0,
                    viewCount: 0,
                    uniqueViewers: [],
                    expandedTextViewers: [],
                };
            }

            if (!entry.analytics.uniqueViewers.includes(userId)) {
                entry.analytics.uniqueViewers.push(userId);
            }

            if (expanded && !entry.analytics.expandedTextViewers.includes(userId)) {
                entry.analytics.expandedTextViewers.push(userId);
            }

            if (dwellTime) {
                const totalDwell = entry.analytics.avgDwellTime * entry.analytics.viewCount;
                entry.analytics.viewCount++;
                entry.analytics.avgDwellTime =
                    (totalDwell + dwellTime) / entry.analytics.viewCount;
            }

            entry.analytics.textExpansionRate =
                (entry.analytics.expandedTextViewers.length /
                    Math.max(entry.analytics.uniqueViewers.length, 1)) *
                100;

            await doc.save();

            return { entryId: entry.entryId, analytics: entry.analytics };

        } catch (error: any) {
            LoggerUtil.error('Track post view failed', { error: error.message });
            throw error;
        }
    }

    /* Changed Modified
     * ✅ Like a post entry
     */
   static async likePost(entryId: string, userId: string): Promise<any> {
    const correlationId = uuidv4();

    try {
        LoggerUtil.info('Liking post', { entryId, userId, correlationId });

        // ✅ Need the post owner before incrementing, to know who to notify
        const doc = await Post.findOne({ 'posts.entryId': entryId });
        if (!doc) throw new Error('Post not found');

        const postEntry = doc.posts.find((p: IPostEntry) => p.entryId === entryId);
        const postOwnerId = doc.userId;

        const entry = await Post.incrementLikes(entryId, userId);

        // ✅ Notify the post owner — but not if they liked their own post
        if (postOwnerId && postOwnerId !== userId) {
            setImmediate(async () => {
                try {
                    await NotificationService.notifyPostLiked(
                        postOwnerId,
                        userId,
                        entryId,
                        postEntry?.title
                    );
                    console.log('✅ [NOTIF] Post owner notified of like:', entryId);
                } catch (err: any) {
                    console.warn('⚠️ [NOTIF] Like notification failed (non-blocking):', err.message);
                }
            });
        }

        LoggerUtil.info('Post liked successfully', {
            entryId, userId, likesCount: entry.likesCount, correlationId,
        });

        return {
            entryId: entry.entryId,
            likesCount: entry.likesCount,
            liked: true,
            message: 'Post liked successfully',
        };

    } catch (error: any) {
        LoggerUtil.error('Like post failed', { error: error.message, entryId, userId, correlationId });
        throw error;
    }
}

    /**
     * ✅ Unlike a post entry
     */
    static async unlikePost(entryId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Unliking post', { entryId, userId, correlationId });

            const entry = await Post.decrementLikes(entryId, userId);

            LoggerUtil.info('Post unliked successfully', {
                entryId,
                userId,
                likesCount: entry.likesCount,
                correlationId,
            });

            return {
                entryId: entry.entryId,
                likesCount: entry.likesCount,
                liked: false,
                message: 'Post unliked successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Unlike post failed', { error: error.message, entryId, userId, correlationId });
            throw error;
        }
    }
    /**
     * ✅ React to a post (like/celebrate/support/love/insightful/funny)
     */
    static async reactToPost(entryId: string, userId: string, type: string): Promise<any> {
        const correlationId = uuidv4();
        const validTypes = ['like', 'celebrate', 'support', 'love', 'insightful', 'funny'];

        try {
            if (!validTypes.includes(type)) {
                throw new Error('Invalid reaction type');
            }

            LoggerUtil.info('Reacting to post', { entryId, userId, type, correlationId });

            const doc = await Post.findOne({ 'posts.entryId': entryId });
            if (!doc) throw new Error('Post not found');
            const postEntry = doc.posts.find((p: IPostEntry) => p.entryId === entryId);
            const postOwnerId = doc.userId;

            const entry = await Post.addReaction(entryId, userId, type as any);

            // Notify post owner (skip self-reactions)
            if (postOwnerId && postOwnerId !== userId) {
                setImmediate(async () => {
                    try {
                        await NotificationService.notifyPostLiked(
                            postOwnerId, userId, entryId, postEntry?.title
                        );
                    } catch (err: any) {
                        console.warn('⚠️ [NOTIF] Reaction notification failed (non-blocking):', err.message);
                    }
                });
            }

            LoggerUtil.info('Reaction added successfully', { entryId, userId, type, correlationId });

            return {
                entryId: entry.entryId,
                reactionCounts: entry.reactionCounts,
                userReaction: type,
                message: 'Reaction added successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('React to post failed', { error: error.message, entryId, userId, correlationId });
            throw error;
        }
    }

    /**
     * ✅ Remove reaction from a post
     */
    static async removeReaction(entryId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Removing reaction', { entryId, userId, correlationId });

            const entry = await Post.removeReaction(entryId, userId);

            LoggerUtil.info('Reaction removed successfully', { entryId, userId, correlationId });

            return {
                entryId: entry.entryId,
                reactionCounts: entry.reactionCounts,
                userReaction: null,
                message: 'Reaction removed successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Remove reaction failed', { error: error.message, entryId, userId, correlationId });
            throw error;
        }
    }

    /**
     * ✅ Get all posts a user has reacted to (for "Reactions" activity tab)
     * Scans ALL Post documents (all users), finds entries where this userId
     * has a reaction, returns those post entries grouped with reaction type.
     */
    static async getUserReactions(userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching user reactions', { userId, correlationId });

            const allDocs = await Post.find({ 'posts.reactions.userId': userId }).lean();

            const results: any[] = [];

            allDocs.forEach((doc: any) => {
                (doc.posts || []).forEach((entry: any) => {
                    if (entry.isDeleted) return;
                    const userReaction = (entry.reactions || []).find((r: any) => r.userId === userId);
                    if (!userReaction) return;

                    results.push({
                        entryId: entry.entryId,
                        title: entry.title,
                        content: entry.content,
                        images: entry.images || [],
                        videos: entry.videos || [],
                        documents: entry.documents || [],
                        likesCount: entry.likesCount,
                        commentsCount: entry.commentsCount,
                        reactionCounts: entry.reactionCounts || {},
                        userId: doc.userId,          // post owner
                        createdAt: entry.createdAt,
                        reactionType: userReaction.type,   // ✅ jo type is user ne diya
                        reactedAt: userReaction.reactedAt,
                    });
                });
            });

            results.sort((a, b) => new Date(b.reactedAt).getTime() - new Date(a.reactedAt).getTime());

            LoggerUtil.info('User reactions fetched', { userId, count: results.length, correlationId });

            return { reactions: results, total: results.length };

        } catch (error: any) {
            LoggerUtil.error('Get user reactions failed', { error: error.message, userId, correlationId });
            throw error;
        }
    }

    // ==================== PRIVATE HELPERS ====================

    private static async analyzePost(
        postData: PostData,
        userId: string,
        images: Express.Multer.File[],
        videos: Express.Multer.File[],
        documents: Express.Multer.File[]
    ): Promise<PostAnalysisResult> {
        const correlationId = uuidv4();

        try {
            const isFreshContent = true;
            const text = `${postData.title} ${postData.content || ''}`;
            const contentClassification = this.classifyContent(text);
            const postHour = new Date().getHours();
            const postTimeScore = this.calculatePostTimeScore(postHour);

            const user = await User.findOne({ userId });
            const userActiveHourMatch =
                user?.activityPattern?.activeHours?.includes(postHour) || false;

            const performanceHistory = await this.getUserPerformanceHistory(userId);
            const qualityMetrics = this.calculateQualityMetrics(text, images, videos, documents);
            const hasExternalLinkPenalty = qualityMetrics.linkCount > 1;
            const linkPreviewQuality = qualityMetrics.linkCount > 0 ? 50 : 0;

            return {
                isFreshContent,
                contentClassification,
                postTimeScore,
                userActiveHourMatch,
                performanceHistory,
                qualityMetrics,
                hasExternalLinkPenalty,
                linkPreviewQuality,
            };

        } catch (error: any) {
            LoggerUtil.error('Post analysis failed', { error: error.message, userId, correlationId });
            throw error;
        }
    }

    private static classifyContent(text: string): any {
        const keywords: { [key: string]: string[] } = {
            knowledge: ['learn', 'tutorial', 'guide', 'tips', 'how to', 'explained'],
            hiring: ['hiring', 'job opening', 'we are looking', 'join our team', 'careers'],
            promotion: ['proud to announce', 'excited to share', 'thrilled', 'achievement'],
            'personal-story': ['my journey', 'experience', 'learned', 'grew', 'challenge'],
            announcement: ['launching', 'introducing', 'new feature', 'update'],
        };

        let primaryType = 'other';
        let maxScore = 0;

        for (const [type, words] of Object.entries(keywords)) {
            const score = words.filter((word) => text.toLowerCase().includes(word)).length;
            if (score > maxScore) {
                maxScore = score;
                primaryType = type;
            }
        }

        return {
            primaryType,
            confidence: Math.min(maxScore * 20, 100),
            keywords: text.toLowerCase().split(' ').slice(0, 10),
            topics: [primaryType],
        };
    }

    private static calculatePostTimeScore(hour: number): number {
        const peakHours = [9, 10, 11, 13, 14, 15, 18, 19, 20];
        if (peakHours.includes(hour)) return 100;
        if (hour >= 8 && hour <= 21) return 70;
        return 30;
    }

    private static async getUserPerformanceHistory(userId: string): Promise<any> {
        try {
            const doc = await Post.findOne({ userId });
            if (!doc || doc.posts.length === 0) {
                return { last5PostsAvgEngagement: 0, last10PostsAvgEngagement: 0, recentTrend: 'stable' };
            }

            const recentPosts = doc.posts
                .filter((p: IPostEntry) => !p.isDeleted && !p.isArchived)
                .sort(
                    (a: IPostEntry, b: IPostEntry) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )
                .slice(0, 10);

            const last5 = recentPosts.slice(0, 5);
            const last10 = recentPosts;

            const avg5 =
                last5.reduce((sum: number, p: IPostEntry) => sum + p.likesCount + p.commentsCount, 0) /
                Math.max(last5.length, 1);
            const avg10 =
                last10.reduce((sum: number, p: IPostEntry) => sum + p.likesCount + p.commentsCount, 0) /
                Math.max(last10.length, 1);

            const recentTrend =
                avg5 > avg10 * 1.2 ? 'improving' : avg5 < avg10 * 0.8 ? 'declining' : 'stable';

            return { last5PostsAvgEngagement: avg5, last10PostsAvgEngagement: avg10, recentTrend };

        } catch {
            return { last5PostsAvgEngagement: 0, last10PostsAvgEngagement: 0, recentTrend: 'stable' };
        }
    }

    private static calculateQualityMetrics(
        text: string,
        images: Express.Multer.File[],
        videos: Express.Multer.File[],
        documents: Express.Multer.File[]
    ): any {
        const hashtagCount = (text.match(/#/g) || []).length;
        const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
        const linkCount = (text.match(/https?:\/\//g) || []).length;

        const words = text.toLowerCase().split(/\s+/);
        const wordCounts: { [key: string]: number } = {};
        words.forEach((word) => {
            if (word.length > 3) wordCounts[word] = (wordCounts[word] || 0) + 1;
        });
        const maxRepeat = Math.max(...Object.values(wordCounts), 0);
        const repetitiveKeywordScore = maxRepeat > 5 ? maxRepeat * 10 : 0;

        let spamScore = 0;
        if (hashtagCount > 10) spamScore += 30;
        if (emojiCount > 15) spamScore += 25;
        if (linkCount > 3) spamScore += 35;
        if (repetitiveKeywordScore > 50) spamScore += 20;

        const overallQuality = Math.max(0, 100 - spamScore);

        return {
            spamScore,
            hashtagCount,
            emojiCount,
            linkCount,
            repetitiveKeywordScore,
            overallQuality,
        };
    }
}

export default PostService;