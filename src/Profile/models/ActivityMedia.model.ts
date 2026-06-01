/**
 * Activity Media Model - Tracks all media used in posts
 * Separate tracking for images, videos, documents
 * 
 * @module models/ActivityMedia.model
 * @version 1.0.0
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

export interface IActivityMedia extends Document {
    mediaId: string;
    userId: string;
    postId: string;
    type: 'image' | 'video' | 'document';
    cloudinaryPublicId: string;
    cloudinaryUrl: string;
    cloudinarySecureUrl: string;
    cloudinaryFolder: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    width?: number;
    height?: number;
    duration?: number;
    format: string;
    isDeleted: boolean;
    deletedAt?: Date;
    uploadedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IActivityMediaModel extends Model<IActivityMedia> {
    findByMediaId(mediaId: string): Promise<IActivityMedia | null>;
    findByUserId(userId: string, type?: string): Promise<IActivityMedia[]>;
    findByPostId(postId: string): Promise<IActivityMedia[]>;
    getUserMediaCount(userId: string, type?: string): Promise<number>;
    getUserMediaStats(userId: string): Promise<any>;
}

// ==================== SCHEMA ====================

const ActivityMediaSchema = new Schema<IActivityMedia, IActivityMediaModel>(
    {
        mediaId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            index: true,
        },
        userId: {
            type: String,
            required: true,
            index: true,
        },
        postId: {
            type: String,
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ['image', 'video', 'document'],
            required: true,
            index: true,
        },
        cloudinaryPublicId: {
            type: String,
            required: true,
            unique: true,
        },
        cloudinaryUrl: {
            type: String,
            required: true,
        },
        cloudinarySecureUrl: {
            type: String,
            required: true,
        },
        cloudinaryFolder: {
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
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: Date,
        uploadedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: 'activity_media',
    }
);

// ==================== INDEXES ====================

ActivityMediaSchema.index({ userId: 1, type: 1, createdAt: -1 });
ActivityMediaSchema.index({ postId: 1, type: 1 });
ActivityMediaSchema.index({ userId: 1, isDeleted: 1 });

// ==================== STATIC METHODS ====================

ActivityMediaSchema.statics.findByMediaId = async function (mediaId: string): Promise<IActivityMedia | null> {
    return this.findOne({ mediaId, isDeleted: false });
};

ActivityMediaSchema.statics.findByUserId = async function (
    userId: string,
    type?: string
): Promise<IActivityMedia[]> {
    const query: any = { userId, isDeleted: false };
    if (type) query.type = type;
    return this.find(query).sort({ createdAt: -1 });
};

ActivityMediaSchema.statics.findByPostId = async function (postId: string): Promise<IActivityMedia[]> {
    return this.find({ postId, isDeleted: false }).sort({ createdAt: -1 });
};

ActivityMediaSchema.statics.getUserMediaCount = async function (
    userId: string,
    type?: string
): Promise<number> {
    const query: any = { userId, isDeleted: false };
    if (type) query.type = type;
    return this.countDocuments(query);
};

ActivityMediaSchema.statics.getUserMediaStats = async function (userId: string): Promise<any> {
    const stats = await this.aggregate([
        { $match: { userId, isDeleted: false } },
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 },
                totalSize: { $sum: '$fileSize' },
            },
        },
    ]);

    const result: any = {
        totalImages: 0,
        totalVideos: 0,
        totalDocuments: 0,
        totalFiles: 0,
        totalSize: 0,
    };

    stats.forEach((stat: any) => {
        if (stat._id === 'image') result.totalImages = stat.count;
        if (stat._id === 'video') result.totalVideos = stat.count;
        if (stat._id === 'document') result.totalDocuments = stat.count;
        result.totalFiles += stat.count;
        result.totalSize += stat.totalSize;
    });

    return result;
};

// ==================== EXPORT ====================

const ActivityMedia = mongoose.model<IActivityMedia, IActivityMediaModel>('ActivityMedia', ActivityMediaSchema);
export default ActivityMedia;