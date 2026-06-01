/**
 * Post Model - Activity System
 * Handles user posts with images, videos, documents
 * 
 * @module models/Post.model
 * @version 1.0.0
 */

import { LoggerUtil } from '@/shared/logger.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { franc } from 'franc-min';
import nlp from 'compromise';
import natural from 'natural';

const logger = LoggerUtil;

// ==================== INTERFACES ====================

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

// ✅ NAYA — Ek single post entry ka interface
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
    likedBy: string[];

    isPinned: boolean;
    isSaved: boolean;
    isArchived: boolean;
    isDeleted: boolean;

    pinnedAt?: Date;
    savedAt?: Date;
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
            coordinates?: { lat: number; lng: number; };
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
    toObject?(): any;
}

// ✅ NAYA — Main document interface (ek user ka ek document)
export interface IPost extends Document {
    postId: string;        // document-level unique id
    userId: string;        // unique per user
    creatorModeEnabled: boolean;
    totalPosts: number;
    posts: IPostEntry[];   // saari posts yahan
    createdAt: Date;
    updatedAt: Date;
}

// Ye interfaces same rahenge
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
    incrementLikes(entryId: string, userId: string): Promise<IPostEntry>;
    decrementLikes(entryId: string, userId: string): Promise<IPostEntry>;
    incrementComments(entryId: string): Promise<IPostEntry>;
    decrementComments(entryId: string): Promise<IPostEntry>;
}

// ==================== SCHEMA ====================

const MediaItemSchema = new Schema<IMediaItem>({
    mediaId: {
        type: String,
        required: true,
        default: () => uuidv4(),
    },
    type: {
        type: String,
        enum: ['image', 'video', 'document'],
        required: true,
    },
    cloudinaryPublicId: {
        type: String,
        required: true,
    },
    cloudinaryUrl: {
        type: String,
        required: true,
    },
    cloudinarySecureUrl: {
        type: String,
        required: true,
    },
    originalName: {
        type: String,
        required: true,
    },
    mimeType: {
        type: String,
        required: true,
    },
    fileSize: {
        type: Number,
        required: true,
    },
    width: Number,
    height: Number,
    duration: Number,
    format: {
        type: String,
        required: true,
    },
    uploadedAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });

// ✅ PostEntrySchema — har ek post entry ka schema
const PostEntrySchema = new Schema<IPostEntry>(
    {
        entryId: {
            type: String,
            required: true,
            default: () => uuidv4(),
        },
        title: {
            type: String,
            required: true,
            minlength: 1,
            maxlength: 300,
            trim: true,
            validate: {
                validator: (v: string) => /^[A-Z].*/.test(v),
                message: 'Title must start with a capital letter',
            },
        },
        content: { type: String, maxlength: 10000, trim: true },
        mood: {
            type: String,
            enum: ['happy', 'thoughtful', 'excited', 'reflective', 'grateful'],
            default: null,
        },
        isPublic: {
            type: Boolean,
            default: true,
        },
        postUrl: { type: String, required: true },

        images: { type: [MediaItemSchema], default: undefined },
        videos: { type: [MediaItemSchema], default: undefined },
        documents: { type: [MediaItemSchema], default: undefined },

        likesCount: { type: Number, default: 0, min: 0 },
        commentsCount: { type: Number, default: 0, min: 0 },
        likedBy: [{ type: String }],

        isPinned: { type: Boolean, default: false },
        isSaved: { type: Boolean, default: false },
        isArchived: { type: Boolean, default: false },
        isDeleted: { type: Boolean, default: false },

        pinnedAt: Date,
        savedAt: Date,
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
            options: [{
                optionId: { type: String, default: () => uuidv4() },
                text: { type: String, required: true, maxlength: 100 },
                votes: { type: Number, default: 0 },
                votedBy: [{ type: String }],
            }],
            duration: { type: Number, enum: [1, 3, 7, 14], default: 7 },
            endsAt: Date,
            totalVotes: { type: Number, default: 0 },
            isActive: { type: Boolean, default: true },
        },

        scheduledFor: { type: Date },
        isScheduled: { type: Boolean, default: false },
        publishedAt: Date,

        eventData: {
            coverImageId: String,
            eventType: { type: String, enum: ['online', 'in-person', 'hybrid'] },
            eventFormat: { type: String, enum: ['conference', 'webinar', 'workshop', 'meetup', 'seminar', 'other'] },
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
            recentTrend: { type: String, enum: ['improving', 'declining', 'stable'], default: 'stable' },
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
        timestamps: true,   // createdAt, updatedAt auto
        _id: false,         // MongoDB _id nahi chahiye entry mein
    }
);

