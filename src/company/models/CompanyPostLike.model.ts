import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface ICompanyPostLikeDocument extends Document {
  likeId: string;
  postId: string;
  userId: string;
  createdAt: Date;
}

const CompanyPostLikeSchema = new Schema<ICompanyPostLikeDocument>(
  {
    likeId: { type: String, default: () => uuidv4(), unique: true },
    postId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
  },
  { timestamps: true, collection: 'company_post_likes' }
);

CompanyPostLikeSchema.index({ postId: 1, userId: 1 }, { unique: true });

const CompanyPostLike: Model<ICompanyPostLikeDocument> =
  mongoose.models.CompanyPostLike ||
  mongoose.model<ICompanyPostLikeDocument>('CompanyPostLike', CompanyPostLikeSchema);

export default CompanyPostLike;
