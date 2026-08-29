import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

export interface IAbout extends Document {
    aboutId: string;
    userId: string;
    aboutText: string;
    characterCount: number;
    coverStory?: {
        videoUrl: string;
        videoPublicId: string;
        videoSecureUrl: string;
        duration: number;
        thumbnail?: string;
        fileSize: number;
        format: string;
        width?: number;
        height?: number;
        uploadedAt: Date;
    };
    namePronunciation?: {
        audioUrl: string;
        audioPublicId: string;
        audioSecureUrl: string;
        duration: number;
        fileSize: number;
        format: string;
        uploadedAt: Date;
    };
    textFormatting?: {
        bold?: Array<{ start: number; end: number }>;
        italic?: Array<{ start: number; end: number }>;
        underline?: Array<{ start: number; end: number }>;
    };
    mediaAttachments: Array<{
        mediaId: string;
        mediaType: 'image' | 'document' | 'link';
        mediaUrl: string;
        mediaSecureUrl?: string;
        mediaPublicId?: string;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
        caption?: string;
        uploadedAt: Date;
    }>;
    isExpanded: boolean;
    lastEditedAt: Date;
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAboutModel extends Model<IAbout> {
    findByUserId(userId: string): Promise<IAbout | null>;
    findActiveById(aboutId: string, userId: string): Promise<IAbout | null>;
}

const AboutSchema = new Schema<IAbout, IAboutModel>(
    {
        aboutId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            immutable: true,
        },
        userId: {
            type: String,
            required: [true, 'User ID is required'],
            unique: true,
            validate: {
                validator: (v: string) =>
                    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid User ID format',
            },
        },
        aboutText: {
            type: String,
            required: [true, 'About text is required'],
            trim: true,
            minlength: [50, 'About text must be at least 50 characters'],
            maxlength: [2600, 'About text cannot exceed 2600 characters'],
            validate: {
                validator: (v: string) => /^[A-Z]/.test(v),
                message: 'About text must start with a capital letter',
            },
        },
        characterCount: {
            type: Number,
            required: true,
            min: [50, 'Character count must be at least 50'],
            max: [2600, 'Character count cannot exceed 2600'],
        },
        coverStory: {
            videoUrl: { type: String, trim: true },
            videoPublicId: { type: String, trim: true },
            videoSecureUrl: { type: String, trim: true },
            duration: { type: Number, min: 1, max: 120 },
            thumbnail: { type: String, trim: true },
            fileSize: { type: Number, min: 0 },
            format: { type: String, enum: ['mp4', 'webm', 'mov', 'avi', 'mpeg'] },
            width: Number,
            height: Number,
            uploadedAt: { type: Date, default: Date.now },
        },
        namePronunciation: {
            audioUrl: { type: String, trim: true },
            audioPublicId: { type: String, trim: true },
            audioSecureUrl: { type: String, trim: true },
            duration: { type: Number, min: 1, max: 30 },
            fileSize: { type: Number, min: 0 },
            format: { type: String, enum: ['mp3', 'wav', 'ogg', 'm4a'] },
            uploadedAt: { type: Date, default: Date.now },
        },
        textFormatting: {
            bold: [{ start: { type: Number, min: 0 }, end: { type: Number, min: 0 }, _id: false }],
            italic: [{ start: { type: Number, min: 0 }, end: { type: Number, min: 0 }, _id: false }],
            underline: [{ start: { type: Number, min: 0 }, end: { type: Number, min: 0 }, _id: false }],
        },
        mediaAttachments: [
            {
                mediaId: { type: String, default: () => uuidv4() },
                mediaType: { type: String, enum: ['image', 'document', 'link'], required: true },
                mediaUrl: { type: String, required: true, trim: true },
                mediaSecureUrl: { type: String, trim: true },
                mediaPublicId: { type: String, trim: true },
                fileName: { type: String, trim: true },
                fileSize: { type: Number, min: 0 },
                mimeType: { type: String, trim: true },
                caption: { type: String, trim: true, maxlength: 500 },
                uploadedAt: { type: Date, default: Date.now },
            },
        ],
        isExpanded: { type: Boolean, default: false },
        lastEditedAt: { type: Date, default: Date.now },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        isArchived: { type: Boolean, default: false },
        archivedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        collection: 'abouts',
        toJSON: {
            virtuals: true,
            transform: (_doc, ret: Record<string, unknown>) => {
                delete ret.__v;
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);

AboutSchema.index({ userId: 1, isDeleted: 1 });
AboutSchema.index({ aboutId: 1, userId: 1 });
AboutSchema.index({ createdAt: -1 });

AboutSchema.virtual('hasVideo').get(function (this: IAbout) {
    return !!(this.coverStory?.videoUrl);
});

AboutSchema.virtual('hasAudio').get(function (this: IAbout) {
    return !!(this.namePronunciation?.audioUrl);
});

AboutSchema.virtual('hasMedia').get(function (this: IAbout) {
    return this.mediaAttachments?.length > 0;
});

AboutSchema.virtual('mediaCount').get(function (this: IAbout) {
    return this.mediaAttachments?.length ?? 0;
});

AboutSchema.pre('save', function (next) {
    this.characterCount = this.aboutText.length;
    this.lastEditedAt = new Date();
    if (!/^[A-Z]/.test(this.aboutText)) {
        return next(new Error('About text must start with a capital letter'));
    }
    next();
});

AboutSchema.pre('save', function (next) {
    if (this.textFormatting) {
        const textLength = this.aboutText.length;
        const valid = (positions?: Array<{ start: number; end: number }>) =>
            !positions || positions.every((p) => p.start >= 0 && p.end <= textLength && p.start < p.end);

        if (!valid(this.textFormatting.bold) ||
            !valid(this.textFormatting.italic) ||
            !valid(this.textFormatting.underline)) {
            return next(new Error('Invalid text formatting positions'));
        }
    }
    next();
});

AboutSchema.statics.findByUserId = async function (userId: string): Promise<IAbout | null> {
    try {
        return await this.findOne({ userId, isDeleted: false }).exec();
    } catch (error: unknown) {
        LoggerUtil.error('Find about by userId failed', { error: (error as Error).message, userId });
        throw error;
    }
};

AboutSchema.statics.findActiveById = async function (
    aboutId: string,
    userId: string
): Promise<IAbout | null> {
    try {
        return await this.findOne({ aboutId, userId, isDeleted: false }).exec();
    } catch (error: unknown) {
        LoggerUtil.error('Find active about by ID failed', {
            error: (error as Error).message,
            aboutId,
            userId,
        });
        throw error;
    }
};

const About = mongoose.model<IAbout, IAboutModel>('About', AboutSchema);
export default About;