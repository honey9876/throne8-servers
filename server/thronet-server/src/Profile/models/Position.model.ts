/**
 * Position Model - User Work Experience Positions
 * Stores job positions, employment history
 * 
 * @module models/Position.model
 * @version 1.0.0
 */

import { LoggerUtil } from '@/shared/logger.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

export interface IPosition extends Document {
    positionId: string;
    userId: string;

    // Basic Info (Features 16-19)
    jobTitle: string;
    employmentType: 'full-time' | 'part-time' | 'contract' | 'freelance' | 'internship' | 'self-employed' | 'seasonal' | 'temporary';
    companyName: string;
    location?: string;
    locationType: 'on-site' | 'remote' | 'hybrid';

    // Dates (Features 21-22)
    startDate: Date;
    endDate?: Date;
    currentlyWorking: boolean;

    // Additional Details (Features 23-24)
    industry?: string;
    description?: string;

    // Settings (Features 25-27)
    updateProfileHeadline: boolean;
    notifyNetwork: boolean;
    companyLogo?: {
        url: string;
        publicId?: string;
    };

    // Media Attachments (Feature 28)
    mediaAttachments?: {
        type: 'image' | 'video' | 'document' | 'link';
        url: string;
        publicId?: string;
        fileName?: string;
        fileSize?: number;
        title?: string;
        description?: string;
        uploadedAt: Date;
    }[];

    // Skills (Feature 29)
    skillIds?: string[];

    // Display & Organization (Feature 34)
    displayOrder: number;

    // Auto-calculated Fields (Features 35-36)
    durationMonths: number;  // Auto-calculated
    durationYears: number;   // Auto-calculated
    hasEmploymentGap?: boolean;
    gapDurationMonths?: number;

    // Metadata
    createdAt: Date;
    updatedAt: Date;

    // Soft Delete / Archive (Features 31-33)
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;

    // Virtuals
    duration: string;
    formattedDates: string;
}

export interface IPositionModel extends Model<IPosition> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<IPosition[]>;
    getUserPositionCount(userId: string): Promise<number>;
    findActiveById(positionId: string, userId: string): Promise<IPosition | null>;
    reorderPositions(userId: string, positionIds: string[]): Promise<void>;
    calculateTotalExperience(userId: string): Promise<{ years: number; months: number }>;
    detectEmploymentGaps(userId: string): Promise<any[]>;
    getCurrentPosition(userId: string): Promise<IPosition | null>;
}

// ==================== SCHEMA ====================

