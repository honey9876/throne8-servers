// src/models/MatchScore.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface MatchFactors {
  domainMatch: number;      // 0-100
  experienceMatch: number;  // 0-100
  goalAlignment: number;    // 0-100
  personalityFit: number;   // 0-100
  priceMatch: number;       // 0-100
  availabilityMatch: number; // 0-100
}

export interface IMatchScore {
  userId: string;
  mentorId: mongoose.Types.ObjectId;
  overallScore: number; // 0-100
  factors: MatchFactors;
  explanation: string;
  recommendations: string[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface MatchScoreDocument extends IMatchScore, Document {
  _id: mongoose.Types.ObjectId;
}

const MatchScoreSchema = new Schema<MatchScoreDocument>(
  {
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    },
    mentorId: {
      type: Schema.Types.ObjectId,
      ref: 'Mentor',
      required: [true, 'Mentor ID is required'],
      index: true,
    },
    overallScore: {
      type: Number,
      required: [true, 'Overall score is required'],
      min: [0, 'Score cannot be negative'],
      max: [100, 'Score cannot exceed 100'],
      index: true,
    },
    factors: {
      domainMatch: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      experienceMatch: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      goalAlignment: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      personalityFit: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      priceMatch: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      availabilityMatch: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
    },
    explanation: {
      type: String,
      required: [true, 'Explanation is required'],
      trim: true,
      maxlength: [1000, 'Explanation cannot exceed 1000 characters'],
    },
    recommendations: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.length <= 10;
        },
        message: 'Cannot have more than 10 recommendations',
      },
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for efficient queries
MatchScoreSchema.index({ userId: 1, mentorId: 1 }, { unique: true });
MatchScoreSchema.index({ userId: 1, overallScore: -1 });
MatchScoreSchema.index({ mentorId: 1, overallScore: -1 });
MatchScoreSchema.index({ createdAt: -1 });

// TTL index for automatic deletion of expired scores
MatchScoreSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for match quality
MatchScoreSchema.virtual('matchQuality').get(function () {
  if (this.overallScore >= 80) return 'excellent';
  if (this.overallScore >= 60) return 'good';
  if (this.overallScore >= 40) return 'fair';
  return 'poor';
});

// Virtual for top factors
MatchScoreSchema.virtual('topFactors').get(function () {
  const factors = [
    { name: 'Domain Match', score: this.factors.domainMatch },
    { name: 'Experience Match', score: this.factors.experienceMatch },
    { name: 'Goal Alignment', score: this.factors.goalAlignment },
    { name: 'Personality Fit', score: this.factors.personalityFit },
    { name: 'Price Match', score: this.factors.priceMatch },
    { name: 'Availability Match', score: this.factors.availabilityMatch },
  ];

  return factors.sort((a, b) => b.score - a.score).slice(0, 3);
});

// Pre-save middleware
MatchScoreSchema.pre('save', function (next) {
  // Recalculate overall score from factors
  const factors = this.factors;
  const weights = {
    domainMatch: 0.25,
    experienceMatch: 0.20,
    goalAlignment: 0.20,
    personalityFit: 0.15,
    priceMatch: 0.10,
    availabilityMatch: 0.10,
  };

  this.overallScore = Math.round(
    factors.domainMatch * weights.domainMatch +
      factors.experienceMatch * weights.experienceMatch +
      factors.goalAlignment * weights.goalAlignment +
      factors.personalityFit * weights.personalityFit +
      factors.priceMatch * weights.priceMatch +
      factors.availabilityMatch * weights.availabilityMatch
  );

  next();
});

// Static Methods
MatchScoreSchema.statics.findByUserId = function (userId: string, limit: number = 10) {
  return this.find({ userId })
    .sort({ overallScore: -1 })
    .limit(limit)
    .populate('mentorId')
    .exec();
};

MatchScoreSchema.statics.findByMentorId = function (
  mentorId: mongoose.Types.ObjectId,
  limit: number = 10
) {
  return this.find({ mentorId })
    .sort({ overallScore: -1 })
    .limit(limit)
    .exec();
};

MatchScoreSchema.statics.findTopMatches = function (
  userId: string,
  minScore: number = 60,
  limit: number = 10
) {
  return this.find({
    userId,
    overallScore: { $gte: minScore },
  })
    .sort({ overallScore: -1 })
    .limit(limit)
    .populate('mentorId')
    .exec();
};

MatchScoreSchema.statics.deleteExpired = function () {
  return this.deleteMany({
    expiresAt: { $lt: new Date() },
  });
};

MatchScoreSchema.statics.refreshScore = async function (
  userId: string,
  mentorId: mongoose.Types.ObjectId
) {
  return this.findOneAndDelete({ userId, mentorId });
};

// Instance Methods
MatchScoreSchema.methods.isExpired = function (): boolean {
  return this.expiresAt < new Date();
};

MatchScoreSchema.methods.extendExpiry = function (days: number = 7) {
  this.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return this.save();
};

MatchScoreSchema.methods.updateScore = function (newFactors: Partial<MatchFactors>) {
  Object.assign(this.factors, newFactors);
  return this.save();
};

export default mongoose.model<MatchScoreDocument>('MatchScore', MatchScoreSchema);