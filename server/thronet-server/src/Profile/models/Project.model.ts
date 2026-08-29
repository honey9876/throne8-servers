/**
 * Project Model - User Projects with Media, Skills, Team Members
 * 
 * @module models/Project.model
 * @version 1.0.0
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== INTERFACES ====================

export interface ITeamMember {
    memberId: string;
    memberName: string;
    memberLinkedInUrl?: string;
    addedAt: Date;
}

export interface IMediaAttachment {
    mediaId: string;
    mediaType: 'image' | 'video' | 'document';
    mediaUrl: string;
    mediaSecureUrl?: string;
    mediaPublicId?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    caption?: string;
    uploadedAt: Date;
}

export interface IProject extends Document {
    projectId: string;
    userId: string;

    // Basic Info
    projectName: string;
    projectDescription: string;

    // Duration
    startDate: Date;  // Month & Year
    endDate?: Date;   // Month & Year
    isCurrentlyWorking: boolean;

    // Links & Association
    projectUrl?: string;
    associatedWith?: {
        type: 'company' | 'school';
        name: string;
        organizationId?: string;
    };

    // Team & Skills
    teamMembers: ITeamMember[];
    skillsUsed: string[];  // Skill IDs or names

    // Media
    mediaAttachments: IMediaAttachment[];

    // Display Settings
    isVisible: boolean;
    isPinned: boolean;
    pinnedOrder?: number;
    displayOrder: number;

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

export interface IProjectModel extends Model<IProject> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<IProject[]>;
    getUserProjectCount(userId: string): Promise<number>;
    findActiveById(projectId: string, userId: string): Promise<IProject | null>;
    getPinnedProjects(userId: string): Promise<IProject[]>;
    getNextDisplayOrder(userId: string): Promise<number>;
}

// ==================== SCHEMA ====================

const TeamMemberSchema = new Schema<ITeamMember>({
    memberId: {
        type: String,
        required: true,
        default: () => uuidv4(),
    },
    memberName: {
        type: String,
        required: [true, 'Team member name is required'],
        trim: true,
        maxlength: [100, 'Member name cannot exceed 100 characters'],
    },
    memberLinkedInUrl: {
        type: String,
        trim: true,
        validate: {
            validator: (v: string) => !v || /^https?:\/\/(www\.)?linkedin\.com\//.test(v),
            message: 'Invalid LinkedIn URL',
        },
    },
    addedAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });

const MediaAttachmentSchema = new Schema<IMediaAttachment>({
    mediaId: {
        type: String,
        required: true,
        default: () => uuidv4(),
    },
    mediaType: {
        type: String,
        enum: ['image', 'video', 'document'],
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
}, { _id: false });

const ProjectSchema = new Schema<IProject, IProjectModel>(
    {
        projectId: {
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
        projectName: {
            type: String,
            required: [true, 'Project name is required'],
            trim: true,
            minlength: [2, 'Project name must be at least 2 characters'],
            maxlength: [200, 'Project name cannot exceed 200 characters'],
        },
        projectDescription: {
            type: String,
            required: [true, 'Project description is required'],
            trim: true,
            minlength: [10, 'Description must be at least 10 characters'],
            maxlength: [2000, 'Description cannot exceed 2000 characters'],
        },

        // ==================== DURATION ====================
        startDate: {
            type: Date,
            required: [true, 'Start date is required'],
        },
        endDate: {
            type: Date,
        },
        isCurrentlyWorking: {
            type: Boolean,
            default: false,
        },

        // ==================== LINKS & ASSOCIATION ====================
        projectUrl: {
            type: String,
            trim: true,
            validate: {
                validator: (v: string) => !v || /^https?:\/\/.+/.test(v),
                message: 'Invalid project URL',
            },
        },
        associatedWith: {
            type: {
                type: String,
                enum: ['company', 'school'],
            },
            name: {
                type: String,
                trim: true,
                maxlength: [200, 'Organization name cannot exceed 200 characters'],
            },
            organizationId: {
                type: String,
                trim: true,
            },
        },

        // ==================== TEAM & SKILLS ====================
        teamMembers: {
            type: [TeamMemberSchema],
            default: [],
            validate: {
                validator: (v: ITeamMember[]) => v.length <= 50,
                message: 'Maximum 50 team members allowed',
            },
        },
        skillsUsed: {
            type: [String],
            default: [],
            validate: {
                validator: (v: string[]) => v.length <= 30,
                message: 'Maximum 30 skills allowed',
            },
        },

        // ==================== MEDIA ====================
        mediaAttachments: {
            type: [MediaAttachmentSchema],
            default: [],
            validate: {
                validator: (v: IMediaAttachment[]) => v.length <= 20,
                message: 'Maximum 20 media attachments allowed',
            },
        },

        // ==================== DISPLAY SETTINGS ====================
        isVisible: {
            type: Boolean,
            default: true,
        },
        isPinned: {
            type: Boolean,
            default: false,
        },
        pinnedOrder: {
            type: Number,
            min: 1,
        },
        displayOrder: {
            type: Number,
            required: true,
            default: 0,
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
        collection: 'projects',
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

ProjectSchema.index({ userId: 1, isPinned: -1, displayOrder: 1 });
ProjectSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
ProjectSchema.index({ userId: 1, startDate: -1 });
ProjectSchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================

ProjectSchema.virtual('duration').get(function (this: IProject) {
    const start = this.startDate;
    const end = this.isCurrentlyWorking ? new Date() : this.endDate;

    if (!end) return null;

    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;

    return { years, months: remainingMonths, totalMonths: months };
});

ProjectSchema.virtual('hasMedia').get(function (this: IProject) {
    return this.mediaAttachments && this.mediaAttachments.length > 0;
});

ProjectSchema.virtual('teamSize').get(function (this: IProject) {
    return this.teamMembers ? this.teamMembers.length : 0;
});

// ==================== MIDDLEWARE ====================

ProjectSchema.pre('save', function (next) {
    this.lastEditedAt = new Date();

    // If currently working, clear end date
    if (this.isCurrentlyWorking) {
        this.endDate = undefined;
    }

    // Validate end date is after start date
    if (this.endDate && this.endDate < this.startDate) {
        return next(new Error('End date must be after start date'));
    }

    next();
});

// ==================== STATIC METHODS ====================

ProjectSchema.statics.findByUserId = async function (userId: string, includeArchived: boolean = false): Promise<IProject[]> {
    try {
        const query: any = { userId, isDeleted: false };

        if (!includeArchived) {
            query.isArchived = false;
        }

        return await this.find(query)
            .sort({ isPinned: -1, pinnedOrder: 1, displayOrder: 1 })
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Find projects by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

ProjectSchema.statics.getUserProjectCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error : any) {
        LoggerUtil.error('Get project count failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

ProjectSchema.statics.findActiveById = async function (projectId: string, userId: string): Promise<IProject | null> {
    try {
        return await this.findOne({
            projectId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active project by ID failed', {
            error: (error as Error).message,
            projectId,
            userId,
        });
        throw error;
    }
};

ProjectSchema.statics.getPinnedProjects = async function (userId: string): Promise<IProject[]> {
    try {
        return await this.find({
            userId,
            isPinned: true,
            isDeleted: false,
        })
            .sort({ pinnedOrder: 1 })
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Get pinned projects failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

ProjectSchema.statics.getNextDisplayOrder = async function (userId: string): Promise<number> {
    try {
        const lastProject = await this.findOne({ userId, isDeleted: false })
            .sort({ displayOrder: -1 })
            .exec();

        return lastProject ? lastProject.displayOrder + 1 : 1;
    } catch (error : any) {
        LoggerUtil.error('Get next display order failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const Project = mongoose.model<IProject, IProjectModel>('Project', ProjectSchema);
export default Project;