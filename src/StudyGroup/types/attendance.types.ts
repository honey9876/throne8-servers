/**
 * ====================================
 * ATTENDANCE TYPES
 * ====================================
 * TypeScript types for attendance operations
 */

import { Types } from 'mongoose';
import { AttendanceStatus } from '../enums/AttendanceStatus.enum';

/**
 * Check-in Request
 */
export interface CheckInRequest {
  notes?: string;
}

/**
 * Check-in Response
 */
export interface CheckInResponse {
  attendanceId: Types.ObjectId;
  date: string;
  checkInTime: string;
  status: AttendanceStatus;
  message: string;
}

/**
 * Auto-mark Attendance Request
 */
export interface AutoMarkAttendanceRequest {
  reason: 'study_session' | 'task_completion';
  sessionId?: Types.ObjectId;
  taskId?: Types.ObjectId;
  studyHours?: number;
}

/**
 * Attendance Percentage Response
 */
export interface AttendancePercentageResponse {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  attendancePercentage: number;
  currentMonthPercentage: number;
  overallPercentage: number;
}

/**
 * Attendance History Entry
 */
export interface AttendanceHistoryEntry {
  _id: Types.ObjectId;
  date: string;
  status: AttendanceStatus;
  checkInTime?: string;
  checkOutTime?: string;
  totalActiveTime?: number; // in seconds
  studyHours: number;
  sessionsCompleted: number;
  wasAutoMarked: boolean;
  notes?: string;
}

/**
 * Attendance History Response
 */
export interface AttendanceHistoryResponse {
  attendance: AttendanceHistoryEntry[];
  summary: {
    totalDays: number;
    presentDays: number;
    absentDays: number;
    attendancePercentage: number;
  };
  total: number;
  page: number;
  limit: number;
}

/**
 * Calendar Day
 */
export interface CalendarDay {
  date: string;
  day: number;
  dayName: string;
  status: AttendanceStatus | 'not_marked';
  isToday: boolean;
  isFuture: boolean;
  studyHours?: number;
  checkInTime?: string;
}

/**
 * Calendar Response
 */
export interface CalendarResponse {
  year: number;
  month: number;
  monthName: string;
  days: CalendarDay[];
  summary: {
    totalDays: number;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    notMarkedDays: number;
    attendancePercentage: number;
  };
}

/**
 * Attendance Status Response
 */
export interface AttendanceStatusResponse {
  todayStatus: AttendanceStatus | 'not_marked';
  hasCheckedInToday: boolean;
  checkInTime?: string;
  totalActiveTime?: number; // in seconds
  lastActivityTime?: string;
  isActive: boolean; // Active in last 24 hours
}

/**
 * Monthly Attendance Stats
 */
export interface MonthlyAttendanceStats {
  month: string;
  year: number;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  attendancePercentage: number;
  totalStudyHours: number;
  averageDailyHours: number;
}

/**
 * Attendance Analytics Response
 */
export interface AttendanceAnalyticsResponse {
  overallPercentage: number;
  currentMonthPercentage: number;
  lastMonthPercentage: number;
  trend: 'improving' | 'declining' | 'stable';
  monthlyStats: MonthlyAttendanceStats[];
  bestMonth: string;
  worstMonth: string;
  currentStreak: number;
  longestPresentStreak: number;
}

// Note: All types are already exported individually above
// No default export needed for type-only files