// src/Profile/services/activity/homePost.service.ts

import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import sharp from 'sharp';
import Constants from '@/shared/constants.util';
import { Post, User, ProfilePhoto, Comment } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import redisService from '@/services/redis.service';

interface HomePostData {
    title: string;
    content?: string;
    mood?: 'happy' | 'thoughtful' | 'excited' | 'reflective' | 'grateful';
    isPublic?: boolean;
    scheduledFor?: Date;
    pollData?: {
        question: string;
        options: string[];
        duration: 1 | 3 | 7 | 14;
    };
    eventData?: any;
}

class HomePostService {

    // ==================== ✅ CANDIDATE GENERATION CONFIG ====================
    // LinkedIn ke "10,000 posts -> 500 candidates" step ka equivalent.
    private static readonly MAX_CANDIDATE_AUTHORS = 300;
    private static readonly MAX_CANDIDATE_POSTS = 500;
    private static readonly DISCOVERY_SLOT_RATIO = 0.15; // 15% discovery, 85% network
    private static readonly DISCOVERY_WINDOW_DAYS = 3;

    // ==================== ✅ INTEREST / TOPIC MATCHING CONFIG ====================
    // User.skills ko interest-proxy ki tarah use kar rahe hain jab tak
    // contentClassification.topics NLP se populate nahi hoti.
    private static readonly INTEREST_MATCH_WEIGHT = 10;
    private static readonly MAX_INTEREST_MATCHES = 4;

