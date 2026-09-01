/**
 * ====================================
 * STREAK MODEL
 * ====================================
 * Mongoose schema for user streak tracking
 */

import mongoose, { Schema } from 'mongoose';
import { IStreak } from '../interfaces/IStreak';
import { validId } from '@/shared/security';

const streakSchema = new Schema<IStreak>(
  {
    // ADD: streakId UUID field
    streakId: {
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

    // Current streak
    currentStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    currentStreakStartDate: {
      type: Date,
      default: null,
    },
    lastActivityDate: {
      type: Date,
      default: null,
    },

    // Longest streak
    longestStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    longestStreakStartDate: {
      type: Date,
      default: null,
    },
    longestStreakEndDate: {
      type: Date,
      default: null,
    },

    // Streak status
    isActive: {
      type: Boolean,
      default: true,
    },
    streakFrozen: {
      type: Boolean,
      default: false,
    },
    freezeReason: {
      type: String,
      trim: true,
      maxlength: [200, 'Freeze reason cannot exceed 200 characters'],
    },

    // Milestone tracking
    milestones: [
      {
        days: {
          type: Number,
          required: true,
          min: 1,
        },
        achievedAt: {
          type: Date,
          required: true,
          default: Date.now,
        },
      },
    ],

    // Recovery tracking
    streakBreaks: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastBreakDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    // UPDATE: toJSON transform
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        (ret as any).id = (ret as any).streakId;
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
streakSchema.index({ streakId: 1 }, { unique: true });
streakSchema.index({ user: 1 }, { unique: true });
streakSchema.index({ currentStreak: -1 });
streakSchema.index({ longestStreak: -1 });
streakSchema.index({ isActive: 1 });
streakSchema.index({ lastActivityDate: -1 });

/**
 * Virtual: Days since last activity
 */
streakSchema.virtual('daysSinceLastActivity').get(function () {
  if (!this.lastActivityDate) return null;

  const now = new Date();
  const lastActivity = new Date(this.lastActivityDate);
  const diffTime = Math.abs(now.getTime() - lastActivity.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
});

/**
 * Virtual: Is current streak longest
 */
streakSchema.virtual('isCurrentLongest').get(function () {
  return this.currentStreak === this.longestStreak && this.currentStreak > 0;
});

/**
 * Virtual: Next milestone
 */
streakSchema.virtual('nextMilestone').get(function () {
  const milestones = [7, 14, 30, 60, 90, 100, 180, 365];
  const current = this.currentStreak;

  const next = milestones.find(m => m > current);
  return next || null;
});

/**
 * Virtual: Days until next milestone
 */
streakSchema.virtual('daysUntilNextMilestone').get(function () {
  // Calculate the next milestone inline instead of using this.nextMilestone
  const milestones = [7, 14, 30, 60, 90, 100, 180, 365];
  const current = this.currentStreak;
  const nextMilestone = milestones.find(m => m > current);

  if (!nextMilestone) return null;

  return nextMilestone - this.currentStreak;
});

/**
 * Pre-save hook: Update longest streak if needed
 */
streakSchema.pre('save', function (next) {
  if (this.currentStreak > this.longestStreak) {
    this.longestStreak = this.currentStreak;
    this.longestStreakStartDate = this.currentStreakStartDate;
    this.longestStreakEndDate = null; // Still ongoing
  }
  next();
});

/**
 * Pre-save hook: Add milestone achievements
 */
streakSchema.pre('save', function (next) {
  const predefinedMilestones = [7, 14, 30, 60, 90, 100, 180, 365];
  const currentStreak = this.currentStreak;

  predefinedMilestones.forEach(milestone => {
    const alreadyAchieved = this.milestones.some(m => m.days === milestone);

    if (currentStreak >= milestone && !alreadyAchieved) {
      this.milestones.push({
        days: milestone,
        achievedAt: new Date(),
      });
    }
  });

  next();
});

const Streak = mongoose.model<IStreak>('StudyGroup_Streak', streakSchema);

export default Streak;