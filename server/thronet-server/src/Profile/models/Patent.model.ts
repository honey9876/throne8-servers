/**
 * Patent Model - User Patents Management
 * Stores patent information, inventors, status tracking
 * 
 * @module models/Patent.model
 * @version 1.0.0
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== INTERFACES ====================

export interface IInventor {
    inventorId?: string;  // LinkedIn member ID if tagged
    inventorName: string;
    inventorProfile?: string;  // LinkedIn profile URL
}

export interface IMediaAttachment {
    mediaId: string;
    mediaType: 'document';  // Patent documents only
    mediaUrl: string;
    mediaSecureUrl?: string;
    mediaPublicId?: string;
    fileName: string;
    fileSize: number;
    uploadedAt: Date;
}

export interface IPatent extends Document {
    patentId: string;
    userId: string;

    // Basic Info
    title: string;
    patentNumber: string;  // Unique patent identifier
    patentOffice: string;  // USPTO, EPO, WIPO, etc.

    // Issue Date
    issueDate: {
        month: number;  // 1-12
        day?: number;   // 1-31
        year: number;
    };

    // Inventors
    inventors: IInventor[];

    // Patent Status
    patentStatus: 'pending' | 'granted' | 'expired' | 'abandoned';

    // Description
    description?: string;  // Max 1000 chars

    // Patent URL
    patentUrl?: string;

    // Media Attachments
    mediaAttachments: IMediaAttachment[];

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

export interface IPatentModel extends Model<IPatent> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<IPatent[]>;
    getUserPatentCount(userId: string): Promise<number>;
    findActiveById(patentId: string, userId: string): Promise<IPatent | null>;
    findByPatentNumber(patentNumber: string, userId: string): Promise<IPatent | null>;
    getNextDisplayOrder(userId: string): Promise<number>;
}

// ==================== SCHEMA ====================

const InventorSchema = new Schema<IInventor>({
    inventorId: {
        type: String,
        trim: true,
    },
    inventorName: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Inventor name must be at least 2 characters'],
        maxlength: [100, 'Inventor name cannot exceed 100 characters'],
    },
    inventorProfile: {
        type: String,
        trim: true,
    },
}, { _id: false });

const MediaAttachmentSchema = new Schema<IMediaAttachment>({
    mediaId: {
        type: String,
        default: () => uuidv4(),
    },
    mediaType: {
        type: String,
        enum: ['document'],
        default: 'document',
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

const PatentSchema = new Schema<IPatent, IPatentModel>(
    {
        patentId: {
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
            required: [true, 'Patent title is required'],
            trim: true,
            minlength: [5, 'Title must be at least 5 characters'],
            maxlength: [500, 'Title cannot exceed 500 characters'],
        },
        patentNumber: {
            type: String,
            required: [true, 'Patent number is required'],
            trim: true,
            uppercase: true,
            minlength: [3, 'Patent number must be at least 3 characters'],
            maxlength: [50, 'Patent number cannot exceed 50 characters'],
        },
        patentOffice: {
            type: String,
            required: [true, 'Patent office is required'],
            trim: true,
            uppercase: true,
            enum: {
                values: ['USPTO', 'EPO', 'WIPO', 'JPO', 'KIPO', 'CNIPA', 'IPO', 'CIPO', 'IP_AUSTRALIA', 'OTHER'],
                message: 'Invalid patent office',
            },
        },

        // ==================== ISSUE DATE ====================
        issueDate: {
            month: {
                type: Number,
                required: [true, 'Issue month is required'],
                min: [1, 'Month must be between 1 and 12'],
                max: [12, 'Month must be between 1 and 12'],
            },
            day: {
                type: Number,
                min: [1, 'Day must be between 1 and 31'],
                max: [31, 'Day must be between 1 and 31'],
            },
            year: {
                type: Number,
                required: [true, 'Issue year is required'],
                min: [1900, 'Year must be after 1900'],
                max: [new Date().getFullYear() + 1, 'Year cannot be too far in the future'],
            },
        },

        // ==================== INVENTORS ====================
        inventors: {
            type: [InventorSchema],
            required: [true, 'At least one inventor is required'],
            validate: {
                validator: function (v: IInventor[]) {
                    return v.length > 0 && v.length <= 50;
                },
                message: 'Must have at least 1 inventor and maximum 50 inventors',
            },
        },

        // ==================== PATENT STATUS ====================
        patentStatus: {
            type: String,
            required: [true, 'Patent status is required'],
            enum: ['pending', 'granted', 'expired', 'abandoned'],
            lowercase: true,
            default: 'pending',
        },

        // ==================== DESCRIPTION ====================
        description: {
            type: String,
            trim: true,
            maxlength: [1000, 'Description cannot exceed 1000 characters'],
        },

        // ==================== PATENT URL ====================
        patentUrl: {
            type: String,
            trim: true,
            validate: {
                validator: function (v: string) {
                    if (!v) return true;
                    return /^https?:\/\/.+/.test(v);
                },
                message: 'Patent URL must be a valid URL',
            },
        },

        // ==================== MEDIA ATTACHMENTS ====================
        mediaAttachments: {
            type: [MediaAttachmentSchema],
            default: [],
            validate: {
                validator: function (v: IMediaAttachment[]) {
                    return v.length <= 5;
                },
                message: 'Maximum 5 media attachments allowed',
            },
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
        collection: 'patents',
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

PatentSchema.index({ userId: 1, displayOrder: 1 });
PatentSchema.index({ userId: 1, patentStatus: 1 });
PatentSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
PatentSchema.index({ userId: 1, patentNumber: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
PatentSchema.index({ 'issueDate.year': -1 });
PatentSchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================

PatentSchema.virtual('inventorCount').get(function (this: IPatent) {
    return this.inventors.length;
});

PatentSchema.virtual('hasMedia').get(function (this: IPatent) {
    return this.mediaAttachments && this.mediaAttachments.length > 0;
});

PatentSchema.virtual('formattedIssueDate').get(function (this: IPatent) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[this.issueDate.month - 1];
    const day = this.issueDate.day ? `, ${this.issueDate.day}` : '';
    return `${month}${day}, ${this.issueDate.year}`;
});

PatentSchema.virtual('isActive').get(function (this: IPatent) {
    return this.patentStatus === 'granted';
});

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Validate patent number uniqueness per user
 */
