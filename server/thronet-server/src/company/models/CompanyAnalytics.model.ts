import mongoose, { Model, Schema, Document } from 'mongoose';

const CompanyAnalyticsSchema = new Schema(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    metrics: {
      pageViews: {
        type: Number,
        default: 0,
      },
      profileVisits: {
        type: Number,
        default: 0,
      },
      postsViews: {
        type: Number,
        default: 0,
      },
      postsPublished: {
        type: Number,
        default: 0,
      },
      postsEngagement: {
        likes: { type: Number, default: 0 },
        comments: { type: Number, default: 0 },
        shares: { type: Number, default: 0 },
      },
      followersGained: {
        type: Number,
        default: 0,
      },
      followersLost: {
        type: Number,
        default: 0,
      },
      jobsPosted: {
        type: Number,
        default: 0,
      },
      jobApplications: {
        type: Number,
        default: 0,
      },
      eventsHosted: {
        type: Number,
        default: 0,
      },
      eventAttendees: {
        type: Number,
        default: 0,
      },
      reviewsReceived: {
        type: Number,
        default: 0,
      },
      averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
    },
    traffic: {
      organic: { type: Number, default: 0 },
      direct: { type: Number, default: 0 },
      referral: { type: Number, default: 0 },
      social: { type: Number, default: 0 },
    },
    topPages: [
      {
        page: String,
        views: Number,
      },
    ],
    topPosts: [
      {
        post: {
          type: Schema.Types.ObjectId,
          ref: 'Post',
        },
        views: Number,
        engagement: Number,
      },
    ],
  },
  {
    timestamps: true,
    collection: 'CompanyAnalytics',
    versionKey: false,
  }
);

// TTL Index - auto delete old analytics after 2 years
CompanyAnalyticsSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 63072000 }
);

CompanyAnalyticsSchema.index({ company: 1, date: -1 });

// =====================================================
// INTERFACE - Document Type (WITH METHODS)
// =====================================================
export interface ICompanyAnalyticsDocument extends Document {
  _id: mongoose.Types.ObjectId;
  company: mongoose.Types.ObjectId;
  date: Date;
  metrics: {
    pageViews: number;
    profileVisits: number;
    postsViews: number;
    postsPublished: number;
    postsEngagement: {
      likes: number;
      comments: number;
      shares: number;
    };
    followersGained: number;
    followersLost: number;
    jobsPosted: number;
    jobApplications: number;
    eventsHosted: number;
    eventAttendees: number;
    reviewsReceived: number;
    averageRating: number;
  };
  traffic: {
    organic: number;
    direct: number;
    referral: number;
    social: number;
  };
  topPages?: Array<{
    page: string;
    views: number;
  }>;
  topPosts?: Array<{
    post: mongoose.Types.ObjectId;
    views: number;
    engagement: number;
  }>;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  incrementMetric(metricPath: string, value?: number): Promise<ICompanyAnalyticsDocument>;
  getTotalEngagement(): number;
  getEngagementRate(): number;
  getFollowerNetGrowth(): number;
}

