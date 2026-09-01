/**
 * ====================================
 * PROGRESS MODEL
 * ====================================
 * Mongoose schema for user progress tracking
 */

import mongoose, { Schema } from 'mongoose';
import { IProgress } from '../interfaces/IProgress';
import { validId } from '@/shared/security';

const progressSchema = new Schema<IProgress>(
  {
    // ADD: progressId UUID
    progressId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: (v: any) => validId(v),
    },
    user: {
      type: String,
      ref: 'User',
      required: [true, 'User is required'],
      unique: true,
      index: true,
    },

    // Daily progress
    dailyStudyHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    dailyGoalHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    dailyProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Weekly progress
    weeklyStudyHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    weeklyGoalHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    weeklyProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Total progress
    totalStudyHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSessions: {
      type: Number,
      default: 0,
      min: 0,
    },
    averageSessionDuration: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Activity tracking
    lastStudyDate: {
      type: Date,
      default: null,
    },
    studyDaysCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    consecutiveStudyDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Performance metrics
    completionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    consistency: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    productivity: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Timestamps
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    // UPDATE: toJSON transform
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        (ret as any).id = (ret as any).progressId;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: { virtuals: true },
  }
);

/**
 * Indexes for better query performance
 */
progressSchema.index({ user: 1 }, { unique: true });
progressSchema.index({ lastUpdated: -1 });
progressSchema.index({ totalStudyHours: -1 });

/**
 * Virtual: Is daily goal achieved
 */
progressSchema.virtual('isDailyGoalAchieved').get(function () {
  return this.dailyStudyHours >= this.dailyGoalHours;
});

/**
 * Virtual: Is weekly goal achieved
 */
progressSchema.virtual('isWeeklyGoalAchieved').get(function () {
  return this.weeklyStudyHours >= this.weeklyGoalHours;
});

/**
 * Virtual: Average daily hours
 */
progressSchema.virtual('averageDailyHours').get(function () {
  if (this.studyDaysCount === 0) return 0;
  return parseFloat((this.totalStudyHours / this.studyDaysCount).toFixed(2));
});

/**
 * Pre-save hook: Update lastUpdated timestamp
 */
progressSchema.pre('save', function (next) {
  this.lastUpdated = new Date();
  next();
});

/**
 * Pre-save hook: Calculate daily progress percentage
 */
progressSchema.pre('save', function (next) {
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

/**
 * Pre-save hook: Calculate weekly progress percentage
 */
progressSchema.pre('save', function (next) {
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