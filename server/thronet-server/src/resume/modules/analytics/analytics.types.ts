export interface ResumeAnalyticsResponse {
  views: number;

  downloads: number;

  shares: number;

  uniqueVisitors: number;

  dailyViews: number;

  weeklyViews: number;

  monthlyViews: number;

  lastViewedAt?: Date;

  lastDownloadedAt?: Date;

  lastSharedAt?: Date;
}