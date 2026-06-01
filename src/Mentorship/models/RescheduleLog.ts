import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface for RescheduleLog document
 */
export interface IRescheduleLog {
  sessionId: string;
  rescheduledBy: string; // userId who initiated reschedule
  rescheduledByRole: 'mentor' | 'mentee';
  
  // Old schedule details
  oldScheduledAt: Date;
  oldTimezone: string;
  
  // New schedule details
  newScheduledAt: Date;
  newTimezone: string;
  
  // Reschedule metadata
  reason?: string;
  rescheduleCount: number; // Which reschedule is this (1st, 2nd, etc.)
  
  // Fee information
  rescheduleFee?: number;
  feeWaived: boolean;
  
  // Notification tracking
  mentorNotified: boolean;
  menteeNotified: boolean;
  
  // System metadata
  ipAddress?: string;
  userAgent?: string;
  
  // Timestamps
  rescheduledAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RescheduleLogDocument extends IRescheduleLog, Document {}

/**
 * RescheduleLog Schema
 * Tracks all session rescheduling activities
 */
const RescheduleLogSchema = new Schema<RescheduleLogDocument>(
  {
    sessionId: {
      type: String,
      required: [true, 'Session ID is required'],
      index: true,
      ref: 'Session',
    },
    
    rescheduledBy: {
      type: String,
      required: [true, 'Rescheduled by user ID is required'],
      index: true,
    },
    
    rescheduledByRole: {
      type: String,
      enum: ['mentor', 'mentee'],
      required: [true, 'Rescheduled by role is required'],
      index: true,
    },
    
    // Old schedule
    oldScheduledAt: {
      type: Date,
      required: [true, 'Old scheduled time is required'],
    },
    
    oldTimezone: {
      type: String,
      required: [true, 'Old timezone is required'],
      default: 'UTC',
    },
    
    // New schedule
    newScheduledAt: {
      type: Date,
      required: [true, 'New scheduled time is required'],
      index: true,
    },
    
    newTimezone: {
      type: String,
      required: [true, 'New timezone is required'],
      default: 'UTC',
    },
    
    // Metadata
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    
    rescheduleCount: {
      type: Number,
      required: true,
      min: [1, 'Reschedule count must be at least 1'],
      max: [10, 'Reschedule count cannot exceed 10'],
    },
    
    // Fee tracking
    rescheduleFee: {
      type: Number,
      min: [0, 'Reschedule fee cannot be negative'],
      default: 0,
    },
    
    feeWaived: {
      type: Boolean,
      default: false,
    },
    
    // Notification tracking
    mentorNotified: {
      type: Boolean,
      default: false,
    },
    
    menteeNotified: {
      type: Boolean,
      default: false,
    },
    
    // System metadata
    ipAddress: {
      type: String,
      trim: true,
    },
    
    userAgent: {
      type: String,
      trim: true,
    },
    
    rescheduledAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========================
// INDEXES
// ========================

// Compound indexes for efficient queries
RescheduleLogSchema.index({ sessionId: 1, rescheduledAt: -1 });
RescheduleLogSchema.index({ rescheduledBy: 1, rescheduledAt: -1 });
RescheduleLogSchema.index({ sessionId: 1, rescheduleCount: 1 });
RescheduleLogSchema.index({ rescheduledAt: -1 });

// ========================
// VIRTUAL PROPERTIES
// ========================

/**
 * Time difference between old and new schedule (in hours)
 */
RescheduleLogSchema.virtual('timeDifferenceHours').get(function () {
  const diffMs = Math.abs(
    this.newScheduledAt.getTime() - this.oldScheduledAt.getTime()
  );
  return Math.round(diffMs / (1000 * 60 * 60));
});

/**
 * Time difference between old and new schedule (in days)
 */
RescheduleLogSchema.virtual('timeDifferenceDays').get(function () {
  const diffMs = Math.abs(
    this.newScheduledAt.getTime() - this.oldScheduledAt.getTime()
  );
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
});

/**
 * Check if reschedule was done within policy (24 hours before)
 */
RescheduleLogSchema.virtual('withinPolicy').get(function () {
  const hoursUntilOldSession =
    (this.oldScheduledAt.getTime() - this.rescheduledAt.getTime()) /
    (1000 * 60 * 60);
  return hoursUntilOldSession >= 24;
});

/**
 * Check if both parties were notified
 */
RescheduleLogSchema.virtual('allNotified').get(function () {
  return this.mentorNotified && this.menteeNotified;
});

// ========================
// INSTANCE METHODS
// ========================

/**
 * Mark mentor as notified
 */
RescheduleLogSchema.methods.markMentorNotified = async function (): Promise<RescheduleLogDocument> {
  this.mentorNotified = true;
  return await this.save();
};

/**
 * Mark mentee as notified
 */
RescheduleLogSchema.methods.markMenteeNotified = async function (): Promise<RescheduleLogDocument> {
  this.menteeNotified = true;
  return await this.save();
};

/**
 * Mark both parties as notified
 */
RescheduleLogSchema.methods.markAllNotified = async function (): Promise<RescheduleLogDocument> {
  this.mentorNotified = true;
  this.menteeNotified = true;
  return await this.save();
};

// ========================
// STATIC METHODS
// ========================

/**
 * Get reschedule history for a session
 */
RescheduleLogSchema.statics.getSessionHistory = function (
  sessionId: string,
  limit: number = 10
) {
  return this.find({ sessionId })
    .sort({ rescheduledAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get reschedule count for a session
 */
RescheduleLogSchema.statics.getSessionRescheduleCount = async function (
  sessionId: string
): Promise<number> {
  return await this.countDocuments({ sessionId });
};

/**
 * Get user's reschedule history
 */
RescheduleLogSchema.statics.getUserHistory = function (
  userId: string,
  limit: number = 20
) {
  return this.find({ rescheduledBy: userId })
    .sort({ rescheduledAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get reschedule statistics for a user
 */
RescheduleLogSchema.statics.getUserStats = async function (userId: string) {
  const stats = await this.aggregate([
    { $match: { rescheduledBy: userId } },
    {
      $group: {
        _id: null,
        totalReschedules: { $sum: 1 },
        totalFees: { $sum: '$rescheduleFee' },
        feesWaived: {
          $sum: { $cond: ['$feeWaived', 1, 0] },
        },
        withinPolicy: {
          $sum: {
            $cond: [
              {
                $gte: [
                  {
                    $subtract: [
                      '$oldScheduledAt',
                      '$rescheduledAt',
                    ],
                  },
                  24 * 60 * 60 * 1000, // 24 hours in milliseconds
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return stats[0] || {
    totalReschedules: 0,
    totalFees: 0,
    feesWaived: 0,
    withinPolicy: 0,
  };
};

/**
 * Get recent reschedules (for admin dashboard)
 */
RescheduleLogSchema.statics.getRecentReschedules = function (
  limit: number = 50,
  skip: number = 0
) {
  return this.find()
    .sort({ rescheduledAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

/**
 * Get reschedules by date range
 */
RescheduleLogSchema.statics.getReschedulesByDateRange = function (
  startDate: Date,
  endDate: Date
) {
  return this.find({
    rescheduledAt: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .sort({ rescheduledAt: -1 })
    .lean();
};

/**
 * Get reschedule analytics for a period
 */
RescheduleLogSchema.statics.getAnalytics = async function (
  startDate: Date,
  endDate: Date
) {
  const analytics = await this.aggregate([
    {
      $match: {
        rescheduledAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalReschedules: { $sum: 1 },
        totalFees: { $sum: '$rescheduleFee' },
        averageFee: { $avg: '$rescheduleFee' },
        feesWaived: {
          $sum: { $cond: ['$feeWaived', 1, 0] },
        },
        byMentor: {
          $sum: {
            $cond: [{ $eq: ['$rescheduledByRole', 'mentor'] }, 1, 0],
          },
        },
        byMentee: {
          $sum: {
            $cond: [{ $eq: ['$rescheduledByRole', 'mentee'] }, 1, 0],
          },
        },
      },
    },
  ]);

  return analytics[0] || {
    totalReschedules: 0,
    totalFees: 0,
    averageFee: 0,
    feesWaived: 0,
    byMentor: 0,
    byMentee: 0,
  };
};

// ========================
// PRE-SAVE MIDDLEWARE
// ========================

RescheduleLogSchema.pre('save', function (next) {
  // Validate that new time is different from old time
  if (this.isNew) {
    if (this.oldScheduledAt.getTime() === this.newScheduledAt.getTime()) {
      return next(new Error('New scheduled time must be different from old time'));
    }
  }
  
  next();
});

// ========================
// EXPORT MODEL
// ========================

export default mongoose.model<RescheduleLogDocument>(
  'RescheduleLog',
  RescheduleLogSchema
);