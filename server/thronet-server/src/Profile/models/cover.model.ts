/**
 * CoverPhoto Model - User Cover/Banner Picture Management
 * @module models/CoverPhoto.model
 * @version 1.0.0
 */

import { LoggerUtil } from '@/shared/logger.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface ICoverPhoto extends Document {
    coverId: string;
    userId: string;
    cloudinaryPublicId: string;
    cloudinaryUrl: string;
    cloudinarySecureUrl: string;
    cloudinaryFolder: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    width: number;
    height: number;
    format: string;
    isActive: boolean;
    status: 'active' | 'archived' | 'deleted';
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;
    uploadedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICoverPhotoModel extends Model<ICoverPhoto> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<ICoverPhoto[]>;
    findActiveCover(userId: string): Promise<ICoverPhoto | null>;
    getUserCoverCount(userId: string): Promise<number>;
    setActiveCover(coverId: string, userId: string): Promise<ICoverPhoto>;
}

const CoverPhotoSchema = new Schema<ICoverPhoto, ICoverPhotoModel>(
    {
        coverId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            // FIX:  hataya - unique:true apne aap index banata hai
            immutable: true,
        },
        userId: {
            type: String,
            required: [true, 'User ID is required'],
            validate: {
                validator: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid User ID format',
            },
        },
        cloudinaryPublicId: {
            type: String,
            required: [true, 'Cloudinary public ID is required'],
        },
        cloudinaryUrl: {
            type: String,
            required: [true, 'Cloudinary URL is required'],
        },
        cloudinarySecureUrl: {
            type: String,
            required: [true, 'Cloudinary secure URL is required'],
        },
        cloudinaryFolder: {
            type: String,
            default: 'cover-photos',
        },
        originalName: {
            type: String,
            required: [true, 'Original filename is required'],
        },
        mimeType: {
            type: String,
            required: [true, 'MIME type is required'],
            enum: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
        },
        fileSize: {
            type: Number,
            required: [true, 'File size is required'],
            min: [0, 'File size cannot be negative'],
            max: [52428800, 'File size cannot exceed 50MB'],
        },
        width: {
            type: Number,
            required: [true, 'Image width is required'],
            min: [400, 'Image width must be at least 400px'],
            max: [10000, 'Image width cannot exceed 10000px'],
        },
        height: {
            type: Number,
            required: [true, 'Image height is required'],
            min: [200, 'Image height must be at least 200px'],
            max: [10000, 'Image height cannot exceed 10000px'],
        },
        format: {
            type: String,
            required: [true, 'Image format is required'],
            enum: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        },
        isActive: { type: Boolean, default: false },
        status: {
            type: String,
            enum: ['active', 'archived', 'deleted'],
            default: 'active',
        },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        isArchived: { type: Boolean, default: false },
        archivedAt: { type: Date, default: null },
        uploadedAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
        collection: 'cover_photos',
        toJSON: {
            virtuals: true,
            transform: function (_doc, ret) {
                delete (ret as any).__v;
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);

// ==================== INDEXES ====================
CoverPhotoSchema.index({ userId: 1, isActive: 1 });
CoverPhotoSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
// FIX: cloudinaryPublicId field se  hataya - sirf yahan ek baar index hai
CoverPhotoSchema.index({ cloudinaryPublicId: 1 });
CoverPhotoSchema.index({ createdAt: -1 });

// ==================== MIDDLEWARE ====================

CoverPhotoSchema.pre('save', function (next) {
    if (this.isDeleted) {
        this.status = 'deleted';
        this.isActive = false;
    } else if (this.isArchived) {
        this.status = 'archived';
        this.isActive = false;
    } else {
        this.status = 'active';
    }
    next();
});

// ==================== STATIC METHODS ====================

CoverPhotoSchema.statics.findByUserId = async function (userId: string, includeArchived: boolean = false): Promise<ICoverPhoto[]> {
    try {
        const query: any = { userId, isDeleted: false };
        if (!includeArchived) query.isArchived = false;
        return await this.find(query).sort({ createdAt: -1 }).exec();
    } catch (error: any) {
        LoggerUtil.error('Find covers by userId failed', { error: (error as Error).message, userId });
        throw error;
    }
};

CoverPhotoSchema.statics.findActiveCover = async function (userId: string): Promise<ICoverPhoto | null> {
    try {
        return await this.findOne({ userId, isActive: true, isDeleted: false }).exec();
    } catch (error: any) {
        LoggerUtil.error('Find active cover failed', { error: (error as Error).message, userId });
        throw error;
    }
};

CoverPhotoSchema.statics.getUserCoverCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error: any) {
        LoggerUtil.error('Get cover count failed', { error: (error as Error).message, userId });
        throw error;
    }
};

CoverPhotoSchema.statics.setActiveCover = async function (coverId: string, userId: string): Promise<ICoverPhoto> {
    try {
        await this.updateMany({ userId }, { $set: { isActive: false } });
        const cover = await this.findOneAndUpdate(
            { coverId, userId, isDeleted: false },
            { $set: { isActive: true } },
            { new: true }
        );
        if (!cover) throw new Error('Cover not found');
        return cover;
    } catch (error: any) {
        LoggerUtil.error('Set active cover failed', { error: (error as Error).message, coverId, userId });
        throw error;
    }
};

const CoverPhoto = mongoose.model<ICoverPhoto, ICoverPhotoModel>('CoverPhoto', CoverPhotoSchema);
export default CoverPhoto;