import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

export interface IEndorser {
    userId: string;
    endorsedAt: Date;
}

export interface ISkill extends Document {
    skillId: string;
    userId: string;
    skillName: string;
    category?: string;
    isPinned: boolean;
    pinnedOrder?: number;
    pinnedAt?: Date;
    endorsements: IEndorser[];
    endorsementCount: number;
    skillStrength?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    yearsOfExperience?: number;
    lastUsed?: Date;
    hasAssessment?: boolean;
    assessmentPassed?: boolean;
    assessmentScore?: number;
    assessmentDate?: Date;
    skillBadge?: string;
    skillLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    showEndorsements: boolean;
    endorsementNotifications: boolean;
    displayOrder?: number;
    industry?: string;
    suggestedBySystem: boolean;
    lastExportedAt?: Date;
    isVisible: boolean;
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface ISkillModel extends Model<ISkill> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<ISkill[]>;
    getUserSkillCount(userId: string): Promise<number>;
    findActiveById(skillId: string, userId: string): Promise<ISkill | null>;
    getPinnedSkills(userId: string): Promise<ISkill[]>;
    getTopEndorsedSkills(userId: string, limit?: number): Promise<ISkill[]>;
    getSkillsByIndustry(userId: string, industry: string): Promise<ISkill[]>;
    getSuggestedSkills(userId: string): Promise<ISkill[]>;
    reorderSkills(userId: string, skillIds: string[]): Promise<boolean>;
}

const EndorserSchema = new Schema<IEndorser>(
    {
        userId: {
            type: String,
            required: true,
            validate: {
                validator: (v: string) =>
                    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid endorser User ID format',
            },
        },
        endorsedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const SkillSchema = new Schema<ISkill, ISkillModel>(
    {
        skillId: {
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
                validator: (v: string) =>
                    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid User ID format',
            },
        },
        skillName: {
            type: String,
            required: [true, 'Skill name is required'],
            trim: true,
            minlength: [2, 'Skill name must be at least 2 characters'],
            maxlength: [100, 'Skill name cannot exceed 100 characters'],
            validate: {
                validator: (v: string) => /^[A-Za-z0-9][a-zA-Z0-9\s\-+#.()]+$/.test(v),
                message: 'Skill name must start with a letter or number',
            },
        },
        category: { type: String, trim: true, maxlength: 50 },
        isPinned: { type: Boolean, default: false },
        pinnedOrder: {
            type: Number,
            min: 1,
            max: 3,
            validate: {
                validator: function (this: ISkill, v: number | undefined) {
                    if (this.isPinned && (!v || v < 1 || v > 3)) return false;
                    return true;
                },
                message: 'Pinned order must be 1, 2, or 3',
            },
        },
        pinnedAt: Date,
        endorsements: { type: [EndorserSchema], default: [] },
        endorsementCount: { type: Number, default: 0 },
        skillStrength: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced', 'expert'],
            lowercase: true,
        },
        yearsOfExperience: { type: Number, min: 0, max: 50 },
        lastUsed: Date,
        hasAssessment: { type: Boolean, default: false },
        assessmentPassed: { type: Boolean, default: false },
        assessmentScore: { type: Number, min: 0, max: 100 },
        assessmentDate: Date,
        skillBadge: { type: String, maxlength: 100 },
        skillLevel: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced', 'expert'],
            lowercase: true,
        },
        showEndorsements: { type: Boolean, default: true },
        endorsementNotifications: { type: Boolean, default: true },
        displayOrder: { type: Number, min: 0 },
        industry: { type: String, trim: true, maxlength: 100 },
        suggestedBySystem: { type: Boolean, default: false },
        lastExportedAt: Date,
        isVisible: { type: Boolean, default: true },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        isArchived: { type: Boolean, default: false },
        archivedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        collection: 'skills',
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

SkillSchema.index({ userId: 1, isPinned: -1, endorsementCount: -1 });
SkillSchema.index({ userId: 1, category: 1 });
SkillSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
SkillSchema.index({ userId: 1, skillName: 1 });
SkillSchema.index({ userId: 1, displayOrder: 1 });
SkillSchema.index({ userId: 1, industry: 1 });
SkillSchema.index({ userId: 1, skillLevel: 1 });
SkillSchema.index({ createdAt: -1 });

SkillSchema.pre('save', function (next) {
    this.endorsementCount = this.endorsements.length;
    next();
});

SkillSchema.pre('save', async function (next) {
    if (this.isPinned && this.pinnedOrder) {
        const existing = await (this.constructor as ISkillModel).findOne({
            userId: this.userId,
            isPinned: true,
            pinnedOrder: this.pinnedOrder,
            skillId: { $ne: this.skillId },
            isDeleted: false,
        });
        if (existing) {
            return next(new Error(`Pinned order ${this.pinnedOrder} is already taken`));
        }
    }
    next();
});

SkillSchema.statics.findByUserId = async function (
    userId: string,
    includeArchived = false
): Promise<ISkill[]> {
    try {
        const query: Record<string, unknown> = { userId, isDeleted: false };
        if (!includeArchived) query.isArchived = false;
        return await this.find(query)
            .sort({ isPinned: -1, pinnedOrder: 1, endorsementCount: -1 })
            .exec();
    } catch (error: unknown) {
        LoggerUtil.error('Find skills by userId failed', { error: (error as Error).message, userId });
        throw error;
    }
};

SkillSchema.statics.getUserSkillCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error: unknown) {
        LoggerUtil.error('Get skill count failed', { error: (error as Error).message, userId });
        throw error;
    }
};

