/**
 * ProfilePhoto Model - User Profile Picture Management
 * Stores profile photos with Cloudinary integration
 * 
 * @module models/ProfilePhoto.model
 * @version 1.0.0
 */

import { LoggerUtil } from '@/shared/logger.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
// import { LoggerUtil } from '../utils/logger.util';

// ==================== INTERFACES ====================

export interface IProfilePhoto extends Document {
    photoId: string;
    userId: string;

    // Cloudinary Info
    cloudinaryPublicId: string;     // Cloudinary public_id
    cloudinaryUrl: string;          // Original URL
    cloudinarySecureUrl: string;    // HTTPS URL
    cloudinaryFolder: string;       // Cloudinary folder path

    // Photo Metadata
    originalName: string;           // Original filename
    mimeType: string;               // image/jpeg, image/png, etc.
    fileSize: number;               // Size in bytes
    width: number;                  // Image width
    height: number;                 // Image height
    format: string;                 // jpg, png, webp, etc.

    // Photo Status
    isActive: boolean;              // Is this the current profile photo?
    status: 'active' | 'archived' | 'deleted';

    // Soft Delete / Archive
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;

    // Metadata
    uploadedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IProfilePhotoModel extends Model<IProfilePhoto> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<IProfilePhoto[]>;
    findActivePhoto(userId: string): Promise<IProfilePhoto | null>;
    getUserPhotoCount(userId: string): Promise<number>;
    setActivePhoto(photoId: string, userId: string): Promise<IProfilePhoto>;
}

// ==================== SCHEMA ====================

const ProfilePhotoSchema = new Schema<IProfilePhoto, IProfilePhotoModel>(
    {
        photoId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            index: true,
            immutable: true,
        },
        userId: {
            type: String,
            required: [true, 'User ID is required'],
            index: true,
            validate: {
                validator: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid User ID format',
            },
        },

        // ==================== CLOUDINARY INFO ====================
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
            default: 'profile-photos',
        },

        // ==================== PHOTO METADATA ====================
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
            min: [100, 'Image width must be at least 100px'],
            max: [10000, 'Image width cannot exceed 10000px'],
        },
        height: {
            type: Number,
            required: [true, 'Image height is required'],
            min: [100, 'Image height must be at least 100px'],
            max: [10000, 'Image height cannot exceed 10000px'],
        },
        format: {
            type: String,
            required: [true, 'Image format is required'],
            enum: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        },

        // ==================== PHOTO STATUS ====================
        isActive: {
            type: Boolean,
            default: false,
            index: true,
        },
        status: {
            type: String,
            enum: ['active', 'archived', 'deleted'],
            default: 'active',
            index: true,
        },

        // ==================== SOFT DELETE / ARCHIVE ====================
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
        isArchived: {
            type: Boolean,
            default: false,
            index: true,
        },
        archivedAt: {
            type: Date,
            default: null,
        },

        // ==================== METADATA ====================
        uploadedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: 'profile_photos',
        toJSON: {
            virtuals: true,
            transform: function (_doc, ret) {
                delete (ret as any).__v;
                return ret;
            },
        },
        toObject: {
            virtuals: true,
        },
    }
);

// ==================== INDEXES ====================

ProfilePhotoSchema.index({ userId: 1, isActive: 1 });              // Active photo
ProfilePhotoSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 }); // Soft delete and archive
ProfilePhotoSchema.index({ cloudinaryPublicId: 1 });                // Cloudinary lookup
ProfilePhotoSchema.index({ createdAt: -1 });                        // Recent photos

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Update status based on flags
 */
ProfilePhotoSchema.pre('save', function (next) {
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

/**
 * Find all photos by userId (excluding deleted)
 */
ProfilePhotoSchema.statics.findByUserId = async function (userId: string, includeArchived: boolean = false): Promise<IProfilePhoto[]> {
    try {
        const query: any = { userId, isDeleted: false };

        if (!includeArchived) {
            query.isArchived = false;
        }

        return await this.find(query)
            .sort({ createdAt: -1 })
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Find photos by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Find active profile photo
 */
ProfilePhotoSchema.statics.findActivePhoto = async function (userId: string): Promise<IProfilePhoto | null> {
    try {
        return await this.findOne({
            userId,
            isActive: true,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active photo failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get total photo count for user (excluding deleted)
 */
ProfilePhotoSchema.statics.getUserPhotoCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error : any) {
        LoggerUtil.error('Get photo count failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Set photo as active (deactivate all others)
 */
ProfilePhotoSchema.statics.setActivePhoto = async function (photoId: string, userId: string): Promise<IProfilePhoto> {
    try {
        // Deactivate all photos for user
        await this.updateMany(
            { userId },
            { $set: { isActive: false } }
        );

        // Activate the selected photo
        const photo = await this.findOneAndUpdate(
            { photoId, userId, isDeleted: false },
            { $set: { isActive: true } },
            { new: true }
        );

        if (!photo) {
            throw new Error('Photo not found');
        }

        return photo;
    } catch (error : any) {
        LoggerUtil.error('Set active photo failed', {
            error: (error as Error).message,
            photoId,
            userId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const ProfilePhoto = mongoose.model<IProfilePhoto, IProfilePhotoModel>('ProfilePhoto', ProfilePhotoSchema);
export default ProfilePhoto;