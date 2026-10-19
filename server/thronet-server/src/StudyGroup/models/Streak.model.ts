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
      validate: (v: any) => validId(v),
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
      transform: function (_doc, ret: any) {
        ret.id = ret.streakId;
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
streakSchema.virtual('daysSinceLastActivity').get(function (this: any) {
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
streakSchema.virtual('isCurrentLongest').get(function (this: any) {
  return this.currentStreak === this.longestStreak && this.currentStreak > 0;
});

/**
 * Virtual: Next milestone
 */
streakSchema.virtual('nextMilestone').get(function (this: any) {
  const milestones = [7, 14, 30, 60, 90, 100, 180, 365];
  const current = this.currentStreak;

  const next = milestones.find(m => m > current);
  return next || null;
});

/**
 * Virtual: Days until next milestone
 */
streakSchema.virtual('daysUntilNextMilestone').get(function (this: any) {
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
streakSchema.pre('save', function (this: any, next) {
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
streakSchema.pre('save', function (this: any, next) {
  const predefinedMilestones = [7, 14, 30, 60, 90, 100, 180, 365];
  const currentStreak = this.currentStreak;

  predefinedMilestones.forEach(milestone => {
    const alreadyAchieved = this.milestones.some((m: any) => m.days === milestone);

    if (currentStreak >= milestone && !alreadyAchieved) {
      this.milestones.push({
        days: milestone,
        achievedAt: new Date(),
      });
    }
  });

  next();
});

// Invalidation hooks for study analytics
streakSchema.post('save', async function (doc: any) {
  const uid = doc?.user || doc?.userId;
  if (uid) {
    try {
      const { StudyAnalyticsCacheRepository } = await import('@/shared/cache/studyCache');
      await StudyAnalyticsCacheRepository.invalidateUserAnalytics(String(uid));
    } catch {}
  }
});

streakSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as any,
  async function (this: any) {
    try {
      const filter = this.getFilter ? this.getFilter() : {};
      let uid = filter.user || filter.userId;
      if (!uid && (filter._id || filter.streakId)) {
        const doc = await this.model.findOne(filter).select('user userId').lean();
        if (doc) this._targetUserId = doc.user || doc.userId;
      } else if (uid) {
        this._targetUserId = uid;
      }
    } catch {}
  }
);

streakSchema.post(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as any,
  async function (this: any, res: any) {
    try {
      const filter = this.getFilter ? this.getFilter() : {};
      const uid = this._targetUserId || filter.user || filter.userId || (res && (res.user || res.userId));
      if (uid) {
        const { StudyAnalyticsCacheRepository } = await import('@/shared/cache/studyCache');
        await StudyAnalyticsCacheRepository.invalidateUserAnalytics(String(uid));
      }
    } catch {}
  }
);

const Streak = mongoose.model<IStreak>('StudyGroup_Streak', streakSchema);

export default Streak;