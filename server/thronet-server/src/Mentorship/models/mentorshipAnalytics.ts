// src/models/MentorshipAnalytics.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface IMentorshipAnalytics extends Document {
  type: string;
  entityType: string;
  entityId: string;
  date: Date;
  metrics: {
    views?: number;
    clicks?: number;
    bookings?: number;
    cancellations?: number;
    completions?: number;
    revenue?: number;
    searches?: number;
    conversions?: number;
    uniqueVisitors?: number;
    returningVisitors?: number;
    averageRating?: number;
    totalReviews?: number;
  };
  breakdown?: {
    hourly?: any;
    daily?: any;
    weekly?: any;
    monthly?: any;
    bySource?: any;
    byDevice?: any;
    byLocation?: any;
  };
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

const MentorshipAnalyticsSchema = new Schema<IMentorshipAnalytics>(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'mentor_analytics',
        'session_analytics',
        'platform_analytics',
        'user_analytics',
        'revenue_analytics',
        'search_analytics',
        'conversion_analytics',
      ],
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      enum: ['mentor', 'user', 'session', 'platform', 'search', 'revenue'],
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    metrics: {
      views: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      bookings: { type: Number, default: 0 },
      cancellations: { type: Number, default: 0 },
      completions: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      searches: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      uniqueVisitors: { type: Number, default: 0 },
      returningVisitors: { type: Number, default: 0 },
      averageRating: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
    },
    breakdown: {
      hourly: Schema.Types.Mixed,
      daily: Schema.Types.Mixed,
      weekly: Schema.Types.Mixed,
      monthly: Schema.Types.Mixed,
      bySource: Schema.Types.Mixed,
      byDevice: Schema.Types.Mixed,
      byLocation: Schema.Types.Mixed,
    },
    metadata: Schema.Types.Mixed,
  },
  {
    timestamps: true,
    collection: 'MentorshipAnalytics',
    versionKey: false
  }
);

// Compound indexes
MentorshipAnalyticsSchema.index({ type: 1, entityId: 1, date: -1 });
MentorshipAnalyticsSchema.index({ entityType: 1, entityId: 1, date: -1 });
MentorshipAnalyticsSchema.index({ date: -1 });

// Static method to record event
MentorshipAnalyticsSchema.statics.recordEvent = async function (
  type: string,
  entityType: string,
  entityId: string,
  metricName: keyof IMentorshipAnalytics['metrics'],
  value: number = 1
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const Mentorshipanalytics = await this.findOneAndUpdate(
      { type, entityType, entityId, date: today },
      {
        $inc: { [`metrics.${metricName}`]: value },
        $setOnInsert: { type, entityType, entityId, date: today },
      },
      { upsert: true, new: true }
    );

    return Mentorshipanalytics;
  } catch (error : any) {
    console.error('Failed to record analytics event:', error);
    throw error;
  }
};

// Static method to get Mentorshipanalytics by date range
MentorshipAnalyticsSchema.statics.getAnalyticsByDateRange = async function (
  entityType: string,
  entityId: string,
  startDate: Date,
  endDate: Date
) {
  return this.find({
    entityType,
    entityId,
    date: { $gte: startDate, $lte: endDate },
  })
    .sort({ date: 1 })
    .lean();
};

// Static method to get aggregated metrics
MentorshipAnalyticsSchema.statics.getAggregatedMetrics = async function (
  entityType: string,
  entityId: string,
  startDate: Date,
  endDate: Date
) {
  const result = await this.aggregate([
    {
      $match: {
        entityType,
        entityId,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalViews: { $sum: '$metrics.views' },
        totalClicks: { $sum: '$metrics.clicks' },
        totalBookings: { $sum: '$metrics.bookings' },
        totalCancellations: { $sum: '$metrics.cancellations' },
        totalCompletions: { $sum: '$metrics.completions' },
        totalRevenue: { $sum: '$metrics.revenue' },
        totalSearches: { $sum: '$metrics.searches' },
        totalConversions: { $sum: '$metrics.conversions' },
        avgRating: { $avg: '$metrics.averageRating' },
        totalReviews: { $sum: '$metrics.totalReviews' },
      },
    },
  ]);

  return result[0] || null;
};

// Static method to get top performers
MentorshipAnalyticsSchema.statics.getTopPerformers = async function (
  type: string,
  metricName: string,
  limit: number = 10,
  startDate?: Date,
  endDate?: Date
) {
  const matchStage: any = { type };
  
  if (startDate && endDate) {
    matchStage.date = { $gte: startDate, $lte: endDate };
  }

  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$entityId',
        totalMetric: { $sum: `$metrics.${metricName}` },
        entityType: { $first: '$entityType' },
      },
    },
    { $sort: { totalMetric: -1 } },
    { $limit: limit },
  ]);

  return result;
};

const MentorshipAnalytics = mongoose.model<IMentorshipAnalytics>('MentorshipAnalytics', MentorshipAnalyticsSchema);

export default MentorshipAnalytics;