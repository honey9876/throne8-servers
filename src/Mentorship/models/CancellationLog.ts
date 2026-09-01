import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface for CancellationLog document
 */
export interface ICancellationLog {
  sessionId: string;
  cancelledBy: string; // userId who initiated cancellation
  cancelledByRole: 'mentor' | 'mentee' | 'system' | 'admin';
  
  // Session details at time of cancellation
  sessionType: string;
  scheduledAt: Date;
  timezone: string;
  sessionPrice: number;
  
  // Cancellation metadata
  reason: string;
  cancellationCategory?: 'personal' | 'emergency' | 'scheduling_conflict' | 'technical' | 'other';
  additionalNotes?: string;
  
  // Timing information
  hoursBeforeSession: number; // Hours between cancellation and scheduled time
  withinPolicy: boolean; // Was it within 24hr policy?
  
  // Refund information
  refundEligible: boolean;
  refundPercentage: number; // 0, 50, or 100
  refundAmount: number;
  refundStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'not_applicable';
  refundProcessedAt?: Date;
  refundTransactionId?: string;
  
  // Notification tracking
  mentorNotified: boolean;
  menteeNotified: boolean;
  notificationsSentAt?: Date;
  
  // System metadata
  ipAddress?: string;
  userAgent?: string;
  
  // Timestamps
  cancelledAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CancellationLogDocument extends ICancellationLog, Document {}

/**
 * CancellationLog Schema
 * Tracks all session cancellation activities
 */
const CancellationLogSchema = new Schema<CancellationLogDocument>(
  {
    sessionId: {
      type: String,
      required: [true, 'Session ID is required'],
      index: true,
      ref: 'Session',
    },
    
    cancelledBy: {
      type: String,
      required: [true, 'Cancelled by user ID is required'],
      index: true,
    },
    
    cancelledByRole: {
      type: String,
      enum: ['mentor', 'mentee', 'system', 'admin'],
      required: [true, 'Cancelled by role is required'],
      index: true,
    },
    
    // Session details
    sessionType: {
      type: String,
      required: [true, 'Session type is required'],
      index: true,
    },
    
    scheduledAt: {
      type: Date,
      required: [true, 'Scheduled time is required'],
      index: true,
    },
    
    timezone: {
      type: String,
      required: [true, 'Timezone is required'],
      default: 'UTC',
    },
    
    sessionPrice: {
      type: Number,
      required: [true, 'Session price is required'],
      min: [0, 'Price cannot be negative'],
    },
    
    // Cancellation details
    reason: {
      type: String,
      required: [true, 'Cancellation reason is required'],
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    
    cancellationCategory: {
      type: String,
      enum: ['personal', 'emergency', 'scheduling_conflict', 'technical', 'other'],
      index: true,
    },
    
    additionalNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Additional notes cannot exceed 1000 characters'],
    },
    
    // Timing
    hoursBeforeSession: {
      type: Number,
      required: true,
      min: [0, 'Hours before session cannot be negative'],
    },
    
    withinPolicy: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    
    // Refund details
    refundEligible: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    
    refundPercentage: {
      type: Number,
      required: true,
      min: [0, 'Refund percentage cannot be negative'],
      max: [100, 'Refund percentage cannot exceed 100'],
      default: 0,
    },
    
    refundAmount: {
      type: Number,
      required: true,
      min: [0, 'Refund amount cannot be negative'],
      default: 0,
    },
    
    refundStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'not_applicable'],
      default: 'not_applicable',
      index: true,
    },
    
    refundProcessedAt: {
      type: Date,
    },
    
    refundTransactionId: {
      type: String,
      trim: true,
      index: true,
    },
    
    // Notifications
    mentorNotified: {
      type: Boolean,
      default: false,
    },
    
    menteeNotified: {
      type: Boolean,
      default: false,
    },
    