PatentSchema.pre('save', async function (next) {
    if (this.isModified('patentNumber')) {
        const existing = await (this.constructor as IPatentModel).findOne({
            userId: this.userId,
            patentNumber: this.patentNumber,
            patentId: { $ne: this.patentId },
            isDeleted: false,
        });

        if (existing) {
            return next(new Error('Patent number already exists for this user'));
        }
    }
    next();
});

// ==================== STATIC METHODS ====================

/**
 * Find all patents by userId
 */
PatentSchema.statics.findByUserId = async function (
    userId: string,
    includeArchived: boolean = false
): Promise<IPatent[]> {
    try {
        const query: any = { userId, isDeleted: false };

        if (!includeArchived) {
            query.isArchived = false;
        }

        return await this.find(query)
            .sort({ displayOrder: 1 })
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Find patents by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get total patent count for user
 */
PatentSchema.statics.getUserPatentCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error : any) {
        LoggerUtil.error('Get patent count failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Find active patent by ID
 */
PatentSchema.statics.findActiveById = async function (
    patentId: string,
    userId: string
): Promise<IPatent | null> {
    try {
        return await this.findOne({
            patentId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active patent by ID failed', {
            error: (error as Error).message,
            patentId,
            userId,
        });
        throw error;
    }
};

/**
 * Find patent by patent number
 */
PatentSchema.statics.findByPatentNumber = async function (
    patentNumber: string,
    userId: string
): Promise<IPatent | null> {
    try {
        return await this.findOne({
            patentNumber: patentNumber.toUpperCase(),
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find patent by number failed', {
            error: (error as Error).message,
            patentNumber,
            userId,
        });
        throw error;
    }
};

/**
 * Get next display order
 */
PatentSchema.statics.getNextDisplayOrder = async function (userId: string): Promise<number> {
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

const Patent = mongoose.model<IPatent, IPatentModel>('Patent', PatentSchema);
export default Patent;