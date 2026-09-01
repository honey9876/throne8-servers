/**
 * About Model - User About Section with Rich Features
 * Stores about text, video intro, media attachments, text formatting
 * 
 * @module models/About.model
 * @version 2.0.0
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== INTERFACES ====================

export interface IAbout extends Document {
    aboutId: string;
    userId: string;

    // Content
    aboutText: string;              // Main about text (max 2600 chars)
    characterCount: number;         // Current character count

    // Video Introduction (Cover Story)
    coverStory?: {
        videoUrl: string;           // Cloudinary video URL
        videoPublicId: string;      // Cloudinary public ID
        videoSecureUrl: string;     // HTTPS video URL
        duration: number;           // Video duration in seconds
        thumbnail?: string;         // Video thumbnail URL
        fileSize: number;           // File size in bytes
        format: string;             // Video format (mp4, webm, etc.)
        width?: number;             // Video width
        height?: number;            // Video height
        uploadedAt: Date;
    };

    // Name Pronunciation Audio
    namePronunciation?: {
        audioUrl: string;           // Cloudinary audio URL
        audioPublicId: string;      // Cloudinary public ID
        audioSecureUrl: string;     // HTTPS audio URL
        duration: number;           // Audio duration in seconds
        fileSize: number;           // File size in bytes
        format: string;             // Audio format
        uploadedAt: Date;
    };

    // Text Formatting
    textFormatting?: {
        bold?: Array<{ start: number; end: number }>;
        italic?: Array<{ start: number; end: number }>;
        underline?: Array<{ start: number; end: number }>;
    };

    // Media Attachments (Images, Documents, Links)
    mediaAttachments: Array<{
        mediaId: string;
        mediaType: 'image' | 'document' | 'link';
        mediaUrl: string;
        mediaSecureUrl?: string;
        mediaPublicId?: string;     // For Cloudinary media
        fileName?: string;          // Original file name
        fileSize?: number;          // File size in bytes
        mimeType?: string;          // MIME type
        caption?: string;
        uploadedAt: Date;
    }>;

    // See More/Less Toggle
    isExpanded: boolean;            // User preference for expanded view

    // Metadata
    createdAt: Date;
    updatedAt: Date;
    lastEditedAt: Date;

    // Soft Delete / Archive
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;
}

export interface IAboutModel extends Model<IAbout> {
    findByUserId(userId: string): Promise<IAbout | null>;
    findActiveById(aboutId: string, userId: string): Promise<IAbout | null>;
}

// ==================== SCHEMA ====================

const AboutSchema = new Schema<IAbout, IAboutModel>(
    {
        aboutId: {
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
            // index: true,
            unique: true, // One about per user
            validate: {
                validator: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid User ID format',
            },
        },

        // ==================== CONTENT ====================
        aboutText: {
            type: String,
            required: [true, 'About text is required'],
            trim: true,
            minlength: [50, 'About text must be at least 50 characters'],
            maxlength: [2600, 'About text cannot exceed 2600 characters'],
            validate: {
                validator: function (v: string) {
                    // First letter must be capital
                    return /^[A-Z]/.test(v);
                },
                message: 'About text must start with a capital letter',
            },
        },
        characterCount: {
            type: Number,
            required: true,
            min: [50, 'Character count must be at least 50'],
            max: [2600, 'Character count cannot exceed 2600'],
        },

        // ==================== VIDEO INTRODUCTION (COVER STORY) ====================
        coverStory: {
            videoUrl: {
                type: String,
                trim: true,
            },
            videoPublicId: {
                type: String,
                trim: true,
            },
            videoSecureUrl: {
                type: String,
                trim: true,
            },
            duration: {
                type: Number,
                min: [1, 'Video duration must be at least 1 second'],
                max: [120, 'Video duration cannot exceed 120 seconds'],
            },
            thumbnail: {
                type: String,
                trim: true,
            },
            fileSize: {
                type: Number,
                min: [0, 'File size cannot be negative'],
            },
            format: {
                type: String,
                enum: ['mp4', 'webm', 'mov', 'avi', 'mpeg'],
            },
            width: {
                type: Number,
            },
            height: {
                type: Number,
            },
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
        },

        // ==================== NAME PRONUNCIATION ====================
        namePronunciation: {
            audioUrl: {
                type: String,
                trim: true,
            },
            audioPublicId: {
                type: String,
                trim: true,
            },
            audioSecureUrl: {
                type: String,
                trim: true,
            },
            duration: {
                type: Number,
                min: [1, 'Audio duration must be at least 1 second'],
                max: [30, 'Audio duration cannot exceed 30 seconds'],
            },
            fileSize: {
                type: Number,
                min: [0, 'File size cannot be negative'],
            },
            format: {
                type: String,
                enum: ['mp3', 'wav', 'ogg', 'm4a'],
            },
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
        },

        // ==================== TEXT FORMATTING ====================
        textFormatting: {
            bold: [{
                start: { type: Number, min: 0 },
                end: { type: Number, min: 0 },
                _id: false,
            }],
            italic: [{
                start: { type: Number, min: 0 },
                end: { type: Number, min: 0 },
                _id: false,
            }],
            underline: [{
                start: { type: Number, min: 0 },
                end: { type: Number, min: 0 },
                _id: false,
            }],
        },

        // ==================== MEDIA ATTACHMENTS ====================
        mediaAttachments: [{
            mediaId: {
                type: String,
                default: () => uuidv4(),
            },
            mediaType: {
                type: String,
                enum: ['image', 'document', 'link'],
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
                trim: true,
            },
            fileSize: {
                type: Number,
                min: [0, 'File size cannot be negative'],
            },
            mimeType: {
                type: String,
                trim: true,
            },
            caption: {
                type: String,
                trim: true,
                maxlength: [500, 'Caption cannot exceed 500 characters'],
            },
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
        }],

        // ==================== UI PREFERENCES ====================
        isExpanded: {
            type: Boolean,
            default: false,
        },

        // ==================== METADATA ====================
        lastEditedAt: {
            type: Date,
            default: Date.now,
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
    },
    {
        timestamps: true,
        collection: 'abouts',
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

AboutSchema.index({ userId: 1, isDeleted: 1 });
AboutSchema.index({ aboutId: 1, userId: 1 });
AboutSchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================

/**
 * Check if about has video
 */
