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
    },
    user: {
      type: String,
      ref: 'User',
      required: [true, 'User is required'],
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
  transform: function (_doc, ret) {
    const r = ret as any;
    r.id = r.goalId;
    delete r._id;
    delete r.__v;
    return r;
  },
},
    toObject: {
      virtuals: true,
      transform: function (_doc, ret) {
        delete (ret as any).__v;
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
goalSchema.virtual('progressPercentage').get(function () {
  if (this.targetHours === 0) return 0;
  const percentage = (this.currentHours / this.targetHours) * 100;
  return Math.min(Math.round(percentage), 100);
});

/**
 * Virtual: Days Remaining
 */
goalSchema.virtual('daysRemaining').get(function () {
  
  const now = new Date();
  const diff = new Date(this.endDate).getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

/**
 * Virtual: Is Overdue
 */
goalSchema.virtual('isOverdue').get(function () {
  if (this.completed) return false;
  return new Date() > new Date(this.endDate);
});

/**
 * Pre-save middleware: Auto-complete goal if target reached
 */
goalSchema.pre('save', function (next) {
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
goalSchema.methods.updateProgress = function (hoursToAdd: number) {
  this.currentHours += hoursToAdd;
  if (this.currentHours < 0) this.currentHours = 0;
  return this.save();
};

const Goal: Model<IGoal> = mongoose.model<IGoal>('StudyGroup_Goal', goalSchema);

export default Goal;