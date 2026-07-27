// src/types/follow.types.ts

import { Document, Types } from 'mongoose';

/**
 * Follow Status Enum
 */
export enum FollowStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  DECLINED = 'declined',
}

/**
 * Follow Sort Options
 */
export enum FollowSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

/**
 * Sort Order
 */
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Follow Search Type
 */
export enum FollowSearchType {
  FOLLOWERS = 'followers',
  FOLLOWING = 'following',
}

/**
 * Follow Action Type
 */
export enum FollowAction {
  FOLLOW = 'follow',
  UNFOLLOW = 'unfollow',
  BLOCK = 'block',
  UNBLOCK = 'unblock',
}

/**
 * Analytics Period
 */
export enum AnalyticsPeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

/**
 * Export Format
 */
export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
}

/**
 * Core Follow Interface
 */
export interface IFollow extends Document {
  _id: Types.ObjectId;
  followerId: string;
  followingId: string;
  status: FollowStatus;
  createdAt: Date;
  updatedAt: Date;
  notificationEnabled: boolean;
  isBlocked: boolean;

  // Instance methods
  toggleBlock(): Promise<IFollow>;
  accept(): Promise<IFollow>;
}

/**
 * Follow Creation Data
 */
export interface ICreateFollowData {
  followingId: string;
  notificationEnabled?: boolean;
}

/**
 * Follow Update Data
 */
export interface IUpdateFollowData {
  notificationEnabled?: boolean;
  isBlocked?: boolean;
}

/**
 * Follow Status Update Data
 */
export interface IUpdateFollowStatusData {
  status: FollowStatus;
}

/**
 * Bulk Follow Data
 */
export interface IBulkFollowData {
  followingIds: string[];
}

/**
 * Bulk Unfollow Data
 */
export interface IBulkUnfollowData {
  followingIds: string[];
}

/**
 * Follow List Query Parameters
 */
export interface IFollowListQuery {
  page?: number;
  limit?: number;
  status?: FollowStatus;
  sortBy?: FollowSortBy;
  sortOrder?: SortOrder;
}

/**
 * Follow Status Check Query
 */
export interface IFollowStatusQuery {
  userId: string;
}

/**
 * Batch Follow Status Check Query
 */
export interface IBatchFollowStatusQuery {
  userIds: string[];
}

/**
 * Mutual Follows Query
 */
export interface IMutualFollowsQuery {
  userId: string;
  limit?: number;
}

/**
 * Trending Users Query
 */
export interface ITrendingUsersQuery {
  days?: number;
  limit?: number;
}

/**
 * Block User Data
 */
export interface IBlockUserData {
  userId: string;
  isBlocked: boolean;
}

/**
 * Search Follow Query
 */
export interface ISearchFollowQuery {
  query: string;
  type: FollowSearchType;
  page?: number;
  limit?: number;
}

/**
 * Export Follow Data Options
 */
export interface IExportFollowOptions {
  format?: ExportFormat;
  includeFollowers?: boolean;
  includeFollowing?: boolean;
  includeMetadata?: boolean;
}

/**
 * Follow Analytics Query
 */