AboutSchema.virtual('hasVideo').get(function (this: IAbout) {
    return !!(this.coverStory && this.coverStory.videoUrl);
});

/**
 * Check if about has audio
 */
AboutSchema.virtual('hasAudio').get(function (this: IAbout) {
    return !!(this.namePronunciation && this.namePronunciation.audioUrl);
});

/**
 * Check if about has media attachments
 */
AboutSchema.virtual('hasMedia').get(function (this: IAbout) {
    return this.mediaAttachments && this.mediaAttachments.length > 0;
});

/**
 * Get total media count
 */
AboutSchema.virtual('mediaCount').get(function (this: IAbout) {
    return this.mediaAttachments ? this.mediaAttachments.length : 0;
});

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Update character count and validate text
 */
AboutSchema.pre('save', function (next) {
    this.characterCount = this.aboutText.length;
    this.lastEditedAt = new Date();

    // Validate first letter is capital
    if (!/^[A-Z]/.test(this.aboutText)) {
        return next(new Error('About text must start with a capital letter'));
    }

    next();
});

/**
 * Pre-save: Validate text formatting positions
 */
AboutSchema.pre('save', function (next) {
    if (this.textFormatting) {
        const textLength = this.aboutText.length;

        const validatePositions = (positions?: Array<{ start: number; end: number }>) => {
            if (!positions) return true;
            return positions.every(p => {
                return p.start >= 0 && p.end <= textLength && p.start < p.end;
            });
        };

        if (!validatePositions(this.textFormatting.bold) ||
            !validatePositions(this.textFormatting.italic) ||
            !validatePositions(this.textFormatting.underline)) {
            return next(new Error('Invalid text formatting positions'));
        }
    }

    next();
});

// ==================== STATIC METHODS ====================

/**
 * Find about by userId
 */
AboutSchema.statics.findByUserId = async function (userId: string): Promise<IAbout | null> {
    try {
        return await this.findOne({ userId, isDeleted: false }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find about by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Find active about by ID
 */
AboutSchema.statics.findActiveById = async function (aboutId: string, userId: string): Promise<IAbout | null> {
    try {
        return await this.findOne({
            aboutId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active about by ID failed', {
            error: (error as Error).message,
            aboutId,
            userId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const About = mongoose.model<IAbout, IAboutModel>('About', AboutSchema);
export default About;