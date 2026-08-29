import { LoggerUtil } from '@/shared/logger.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

export interface IProfilePhoto extends Document {
    photoId: string;
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
            // ✅ CORRECT: unique:true apne aap index banata hai
            //  nahi rakha - duplicate avoid karne ke liye
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

        // ==================== CLOUDINARY INFO ====================
        cloudinaryPublicId: {
            type: String,
            required: [true, 'Cloudinary public ID is required'],
            // ✅ FIX:  hataya field se
            // Neeche ProfilePhotoSchema.index({ cloudinaryPublicId: 1 }) already tha - DUPLICATE tha
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
        },
        status: {
            type: String,
            enum: ['active', 'archived', 'deleted'],
            default: 'active',
        },

        // ==================== SOFT DELETE / ARCHIVE ====================
        isDeleted: {
            type: Boolean,
            default: false,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
        isArchived: {
            type: Boolean,
            default: false,
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
        toObject: { virtuals: true },
    }
);

// ==================== INDEXES ====================
// ✅ Sirf compound aur specific indexes yahan
ProfilePhotoSchema.index({ userId: 1, isActive: 1 });
ProfilePhotoSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
// ✅ FIX: cloudinaryPublicId field se  hataya - sirf yahan ek baar index hai
ProfilePhotoSchema.index({ cloudinaryPublicId: 1 });
ProfilePhotoSchema.index({ createdAt: -1 });

// ==================== MIDDLEWARE ====================

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

ProfilePhotoSchema.statics.findByUserId = async function (userId: string, includeArchived: boolean = false): Promise<IProfilePhoto[]> {
    try {
        const query: any = { userId, isDeleted: false };
        if (!includeArchived) query.isArchived = false;
        return await this.find(query).sort({ createdAt: -1 }).exec();
    } catch (error: any) {
        LoggerUtil.error('Find photos by userId failed', { error: (error as Error).message, userId });
        throw error;
    }
};

ProfilePhotoSchema.statics.findActivePhoto = async function (userId: string): Promise<IProfilePhoto | null> {
    try {
        return await this.findOne({ userId, isActive: true, isDeleted: false }).exec();
    } catch (error: any) {
        LoggerUtil.error('Find active photo failed', { error: (error as Error).message, userId });
        throw error;
    }
};

ProfilePhotoSchema.statics.getUserPhotoCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error: any) {
        LoggerUtil.error('Get photo count failed', { error: (error as Error).message, userId });
        throw error;
    }
};

ProfilePhotoSchema.statics.setActivePhoto = async function (photoId: string, userId: string): Promise<IProfilePhoto> {
    try {
        await this.updateMany({ userId }, { $set: { isActive: false } });
        const photo = await this.findOneAndUpdate(
            { photoId, userId, isDeleted: false },
            { $set: { isActive: true } },
            { new: true }
        );
        if (!photo) throw new Error('Photo not found');
        return photo;
    } catch (error: any) {
        LoggerUtil.error('Set active photo failed', { error: (error as Error).message, photoId, userId });
        throw error;
    }
};

// ==================== EXPORT ====================

const ProfilePhoto = mongoose.model<IProfilePhoto, IProfilePhotoModel>('ProfilePhoto', ProfilePhotoSchema);
export default ProfilePhoto;