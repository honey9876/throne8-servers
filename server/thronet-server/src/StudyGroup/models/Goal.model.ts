/**
 * ====================================
 * GOAL MODEL
 * ====================================
 * Mongoose schema and model for Goal
 */

import mongoose, { Schema, Model } from 'mongoose';
import { IGoal } from '../interfaces/IGoal';
import { validId } from '@/shared/security';

const goalSchema = new Schema<IGoal>(
  {
    goalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: String,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Goal title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [200, 'Title must not exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description must not exceed 1000 characters'],
      default: null,
    },
    targetHours: {
      type: Number,
      required: [true, 'Target hours is required'],
      min: [1, 'Target hours must be at least 1'],
      max: [10000, 'Target hours must not exceed 10000'],
    },
    currentHours: {
      type: Number,
      default: 0,
      min: [0, 'Current hours cannot be negative'],
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
      validate: {
        validator: function (this: IGoal, value: Date) {
          return value > this.startDate;
        },
        message: 'End date must be after start date',
      },
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    category: {
      type: String,
      trim: true,
      maxlength: [50, 'Category must not exceed 50 characters'],
      default: null,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: function (tags: string[]) {
          return tags.length <= 10;
        },
        message: 'Maximum 10 tags allowed',
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret: any) {
        ret.id = ret.goalId;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: function (_doc, ret: any) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * Indexes
 */
goalSchema.index({ user: 1, goalId: 1 });
goalSchema.index({ user: 1, createdAt: -1 });
goalSchema.index({ user: 1, completed: 1 });
goalSchema.index({ user: 1, endDate: 1 });
goalSchema.index({ category: 1 });
goalSchema.index({ tags: 1 });

/**
 * Virtual: Progress Percentage
 */
goalSchema.virtual('progressPercentage').get(function (this: any) {
  if (this.targetHours === 0) return 0;
  const percentage = (this.currentHours / this.targetHours) * 100;
  return Math.min(Math.round(percentage), 100);
});

/**
 * Virtual: Days Remaining
 */
goalSchema.virtual('daysRemaining').get(function (this: any) {
  
  const now = new Date();
  const diff = new Date(this.endDate).getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

/**
 * Virtual: Is Overdue
 */
goalSchema.virtual('isOverdue').get(function (this: any) {
  if (this.completed) return false;
  return new Date() > new Date(this.endDate);
});

/**
 * Pre-save middleware: Auto-complete goal if target reached
 */
goalSchema.pre('save', function (this: any, next) {
  // Auto-complete if target hours reached
  if (this.currentHours >= this.targetHours && !this.completed) {
    this.completed = true;
    this.completedAt = new Date();
  }

  // Unmark completion if current hours drops below target
  if (this.currentHours < this.targetHours && this.completed) {
    this.completed = false;
    this.completedAt = undefined;
  }

  next();
});

/**
 * Static method: Get goals by user
 */
goalSchema.statics.getGoalsByUser = function (
  userId: string,
  filters: any = {}
) {
  const query: any = { user: userId };

  if (filters.completed !== undefined) query.completed = filters.completed;
  if (filters.category) query.category = filters.category;
  if (filters.tags && filters.tags.length > 0) {
    query.tags = { $in: filters.tags };
  }

  return this.find(query).sort({ createdAt: -1 });
};

/**
 * Static method: Get active goals
 */
goalSchema.statics.getActiveGoals = function (userId: string) {
  const now = new Date();
  return this.find({
    user: userId,
    completed: false,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).sort({ endDate: 1 });
};

/**
 * Static method: Get upcoming goals
 */
goalSchema.statics.getUpcomingGoals = function (userId: string) {
  const now = new Date();
  return this.find({
    user: userId,
    completed: false,
    startDate: { $gt: now },
  }).sort({ startDate: 1 });
};

/**
 * Instance method: Update progress
 */
goalSchema.methods.updateProgress = function (this: any, hoursToAdd: number) {
  this.currentHours += hoursToAdd;
  if (this.currentHours < 0) this.currentHours = 0;
  return this.save();
};

// Invalidation hooks for study analytics
goalSchema.post('save', async function (doc: any) {
  const uid = doc?.user || doc?.userId;
  if (uid) {
    try {
      const { StudyAnalyticsCacheRepository } = await import('@/shared/cache/studyCache');
      await StudyAnalyticsCacheRepository.invalidateUserAnalytics(String(uid));
    } catch {}
  }
});

goalSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as any,
  async function (this: any) {
    try {
      const filter = this.getFilter ? this.getFilter() : {};
      let uid = filter.user || filter.userId;
      if (!uid && (filter._id || filter.goalId)) {
        const doc = await this.model.findOne(filter).select('user userId').lean();
        if (doc) this._targetUserId = doc.user || doc.userId;
      } else if (uid) {
        this._targetUserId = uid;
      }
    } catch {}
  }
);

goalSchema.post(
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

const Goal: Model<IGoal> = mongoose.model<IGoal>('StudyGroup_Goal', goalSchema);

export default Goal;