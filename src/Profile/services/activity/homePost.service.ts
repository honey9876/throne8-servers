/**
 * HomePost Service
 * Handles mood-based, public/private posts from home feed
 */

import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import sharp from 'sharp';
import Constants from '@/shared/constants.util';
import { Post, User, ProfilePhoto, Headline, Connection } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import RepostService from './repost.service';

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

    // ✅ Get home feed posts (all users, public only)
    static async getHomeFeedPosts(
        currentUserId: string,
        page: number = 1,
        limit: number = 20
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching home feed posts', { currentUserId, page, limit, correlationId });

            // 1. Fetch all posts documents
            const allUserDocs = await Post.find({}).lean();

            // 2. Extract unique userIds form the post documents
            const userIds = [...new Set(allUserDocs.map((doc: any) => doc.userId))];

            // 3. Fetch user details for all those userIds
            const users = await User.find({ userId: { $in: userIds } })
                .select('userId username firstName lastName profilePhotoId headlineId')
                .lean();

            // Fetch Profile Photos and Headlines for the users
            const profilePhotos = await ProfilePhoto.find({ userId: { $in: userIds }, isActive: true }).lean();
            const headlineIds = users.map((u: any) => u.headlineId).filter(Boolean);
            const headlines = await Headline.find({ headlineId: { $in: headlineIds }, 'flags.isDeleted': false }).lean();

            const photoMap = profilePhotos.reduce((acc: any, photo: any) => {
                acc[photo.userId] = photo.cloudinarySecureUrl;
                return acc;
            }, {});

            const headlineMap = headlines.reduce((acc: any, hl: any) => {
                acc[hl.headlineId] = hl.title || hl.message || hl.headline;
                return acc;
            }, {});

            // 5. Fetch Connections for the current user and the post authors
            let connectionMap: Record<string, string> = {};
            if (Connection) {
                const connections = await Connection.find({
                    $or: [
                        { fromUserId: currentUserId, toUserId: { $in: userIds } },
                        { fromUserId: { $in: userIds }, toUserId: currentUserId }
                    ]
                }).lean();

                connectionMap = connections.reduce((acc: any, conn: any) => {
                    const otherUserId = conn.fromUserId === currentUserId ? conn.toUserId : conn.fromUserId;
                    acc[otherUserId] = conn.status;
                    return acc;
                }, {});
            }

            // 6. Create a fast lookup map for the users
            const userMap = users.reduce((acc: any, user: any) => {
                acc[user.userId] = {
                    ...user,
                    profileImage: photoMap[user.userId],
                    headline: headlineMap[user.headlineId],
                    connectionStatus: connectionMap[user.userId] || 'none'
                };
                return acc;
            }, {});

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

            allUserDocs.forEach((doc: any) => {
                const author = userMap[doc.userId] || {};

                const entries = (doc.posts || [])
                    .filter((p: any) =>
                        !p.isDeleted &&
                        !p.isArchived &&
                        !p.isScheduled &&        // scheduled posts skip
                        p.isPublic !== false     // sirf public posts
                    )
                    .map((p: any) => cleanPost({
                        ...p,
                        userId: doc.userId,
                        documentPostId: doc.postId,
                        isLikedByCurrentUser: (p.likedBy || []).includes(currentUserId),
                        authorName: author.firstName ? `${author.firstName} ${author.lastName || ''}`.trim() : (author.username || 'Throne8 User'),
                        authorAvatar: author.profileImage || '',
                        authorHeadline: author.headline || '',
                        authorConnectionStatus: author.connectionStatus || 'none'
                    }));
                allPosts.push(...entries);
            });

            // ── NEW CODE: Merging Reposts ──
            const repostsResult = await RepostService.getFeedReposts(currentUserId, limit, (page - 1) * limit);
            const feedReposts = repostsResult.reposts || [];
            // Build a set of entryIds the current user has reposted so we can tag them in the feed
            const myRepostsResult = await RepostService.getUserReposts(currentUserId);
            const myRepostedEntryIds = new Set(
                (myRepostsResult.reposts || [])
                    .filter((r: any) => r.repostedBy === currentUserId)
                    .map((r: any) => r.originalPost?.entryId)
                    .filter(Boolean)
            );

            // Tag regular posts with whether the current user has already reposted them
            allPosts = allPosts.map((p: any) => ({
                ...p,
                currentUserHasReposted: myRepostedEntryIds.has(p.entryId),
            }));

            // Combine both
            const rawCombinedFeed = [...allPosts, ...feedReposts];

            // ── Deduplication and Aggregation ──
            const aggregatedMap = new Map<string, any>();
            let combinedFeed: any[] = [];

            for (const item of rawCombinedFeed) {
                // If it's a quote repost (has thoughtText), don't aggregate it
                if (item.feedItemType === 'repost' && item.thoughtText) {
                    combinedFeed.push(item);
                    continue;
                }

                const targetEntryId = item.feedItemType === 'repost' ? item.originalPost?.entryId : item.entryId;
                if (!targetEntryId) {
                    combinedFeed.push(item);
                    continue;
                }

                if (aggregatedMap.has(targetEntryId)) {
                    const existing = aggregatedMap.get(targetEntryId);
                    
                    if (item.feedItemType === 'repost') {
                        if (!existing.reposters) existing.reposters = [];
                        if (existing.feedItemType === 'repost' && existing.repostedBy) {
                            if (!existing.reposters.some((r: any) => r.id === existing.repostedBy)) {
                                existing.reposters.push({ id: existing.repostedBy, name: existing.repostedByName, createdAt: existing.createdAt });
                            }
                        }
                        if (!existing.reposters.some((r: any) => r.id === item.repostedBy)) {
                            existing.reposters.push({ id: item.repostedBy, name: item.repostedByName, createdAt: item.createdAt });
                        }
                        // Update createdAt to the most recent repost
                        if (new Date(item.createdAt) > new Date(existing.createdAt)) {
                            existing.createdAt = item.createdAt;
                        }
                    } else {
                        // This is the original post coming in, we already have a repost of it.
                        // We should retain the existing repost structure but ensure the originalPost object is fresh.
                        if (existing.feedItemType === 'repost') {
                            existing.originalPost = { ...item, currentUserHasReposted: existing.originalPost?.currentUserHasReposted || item.currentUserHasReposted };
                        } else {
                            Object.assign(existing, item);
                        }
                    }
                } else {
                    if (item.feedItemType === 'repost') {
                        item.reposters = [{ id: item.repostedBy, name: item.repostedByName, createdAt: item.createdAt }];
                    } else {
                        item.reposters = [];
                    }
                    aggregatedMap.set(targetEntryId, item);
                    combinedFeed.push(item);
                }
            }

            // Post-process the aggregated posts to format the repost header
            for (const item of combinedFeed) {
                if (item.reposters && item.reposters.length > 0) {
                    item.feedItemType = 'repost';
                    if (!item.originalPost) {
                        const { reposters, feedItemType, currentUserHasReposted, ...originalData } = item;
                        item.originalPost = { ...originalData, currentUserHasReposted };
                    }
                    
                    const currentUserReposter = item.reposters.find((r: any) => r.id === currentUserId);
                    const otherReposters = item.reposters.filter((r: any) => r.id !== currentUserId);
                    
                    if (currentUserReposter && otherReposters.length === 0) {
                        item.repostedByName = "You";
                    } else if (currentUserReposter && otherReposters.length === 1) {
                        item.repostedByName = `You and ${otherReposters[0].name}`;
                    } else if (currentUserReposter && otherReposters.length > 1) {
                        item.repostedByName = `You, ${otherReposters[0].name} and ${otherReposters.length - 1} others`;
                    } else if (!currentUserReposter && otherReposters.length === 1) {
                        item.repostedByName = otherReposters[0].name;
                    } else if (!currentUserReposter && otherReposters.length === 2) {
                        item.repostedByName = `${otherReposters[0].name} and ${otherReposters[1].name}`;
                    } else if (!currentUserReposter && otherReposters.length > 2) {
                        item.repostedByName = `${otherReposters[0].name} and ${otherReposters.length - 1} others`;
                    }
                }
            }

            // Sort by latest
            combinedFeed.sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            // Pagination
            const total = combinedFeed.length;
            const startIndex = (page - 1) * limit;
            const paginatedPosts = combinedFeed.slice(startIndex, startIndex + limit);

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