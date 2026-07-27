/**
 * Volunteer Model - User Volunteer Experience
 * Stores volunteer roles, organizations, causes, media, and skills
 * 
 * @module models/Volunteer.model
 * @version 1.0.0
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== INTERFACES ====================

export interface IOrganizationLogo {
    logoUrl: string;
    logoPublicId: string;
    logoSecureUrl: string;
    uploadedAt: Date;
}

export interface IMediaAttachment {
    mediaId: string;
    mediaType: 'photo' | 'certificate';
    mediaUrl: string;
    mediaSecureUrl: string;
    mediaPublicId: string;
    fileName: string;
    fileSize: number;
    caption?: string;
    uploadedAt: Date;
}

export interface IVolunteer extends Document {
    volunteerId: string;
    userId: string;

    // Basic Info
    organizationName: string;
    role: string;  // Position/Role
    cause: string;  // 12 categories

    // Duration
    startDate: {
        month: number;  // 1-12
        year: number;   // e.g., 2024
    };
    endDate?: {
        month: number;
        year: number;
    };
    currentlyVolunteering: boolean;

    // Description
    description?: string;  // Max 500 chars

    // Organization Logo
    organizationLogo?: IOrganizationLogo;

    // Media Attachments (Photos, Certificates)
    mediaAttachments: IMediaAttachment[];

    // Skills Used (References to Skill IDs)
    skillsUsed: string[];

    // Network Notification
    notifyNetwork: boolean;

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

export interface IVolunteerModel extends Model<IVolunteer> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<IVolunteer[]>;
    getUserVolunteerCount(userId: string): Promise<number>;
    findActiveById(volunteerId: string, userId: string): Promise<IVolunteer | null>;
    reorderVolunteers(userId: string, volunteerIds: string[]): Promise<void>;
}

// ==================== CONSTANTS ====================

const VOLUNTEER_CAUSES = [
    'Education',
    'Environment',
    'Health',
    'Animal Welfare',
    'Arts & Culture',
    'Children & Youth',
    'Community Development',
    'Disaster Relief',
    'Human Rights',
    'Poverty Alleviation',
    'Social Services',
    'Other',
];

// ==================== SCHEMA ====================

const OrganizationLogoSchema = new Schema<IOrganizationLogo>({
    logoUrl: {
        type: String,
        required: true,
        trim: true,
    },
    logoPublicId: {
        type: String,
        required: true,
        trim: true,
    },
    logoSecureUrl: {
        type: String,
        required: true,
        trim: true,
    },
    uploadedAt: {
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
        enum: ['photo', 'certificate'],
        required: true,
    },
    mediaUrl: {
        type: String,
        required: true,
        trim: true,
    },
    mediaSecureUrl: {
        type: String,
        required: true,
        trim: true,
    },
    mediaPublicId: {
        type: String,
        required: true,
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
    caption: {
        type: String,
        trim: true,
        maxlength: [200, 'Caption cannot exceed 200 characters'],
    },
    uploadedAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });

const VolunteerSchema = new Schema<IVolunteer, IVolunteerModel>(
    {
        volunteerId: {
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
        organizationName: {
            type: String,
            required: [true, 'Organization name is required'],
            trim: true,
            minlength: [2, 'Organization name must be at least 2 characters'],
            maxlength: [200, 'Organization name cannot exceed 200 characters'],
        },
        role: {
            type: String,
            required: [true, 'Role/Position is required'],
            trim: true,
            minlength: [2, 'Role must be at least 2 characters'],
            maxlength: [200, 'Role cannot exceed 200 characters'],
        },
        cause: {
            type: String,
            required: [true, 'Cause is required'],
            enum: VOLUNTEER_CAUSES,
        },

        // ==================== DURATION ====================
        startDate: {
            month: {
                type: Number,
                required: [true, 'Start month is required'],
                min: [1, 'Month must be between 1 and 12'],
                max: [12, 'Month must be between 1 and 12'],
            },
            year: {
                type: Number,
                required: [true, 'Start year is required'],
                min: [1900, 'Year must be after 1900'],
                max: [new Date().getFullYear() + 1, 'Year cannot be more than 1 year in future'],
            },
        },
        endDate: {
            month: {
                type: Number,
                min: [1, 'Month must be between 1 and 12'],
                max: [12, 'Month must be between 1 and 12'],
            },
            year: {
                type: Number,
                min: [1900, 'Year must be after 1900'],
                max: [new Date().getFullYear() + 1, 'Year cannot be more than 1 year in future'],
            },
        },
        currentlyVolunteering: {
            type: Boolean,
            default: false,
        },

        // ==================== DESCRIPTION ====================
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },

        // ==================== ORGANIZATION LOGO ====================
        organizationLogo: OrganizationLogoSchema,

        // ==================== MEDIA ATTACHMENTS ====================
        mediaAttachments: {
            type: [MediaAttachmentSchema],
            default: [],
            validate: {
                validator: function (arr: IMediaAttachment[]) {
                    return arr.length <= 10;
                },
                message: 'Maximum 10 media attachments allowed',
            },
        },

        // ==================== SKILLS USED ====================
        skillsUsed: {
            type: [String],
            default: [],
            validate: {
                validator: function (arr: string[]) {
                    return arr.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
                },
                message: 'Invalid skill ID format in array',
            },
        },

        // ==================== NETWORK NOTIFICATION ====================
        notifyNetwork: {
            type: Boolean,
            default: false,
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
        collection: 'volunteers',
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

VolunteerSchema.index({ userId: 1, displayOrder: 1 });
VolunteerSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
VolunteerSchema.index({ userId: 1, cause: 1 });
VolunteerSchema.index({ userId: 1, currentlyVolunteering: 1 });
VolunteerSchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================

/**
 * Check if volunteer has organization logo
 */
