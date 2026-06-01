/**
 * ====================================
 * RANKING MODEL
 * ====================================
 * Mongoose schema for user and group rankings
 */

import mongoose, { Schema } from 'mongoose';
import { IRanking } from '../interfaces/IRanking';
import { GroupCategory } from '../enums/GroupCategory.enum';
import { validId } from '@/shared/security';

const rankingSchema = new Schema<IRanking>(
  {
    rankingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: (v: any) => validId(v),
    },
    userId: {
      type: String,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
      // ✅ REMOVED: index: true
    },

    // ==========================================
    // RANK POSITIONS
    // ==========================================
    globalRank: {
      type: Number,
      default: 0,
      min: 0,
      // ✅ REMOVED: index: true
    },
    categoryRank: {
      type: Number,
      default: 0,
      min: 0,
      // ✅ REMOVED: index: true
    },
    groupRank: {
      type: Number,
      default: 0,
      min: 0,
    },
    cityRank: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==========================================
    // METRICS FOR RANKING CALCULATION
    // ==========================================
    totalStudyHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    attendancePercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    currentStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    longestStreak: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==========================================
    // CALCULATED SCORE (WEIGHTED)
    // ==========================================
    rankScore: {
      type: Number,
      default: 0,
      min: 0,
      // ✅ REMOVED: index: true
    },

    // ==========================================
    // FILTERS
    // ==========================================
    category: {
      type: String,
      enum: Object.values(GroupCategory),
      default: 'Other',
      // ✅ REMOVED: index: true
    },
    city: {
      type: String,
      default: '',
      trim: true,
      // ✅ REMOVED: index: true
    },
    groupId: {
      type: String,
      ref: 'StudyGroup_Group',
      default: null,
      // ✅ REMOVED: index: true
    },

    // ==========================================
    // TIME TRACKING
    // ==========================================
    lastUpdated: {
      type: Date,
      default: Date.now,
      // ✅ REMOVED: index: true
    },
    weeklyHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    monthlyHours: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==========================================
    // ADDITIONAL STATS
    // ==========================================
    totalSessions: {
      type: Number,
      default: 0,
      min: 0,
    },
    avgSessionLength: {
      type: Number,
      default: 0,
      min: 0,
    },
    consistency: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        (ret as any).id = (ret as any).rankingId;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: { virtuals: true },
  }
);

/**
 * ==========================================
 * INDEXES FOR BETTER QUERY PERFORMANCE
 * ==========================================
 */
// ✅ KEEP ONLY THESE - Schema-level indexes
rankingSchema.index({ rankingId: 1 }, { unique: true });
rankingSchema.index({ userId: 1 }, { unique: true });
rankingSchema.index({ globalRank: 1 });
rankingSchema.index({ categoryRank: 1, category: 1 });
rankingSchema.index({ groupRank: 1, groupId: 1 });
rankingSchema.index({ cityRank: 1, city: 1 });
rankingSchema.index({ rankScore: -1 });
rankingSchema.index({ totalStudyHours: -1 });
rankingSchema.index({ currentStreak: -1 });
rankingSchema.index({ attendancePercentage: -1 });
rankingSchema.index({ lastUpdated: -1 });

/**
 * ==========================================
 * COMPOUND INDEXES
 * ==========================================
 */
rankingSchema.index({ category: 1, rankScore: -1 });
rankingSchema.index({ city: 1, rankScore: -1 });
rankingSchema.index({ groupId: 1, rankScore: -1 });

/**
 * ==========================================
 * VIRTUALS
 * ==========================================
 */

rankingSchema.virtual('studyHoursFormatted').get(function () {
  return parseFloat(this.totalStudyHours.toFixed(2));
});

rankingSchema.virtual('weeklyHoursFormatted').get(function () {
  return parseFloat(this.weeklyHours.toFixed(2));
});

rankingSchema.virtual('monthlyHoursFormatted').get(function () {
  return parseFloat(this.monthlyHours.toFixed(2));
});

rankingSchema.virtual('avgSessionMinutes').get(function () {
  return Math.floor(this.avgSessionLength / 60);
});

rankingSchema.virtual('rankStatus').get(function () {
  if (this.globalRank === 0) return 'unranked';
  if (this.globalRank <= 10) return 'top10';
  if (this.globalRank <= 100) return 'top100';
  if (this.globalRank <= 1000) return 'top1000';
  return 'ranked';
});

