/**
 * Honor Model - User Honors & Awards Management
 * Stores awards, recognitions, achievements with verification
 * 
 * @module models/Honor.model
 * @version 1.0.0
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== INTERFACES ====================

export interface IMediaAttachment {
    mediaId: string;
    mediaType: 'certificate' | 'photo';
    mediaUrl: string;
    mediaSecureUrl?: string;
    mediaPublicId?: string;
    fileName: string;
    fileSize: number;
    uploadedAt: Date;
}

export interface IVerification {
    isVerified: boolean;
    verifiedBy?: string;  // User ID or organization ID
    verifiedAt?: Date;
    verificationProof?: string;  // Document URL or reference
}

export interface IAssociation {
    associationType: 'school' | 'company';
    associationId?: string;  // School/Company ID
    associationName: string;
}

export interface IHonor extends Document {
    honorId: string;
    userId: string;

    // Basic Info
    title: string;
    issuer: string;  // Organization/Institution name

    // Date Received
    dateReceived: {
        month: number;  // 1-12
        year: number;
    };

    // Description
    description?: string;  // Max 1000 chars

    // Category
    category: 'academic' | 'professional' | 'sports' | 'community_service' | 'cultural' | 'research' | 'leadership' | 'other';

    // Association
    associatedWith?: IAssociation;

    // Organization Logo
    organizationLogo?: {
        logoUrl: string;
        logoPublicId: string;
        logoSecureUrl: string;
        uploadedAt: Date;
    };

    // Media Attachments
    mediaAttachments: IMediaAttachment[];

    // Verification
    verification: IVerification;

    // Pinned (Featured)
    isPinned: boolean;
    pinnedOrder?: number;  // 1, 2, or 3
    pinnedAt?: Date;

    // Visibility
    visibility: 'public' | 'connections';

    // Display Order
    displayOrder: number;

    // Metadata
    createdAt: Date;
    updatedAt: Date;

    // Soft Delete / Archive
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;
}

export interface IHonorModel extends Model<IHonor> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<IHonor[]>;
    getUserHonorCount(userId: string): Promise<number>;
    findActiveById(honorId: string, userId: string): Promise<IHonor | null>;
    getPinnedHonors(userId: string): Promise<IHonor[]>;
    getNextDisplayOrder(userId: string): Promise<number>;
}

// ==================== SCHEMA ====================

const MediaAttachmentSchema = new Schema<IMediaAttachment>({
    mediaId: {
        type: String,
        default: () => uuidv4(),
    },
    mediaType: {
        type: String,
        enum: ['certificate', 'photo'],
        required: true,
    },
    mediaUrl: {
        type: String,
        required: true,
        trim: true,
    },
    mediaSecureUrl: {
        type: String,
        trim: true,
    },
    mediaPublicId: {
        type: String,
        trim: true,
    },
    fileName: {
        type: String,
        required: true,
        trim: true,
    },
    fileSize: {
        type: Number,
        required: true,
        min: [0, 'File size cannot be negative'],
    },
    uploadedAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });

const VerificationSchema = new Schema<IVerification>({
    isVerified: {
        type: Boolean,
        default: false,
    },
    verifiedBy: {
        type: String,
        trim: true,
    },
    verifiedAt: {
        type: Date,
    },
    verificationProof: {
        type: String,
        trim: true,
    },
}, { _id: false });

const AssociationSchema = new Schema<IAssociation>({
    associationType: {
        type: String,
        enum: ['school', 'company'],
        required: true,
    },
    associationId: {
        type: String,
        trim: true,
    },
    associationName: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Association name must be at least 2 characters'],
        maxlength: [200, 'Association name cannot exceed 200 characters'],
    },
}, { _id: false });

const HonorSchema = new Schema<IHonor, IHonorModel>(
    {
        honorId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
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

        // ==================== BASIC INFO ====================
        title: {
            type: String,
            required: [true, 'Award title is required'],
            trim: true,
            minlength: [3, 'Title must be at least 3 characters'],
            maxlength: [200, 'Title cannot exceed 200 characters'],
        },
        issuer: {
            type: String,
            required: [true, 'Issuer/Organization is required'],
            trim: true,
            minlength: [2, 'Issuer name must be at least 2 characters'],
            maxlength: [200, 'Issuer name cannot exceed 200 characters'],
        },

        // ==================== DATE RECEIVED ====================
        dateReceived: {
            month: {
                type: Number,
                required: [true, 'Month is required'],
                min: [1, 'Month must be between 1 and 12'],
                max: [12, 'Month must be between 1 and 12'],
            },
            year: {
                type: Number,
                required: [true, 'Year is required'],
                min: [1900, 'Year must be after 1900'],
                max: [new Date().getFullYear(), 'Year cannot be in the future'],
            },
        },

        // ==================== DESCRIPTION ====================
        description: {
            type: String,
            trim: true,
            maxlength: [1000, 'Description cannot exceed 1000 characters'],
        },

        // ==================== CATEGORY ====================
        category: {
            type: String,
            required: [true, 'Category is required'],
            enum: ['academic', 'professional', 'sports', 'community_service', 'cultural', 'research', 'leadership', 'other'],
            lowercase: true,
        },

        // ==================== ASSOCIATION ====================
        associatedWith: {
            type: AssociationSchema,
            default: undefined,
        },

        // ==================== ORGANIZATION LOGO ====================
        organizationLogo: {
            logoUrl: {
                type: String,
                trim: true,
            },
            logoPublicId: {
                type: String,
                trim: true,
            },
            logoSecureUrl: {
                type: String,
                trim: true,
            },
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
        },

        // ==================== MEDIA ATTACHMENTS ====================
        mediaAttachments: {
            type: [MediaAttachmentSchema],
            default: [],
            validate: {
                validator: function (v: IMediaAttachment[]) {
                    return v.length <= 10;
                },
                message: 'Maximum 10 media attachments allowed',
            },
        },

        // ==================== VERIFICATION ====================
        verification: {
            type: VerificationSchema,
            default: () => ({ isVerified: false }),
        },

        // ==================== PINNED (FEATURED) ====================
        isPinned: {
            type: Boolean,
            default: false,
        },
        pinnedOrder: {
            type: Number,
            min: 1,
            max: 3,
            validate: {
                validator: function (this: IHonor, v: number | undefined) {
                    if (this.isPinned && (!v || v < 1 || v > 3)) {
                        return false;
                    }
                    return true;
                },
                message: 'Pinned order must be 1, 2, or 3',
            },
        },
        pinnedAt: {
            type: Date,
        },

        // ==================== VISIBILITY ====================
        visibility: {
            type: String,
            enum: ['public', 'connections'],
            default: 'public',
        },

        // ==================== DISPLAY ORDER ====================
        displayOrder: {
            type: Number,
            default: 0,
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
    },
    {
        timestamps: true,
        collection: 'honors',
        toJSON: {
            virtuals: true,
            transform: function (_doc, ret: any) {
                delete ret.__v;
                return ret;
            },
        },
        toObject: {
            virtuals: true,
        },
    }
);

// ==================== INDEXES ====================

HonorSchema.index({ userId: 1, isPinned: -1, displayOrder: 1 });
HonorSchema.index({ userId: 1, category: 1 });
HonorSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
HonorSchema.index({ userId: 1, 'verification.isVerified': 1 });
HonorSchema.index({ userId: 1, visibility: 1 });
HonorSchema.index({ 'dateReceived.year': -1 });
HonorSchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================

HonorSchema.virtual('hasMedia').get(function (this: IHonor) {
    return this.mediaAttachments && this.mediaAttachments.length > 0;
});

HonorSchema.virtual('formattedDate').get(function (this: IHonor) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[this.dateReceived.month - 1];
    return `${month} ${this.dateReceived.year}`;
});

HonorSchema.virtual('isVerified').get(function (this: IHonor) {
    return this.verification && this.verification.isVerified;
});

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Validate pinned order uniqueness
 */
