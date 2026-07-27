/**
 * ====================================
 * TASK MODEL
 * ====================================
 * Mongoose schema and model for Task
 */

import mongoose, { Schema, Model } from 'mongoose';
import { ITask } from '../interfaces/ITask';
import { TaskStatus } from '../enums/TaskStatus.enum';
import { TaskPriority } from '../enums/TaskPriority.enum';
import { validId } from '@/shared/security';

const taskSchema = new Schema<ITask>(
  {
    userId: {
      type: String,
      ref: 'User',
      required: [true, 'User is required'],
    }, 

    // ADD: taskId UUID � external identifier
    taskId: {
      type: String,
      required: true,
      unique: true,
    },
    groupId: {
  type: String,
  ref: 'StudyGroup_Group',
  required: false,   // CHANGE � was: required: true
  default: null,
},
    title: {
      type: String,
      required: [true, 'Task title is required'],
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
    status: {
      type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.PENDING,
    },
    priority: {
      type: String,
      enum: Object.values(TaskPriority),
      default: TaskPriority.MEDIUM,
    },
    deadline: {
      type: Date,
      default: null,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
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
    reminderAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    // ADD: toJSON transform
    toJSON: {
  virtuals: true,
  transform: function (_doc, ret) {
    const r = ret as any;
    r.id = r.taskId;
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

taskSchema.index({ userId: 1, createdAt: -1 });
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ userId: 1, priority: 1 });
taskSchema.index({ userId: 1, deadline: 1 });
taskSchema.index({ userId: 1, completed: 1 });
taskSchema.index({ tags: 1 });

/**
 * Virtual: Days Remaining
 */
taskSchema.virtual('daysRemaining').get(function () {
  if (!this.deadline) return null;
  const now = new Date();
  const diff = new Date(this.deadline).getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

/**
 * Virtual: Is Overdue
 */
taskSchema.virtual('isOverdue').get(function () {
  if (!this.deadline || this.completed) return false;
  return new Date() > new Date(this.deadline);
});

/**
 * Pre-save middleware: Update status based on completion
 */
taskSchema.pre('save', function (next) {
  // If task is marked as completed
  if (this.completed && !this.completedAt) {
    this.completedAt = new Date();
    this.status = TaskStatus.COMPLETED;
  }

  // If task is marked as not completed
  if (!this.completed && this.completedAt) {
    this.completedAt = undefined;
    this.status = TaskStatus.PENDING;
  }

  // Check if task is overdue
  if (this.deadline && !this.completed && new Date() > new Date(this.deadline)) {
    this.status = TaskStatus.OVERDUE;
  }

  next();
});

/**
 * Static method: Get tasks by user
 */
taskSchema.statics.getTasksByUser = function (
  userId: string,
  filters: any = {}
) {
  const query: any = { user: userId };

  if (filters.status) query.status = filters.status;
  if (filters.priority) query.priority = filters.priority;
  if (filters.completed !== undefined) query.completed = filters.completed;
  if (filters.tags && filters.tags.length > 0) {
    query.tags = { $in: filters.tags };
  }

  return this.find(query).sort({ createdAt: -1 });
};

/**
 * Static method: Get overdue tasks
 */
taskSchema.statics.getOverdueTasks = function (userId: string) {
  return this.find({
    user: userId,
    deadline: { $lt: new Date() },
    completed: false,
  }).sort({ deadline: 1 });
};

/**
 * Static method: Get upcoming tasks
 */
taskSchema.statics.getUpcomingTasks = function (userId: string, days: number = 7) {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    user: userId,
    deadline: { $gte: now, $lte: futureDate },
    completed: false,
  }).sort({ deadline: 1 });
};

const Task: Model<ITask> = mongoose.model<ITask>('StudyGroup_Task', taskSchema);

export default Task;
