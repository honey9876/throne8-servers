// src/models/mongodb/ConnectionActivity.ts

import { Schema, model, Document, Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

/**
 * CONNECTION ACTIVITY MODEL
 * =========================
 * Tracks all activities related to connections and requests
 * Used for analytics, audit logs, and activity feeds
 * Optimized for time-series queries
 */

export enum ActivityType {
  CONNECTION_CREATED = 'connection_created',
  CONNECTION_REMOVED = 'connection_removed',
  CONNECTION_BLOCKED = 'connection_blocked',
  REQUEST_SENT = 'request_sent',
  REQUEST_ACCEPTED = 'request_accepted',
  REQUEST_DECLINED = 'request_declined',
  REQUEST_CANCELLED = 'request_cancelled',
  NOTE_ADDED = 'note_added',
  NOTE_UPDATED = 'note_updated',
  TAG_ADDED = 'tag_added',
  TAG_REMOVED = 'tag_removed',
  STRENGTH_UPDATED = 'strength_updated',
  PROFILE_VIEWED = 'profile_viewed',
  MESSAGE_SENT = 'message_sent',
}

export interface IConnectionActivity extends Document {
  activityId: string;
  userId: Types.ObjectId;
  targetUserId?: Types.ObjectId;
  connectionId?: string;
  requestId?: string;
  activityType: ActivityType;
  description?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  region?: string;
  isDeleted: boolean;
}

interface IConnectionActivityModel extends Model<IConnectionActivity> {
  logActivity(data: Partial<IConnectionActivity>): Promise<IConnectionActivity>;
  getUserActivities(userId: string, limit?: number, skip?: number): Promise<IConnectionActivity[]>;
  getConnectionActivities(connectionId: string, limit?: number): Promise<IConnectionActivity[]>;
  getActivityStats(userId: string, days?: number): Promise<any>;
  cleanupOldActivities(daysOld?: number): Promise<number>;
}

const ConnectionActivitySchema: Schema<IConnectionActivity, IConnectionActivityModel> = 
  new Schema<IConnectionActivity, IConnectionActivityModel>(
    {
      activityId: {
        type: String,
        required: true,
        unique: true,
        default: () => uuidv4(),
      },
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required'],
      },
      targetUserId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      connectionId: {
        type: String,
      },
      requestId: {
        type: String,
      },
      activityType: {
        type: String,
        enum: {
          values: Object.values(ActivityType),
          message: '{VALUE} is not a valid activity type',
        },
        required: [true, 'Activity type is required'],
      },
      description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters'],
      },
      metadata: {
        type: Schema.Types.Mixed,
        default: {},
      },
      ipAddress: {
        type: String,
        trim: true,
        maxlength: [45, 'IP address cannot exceed 45 characters'],
      },
      userAgent: {
        type: String,
        trim: true,
        maxlength: [500, 'User agent cannot exceed 500 characters'],
      },
      timestamp: {
        type: Date,
        default: Date.now,
        required: true,
      },
      region: {
        type: String,
        default: 'global',
      },
      isDeleted: {
        type: Boolean,
        default: false,
      },
    },
    {
      timestamps: false, // Using custom timestamp field
      toJSON: { virtuals: true },
      toObject: { virtuals: true },
    }
  );

// ============================================================================
// INDEXES - Time-series optimized
// ============================================================================

ConnectionActivitySchema.index({ userId: 1, timestamp: -1 });
ConnectionActivitySchema.index({ targetUserId: 1, timestamp: -1 });
ConnectionActivitySchema.index({ connectionId: 1, timestamp: -1 });
ConnectionActivitySchema.index({ activityType: 1, timestamp: -1 });
ConnectionActivitySchema.index({ userId: 1, activityType: 1, timestamp: -1 });
ConnectionActivitySchema.index({ region: 1, timestamp: -1 });

// TTL Index - Auto-delete activities older than 1 year
ConnectionActivitySchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 31536000 }
);

// ============================================================================
// STATIC METHODS
// ============================================================================

ConnectionActivitySchema.statics.logActivity = async function (
  data: Partial<IConnectionActivity>
): Promise<IConnectionActivity> {
  const activity = new this({
    ...data,
    timestamp: new Date(),
  });
  return activity.save();
};

ConnectionActivitySchema.statics.getUserActivities = async function (
  userId: string,
  limit: number = 50,
  skip: number = 0
): Promise<IConnectionActivity[]> {
  return this.find({ 
    userId, 
    isDeleted: false 
  })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
};

ConnectionActivitySchema.statics.getConnectionActivities = async function (
  connectionId: string,
  limit: number = 50
): Promise<IConnectionActivity[]> {
  return this.find({ 
    connectionId, 
    isDeleted: false 
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean()
    .exec();
};

ConnectionActivitySchema.statics.getActivityStats = async function (
  userId: string,
  days: number = 30
): Promise<any> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        timestamp: { $gte: startDate },
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: '$activityType',
        count: { $sum: 1 },
        lastActivity: { $max: '$timestamp' },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  const totalActivities = await this.countDocuments({
    userId,
    timestamp: { $gte: startDate },
    isDeleted: false,
  });

  return {
    totalActivities,
    byType: stats,
    period: `${days} days`,
  };
};

ConnectionActivitySchema.statics.cleanupOldActivities = async function (
  daysOld: number = 365
): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  
  const result = await this.deleteMany({
    timestamp: { $lt: cutoffDate },
  });

  return result.deletedCount || 0;
};

// ============================================================================
// EXPORT
// ============================================================================

const ConnectionActivity = model<IConnectionActivity, IConnectionActivityModel>(
  'ConnectionActivity',
  ConnectionActivitySchema
);

export default ConnectionActivity;