// ✅ NAYA PostSchema — Ek user ka ek document
const PostSchema = new Schema<IPost, IPostModel>(
    {
        postId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            index: true,
        },
        userId: {
            type: String,
            required: true,
            unique: true,   // ← KEY CHANGE: ek user ka sirf ek document
            index: true,
        },
        creatorModeEnabled: { type: Boolean, default: false },
        totalPosts: { type: Number, default: 0 },
        posts: [PostEntrySchema],   // ← saari posts yahan
    },
    {
        timestamps: true,
        collection: 'posts',
    }
);

// ==================== INDEXES ====================

PostSchema.index({ userId: 1 });                              // user dhundne ke liye
PostSchema.index({ 'posts.entryId': 1 });                    // specific entry ke liye
PostSchema.index({ 'posts.isDeleted': 1 });
PostSchema.index({ 'posts.isPinned': 1 });
PostSchema.index({ 'posts.isScheduled': 1, 'posts.scheduledFor': 1 });
PostSchema.index({ 'posts.pollData.endsAt': 1, 'posts.pollData.isActive': 1 });
PostSchema.index({ 'posts.eventData.startDate': 1 });


// ==================== STATIC METHODS ====================
// ✅ findByUserId — user ka document return karo
PostSchema.statics.findByUserId = async function (
    userId: string,
    includeArchived: boolean = false
): Promise<IPost | null> {
    return this.findOne({ userId });
    // filtering PostService mein hogi posts[] array pe
};

// ✅ getUserPostCount
PostSchema.statics.getUserPostCount = async function (userId: string): Promise<number> {
    const doc = await this.findOne({ userId });
    if (!doc) return 0;
    return doc.posts.filter((p: IPostEntry) => !p.isDeleted && !p.isArchived).length;
};

// ✅ setPinned — entryId se entry dhundo
PostSchema.statics.setPinned = async function (
    entryId: string,
    userId: string,
    isPinned: boolean
): Promise<IPostEntry> {
    const doc = await this.findOne({ userId });
    if (!doc) throw new Error('Post not found');

    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post not found');

    entry.isPinned = isPinned;
    entry.pinnedAt = isPinned ? new Date() : undefined;
    await doc.save();
    return entry;
};

// ✅ setSaved
PostSchema.statics.setSaved = async function (
    entryId: string,
    userId: string,
    isSaved: boolean
): Promise<IPostEntry> {
    const doc = await this.findOne({ userId });
    if (!doc) throw new Error('Post not found');

    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post not found');

    entry.isSaved = isSaved;
    entry.savedAt = isSaved ? new Date() : undefined;
    await doc.save();
    return entry;
};

// ✅ incrementLikes — kisi bhi user ki post ke liye (entryId se dhundo)
PostSchema.statics.incrementLikes = async function (
    entryId: string,
    userId: string
): Promise<IPostEntry> {
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');

    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post not found');

    if (entry.likedBy.includes(userId)) throw new Error('You have already liked this post');

    entry.likedBy.push(userId);
    entry.likesCount++;
    await doc.save();
    return entry;
};

// ✅ decrementLikes
PostSchema.statics.decrementLikes = async function (
    entryId: string,
    userId: string
): Promise<IPostEntry> {
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');

    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post not found');

    const index = entry.likedBy.indexOf(userId);
    if (index === -1) throw new Error('You have not liked this post');

    entry.likedBy.splice(index, 1);
    entry.likesCount = Math.max(0, entry.likesCount - 1);
    await doc.save();
    return entry;
};

// ✅ incrementComments
PostSchema.statics.incrementComments = async function (entryId: string): Promise<IPostEntry> {
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');

    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post not found');

    entry.commentsCount++;
    await doc.save();
    return entry;
};

// ✅ decrementComments
PostSchema.statics.decrementComments = async function (entryId: string): Promise<IPostEntry> {
    const doc = await this.findOne({ 'posts.entryId': entryId });
    if (!doc) throw new Error('Post not found');

    const entry = doc.posts.find((p: IPostEntry) => p.entryId === entryId && !p.isDeleted);
    if (!entry) throw new Error('Post not found');

    entry.commentsCount = Math.max(0, entry.commentsCount - 1);
    await doc.save();
    return entry;
};
// ==================== EXPORT ====================

const Post = mongoose.model<IPost, IPostModel>('Post', PostSchema);
export default Post;