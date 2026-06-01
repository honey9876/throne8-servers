/**
 * ====================================
 * REPORT MODEL
 * ====================================
 * Model for storing generated reports (weekly/monthly analytics)
 */

import mongoose, { Schema, Model } from 'mongoose';

/**
 * Report Type Enum
 */
export enum ReportType {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  CUSTOM = 'custom',
  ANNUAL = 'annual',
}

/**
 * Report Status Enum
 */
export enum ReportStatus {
  PENDING = 'pending',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Report Interface
 */
export interface IReport extends mongoose.Document {
  // Basic Info
  reportType: ReportType;
  title: string;
  description?: string;

  // User/Group Reference
  userId?: mongoose.Types.ObjectId;
  groupId?: mongoose.Types.ObjectId;

  // Date Range
  startDate: Date;
  endDate: Date;

  // Report Data
  data: {
    // Study Statistics
    totalStudyHours: number;
    totalSessions: number;
    averageSessionDuration: number;
    longestSession: number;
    shortestSession: number;

    // Daily Breakdown
    dailyStats: Array<{
      date: Date;
      studyHours: number;
      sessions: number;
      tasksCompleted: number;
    }>;

    // Task Statistics
    tasksCompleted: number;
    tasksOverdue: number;
    tasksPending: number;
    taskCompletionRate: number;

    // Goal Statistics
    goalsAchieved: number;
    goalsMissed: number;
    goalCompletionRate: number;
    averageDailyGoalCompletion: number;

    // Streak & Attendance
    currentStreak: number;
    longestStreak: number;
    attendanceRate: number;
    activeDays: number;

    // Ranking
    currentRank?: number;
    previousRank?: number;
    rankChange?: number;

    // Group Statistics (if groupId exists)
    groupStats?: {
      totalMembers: number;
      activeMembers: number;
      totalGroupStudyHours: number;
      averageMemberContribution: number;
      topContributors: Array<{
        userId: mongoose.Types.ObjectId;
        userName: string;
        studyHours: number;
      }>;
    };

    // Subject/Category Breakdown
    subjectWise?: Array<{
      subject: string;
      hours: number;
      percentage: number;
    }>;

    // Productivity Metrics
    mostProductiveDay?: string;
    mostProductiveTime?: string;
    consistencyScore?: number;

    // Comparisons
    comparisonWithPreviousPeriod?: {
      studyHoursChange: number;
      sessionsChange: number;
      streakChange: number;
      rankChange: number;
    };
  };

  // File Info (if PDF generated)
  pdfUrl?: string;
  pdfPublicId?: string;

