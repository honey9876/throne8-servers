/**
 * Education Model - User Educational Background
 * Stores academic history (schools, colleges, universities)
 * 
 * @module models/Education.model
 * @version 1.0.0
 */

import { LoggerUtil } from '@/shared/logger.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
// import { LoggerUtil } from '../utils/logger.util';

// ==================== INTERFACES ====================

export interface IEducation extends Document {
    educationId: string;
    userId: string;

    // Basic Info
    schoolCollegeName: string;        // School/College/University Name
    degree: string;                   // Degree/Grade (e.g., "B.Tech", "10th Grade")
    degreeType: 'High School' | 'Diploma' | "Bachelor's" | "Master's" | 'Doctorate' | 'Certificate' | 'Other';
    specialization?: string;          // Field of study/specialization (e.g., "Computer Science")

    // Dates
    startDate: Date;                  // Start date (required)
    endDate?: Date;                   // End date (null = Present/Ongoing)
    isOngoing: boolean;               // Is this current education?

    // Optional Details
    description?: string;             // Activities, achievements, coursework
    educationType?: 'full-time' | 'part-time' | 'distance' | 'online';

    // Grade Information (Optional)
    gradeType?: 'percentage' | 'cgpa' | 'gpa' | 'grade';
    gradeValue?: string;              // e.g., "85.5", "8.5", "A", "First Class"

    // Location (Optional)
    location?: string;                // City/Country

    // Metadata
    createdAt: Date;
    updatedAt: Date;

    // Soft Delete / Archive
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;

    // Virtuals
    duration: string;                 // e.g., "4 years"
}

export interface IEducationModel extends Model<IEducation> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<IEducation[]>;
    getUserEducationCount(userId: string): Promise<number>;
    findActiveById(educationId: string, userId: string): Promise<IEducation | null>;
}

// ==================== SCHEMA ====================