VolunteerSchema.virtual('hasOrganizationLogo').get(function (this: IVolunteer) {
    return !!(this.organizationLogo && this.organizationLogo.logoUrl);
});

/**
 * Get media count
 */
VolunteerSchema.virtual('mediaCount').get(function (this: IVolunteer) {
    return this.mediaAttachments ? this.mediaAttachments.length : 0;
});

/**
 * Get skills count
 */
VolunteerSchema.virtual('skillsCount').get(function (this: IVolunteer) {
    return this.skillsUsed ? this.skillsUsed.length : 0;
});

/**
 * Calculate duration in months
 */
VolunteerSchema.virtual('durationMonths').get(function (this: IVolunteer) {
    const startYear = this.startDate.year;
    const startMonth = this.startDate.month;

    let endYear: number;
    let endMonth: number;

    if (this.currentlyVolunteering) {
        const now = new Date();
        endYear = now.getFullYear();
        endMonth = now.getMonth() + 1;
    } else if (this.endDate) {
        endYear = this.endDate.year;
        endMonth = this.endDate.month;
    } else {
        return 0;
    }

    return (endYear - startYear) * 12 + (endMonth - startMonth);
});

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Validate end date is after start date
 */
VolunteerSchema.pre('save', function (next) {
    if (this.endDate && !this.currentlyVolunteering) {
        const startDate = new Date(this.startDate.year, this.startDate.month - 1);
        const endDate = new Date(this.endDate.year, this.endDate.month - 1);

        if (endDate < startDate) {
            return next(new Error('End date must be after start date'));
        }
    }

    // If currently volunteering, remove end date
    if (this.currentlyVolunteering) {
        this.endDate = undefined;
    }

    next();
});

// ==================== STATIC METHODS ====================

/**
 * Find all volunteers by userId (excluding deleted)
 */
VolunteerSchema.statics.findByUserId = async function (userId: string, includeArchived: boolean = false): Promise<IVolunteer[]> {
    try {
        const query: any = { userId, isDeleted: false };

        if (!includeArchived) {
            query.isArchived = false;
        }

        return await this.find(query)
            .sort({ displayOrder: 1, createdAt: -1 })
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Find volunteers by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get total volunteer count for user (excluding deleted)
 */
VolunteerSchema.statics.getUserVolunteerCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error : any) {
        LoggerUtil.error('Get volunteer count failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Find active volunteer by ID (not deleted, belongs to user)
 */
VolunteerSchema.statics.findActiveById = async function (volunteerId: string, userId: string): Promise<IVolunteer | null> {
    try {
        return await this.findOne({
            volunteerId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active volunteer by ID failed', {
            error: (error as Error).message,
            volunteerId,
            userId,
        });
        throw error;
    }
};

/**
 * Reorder volunteers
 */
VolunteerSchema.statics.reorderVolunteers = async function (userId: string, volunteerIds: string[]): Promise<void> {
    try {
        const bulkOps = volunteerIds.map((volunteerId, index) => ({
            updateOne: {
                filter: { volunteerId, userId, isDeleted: false },
                update: { $set: { displayOrder: index } },
            },
        }));

        await this.bulkWrite(bulkOps);

        LoggerUtil.info('Volunteers reordered successfully', {
            userId,
            count: volunteerIds.length,
        });
    } catch (error : any) {
        LoggerUtil.error('Reorder volunteers failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const Volunteer = mongoose.model<IVolunteer, IVolunteerModel>('Volunteer', VolunteerSchema);
export default Volunteer;
export { VOLUNTEER_CAUSES };