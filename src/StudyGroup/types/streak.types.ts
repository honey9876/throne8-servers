/**
 * ====================================
 * STREAK TYPES
 * ====================================
 * TypeScript types for streak operations
 */

import { Types } from 'mongoose';

/**
 * Current Streak Response
 */
export interface CurrentStreakResponse {
  userId: Types.ObjectId;
  currentStreak: number;
  startDate: string;
  lastActivityDate: string;
  isActive: boolean;
  daysUntilMilestone: number;
  nextMilestone: number;
}

/**
 * Longest Streak Response
 */
export interface LongestStreakResponse {
  longestStreak: number;
  startDate: string;
  endDate: string;
  achievedAt: string;
  isCurrent: boolean;
}

/**
 * Streak History Entry
 */
export interface StreakHistoryEntry {
  _id: Types.ObjectId;
  streakDays: number;
  startDate: string;
  endDate: string;
  wasActive: boolean;
  breakReason?: 'inactive' | 'manual_reset' | 'system';
}

/**
 * Streak History Response
 */
export interface StreakHistoryResponse {
  currentStreak: CurrentStreakResponse;
  longestStreak: LongestStreakResponse;
  pastStreaks: StreakHistoryEntry[];
  totalStreakBreaks: number;
  totalActiveDays: number;
  averageStreakLength: number;
}

/**
 * Streak Milestone
 */
export interface StreakMilestone {
  days: number;
  achievedAt: string;
  title: string;
  description: string;
  badge?: string;
}

/**
 * Streak Leaderboard Entry
 */
export interface StreakLeaderboardEntry {
  userId: Types.ObjectId;
  userName: string;
  userAvatar?: string;
  currentStreak: number;
  longestStreak: number;
  rank: number;
  isCurrentUser: boolean;
}

/**
 * Streak Leaderboard Response
 */
export interface StreakLeaderboardResponse {
  topUsers: StreakLeaderboardEntry[];
  myRank?: number;
  myStreak?: number;
  totalUsers: number;
  lastUpdated: string;
}

/**
 * Group Streak Leaderboard Response
 */
export interface GroupStreakLeaderboardResponse {
  groupId: Types.ObjectId;
  groupName: string;
  leaderboard: StreakLeaderboardEntry[];
  myRank?: number;
  totalMembers: number;
}

/**
 * Streak Stats Response
 */
export interface StreakStatsResponse {
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number;
  totalStreakBreaks: number;
  averageStreakLength: number;
  consistencyRate: number; // percentage
  lastActivityDate: string;
  nextMilestone: {
    days: number;
    daysRemaining: number;
    title: string;
  };
  achievements: StreakMilestone[];
}

/**
 * Streak Update Request
 */
export interface StreakUpdateRequest {
  activity: 'study_session' | 'task_completed' | 'goal_achieved' | 'manual_checkin';
  timestamp?: Date;
}

/**
 * Streak Freeze Request (Future Feature)
 */
export interface StreakFreezeRequest {
  reason: string;
  freezeDays: number; // 1-7 days
}

// Note: All types are already exported individually above
// No default export needed for type-only files