export interface IFollowAnalyticsQuery {
  period?: AnalyticsPeriod;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Import Operation
 */
export interface IImportOperation {
  action: FollowAction;
  userId: string;
}

/**
 * Import Follow Data
 */
export interface IImportFollowData {
  operations: IImportOperation[];
  skipDuplicates?: boolean;
  notifyUsers?: boolean;
}

/**
 * Follow Response Data
 */
export interface IFollowResponse {
  _id: string;
  followerId: string;
  followingId: string;
  status: FollowStatus;
  createdAt: Date;
  updatedAt: Date;
  notificationEnabled: boolean;
  isBlocked: boolean;
}

/**
 * Follow List Response
 */
export interface IFollowListResponse {
  data: IFollowResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Follow Counts Response
 */
export interface IFollowCountsResponse {
  followersCount: number;
  followingCount: number;
  mutualFollowsCount?: number;
}

/**
 * Follow Status Response
 */
export interface IFollowStatusResponse {
  userId: string;
  status: FollowStatus | null;
  isBlocked: boolean;
  isFollowing: boolean;
  isFollower: boolean;
}

/**
 * Batch Follow Status Response
 */
export interface IBatchFollowStatusResponse {
  [userId: string]: IFollowStatusResponse;
}

/**
 * Trending User Response
 */
export interface ITrendingUserResponse {
  userId: string;
  followCount: number;
  latestFollow: Date;
}

/**
 * Trending Users Response
 */
export interface ITrendingUsersResponse {
  users: ITrendingUserResponse[];
  period: {
    days: number;
    startDate: Date;
    endDate: Date;
  };
}

/**
 * Follow Analytics Response
 */
export interface IFollowAnalyticsResponse {
  period: AnalyticsPeriod;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  metrics: {
    totalFollows: number;
    totalUnfollows: number;
    netGrowth: number;
    growthRate: number;
    averageFollowsPerDay: number;
    peakFollowDay: {
      date: Date;
      count: number;
    };
  };
  timeline: Array<{
    date: Date;
    follows: number;
    unfollows: number;
    netGrowth: number;
  }>;
}

/**
 * Bulk Operation Result
 */
export interface IBulkOperationResult {
  success: boolean;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  errors: Array<{
    operation: string;
    error: string;
  }>;
  results: Array<{
    userId: string;
    status: 'success' | 'failed' | 'skipped';
    reason?: string;
  }>;
}

/**
 * Follow Search Result
 */
export interface IFollowSearchResult {
  users: Array<{
    userId: string;
    status: FollowStatus;
    createdAt: Date;
    // User details will be populated by user service
    userDetails?: {
      name: string;
      username: string;
      avatar?: string;
      isVerified: boolean;
    };
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Export Data Result
 */
export interface IExportDataResult {
  format: ExportFormat;
  filename: string;
  downloadUrl: string;
  expiresAt: Date;
  metadata: {
    totalRecords: number;
    exportedAt: Date;
    includedData: string[];
  };
}

/**
 * Follow Notification Event
 */
export interface IFollowNotificationEvent {
  type: 'follow' | 'unfollow' | 'follow_request' | 'follow_accept';
  followerId: string;
  followingId: string;
  timestamp: Date;
  metadata?: {
    isBlocked?: boolean;
    notificationEnabled?: boolean;
  };
}

/**
 * Follow Activity Log
 */
export interface IFollowActivityLog {
  userId: string;
  action: FollowAction;
  targetUserId: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

/**
 * Follow Recommendation
 */
export interface IFollowRecommendation {
  userId: string;
  score: number;
  reason: 'mutual_connections' | 'common_interests' | 'trending' | 'location' | 'activity';
  mutualFollowsCount?: number;
  commonInterests?: string[];
  userDetails?: {
    name: string;
    username: string;
    avatar?: string;
    isVerified: boolean;
    followersCount: number;
  };
}

/**
 * Follow Privacy Settings
 */
export interface IFollowPrivacySettings {
  userId: string;
  isPrivateAccount: boolean;
  requireFollowApproval: boolean;
  allowFollowersToSeeFollowing: boolean;
  allowFollowingToSeeFollowers: boolean;
  hideFollowCounts: boolean;
  blockNewFollowers: boolean;
}

/**
 * Follow Statistics
 */
export interface IFollowStatistics {
  userId: string;
  totalFollowers: number;
  totalFollowing: number;
  mutualFollows: number;
  pendingRequests: {
    incoming: number;
    outgoing: number;
  };
  blockedUsers: number;
  followersGrowthRate: number;
  engagementRate: number;
  lastActive: Date;
}

/**
 * API Response Base
 */
export interface IApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: Date;
    requestId?: string;
    rateLimitRemaining?: number;
  };
}

/**
 * Paginated API Response
 */
export interface IPaginatedApiResponse<T = any> extends IApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Follow Service Interface
 */
export interface IFollowService {
  // Core operations
  followUser(followerId: string, data: ICreateFollowData): Promise<IFollowResponse>;
  unfollowUser(followerId: string, followingId: string): Promise<void>;
  updateFollowStatus(followerId: string, followingId: string, data: IUpdateFollowStatusData): Promise<IFollowResponse>;
  updateFollow(followerId: string, followingId: string, data: IUpdateFollowData): Promise<IFollowResponse>;

  // Bulk operations
  bulkFollow(followerId: string, data: IBulkFollowData): Promise<IBulkOperationResult>;
  bulkUnfollow(followerId: string, data: IBulkUnfollowData): Promise<IBulkOperationResult>;

  // List operations
  getFollowers(userId: string, query: IFollowListQuery): Promise<IFollowListResponse>;
  getFollowing(userId: string, query: IFollowListQuery): Promise<IFollowListResponse>;

  // Count operations
  getFollowCounts(userId: string): Promise<IFollowCountsResponse>;

  // Status operations
  checkFollowStatus(followerId: string, followingId: string): Promise<IFollowStatusResponse>;
  batchCheckFollowStatus(followerId: string, userIds: string[]): Promise<IBatchFollowStatusResponse>;

  // Mutual operations
  getMutualFollows(userId1: string, userId2: string): Promise<number>;

  // Trending operations
  getTrendingUsers(query: ITrendingUsersQuery): Promise<ITrendingUsersResponse>;

  // Block operations
  blockUser(userId: string, targetUserId: string): Promise<void>;
  unblockUser(userId: string, targetUserId: string): Promise<void>;

  // Search operations
  searchFollows(userId: string, query: ISearchFollowQuery): Promise<IFollowSearchResult>;

  // Analytics operations
  getFollowAnalytics(userId: string, query: IFollowAnalyticsQuery): Promise<IFollowAnalyticsResponse>;

  // Export/Import operations
  exportFollowData(userId: string, options: IExportFollowOptions): Promise<IExportDataResult>;
  importFollowData(userId: string, data: IImportFollowData): Promise<IBulkOperationResult>;
}