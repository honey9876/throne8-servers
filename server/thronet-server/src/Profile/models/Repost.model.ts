// src/Profile/models/Repost.model.ts

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IRepost extends Document {
    repostId: string;
    originalPostEntryId: string;
    originalPostOwnerId: string;
    repostedBy: string;
    repostType: 'repost' | 'quote';
    thoughtText?: string;
    visibility: 'public' | 'connections' | 'private';
    isDeleted: boolean;
    deletedAt?: Date;
    isEdited: boolean;
    editedAt?: Date;
    repostSource: 'feed' | 'profile' | 'search' | 'other';
    // ✅ Sirf quote-repost ke liye use hote hain — apna independent like system
    likesCount: number;
    likedBy: string[];
    createdAt: Date;
    updatedAt: Date;
}

export interface IRepostModel extends Model<IRepost> {
    findByRepostId(repostId: string): Promise<IRepost | null>;
    findByOriginalPost(entryId: string): Promise<IRepost[]>;
    findByUser(userId: string): Promise<IRepost[]>;
    hasUserReposted(entryId: string, userId: string): Promise<boolean>;
    getRepostCount(entryId: string): Promise<number>;
}

const RepostSchema = new Schema<IRepost, IRepostModel>(
    {
        repostId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
        },
        originalPostEntryId: {
            type: String,
            required: true,
        },
        originalPostOwnerId: {
            type: String,
            required: true,
        },
        repostedBy: {
            type: String,
            required: true,
        },
        repostType: {
            type: String,
            enum: ['repost', 'quote'],
            required: true,
            default: 'repost',
        },
        thoughtText: {
            type: String,
            maxlength: 3000,
            trim: true,
            default: null,
        },
        visibility: {
            type: String,
            enum: ['public', 'connections', 'private'],
            default: 'public',
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        deletedAt: Date,
        isEdited: {
            type: Boolean,
            default: false,
        },
        editedAt: Date,
        repostSource: {
            type: String,
            enum: ['feed', 'profile', 'search', 'other'],
            default: 'feed',
        },
        likesCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        likedBy: {
            type: [String],
            default: [],
        },
    },
    {
        timestamps: true,
        collection: 'reposts',
    }
);

RepostSchema.index(
    { originalPostEntryId: 1, repostedBy: 1 },
    { unique: true, sparse: true }
);
RepostSchema.index({ repostedBy: 1, createdAt: -1 });
RepostSchema.index({ originalPostEntryId: 1, isDeleted: 1 });
RepostSchema.index({ createdAt: -1 });

RepostSchema.statics.findByRepostId = async function (repostId: string) {
    return this.findOne({ repostId, isDeleted: false });
};

RepostSchema.statics.findByOriginalPost = async function (entryId: string) {
    return this.find({ originalPostEntryId: entryId, isDeleted: false })
        .sort({ createdAt: -1 });
};

RepostSchema.statics.findByUser = async function (userId: string) {
    return this.find({ repostedBy: userId, isDeleted: false })
        .sort({ createdAt: -1 });
};

RepostSchema.statics.hasUserReposted = async function (entryId: string, userId: string) {
    const exists = await this.findOne({
        originalPostEntryId: entryId,
        repostedBy: userId,
        isDeleted: false,
    });
    return !!exists;
};

RepostSchema.statics.getRepostCount = async function (entryId: string) {
    return this.countDocuments({
        originalPostEntryId: entryId,
        isDeleted: false,
    });
};

const Repost = mongoose.model<IRepost, IRepostModel>('Repost', RepostSchema);
export default Repost;