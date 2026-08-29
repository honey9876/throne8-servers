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
    },
    user: {
      type: String,
      ref: 'User',
      required: [true, 'User is required'],
    },
    goal: {
      type: String,
      ref: 'StudyGroup_Goal',
      default: null,
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
  transform: function (_doc, ret) {
    const r = ret as any;
    r.id = r.sessionId;
    delete r._id;
    delete r.__v;
    return r;
  },
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
studySessionSchema.virtual('durationInMinutes').get(function () {
  return Math.floor(this.duration / 60);
});

/**
 * Virtual: Duration in hours
 */
studySessionSchema.virtual('durationInHours').get(function () {
  return parseFloat((this.duration / 3600).toFixed(2));
});

/**
 * Virtual: Is session active
 */
studySessionSchema.virtual('isActive').get(function () {
  return this.status === SessionStatus.ACTIVE;
});

/**
 * Pre-save hook: Calculate duration for completed sessions
 */
studySessionSchema.pre('save', function (next) {
  if (this.status === SessionStatus.COMPLETED && this.endTime) {
    const totalTime = Math.floor(
      (this.endTime.getTime() - this.startTime.getTime()) / 1000
    );
    this.duration = Math.max(0, totalTime - this.pausedDuration);
  }
  next();
});

const StudySession = mongoose.model<IStudySession>('StudyGroup_StudySession', studySessionSchema);

export default StudySession;