// =====================================================
// INTERFACE - Static Methods
// =====================================================
interface IAnalyticsModel extends Model<ICompanyAnalyticsDocument> {
  findOrCreateToday(companyId: string): Promise<ICompanyAnalyticsDocument>;
  getCompanyAnalytics(
    companyId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<ICompanyAnalyticsDocument[]>;
  getDailyStats(companyId: string, days?: number): Promise<ICompanyAnalyticsDocument[]>;
  getWeeklyStats(companyId: string, weeks?: number): Promise<Record<string, unknown>[]>;
  getMonthlyStats(companyId: string, months?: number): Promise<Record<string, unknown>[]>;
  getYearlyStats(companyId: string, year?: number): Promise<Record<string, unknown>[]>;
  getCompanySummary(companyId: string, startDate?: Date, endDate?: Date): Promise<Record<string, unknown> | null>;
  getTrendingCompanies(limit?: number, days?: number): Promise<Record<string, unknown>[]>;
  getTopPosts(companyId?: string, limit?: number, days?: number): Promise<Record<string, unknown>[]>;
  trackEvent(
    companyId: string,
    eventType: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;
}

// =====================================================
// INSTANCE METHODS
// =====================================================

// Increment any metric dynamically
CompanyAnalyticsSchema.methods.incrementMetric = async function (
  this: ICompanyAnalyticsDocument,
  metricPath: string,
  value = 1
): Promise<ICompanyAnalyticsDocument> {
  const updateQuery: Record<string, number> = {};
  updateQuery[metricPath] = value;

  await (mongoose.models['CompanyAnalytics'] as IAnalyticsModel).updateOne(
    { _id: this._id },
    { $inc: updateQuery }
  );

  // ✅ FIXED: Proper type handling without eslint error
  const pathParts = metricPath.split('.');

  interface NestedObject {
    [key: string]: NestedObject | number;
  }

  let currentObj: NestedObject = this as unknown as NestedObject;
  for (let i = 0; i < pathParts.length - 1; i++) {
    currentObj = currentObj[pathParts[i]] as NestedObject;
  }
  (currentObj[pathParts[pathParts.length - 1]] as number) += value;

  return this;
};

// Get total engagement
CompanyAnalyticsSchema.methods.getTotalEngagement = function (this: ICompanyAnalyticsDocument): number {
  const { likes, comments, shares } = this.metrics.postsEngagement;
  return likes + comments + shares;
};

// Get engagement rate
CompanyAnalyticsSchema.methods.getEngagementRate = function (this: ICompanyAnalyticsDocument): number {
  const { postsViews } = this.metrics;
  if (postsViews === 0) return 0;

  const totalEngagement = this.getTotalEngagement();
  return parseFloat(((totalEngagement / postsViews) * 100).toFixed(2));
};

// Get follower net growth
CompanyAnalyticsSchema.methods.getFollowerNetGrowth = function (this: ICompanyAnalyticsDocument): number {
  const { followersGained, followersLost } = this.metrics;
  return followersGained - followersLost;
};

// =====================================================
// STATIC METHODS
// =====================================================

// Find or create today's analytics record
// ✅ FIXED: Remove explicit `this` type parameter
CompanyAnalyticsSchema.statics.findOrCreateToday = async function (
  companyId: string
): Promise<ICompanyAnalyticsDocument> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    throw new Error('Invalid company ID');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let analytics = await this.findOne({
    company: companyId,
    date: today,
  });

  if (!analytics) {
    analytics = await this.create({
      company: companyId,
      date: today,
    });
  }

  return analytics;
};

// Get company analytics for date range
CompanyAnalyticsSchema.statics.getCompanyAnalytics = async function (
  companyId: string,
  startDate?: Date,
  endDate?: Date
): Promise<ICompanyAnalyticsDocument[]> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return [];
  }

  const query: Record<string, unknown> = { company: companyId };

  if (startDate || endDate) {
    query.date = {};
    if (startDate) {
      (query.date as Record<string, Date>).$gte = startDate;
    }
    if (endDate) {
      (query.date as Record<string, Date>).$lte = endDate;
    }
  }

  return this.find(query).sort({ date: -1 }).lean().exec();
};

// Get daily stats for last N days
CompanyAnalyticsSchema.statics.getDailyStats = async function (
  companyId: string,
  days = 30
): Promise<ICompanyAnalyticsDocument[]> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return [];
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  return this.find({
    company: companyId,
    date: { $gte: startDate },
  })
    .sort({ date: 1 })
    .lean()
    .exec();
};

// Get weekly stats (aggregated)
CompanyAnalyticsSchema.statics.getWeeklyStats = async function (
  companyId: string,
  weeks = 12
): Promise<Record<string, unknown>[]> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return [];
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - weeks * 7);
  startDate.setHours(0, 0, 0, 0);

  return this.aggregate([
    {
      $match: {
        company: new mongoose.Types.ObjectId(companyId),
        date: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          week: { $week: '$date' },
        },
        weekStart: { $min: '$date' },
        weekEnd: { $max: '$date' },
        totalPageViews: { $sum: '$metrics.pageViews' },
        totalProfileVisits: { $sum: '$metrics.profileVisits' },
        totalPostsViews: { $sum: '$metrics.postsViews' },
        totalPostsPublished: { $sum: '$metrics.postsPublished' },
        totalEngagement: {
          $sum: {
            $add: [
              '$metrics.postsEngagement.likes',
              '$metrics.postsEngagement.comments',
              '$metrics.postsEngagement.shares',
            ],
          },
        },
        followersGained: { $sum: '$metrics.followersGained' },
        followersLost: { $sum: '$metrics.followersLost' },
        jobsPosted: { $sum: '$metrics.jobsPosted' },
        eventsHosted: { $sum: '$metrics.eventsHosted' },
      },
    },
    {
      $addFields: {
        netFollowerGrowth: { $subtract: ['$followersGained', '$followersLost'] },
      },
    },
    {
      $sort: { weekStart: 1 },
    },
  ]);
};

