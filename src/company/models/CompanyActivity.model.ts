import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface ICompanyActivityDocument extends Document {
  activityId: string;
  companyId: string;
  type: 'review' | 'follow' | 'like' | 'comment' | 'apply' | 'event';
  user: string;
  avatar: string;
  color: string;
  action: string;
  read: boolean;
  targetId?: string;
  reviewData?: {
    rating: number;
    title: string;
    content: string;
    isAnonymous: boolean;
    isVerified: boolean;
    sentiment: 'positive' | 'neutral' | 'negative';
    existingResponse?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const CompanyActivitySchema = new Schema<ICompanyActivityDocument>(
  {
    activityId: { type: String, default: () => uuidv4(), unique: true },
    companyId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['review', 'follow', 'like', 'comment', 'apply', 'event'],
      required: true,
      index: true,
    },
    user: { type: String, required: true },
    avatar: { type: String, default: 'US' },
    color: { type: String, default: 'bg-blue-500' },
    action: { type: String, required: true },
    read: { type: Boolean, default: false, index: true },
    targetId: { type: String },
    reviewData: {
      rating: Number,
      title: String,
      content: String,
      isAnonymous: Boolean,
      isVerified: Boolean,
      sentiment: String,
      existingResponse: String,
    },
  },
  { timestamps: true, collection: 'company_activities' }
);

CompanyActivitySchema.index({ companyId: 1, createdAt: -1 });

const CompanyActivity: Model<ICompanyActivityDocument> =
  mongoose.models.CompanyActivity || mongoose.model<ICompanyActivityDocument>('CompanyActivity', CompanyActivitySchema);

export default CompanyActivity;