    static async createHomePost(
        userId: string,
        postData: HomePostData,
        images: Express.Multer.File[] = [],
        videos: Express.Multer.File[] = [],
        documents: Express.Multer.File[] = []
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating home post', { userId, correlationId });

            const user = await User.findOne({ userId });
            if (!user) throw new Error('User not found');
            if (user.status !== 'active') throw new Error('User account is not active');

            if (images.length > Constants.ACTIVITY_VALIDATION.POST.MAX_IMAGES_PER_POST)
                throw new Error(`Maximum ${Constants.ACTIVITY_VALIDATION.POST.MAX_IMAGES_PER_POST} images allowed`);
            if (videos.length > Constants.ACTIVITY_VALIDATION.POST.MAX_VIDEOS_PER_POST)
                throw new Error(`Maximum ${Constants.ACTIVITY_VALIDATION.POST.MAX_VIDEOS_PER_POST} videos allowed`);
            if (documents.length > Constants.ACTIVITY_VALIDATION.POST.MAX_DOCUMENTS_PER_POST)
                throw new Error(`Maximum ${Constants.ACTIVITY_VALIDATION.POST.MAX_DOCUMENTS_PER_POST} documents allowed`);

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

            let scheduledSetup = null;
            if (postData.scheduledFor) {
                const scheduledTime = new Date(postData.scheduledFor);
                const minFutureTime = new Date(Date.now() + 5 * 60 * 1000);
                if (scheduledTime < minFutureTime)
                    throw new Error('Scheduled time must be at least 5 minutes in the future');
                scheduledSetup = { scheduledFor: scheduledTime, isScheduled: true };
            }

            let eventSetup = null;
            if (postData.eventData) {
                const eventStartDateTime = new Date(
                    `${postData.eventData.startDate}T${postData.eventData.startTime}`
                );
                if (eventStartDateTime <= new Date())
                    throw new Error('Event start time must be in the future');
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

            const uploadedImages = await Promise.all(
                images.map(async (file) => {
                    const metadata = await sharp(file.buffer).metadata();
                    if (!metadata.width || !metadata.height)
                        throw new Error('Unable to read image dimensions');
                    if (
                        metadata.width < Constants.ACTIVITY_VALIDATION.IMAGE.MIN_WIDTH ||
                        metadata.height < Constants.ACTIVITY_VALIDATION.IMAGE.MIN_HEIGHT
                    ) throw new Error(`Image dimensions must be at least ${Constants.ACTIVITY_VALIDATION.IMAGE.MIN_WIDTH}x${Constants.ACTIVITY_VALIDATION.IMAGE.MIN_HEIGHT}px`);

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

            const entryId = uuidv4();
            const newEntry: any = {
                entryId,
                title: postData.title,
                content: postData.content,
                mood: postData.mood || null,
                isPublic: postData.isPublic !== false,
                postUrl: `/posts/${entryId}`,
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
                isFreshContent: true,
                postTimeScore: this.calculatePostTimeScore(new Date().getHours()),
                userActiveHourMatch: false,
                qualityMetrics: {
                    spamScore: 0,
                    hashtagCount: 0,
                    emojiCount: 0,
                    linkCount: 0,
                    repetitiveKeywordScore: 0,
                    overallQuality: 100,
                },
                hasExternalLinkPenalty: false,
                isShadowbanned: false,
            };

            let userPostDoc = await Post.findOne({ userId });
            if (userPostDoc) {
                userPostDoc.posts.push(newEntry);
                userPostDoc.totalPosts += 1;
                await userPostDoc.save();
            } else {
                userPostDoc = new Post({
                    postId: uuidv4(),
                    userId,
                    creatorModeEnabled: false,
                    totalPosts: 1,
                    posts: [newEntry],
                });
                await userPostDoc.save();
            }

            await User.findOneAndUpdate(
                { userId },
                {
                    $push: { 'activityIds.postIds': entryId },
                    $inc: { 'activityStats.totalPosts': 1 },
                },
                { new: true }
            );

            const savedEntry = userPostDoc.posts[userPostDoc.posts.length - 1];

            await redisService.deleteByPattern(`feed:v1:${userId}:page:*`);

            if (savedEntry.isScheduled && savedEntry.scheduledFor) {
                return {
                    success: true,
                    isScheduled: true,
                    entryId: savedEntry.entryId,
                    title: savedEntry.title,
                    mood: savedEntry.mood,
                    isPublic: savedEntry.isPublic,
                    scheduledFor: savedEntry.scheduledFor,
                    message: `Post scheduled for ${savedEntry.scheduledFor.toLocaleString()}`,
                };
            }

             LoggerUtil.info('Home post created successfully', { entryId, userId, correlationId });

            // ✅ FIX: userId, likesCount, commentsCount, likedBy explicitly add kiye.
            // Pehle ye missing the, isliye jab frontend is response ko turant feed
            // mein prepend karta tha, author identify nahi ho pata tha aur post
            // "Unknown User" ke naam se dikhti thi ya prepend hi silently fail ho
            // jaata tha.
            return {
                success: true,
                entryId: savedEntry.entryId,
                userId,
                title: savedEntry.title,
                content: savedEntry.content,
                mood: savedEntry.mood,
                isPublic: savedEntry.isPublic,
                postUrl: savedEntry.postUrl,
                likesCount: savedEntry.likesCount || 0,
                commentsCount: savedEntry.commentsCount || 0,
                likedBy: savedEntry.likedBy || [],
                isLikedByCurrentUser: false,
                ...(savedEntry.images?.length > 0 && { images: savedEntry.images }),
                ...(savedEntry.videos?.length > 0 && { videos: savedEntry.videos }),
                ...(savedEntry.documents?.length > 0 && { documents: savedEntry.documents }),
                ...(savedEntry.pollData && { pollData: savedEntry.pollData }),
                createdAt: savedEntry.createdAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Home post creation failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== ✅ CANDIDATE AUTHOR POOL ====================
    private static async getCandidateAuthorIds(
        currentUserId: string
    ): Promise<{ networkAuthorIds: string[]; discoveryAuthorIds: string[] }> {
        const { Connection, Follow } = await import('@/connections/models');

        const directConnections = await Connection.find({
            status: 'active',
            $or: [{ fromUserId: currentUserId }, { toUserId: currentUserId }],
        }).lean().select('fromUserId toUserId');

        const firstDegreeIds = new Set<string>();
        directConnections.forEach((c: any) => {
            firstDegreeIds.add(c.fromUserId === currentUserId ? c.toUserId : c.fromUserId);
        });

        const follows = await Follow.find({ followerId: currentUserId })
            .lean()
            .select('followingId')
            .limit(200);
        follows.forEach((f: any) => firstDegreeIds.add(f.followingId));

        const secondDegreeIds = new Set<string>();
        if (firstDegreeIds.size > 0) {
            const secondDegreeConnections = await Connection.find({
                status: 'active',
                $or: [
                    { fromUserId: { $in: [...firstDegreeIds] } },
                    { toUserId: { $in: [...firstDegreeIds] } },
                ],
            }).lean().select('fromUserId toUserId').limit(1000);

            secondDegreeConnections.forEach((c: any) => {
                const otherId = firstDegreeIds.has(c.fromUserId) ? c.toUserId : c.fromUserId;
                if (otherId !== currentUserId && !firstDegreeIds.has(otherId)) {
                    secondDegreeIds.add(otherId);
                }
            });
        }

        const networkAuthorIds = [...firstDegreeIds, ...secondDegreeIds]
            .slice(0, this.MAX_CANDIDATE_AUTHORS);

        const discoverySlots = Math.max(
            0,
            Math.floor(this.MAX_CANDIDATE_AUTHORS * this.DISCOVERY_SLOT_RATIO)
        );

        let discoveryAuthorIds: string[] = [];
        if (discoverySlots > 0) {
            const excludeIds = [currentUserId, ...networkAuthorIds];
            const windowStart = new Date(Date.now() - this.DISCOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

            const discoveryDocs = await Post.aggregate([
                { $match: { userId: { $nin: excludeIds } } },
                { $unwind: '$posts' },
                {
                    $match: {
                        'posts.isDeleted': false,
                        'posts.isArchived': false,
                        'posts.isScheduled': { $ne: true },
                        'posts.isPublic': { $ne: false },
                        'posts.isShadowbanned': { $ne: true },
                        'posts.createdAt': { $gte: windowStart },
                    },
                },
                {
                    $addFields: {
                        engagement: {
                            $add: ['$posts.likesCount', { $multiply: ['$posts.commentsCount', 2] }],
                        },
                    },
                },
                { $sort: { engagement: -1 } },
                { $group: { _id: '$userId' } },
                { $limit: discoverySlots },
            ]);
            discoveryAuthorIds = discoveryDocs.map((d: any) => d._id);
        }

        return { networkAuthorIds, discoveryAuthorIds };
    }

    // ==================== ✅ USER INTEREST KEYWORDS ====================
    private static async getUserInterestKeywords(userId: string): Promise<string[]> {
        const { default: Skill } = await import('@/Profile/models/Skill.model');
        const skills = await Skill.find({ userId, isDeleted: false, isArchived: false })
            .lean()
            .select('skillName');
        return skills
            .map((s: any) => (s.skillName || '').trim().toLowerCase())
            .filter((s: string) => s.length > 0);
    }

    private static getMatchedInterests(post: any, interestKeywords: string[]): string[] {
        if (interestKeywords.length === 0) return [];

        const textSource = post.feedItemType === 'repost' ? post.originalPost : post;
        const text = `${textSource?.title || ''} ${textSource?.content || ''}`.toLowerCase();
        if (!text.trim()) return [];

        const matched: string[] = [];
        for (const keyword of interestKeywords) {
            if (matched.length >= this.MAX_INTEREST_MATCHES) break;
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
            if (regex.test(text)) matched.push(keyword);
        }
        return matched;
    }

    // ==================== MERGED CONNECTION DATA ====================
    private static async getConnectionData(
        currentUserId: string,
        authorIds: string[]
    ): Promise<{
        statusMap: Record<string, string>;
        degreeMap: Record<string, 1 | 2 | 3 | null>;
        connectionIdsSet: Set<string>;
    }> {
        const { Connection, ConnectionRequest } = await import('@/connections/models');

        const uniqueAuthorIds = [...new Set(authorIds)].filter((id) => id !== currentUserId);
        const statusMap: Record<string, string> = {};
        const degreeMap: Record<string, 1 | 2 | 3 | null> = {};
        uniqueAuthorIds.forEach((id) => {
            statusMap[id] = 'none';
            degreeMap[id] = null;
        });

        const [allConnections, pendingRequests] = await Promise.all([
            Connection.find({ status: 'active' }).lean().select('fromUserId toUserId'),
            uniqueAuthorIds.length > 0
                ? ConnectionRequest.find({
                    $or: [
                        { fromUserId: currentUserId, toUserId: { $in: uniqueAuthorIds } },
                        { fromUserId: { $in: uniqueAuthorIds }, toUserId: currentUserId },
                    ],
                    status: 'pending',
                }).lean().select('fromUserId toUserId')
                : Promise.resolve([]),
        ]);

        const adjacency: Record<string, Set<string>> = {};
        const connectionIdsSet = new Set<string>();

        allConnections.forEach((c: any) => {
            if (!adjacency[c.fromUserId]) adjacency[c.fromUserId] = new Set();
            if (!adjacency[c.toUserId]) adjacency[c.toUserId] = new Set();
            adjacency[c.fromUserId].add(c.toUserId);
            adjacency[c.toUserId].add(c.fromUserId);

            if (c.fromUserId === currentUserId) connectionIdsSet.add(c.toUserId);
            if (c.toUserId === currentUserId) connectionIdsSet.add(c.fromUserId);
        });

        connectionIdsSet.forEach((id) => {
            if (statusMap[id] !== undefined) statusMap[id] = 'connected';
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
                        if (uniqueAuthorIds.includes(neighborId) && degreeMap[neighborId] === null) {
                            degreeMap[neighborId] = depth as 1 | 2 | 3;
                        }
                    }
                });
            });
            frontier = nextFrontier;
            if (frontier.size === 0) break;
        }

        pendingRequests.forEach((r: any) => {
            const otherId = r.fromUserId === currentUserId ? r.toUserId : r.fromUserId;
            if (statusMap[otherId] === 'connected') return;
            statusMap[otherId] = r.fromUserId === currentUserId ? 'pending_sent' : 'pending_received';
        });

        return { statusMap, degreeMap, connectionIdsSet };
    }

    // ✅ NEW: dwell time config — LinkedIn doc point #7 (engagement/dwell signals)
    private static readonly DWELL_TIME_CAP_SECONDS = 30;
    private static readonly DWELL_TIME_MAX_BONUS = 20;

    // ✅ NEW: negative signal (previous behaviour) config
    private static readonly IGNORE_SIGNAL_PENALTY_PER_COUNT = 3;
    private static readonly IGNORE_SIGNAL_MAX_PENALTY = 15;

    // ✅ CHANGED: ignoreCount naya param add hua
    private static calculateFeedScore(
        post: any,
        connectionDegree: 1 | 2 | 3 | null,
        knownLikersCount: number = 0,
        knownCommentersCount: number = 0,
        interestMatchCount: number = 0,
        avgDwellTime: number = 0,
        ignoreCount: number = 0 // ✅ NEW — is author ko viewer ne kitni baar "ignore" kiya
    ): number {
        const ageInHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
        const ageInDays = ageInHours / 24;

        const likes = post.likesCount ?? post.originalPost?.likesCount ?? 0;
        const comments = post.commentsCount ?? post.originalPost?.commentsCount ?? 0;
        const pollVotes = post.pollData?.totalVotes || 0;

        const engagementScore = (likes * 3 + comments * 5 + pollVotes * 2) * 10;
        const decay = Math.pow(ageInDays + 1, 1.8);

        let score = engagementScore / decay;

        if (connectionDegree === 1) score += 15;
        else if (connectionDegree === 2) score += 8;
        else if (connectionDegree === 3) score += 3;

        score += knownLikersCount * 5;
        score += knownCommentersCount * 8;

        score += Math.min(interestMatchCount, this.MAX_INTEREST_MATCHES) * this.INTEREST_MATCH_WEIGHT;

        const dwellRatio = Math.min(avgDwellTime, this.DWELL_TIME_CAP_SECONDS) / this.DWELL_TIME_CAP_SECONDS;
        score += dwellRatio * this.DWELL_TIME_MAX_BONUS;

        // ✅ NEW: negative signal penalty — jitna zyada is author ko viewer
        // ne ignore kiya hai, utna neeche jaayega (capped, taaki ek author
        // permanently feed se gayab na ho jaaye)
        const ignorePenalty = Math.min(ignoreCount, this.IGNORE_SIGNAL_MAX_PENALTY / this.IGNORE_SIGNAL_PENALTY_PER_COUNT)
            * this.IGNORE_SIGNAL_PENALTY_PER_COUNT;
        score -= ignorePenalty;

        if (ageInHours < 1) score += 25;

        return score;
    }

    // ✅ NEW: viewer ke against candidate authors ka ignore-count batch fetch karta hai
    private static async getIgnoreSignalsForAuthors(
        viewerId: string,
        authorIds: string[]
    ): Promise<Record<string, number>> {
        const map: Record<string, number> = {};
        const uniqueAuthorIds = [...new Set(authorIds)];
        if (uniqueAuthorIds.length === 0) return map;

        await Promise.all(
            uniqueAuthorIds.map(async (authorId) => {
                try {
                    const raw = await redisService.get(`feed:ignore:${viewerId}:${authorId}`);
                    map[authorId] = raw ? parseInt(raw, 10) || 0 : 0;
                } catch {
                    map[authorId] = 0;
                }
            })
        );

        return map;
    }

    static async getHomeFeedPosts(
        currentUserId: string,
        page: number = 1,
        limit: number = 20
    ): Promise<any> {
        const correlationId = uuidv4();
        const cacheKey = `feed:v1:${currentUserId}:page:${page}:limit:${limit}`;

        try {
            LoggerUtil.info('Fetching home feed posts', { currentUserId, page, limit, correlationId });

            const cached = await redisService.get(cacheKey);

            if (cached) {
                LoggerUtil.info('Home feed served from cache', { currentUserId, page, correlationId });
                return JSON.parse(cached);
            }

            const { networkAuthorIds, discoveryAuthorIds } =
                await this.getCandidateAuthorIds(currentUserId);

            const candidateAuthorIds = [
                ...new Set([currentUserId, ...networkAuthorIds, ...discoveryAuthorIds]),
            ];

            // interest keywords ek baar fetch kar lo
            const interestKeywords = await this.getUserInterestKeywords(currentUserId);

            const allUserDocs = await Post.find({ userId: { $in: candidateAuthorIds } })
                .lean()
                .limit(this.MAX_CANDIDATE_AUTHORS + 50);

            let allPosts: any[] = [];
            const authorIds: string[] = [];

            allUserDocs.forEach((doc: any) => {
                const entries = (doc.posts || [])
                    .filter((p: any) =>
                        !p.isDeleted &&
                        !p.isArchived &&
                        !p.isScheduled &&
                        p.isPublic !== false &&
                        !p.isShadowbanned // ✅ FIX: pehle ye check missing tha — shadowbanned posts normal feed mein dikh rahe the
                    )
                    .map((p: any) => {
                        authorIds.push(doc.userId);
                        return {
                            ...p,
                            userId: doc.userId,
                            documentPostId: doc.postId,
                            isLikedByCurrentUser: (p.likedBy || []).includes(currentUserId),
                        };
                    });
                allPosts.push(...entries);
            });

            if (allPosts.length > this.MAX_CANDIDATE_POSTS) {
                allPosts = allPosts
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, this.MAX_CANDIDATE_POSTS);
            }

            const { default: Repost } = await import('@/Profile/models/Repost.model');
            const allReposts = await Repost.find({
                isDeleted: false,
                repostedBy: { $in: candidateAuthorIds },
            }).lean();

            const repostEntries = await Promise.all(
                allReposts.map(async (repost: any) => {
                    const originalDoc = allUserDocs.find((d: any) =>
                        (d.posts || []).some((p: any) => p.entryId === repost.originalPostEntryId)
                    );
                    const originalEntry = originalDoc?.posts.find(
                        (p: any) => p.entryId === repost.originalPostEntryId && !p.isDeleted
                    );
                    if (!originalEntry || !originalDoc) return null;

                    authorIds.push(repost.repostedBy);
                    authorIds.push(originalDoc.userId);

                    return {
                        feedItemType: 'repost',
                        entryId: repost.repostId,
                        repostId: repost.repostId,
                        repostType: repost.repostType,
                        thoughtText: repost.thoughtText || null,
                        repostedBy: repost.repostedBy,
                        createdAt: repost.createdAt,
                        userId: repost.repostedBy,
                        likesCount: originalEntry.likesCount || 0,
                        commentsCount: originalEntry.commentsCount || 0,
                        likedBy: originalEntry.likedBy || [],
                        isLikedByCurrentUser: (originalEntry.likedBy || []).includes(currentUserId),
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
                            repostsCount: originalEntry.repostsCount || 0,   // ✅ FIX: missing tha
                            sendsCount: originalEntry.sendsCount || 0,       // ✅ FIX: missing tha
                            isLikedByCurrentUser: (originalEntry.likedBy || []).includes(currentUserId),
                            createdAt: originalEntry.createdAt,
                            analytics: originalEntry.analytics || null, // ✅ NEW: dwell time score ke liye chahiye
                        },
                    };
                })
            );

            allPosts.push(...repostEntries.filter(Boolean));

            const {
                statusMap: connectionStatusMap,
                degreeMap: connectionDegreeMap,
                connectionIdsSet,
            } = await this.getConnectionData(currentUserId, authorIds);

            const likedByConnectionsMap: Record<string, string[]> = {};
            const allKnownLikerIds = new Set<string>();

            allPosts.forEach((post) => {
                const likedBy: string[] = post.likedBy || [];
                const knownLikers = likedBy.filter((id) => connectionIdsSet.has(id));
                likedByConnectionsMap[post.entryId] = knownLikers;
                knownLikers.forEach((id) => allKnownLikerIds.add(id));
            });

            let likerNamesMap: Record<string, string> = {};
            let likerAvatarsMap: Record<string, string | null> = {};
            if (allKnownLikerIds.size > 0) {
                const likerUsers = await User.find({ userId: { $in: [...allKnownLikerIds] } })
                    .lean()
                    .select('userId firstName lastName profilePhotoId');
                likerNamesMap = likerUsers.reduce((acc: Record<string, string>, u: any) => {
                    acc[u.userId] = `${u.firstName} ${u.lastName}`.trim();
                    return acc;
                }, {});

                const photoIds = likerUsers.map((u: any) => u.profilePhotoId).filter(Boolean);
                let photoMap: Record<string, string> = {};
                if (photoIds.length > 0) {
                    const photos = await ProfilePhoto.find({ photoId: { $in: photoIds } })
                        .lean()
                        .select('photoId cloudinarySecureUrl');
                    photoMap = photos.reduce((acc: Record<string, string>, p: any) => {
                        acc[p.photoId] = p.cloudinarySecureUrl;
                        return acc;
                    }, {});
                }
                likerAvatarsMap = likerUsers.reduce((acc: Record<string, string | null>, u: any) => {
                    acc[u.userId] = u.profilePhotoId ? (photoMap[u.profilePhotoId] || null) : null;
                    return acc;
                }, {});
            }

            const entryIds = allPosts.map((post) => post.entryId);
            const commentedByConnectionsMap: Record<string, string[]> = {};
            const allKnownCommenterIds = new Set<string>();

            if (entryIds.length > 0) {
                const comments = await Comment.find({
                    postId: { $in: entryIds },
                    isDeleted: false,
                }).lean().select('postId userId');

                const commentersByPost: Record<string, Set<string>> = {};
                comments.forEach((c: any) => {
                    if (!commentersByPost[c.postId]) commentersByPost[c.postId] = new Set();
                    if (connectionIdsSet.has(c.userId)) {
                        commentersByPost[c.postId].add(c.userId);
                    }
                });

                Object.keys(commentersByPost).forEach((postId) => {
                    const ids = [...commentersByPost[postId]];
                    commentedByConnectionsMap[postId] = ids;
                    ids.forEach((id) => allKnownCommenterIds.add(id));
                });
            }

            let commenterNamesMap: Record<string, string> = {};
            let commenterAvatarsMap: Record<string, string | null> = {};
            if (allKnownCommenterIds.size > 0) {
                const commenterUsers = await User.find({ userId: { $in: [...allKnownCommenterIds] } })
                    .lean()
                    .select('userId firstName lastName profilePhotoId');
                commenterNamesMap = commenterUsers.reduce((acc: Record<string, string>, u: any) => {
                    acc[u.userId] = `${u.firstName} ${u.lastName}`.trim();
                    return acc;
                }, {});

                const commenterPhotoIds = commenterUsers.map((u: any) => u.profilePhotoId).filter(Boolean);
                let commenterPhotoMap: Record<string, string> = {};
                if (commenterPhotoIds.length > 0) {
                    const commenterPhotos = await ProfilePhoto.find({ photoId: { $in: commenterPhotoIds } })
                        .lean()
                        .select('photoId cloudinarySecureUrl');
                    commenterPhotoMap = commenterPhotos.reduce((acc: Record<string, string>, p: any) => {
                        acc[p.photoId] = p.cloudinarySecureUrl;
                        return acc;
                    }, {});
                }
                commenterAvatarsMap = commenterUsers.reduce((acc: Record<string, string | null>, u: any) => {
                    acc[u.userId] = u.profilePhotoId ? (commenterPhotoMap[u.profilePhotoId] || null) : null;
                    return acc;
                }, {});
            }

            // ✅ NEW: is user ke against candidate authors ka ignore-count fetch karo,
            // score penalty ke liye
            const authorIdsForIgnoreCheck = [...new Set(authorIds)];
            const ignoreSignalsMap = await this.getIgnoreSignalsForAuthors(
                currentUserId,
                authorIdsForIgnoreCheck
            );

            allPosts = allPosts.map((post) => {
                const knownLikerIds = likedByConnectionsMap[post.entryId] || [];
                const likedByConnections = knownLikerIds
                    .slice(0, 3)
                    .map((id) => likerNamesMap[id])
                    .filter(Boolean);
                const likedByConnectionsAvatars = knownLikerIds
                    .slice(0, 3)
                    .map((id) => likerAvatarsMap[id] || null);

                const knownCommenterIds = commentedByConnectionsMap[post.entryId] || [];
                const commentedByConnections = knownCommenterIds
                    .slice(0, 3)
                    .map((id) => commenterNamesMap[id])
                    .filter(Boolean);
                const commentedByConnectionsAvatars = knownCommenterIds
                    .slice(0, 3)
                    .map((id) => commenterAvatarsMap[id] || null);
                const commentedByConnectionsFull = knownCommenterIds
                    .map((id) => ({
                        userId: id,
                        name: commenterNamesMap[id],
                        avatar: commenterAvatarsMap[id] || null,
                    }))
                    .filter((x) => x.name);
                const likedByConnectionsFull = knownLikerIds
                    .map((id) => ({
                        userId: id,
                        name: likerNamesMap[id],
                        avatar: likerAvatarsMap[id] || null,
                    }))
                    .filter((x) => x.name);

                const connectionSubjectUserId =
                    post.feedItemType === 'repost' ? post.originalPost.userId : post.userId;

                const degree =
                    connectionSubjectUserId === currentUserId
                        ? null
                        : connectionDegreeMap[connectionSubjectUserId] ?? null;

                const connectionStatus =
                    connectionSubjectUserId === currentUserId
                        ? 'self'
                        : connectionStatusMap[connectionSubjectUserId] || 'none';

                // is post ke against interest match nikaalo, score mein pass karo
                const matchedInterests = this.getMatchedInterests(post, interestKeywords);

                // original post ka analytics.avgDwellTime nikaalo (repost ke case
                // mein original post ka dwell time use hota hai, reposter ka nahi)
                const dwellSource = post.feedItemType === 'repost' ? post.originalPost : post;
                const avgDwellTime = dwellSource?.analytics?.avgDwellTime || 0;

                // ✅ NEW: is post ke actual author (original author, reposter nahi) ka
                // ignore-count nikaalo — connectionSubjectUserId already yahi represent karta hai
                const ignoreCount = connectionSubjectUserId
                    ? (ignoreSignalsMap[connectionSubjectUserId] || 0)
                    : 0;

                return {
                    ...post,
                    connectionStatus,
                    connectionDegree: degree,
                    matchedInterests, // debugging/UI ke liye bhi expose kar diya (e.g. "matches your skill: React")
                    feedScore: this.calculateFeedScore(
                        post,
                        degree,
                        knownLikerIds.length,
                        knownCommenterIds.length,
                        matchedInterests.length,
                        avgDwellTime,
                        ignoreCount // ✅ NEW
                    ),
                    likedByConnections,
                    likedByConnectionsAvatars,
                    likedByConnectionsCount: knownLikerIds.length,
                    commentedByConnections,
                    commentedByConnectionsAvatars,
                    commentedByConnectionsCount: knownCommenterIds.length,
                    commentedByConnectionsFull,
                    likedByConnectionsFull,
                    ...(post.feedItemType === 'repost' && {
                        originalPost: {
                            ...post.originalPost,
                            connectionStatus,
                            connectionDegree: degree,
                        },
                    }),
                };
            });

            allPosts.sort((a, b) => b.feedScore - a.feedScore);

            const total = allPosts.length;
            const startIndex = (page - 1) * limit;
            const paginatedPosts = allPosts.slice(startIndex, startIndex + limit);

            const result = {
                posts: paginatedPosts,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    hasNextPage: startIndex + limit < total,
                    hasPrevPage: page > 1,
                },
            };

            await redisService.set(cacheKey, JSON.stringify(result), { ttl: 180 });

            LoggerUtil.info('Home feed posts fetched (DB, cached)', {
                currentUserId,
                total,
                page,
                candidateAuthorCount: candidateAuthorIds.length,
                interestKeywordCount: interestKeywords.length,
                correlationId,
            });

            return result;

        } catch (error: any) {
            LoggerUtil.error('Get home feed posts failed', {
                error: error.message,
                currentUserId,
                correlationId,
            });
            throw error;
        }
    }

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
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            uploadStream.end(buffer);
        });
    }

    private static calculatePostTimeScore(hour: number): number {
        const peakHours = [9, 10, 11, 13, 14, 15, 18, 19, 20];
        if (peakHours.includes(hour)) return 100;
        if (hour >= 8 && hour <= 21) return 70;
        return 30;
    }
}

export default HomePostService;