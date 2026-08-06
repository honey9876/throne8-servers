import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface ICommentReport extends Document {
    reportId: string;
    commentId: string;
    postId: string;
    reportedBy: string;      // kisne report kiya
    commentAuthorId: string; // jiska comment report hua
    reason: string;
    createdAt: Date;
}

export interface ICommentReportModel extends Model<ICommentReport> {
    hasAlreadyReported(commentId: string, reportedBy: string): Promise<boolean>;
}

const CommentReportSchema = new Schema<ICommentReport, ICommentReportModel>(
    {
        reportId: { type: String, required: true, unique: true, default: () => uuidv4() },
        commentId: { type: String, required: true },
        postId: { type: String, required: true },
        reportedBy: { type: String, required: true },
        commentAuthorId: { type: String, required: true },
        reason: { type: String, default: 'not_specified', trim: true, maxlength: 500 },
    },
    { timestamps: { createdAt: true, updatedAt: false }, collection: 'comment_reports' }
);

// ✅ Ek user ek comment ko sirf ek baar report kar sake
CommentReportSchema.index({ commentId: 1, reportedBy: 1 }, { unique: true });
CommentReportSchema.index({ commentAuthorId: 1, createdAt: -1 });

CommentReportSchema.statics.hasAlreadyReported = function (commentId: string, reportedBy: string) {
    return this.exists({ commentId, reportedBy }).then((r: any) => !!r);
};

const CommentReport = mongoose.model<ICommentReport, ICommentReportModel>('CommentReport', CommentReportSchema);
export default CommentReport;