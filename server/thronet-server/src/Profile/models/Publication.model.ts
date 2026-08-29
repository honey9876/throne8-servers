/**
 * Publication Model - User Publications Management
 * Stores research papers, articles, books, conference papers
 * 
 * @module models/Publication.model
 * @version 1.0.0
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== INTERFACES ====================

export interface ICoAuthor {
    authorId?: string;  // LinkedIn member ID if tagged
    authorName: string;
    authorProfile?: string;  // LinkedIn profile URL
}

export interface IMediaAttachment {
    mediaId: string;
    mediaType: 'pdf' | 'image';
    mediaUrl: string;
    mediaSecureUrl?: string;
    mediaPublicId?: string;
    fileName: string;
    fileSize: number;
    uploadedAt: Date;
}

export interface IPublication extends Document {
    publicationId: string;
    userId: string;

    // Basic Info
    title: string;
    publisherName: string;
    publicationDate: {
        month: number;  // 1-12
        day?: number;   // 1-31
        year: number;
    };
    publicationUrl?: string;
    description?: string;  // Max 2000 chars

    // Authors
    authors: ICoAuthor[];  // Co-authors

    // Publication Type
    publicationType: 'article' | 'book' | 'paper' | 'conference_paper' | 'thesis';

    // Publisher Logo
    publisherLogo?: {
        logoUrl: string;
        logoPublicId: string;
        logoSecureUrl: string;
        uploadedAt: Date;
    };

    // Media Attachments
    mediaAttachments: IMediaAttachment[];

    // Citation Tracking
    citationCount: number;
    citationTracking?: {
        googleScholar?: number;
        researchGate?: number;
        pubmed?: number;
        lastUpdated: Date;
    };

    // Featured/Pinned (Top 3)
    isPinned: boolean;
    pinnedOrder?: number;  // 1, 2, or 3
    pinnedAt?: Date;

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

export interface IPublicationModel extends Model<IPublication> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<IPublication[]>;
    getUserPublicationCount(userId: string): Promise<number>;
    findActiveById(publicationId: string, userId: string): Promise<IPublication | null>;
    getPinnedPublications(userId: string): Promise<IPublication[]>;
    getNextDisplayOrder(userId: string): Promise<number>;
}

// ==================== SCHEMA ====================

const CoAuthorSchema = new Schema<ICoAuthor>({
    authorId: {
        type: String,
        trim: true,
    },
    authorName: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Author name must be at least 2 characters'],
        maxlength: [100, 'Author name cannot exceed 100 characters'],
    },
    authorProfile: {
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
        enum: ['pdf', 'image'],
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

const PublicationSchema = new Schema<IPublication, IPublicationModel>(
    {
        publicationId: {
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
            required: [true, 'Publication title is required'],
            trim: true,
            minlength: [5, 'Title must be at least 5 characters'],
            maxlength: [500, 'Title cannot exceed 500 characters'],
        },
        publisherName: {
            type: String,
            required: [true, 'Publisher name is required'],
            trim: true,
            minlength: [2, 'Publisher name must be at least 2 characters'],
            maxlength: [200, 'Publisher name cannot exceed 200 characters'],
        },
        publicationDate: {
            month: {
                type: Number,
                required: [true, 'Publication month is required'],
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
                required: [true, 'Publication year is required'],
                min: [1900, 'Year must be after 1900'],
                max: [new Date().getFullYear(), `Year cannot be in the future`],
            },
        },
        publicationUrl: {
            type: String,
            trim: true,
            validate: {
                validator: function (v: string) {
                    if (!v) return true;
                    return /^https?:\/\/.+/.test(v);
                },
                message: 'Publication URL must be a valid URL',
            },
        },
        description: {
            type: String,
            trim: true,
            maxlength: [2000, 'Description cannot exceed 2000 characters'],
        },

        // ==================== AUTHORS ====================
        authors: {
            type: [CoAuthorSchema],
            default: [],
            validate: {
                validator: function (v: ICoAuthor[]) {
                    return v.length <= 20;
                },
                message: 'Maximum 20 co-authors allowed',
            },
        },

        // ==================== PUBLICATION TYPE ====================
        publicationType: {
            type: String,
            required: [true, 'Publication type is required'],
            enum: ['article', 'book', 'paper', 'conference_paper', 'thesis'],
            lowercase: true,
        },

        // ==================== PUBLISHER LOGO ====================
        publisherLogo: {
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

        // ==================== CITATION TRACKING ====================
        citationCount: {
            type: Number,
            default: 0,
            min: [0, 'Citation count cannot be negative'],
        },
        citationTracking: {
            googleScholar: {
                type: Number,
                min: 0,
                default: 0,
            },
            researchGate: {
                type: Number,
                min: 0,
                default: 0,
            },
            pubmed: {
                type: Number,
                min: 0,
                default: 0,
            },
            lastUpdated: {
                type: Date,
                default: Date.now,
            },
        },

        // ==================== PINNED (TOP 3) ====================
        isPinned: {
            type: Boolean,
            default: false,
        },
        pinnedOrder: {
            type: Number,
            min: 1,
            max: 3,
            validate: {
                validator: function (this: IPublication, v: number | undefined) {
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
        collection: 'publications',
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

PublicationSchema.index({ userId: 1, isPinned: -1, displayOrder: 1 });
PublicationSchema.index({ userId: 1, publicationType: 1 });
PublicationSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
PublicationSchema.index({ userId: 1, citationCount: -1 });
PublicationSchema.index({ 'publicationDate.year': -1 });
PublicationSchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================

PublicationSchema.virtual('authorCount').get(function (this: IPublication) {
    return this.authors.length;
});

PublicationSchema.virtual('hasMedia').get(function (this: IPublication) {
    return this.mediaAttachments && this.mediaAttachments.length > 0;
});

PublicationSchema.virtual('formattedDate').get(function (this: IPublication) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[this.publicationDate.month - 1];
    const day = this.publicationDate.day ? `, ${this.publicationDate.day}` : '';
    return `${month}${day}, ${this.publicationDate.year}`;
});

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Update citation count
 */
