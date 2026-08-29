/**
 * Post Model - Activity System
 * @module models/Post.model
 * @version 1.2.0 (added repostsCount/sendsCount + incrementSendsCount static)
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IMediaItem {
    mediaId: string;
    type: 'image' | 'video' | 'document';
    cloudinaryPublicId: string;
    cloudinaryUrl: string;
    cloudinarySecureUrl: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    width?: number;
    height?: number;
    duration?: number;
    format: string;
    uploadedAt: Date;
}

// ✅ ADDED: multi-reaction system types
export type ReactionType = 'like' | 'celebrate' | 'support' | 'love' | 'insightful' | 'funny';

export interface IReaction {
    userId: string;
    type: ReactionType;
    reactedAt: Date;
}

export interface IPostEntry {
    entryId: string;
    title: string;
    content?: string;
    postUrl: string;
    images: IMediaItem[];
    videos: IMediaItem[];
    documents: IMediaItem[];
    likesCount: number;
    commentsCount: number;
    repostsCount: number;   // ✅ ADDED
    sendsCount: number;     // ✅ ADDED
    likedBy: string[];
    savedBy: string[];   // ✅ NEW — per-user save tracking (isSaved boolean ki jagah)
    // ✅ ADDED: reactions live alongside likedBy/likesCount (kept in sync
    // for 'like' type so existing like button / likesCount stays working)
    reactions: IReaction[];
    reactionCounts: {
        like: number;
        celebrate: number;
        support: number;
        love: number;
        insightful: number;
        funny: number;
    };
    isPinned: boolean;
    isArchived: boolean;
    isDeleted: boolean;
    pinnedAt?: Date;
    archivedAt?: Date;
    deletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    analytics: {
        avgDwellTime: number;
        textExpansionRate: number;
        engagementVelocity: number;
        viewCount: number;
        uniqueViewers: string[];
        expandedTextViewers: string[];
    };
    hasPoll: boolean;
    pollData?: {
        question: string;
        options: Array<{
            optionId: string;
            text: string;
            votes: number;
            votedBy: string[];
        }>;
        duration: 1 | 3 | 7 | 14;
        endsAt: Date;
        totalVotes: number;
        isActive: boolean;
    };
    scheduledFor?: Date;
    isScheduled: boolean;
    publishedAt?: Date;
    eventData?: {
        coverImageId?: string;
        eventType: 'online' | 'in-person' | 'hybrid';
        eventFormat: 'conference' | 'webinar' | 'workshop' | 'meetup' | 'seminar' | 'other';
        eventName: string;
        timezone: string;
        startDate: Date;
        startTime: string;
        endDate?: Date;
        endTime?: string;
        description: string;
        location?: {
            venue?: string;
            address?: string;
            city?: string;
            country?: string;
            coordinates?: { lat: number; lng: number };
        };
        registrationLink?: string;
        maxAttendees?: number;
        currentAttendees: number;
        isOnline: boolean;
    };
    isFreshContent: boolean;
    contentClassification?: IContentClassification;
    mood?: 'happy' | 'thoughtful' | 'excited' | 'reflective' | 'grateful';
    isPublic: boolean;
    postTimeScore: number;
    userActiveHourMatch: boolean;
    performanceHistory?: IPerformanceHistory;
    qualityMetrics?: IQualityMetrics;
    hasExternalLinkPenalty: boolean;
    linkPreviewQuality?: number;
    isShadowbanned: boolean;
    shadowbanReason?: string;
}

export interface IPost extends Document {
    postId: string;
    userId: string;
    creatorModeEnabled: boolean;
    totalPosts: number;
    posts: IPostEntry[];
    createdAt: Date;
    updatedAt: Date;
}

interface IContentClassification {
    primaryType: 'knowledge' | 'personal-story' | 'hiring' | 'promotion' | 'announcement' | 'poll' | 'other';
    confidence: number;
    keywords: string[];
    topics: string[];
}

interface IQualityMetrics {
    spamScore: number;
    hashtagCount: number;
    emojiCount: number;
    linkCount: number;
    repetitiveKeywordScore: number;
    overallQuality: number;
}

interface IPerformanceHistory {
    last5PostsAvgEngagement: number;
    last10PostsAvgEngagement: number;
    recentTrend: 'improving' | 'declining' | 'stable';
}

export interface IPostModel extends Model<IPost> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<IPost | null>;
    getUserPostCount(userId: string): Promise<number>;
    setPinned(entryId: string, userId: string, isPinned: boolean): Promise<IPostEntry>;
    setSaved(entryId: string, userId: string, isSaved: boolean): Promise<IPostEntry>;
    getSavedPostsByUser(userId: string): Promise<any[]>;   // ✅ NEW
    incrementLikes(entryId: string, userId: string): Promise<IPostEntry>;
    decrementLikes(entryId: string, userId: string): Promise<IPostEntry>;
    incrementComments(entryId: string): Promise<IPostEntry>;
    decrementComments(entryId: string): Promise<IPostEntry>;
    incrementSendsCount(entryId: string, count: number): Promise<IPostEntry>;   // ✅ ADDED
    // ✅ ADDED: reaction statics
    addReaction(entryId: string, userId: string, type: ReactionType): Promise<IPostEntry>;
    removeReaction(entryId: string, userId: string): Promise<IPostEntry>;
}

const MediaItemSchema = new Schema<IMediaItem>(
    {
        mediaId: { type: String, required: true, default: () => uuidv4() },
        type: { type: String, enum: ['image', 'video', 'document'], required: true },
        cloudinaryPublicId: { type: String, required: true },
        cloudinaryUrl: { type: String, required: true },
        cloudinarySecureUrl: { type: String, required: true },
        originalName: { type: String, required: true },
        mimeType: { type: String, required: true },
        fileSize: { type: Number, required: true },
        width: Number,
        height: Number,
        duration: Number,
        format: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const PostEntrySchema = new Schema<IPostEntry>(
    {
        entryId: { type: String, required: true, default: () => uuidv4() },
        title: {
            type: String,
            required: true,
            minlength: 1,
            maxlength: 300,
            trim: true,
        },
        content: { type: String, maxlength: 10000, trim: true },
        mood: {
            type: String,
            enum: ['happy', 'thoughtful', 'excited', 'reflective', 'grateful'],
            default: null,
        },
        isPublic: { type: Boolean, default: true },
        postUrl: { type: String, required: true },
        images: { type: [MediaItemSchema], default: undefined },
        videos: { type: [MediaItemSchema], default: undefined },
        documents: { type: [MediaItemSchema], default: undefined },
        likesCount: { type: Number, default: 0, min: 0 },
        commentsCount: { type: Number, default: 0, min: 0 },
        repostsCount: { type: Number, default: 0, min: 0 },   // ✅ ADDED
        sendsCount: { type: Number, default: 0, min: 0 },     // ✅ ADDED
        likedBy: [{ type: String }],
        savedBy: [{ type: String }],   // ✅ NEW
        // ✅ ADDED: Reactions system (parallel to likedBy — kept in sync for
        // 'like' type only, so the existing single-like button and
        // likesCount keep working exactly as before)
        reactions: {
            type: [
                {
                    userId: { type: String, required: true },
                    type: {
                        type: String,
                        enum: ['like', 'celebrate', 'support', 'love', 'insightful', 'funny'],
                        required: true,
                    },
                    reactedAt: { type: Date, default: Date.now },
                },
            ],
            default: [],
        },
        reactionCounts: {
            like: { type: Number, default: 0 },
            celebrate: { type: Number, default: 0 },
            support: { type: Number, default: 0 },
            love: { type: Number, default: 0 },
            insightful: { type: Number, default: 0 },
            funny: { type: Number, default: 0 },
        },
        isPinned: { type: Boolean, default: false },
        isArchived: { type: Boolean, default: false },
        isDeleted: { type: Boolean, default: false },
        pinnedAt: Date,
        archivedAt: Date,
        deletedAt: Date,
        analytics: {
            avgDwellTime: { type: Number, default: 0 },
            textExpansionRate: { type: Number, default: 0 },
            engagementVelocity: { type: Number, default: 0 },
            viewCount: { type: Number, default: 0 },
            uniqueViewers: [{ type: String }],
            expandedTextViewers: [{ type: String }],
        },
        hasPoll: { type: Boolean, default: false },
        pollData: {
            question: { type: String, maxlength: 140, trim: true },
            options: [
                {
                    optionId: { type: String, default: () => uuidv4() },
                    text: { type: String, required: true, maxlength: 100 },
                    votes: { type: Number, default: 0 },
                    votedBy: [{ type: String }],
                },
            ],
            duration: { type: Number, enum: [1, 3, 7, 14], default: 7 },
            endsAt: Date,
            totalVotes: { type: Number, default: 0 },
            isActive: { type: Boolean, default: true },
        },
        scheduledFor: Date,
        isScheduled: { type: Boolean, default: false },
        publishedAt: Date,
        eventData: {
            coverImageId: String,
            eventType: { type: String, enum: ['online', 'in-person', 'hybrid'] },
            eventFormat: {
                type: String,
                enum: ['conference', 'webinar', 'workshop', 'meetup', 'seminar', 'other'],
            },
            eventName: { type: String, maxlength: 75, trim: true },
            timezone: { type: String, default: 'UTC' },
            startDate: Date,
            startTime: String,
            endDate: Date,
            endTime: String,
            description: { type: String, maxlength: 5000, trim: true },
            location: {
                venue: String,
                address: String,
                city: String,
                country: String,
                coordinates: { lat: Number, lng: Number },
            },
            registrationLink: String,
            maxAttendees: Number,
            currentAttendees: { type: Number, default: 0 },
            isOnline: Boolean,
        },
        isFreshContent: { type: Boolean, default: true },
        contentClassification: {
            primaryType: {
                type: String,
                enum: ['knowledge', 'personal-story', 'hiring', 'promotion', 'announcement', 'poll', 'other'],
                default: 'other',
            },
            confidence: { type: Number, default: 0 },
            keywords: [String],
            topics: [String],
        },
        postTimeScore: { type: Number, default: 0, min: 0, max: 100 },
        userActiveHourMatch: { type: Boolean, default: false },
        performanceHistory: {
            last5PostsAvgEngagement: { type: Number, default: 0 },
            last10PostsAvgEngagement: { type: Number, default: 0 },
            recentTrend: {
                type: String,
                enum: ['improving', 'declining', 'stable'],
                default: 'stable',
            },
        },
        qualityMetrics: {
            spamScore: { type: Number, default: 0 },
            hashtagCount: { type: Number, default: 0 },
            emojiCount: { type: Number, default: 0 },
            linkCount: { type: Number, default: 0 },
            repetitiveKeywordScore: { type: Number, default: 0 },
            overallQuality: { type: Number, default: 100 },
        },
        hasExternalLinkPenalty: { type: Boolean, default: false },
        linkPreviewQuality: { type: Number, default: 0, min: 0, max: 100 },
        isShadowbanned: { type: Boolean, default: false },
        shadowbanReason: String,
    },
    {
        timestamps: true,
        _id: false,
    }
);

const PostSchema = new Schema<IPost, IPostModel>(
    {
        postId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            // FIX:  hataya - unique:true apne aap index banata hai
        },
        userId: {
            type: String,
            required: true,
            unique: true,
            // FIX:  hataya - unique:true apne aap index banata hai
            // Logs mein profileUrl warning thi - userId bhi same pattern tha
        },
        creatorModeEnabled: { type: Boolean, default: false },
        totalPosts: { type: Number, default: 0 },
        posts: [PostEntrySchema],
    },
    {
        timestamps: true,
        collection: 'posts',
        versionKey: false,
    }
);

// ==================== INDEXES ====================
// FIX: postId aur userId se  hataya - unique:true already index banata hai
// Sirf yahan compound/specific indexes hain
PostSchema.index({ 'posts.entryId': 1 });
PostSchema.index({ 'posts.isDeleted': 1 });
PostSchema.index({ 'posts.isPinned': 1 });
PostSchema.index({ 'posts.isScheduled': 1, 'posts.scheduledFor': 1 });
PostSchema.index({ 'posts.pollData.endsAt': 1, 'posts.pollData.isActive': 1 });
PostSchema.index({ 'posts.eventData.startDate': 1 });
// ✅ ADDED: index to make "get all posts a user has reacted to" fast
PostSchema.index({ 'posts.reactions.userId': 1 });

// ==================== STATIC METHODS ====================

PostSchema.statics.findByUserId = async function (
    userId: string,
    _includeArchived: boolean = false
): Promise<IPost | null> {
    return this.findOne({ userId });
};

PostSchema.statics.getUserPostCount = async function (userId: string): Promise<number> {
    const doc = await this.findOne({ userId });
    if (!doc) return 0;
    return doc.posts.filter((p: IPostEntry) => !p.isDeleted && !p.isArchived).length;
};

PostSchema.statics.setPinned = async function (
    entryId: string,
    userId: string,
    isPinned: boolean
): Promise<IPostEntry> {
    // ✅ FIX: pehle sirf apne (userId) document me dhoondte the, isliye
    // doosre user ka post pin/save karte waqt "Post entry not found"
    // aata tha. Ab incrementLikes jaisa hi — saare documents me entryId
    // se dhoondte hain, chahe post kisi ka bhi ho.
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');
    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post entry not found');
    entry.isPinned = isPinned;
    entry.pinnedAt = isPinned ? new Date() : undefined;
    await doc.save();
    return entry;
};
PostSchema.statics.setSaved = async function (
    entryId: string,
    userId: string,
    isSaved: boolean
): Promise<IPostEntry> {
    // ✅ FIX: likedBy jaisa pattern — per-user tracking, taaki
    // "kis-kis user ne ye post save ki hai" pata chal sake, na ki
    // ek hi global flag jo sabke liye same dikhta ho.
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');
    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post entry not found');

    if (!entry.savedBy) entry.savedBy = [];
    const alreadySaved = entry.savedBy.includes(userId);

    if (isSaved && !alreadySaved) {
        entry.savedBy.push(userId);
    } else if (!isSaved && alreadySaved) {
        entry.savedBy = entry.savedBy.filter((id: string) => id !== userId);
    }

    await doc.save();
    return entry;
};

// ✅ NEW: kisi bhi user ke saare saved posts poore database se dhoondo
// (likedBy pattern jaisa hi — MongoDB query 'posts.savedBy': userId se)
PostSchema.statics.getSavedPostsByUser = async function (userId: string): Promise<any[]> {
    const docs = await this.find({ 'posts.savedBy': userId }).lean();

    const results: any[] = [];
    docs.forEach((doc: any) => {
        (doc.posts || []).forEach((entry: any) => {
            if (entry.isDeleted) return;
            if (!(entry.savedBy || []).includes(userId)) return;

            results.push({
                ...entry,
                userId: doc.userId,
                documentPostId: doc.postId,
                isLikedByCurrentUser: (entry.likedBy || []).includes(userId),
                isSavedByCurrentUser: true,
            });
        });
    });

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return results;
};

PostSchema.statics.incrementLikes = async function (
    entryId: string,
    userId: string
): Promise<IPostEntry> {
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');
    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post entry not found');
    if (entry.likedBy.includes(userId)) throw new Error('Already liked');

    entry.likedBy.push(userId);
    entry.likesCount++;

    // ✅ FIX: keep reactions[] in sync so Reactors modal shows this user too
    if (!entry.reactions) entry.reactions = [];
    if (!entry.reactionCounts) {
        entry.reactionCounts = { like: 0, celebrate: 0, support: 0, love: 0, insightful: 0, funny: 0 };
    }
    const existingReactionIndex = entry.reactions.findIndex((r: IReaction) => r.userId === userId);
    if (existingReactionIndex === -1) {
        entry.reactions.push({ userId, type: 'like', reactedAt: new Date() });
        entry.reactionCounts.like = (entry.reactionCounts.like || 0) + 1;
    }

    await doc.save();
    return entry;
};

PostSchema.statics.decrementLikes = async function (
    entryId: string,
    userId: string
): Promise<IPostEntry> {
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');
    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post entry not found');
    const index = entry.likedBy.indexOf(userId);
    if (index === -1) throw new Error('Not liked yet');

    entry.likedBy.splice(index, 1);
    entry.likesCount = Math.max(0, entry.likesCount - 1);

    // ✅ FIX: remove from reactions[] too
    if (entry.reactions) {
        const reactionIndex = entry.reactions.findIndex((r: IReaction) => r.userId === userId);
        if (reactionIndex !== -1) {
            const removedType = entry.reactions[reactionIndex].type;
            entry.reactions.splice(reactionIndex, 1);
            if (entry.reactionCounts) {
                entry.reactionCounts[removedType] = Math.max(0, entry.reactionCounts[removedType] - 1);
            }
        }
    }

    await doc.save();
    return entry;
};

PostSchema.statics.incrementComments = async function (entryId: string): Promise<IPostEntry> {
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');
    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post entry not found');
    entry.commentsCount++;
    await doc.save();
    return entry;
};

PostSchema.statics.decrementComments = async function (entryId: string): Promise<IPostEntry> {
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');
    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post entry not found');
    entry.commentsCount = Math.max(0, entry.commentsCount - 1);
    await doc.save();
    return entry;
};

// ✅ ADDED: increment sendsCount by `count` (batched send to multiple recipients)
PostSchema.statics.incrementSendsCount = async function (
    entryId: string,
    count: number
): Promise<IPostEntry> {
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');
    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post entry not found');
    entry.sendsCount = (entry.sendsCount || 0) + count;
    await doc.save();
    return entry;
};

// ✅ ADDED: Reaction statics
PostSchema.statics.addReaction = async function (
    entryId: string,
    userId: string,
    type: ReactionType
): Promise<IPostEntry> {
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');
    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post entry not found');

    if (!entry.reactions) entry.reactions = [];
    if (!entry.reactionCounts) {
        entry.reactionCounts = { like: 0, celebrate: 0, support: 0, love: 0, insightful: 0, funny: 0 };
    }

    const existingIndex = entry.reactions.findIndex((r: IReaction) => r.userId === userId);

    if (existingIndex !== -1) {
        // User already reacted — check if same type or switching type
        const existingType = entry.reactions[existingIndex].type;
        if (existingType === type) {
            throw new Error('You have already reacted with this type');
        }
        // Switching reaction type: decrement old, increment new
        entry.reactionCounts[existingType] = Math.max(0, entry.reactionCounts[existingType] - 1);
        entry.reactions[existingIndex].type = type;
        entry.reactions[existingIndex].reactedAt = new Date();
        entry.reactionCounts[type] = (entry.reactionCounts[type] || 0) + 1;
    } else {
        entry.reactions.push({ userId, type, reactedAt: new Date() });
        entry.reactionCounts[type] = (entry.reactionCounts[type] || 0) + 1;
    }

    // Keep old likedBy/likesCount in sync ONLY for 'like' type (backward compat
    // with existing simple like button / likesCount displays)
    const likeIndex = entry.likedBy.indexOf(userId);
    if (type === 'like' && likeIndex === -1) {
        entry.likedBy.push(userId);
        entry.likesCount++;
    } else if (type !== 'like' && likeIndex !== -1) {
        entry.likedBy.splice(likeIndex, 1);
        entry.likesCount = Math.max(0, entry.likesCount - 1);
    }

    await doc.save();
    return entry;
};

PostSchema.statics.removeReaction = async function (
    entryId: string,
    userId: string
): Promise<IPostEntry> {
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');
    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post entry not found');

    if (!entry.reactions) entry.reactions = [];
    const existingIndex = entry.reactions.findIndex((r: IReaction) => r.userId === userId);
    if (existingIndex === -1) throw new Error('No reaction found to remove');

    const removedType = entry.reactions[existingIndex].type;
    entry.reactions.splice(existingIndex, 1);
    if (entry.reactionCounts) {
        entry.reactionCounts[removedType] = Math.max(0, entry.reactionCounts[removedType] - 1);
    }

    // Sync old likedBy/likesCount
    const likeIndex = entry.likedBy.indexOf(userId);
    if (likeIndex !== -1) {
        entry.likedBy.splice(likeIndex, 1);
        entry.likesCount = Math.max(0, entry.likesCount - 1);
    }

    await doc.save();
    return entry;
};

const Post = mongoose.model<IPost, IPostModel>('Post', PostSchema);
export default Post;