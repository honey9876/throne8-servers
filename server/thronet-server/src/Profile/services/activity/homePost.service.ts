import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import sharp from 'sharp';
import Constants from '@/shared/constants.util';
import { Post, User, ProfilePhoto, Comment } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';

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

            // Step 1: Validate user
            const user = await User.findOne({ userId });
            if (!user) throw new Error('User not found');
            if (user.status !== 'active') throw new Error('User account is not active');

            // Step 2: Validate media counts
            if (images.length > Constants.ACTIVITY_VALIDATION.POST.MAX_IMAGES_PER_POST)
                throw new Error(`Maximum ${Constants.ACTIVITY_VALIDATION.POST.MAX_IMAGES_PER_POST} images allowed`);
            if (videos.length > Constants.ACTIVITY_VALIDATION.POST.MAX_VIDEOS_PER_POST)
                throw new Error(`Maximum ${Constants.ACTIVITY_VALIDATION.POST.MAX_VIDEOS_PER_POST} videos allowed`);
            if (documents.length > Constants.ACTIVITY_VALIDATION.POST.MAX_DOCUMENTS_PER_POST)
                throw new Error(`Maximum ${Constants.ACTIVITY_VALIDATION.POST.MAX_DOCUMENTS_PER_POST} documents allowed`);

            // Step 3: Process poll
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

            // Step 4: Process scheduled post
            let scheduledSetup = null;
            if (postData.scheduledFor) {
                const scheduledTime = new Date(postData.scheduledFor);
                const minFutureTime = new Date(Date.now() + 5 * 60 * 1000);
                if (scheduledTime < minFutureTime)
                    throw new Error('Scheduled time must be at least 5 minutes in the future');
                scheduledSetup = { scheduledFor: scheduledTime, isScheduled: true };
            }

            // Step 5: Process event
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

            // Step 6: Upload images
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

            // Step 7: Upload videos
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

            // Step 8: Upload documents
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

            // Step 9: Build entry
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

            // Step 10: Upsert document
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

            // Step 11: Update user stats
            await User.findOneAndUpdate(
                { userId },
                {
                    $push: { 'activityIds.postIds': entryId },
                    $inc: { 'activityStats.totalPosts': 1 },
                },
                { new: true }
            );

            const savedEntry = userPostDoc.posts[userPostDoc.posts.length - 1];

            // Scheduled response
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

    // ✅ Connection status batch fetch — current user vs sab post-authors
    private static async getConnectionStatusMap(
        currentUserId: string,
        authorIds: string[]
    ): Promise<Record<string, string>> {
        const { Connection, ConnectionRequest } = await import('@/connections/models');

        const uniqueAuthorIds = [...new Set(authorIds)].filter((id) => id !== currentUserId);
        const statusMap: Record<string, string> = {};

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


    // ✅ Connection DEGREE batch fetch — 1st/2nd/3rd, BFS over the connection graph
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

    // ✅ Current user ke saare active connections ki userId list (Set for fast lookup)
    private static async getUserConnectionIds(currentUserId: string): Promise<Set<string>> {
        const { Connection } = await import('@/connections/models');

        const connections = await Connection.find({
            $or: [{ fromUserId: currentUserId }, { toUserId: currentUserId }],
            status: 'active',
        }).lean().select('fromUserId toUserId');

        const connectionIds = new Set<string>();
        connections.forEach((c: any) => {
            const otherId = c.fromUserId === currentUserId ? c.toUserId : c.fromUserId;
            connectionIds.add(otherId);
        });

        return connectionIds;
    }

    // ✅ FIX: LinkedIn-style feed score — engagement / age-decay + connection-degree boost
    // + "your connections engaged with this" boost + fresh-post discovery boost.
    //
    // knownLikersCount / knownCommentersCount = how many of YOUR connections
    // liked/commented on this post — regardless of who the AUTHOR is. This is
    // what makes a stranger's post rise in your feed when your own connections
    // are the ones engaging with it (the "mutual connection liked this" signal).
    private static calculateFeedScore(
        post: any,
        connectionDegree: 1 | 2 | 3 | null,
        knownLikersCount: number = 0,
        knownCommentersCount: number = 0
    ): number {
        const ageInHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);

        const likes = post.likesCount || 0;
        const comments = post.commentsCount || 0;
        const pollVotes = post.pollData?.totalVotes || 0;

        const engagementScore = likes * 3 + comments * 5 + pollVotes * 2;
        const decay = Math.pow(ageInHours + 2, 1.5);

        let score = engagementScore / decay;

        // Author ka aapse connection degree — 1st degree ko sabse zyada priority
        if (connectionDegree === 1) score += 40;
        else if (connectionDegree === 2) score += 15;
        else if (connectionDegree === 3) score += 5;

        // ✅ NEW: "Your connections engaged with this" — chahe author khud
        // connection na ho, agar tumhare mutual connections ne like/comment
        // kiya hai to strong social proof signal hai (LinkedIn jaisa)
        score += knownLikersCount * 8;
        score += knownCommentersCount * 12;

        // Naye posts (< 1 hour) ko discovery boost
        if (ageInHours < 1) score += 50;

        return score;
    }

    // ✅ Get home feed posts (all users, public only) — ab connectionStatus ke saath
    static async getHomeFeedPosts(
        currentUserId: string,
        page: number = 1,
        limit: number = 20
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching home feed posts', { currentUserId, page, limit, correlationId });

            const allUserDocs = await Post.find({}).lean();

            let allPosts: any[] = [];
            const authorIds: string[] = [];

            allUserDocs.forEach((doc: any) => {
                const entries = (doc.posts || [])
                    .filter((p: any) =>
                        !p.isDeleted &&
                        !p.isArchived &&
                        !p.isScheduled &&        // scheduled posts skip
                        p.isPublic !== false     // sirf public posts
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

            // ✅ Connection status batch fetch — sabhi authors ke liye ek saath
            const connectionStatusMap = await this.getConnectionStatusMap(currentUserId, authorIds);


            const connectionDegreeMap = await this.getConnectionDegreeMap(currentUserId, authorIds);

            // ✅ "Liked by connections you know" — current user ke connections ki list ek baar nikaalo
            const connectionIdsSet = await this.getUserConnectionIds(currentUserId);

            // Har post ke likedBy array ko connections ke saath match karo
            const likedByConnectionsMap: Record<string, string[]> = {};
            const allKnownLikerIds = new Set<string>();

            allPosts.forEach((post) => {
                const likedBy: string[] = post.likedBy || [];
                const knownLikers = likedBy.filter((id) => connectionIdsSet.has(id));
                likedByConnectionsMap[post.entryId] = knownLikers;
                knownLikers.forEach((id) => allKnownLikerIds.add(id));
            });

            // Un logon ke naam aur photo ek hi batch mein fetch karo
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

            // Commented by connections you know
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
                // ✅ Poori list — "..." click pe dikhane ke liye
                const likedByConnectionsFull = knownLikerIds
                    .map((id) => ({
                        userId: id,
                        name: likerNamesMap[id],
                        avatar: likerAvatarsMap[id] || null,
                    }))
                    .filter((x) => x.name);

                // connectionDegree ek hi jagah nikaal ke reuse karo
                const degree =
                    post.userId === currentUserId ? null : connectionDegreeMap[post.userId] ?? null;

                return {
                    ...post,
                    connectionStatus:
                        post.userId === currentUserId ? 'self' : connectionStatusMap[post.userId] || 'none',
                    connectionDegree: degree,
                    // ✅ FIX: feed ranking score — LinkedIn-style ranking, now includes
                    // "your connections liked/commented" as its own boost, separate from
                    // whether the AUTHOR themselves is your connection.
                    feedScore: this.calculateFeedScore(
                        post,
                        degree,
                        knownLikerIds.length,
                        knownCommenterIds.length
                    ),
                    likedByConnections,                          // e.g. ['Bhoomi jain', 'Yashasvi S. Rajput']
                    likedByConnectionsAvatars,                   // parallel array of photo URLs (ya null)
                    likedByConnectionsCount: knownLikerIds.length, // total connections who liked

                    commentedByConnections,
                    commentedByConnectionsAvatars,
                    commentedByConnectionsCount: knownCommenterIds.length,
                    commentedByConnectionsFull,
                    likedByConnectionsFull,                      // poori list — [{userId, name, avatar}]
                };
            });

            // ✅ Sort by feedScore (LinkedIn-style ranking) instead of pure createdAt.
            allPosts.sort((a, b) => b.feedScore - a.feedScore);

            // Pagination
            const total = allPosts.length;
            const startIndex = (page - 1) * limit;
            const paginatedPosts = allPosts.slice(startIndex, startIndex + limit);

            LoggerUtil.info('Home feed posts fetched', {
                currentUserId,
                total,
                page,
                correlationId,
            });

            return {
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

        } catch (error: any) {
            LoggerUtil.error('Get home feed posts failed', {
                error: error.message,
                currentUserId,
                correlationId,
            });
            throw error;
        }
    }

    // ✅ Private helper
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