PublicationSchema.pre('save', function (next) {
    if (this.citationTracking) {
        this.citationCount =
            (this.citationTracking.googleScholar || 0) +
            (this.citationTracking.researchGate || 0) +
            (this.citationTracking.pubmed || 0);
    }
    next();
});

/**
 * Pre-save: Validate pinned order uniqueness
 */
PublicationSchema.pre('save', async function (next) {
    if (this.isPinned && this.pinnedOrder) {
        const existing = await (this.constructor as IPublicationModel).findOne({
            userId: this.userId,
            isPinned: true,
            pinnedOrder: this.pinnedOrder,
            publicationId: { $ne: this.publicationId },
            isDeleted: false,
        });

        if (existing) {
            return next(new Error(`Pinned order ${this.pinnedOrder} is already taken by another publication`));
        }
    }
    next();
});

// ==================== STATIC METHODS ====================

/**
 * Find all publications by userId
 */
PublicationSchema.statics.findByUserId = async function (
    userId: string,
    includeArchived: boolean = false
): Promise<IPublication[]> {
    try {
        const query: any = { userId, isDeleted: false };

        if (!includeArchived) {
            query.isArchived = false;
        }

        return await this.find(query)
            .sort({ isPinned: -1, pinnedOrder: 1, displayOrder: 1 })
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Find publications by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get total publication count for user
 */
PublicationSchema.statics.getUserPublicationCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error : any) {
        LoggerUtil.error('Get publication count failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Find active publication by ID
 */
PublicationSchema.statics.findActiveById = async function (
    publicationId: string,
    userId: string
): Promise<IPublication | null> {
    try {
        return await this.findOne({
            publicationId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active publication by ID failed', {
            error: (error as Error).message,
            publicationId,
            userId,
        });
        throw error;
    }
};

/**
 * Get pinned publications (top 3)
 */
PublicationSchema.statics.getPinnedPublications = async function (userId: string): Promise<IPublication[]> {
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
        LoggerUtil.error('Get pinned publications failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get next display order
 */
PublicationSchema.statics.getNextDisplayOrder = async function (userId: string): Promise<number> {
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

const Publication = mongoose.model<IPublication, IPublicationModel>('Publication', PublicationSchema);
export default Publication;