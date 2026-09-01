import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface ICompanyPostCommentDocument extends Document {
  commentId: string;
  postId: string;
  companyId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const CompanyPostCommentSchema = new Schema<ICompanyPostCommentDocument>(
  {
    commentId: { type: String, default: () => uuidv4(), unique: true },
    postId: { type: String, required: true, index: true },
    companyId: { type: String, index: true },
    userId: { type: String, required: true, index: true },
    userName: { type: String, required: true },
    userAvatar: { type: String, default: null },
    text: { type: String, required: true, trim: true, minlength: 1 },
  },
  { timestamps: true, collection: 'company_post_comments' }
);

CompanyPostCommentSchema.index({ postId: 1, createdAt: -1 });

const CompanyPostComment: Model<ICompanyPostCommentDocument> =
  mongoose.models.CompanyPostComment ||
  mongoose.model<ICompanyPostCommentDocument>('CompanyPostComment', CompanyPostCommentSchema);

export default CompanyPostComment;
