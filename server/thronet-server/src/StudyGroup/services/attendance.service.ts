import attendanceRepository from '../repositories/attendance.repository';
import { AttendanceStatus } from '../enums/AttendanceStatus.enum';
import { ConflictError, NotFoundError } from '@/shared/errors/app.error';
import { getStartOfMonth, getEndOfMonth } from '../utils/dateHelper';
import { logger } from '@/shared/logger.util';

/**
 * Mark daily check-in for a user.
 * Throws ConflictError if already checked in today.
 */
export const checkIn = async (userId: string, notes?: string) => {
  const existing = await attendanceRepository.findTodaysAttendance(userId);
  if (existing) throw new ConflictError('Already checked in for today');

  const attendance = await attendanceRepository.checkIn(userId, notes);
  logger.info(`User ${userId} checked in`);
  return attendance;
};

/**
 * Auto-mark attendance after a study session or task completion.
 * Called internally by timer.service and task.service.
 */
export const autoMarkAttendance = async (
  userId: string,
  reason: 'study_session' | 'task_completion',
  studyHours: number = 0
) => {
  const attendance = await attendanceRepository.autoMark(userId, reason, studyHours);
  logger.info(`Auto-marked attendance for user ${userId}, reason: ${reason}`);
  return attendance;
};

/**
 * Get attendance percentage for the current calendar month
 */
export const getCurrentMonthPercentage = async (userId: string) => {
  const today        = new Date();
  const startOfMonth = getStartOfMonth(today);
  const endOfMonth   = getEndOfMonth(today);

  const records = await attendanceRepository.findByDateRange(userId, startOfMonth, endOfMonth);

  const totalDays   = records.length;
  const presentDays = records.filter((a) => a.status === AttendanceStatus.PRESENT).length;
  const absentDays  = records.filter((a) => a.status === AttendanceStatus.ABSENT).length;
  const lateDays    = records.filter((a) => a.status === AttendanceStatus.LATE).length;

  const attendancePercentage =
    totalDays > 0
      ? parseFloat(((presentDays / totalDays) * 100).toFixed(2))
      : 0;

  return { totalDays, presentDays, absentDays, lateDays, attendancePercentage };
};

/**
 * Get overall attendance stats (all-time) via aggregate
 */
export const getOverallPercentage = async (userId: string) => {
  return await attendanceRepository.getOverallStats(userId);
};

/**
 * Get today's attendance status for a user
 */
export const getTodayStatus = async (userId: string) => {
  const attendance = await attendanceRepository.findTodaysAttendance(userId);

  if (!attendance) {
    return { status: 'not_marked', hasCheckedIn: false };
  }

  return {
    status:          attendance.status,
    hasCheckedIn:    true,
    checkInTime:     attendance.checkInTime,
    totalActiveTime: attendance.totalActiveTime,
  };
};

/**
 * Get paginated attendance history for a user
 */
export const getAttendanceHistory = async (
  userId: string,
  page:  number = 1,
  limit: number = 30
) => {
  const skip = (page - 1) * limit;

  const [attendance, total] = await Promise.all([
    attendanceRepository.findWithPagination(
      { user: userId },
      { date: -1 },
      skip,
      limit
    ),
    attendanceRepository.count({ user: userId }),
  ]);

  return { attendance, total, page, limit };
};

/**
 * Get calendar view for a given month and year
 */
export const getCalendarView = async (
  userId: string,
  month: number,
  year:  number
) => {
  return await attendanceRepository.getMonthlyAttendance(userId, year, month);
};

/**
 * Placeholder for cron job — marks absent users at end of day.
 * TODO: Implement when user roster is available.
 */
export const markAbsentUsers = async () => {
  return { markedAbsent: 0 };
};

/**
 * Delete an attendance record by attendanceId.
 *
 * FIX: Original code used findByUserAndDate(userId, new Date()) which
 * would only find today's record regardless of which attendanceId was passed.
 * Now fetches by attendanceId directly and verifies ownership.
 */
export const deleteAttendance = async (userId: string, attendanceId: string) => {
  const attendance = await attendanceRepository.findById(attendanceId);

  if (!attendance || attendance.user !== userId) {
    throw new NotFoundError('Attendance record not found');
  }

  await (attendance as any).deleteOne();
  logger.info(`Attendance record deleted: ${attendanceId} for user ${userId}`);
  return { message: 'Attendance record deleted successfully' };
};

export default {
  checkIn,
  autoMarkAttendance,
  getCurrentMonthPercentage,
  getOverallPercentage,
  getTodayStatus,
  getAttendanceHistory,
  getCalendarView,
  markAbsentUsers,
  deleteAttendance,
};