const EducationSchema = new Schema<IEducation, IEducationModel>(
    {
        educationId: {
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
        schoolCollegeName: {
            type: String,
            required: [true, 'School/College name is required'],
            trim: true,
            minlength: [2, 'School/College name must be at least 2 characters'],
            maxlength: [200, 'School/College name cannot exceed 200 characters'],
            validate: {
                validator: (v: string) => /^[A-Z0-9][a-zA-Z0-9\s\-'.&(),]+$/.test(v),
                message: 'School/College name must start with a capital letter or number',
            },
            index: true,
        },
        degree: {
            type: String,
            required: [true, 'Degree is required'],
            trim: true,
            minlength: [2, 'Degree must be at least 2 characters'],
            maxlength: [100, 'Degree cannot exceed 100 characters'],
            validate: {
                validator: (v: string) => /^[A-Z0-9][a-zA-Z0-9\s\-.()]+$/.test(v),
                message: 'Degree must start with a capital letter or number',
            },
            index: true,
        },
        degreeType: {
            type: String,
            required: [true, 'Degree type is required'],
            enum: ['High School', 'Diploma', "Bachelor's", "Master's", 'Doctorate', 'Certificate', 'Other'],
            validate: {
                validator: (v: string) => ['High School', 'Diploma', "Bachelor's", "Master's", 'Doctorate', 'Certificate', 'Other'].includes(v),
                message: 'Invalid degree type',
            },
            index: true,
        },
        specialization: {
            type: String,
            trim: true,
            minlength: [2, 'Specialization must be at least 2 characters'],
            maxlength: [150, 'Specialization cannot exceed 150 characters'],
            validate: {
                validator: function (v: string | undefined) {
                    if (!v) return true;
                    return /^[A-Z][a-zA-Z\s\-&(),]+$/.test(v);
                },
                message: 'Specialization must start with a capital letter',
            },
            index: true,
        },

        // ==================== DATES ====================
        startDate: {
            type: Date,
            required: [true, 'Start date is required'],
            validate: {
                validator: function (v: Date) {
                    const year = v.getFullYear();
                    return year >= 1970 && year <= new Date().getFullYear() + 5;
                },
                message: 'Start date must be between 1970 and current year + 5',
            },
            index: true,
        },
        endDate: {
            type: Date,
            default: null,
            validate: {
                validator: function (this: IEducation, v: Date | null | undefined) {
                    if (!v) return true; // null/undefined is valid (ongoing)

                    // End date must be after start date
                    if (this.startDate && v < this.startDate) {
                        return false;
                    }

                    // End date year validation
                    const year = v.getFullYear();
                    return year >= 1970 && year <= new Date().getFullYear() + 5;
                },
                message: 'End date must be after start date and not in distant future',
            },
        },
        isOngoing: {
            type: Boolean,
            default: function (this: IEducation) {
                return !this.endDate;
            },
            index: true,
        },

        // ==================== OPTIONAL DETAILS ====================
        description: {
            type: String,
            trim: true,
            minlength: [10, 'Description must be at least 10 characters'],
            maxlength: [5000, 'Description cannot exceed 5000 characters'],
        },
        educationType: {
            type: String,
            enum: ['full-time', 'part-time', 'distance', 'online'],
            lowercase: true,
            index: true,
        },

        // ==================== GRADE INFO ====================
        gradeType: {
            type: String,
            enum: ['percentage', 'cgpa', 'gpa', 'grade'],
            lowercase: true,
        },
        gradeValue: {
            type: String,
            trim: true,
            maxlength: [20, 'Grade value cannot exceed 20 characters'],
            validate: {
                validator: function (this: IEducation, v: string | undefined) {
                    if (!v) return true;

                    // Validate based on gradeType
                    if (this.gradeType === 'percentage') {
                        // Must be number between 0-100
                        const num = parseFloat(v);
                        return !isNaN(num) && num >= 0 && num <= 100;
                    } else if (this.gradeType === 'cgpa') {
                        // Must be number between 0-10
                        const num = parseFloat(v);
                        return !isNaN(num) && num >= 0 && num <= 10;
                    } else if (this.gradeType === 'gpa') {
                        // Must be number between 0-4
                        const num = parseFloat(v);
                        return !isNaN(num) && num >= 0 && num <= 4;
                    } else if (this.gradeType === 'grade') {
                        // Any string (e.g., "A+", "First Class")
                        return true;
                    }

                    return true;
                },
                message: 'Invalid grade value for selected grade type',
            },
        },

        // ==================== LOCATION ====================
        location: {
            type: String,
            trim: true,
            maxlength: [100, 'Location cannot exceed 100 characters'],
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
        collection: 'educations',
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

EducationSchema.index({ userId: 1, startDate: -1 });           // User's education sorted by start date
EducationSchema.index({ userId: 1, isOngoing: 1 });            // Current education
EducationSchema.index({ userId: 1, degree: 1 });               // Filter by degree
EducationSchema.index({ userId: 1, schoolCollegeName: 1 });    // Filter by institution
EducationSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 }); // Soft delete and archive
EducationSchema.index({ createdAt: -1 });                      // Recent education

// ==================== VIRTUALS ====================

/**
 * Calculate duration between start and end date
 */
EducationSchema.virtual('duration').get(function (this: IEducation) {
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

/**
 * Pre-save: Auto-set isOngoing based on endDate
 */
EducationSchema.pre('save', function (next) {
    this.isOngoing = !this.endDate;
    next();
});

/**
 * Pre-save: Validate date logic
 */
EducationSchema.pre('save', function (next) {
    if (this.endDate && this.startDate && this.endDate < this.startDate) {
        return next(new Error('End date must be after start date'));
    }

    // Education can be short (e.g., courses), so minimum 1 day
    if (this.endDate && this.startDate) {
        const diffMs = this.endDate.getTime() - this.startDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffDays < 1) {
            return next(new Error('Minimum education duration is 1 day'));
        }
    }

    next();
});

/**
 * Pre-save: Validate grade consistency
 */
EducationSchema.pre('save', function (next) {
    // If gradeValue is provided, gradeType must also be provided
    if (this.gradeValue && !this.gradeType) {
        return next(new Error('Grade type is required when grade value is provided'));
    }

    next();
});

// ==================== STATIC METHODS ====================

/**
 * Find all education by userId (excluding deleted)
 */
EducationSchema.statics.findByUserId = async function (userId: string, includeArchived: boolean = false): Promise<IEducation[]> {
    try {
        const query: any = { userId, isDeleted: false };

        if (!includeArchived) {
            query.isArchived = false;
        }

        return await this.find(query)
            .sort({ startDate: -1 })  // Most recent first
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Find education by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get total education count for user (excluding deleted)
 */
EducationSchema.statics.getUserEducationCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error : any) {
        LoggerUtil.error('Get education count failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Find active education by ID (not deleted, belongs to user)
 */
EducationSchema.statics.findActiveById = async function (educationId: string, userId: string): Promise<IEducation | null> {
    try {
        return await this.findOne({
            educationId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active education by ID failed', {
            error: (error as Error).message,
            educationId,
            userId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const Education = mongoose.model<IEducation, IEducationModel>('Education', EducationSchema);
export default Education;