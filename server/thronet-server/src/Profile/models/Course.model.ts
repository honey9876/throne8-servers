/**
 * Course Model - User Courses and Certifications
 * Stores courses, certificates, associated skills, and completion details
 * 
 * @module models/Course.model
 * @version 1.0.0
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== INTERFACES ====================

export interface ICertificate {
    certificateUrl: string;
    certificatePublicId: string;
    certificateSecureUrl: string;
    fileName: string;
    fileSize: number;
    fileType: 'image' | 'pdf';
    uploadedAt: Date;
}

export interface IProviderLogo {
    logoUrl: string;
    logoPublicId: string;
    logoSecureUrl: string;
    uploadedAt: Date;
}

export interface ICourse extends Document {
    courseId: string;
    userId: string;

    // Basic Info
    courseName: string;
    courseNumber?: string;  // Course ID/Code
    associatedSchool: string;  // Organization/Institution

    // Completion Details
    completionDate: {
        month: number;  // 1-12
        year: number;   // e.g., 2024
    };

    // Description
    description?: string;  // Max 500 chars

    // Certificate
    certificate?: ICertificate;

    // Provider Logo
    providerLogo?: IProviderLogo;

    // Skills Learned (References to Skill IDs)
    skillsLearned: string[];  // Array of Skill IDs

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

export interface ICourseModel extends Model<ICourse> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<ICourse[]>;
    getUserCourseCount(userId: string): Promise<number>;
    findActiveById(courseId: string, userId: string): Promise<ICourse | null>;
    reorderCourses(userId: string, courseIds: string[]): Promise<void>;
}

// ==================== SCHEMA ====================

const CertificateSchema = new Schema<ICertificate>({
    certificateUrl: {
        type: String,
        required: true,
        trim: true,
    },
    certificatePublicId: {
        type: String,
        required: true,
        trim: true,
    },
    certificateSecureUrl: {
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
    fileType: {
        type: String,
        enum: ['image', 'pdf'],
        required: true,
    },
    uploadedAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });

const ProviderLogoSchema = new Schema<IProviderLogo>({
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

const CourseSchema = new Schema<ICourse, ICourseModel>(
    {
        courseId: {
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
        courseName: {
            type: String,
            required: [true, 'Course name is required'],
            trim: true,
            minlength: [2, 'Course name must be at least 2 characters'],
            maxlength: [200, 'Course name cannot exceed 200 characters'],
        },
        courseNumber: {
            type: String,
            trim: true,
            maxlength: [50, 'Course number cannot exceed 50 characters'],
        },
        associatedSchool: {
            type: String,
            required: [true, 'Associated school/organization is required'],
            trim: true,
            minlength: [2, 'School name must be at least 2 characters'],
            maxlength: [200, 'School name cannot exceed 200 characters'],
        },

        // ==================== COMPLETION DETAILS ====================
        completionDate: {
            month: {
                type: Number,
                required: [true, 'Completion month is required'],
                min: [1, 'Month must be between 1 and 12'],
                max: [12, 'Month must be between 1 and 12'],
            },
            year: {
                type: Number,
                required: [true, 'Completion year is required'],
                min: [1900, 'Year must be after 1900'],
                max: [new Date().getFullYear() + 10, 'Year cannot be more than 10 years in future'],
            },
        },

        // ==================== DESCRIPTION ====================
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },

        // ==================== CERTIFICATE ====================
        certificate: CertificateSchema,

        // ==================== PROVIDER LOGO ====================
        providerLogo: ProviderLogoSchema,

        // ==================== SKILLS LEARNED ====================
        skillsLearned: {
            type: [String],
            default: [],
            validate: {
                validator: function (arr: string[]) {
                    return arr.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
                },
                message: 'Invalid skill ID format in array',
            },
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
        collection: 'courses',
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

CourseSchema.index({ userId: 1, displayOrder: 1 });
CourseSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
CourseSchema.index({ userId: 1, courseName: 1 });
CourseSchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================

/**
 * Check if course has certificate
 */
CourseSchema.virtual('hasCertificate').get(function (this: ICourse) {
    return !!(this.certificate && this.certificate.certificateUrl);
});

/**
 * Check if course has provider logo
 */
CourseSchema.virtual('hasProviderLogo').get(function (this: ICourse) {
    return !!(this.providerLogo && this.providerLogo.logoUrl);
});

/**
 * Get skills count
 */
CourseSchema.virtual('skillsCount').get(function (this: ICourse) {
    return this.skillsLearned ? this.skillsLearned.length : 0;
});

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Validate completion date is not in future (beyond 1 year)
 */
CourseSchema.pre('save', function (next) {
    const currentDate = new Date();
    const completionDate = new Date(this.completionDate.year, this.completionDate.month - 1);
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    if (completionDate > oneYearFromNow) {
        return next(new Error('Completion date cannot be more than 1 year in the future'));
    }

    next();
});

// ==================== STATIC METHODS ====================

/**
 * Find all courses by userId (excluding deleted)
 */
CourseSchema.statics.findByUserId = async function (userId: string, includeArchived: boolean = false): Promise<ICourse[]> {
    try {
        const query: any = { userId, isDeleted: false };

        if (!includeArchived) {
            query.isArchived = false;
        }

        return await this.find(query)
            .sort({ displayOrder: 1, createdAt: -1 })
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Find courses by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get total course count for user (excluding deleted)
 */
CourseSchema.statics.getUserCourseCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error : any) {
        LoggerUtil.error('Get course count failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Find active course by ID (not deleted, belongs to user)
 */
CourseSchema.statics.findActiveById = async function (courseId: string, userId: string): Promise<ICourse | null> {
    try {
        return await this.findOne({
            courseId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active course by ID failed', {
            error: (error as Error).message,
            courseId,
            userId,
        });
        throw error;
    }
};

/**
 * Reorder courses
 */
CourseSchema.statics.reorderCourses = async function (userId: string, courseIds: string[]): Promise<void> {
    try {
        const bulkOps = courseIds.map((courseId, index) => ({
            updateOne: {
                filter: { courseId, userId, isDeleted: false },
                update: { $set: { displayOrder: index } },
            },
        }));

        await this.bulkWrite(bulkOps);

        LoggerUtil.info('Courses reordered successfully', {
            userId,
            count: courseIds.length,
        });
    } catch (error : any) {
        LoggerUtil.error('Reorder courses failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const Course = mongoose.model<ICourse, ICourseModel>('Course', CourseSchema);
export default Course;