HonorSchema.pre('save', async function (next) {
    if (this.isPinned && this.pinnedOrder) {
        const existing = await (this.constructor as IHonorModel).findOne({
            userId: this.userId,
            isPinned: true,
            pinnedOrder: this.pinnedOrder,
            honorId: { $ne: this.honorId },
            isDeleted: false,
        });

        if (existing) {
            return next(new Error(`Pinned order ${this.pinnedOrder} is already taken by another honor`));
        }
    }
    next();
});

// ==================== STATIC METHODS ====================

/**
 * Find all honors by userId
 */
HonorSchema.statics.findByUserId = async function (
    userId: string,
    includeArchived: boolean = false
): Promise<IHonor[]> {
    try {
        const query: any = { userId, isDeleted: false };

        if (!includeArchived) {
            query.isArchived = false;
        }

        return await this.find(query)
            .sort({ isPinned: -1, pinnedOrder: 1, displayOrder: 1 })
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Find honors by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get total honor count for user
 */
HonorSchema.statics.getUserHonorCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error : any) {
        LoggerUtil.error('Get honor count failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Find active honor by ID
 */
HonorSchema.statics.findActiveById = async function (
    honorId: string,
    userId: string
): Promise<IHonor | null> {
    try {
        return await this.findOne({
            honorId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active honor by ID failed', {
            error: (error as Error).message,
            honorId,
            userId,
        });
        throw error;
    }
};

/**
 * Get pinned honors (top 3)
 */
HonorSchema.statics.getPinnedHonors = async function (userId: string): Promise<IHonor[]> {
    try {
        return await this.find({
            userId,
            isPinned: true,
            isDeleted: false,
        })
            .sort({ pinnedOrder: 1 })
            .limit(3)
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Get pinned honors failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get next display order
 */
HonorSchema.statics.getNextDisplayOrder = async function (userId: string): Promise<number> {
    try {
        const maxOrder = await this.findOne({ userId, isDeleted: false })
            .sort({ displayOrder: -1 })
            .select('displayOrder')
            .exec();

        return maxOrder ? maxOrder.displayOrder + 1 : 1;
    } catch (error : any) {
        LoggerUtil.error('Get next display order failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const Honor = mongoose.model<IHonor, IHonorModel>('Honor', HonorSchema);
export default Honor;