const PositionSchema = new Schema<IPosition, IPositionModel>(
    {
        positionId: {
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
        jobTitle: {
            type: String,
            required: [true, 'Job title is required'],
            trim: true,
            minlength: [2, 'Job title must be at least 2 characters'],
            maxlength: [100, 'Job title cannot exceed 100 characters'],
        },
        employmentType: {
            type: String,
            required: [true, 'Employment type is required'],
            enum: ['full-time', 'part-time', 'contract', 'freelance', 'internship', 'self-employed', 'seasonal', 'temporary'],
            lowercase: true,
        },
        companyName: {
            type: String,
            required: [true, 'Company name is required'],
            trim: true,
            minlength: [2, 'Company name must be at least 2 characters'],
            maxlength: [150, 'Company name cannot exceed 150 characters'],
        },
        location: {
            type: String,
            trim: true,
            maxlength: [100, 'Location cannot exceed 100 characters'],
        },
        locationType: {
            type: String,
            required: [true, 'Location type is required'],
            enum: ['on-site', 'remote', 'hybrid'],
            lowercase: true,
        },

        // ==================== DATES ====================
        startDate: {
            type: Date,
            required: [true, 'Start date is required'],
        },
        endDate: {
            type: Date,
            default: null,
        },
        currentlyWorking: {
            type: Boolean,
            default: false,
        },

        // ==================== ADDITIONAL DETAILS ====================
        industry: {
            type: String,
            trim: true,
            maxlength: [100, 'Industry cannot exceed 100 characters'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [2000, 'Description cannot exceed 2000 characters'],
        },

        // ==================== SETTINGS ====================
        updateProfileHeadline: {
            type: Boolean,
            default: false,
        },
        notifyNetwork: {
            type: Boolean,
            default: true,
        },
        companyLogo: {
            url: String,
            publicId: String,
        },

        // ==================== MEDIA ATTACHMENTS ====================
        mediaAttachments: [{
            type: {
                type: String,
                enum: ['image', 'video', 'document', 'link'],
                required: true,
            },
            url: {
                type: String,
                required: true,
            },
            publicId: String,
            fileName: String,
            fileSize: Number,
            title: {
                type: String,
                maxlength: 200,
            },
            description: {
                type: String,
                maxlength: 500,
            },
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
        }],

        // ==================== SKILLS ====================
        skillIds: {
            type: [String],
            default: [],
            validate: {
                validator: (v: string[]) => v.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
                message: 'Invalid Skill ID format',
            },
        },

        // ==================== DISPLAY ORDER ====================
        displayOrder: {
            type: Number,
            default: 0,
        },

        // ==================== AUTO-CALCULATED FIELDS ====================
        durationMonths: {
            type: Number,
            default: 0,
        },
        durationYears: {
            type: Number,
            default: 0,
        },
        hasEmploymentGap: {
            type: Boolean,
            default: false,
        },
        gapDurationMonths: {
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
        collection: 'positions',
        toJSON: {
            virtuals: true,
            transform: function (_doc, ret: any) {
                delete ret.__v;
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);

// ==================== INDEXES ====================

PositionSchema.index({ userId: 1, displayOrder: 1 });
PositionSchema.index({ userId: 1, startDate: -1 });
PositionSchema.index({ userId: 1, currentlyWorking: 1 });
PositionSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
PositionSchema.index({ userId: 1, companyName: 1 });
PositionSchema.index({ userId: 1, employmentType: 1 });

// ==================== VIRTUALS ====================

PositionSchema.virtual('duration').get(function (this: IPosition) {
    const start = new Date(this.startDate);
    const end = this.endDate ? new Date(this.endDate) : new Date();

    const diffMs = end.getTime() - start.getTime();
    const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));

    const years = Math.floor(diffMonths / 12);
    const months = diffMonths % 12;

    if (years === 0) return months === 1 ? '1 month' : `${months} months`;
    if (months === 0) return years === 1 ? '1 year' : `${years} years`;

    return `${years} year${years > 1 ? 's' : ''} ${months} month${months > 1 ? 's' : ''}`;
});

PositionSchema.virtual('formattedDates').get(function (this: IPosition) {
    const startMonth = this.startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const endMonth = this.endDate
        ? this.endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : 'Present';

    return `${startMonth} - ${endMonth}`;
});

// ==================== MIDDLEWARE ====================

PositionSchema.pre('save', function (next) {
    // Auto-set currentlyWorking based on endDate
    this.currentlyWorking = !this.endDate;

    // Calculate duration
    const start = new Date(this.startDate);
    const end = this.endDate ? new Date(this.endDate) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));

    this.durationMonths = diffMonths;
    this.durationYears = Math.floor(diffMonths / 12);

    next();
});

PositionSchema.pre('save', function (next) {
    if (this.endDate && this.startDate && this.endDate < this.startDate) {
        return next(new Error('End date must be after start date'));
    }
    next();
});

// ==================== STATIC METHODS ====================

PositionSchema.statics.findByUserId = async function (userId: string, includeArchived: boolean = false): Promise<IPosition[]> {
    const query: any = { userId, isDeleted: false };
    if (!includeArchived) query.isArchived = false;

    return await this.find(query).sort({ displayOrder: 1, startDate: -1 }).exec();
};

PositionSchema.statics.getUserPositionCount = async function (userId: string): Promise<number> {
    return await this.countDocuments({ userId, isDeleted: false });
};

PositionSchema.statics.findActiveById = async function (positionId: string, userId: string): Promise<IPosition | null> {
    return await this.findOne({ positionId, userId, isDeleted: false }).exec();
};

PositionSchema.statics.reorderPositions = async function (userId: string, positionIds: string[]): Promise<void> {
    const bulk = positionIds.map((id, index) => ({
        updateOne: {
            filter: { positionId: id, userId },
            update: { $set: { displayOrder: index } },
        },
    }));

    await this.bulkWrite(bulk);
    LoggerUtil.info('Positions reordered', { userId, count: positionIds.length });
};

PositionSchema.statics.calculateTotalExperience = async function (userId: string): Promise<{ years: number; months: number }> {
    const positions = await this.find({ userId, isDeleted: false }).sort({ startDate: 1 });

    let totalMonths = 0;

    for (const position of positions) {
        totalMonths += position.durationMonths || 0;
    }

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;

    LoggerUtil.info('Total experience calculated', { userId, years, months });

    return { years, months };
};

PositionSchema.statics.detectEmploymentGaps = async function (userId: string): Promise<any[]> {
    const positions = await this.find({ userId, isDeleted: false }).sort({ startDate: 1 });

    const gaps: any[] = [];

    for (let i = 0; i < positions.length - 1; i++) {
        const currentEndDate = positions[i].endDate || new Date();
        const nextStartDate = positions[i + 1].startDate;

        const gapMs = nextStartDate.getTime() - currentEndDate.getTime();
        const gapMonths = Math.floor(gapMs / (1000 * 60 * 60 * 24 * 30));

        if (gapMonths > 1) {
            gaps.push({
                afterPosition: positions[i].positionId,
                beforePosition: positions[i + 1].positionId,
                gapStartDate: currentEndDate,
                gapEndDate: nextStartDate,
                gapMonths,
                gapYears: Math.floor(gapMonths / 12),
            });
        }
    }

    LoggerUtil.info('Employment gaps detected', { userId, gapsCount: gaps.length });

    return gaps;
};

PositionSchema.statics.getCurrentPosition = async function (userId: string): Promise<IPosition | null> {
    return await this.findOne({ userId, currentlyWorking: true, isDeleted: false }).exec();
};

// ==================== EXPORT ====================

const Position = mongoose.model<IPosition, IPositionModel>('Position', PositionSchema);
export default Position;