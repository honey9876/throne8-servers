import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

export type ReportReason =
    | 'spam_or_misleading'
    | 'harassment_or_bullying'
    | 'hate_speech'
    | 'nudity_or_sexual_content'
    | 'false_information'
    | 'something_else';

export type ReportStatus = 'pending' | 'reviewed' | 'action_taken' | 'dismissed';

export interface IReport extends Document {
    reportId: string;
    postId: string;
    reporterId: string;
    postOwnerId?: string;
    reason: ReportReason;
    details?: string;
    status: ReportStatus;
    reviewedBy?: string;
    reviewedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IReportModel extends Model<IReport> {
    findByPostId(postId: string): Promise<IReport[]>;
    findByReporter(reporterId: string): Promise<IReport[]>;
    hasAlreadyReported(postId: string, reporterId: string): Promise<boolean>;
    getPendingReports(limit?: number): Promise<IReport[]>;
}

const REASON_VALUES: ReportReason[] = [
    'spam_or_misleading',
    'harassment_or_bullying',
    'hate_speech',
    'nudity_or_sexual_content',
    'false_information',
    'something_else',
];

const ReportSchema = new Schema<IReport, IReportModel>(
    {
        reportId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            immutable: true,
        },
        postId: {
            type: String,
            required: [true, 'Post ID is required'],
            index: true,
        },
        reporterId: {
            type: String,
            required: [true, 'Reporter ID is required'],
            validate: {
                validator: (v: string) =>
                    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid reporter User ID format',
            },
        },
        postOwnerId: { type: String },
        reason: {
            type: String,
            enum: REASON_VALUES,
            required: [true, 'Reason is required'],
        },
        details: { type: String, trim: true, maxlength: 500 },
        status: {
            type: String,
            enum: ['pending', 'reviewed', 'action_taken', 'dismissed'],
            default: 'pending',
        },
        reviewedBy: { type: String },
        reviewedAt: { type: Date },
    },
    {
        timestamps: true,
        collection: 'reports',
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

// Ek user ek post ko sirf ek baar report kar sake — duplicate reports rokta hai
ReportSchema.index({ postId: 1, reporterId: 1 }, { unique: true });
ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ reporterId: 1, createdAt: -1 });

ReportSchema.statics.findByPostId = async function (postId: string): Promise<IReport[]> {
    try {
        return await this.find({ postId }).sort({ createdAt: -1 }).exec();
    } catch (error: unknown) {
        LoggerUtil.error('Find reports by postId failed', { error: (error as Error).message, postId });
        throw error;
    }
};

ReportSchema.statics.findByReporter = async function (reporterId: string): Promise<IReport[]> {
    try {
        return await this.find({ reporterId }).sort({ createdAt: -1 }).exec();
    } catch (error: unknown) {
        LoggerUtil.error('Find reports by reporter failed', { error: (error as Error).message, reporterId });
        throw error;
    }
};

ReportSchema.statics.hasAlreadyReported = async function (
    postId: string,
    reporterId: string
): Promise<boolean> {
    try {
        const existing = await this.findOne({ postId, reporterId }).exec();
        return !!existing;
    } catch (error: unknown) {
        LoggerUtil.error('Check existing report failed', { error: (error as Error).message, postId, reporterId });
        throw error;
    }
};

ReportSchema.statics.getPendingReports = async function (limit = 50): Promise<IReport[]> {
    try {
        return await this.find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();
    } catch (error: unknown) {
        LoggerUtil.error('Get pending reports failed', { error: (error as Error).message });
        throw error;
    }
};

const Report = mongoose.model<IReport, IReportModel>('Report', ReportSchema);
export default Report;