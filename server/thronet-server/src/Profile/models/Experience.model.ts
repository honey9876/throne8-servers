import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';
import CacheUtil from '@/shared/cache.util';

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

const ExperienceSchema = new Schema<IExperience, IExperienceModel>(
    {
        experienceId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
        },
        userId: {
            type: String,
            required: true,
            ref: 'User',
        },
        currentPosition: {
            type: String,
            required: true,
            trim: true,
            minlength: [2, 'Position must be at least 2 characters'],
            maxlength: [100, 'Position cannot exceed 100 characters'],
        },
        companyName: {
            type: String,
            required: true,
            trim: true,
            minlength: [2, 'Company name must be at least 2 characters'],
            maxlength: [150, 'Company name cannot exceed 150 characters'],
        },
        description: {
            type: String,
            required: true,
            trim: true,
            minlength: [15, 'Description must be at least 15 characters'],
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },
        startDate: { type: Date, required: true },
        endDate: { type: Date },
        currentlyWorking: { type: Boolean, default: false },
        keyAchievements: {
            type: [String],
            default: [],
            validate: {
                validator: (v: string[]) => v.length <= 10,
                message: 'Maximum 10 achievements allowed',
            },
        },
        isArchived: { type: Boolean, default: false },
        archivedAt: Date,
        isDeleted: { type: Boolean, default: false },
        deletedAt: Date,
    },
    {
        timestamps: true,
        collection: 'experiences',
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

ExperienceSchema.index({ userId: 1, createdAt: -1 });
ExperienceSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
ExperienceSchema.index({ experienceId: 1, userId: 1 });
ExperienceSchema.index({ userId: 1, currentlyWorking: 1 });

ExperienceSchema.virtual('duration').get(function (this: IExperience) {
    const start = new Date(this.startDate);
    const end = this.currentlyWorking ? new Date() : (this.endDate ? new Date(this.endDate) : new Date());
    const months =
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    const years = Math.floor(months / 12);
    const rem = months % 12;
    if (years > 0 && rem > 0) return `${years} yr${years > 1 ? 's' : ''} ${rem} mo${rem > 1 ? 's' : ''}`;
    if (years > 0) return `${years} yr${years > 1 ? 's' : ''}`;
    return `${rem} mo${rem > 1 ? 's' : ''}`;
});

ExperienceSchema.pre('save', function (next) {
    if (this.currentlyWorking) this.endDate = undefined;
    if (this.endDate && this.endDate < this.startDate) {
        return next(new Error('End date must be after start date'));
    }
    next();
});

ExperienceSchema.statics.findByUserId = async function (
    userId: string,
    includeArchived = false
): Promise<IExperience[]> {
    try {
        const query: Record<string, unknown> = { userId, isDeleted: false };
        if (!includeArchived) query.isArchived = false;
        return await this.find(query).sort({ startDate: -1 }).lean() as unknown as IExperience[];
    } catch (error: unknown) {
        LoggerUtil.error('Find experiences by userId failed', { error: (error as Error).message, userId });
        throw error;
    }
};

ExperienceSchema.statics.findByExperienceId = async function (
    experienceId: string,
    userId: string
): Promise<IExperience | null> {
    try {
        const cacheKey = `experience:${experienceId}`;
        const cached = await CacheUtil.get(cacheKey);
        if (cached) return cached;

        const experience = await this.findOne({ experienceId, userId, isDeleted: false }) as IExperience | null;
        if (experience) await CacheUtil.set(cacheKey, experience, 300);
        return experience;
    } catch (error: unknown) {
        LoggerUtil.error('Find experience by experienceId failed', {
            error: (error as Error).message,
            experienceId,
        });
        throw error;
    }
};

ExperienceSchema.statics.getUserExperienceCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error: unknown) {
        LoggerUtil.error('Get experience count failed', { error: (error as Error).message, userId });
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
        if (!experience) throw new Error('Experience not found or already archived');
        await CacheUtil.del(`experience:${experienceId}`);
        return experience;
    } catch (error: unknown) {
        LoggerUtil.error('Archive experience failed', { error: (error as Error).message, experienceId });
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
        if (!experience) throw new Error('Experience not found or not archived');
        await CacheUtil.del(`experience:${experienceId}`);
        return experience;
    } catch (error: unknown) {
        LoggerUtil.error('Restore experience failed', { error: (error as Error).message, experienceId });
        throw error;
    }
};

const Experience = mongoose.model<IExperience, IExperienceModel>('Experience', ExperienceSchema);
export default Experience;