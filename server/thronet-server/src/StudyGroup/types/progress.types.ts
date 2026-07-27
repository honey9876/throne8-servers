/**
 * ====================================
 * PROGRESS TYPES
 * ====================================
 * TypeScript types for progress operations
 */

import { Types } from 'mongoose';

/**
 * Daily Progress Response
 */
export interface DailyProgressResponse {
  date: string;
  studyHours: number;
  goalHours: number;
  progress: number; // percentage
  sessionsCompleted: number;
  tasksCompleted: number;
  isGoalAchieved: boolean;
}

/**
 * Weekly Progress Response
 */
export interface WeeklyProgressResponse {
  weekStartDate: string;
  weekEndDate: string;
  totalStudyHours: number;
  totalGoalHours: number;
  progress: number; // percentage
  dailyBreakdown: {
    date: string;
    day: string;
    studyHours: number;
    goalHours: number;
    achieved: boolean;
  }[];
  averageDailyHours: number;
  bestDay: string;
  worstDay: string;
}

/**
 * Total Progress Response
 */
export interface TotalProgressResponse {
  totalStudyHours: number;
  totalSessions: number;
  totalTasksCompleted: number;
  averageSessionDuration: number; // minutes
  studyDaysCount: number;
  currentStreak: number;
  longestStreak: number;
  attendancePercentage: number;
  completionRate: number;
  consistencyScore: number;
  productivityScore: number;
}

/**
 * Graph Data Point
 */
export interface GraphDataPoint {
  date: string;
  studyHours: number;
  goalHours: number;
  sessionsCompleted: number;
}

/**
 * Graph Data Request Query
 */
export interface GraphDataQuery {
  period: '7days' | '30days' | '3months' | '6months' | '1year';
  startDate?: string;
  endDate?: string;
}

/**
 * Graph Data Response
 */
export interface GraphDataResponse {
  period: string;
  startDate: string;
  endDate: string;
  data: GraphDataPoint[];
  totalStudyHours: number;
  averageDailyHours: number;
  peakDay: string;
  peakHours: number;
}

/**
 * Dashboard Data Response
 */
export interface DashboardResponse {
  todayProgress: DailyProgressResponse;
  weeklyProgress: {
    totalHours: number;
    goalHours: number;
    progress: number;
    daysCompleted: number;
  };
  currentStreak: number;
  totalStudyHours: number;
  rank: number;
  recentActivity: {
    type: 'session' | 'task' | 'goal';
    title: string;
    duration?: number;
    completedAt: Date;
  }[];
  pendingTasks: number;
  upcomingDeadlines: number;
}

/**
 * Activity Log Entry
 */
export interface ActivityLogEntry {
  _id: Types.ObjectId;
  type: 'timer_started' | 'timer_completed' | 'task_completed' | 'goal_achieved' | 'streak_milestone';
  title: string;
  description?: string;
  duration?: number; // in seconds
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Activity Logs Response
 */
export interface ActivityLogsResponse {
  logs: ActivityLogEntry[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Comparison Data
 */
export interface ComparisonData {
  myProgress: number;
  groupAverage: number;
  globalAverage: number;
  percentile: number; // User's percentile rank (0-100)
  betterThan: number; // percentage of users
}

// Note: All types are already exported individually above
// No default export needed for type-only files