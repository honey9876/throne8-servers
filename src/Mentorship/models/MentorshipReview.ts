import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReview {
  _id: string;
  reviewId: string; // Unique identifier for the review
  sessionId: string;
  mentorId: string;
  menteeId: string;
  rating: number;
  comment: string;
  helpfulCount: number;
  reportCount: number;
  isVerified: boolean;
  mentorResponse?: {
    comment: string;
    respondedAt: Date;
  };
  tags: string[];
  isPublic: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Define instance methods interface
export interface IReviewMethods {
  addMentorResponse(response: string): Promise<MetorshipReviewDocument>;
  incrementHelpful(): Promise<MetorshipReviewDocument>;
  incrementReport(): Promise<MetorshipReviewDocument>;
  softDelete(): Promise<MetorshipReviewDocument>;
  restore(): Promise<MetorshipReviewDocument>;
}

// Define static methods interface
export interface IMentorshipReviewModel extends Model<MetorshipReviewDocument, {}, IReviewMethods> {
  findByMentor(mentorId: string, includePrivate?: boolean): any;
  getAverageRating(mentorId: string): Promise<{
    averageRating: number;
    totalReviews: number;
    distribution: { 5: number; 4: number; 3: number; 2: number; 1: number };
  }>;
  getTopReviews(mentorId: string, limit?: number): any;
  getMostHelpful(limit?: number): any;
}

// Combine document with methods
export interface MetorshipReviewDocument extends Omit<IReview, '_id'>, Document, IReviewMethods {}

const MentorshipReviewSchema = new Schema<MetorshipReviewDocument, IMentorshipReviewModel, IReviewMethods>(
  {
    // Schema mein sabse upar add karo
reviewId: {
  type: String,
  required: true,
  unique: true,
  index: true,
},
    sessionId: {
      type: String,
      ref: 'Session',
      required: [true, 'Session ID is required'],
      unique: true,
      index: true,
    },
    mentorId: {
      type: String,
      required: [true, 'Mentor ID is required'],
      index: true,
    },
    menteeId: {
      type: String,
      required: [true, 'Mentee ID is required'],
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
      index: true,
    },
    comment: {
      type: String,
      required: [true, 'Comment is required'],
      trim: true,
      minlength: [10, 'Comment must be at least 10 characters'],
      maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    },
    helpfulCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isVerified: {
      type: Boolean,
      default: true,
      index: true,
    },
    mentorResponse: {
      comment: {
        type: String,
        trim: true,
        maxlength: [500, 'Response cannot exceed 500 characters'],
      },
      respondedAt: { type: Date },
    },
    tags: {
      type: [String],
      enum: [
        'helpful',
        'knowledgeable',
        'patient',
        'prepared',
        'punctual',
        'friendly',
        'professional',
        'insightful',
        'responsive',
        'exceeded_expectations',
      ],
    },
    isPublic: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'MentorshipReview',
    versionKey: false,
    // ✅ Replace with
toJSON: {
  virtuals: true,
  transform: function (_doc, ret) {
    ret.id = ret.reviewId;
    delete (ret as any)._id;
    delete (ret as any).__v;
    return ret;
  }
},
toObject: { virtuals: true },
  }
);

// Compound Indexes
MentorshipReviewSchema.index({ mentorId: 1, isPublic: 1, isDeleted: 1 });
MentorshipReviewSchema.index({ mentorId: 1, rating: -1 });
MentorshipReviewSchema.index({ createdAt: -1 });
// Model mein add karo
MentorshipReviewSchema.index({ mentorId: 1, tags: 1 });
MentorshipReviewSchema.index({ mentorId: 1, createdAt: -1 });

// Virtual for sentiment
MentorshipReviewSchema.virtual('sentiment').get(function () {
  if (this.rating >= 4) return 'positive';
  if (this.rating >= 3) return 'neutral';
  return 'negative';
});

// Instance Methods
MentorshipReviewSchema.methods.addMentorResponse = async function (response: string): Promise<MetorshipReviewDocument> {
  this.mentorResponse = {
    comment: response,
    respondedAt: new Date(),
  };
  return await this.save();
};

MentorshipReviewSchema.methods.incrementHelpful = async function (): Promise<MetorshipReviewDocument> {
  this.helpfulCount += 1;
  return await this.save();
};

MentorshipReviewSchema.methods.incrementReport = async function (): Promise<MetorshipReviewDocument> {
  this.reportCount += 1;
  if (this.reportCount >= 5) {
    this.isPublic = false;
  }
  return await this.save();
};

MentorshipReviewSchema.methods.softDelete = async function (): Promise<MetorshipReviewDocument> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.isPublic = false;
  return await this.save();
};

MentorshipReviewSchema.methods.restore = async function (): Promise<MetorshipReviewDocument> {
  this.isDeleted = false;
  this.deletedAt = undefined;
  return await this.save();
};

// Static Methods
MentorshipReviewSchema.statics.findByMentor = function (
  mentorId: string,
  includePrivate: boolean = false
) {
  const query: any = {
    mentorId,
    isDeleted: false,
  };

  if (!includePrivate) {
    query.isPublic = true;
  }

  return this.find(query).sort({ createdAt: -1 });
};

MentorshipReviewSchema.statics.getAverageRating = async function (mentorId: string) {
  const result = await this.aggregate([
    {
      $match: {
        mentorId,
        isDeleted: false,
        isPublic: true,
      },
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        ratingDistribution: {
          $push: '$rating',
        },
      },
    },
  ]);

  if (result.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    };
  }

  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  result[0].ratingDistribution.forEach((rating: number) => {
    distribution[rating as keyof typeof distribution]++;
  });

  return {
    averageRating: Math.round(result[0].averageRating * 10) / 10,
    totalReviews: result[0].totalReviews,
    distribution,
  };
};

MentorshipReviewSchema.statics.getTopReviews = function (mentorId: string, limit: number = 5) {
  return this.find({
    mentorId,
    isDeleted: false,
    isPublic: true,
    rating: { $gte: 4 },
  })
    .sort({ helpfulCount: -1, createdAt: -1 })
    .limit(limit);
};

MentorshipReviewSchema.statics.getMostHelpful = function (limit: number = 10) {
  return this.find({
    isDeleted: false,
    isPublic: true,
    helpfulCount: { $gt: 0 },
  })
    .sort({ helpfulCount: -1 })
    .limit(limit);
};

export default mongoose.model<MetorshipReviewDocument, IMentorshipReviewModel>('MentorshipReview', MentorshipReviewSchema);