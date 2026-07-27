/**
 * Career Break Model - User Career Break History
 * Stores career gaps with reasons and privacy controls
 * 
 * @module models/CareerBreak.model
 * @version 1.0.0
 */

import { LoggerUtil } from '@/shared/logger.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

export interface ICareerBreak extends Document {
    careerBreakId: string;
    userId: string;

    // Basic Info
    breakType: 'Caregiving' | 'Personal travel' | 'Career transition' | 'Layoff' |
    'Full-time parenting' | 'Sabbatical' | 'Health & well-being' |
    'Bereavement' | 'Gap year' | 'Relocation' | 'Retirement' |
    'Volunteer work' | 'Other';

    // Dates
    startDate: Date;
    endDate?: Date;
    isOngoing: boolean;

    // Optional Details
    description?: string;

    // Display & Privacy
    displayOnProfile: boolean;
    notifyNetwork: boolean;
    visibility: 'public' | 'connections' | 'private' | 'me_only';

    // Metadata
    createdAt: Date;
    updatedAt: Date;

    // Soft Delete / Archive
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;

    // Virtuals
    duration: string;
}

export interface ICareerBreakModel extends Model<ICareerBreak> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<ICareerBreak[]>;
    getUserCareerBreakCount(userId: string): Promise<number>;
    findActiveById(careerBreakId: string, userId: string): Promise<ICareerBreak | null>;
}

// ==================== SCHEMA ====================

const CareerBreakSchema = new Schema<ICareerBreak, ICareerBreakModel>(
    {
        careerBreakId: {
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
        breakType: {
            type: String,
            required: [true, 'Break type is required'],
            enum: [
                'Caregiving',
                'Personal travel',
                'Career transition',
                'Layoff',
                'Full-time parenting',
                'Sabbatical',
                'Health & well-being',
                'Bereavement',
                'Gap year',
                'Relocation',
                'Retirement',
                'Volunteer work',
                'Other'
            ],
        },

        // ==================== DATES ====================
        startDate: {
            type: Date,
            required: [true, 'Start date is required'],
            validate: {
                validator: function (v: Date) {
                    const year = v.getFullYear();
                    return year >= 1970 && year <= new Date().getFullYear() + 1;
                },
                message: 'Start date must be between 1970 and current year + 1',
            },
        },
        endDate: {
            type: Date,
            default: null,
            validate: {
                validator: function (this: ICareerBreak, v: Date | null | undefined) {
                    if (!v) return true;

                    if (this.startDate && v < this.startDate) {
                        return false;
                    }

                    const year = v.getFullYear();
                    return year >= 1970 && year <= new Date().getFullYear() + 1;
                },
                message: 'End date must be after start date',
            },
        },
        isOngoing: {
            type: Boolean,
            default: function (this: ICareerBreak) {
                return !this.endDate;
            },
        },

        // ==================== OPTIONAL DETAILS ====================
        description: {
            type: String,
            trim: true,
            minlength: [10, 'Description must be at least 10 characters'],
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },

        // ==================== DISPLAY & PRIVACY ====================
        displayOnProfile: {
            type: Boolean,
            default: true,
        },
        notifyNetwork: {
            type: Boolean,
            default: false,
        },
        visibility: {
            type: String,
            enum: ['public', 'connections', 'private', 'me_only'],
            default: 'connections',
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
        collection: 'career_breaks',
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

CareerBreakSchema.index({ userId: 1, startDate: -1 });
CareerBreakSchema.index({ userId: 1, isOngoing: 1 });
CareerBreakSchema.index({ userId: 1, breakType: 1 });
CareerBreakSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
CareerBreakSchema.index({ userId: 1, displayOnProfile: 1 });
CareerBreakSchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================

CareerBreakSchema.virtual('duration').get(function (this: ICareerBreak) {
    const start = new Date(this.startDate);
    const end = this.endDate ? new Date(this.endDate) : new Date();

    const diffMs = end.getTime() - start.getTime();
    const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));

    const years = Math.floor(diffMonths / 12);
    const months = diffMonths % 12;

    if (years === 0) {
        return months === 1 ? '1 month' : `${months} months`;
    } else if (months === 0) {
        return years === 1 ? '1 year' : `${years} years`;
    } else {
        const yearText = years === 1 ? '1 year' : `${years} years`;
        const monthText = months === 1 ? '1 month' : `${months} months`;
        return `${yearText} ${monthText}`;
    }
});

// ==================== MIDDLEWARE ====================

CareerBreakSchema.pre('save', function (next) {
    this.isOngoing = !this.endDate;
    next();
});

CareerBreakSchema.pre('save', function (next) {
    if (this.endDate && this.startDate && this.endDate < this.startDate) {
        return next(new Error('End date must be after start date'));
    }

    if (this.endDate && this.startDate) {
        const diffMs = this.endDate.getTime() - this.startDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffDays < 1) {
            return next(new Error('Minimum career break duration is 1 day'));
        }
    }

    next();
});

// ==================== STATIC METHODS ====================

CareerBreakSchema.statics.findByUserId = async function (userId: string, includeArchived: boolean = false): Promise<ICareerBreak[]> {
    try {
        const query: any = { userId, isDeleted: false };

        if (!includeArchived) {
            query.isArchived = false;
        }

        return await this.find(query)
            .sort({ startDate: -1 })
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Find career breaks by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

CareerBreakSchema.statics.getUserCareerBreakCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error : any) {
        LoggerUtil.error('Get career break count failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

CareerBreakSchema.statics.findActiveById = async function (careerBreakId: string, userId: string): Promise<ICareerBreak | null> {
    try {
        return await this.findOne({
            careerBreakId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active career break by ID failed', {
            error: (error as Error).message,
            careerBreakId,
            userId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const CareerBreak = mongoose.model<ICareerBreak, ICareerBreakModel>('CareerBreak', CareerBreakSchema);
export default CareerBreak;