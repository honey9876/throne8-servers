/**
 * Skill Model - User Skills and Endorsements
 * Stores user skills with endorsements, featured/pinned status, and categories
 * 
 * @module models/Skill.model
 * @version 1.0.0
 */

import { LoggerUtil } from '@/shared/logger.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

export interface IEndorser {
    userId: string;
    endorsedAt: Date;
}

export interface ISkill extends Document {
    skillId: string;
    userId: string;

    // Basic Info
    skillName: string;
    category?: string;  // e.g., "Programming", "Design", "Marketing"

    // Featured/Pinned (Top 3)
    isPinned: boolean;
    pinnedOrder?: number;  // 1, 2, or 3 (for top 3)
    pinnedAt?: Date;

    // Endorsements
    endorsements: IEndorser[];
    endorsementCount: number;

    // Skill Metadata
    skillStrength?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    yearsOfExperience?: number;
    lastUsed?: Date;

    // Skill Assessment & Quiz
    hasAssessment?: boolean;
    assessmentPassed?: boolean;
    assessmentScore?: number;
    assessmentDate?: Date;
    skillBadge?: string;  // Badge earned after passing quiz

    // Skill Level
    skillLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';

    // Endorsement Settings
    showEndorsements: boolean;  // Show/hide endorsements toggle
    endorsementNotifications: boolean;  // Enable/disable endorsement notifications

    // Skill Reordering
    displayOrder?: number;  // For drag & drop reordering

    // Industry/Suggestions
    industry?: string;  // Industry-specific skill
    suggestedBySystem: boolean;  // System-recommended skill

    // Export/Archive metadata
    lastExportedAt?: Date;

    // Visibility
    isVisible: boolean;  // Show/Hide skill on profile

    // Metadata
    createdAt: Date;
    updatedAt: Date;

    // Soft Delete / Archive
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;
}

export interface ISkillModel extends Model<ISkill> {
    [x: string]: any;
    findByUserId(userId: string, includeArchived?: boolean): Promise<ISkill[]>;
    getUserSkillCount(userId: string): Promise<number>;
    findActiveById(skillId: string, userId: string): Promise<ISkill | null>;
    getPinnedSkills(userId: string): Promise<ISkill[]>;
    getTopEndorsedSkills(userId: string, limit?: number): Promise<ISkill[]>;
}

// ==================== SCHEMA ====================

const EndorserSchema = new Schema<IEndorser>({
    userId: {
        type: String,
        required: true,
        validate: {
            validator: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
            message: 'Invalid endorser User ID format',
        },
    },
    endorsedAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });

