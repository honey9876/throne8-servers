import mongoose, { Schema } from 'mongoose';
import { IProgress } from '../interfaces/IProgress';
import { validId } from '@/shared/security';

const progressSchema = new Schema(
  {
    progressId: {
      type: String,
      required: true,
      default: () => validId(''),
    },
    user: {
      type: String,
      ref: 'User',
      required: [true, 'User is required'],
    },
    dailyStudyHours: { type: Number, default: 0, min: 0 },
    dailyGoalHours: { type: Number, default: 0, min: 0 },
    dailyProgress: { type: Number, default: 0, min: 0, max: 100 },
    weeklyStudyHours: { type: Number, default: 0, min: 0 },
    weeklyGoalHours: { type: Number, default: 0, min: 0 },
    weeklyProgress: { type: Number, default: 0, min: 0, max: 100 },
    totalStudyHours: { type: Number, default: 0, min: 0 },
    totalSessions: { type: Number, default: 0, min: 0 },
    averageSessionDuration: { type: Number, default: 0, min: 0 },
    lastStudyDate: { type: Date, default: null },
    studyDaysCount: { type: Number, default: 0, min: 0 },
    consecutiveStudyDays: { type: Number, default: 0, min: 0 },
    completionRate: { type: Number, default: 0, min: 0, max: 100 },
    consistency: { type: Number, default: 0, min: 0, max: 100 },
    productivity: { type: Number, default: 0, min: 0, max: 100 },
    lastUpdated: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        const r = ret as any;
        r.id = r.progressId;
        delete r._id;
        delete r.__v;
        return r;
      },
    },
    toObject: { virtuals: true },
  }
);

progressSchema.index({ progressId: 1 }, { unique: true });
progressSchema.index({ user: 1 }, { unique: true });
progressSchema.index({ lastUpdated: -1 });
progressSchema.index({ totalStudyHours: -1 });

progressSchema.virtual('isDailyGoalAchieved').get(function (this: IProgress) {
  return this.dailyStudyHours >= this.dailyGoalHours;
});

progressSchema.virtual('isWeeklyGoalAchieved').get(function (this: IProgress) {
  return this.weeklyStudyHours >= this.weeklyGoalHours;
});

progressSchema.virtual('averageDailyHours').get(function (this: IProgress) {
  if (this.studyDaysCount === 0) return 0;
  return parseFloat((this.totalStudyHours / this.studyDaysCount).toFixed(2));
});

progressSchema.pre('save', function (this: IProgress, next) {
  this.lastUpdated = new Date();
  next();
});

progressSchema.pre('save', function (this: IProgress, next) {
  if (this.dailyGoalHours > 0) {
    this.dailyProgress = Math.min(
      100,
      parseFloat(((this.dailyStudyHours / this.dailyGoalHours) * 100).toFixed(2))
    );
  } else {
    this.dailyProgress = 0;
  }
  next();
});

progressSchema.pre('save', function (this: IProgress, next) {
  if (this.weeklyGoalHours > 0) {
    this.weeklyProgress = Math.min(
      100,
      parseFloat(((this.weeklyStudyHours / this.weeklyGoalHours) * 100).toFixed(2))
    );
  } else {
    this.weeklyProgress = 0;
  }
  next();
});

const Progress = mongoose.model<IProgress>('StudyGroup_Progress', progressSchema);

export default Progress;