SkillSchema.statics.findActiveById = async function (
    skillId: string,
    userId: string
): Promise<ISkill | null> {
    try {
        return await this.findOne({ skillId, userId, isDeleted: false }).exec();
    } catch (error: unknown) {
        LoggerUtil.error('Find active skill by ID failed', { error: (error as Error).message, skillId });
        throw error;
    }
};

SkillSchema.statics.getPinnedSkills = async function (userId: string): Promise<ISkill[]> {
    try {
        return await this.find({ userId, isPinned: true, isDeleted: false })
            .sort({ pinnedOrder: 1 })
            .limit(3)
            .exec();
    } catch (error: unknown) {
        LoggerUtil.error('Get pinned skills failed', { error: (error as Error).message, userId });
        throw error;
    }
};

SkillSchema.statics.getTopEndorsedSkills = async function (
    userId: string,
    limit = 10
): Promise<ISkill[]> {
    try {
        return await this.find({ userId, isDeleted: false })
            .sort({ endorsementCount: -1 })
            .limit(limit)
            .exec();
    } catch (error: unknown) {
        LoggerUtil.error('Get top endorsed skills failed', { error: (error as Error).message, userId });
        throw error;
    }
};

SkillSchema.statics.getSkillsByIndustry = async function (
    userId: string,
    industry: string
): Promise<ISkill[]> {
    try {
        return await this.find({ userId, industry, isDeleted: false })
            .sort({ endorsementCount: -1 })
            .exec();
    } catch (error: unknown) {
        LoggerUtil.error('Get skills by industry failed', { error: (error as Error).message, userId });
        throw error;
    }
};

SkillSchema.statics.getSuggestedSkills = async function (userId: string): Promise<ISkill[]> {
    try {
        return await this.find({ userId, suggestedBySystem: true, isDeleted: false })
            .sort({ createdAt: -1 })
            .limit(10)
            .exec();
    } catch (error: unknown) {
        LoggerUtil.error('Get suggested skills failed', { error: (error as Error).message, userId });
        throw error;
    }
};

SkillSchema.statics.reorderSkills = async function (
    userId: string,
    skillIds: string[]
): Promise<boolean> {
    try {
        const bulkOps = skillIds.map((skillId, index) => ({
            updateOne: {
                filter: { skillId, userId, isDeleted: false },
                update: { $set: { displayOrder: index } },
            },
        }));
        await this.bulkWrite(bulkOps);
        return true;
    } catch (error: unknown) {
        LoggerUtil.error('Reorder skills failed', { error: (error as Error).message, userId });
        throw error;
    }
};

const Skill = mongoose.model<ISkill, ISkillModel>('Skill', SkillSchema);
export default Skill;