  // Status
  status: ReportStatus;
  generatedAt?: Date;
  errorMessage?: string;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Report Schema
 */
const reportSchema = new Schema<IReport>(
  {
    reportType: {
      type: String,
      enum: Object.values(ReportType),
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'StudyGroup_Group',
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    data: {
      totalStudyHours: { type: Number, default: 0 },
      totalSessions: { type: Number, default: 0 },
      averageSessionDuration: { type: Number, default: 0 },
      longestSession: { type: Number, default: 0 },
      shortestSession: { type: Number, default: 0 },

      dailyStats: [
        {
          date: Date,
          studyHours: Number,
          sessions: Number,
          tasksCompleted: Number,
        },
      ],

      tasksCompleted: { type: Number, default: 0 },
      tasksOverdue: { type: Number, default: 0 },
      tasksPending: { type: Number, default: 0 },
      taskCompletionRate: { type: Number, default: 0 },

      goalsAchieved: { type: Number, default: 0 },
      goalsMissed: { type: Number, default: 0 },
      goalCompletionRate: { type: Number, default: 0 },
      averageDailyGoalCompletion: { type: Number, default: 0 },

      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      attendanceRate: { type: Number, default: 0 },
      activeDays: { type: Number, default: 0 },

      currentRank: Number,
      previousRank: Number,
      rankChange: Number,

      groupStats: {
        totalMembers: Number,
        activeMembers: Number,
        totalGroupStudyHours: Number,
        averageMemberContribution: Number,
        topContributors: [
          {
            userId: { type: Schema.Types.ObjectId, ref: 'User' },
            userName: String,
            studyHours: Number,
          },
        ],
      },

      subjectWise: [
        {
          subject: String,
          hours: Number,
          percentage: Number,
        },
      ],

      mostProductiveDay: String,
      mostProductiveTime: String,
      consistencyScore: Number,

      comparisonWithPreviousPeriod: {
        studyHoursChange: Number,
        sessionsChange: Number,
        streakChange: Number,
        rankChange: Number,
      },
    },
    pdfUrl: String,
    pdfPublicId: String,
    status: {
      type: String,
      enum: Object.values(ReportStatus),
      default: ReportStatus.PENDING,
    },
    generatedAt: Date,
    errorMessage: String,
  },
  {
    timestamps: true,
  }
);

/**
 * Indexes for performance
 */
reportSchema.index({ userId: 1, reportType: 1, createdAt: -1 });
reportSchema.index({ groupId: 1, reportType: 1, createdAt: -1 });
reportSchema.index({ startDate: 1, endDate: 1 });
reportSchema.index({ status: 1 });
reportSchema.index({ createdAt: -1 });

/**
 * Virtual: Report Period (human-readable)
 */
reportSchema.virtual('period').get(function (this: IReport) {
  const start = this.startDate.toLocaleDateString('en-IN');
  const end = this.endDate.toLocaleDateString('en-IN');
  return `${start} - ${end}`;
});

/**
 * Virtual: Duration in days
 */
reportSchema.virtual('durationDays').get(function (this: IReport) {
  const diffTime = Math.abs(this.endDate.getTime() - this.startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

/**
 * Instance Methods
 */

/**
 * Mark report as generating
 */
reportSchema.methods.markAsGenerating = async function (this: IReport) {
  this.status = ReportStatus.GENERATING;
  await this.save();
};

/**
 * Mark report as completed
 */
reportSchema.methods.markAsCompleted = async function (
  this: IReport,
  pdfUrl?: string,
  pdfPublicId?: string
) {
  this.status = ReportStatus.COMPLETED;
  this.generatedAt = new Date();
  if (pdfUrl) this.pdfUrl = pdfUrl;
  if (pdfPublicId) this.pdfPublicId = pdfPublicId;
  await this.save();
};

/**
 * Mark report as failed
 */
reportSchema.methods.markAsFailed = async function (
  this: IReport,
  errorMessage: string
) {
  this.status = ReportStatus.FAILED;
  this.errorMessage = errorMessage;
  await this.save();
};

/**
 * Static Methods
 */

/**
 * Get user's latest report
 */
reportSchema.statics.getLatestUserReport = async function (
  userId: string,
  reportType?: ReportType
) {
  const query: any = { userId };
  if (reportType) query.reportType = reportType;

  return this.findOne(query).sort({ createdAt: -1 });
};

/**
 * Get group's latest report
 */
reportSchema.statics.getLatestGroupReport = async function (
  groupId: string,
  reportType?: ReportType
) {
  const query: any = { groupId };
  if (reportType) query.reportType = reportType;

  return this.findOne(query).sort({ createdAt: -1 });
};

/**
 * Get pending reports
 */
reportSchema.statics.getPendingReports = async function () {
  return this.find({ status: ReportStatus.PENDING }).sort({ createdAt: 1 });
};

/**
 * Delete old reports
 */
reportSchema.statics.deleteOldReports = async function (daysOld: number = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    status: ReportStatus.COMPLETED,
  });

  return result.deletedCount;
};

/**
 * Export Model
 */
const Report: Model<IReport> = mongoose.model<IReport>('StudyGroup_Report', reportSchema);

export default Report;