// Get monthly stats (aggregated)
CompanyAnalyticsSchema.statics.getMonthlyStats = async function (
  companyId: string,
  months = 12
): Promise<Record<string, unknown>[]> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return [];
  }

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);

  return this.aggregate([
    {
      $match: {
        company: new mongoose.Types.ObjectId(companyId),
        date: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
        },
        year: { $first: { $year: '$date' } },
        month: { $first: { $month: '$date' } },
        totalPageViews: { $sum: '$metrics.pageViews' },
        totalProfileVisits: { $sum: '$metrics.profileVisits' },
        totalPostsViews: { $sum: '$metrics.postsViews' },
        totalPostsPublished: { $sum: '$metrics.postsPublished' },
        totalLikes: { $sum: '$metrics.postsEngagement.likes' },
        totalComments: { $sum: '$metrics.postsEngagement.comments' },
        totalShares: { $sum: '$metrics.postsEngagement.shares' },
        followersGained: { $sum: '$metrics.followersGained' },
        followersLost: { $sum: '$metrics.followersLost' },
        jobsPosted: { $sum: '$metrics.jobsPosted' },
        jobApplications: { $sum: '$metrics.jobApplications' },
        eventsHosted: { $sum: '$metrics.eventsHosted' },
        eventAttendees: { $sum: '$metrics.eventAttendees' },
        reviewsReceived: { $sum: '$metrics.reviewsReceived' },
        avgRating: { $avg: '$metrics.averageRating' },
        avgEngagement: {
          $avg: {
            $add: [
              '$metrics.postsEngagement.likes',
              '$metrics.postsEngagement.comments',
              '$metrics.postsEngagement.shares',
            ],
          },
        },
      },
    },
    {
      $addFields: {
        totalEngagement: { $add: ['$totalLikes', '$totalComments', '$totalShares'] },
        netFollowerGrowth: { $subtract: ['$followersGained', '$followersLost'] },
      },
    },
    {
      $sort: { year: 1, month: 1 },
    },
  ]);
};

// Get yearly stats
CompanyAnalyticsSchema.statics.getYearlyStats = async function (
  companyId: string,
  year?: number
): Promise<Record<string, unknown>[]> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return [];
  }

  const targetYear = year || new Date().getFullYear();
  const startDate = new Date(targetYear, 0, 1);
  const endDate = new Date(targetYear, 11, 31, 23, 59, 59);

  return this.aggregate([
    {
      $match: {
        company: new mongoose.Types.ObjectId(companyId),
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: targetYear,
        year: { $first: targetYear },
        totalPageViews: { $sum: '$metrics.pageViews' },
        totalProfileVisits: { $sum: '$metrics.profileVisits' },
        totalPostsViews: { $sum: '$metrics.postsViews' },
        totalPostsPublished: { $sum: '$metrics.postsPublished' },
        totalEngagement: {
          $sum: {
            $add: [
              '$metrics.postsEngagement.likes',
              '$metrics.postsEngagement.comments',
              '$metrics.postsEngagement.shares',
            ],
          },
        },
        followersGained: { $sum: '$metrics.followersGained' },
        followersLost: { $sum: '$metrics.followersLost' },
        jobsPosted: { $sum: '$metrics.jobsPosted' },
        jobApplications: { $sum: '$metrics.jobApplications' },
        eventsHosted: { $sum: '$metrics.eventsHosted' },
        eventAttendees: { $sum: '$metrics.eventAttendees' },
        reviewsReceived: { $sum: '$metrics.reviewsReceived' },
        avgRating: { $avg: '$metrics.averageRating' },
      },
    },
    {
      $addFields: {
        netFollowerGrowth: { $subtract: ['$followersGained', '$followersLost'] },
      },
    },
  ]);
};

