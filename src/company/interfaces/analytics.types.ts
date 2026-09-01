// Response DTO
export interface AnalyticsResponseDTO {
  _id: string;
  company: string;
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
    post: string;
    views: number;
    engagement: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// Query Filter DTO
export interface AnalyticsFilterQuery {
  company: string;
  startDate?: Date;
  endDate?: Date;
  period?: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

// Summary DTO
export interface AnalyticsSummaryDTO {
  company: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  totalPageViews: number;
  totalFollowersGained: number;
  totalEngagement: number;
  averageEngagementPerPost: number;
  topPost?: {
    title: string;
    views: number;
    engagement: number;
  };
  trafficSources: {
    organic: number;
    direct: number;
    referral: number;
    social: number;
  };
  trends: {
    growth: number;
    dayOverDay: number;
  };
}

// Monthly Stats DTO
export interface MonthlyStatsDTO {
  year: number;
  month: number;
  totalViews: number;
  totalFollowersGained: number;
  avgEngagement: number;
}

// Engagement Metrics DTO
export interface EngagementMetricsDTO {
  company: string;
  totalEngagement: number;
  engagementByType: {
    likes: number;
    comments: number;
    shares: number;
  };
  engagementRate: number;
  topEngagedPosts: Array<{
    postId: string;
    title: string;
    engagement: number;
  }>;
}