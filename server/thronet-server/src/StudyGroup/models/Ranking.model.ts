import mongoose, { Schema, Document } from 'mongoose';
import { IRanking } from '../interfaces/IRanking';
import { GroupCategory } from '../enums/GroupCategory.enum';
import { validId } from '@/shared/security';

const rankingSchema = new Schema(
  {
    rankingId: {
      type: String,
      required: true,
      default: () => validId(''),
    },
    userId: {
      type: String,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    globalRank: { type: Number, default: 0, min: 0 },
    categoryRank: { type: Number, default: 0, min: 0 },
    groupRank: { type: Number, default: 0, min: 0 },
    cityRank: { type: Number, default: 0, min: 0 },
    totalStudyHours: { type: Number, default: 0, min: 0 },
    attendancePercentage: { type: Number, default: 0, min: 0, max: 100 },
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    rankScore: { type: Number, default: 0, min: 0 },
    category: {
      type: String,
      enum: Object.values(GroupCategory),
      default: 'Other',
    },
    city: { type: String, default: '', trim: true },
    groupId: { type: String, ref: 'StudyGroup_Group', default: null },
    lastUpdated: { type: Date, default: Date.now },
    weeklyHours: { type: Number, default: 0, min: 0 },
    monthlyHours: { type: Number, default: 0, min: 0 },
    totalSessions: { type: Number, default: 0, min: 0 },
    avgSessionLength: { type: Number, default: 0, min: 0 },
    consistency: { type: Number, default: 0, min: 0, max: 100 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
   transform: function (_doc, ret) {
  const r = ret as any;
  r.id = r.rankingId;
  delete r._id;
  delete r.__v;
  return r;
},
    },
    toObject: { virtuals: true },
  }
);

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
rankingSchema.index({ category: 1, rankScore: -1 });
rankingSchema.index({ city: 1, rankScore: -1 });
rankingSchema.index({ groupId: 1, rankScore: -1 });

rankingSchema.virtual('studyHoursFormatted').get(function (this: IRanking) {
  return parseFloat(this.totalStudyHours.toFixed(2));
});

rankingSchema.virtual('weeklyHoursFormatted').get(function (this: IRanking) {
  return parseFloat(this.weeklyHours.toFixed(2));
});

rankingSchema.virtual('monthlyHoursFormatted').get(function (this: IRanking) {
  return parseFloat(this.monthlyHours.toFixed(2));
});

rankingSchema.virtual('avgSessionMinutes').get(function (this: IRanking) {
  return Math.floor(this.avgSessionLength / 60);
});

rankingSchema.virtual('rankStatus').get(function (this: IRanking) {
  if (this.globalRank === 0) return 'unranked';
  if (this.globalRank <= 10) return 'top10';
  if (this.globalRank <= 100) return 'top100';
  if (this.globalRank <= 1000) return 'top1000';
  return 'ranked';
});

rankingSchema.virtual('performanceLevel').get(function (this: IRanking) {
  if (this.rankScore >= 90) return 'excellent';
  if (this.rankScore >= 70) return 'good';
  if (this.rankScore >= 50) return 'average';
  if (this.rankScore >= 30) return 'below_average';
  return 'needs_improvement';
});

rankingSchema.pre('save', function (this: IRanking, next) {
  const normalizedHours = Math.min(this.totalStudyHours / 10, 100);
  const normalizedStreak = Math.min((this.currentStreak / 365) * 100, 100);

  const hoursScore = normalizedHours * 0.4;
  const attendanceScore = this.attendancePercentage * 0.3;
  const streakScore = normalizedStreak * 0.3;

  this.rankScore = parseFloat((hoursScore + attendanceScore + streakScore).toFixed(2));
  next();
});

rankingSchema.pre('save', function (this: IRanking, next) {
  if (
    this.isModified('rankScore') ||
    this.isModified('totalStudyHours') ||
    this.isModified('attendancePercentage') ||
    this.isModified('currentStreak')
  ) {
    this.lastUpdated = new Date();
  }
  next();
});

rankingSchema.pre('save', function (this: IRanking, next) {
  if (this.totalSessions > 0 && this.totalStudyHours > 0) {
    const avgDaily = this.totalStudyHours / Math.max(this.currentStreak, 1);
    const targetDaily = 2;
    const consistencyRatio = Math.min(avgDaily / targetDaily, 1);
    this.consistency = parseFloat((consistencyRatio * 100).toFixed(2));
  }
  next();
});

rankingSchema.statics.findByUserId = function (userId: mongoose.Types.ObjectId) {
  return this.findOne({ userId });
};

rankingSchema.statics.getTopRanked = function (limit: number = 100) {
  return this.find({ globalRank: { $gt: 0 } })
    .sort({ globalRank: 1 })
    .limit(limit)
    .populate('userId', 'name email avatar');
};

rankingSchema.statics.getTopRankedByCategory = function (category: string, limit: number = 100) {
  return this.find({ category, categoryRank: { $gt: 0 } })
    .sort({ categoryRank: 1 })
    .limit(limit)
    .populate('userId', 'name email avatar');
};

rankingSchema.statics.getTopRankedByCity = function (city: string, limit: number = 100) {
  return this.find({ city, cityRank: { $gt: 0 } })
    .sort({ cityRank: 1 })
    .limit(limit)
    .populate('userId', 'name email avatar');
};

rankingSchema.methods.updateMetrics = function (
  this: IRanking,
  metrics: {
    studyHours?: number;
    attendance?: number;
    streak?: number;
    longestStreak?: number;
    sessions?: number;
  }
) {
  if (metrics.studyHours !== undefined) this.totalStudyHours = metrics.studyHours;
  if (metrics.attendance !== undefined) this.attendancePercentage = metrics.attendance;
  if (metrics.streak !== undefined) this.currentStreak = metrics.streak;
  if (metrics.longestStreak !== undefined) this.longestStreak = metrics.longestStreak;
  if (metrics.sessions !== undefined) this.totalSessions = metrics.sessions;
  return this.save();
};

rankingSchema.methods.compareWith = async function (
  this: IRanking,
  otherUserId: mongoose.Types.ObjectId
) {
  const Ranking = (this as any).constructor;
  const otherRanking = await Ranking.findByUserId(otherUserId);

  if (!otherRanking) return null;

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