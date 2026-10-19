import mongoose, { Schema, Document } from "mongoose";

export interface IResumeAnalytics extends Document {
  resumeId: mongoose.Types.ObjectId;
  userId: string;

  views: number;
  downloads: number;
  shares: number;
  uniqueVisitors: number;

  lastViewedAt?: Date;
  lastDownloadedAt?: Date;
  lastSharedAt?: Date;

  dailyViews: number;
  weeklyViews: number;
  monthlyViews: number;

  countries: string[];
  devices: string[];
  browsers: string[];
  visitorIps: string[];

  lastVisitorIp?: string;
  lastCountry?: string;
  lastBrowser?: string;
  lastDevice?: string;



  lastDailyReset?: Date;

lastWeeklyReset?: Date;

lastMonthlyReset?: Date;
}

const resumeAnalyticsSchema = new Schema<IResumeAnalytics>(
  {
    resumeId: {
      type: Schema.Types.ObjectId,
      ref: "ResumeBuilder",
      required: true,
      unique: true,
    },

    userId: {
      type: String,
      required: true,
      index: true,
    },

    views: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },

    lastViewedAt: { type: Date },
    lastDownloadedAt: { type: Date },
    lastSharedAt: { type: Date },

    dailyViews: { type: Number, default: 0 },
    weeklyViews: { type: Number, default: 0 },
    monthlyViews: { type: Number, default: 0 },

    countries: { type: [String], default: [] },
    devices: { type: [String], default: [] },
    browsers: { type: [String], default: [] },
    visitorIps: { type: [String], default: [] },

    lastVisitorIp: { type: String, default: "" },
    lastCountry: { type: String, default: "" },
    lastBrowser: { type: String, default: "" },
    lastDevice: { type: String, default: "" },
   lastDailyReset: {
  type: Date,
},

lastWeeklyReset: {
  type: Date,
},

lastMonthlyReset: {
  type: Date,
},
  },

  
  {
    timestamps: true,
  }
);

// Indexes
resumeAnalyticsSchema.index({ resumeId: 1 });
resumeAnalyticsSchema.index({ userId: 1 });

export const ResumeAnalytics =
  (mongoose.models["ResumeAnalytics"] as mongoose.Model<IResumeAnalytics>) ||
  mongoose.model<IResumeAnalytics>(
    "ResumeAnalytics",
    resumeAnalyticsSchema
  );