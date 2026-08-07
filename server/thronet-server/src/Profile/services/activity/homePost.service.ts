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

    // ==================== ✅ NEW: CANDIDATE GENERATION CONFIG ====================
    // LinkedIn ke "10,000 posts -> 500 candidates" step ka equivalent.
    // Poore Post collection ko scan karne ke bajaye, pehle relevant author IDs
    // nikalte hain (network + discovery), phir sirf unhi ke posts fetch karte hain.
    private static readonly MAX_CANDIDATE_AUTHORS = 300;
    private static readonly MAX_CANDIDATE_POSTS = 500;
    private static readonly DISCOVERY_SLOT_RATIO = 0.15; // 15% discovery, 85% network
    private static readonly DISCOVERY_WINDOW_DAYS = 3;

    // ==================== ✅ NEW: INTEREST / TOPIC MATCHING CONFIG ====================
    // LinkedIn doc point #3 (interest ka role) aur #5 (topic extraction) ka
    // simplified version. Post.contentClassification.topics field schema mein
    // hai lekin kahin populate nahi hoti — jab NLP classification worker
    // banega, wahi source of truth banega. Abhi ke liye user.skills ko
    // interest-proxy ki tarah use kar rahe hain.
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

            return {
                success: true,
                entryId: savedEntry.entryId,
                title: savedEntry.title,
                content: savedEntry.content,
                mood: savedEntry.mood,
                isPublic: savedEntry.isPublic,
                postUrl: savedEntry.postUrl,
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

    // ==================== ✅ NEW: CANDIDATE AUTHOR POOL ====================
    // ⚠️ VERIFY: field names 'fromUserId'/'toUserId' (Connection) aur
    // 'followerId'/'followingId' (Follow) — apni actual model files se
    // confirm karo, maine getConnectionData() ke existing usage se copy kiya hai.
    private static async getCandidateAuthorIds(
        currentUserId: string
    ): Promise<{ networkAuthorIds: string[]; discoveryAuthorIds: string[] }> {
        const { Connection, Follow } = await import('@/connections/models');

        // 1st degree — direct active connections
        const directConnections = await Connection.find({
            status: 'active',
            $or: [{ fromUserId: currentUserId }, { toUserId: currentUserId }],
        }).lean().select('fromUserId toUserId');

        const firstDegreeIds = new Set<string>();
        directConnections.forEach((c: any) => {
            firstDegreeIds.add(c.fromUserId === currentUserId ? c.toUserId : c.fromUserId);
        });

        // Followed people/companies (asymmetric — follow ke liye mutual connection zaroori nahi)
        // ⚠️ VERIFY: Follow model mein field 'followerId' hai ya kuch aur (e.g. 'userId')
        const follows = await Follow.find({ followerId: currentUserId })
            .lean()
            .select('followingId')
            .limit(200);
        follows.forEach((f: any) => firstDegreeIds.add(f.followingId));

        // 2nd degree — 1st degree logon ke connections, capped taaki explosion na ho
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

        // Discovery slice — network ke bahar ke high-engagement authors,
        // taaki feed filter-bubble na bane (LinkedIn "Recommended posts" jaisa)
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

    // ==================== ✅ NEW: USER INTEREST KEYWORDS ====================
    // User ki Skill.skillName list ko interest signal ki tarah use karte hain.
    // Skill collection already Profile feature mein maintain hoti hai —
    // koi naya data model nahi banaya.
    private static async getUserInterestKeywords(userId: string): Promise<string[]> {
        const { default: Skill } = await import('@/Profile/models/Skill.model');
        const skills = await Skill.find({ userId, isDeleted: false, isArchived: false })
            .lean()
            .select('skillName');
        return skills
            .map((s: any) => (s.skillName || '').trim().toLowerCase())
            .filter((s: string) => s.length > 0);
    }

    // Post ke title+content mein user ki kitni skills match hoti hain —
    // substring match with word-boundary check (case-insensitive). Multi-word
    // skills bhi handle hoti hain ("Node.js", "Machine Learning") kyunki
    // tokenize nahi kar rahe, seedha substring check kar rahe hain.
    private static getMatchedInterests(post: any, interestKeywords: string[]): string[] {
        if (interestKeywords.length === 0) return [];

        const textSource = post.feedItemType === 'repost' ? post.originalPost : post;
        const text = `${textSource?.title || ''} ${textSource?.content || ''}`.toLowerCase();
        if (!text.trim()) return [];

        const matched: string[] = [];
        for (const keyword of interestKeywords) {
            if (matched.length >= this.MAX_INTEREST_MATCHES) break;
            // word-boundary check taaki "java" "javascript" ke andar match na ho
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

    private static calculateFeedScore(
        post: any,
        connectionDegree: 1 | 2 | 3 | null,
        knownLikersCount: number = 0,
        knownCommentersCount: number = 0
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

        if (ageInHours < 1) score += 25;

        return score;
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

            // ✅ CHANGED: poore collection ke bajaye sirf candidate authors ke posts.
            // Pehle: const allUserDocs = await Post.find({}).lean();
            const { networkAuthorIds, discoveryAuthorIds } =
                await this.getCandidateAuthorIds(currentUserId);

            const candidateAuthorIds = [
                ...new Set([currentUserId, ...networkAuthorIds, ...discoveryAuthorIds]),
            ];

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
                        p.isPublic !== false
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

            // ✅ NEW: agar candidate posts limit se zyada ho jayein, scoring se
            // pehle hi recency-based cap laga do (LinkedIn ka "500 candidates" cap)
            if (allPosts.length > this.MAX_CANDIDATE_POSTS) {
                allPosts = allPosts
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, this.MAX_CANDIDATE_POSTS);
            }

            const { default: Repost } = await import('@/Profile/models/Repost.model');
            // ✅ CHANGED: reposts bhi sirf candidate authors ke liye fetch karo
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

                    // ✅ NOTE: reposter (repost.repostedBy) ka authorId bhi
                    // push kar rahe hain kyunki "X reposted this" header ke
                    // liye reposter ka connection-degree kabhi kaam aa sakta
                    // hai future features mein. Connect button ke liye ye
                    // use nahi hoga — us ke liye originalDoc.userId use hoga.
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
                            isLikedByCurrentUser: (originalEntry.likedBy || []).includes(currentUserId),
                            createdAt: originalEntry.createdAt,
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

                // LinkedIn jaisa hi asli logic — connect button/degree hamesha
                // ORIGINAL POST AUTHOR ke against decide hote hain, reposter ke nahi.
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

                return {
                    ...post,
                    connectionStatus,
                    connectionDegree: degree,
                    feedScore: this.calculateFeedScore(
                        post,
                        degree,
                        knownLikerIds.length,
                        knownCommenterIds.length
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