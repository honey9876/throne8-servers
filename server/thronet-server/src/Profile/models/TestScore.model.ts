/**
 * Test Score Model - User Test/Exam Scores
 * Stores standardized test scores with validity tracking
 * 
 * @module models/TestScore.model
 * @version 1.0.0
 */

import { LoggerUtil } from '@/shared/logger.util';
import Constants from '@/shared/constants.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

export interface ITestScore extends Document {
    testScoreId: string;
    userId: string;

    // Basic Info
    testName: 'GRE' | 'GMAT' | 'TOEFL' | 'IELTS' | 'SAT' | 'ACT' | 'LSAT' | 'MCAT' |
    'CAT' | 'JEE' | 'NEET' | 'GATE' | 'UPSC' | 'PTE' | 'Duolingo English Test' | 'Other';
    score: string;                    // e.g., "320/340", "7.5", "1450"
    testDate: Date;                   // Month & Year

    // Optional Details
    description?: string;
    associatedSchool?: string;        // School/College name (optional)

    // Validity
    expirationDate?: Date;            // Auto-calculated or manual
    isExpired: boolean;               // Auto-calculated based on expiration date
    validityYears?: number;           // Custom validity period

    // Display Order
    displayOrder: number;             // For reordering

    // Metadata
    createdAt: Date;
    updatedAt: Date;

    // Soft Delete / Archive
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;

    // Virtuals
    isValid: boolean;                 // Not expired
    daysUntilExpiration?: number;     // Days remaining
}

export interface ITestScoreModel extends Model<ITestScore> {
    findByUserId(userId: string, includeArchived?: boolean): Promise<ITestScore[]>;
    getUserTestScoreCount(userId: string): Promise<number>;
    findActiveById(testScoreId: string, userId: string): Promise<ITestScore | null>;
    reorderTestScores(userId: string, orderedIds: string[]): Promise<void>;
}

// ==================== SCHEMA ====================