// Get company summary
CompanyAnalyticsSchema.statics.getCompanySummary = async function (
  companyId: string,
  startDate?: Date,
  endDate?: Date
): Promise<Record<string, unknown> | null> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return null;
  }

  const matchQuery: Record<string, unknown> = {
    company: new mongoose.Types.ObjectId(companyId),
  };

  if (startDate || endDate) {
    matchQuery.date = {};
    if (startDate) {
      (matchQuery.date as Record<string, Date>).$gte = startDate;
    }
    if (endDate) {
      (matchQuery.date as Record<string, Date>).$lte = endDate;
    }
  }

  const result = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalPageViews: { $sum: '$metrics.pageViews' },
        totalProfileVisits: { $sum: '$metrics.profileVisits' },
        totalPostsViews: { $sum: '$metrics.postsViews' },
        totalPostsPublished: { $sum: '$metrics.postsPublished' },
        totalLikes: { $sum: '$metrics.postsEngagement.likes' },
        totalComments: { $sum: '$metrics.postsEngagement.comments' },
        totalShares: { $sum: '$metrics.postsEngagement.shares' },
        followersGained: { $sum: '$metrics.followersGained' },
        followersLost: { $sum: '$metrics.followersLost' },
        jobsPosted: { $sum: '$metrics.jobsPosted' },
        jobApplications: { $sum: '$metrics.jobApplications' },
        eventsHosted: { $sum: '$metrics.eventsHosted' },
        eventAttendees: { $sum: '$metrics.eventAttendees' },
        reviewsReceived: { $sum: '$metrics.reviewsReceived' },
        avgRating: { $avg: '$metrics.averageRating' },
        trafficOrganic: { $sum: '$traffic.organic' },
        trafficDirect: { $sum: '$traffic.direct' },
        trafficReferral: { $sum: '$traffic.referral' },
        trafficSocial: { $sum: '$traffic.social' },
      },
    },
    {
      $addFields: {
        totalEngagement: { $add: ['$totalLikes', '$totalComments', '$totalShares'] },
        netFollowerGrowth: { $subtract: ['$followersGained', '$followersLost'] },
        engagementRate: {
          $cond: {
            if: { $eq: ['$totalPostsViews', 0] },
            then: 0,
            else: {
              $multiply: [
                {
                  $divide: [
                    { $add: ['$totalLikes', '$totalComments', '$totalShares'] },
                    '$totalPostsViews',
                  ],
                },
                100,
              ],
            },
          },
        },
      },
    },
  ]);

  return result[0] || null;
};

// Get trending companies
CompanyAnalyticsSchema.statics.getTrendingCompanies = async function (
  limit = 10,
  days = 7
): Promise<Record<string, unknown>[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  return this.aggregate([
    {
      $match: {
        date: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$company',
        totalEngagement: {
          $sum: {
            $add: [
              '$metrics.postsEngagement.likes',
              '$metrics.postsEngagement.comments',
              '$metrics.postsEngagement.shares',
            ],
          },
        },
        totalViews: { $sum: '$metrics.pageViews' },
        totalPostsPublished: { $sum: '$metrics.postsPublished' },
        followersGained: { $sum: '$metrics.followersGained' },
      },
    },
    {
      $lookup: {
        from: 'companies',
        localField: '_id',
        foreignField: '_id',
        as: 'company',
      },
    },
    {
      $unwind: '$company',
    },
    {
      $addFields: {
        trendScore: {
          $add: [
            { $multiply: ['$totalEngagement', 3] },
            { $multiply: ['$totalViews', 1] },
            { $multiply: ['$followersGained', 5] },
          ],
        },
      },
    },
    {
      $sort: { trendScore: -1 },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 1,
        companyId: '$_id',
        companyName: '$company.name',
        companySlug: '$company.slug',
        companyLogo: '$company.logo',
        totalEngagement: 1,
        totalViews: 1,
        totalPostsPublished: 1,
        followersGained: 1,
        trendScore: 1,
      },
    },
  ]);
};

