/**
 * ====================================
 * ATTENDANCE INTERFACE
 * ====================================
 * Interface for user daily attendance
 */

import { Document, Types } from 'mongoose';
import { AttendanceStatus } from '../enums/AttendanceStatus.enum';

export interface IAttendance extends Document {
  _id: Types.ObjectId;
  attendanceId: string;      // ADD — UUID
  user: string;

  // Attendance details
  date: Date;
  status: AttendanceStatus;

  // Check-in/Check-out
  checkInTime?: Date;
  checkOutTime?: Date;
  totalActiveTime?: number; // in seconds

  // Auto-attendance tracking
  wasAutoMarked: boolean;
  autoMarkReason?: string; // 'study_session' | 'task_completion' | 'manual'

  // Study activity on this date
  studyHours: number;
  sessionsCompleted: number;
  tasksCompleted: number;

  // Notes
  notes?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export default IAttendance;