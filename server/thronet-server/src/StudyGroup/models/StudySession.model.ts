/**
 * ====================================
 * STUDY SESSION MODEL
 * ====================================
 */

import mongoose, { Schema } from 'mongoose';
import { IStudySession, SessionStatus } from '../interfaces/IStudySession';

const studySessionSchema = new Schema<IStudySession>(
  {
    // ADD: sessionId UUID field
    sessionId: {
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
    goal: {
      type: String,
      ref: 'StudyGroup_Goal',
      default: null,
      index: true,
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    pausedDuration: {
      type: Number,
      default: 0,
      min: 0,
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(SessionStatus),
      default: SessionStatus.ACTIVE,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
    subject: {
      type: String,
      trim: true,
      maxlength: [100, 'Subject cannot exceed 100 characters'],
    },
  },
  {
    timestamps: true,
    // UPDATE: toJSON transform
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret: any) {
        ret.id = ret.sessionId;
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
studySessionSchema.index({ user: 1, createdAt: -1 });
studySessionSchema.index({ user: 1, status: 1 });
studySessionSchema.index({ user: 1, goal: 1 });
studySessionSchema.index({ startTime: -1 });
studySessionSchema.index({ status: 1 });

/**
 * Virtual: Duration in minutes
 */
studySessionSchema.virtual('durationInMinutes').get(function (this: any) {
  return Math.floor(this.duration / 60);
});

/**
 * Virtual: Duration in hours
 */
studySessionSchema.virtual('durationInHours').get(function (this: any) {
  return parseFloat((this.duration / 3600).toFixed(2));
});

/**
 * Virtual: Is session active
 */
studySessionSchema.virtual('isActive').get(function (this: any) {
  return this.status === SessionStatus.ACTIVE;
});

/**
 * Pre-save hook: Calculate duration for completed sessions
 */
studySessionSchema.pre('save', function (this: any, next) {
  if (this.status === SessionStatus.COMPLETED && this.endTime) {
    const totalTime = Math.floor(
      (this.endTime.getTime() - this.startTime.getTime()) / 1000
    );
    this.duration = Math.max(0, totalTime - this.pausedDuration);
  }
  next();
});

// ── Cache Invalidation Hook ──────────────────────────────────
import { StudyAnalyticsCacheRepository } from '@/shared/cache/studyCache';
studySessionSchema.post('save', async function (doc: any) {
  if (doc?.user) {
    try {
      await StudyAnalyticsCacheRepository.invalidateUserAnalytics(String(doc.user));
    } catch {}
  }
});
studySessionSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as any,
  async function (this: any) {
    try {
      const filter = this.getFilter ? this.getFilter() : {};
      let uid = filter.user || filter.userId;
      if (!uid && (filter._id || filter.sessionId)) {
        const doc = await this.model.findOne(filter).select('user userId').lean();
        if (doc) this._targetUserId = doc.user || doc.userId;
      } else if (uid) {
        this._targetUserId = uid;
      }
    } catch {}
  }
);

studySessionSchema.post(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as any,
  async function (this: any, res: any) {
    try {
      const filter = this.getFilter ? this.getFilter() : {};
      const uid = this._targetUserId || filter.user || filter.userId || (res && (res.user || res.userId));
      if (uid) {
        await StudyAnalyticsCacheRepository.invalidateUserAnalytics(String(uid));
      }
    } catch {}
  }
);

const StudySession = mongoose.model<IStudySession>('StudyGroup_StudySession', studySessionSchema);

export default StudySession;