const SkillSchema = new Schema<ISkill, ISkillModel>(
    {
        skillId: {
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
            index: true,
            validate: {
                validator: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid User ID format',
            },
        },

        // ==================== BASIC INFO ====================
        skillName: {
            type: String,
            required: [true, 'Skill name is required'],
            trim: true,
            minlength: [1, 'Skill name must be at least 1 character'],
            maxlength: [100, 'Skill name cannot exceed 100 characters'],
            validate: {
                validator: (v: string) => /^[A-Za-z0-9][a-zA-Z0-9\s\-+#.()/&]*$/.test(v),
                message: 'Skill name must start with a letter or number and contain valid characters',
            },
            index: true,
        },
        category: {
            type: String,
            trim: true,
            maxlength: [50, 'Category cannot exceed 50 characters'],
            index: true,
        },

        // ==================== PINNED (TOP 3) ====================
        isPinned: {
            type: Boolean,
            default: false,
            index: true,
        },
        pinnedOrder: {
            type: Number,
            min: 1,
            max: 3,
            validate: {
                validator: function (this: ISkill, v: number | undefined) {
                    // If isPinned is true, pinnedOrder must be 1, 2, or 3
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

        // ==================== ENDORSEMENTS ====================
        endorsements: {
            type: [EndorserSchema],
            default: [],
        },
        endorsementCount: {
            type: Number,
            default: 0,
            index: true,
        },

        // ==================== SKILL METADATA ====================
        skillStrength: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced', 'expert'],
            lowercase: true,
        },
        yearsOfExperience: {
            type: Number,
            min: 0,
            max: 50,
        },
        lastUsed: {
            type: Date,
        },

        hasAssessment: {
            type: Boolean,
            default: false,
        },
        assessmentPassed: {
            type: Boolean,
            default: false,
        },
        assessmentScore: {
            type: Number,
            min: 0,
            max: 100,
        },
        assessmentDate: {
            type: Date,
        },
        skillBadge: {
            type: String,
            maxlength: [100, 'Badge name cannot exceed 100 characters'],
        },
        skillLevel: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced', 'expert'],
            lowercase: true,
        },
        showEndorsements: {
            type: Boolean,
            default: true,
            index: true,
        },
        endorsementNotifications: {
            type: Boolean,
            default: true,
        },
        displayOrder: {
            type: Number,
            min: 0,
        },
        industry: {
            type: String,
            trim: true,
            maxlength: [100, 'Industry cannot exceed 100 characters'],
        },
        suggestedBySystem: {
            type: Boolean,
            default: false,
        },
        lastExportedAt: {
            type: Date,
        },

        // ==================== VISIBILITY ====================
        isVisible: {
            type: Boolean,
            default: true,
            index: true,
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
        collection: 'skills',
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

SkillSchema.index({ userId: 1, isPinned: -1, endorsementCount: -1 });  // Pinned first, then by endorsements
SkillSchema.index({ userId: 1, category: 1 });                         // Filter by category
SkillSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });        // Soft delete and archive
SkillSchema.index({ userId: 1, skillName: 1 });                        // Search by skill name
SkillSchema.index({ createdAt: -1 });                                  // Recent skills

SkillSchema.index({ userId: 1, displayOrder: 1 });  // For reordering
SkillSchema.index({ userId: 1, industry: 1 });      // Industry filter
SkillSchema.index({ userId: 1, skillLevel: 1 });    // Skill level filter
SkillSchema.index({ userId: 1, showEndorsements: 1 }); // Endorsement visibility

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Update endorsementCount
 */
SkillSchema.pre('save', function (next) {
    this.endorsementCount = this.endorsements.length;
    next();
});

/**
 * Pre-save: Validate pinned order uniqueness
 */
SkillSchema.pre('save', async function (next) {
    if (this.isPinned && this.pinnedOrder) {
        // Check if another skill already has this pinnedOrder
        const existing = await (this.constructor as ISkillModel).findOne({
            userId: this.userId,
            isPinned: true,
            pinnedOrder: this.pinnedOrder,
            skillId: { $ne: this.skillId },
            isDeleted: false,
        });

        if (existing) {
            return next(new Error(`Pinned order ${this.pinnedOrder} is already taken by another skill`));
        }
    }

    next();
});

// ==================== STATIC METHODS ====================

/**
 * Find all skills by userId (excluding deleted)
 */
SkillSchema.statics.findByUserId = async function (userId: string, includeArchived: boolean = false): Promise<ISkill[]> {
    try {
        const query: any = { userId, isDeleted: false };

        if (!includeArchived) {
            query.isArchived = false;
        }

        return await this.find(query)
            .sort({ isPinned: -1, pinnedOrder: 1, endorsementCount: -1 })  // Pinned first (1,2,3), then by endorsements
            .exec();
    } catch (error: any) {
        LoggerUtil.error('Find skills by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get total skill count for user (excluding deleted)
 */
SkillSchema.statics.getUserSkillCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error: any) {
        LoggerUtil.error('Get skill count failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get skills by industry
 */
SkillSchema.statics.getSkillsByIndustry = async function (userId: string, industry: string): Promise<ISkill[]> {
    try {
        return await this.find({
            userId,
            industry,
            isDeleted: false,
        })
            .sort({ endorsementCount: -1 })
            .exec();
    } catch (error: any) {
        LoggerUtil.error('Get skills by industry failed', {
            error: (error as Error).message,
            userId,
            industry,
        });
        throw error;
    }
};

/**
 * Get system-suggested skills
 */
SkillSchema.statics.getSuggestedSkills = async function (userId: string): Promise<ISkill[]> {
    try {
        return await this.find({
            userId,
            suggestedBySystem: true,
            isDeleted: false,
        })
            .sort({ createdAt: -1 })
            .limit(10)
            .exec();
    } catch (error: any) {
        LoggerUtil.error('Get suggested skills failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Reorder skills
 */
SkillSchema.statics.reorderSkills = async function (userId: string, skillIds: string[]): Promise<boolean> {
    try {
        const bulkOps = skillIds.map((skillId, index) => ({
            updateOne: {
                filter: { skillId, userId, isDeleted: false },
                update: { $set: { displayOrder: index } },
            },
        }));

        await this.bulkWrite(bulkOps);
        return true;
    } catch (error: any) {
        LoggerUtil.error('Reorder skills failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Find active skill by ID (not deleted, belongs to user)
 */
SkillSchema.statics.findActiveById = async function (skillId: string, userId: string): Promise<ISkill | null> {
    try {
        return await this.findOne({
            skillId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error: any) {
        LoggerUtil.error('Find active skill by ID failed', {
            error: (error as Error).message,
            skillId,
            userId,
        });
        throw error;
    }
};

/**
 * Get pinned skills (top 3)
 */
SkillSchema.statics.getPinnedSkills = async function (userId: string): Promise<ISkill[]> {
    try {
        return await this.find({
            userId,
            isPinned: true,
            isDeleted: false,
        })
            .sort({ pinnedOrder: 1 })
            .limit(3)
            .exec();
    } catch (error: any) {
        LoggerUtil.error('Get pinned skills failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get top endorsed skills
 */
SkillSchema.statics.getTopEndorsedSkills = async function (userId: string, limit: number = 10): Promise<ISkill[]> {
    try {
        return await this.find({
            userId,
            isDeleted: false,
        })
            .sort({ endorsementCount: -1 })
            .limit(limit)
            .exec();
    } catch (error: any) {
        LoggerUtil.error('Get top endorsed skills failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const Skill = mongoose.model<ISkill, ISkillModel>('Skill', SkillSchema);
export default Skill;