// Get top posts
CompanyAnalyticsSchema.statics.getTopPosts = async function (
  companyId?: string,
  limit = 10,
  days = 30
): Promise<Record<string, unknown>[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const matchQuery: Record<string, unknown> = {
    date: { $gte: startDate },
    topPosts: { $exists: true, $ne: [] },
  };

  if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
    matchQuery.company = new mongoose.Types.ObjectId(companyId);
  }

  return this.aggregate([
    { $match: matchQuery },
    { $unwind: '$topPosts' },
    {
      $group: {
        _id: '$topPosts.post',
        totalViews: { $sum: '$topPosts.views' },
        totalEngagement: { $sum: '$topPosts.engagement' },
      },
    },
    {
      $lookup: {
        from: 'posts',
        localField: '_id',
        foreignField: '_id',
        as: 'post',
      },
    },
    {
      $unwind: '$post',
    },
    {
      $sort: { totalEngagement: -1, totalViews: -1 },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 1,
        postId: '$_id',
        title: '$post.title',
        slug: '$post.slug',
        company: '$post.company',
        totalViews: 1,
        totalEngagement: 1,
      },
    },
  ]);
};

// Track event (for real-time tracking)
// ✅ FIXED: Remove explicit `this` type parameter and cast when needed
CompanyAnalyticsSchema.statics.trackEvent = async function (
  companyId: string,
  eventType: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    throw new Error('Invalid company ID');
  }

  const analytics = await (this as unknown as IAnalyticsModel).findOrCreateToday(companyId);

  // Map event types to metric paths
  const eventMetricMap: Record<string, string> = {
    page_view: 'metrics.pageViews',
    profile_visit: 'metrics.profileVisits',
    post_view: 'metrics.postsViews',
    post_like: 'metrics.postsEngagement.likes',
    post_comment: 'metrics.postsEngagement.comments',
    post_share: 'metrics.postsEngagement.shares',
    follower_gained: 'metrics.followersGained',
    follower_lost: 'metrics.followersLost',
    job_posted: 'metrics.jobsPosted',
    job_application: 'metrics.jobApplications',
    event_hosted: 'metrics.eventsHosted',
    review_received: 'metrics.reviewsReceived',
  };

  const metricPath = eventMetricMap[eventType];
  if (metricPath) {
    await analytics.incrementMetric(metricPath);
  }

  // Handle traffic source
  if (metadata?.source && typeof metadata.source === 'string') {
    const trafficMap: Record<string, string> = {
      organic: 'traffic.organic',
      direct: 'traffic.direct',
      referral: 'traffic.referral',
      social: 'traffic.social',
    };

    const trafficPath = trafficMap[metadata.source];
    if (trafficPath) {
      await analytics.incrementMetric(trafficPath);
    }
  }
};

// =====================================================
// VIRTUALS
// =====================================================

// Total engagement virtual
CompanyAnalyticsSchema.virtual('totalEngagement').get(function (this: ICompanyAnalyticsDocument) {
  return this.getTotalEngagement();
});

// Engagement rate virtual
CompanyAnalyticsSchema.virtual('engagementRate').get(function (this: ICompanyAnalyticsDocument) {
  return this.getEngagementRate();
});

// Net follower growth virtual
CompanyAnalyticsSchema.virtual('netFollowerGrowth').get(function (this: ICompanyAnalyticsDocument) {
  return this.getFollowerNetGrowth();
});

// =====================================================
// JSON/OBJECT TRANSFORMATIONS
// =====================================================
CompanyAnalyticsSchema.set('toJSON', {
  virtuals: true,
  transform: function (_doc, ret) {
    // delete ret.__v;/
    return ret;
  },
});

CompanyAnalyticsSchema.set('toObject', { virtuals: true });

// =====================================================
// CREATE AND EXPORT MODEL
// =====================================================
const CompanyAnalytics = (mongoose.models['CompanyAnalytics'] as IAnalyticsModel) ||
  mongoose.model<ICompanyAnalyticsDocument, IAnalyticsModel>(
    'CompanyAnalytics',
    CompanyAnalyticsSchema
  );
  
export default CompanyAnalytics;