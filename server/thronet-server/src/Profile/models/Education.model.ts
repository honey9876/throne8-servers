import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

export interface IEducation extends Document {
    educationId: string;
    userId: string;
    schoolCollegeName: string;
    degree: string;
    degreeType: 'High School' | 'Diploma' | "Bachelor's" | "Master's" | 'Doctorate' | 'Certificate' | 'Other';
    specialization?: string;
    startDate: Date;
    endDate?: Date;
    isOngoing: boolean;
    description?: string;
    educationType?: 'full-time' | 'part-time' | 'distance' | 'online';
    gradeType?: 'percentage' | 'cgpa' | 'gpa' | 'grade';
    gradeValue?: string;
    location?: string;
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    duration: string;
}

export interface IEducationModel extends Model<IEducation> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<IEducation[]>;
    getUserEducationCount(userId: string): Promise<number>;
    findActiveById(educationId: string, userId: string): Promise<IEducation | null>;
}

const EducationSchema = new Schema<IEducation, IEducationModel>(
    {
        educationId: {
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
        },
        degreeType: {
            type: String,
            required: [true, 'Degree type is required'],
            enum: ['High School', 'Diploma', "Bachelor's", "Master's", 'Doctorate', 'Certificate', 'Other'],
        },
        specialization: {
            type: String,
            trim: true,
            minlength: [2, 'Specialization must be at least 2 characters'],
            maxlength: [150, 'Specialization cannot exceed 150 characters'],
            validate: {
                validator: (v: string | undefined) => !v || /^[A-Z][a-zA-Z\s\-&(),]+$/.test(v),
                message: 'Specialization must start with a capital letter',
            },
        },
        startDate: {
            type: Date,
            required: [true, 'Start date is required'],
            validate: {
                validator: (v: Date) => {
                    const year = v.getFullYear();
                    return year >= 1970 && year <= new Date().getFullYear() + 5;
                },
                message: 'Start date must be between 1970 and current year + 5',
            },
        },
        endDate: {
            type: Date,
            default: null,
            validate: {
                validator: function (this: IEducation, v: Date | null | undefined) {
                    if (!v) return true;
                    if (this.startDate && v < this.startDate) return false;
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
        },
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
        },
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
                    if (this.gradeType === 'percentage') {
                        const num = parseFloat(v);
                        return !isNaN(num) && num >= 0 && num <= 100;
                    }
                    if (this.gradeType === 'cgpa') {
                        const num = parseFloat(v);
                        return !isNaN(num) && num >= 0 && num <= 10;
                    }
                    if (this.gradeType === 'gpa') {
                        const num = parseFloat(v);
                        return !isNaN(num) && num >= 0 && num <= 4;
                    }
                    return true;
                },
                message: 'Invalid grade value for selected grade type',
            },
        },
        location: { type: String, trim: true, maxlength: [100, 'Location cannot exceed 100 characters'] },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        isArchived: { type: Boolean, default: false },
        archivedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        collection: 'educations',
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

EducationSchema.index({ userId: 1, startDate: -1 });
EducationSchema.index({ userId: 1, isOngoing: 1 });
EducationSchema.index({ userId: 1, degree: 1 });
EducationSchema.index({ userId: 1, schoolCollegeName: 1 });
EducationSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
EducationSchema.index({ createdAt: -1 });

EducationSchema.virtual('duration').get(function (this: IEducation) {
    const start = new Date(this.startDate);
    const end = this.endDate ? new Date(this.endDate) : new Date();
    const diffMonths = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const years = Math.floor(diffMonths / 12);
    const months = diffMonths % 12;
    if (years === 0) return months === 1 ? '1 month' : `${months} months`;
    if (months === 0) return years === 1 ? '1 year' : `${years} years`;
    return `${years === 1 ? '1 year' : `${years} years`} ${months === 1 ? '1 month' : `${months} months`}`;
});

EducationSchema.pre('save', function (next) {
    this.isOngoing = !this.endDate;
    next();
});

EducationSchema.pre('save', function (next) {
    if (this.endDate && this.startDate && this.endDate < this.startDate) {
        return next(new Error('End date must be after start date'));
    }
    if (this.endDate && this.startDate) {
        const diffDays = (this.endDate.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < 1) return next(new Error('Minimum education duration is 1 day'));
    }
    next();
});

EducationSchema.pre('save', function (next) {
    if (this.gradeValue && !this.gradeType) {
        return next(new Error('Grade type is required when grade value is provided'));
    }
    next();
});

EducationSchema.statics.findByUserId = async function (
    userId: string,
    includeArchived = false
): Promise<IEducation[]> {
    try {
        const query: Record<string, unknown> = { userId, isDeleted: false };
        if (!includeArchived) query.isArchived = false;
        return await this.find(query).sort({ startDate: -1 }).exec();
    } catch (error: unknown) {
        LoggerUtil.error('Find education by userId failed', { error: (error as Error).message, userId });
        throw error;
    }
};

EducationSchema.statics.getUserEducationCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error: unknown) {
        LoggerUtil.error('Get education count failed', { error: (error as Error).message, userId });
        throw error;
    }
};

EducationSchema.statics.findActiveById = async function (
    educationId: string,
    userId: string
): Promise<IEducation | null> {
    try {
        return await this.findOne({ educationId, userId, isDeleted: false }).exec();
    } catch (error: unknown) {
        LoggerUtil.error('Find active education by ID failed', {
            error: (error as Error).message,
            educationId,
            userId,
        });
        throw error;
    }
};

const Education = mongoose.model<IEducation, IEducationModel>('Education', EducationSchema);
export default Education;