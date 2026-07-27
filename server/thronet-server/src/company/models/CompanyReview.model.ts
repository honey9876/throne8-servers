import { v4 as uuidv4 } from 'uuid';
import mongoose, { Model, Document, Schema } from 'mongoose';
import Company from './Company.model';
import logger from '@/shared/logger.util';

// Define interface for review document
export interface ICompanyReviewDocument extends Document {
  company: mongoose.Types.ObjectId;
  reviewId: string;
  reviewer: string;
  title: string;
  content: string;
  rating: {
    overall: number;
    culture?: number;
    workLifeBalance?: number;
    management?: number;
    compensation?: number;
  };
  type: 'Current Employee' | 'Former Employee' | 'Contractor';
  pros?: string[];
  cons?: string[];
  recommendToOthers?: boolean;
  helpfulCount: number;
  notHelpfulCount: number;
  responses: Array<{
    respondent: string;
    content: string;
    respondedAt: Date;
  }>;
  isVerified: boolean;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Define interface for instance methods
interface IReviewMethods {
  vote(helpful: boolean): Promise<ICompanyReviewDocument>;
  addResponse(respondentId: string, content: string): Promise<ICompanyReviewDocument>;
  publish(): Promise<ICompanyReviewDocument>;
  unpublish(): Promise<ICompanyReviewDocument>;
  verify(): Promise<ICompanyReviewDocument>;
}

// Define interface for static methods
interface ICompanyReviewModel extends Model<ICompanyReviewDocument, Record<string, never>, IReviewMethods> {
  getCompanyStats(companyId: string): Promise<{
    totalReviews: number;
    averageRating: number;
    ratingDistribution: Record<number, number>;
    categoryAverages: {
      culture?: number;
      workLifeBalance?: number;
      management?: number;
      compensation?: number;
    };
    recommendationRate?: number;
  }>;
  findPublished(): mongoose.Query<ICompanyReviewDocument[], ICompanyReviewDocument>;
  findByCompany(companyId: string): mongoose.Query<ICompanyReviewDocument[], ICompanyReviewDocument>;
  findTopRated(limit?: number): mongoose.Query<ICompanyReviewDocument[], ICompanyReviewDocument>;
  findRecent(limit?: number): mongoose.Query<ICompanyReviewDocument[], ICompanyReviewDocument>;
}

//=======================================
//schema
//====================================


export const CompanyReviewSchema = new Schema(
  {
    reviewId: {
      type: String,
      required: true,
      unique: true,
      default: uuidv4,
    },
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    reviewer: {
      type: String,  // UUID store hoga
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Review title is required'],
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Review content is required'],
      minlength: [20, 'Review must be at least 20 characters'],
    },
    rating: {
      overall: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
      },
      culture: {
        type: Number,
        min: 1,
        max: 5,
      },
      workLifeBalance: {
        type: Number,
        min: 1,
        max: 5,
      },
      management: {
        type: Number,
        min: 1,
        max: 5,
      },
      compensation: {
        type: Number,
        min: 1,
        max: 5,
      },
    },
    type: {
      type: String,
      enum: ['Current Employee', 'Former Employee', 'Contractor'],
      required: true,
    },
    pros: [String],
    cons: [String],
    recommendToOthers: Boolean,
    helpfulCount: {
      type: Number,
      default: 0,
    },
    notHelpfulCount: {
      type: Number,
      default: 0,
    },
    responses: [{
      respondent: {
        type: String,  // UUID store hoga
      },
      content: String,
      respondedAt: { type: Date, default: Date.now },
    }],
    isVerified: {
      type: Boolean,
      default: false,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'companyReviews',
  }
);

// Indexes
CompanyReviewSchema.index({ company: 1, isPublished: 1 });
CompanyReviewSchema.index({ 'rating.overall': -1 });
CompanyReviewSchema.index({ createdAt: -1 });


// ========================================
// INSTANCE METHODS
// ========================================

// Vote on review (helpful/not helpful)
CompanyReviewSchema.methods.vote = async function (
  this: ICompanyReviewDocument,
  helpful: boolean
): Promise<ICompanyReviewDocument> {
  if (helpful) {
    this.helpfulCount += 1;
  } else {
    this.notHelpfulCount += 1;
  }
  return this.save();
};

// Add company response to review
CompanyReviewSchema.methods.addResponse = async function (
  this: ICompanyReviewDocument,
  respondentId: string,
  content: string
): Promise<ICompanyReviewDocument> {
  this.responses.push({
    respondent: respondentId,  // ✅ UUID string directly
    content,
    respondedAt: new Date(),
  });
  return this.save();
};

// Publish review
CompanyReviewSchema.methods.publish = async function (this: ICompanyReviewDocument): Promise<ICompanyReviewDocument> {
  this.isPublished = true;

  // Update company review count
  try {
    await Company.findByIdAndUpdate(this.company, {
      $inc: { 'stats.reviewsCount': 1 }
    });
  } catch (error: any) {
    logger.error('Failed to update company review count:', error);
  }

  return this.save();
};

// Unpublish review
CompanyReviewSchema.methods.unpublish = async function (this: ICompanyReviewDocument): Promise<ICompanyReviewDocument> {
  this.isPublished = false;

  // Update company review count
  try {
    await Company.findByIdAndUpdate(this.company, {
      $inc: { 'stats.reviewsCount': -1 }
    });
  } catch (error: any) {
    logger.error('Failed to update company review count:', error);
  }

  return this.save();
};

// Verify review
CompanyReviewSchema.methods.verify = async function (this: ICompanyReviewDocument): Promise<ICompanyReviewDocument> {
  this.isVerified = true;
  return this.save();
};

// ========================================
// STATIC METHODS
// ========================================

// Calculate company statistics from reviews
CompanyReviewSchema.statics.getCompanyStats = async function (
  companyId: string
): Promise<{
  totalReviews: number;
  averageRating: number;
  ratingDistribution: Record<number, number>;
  categoryAverages: {
    culture?: number;
    workLifeBalance?: number;
    management?: number;
    compensation?: number;
  };
  recommendationRate?: number;
}> {
  const reviews = await this.find({
    company: companyId,
    isPublished: true,
  });

  if (reviews.length === 0) {
    return {
      totalReviews: 0,
      averageRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      categoryAverages: {},
      recommendationRate: 0,
    };
  }

  // ✅ FIX: Add explicit types to reduce callback parameters
  const totalRating = reviews.reduce((sum: number, review: ICompanyReviewDocument) => sum + review.rating.overall, 0);
  const averageRating = Number((totalRating / reviews.length).toFixed(2));

  // Calculate rating distribution
  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach((review: ICompanyReviewDocument) => {
    const rounded = Math.round(review.rating.overall);
    ratingDistribution[rounded] = (ratingDistribution[rounded] || 0) + 1;
  });

  // Calculate category averages
  const categoryAverages: {
    culture?: number;
    workLifeBalance?: number;
    management?: number;
    compensation?: number;
  } = {};

  const categories: Array<'culture' | 'workLifeBalance' | 'management' | 'compensation'> = [
    'culture',
    'workLifeBalance',
    'management',
    'compensation',
  ];

  categories.forEach((category) => {
    const validRatings = reviews
      .map((review: ICompanyReviewDocument) => review.rating[category] as number | undefined)
      .filter((rating: number | undefined): rating is number => rating !== undefined && rating !== null);

    if (validRatings.length > 0) {
      const sum = validRatings.reduce((acc: number, rating: number) => acc + rating, 0);
      categoryAverages[category] = Number((sum / validRatings.length).toFixed(2));
    }
  });

  // Calculate recommendation rate
  const reviewsWithRecommendation = reviews.filter(
    (review: ICompanyReviewDocument) => review.recommendToOthers !== undefined
  );
  const recommendationRate =
    reviewsWithRecommendation.length > 0
      ? Number(
        (
          (reviewsWithRecommendation.filter((review: ICompanyReviewDocument) => review.recommendToOthers === true)
            .length /
            reviewsWithRecommendation.length) *
          100
        ).toFixed(2)
      )
      : undefined;

  return {
    totalReviews: reviews.length,
    averageRating,
    ratingDistribution,
    categoryAverages,
    recommendationRate,
  };
};

// Find all published reviews
CompanyReviewSchema.statics.findPublished = function () {
  return this.find({ isPublished: true }).sort({ createdAt: -1 });
};

// Find reviews by company
CompanyReviewSchema.statics.findByCompany = function (companyId: string) {
  return this.find({ company: companyId, isPublished: true }).sort({ createdAt: -1 });
};

// Find top-rated reviews
CompanyReviewSchema.statics.findTopRated = function (limit = 10) {
  return this.find({ isPublished: true })
    .sort({ 'rating.overall': -1, helpfulCount: -1 })
    .limit(limit);
};

// Find recent reviews
CompanyReviewSchema.statics.findRecent = function (limit = 10) {
  return this.find({ isPublished: true }).sort({ createdAt: -1 }).limit(limit);
};

// ========================================
// VIRTUALS
// ========================================

// Virtual for helpfulness score
CompanyReviewSchema.virtual('helpfulnessScore').get(function (this: ICompanyReviewDocument) {
  const total = this.helpfulCount + this.notHelpfulCount;
  if (total === 0) return 0;
  return Number(((this.helpfulCount / total) * 100).toFixed(2));
});

// Virtual for net votes
CompanyReviewSchema.virtual('netVotes').get(function (this: ICompanyReviewDocument) {
  return this.helpfulCount - this.notHelpfulCount;
});

// ========================================
// MIDDLEWARE
// ========================================

// Post-save middleware: Update company stats
CompanyReviewSchema.post('save', async function (doc: ICompanyReviewDocument) {
  try {
    if (doc.isPublished) {
      const stats = await CompanyReview.getCompanyStats(doc.company.toString());
      await Company.findByIdAndUpdate(doc.company, {
        'stats.averageRating': stats.averageRating,
        'stats.reviewsCount': stats.totalReviews,
      });
      logger.info(`Updated company stats for company: ${doc.company}`);
    }
  } catch (error: any) {
    logger.error('Failed to update company stats after review save:', error);
  }
});

// Pre-delete middleware: Update company stats
CompanyReviewSchema.pre('deleteOne', { document: true, query: false }, async function () {
  try {
    if (this.isPublished) {
      await Company.findByIdAndUpdate(this.company, {
        $inc: { 'stats.reviewsCount': -1 }
      });
    }
  } catch (error: any) {
    logger.error('Failed to update company stats before review deletion:', error);
  }
});

// Ensure virtuals are included in JSON
CompanyReviewSchema.set('toJSON', {
  virtuals: true,
  transform: function (_doc, ret) {
    // delete ret.__v;
    return ret;
  },
});

CompanyReviewSchema.set('toObject', { virtuals: true });

// Create and export the model
const CompanyReview = mongoose.model<ICompanyReviewDocument, ICompanyReviewModel>('CompanyReview', CompanyReviewSchema);

export default CompanyReview;