rankingSchema.virtual('performanceLevel').get(function () {
  if (this.rankScore >= 90) return 'excellent';
  if (this.rankScore >= 70) return 'good';
  if (this.rankScore >= 50) return 'average';
  if (this.rankScore >= 30) return 'below_average';
  return 'needs_improvement';
});

/**
 * ==========================================
 * PRE-SAVE HOOKS
 * ==========================================
 */

rankingSchema.pre('save', function (next) {
  const normalizedHours = Math.min(this.totalStudyHours / 10, 100);
  const normalizedStreak = Math.min((this.currentStreak / 365) * 100, 100);

  const hoursScore = normalizedHours * 0.4;
  const attendanceScore = this.attendancePercentage * 0.3;
  const streakScore = normalizedStreak * 0.3;

  this.rankScore = parseFloat(
    (hoursScore + attendanceScore + streakScore).toFixed(2)
  );

  next();
});

rankingSchema.pre('save', function (next) {
  if (this.isModified('rankScore') ||
    this.isModified('totalStudyHours') ||
    this.isModified('attendancePercentage') ||
    this.isModified('currentStreak')) {
    this.lastUpdated = new Date();
  }
  next();
});

rankingSchema.pre('save', function (next) {
  if (this.totalSessions > 0 && this.totalStudyHours > 0) {
    const avgDaily = this.totalStudyHours / Math.max(this.currentStreak, 1);
    const targetDaily = 2;

    const consistencyRatio = Math.min(avgDaily / targetDaily, 1);
    this.consistency = parseFloat((consistencyRatio * 100).toFixed(2));
  }
  next();
});

/**
 * ==========================================
 * STATIC METHODS
 * ==========================================
 */

rankingSchema.statics.findByUserId = function (userId: mongoose.Types.ObjectId) {
  return this.findOne({ userId });
};

rankingSchema.statics.getTopRanked = function (limit: number = 100) {
  return this.find({ globalRank: { $gt: 0 } })
    .sort({ globalRank: 1 })
    .limit(limit)
    .populate('userId', 'name email avatar');
};

rankingSchema.statics.getTopRankedByCategory = function (
  category: string,
  limit: number = 100
) {
  return this.find({
    category,
    categoryRank: { $gt: 0 }
  })
    .sort({ categoryRank: 1 })
    .limit(limit)
    .populate('userId', 'name email avatar');
};

rankingSchema.statics.getTopRankedByCity = function (
  city: string,
  limit: number = 100
) {
  return this.find({
    city,
    cityRank: { $gt: 0 }
  })
    .sort({ cityRank: 1 })
    .limit(limit)
    .populate('userId', 'name email avatar');
};

/**
 * ==========================================
 * INSTANCE METHODS
 * ==========================================
 */

rankingSchema.methods.updateMetrics = function (metrics: {
  studyHours?: number;
  attendance?: number;
  streak?: number;
  longestStreak?: number;
  sessions?: number;
}) {
  if (metrics.studyHours !== undefined) {
    this.totalStudyHours = metrics.studyHours;
  }
  if (metrics.attendance !== undefined) {
    this.attendancePercentage = metrics.attendance;
  }
  if (metrics.streak !== undefined) {
    this.currentStreak = metrics.streak;
  }
  if (metrics.longestStreak !== undefined) {
    this.longestStreak = metrics.longestStreak;
  }
  if (metrics.sessions !== undefined) {
    this.totalSessions = metrics.sessions;
  }

  return this.save();
};

rankingSchema.methods.compareWith = async function (otherUserId: mongoose.Types.ObjectId) {
  const Ranking = this.constructor as any;
  const otherRanking = await Ranking.findByUserId(otherUserId);

  if (!otherRanking) {
    return null;
  }

  return {
    globalRank: {
      current: this.globalRank,
      other: otherRanking.globalRank,
      difference: this.globalRank - otherRanking.globalRank,
    },
    rankScore: {
      current: this.rankScore,
      other: otherRanking.rankScore,
      difference: this.rankScore - otherRanking.rankScore,
    },
    studyHours: {
      current: this.totalStudyHours,
      other: otherRanking.totalStudyHours,
      difference: this.totalStudyHours - otherRanking.totalStudyHours,
    },
  };
};

const Ranking = mongoose.model<IRanking>('StudyGroup_Ranking', rankingSchema);

export default Ranking;