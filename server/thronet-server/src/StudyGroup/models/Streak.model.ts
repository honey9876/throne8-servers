import mongoose, { Schema, Document } from 'mongoose';
import { IStreak } from '../interfaces/IStreak';

interface IStreakDoc extends IStreak, Document {}

const streakSchema = new Schema(
  {
    streakId: {
      type: String,
      required: true,
    },
    user: {
      type: String,
      ref: 'User',
      required: [true, 'User is required'],
    },
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
    toJSON: {
  virtuals: true,
  transform: function (_doc, ret) {
    const r = ret as any;
    r.id = r.streakId;
    delete r._id;
    delete r.__v;
    return r;
  },
},
    toObject: { virtuals: true },
  }
);

streakSchema.index({ streakId: 1 }, { unique: true });
streakSchema.index({ user: 1 }, { unique: true });
streakSchema.index({ currentStreak: -1 });
streakSchema.index({ longestStreak: -1 });
streakSchema.index({ isActive: 1 });
streakSchema.index({ lastActivityDate: -1 });

streakSchema.virtual('daysSinceLastActivity').get(function (this: IStreakDoc) {
  if (!this.lastActivityDate) return null;
  const now = new Date();
  const lastActivity = new Date(this.lastActivityDate);
  const diffTime = Math.abs(now.getTime() - lastActivity.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

streakSchema.virtual('isCurrentLongest').get(function (this: IStreakDoc) {
  return this.currentStreak === this.longestStreak && this.currentStreak > 0;
});

streakSchema.virtual('nextMilestone').get(function (this: IStreakDoc) {
  const milestones = [7, 14, 30, 60, 90, 100, 180, 365];
  return milestones.find(m => m > this.currentStreak) || null;
});

streakSchema.virtual('daysUntilNextMilestone').get(function (this: IStreakDoc) {
  const milestones = [7, 14, 30, 60, 90, 100, 180, 365];
  const next = milestones.find(m => m > this.currentStreak);
  if (!next) return null;
  return next - this.currentStreak;
});

streakSchema.pre('save', function (this: IStreakDoc, next) {
  if (this.currentStreak > this.longestStreak) {
    this.longestStreak = this.currentStreak;
    this.longestStreakStartDate = this.currentStreakStartDate;
    this.longestStreakEndDate = null;
  }
  next();
});

streakSchema.pre('save', function (this: IStreakDoc, next) {
  const predefinedMilestones = [7, 14, 30, 60, 90, 100, 180, 365];
  predefinedMilestones.forEach(milestone => {
    const alreadyAchieved = this.milestones.some((m: any) => m.days === milestone);
    if (this.currentStreak >= milestone && !alreadyAchieved) {
      this.milestones.push({ days: milestone, achievedAt: new Date() });
    }
  });
  next();
});

const Streak = mongoose.model<IStreakDoc>('StudyGroup_Streak', streakSchema);
export default Streak;