const TestScoreSchema = new Schema<ITestScore, ITestScoreModel>(
    {
        testScoreId: {
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
        testName: {
            type: String,
            required: [true, 'Test name is required'],
            enum: [
                'GRE',
                'GMAT',
                'TOEFL',
                'IELTS',
                'SAT',
                'ACT',
                'LSAT',
                'MCAT',
                'CAT',
                'JEE',
                'NEET',
                'GATE',
                'UPSC',
                'PTE',
                'Duolingo English Test',
                'Other'
            ],
        },
        score: {
            type: String,
            required: [true, 'Score is required'],
            trim: true,
            minlength: [1, 'Score must be at least 1 character'],
            maxlength: [50, 'Score cannot exceed 50 characters'],
            validate: {
                validator: (v: string) => /^[0-9.\/\s-]+$/.test(v),
                message: 'Score must contain only numbers, dots, slashes, spaces, or hyphens',
            },
        },
        testDate: {
            type: Date,
            required: [true, 'Test date is required'],
            validate: {
                validator: function (v: Date) {
                    const year = v.getFullYear();
                    return year >= 1970 && year <= new Date().getFullYear() + 1;
                },
                message: 'Test date must be between 1970 and current year + 1',
            },
        },

        // ==================== OPTIONAL DETAILS ====================
        description: {
            type: String,
            trim: true,
            minlength: [10, 'Description must be at least 10 characters'],
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },
        associatedSchool: {
            type: String,
            trim: true,
            minlength: [2, 'School name must be at least 2 characters'],
            maxlength: [200, 'School name cannot exceed 200 characters'],
        },

        // ==================== VALIDITY ====================
        expirationDate: {
            type: Date,
        },
        isExpired: {
            type: Boolean,
            default: false,
        },
        validityYears: {
            type: Number,
            min: [1, 'Validity must be at least 1 year'],
            max: [20, 'Validity cannot exceed 20 years'],
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
        collection: 'test_scores',
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

TestScoreSchema.index({ userId: 1, displayOrder: 1 });
TestScoreSchema.index({ userId: 1, testDate: -1 });
TestScoreSchema.index({ userId: 1, testName: 1 });
TestScoreSchema.index({ userId: 1, isDeleted: 1, isArchived: 1 });
TestScoreSchema.index({ userId: 1, isExpired: 1 });
TestScoreSchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================

/**
 * Check if test score is valid (not expired)
 */
TestScoreSchema.virtual('isValid').get(function (this: ITestScore) {
    if (!this.expirationDate) {
        return true; // No expiration = always valid
    }
    return new Date() < this.expirationDate;
});

/**
 * Calculate days until expiration
 */
TestScoreSchema.virtual('daysUntilExpiration').get(function (this: ITestScore) {
    if (!this.expirationDate) {
        return null;
    }
    const now = new Date();
    const diffMs = this.expirationDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
});

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Calculate expiration date
 */
TestScoreSchema.pre('save', function (next) {
    if (this.isModified('testDate') || this.isModified('testName') || this.isModified('validityYears')) {
        // Get validity years (custom or default based on test name)
        let validityYears = this.validityYears;

        if (!validityYears) {
            // @ts-ignore
            const validityConfig = Constants.TEST_SCORE_VALIDATION.VALIDITY_YEARS;
            validityYears = validityConfig[this.testName as keyof typeof validityConfig] || validityConfig.DEFAULT || 2;
        }

        // Calculate expiration date
        const expirationDate = new Date(this.testDate);
        expirationDate.setFullYear(expirationDate.getFullYear() + (validityYears || 2));
        this.expirationDate = expirationDate;

        // Set isExpired flag
        this.isExpired = new Date() >= this.expirationDate;
    }
    next();
});

/**
 * Pre-save: Auto-set display order for new documents
 */
TestScoreSchema.pre('save', async function (next) {
    if (this.isNew && this.displayOrder === 0) {
        try {
            const maxOrder = await (this.constructor as Model<ITestScore>).findOne(
                { userId: this.userId, isDeleted: false },
                { displayOrder: 1 }
            ).sort({ displayOrder: -1 }).lean();

            this.displayOrder = maxOrder ? (maxOrder.displayOrder || 0) + 1 : 1;
        } catch (error : any) {
            LoggerUtil.error('Error setting display order', { error: (error as Error).message });
        }
    }
    next();
});

// ==================== STATIC METHODS ====================

/**
 * Find all test scores by userId (excluding deleted)
 */
TestScoreSchema.statics.findByUserId = async function (userId: string, includeArchived: boolean = false): Promise<ITestScore[]> {
    try {
        const query: any = { userId, isDeleted: false };

        if (!includeArchived) {
            query.isArchived = false;
        }

        return await this.find(query)
            .sort({ displayOrder: 1, testDate: -1 })
            .exec();
    } catch (error : any) {
        LoggerUtil.error('Find test scores by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Get total test score count for user (excluding deleted)
 */
TestScoreSchema.statics.getUserTestScoreCount = async function (userId: string): Promise<number> {
    try {
        return await this.countDocuments({ userId, isDeleted: false });
    } catch (error : any) {
        LoggerUtil.error('Get test score count failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Find active test score by ID (not deleted, belongs to user)
 */
TestScoreSchema.statics.findActiveById = async function (testScoreId: string, userId: string): Promise<ITestScore | null> {
    try {
        return await this.findOne({
            testScoreId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active test score by ID failed', {
            error: (error as Error).message,
            testScoreId,
            userId,
        });
        throw error;
    }
};

/**
 * Reorder test scores
 */
TestScoreSchema.statics.reorderTestScores = async function (userId: string, orderedIds: string[]): Promise<void> {
    try {
        // Validate all IDs belong to user
        const testScores = await this.find({
            testScoreId: { $in: orderedIds },
            userId,
            isDeleted: false,
        });

        if (testScores.length !== orderedIds.length) {
            throw new Error('Invalid test score IDs provided');
        }

        // Update display order
        const updatePromises = orderedIds.map((testScoreId, index) =>
            this.updateOne(
                { testScoreId, userId },
                { $set: { displayOrder: index + 1 } }
            )
        );

        await Promise.all(updatePromises);

        LoggerUtil.info('Test scores reordered successfully', {
            userId,
            count: orderedIds.length,
        });
    } catch (error : any) {
        LoggerUtil.error('Reorder test scores failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const TestScore = mongoose.model<ITestScore, ITestScoreModel>('TestScore', TestScoreSchema);
export default TestScore;