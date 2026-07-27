/**
 * ====================================
 * RANKING TYPES
 * ====================================
 * Type definitions for ranking and leaderboard system
 */

import { Types } from 'mongoose';
import { GroupCategory } from '../enums/GroupCategory.enum';

/**
 * Ranking Calculation Weights
 */
export interface RankingWeights {
  studyHours: number;      // 40%
  attendance: number;      // 30%
  streak: number;          // 30%
}

/**
 * User Rank Info
 */
export interface UserRankInfo {
  userId: string;
  userName: string;
  userAvatar?: string;
  globalRank: number;
  categoryRank: number;
  groupRank?: number;
  cityRank?: number;
  rankScore: number;
  totalStudyHours: number;
  attendancePercentage: number;
  currentStreak: number;
  longestStreak: number;
  category: GroupCategory;
  city?: string;
}

/**
 * Group Rank Info
 */
export interface GroupRankInfo {
  groupId: string;
  groupName: string;
  groupAvatar?: string;
  globalRank: number;
  categoryRank: number;
  averageStudyHours: number;
  totalMembers: number;
  activeMembers: number;
  groupScore: number;
  category: GroupCategory;
}

/**
 * Leaderboard Entry
 */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userAvatar?: string;
  score: number;
  studyHours: number;
  streak: number;
  attendance: number;
  category?: GroupCategory;
  city?: string;
  isCurrentUser?: boolean;
}

/**
 * Group Leaderboard Entry
 */
export interface GroupLeaderboardEntry {
  rank: number;
  groupId: string;
  groupName: string;
  groupAvatar?: string;
  score: number;
  averageHours: number;
  totalMembers: number;
  activeMembers: number;
  category: GroupCategory;
}

/**
 * Get My Rank Request
 */
export interface GetMyRankRequest {
  userId: string;
}

/**
 * Get My Rank Response
 */
export interface GetMyRankResponse {
  globalRank: number;
  categoryRank: number;
  groupRank?: number;
  cityRank?: number;
  totalUsers: number;
  totalInCategory: number;
  totalInGroup?: number;
  totalInCity?: number;
  percentile: number;
  rankScore: number;
  metrics: {
    studyHours: number;
    attendance: number;
    streak: number;
  };
  nearbyRanks: {
    above?: LeaderboardEntry;
    below?: LeaderboardEntry;
  };
}

/**
 * Get User Rank Request
 */
export interface GetUserRankRequest {
  userId: string;
  requestingUserId?: string;
}

/**
 * Get Category Leaderboard Request
 */
export interface GetCategoryLeaderboardRequest {
  category: GroupCategory;
  limit?: number;
  page?: number;
}

/**
 * Get Group Leaderboard Request
 */
export interface GetGroupLeaderboardRequest {
  groupId: string;
  limit?: number;
  page?: number;
}

/**
 * Get Global Leaderboard Request
 */
export interface GetGlobalLeaderboardRequest {
  limit?: number;
  page?: number;
  period?: 'weekly' | 'monthly' | 'alltime';
}

/**
 * Leaderboard Response
 */
export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  currentUser?: {
    rank: number;
    entry: LeaderboardEntry;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  period?: 'weekly' | 'monthly' | 'alltime';
  lastUpdated: Date;
}

/**
 * Group Leaderboard Response
 */
export interface GroupLeaderboardResponse {
  leaderboard: GroupLeaderboardEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  lastUpdated: Date;
}

/**
 * Recalculate Ranks Request
 */
export interface RecalculateRanksRequest {
  userId?: string;
  forceRecalculate?: boolean;
}

/**
 * Recalculate Ranks Response
 */
export interface RecalculateRanksResponse {
  success: boolean;
  usersUpdated: number;
  groupsUpdated: number;
  timeTaken: number;
  lastUpdated: Date;
}

/**
 * Rank Change Info
 */
export interface RankChangeInfo {
  previousRank: number;
  currentRank: number;
  change: number;
  direction: 'up' | 'down' | 'same';
  percentChange: number;
}

/**
 * Ranking Stats
 */
export interface RankingStats {
  totalUsers: number;
  totalGroups: number;
  averageRankScore: number;
  topRankScore: number;
  averageStudyHours: number;
  averageAttendance: number;
  averageStreak: number;
  categoryDistribution: {
    category: GroupCategory;
    count: number;
    percentage: number;
  }[];
}

/**
 * Top Performers
 */
export interface TopPerformers {
  byStudyHours: LeaderboardEntry[];
  byStreak: LeaderboardEntry[];
  byAttendance: LeaderboardEntry[];
  byConsistency: LeaderboardEntry[];
}

/**
 * City Ranking
 */
export interface CityRanking {
  city: string;
  totalUsers: number;
  averageRankScore: number;
  topUser: LeaderboardEntry;
}

/**
 * Weekly Leaderboard Request
 */
export interface WeeklyLeaderboardRequest {
  limit?: number;
  page?: number;
}

/**
 * Monthly Leaderboard Request
 */
export interface MonthlyLeaderboardRequest {
  limit?: number;
  page?: number;
}

/**
 * Top Groups Request
 */
export interface TopGroupsRequest {
  limit?: number;
  page?: number;
  category?: GroupCategory;
}