    notificationsSentAt: {
      type: Date,
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
    
    cancelledAt: {
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

CancellationLogSchema.index({ sessionId: 1, cancelledAt: -1 });
CancellationLogSchema.index({ cancelledBy: 1, cancelledAt: -1 });
CancellationLogSchema.index({ refundStatus: 1, refundEligible: 1 });
CancellationLogSchema.index({ cancelledAt: -1 });
CancellationLogSchema.index({ withinPolicy: 1, refundEligible: 1 });

// ========================
// VIRTUAL PROPERTIES
// ========================

/**
 * Check if both parties were notified
 */
CancellationLogSchema.virtual('allNotified').get(function () {
  return this.mentorNotified && this.menteeNotified;
});

/**
 * Get days before session
 */
CancellationLogSchema.virtual('daysBeforeSession').get(function () {
  return Math.round(this.hoursBeforeSession / 24);
});

/**
 * Check if refund is completed
 */
CancellationLogSchema.virtual('refundCompleted').get(function () {
  return this.refundStatus === 'completed';
});

/**
 * Check if refund is pending
 */
CancellationLogSchema.virtual('refundPending').get(function () {
  return this.refundEligible && 
    ['pending', 'processing'].includes(this.refundStatus);
});

// ========================
// INSTANCE METHODS
// ========================

/**
 * Mark mentor as notified
 */
CancellationLogSchema.methods.markMentorNotified = async function (): Promise<CancellationLogDocument> {
  this.mentorNotified = true;
  if (this.menteeNotified && !this.notificationsSentAt) {
    this.notificationsSentAt = new Date();
  }
  return await this.save();
};

/**
 * Mark mentee as notified
 */
CancellationLogSchema.methods.markMenteeNotified = async function (): Promise<CancellationLogDocument> {
  this.menteeNotified = true;
  if (this.mentorNotified && !this.notificationsSentAt) {
    this.notificationsSentAt = new Date();
  }
  return await this.save();
};

/**
 * Mark both parties as notified
 */
CancellationLogSchema.methods.markAllNotified = async function (): Promise<CancellationLogDocument> {
  this.mentorNotified = true;
  this.menteeNotified = true;
  this.notificationsSentAt = new Date();
  return await this.save();
};

/**
 * Update refund status
 */
CancellationLogSchema.methods.updateRefundStatus = async function (
  status: 'pending' | 'processing' | 'completed' | 'failed',
  transactionId?: string
): Promise<CancellationLogDocument> {
  this.refundStatus = status;
  
  if (status === 'completed') {
    this.refundProcessedAt = new Date();
  }
  
  if (transactionId) {
    this.refundTransactionId = transactionId;
  }
  
  return await this.save();
};

// ========================
// STATIC METHODS
// ========================

/**
 * Get cancellation history for a session
 */
CancellationLogSchema.statics.getSessionHistory = function (sessionId: string) {
  return this.findOne({ sessionId }).lean();
};

/**
 * Get user's cancellation history
 */
CancellationLogSchema.statics.getUserHistory = function (
  userId: string,
  limit: number = 20
) {
  return this.find({ cancelledBy: userId })
    .sort({ cancelledAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get cancellation statistics for a user
 */
CancellationLogSchema.statics.getUserStats = async function (userId: string) {
  const stats = await this.aggregate([
    { $match: { cancelledBy: userId } },
    {
      $group: {
        _id: null,
        totalCancellations: { $sum: 1 },
        withinPolicy: {
          $sum: { $cond: ['$withinPolicy', 1, 0] },
        },
        totalRefunds: { $sum: '$refundAmount' },
        refundsCompleted: {
          $sum: { $cond: [{ $eq: ['$refundStatus', 'completed'] }, 1, 0] },
        },
        emergencyCancellations: {
          $sum: {
            $cond: [{ $eq: ['$cancellationCategory', 'emergency'] }, 1, 0],
          },
        },
      },
    },
  ]);

  return stats[0] || {
    totalCancellations: 0,
    withinPolicy: 0,
    totalRefunds: 0,
    refundsCompleted: 0,
    emergencyCancellations: 0,
  };
};

/**
 * Get pending refunds
 */
CancellationLogSchema.statics.getPendingRefunds = function (
  limit: number = 50,
  skip: number = 0
) {
  return this.find({
    refundEligible: true,
    refundStatus: { $in: ['pending', 'processing'] },
  })
    .sort({ cancelledAt: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

/**
 * Get recent cancellations (admin dashboard)
 */
CancellationLogSchema.statics.getRecentCancellations = function (
  limit: number = 50,
  skip: number = 0
) {
  return this.find()
    .sort({ cancelledAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

/**
 * Get cancellations by date range
 */
CancellationLogSchema.statics.getCancellationsByDateRange = function (
  startDate: Date,
  endDate: Date
) {
  return this.find({
    cancelledAt: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .sort({ cancelledAt: -1 })
    .lean();
};

/**
 * Get cancellation analytics
 */
CancellationLogSchema.statics.getAnalytics = async function (
  startDate: Date,
  endDate: Date
) {
  const analytics = await this.aggregate([
    {
      $match: {
        cancelledAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalCancellations: { $sum: 1 },
        totalRefunds: { $sum: '$refundAmount' },
        averageRefund: { $avg: '$refundAmount' },
        withinPolicy: {
          $sum: { $cond: ['$withinPolicy', 1, 0] },
        },
        byMentor: {
          $sum: {
            $cond: [{ $eq: ['$cancelledByRole', 'mentor'] }, 1, 0],
          },
        },
        byMentee: {
          $sum: {
            $cond: [{ $eq: ['$cancelledByRole', 'mentee'] }, 1, 0],
          },
        },
        refundsCompleted: {
          $sum: { $cond: [{ $eq: ['$refundStatus', 'completed'] }, 1, 0] },
        },
      },
    },
  ]);

  return analytics[0] || {
    totalCancellations: 0,
    totalRefunds: 0,
    averageRefund: 0,
    withinPolicy: 0,
    byMentor: 0,
    byMentee: 0,
    refundsCompleted: 0,
  };
};

/**
 * Get cancellation reasons breakdown
 */
CancellationLogSchema.statics.getReasonsBreakdown = async function (
  startDate?: Date,
  endDate?: Date
) {
  const match: any = {};
  
  if (startDate && endDate) {
    match.cancelledAt = { $gte: startDate, $lte: endDate };
  }

  const breakdown = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$cancellationCategory',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  return breakdown;
};

// ========================
// EXPORT MODEL
// ========================

export default mongoose.model<CancellationLogDocument>(
  'CancellationLog',
  CancellationLogSchema
);