/**
 * ====================================
 * STUDY SESSION TYPES
 * ====================================
 */

import { SessionStatus } from '../interfaces/IStudySession';

/**
 * Start Session Data
 */
export interface StartSessionData {
  goalId?: string;
  duration?: number; // Duration in minutes (default: 25)
  subject?: string;
  notes?: string;
}

/**
 * Session Response
 */
export interface SessionResponse {
  _id: string;
  user: string;
  goal?: {
    _id: string;
    title: string;
  };
  startTime: Date;
  endTime?: Date;
  duration: number;
  durationInMinutes: number;
  durationInHours: number;
  status: SessionStatus;
  notes?: string;
  subject?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Active Timer Response
 */
export interface ActiveTimerResponse {
  _id: string;
  startTime: Date;
  pausedAt?: Date;
  elapsedTime: number; // in seconds
  status: SessionStatus;
  subject?: string;
}

/**
 * Session Statistics
 */
export interface SessionStats {
  totalSessions: number;
  totalDuration: number; // in seconds
  totalDurationInHours: number;
  averageSessionDuration: number; // in minutes
  sessionsToday: number;
  durationToday: number; // in seconds
  sessionsThisWeek: number;
  durationThisWeek: number; // in seconds
  sessionsThisMonth: number;
  durationThisMonth: number; // in seconds
  longestSession: number; // in minutes
  bySubject?: {
    [key: string]: {
      count: number;
      duration: number;
    };
  };
}

/**
 * Session List Query
 */
export interface SessionListQuery {
  page?: number;
  limit?: number;
  status?: SessionStatus;
  goalId?: string;
  subject?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: 'startTime' | 'duration' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}