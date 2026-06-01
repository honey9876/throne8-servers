/**
 * Experience Model - Professional Experience Management
 * Stores user's work experience with achievements
 * 
 * @module models/Experience.model
 * @version 1.0.0
 */

import CacheUtil from '@/shared/cache.util';
import { LoggerUtil } from '@/shared/logger.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const logger = LoggerUtil;

// ==================== INTERFACES ====================

export interface IExperience extends Document {
    experienceId: string;
    userId: string;
    currentPosition: string;
    companyName: string;
    description: string;
    startDate: Date;
    endDate?: Date;
    currentlyWorking: boolean;
    keyAchievements: string[];
    isArchived: boolean;
    archivedAt?: Date;
    isDeleted: boolean;
    deletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IExperienceModel extends Model<IExperience> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<IExperience[]>;
    findByExperienceId(experienceId: string, userId: string): Promise<IExperience | null>;
    getUserExperienceCount(userId: string): Promise<number>;
    archiveExperience(experienceId: string, userId: string): Promise<IExperience>;
    restoreExperience(experienceId: string, userId: string): Promise<IExperience>;
}

// ==================== SCHEMA ====================

const ExperienceSchema = new Schema<IExperience, IExperienceModel>(
    {
        experienceId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            index: true,
        },
        userId: {
            type: String,
            required: true,
            index: true,
            ref: 'User',
        },
        currentPosition: {
            type: String,
            required: true,
            trim: true,
            minlength: [2, 'Position must be at least 2 characters'],
            maxlength: [100, 'Position cannot exceed 100 characters'],
            index: true,
        },
        companyName: {
            type: String,
            required: true,
            trim: true,
            minlength: [2, 'Company name must be at least 2 characters'],
            maxlength: [150, 'Company name cannot exceed 150 characters'],
            index: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
            minlength: [15, 'Description must be at least 15 words'],
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },
        startDate: {
            type: Date,
            required: true,
            index: true,
        },
        endDate: {
            type: Date,
            required: false,
            index: true,
        },
        currentlyWorking: {
            type: Boolean,
            default: false,
            index: true,
        },
        keyAchievements: {
            type: [String],
            default: [],
            validate: {
                validator: function (v: string[]) {
                    return v.length <= 10; // Max 10 achievements
                },
                message: 'Maximum 10 achievements allowed',
            },
        },
        isArchived: {
            type: Boolean,
            default: false,
            index: true,
        },
        archivedAt: {
            type: Date,
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
        collection: 'experiences',
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

ExperienceSchema.index({ userId: 1, createdAt: -1 });
ExperienceSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
ExperienceSchema.index({ experienceId: 1, userId: 1 });
ExperienceSchema.index({ userId: 1, currentlyWorking: 1 });

// ==================== VIRTUALS ====================

ExperienceSchema.virtual('duration').get(function (this: IExperience) {
    const start = new Date(this.startDate);
    const end = this.currentlyWorking ? new Date() : (this.endDate ? new Date(this.endDate) : new Date());

    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;

    if (years > 0 && remainingMonths > 0) {
        return `${years} year${years > 1 ? 's' : ''} ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
    } else if (years > 0) {
        return `${years} year${years > 1 ? 's' : ''}`;
    } else {
        return `${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
    }
});

// ==================== PRE-SAVE HOOK ====================

ExperienceSchema.pre('save', function (next) {
    // If currently working, remove endDate
    if (this.currentlyWorking) {
        this.endDate = undefined;
    }

    // Validate endDate > startDate
    if (this.endDate && this.endDate < this.startDate) {
        return next(new Error('End date must be after start date'));
    }

    next();
});

// ==================== STATIC METHODS ====================

ExperienceSchema.statics.findByUserId = async function (
    userId: string,
    includeArchived: boolean = false
): Promise<IExperience[]> {
    try {
        const query: any = {
            userId,
            isDeleted: false,
        };

        if (!includeArchived) {
            query.isArchived = false;
        }

        const experiences = await this.find(query)
            .sort({ startDate: -1 }) // Latest first
            .lean() as unknown as IExperience[];

        logger.debug('Experiences fetched by userId', {
            userId,
            count: experiences.length,
            includeArchived,
        });

        return experiences;
    } catch (error: any) {
        logger.error('Find experiences by userId failed', {
            error: error.message,
            userId,
        });
        throw error;
    }
};

ExperienceSchema.statics.findByExperienceId = async function (
    experienceId: string,
    userId: string
): Promise<IExperience | null> {
    try {
        // Check cache first
        const cacheKey = `experience:${experienceId}`;
        const cached = await CacheUtil.get(cacheKey);

        if (cached) {
            logger.debug('Experience cache hit', { experienceId });
            return cached;
        }

        // Fetch from DB
        const experience = await this.findOne({
            experienceId, userId, isDeleted: false,
        }) as IExperience | null;

        if (experience) {
            // Cache for 5 minutes
            await CacheUtil.set(cacheKey, experience, 300);
        }

        logger.debug('Experience fetched by experienceId', { experienceId });
        return experience;
    } catch (error: any) {
        logger.error('Find experience by experienceId failed', {
            error: error.message,
            experienceId,
        });
        throw error;
    }
};

ExperienceSchema.statics.getUserExperienceCount = async function (userId: string): Promise<number> {
    try {
        const count = await this.countDocuments({
            userId,
            isDeleted: false,
        });

        logger.debug('Experience count fetched', { userId, count });
        return count;
    } catch (error: any) {
        logger.error('Get experience count failed', {
            error: error.message,
            userId,
        });
        throw error;
    }
};

ExperienceSchema.statics.archiveExperience = async function (
    experienceId: string,
    userId: string
): Promise<IExperience> {
    try {
        const experience = await this.findOneAndUpdate(
            { experienceId, userId, isDeleted: false, isArchived: false },
            { $set: { isArchived: true, archivedAt: new Date() } },
            { new: true }
        ) as IExperience | null;

        if (!experience) {
            throw new Error('Experience not found or already archived');
        }

        // Clear cache
        await CacheUtil.del(`experience:${experienceId}`);

        logger.info('Experience archived', { experienceId, userId });
        return experience;
    } catch (error: any) {
        logger.error('Archive experience failed', {
            error: error.message,
            experienceId,
        });
        throw error;
    }
};

ExperienceSchema.statics.restoreExperience = async function (
    experienceId: string,
    userId: string
): Promise<IExperience> {
    try {
        const experience = await this.findOneAndUpdate(
            { experienceId, userId, isDeleted: false, isArchived: true },
            { $set: { isArchived: false }, $unset: { archivedAt: 1 } },
            { new: true }
        ) as IExperience | null;

        if (!experience) {
            throw new Error('Experience not found or not archived');
        }

        // Clear cache
        await CacheUtil.del(`experience:${experienceId}`);

        logger.info('Experience restored', { experienceId, userId });
        return experience;
    } catch (error: any) {
        logger.error('Restore experience failed', {
            error: error.message,
            experienceId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const Experience = mongoose.model<IExperience, IExperienceModel>('Experience', ExperienceSchema);
export default Experience;