/**
 * ====================================
 * ATTENDANCE REPOSITORY - FIXED
 * ====================================
 */

import { BaseRepository } from './base.repository';
import Attendance from '../models/Attendance.model';
import { IAttendance } from '../interfaces/IAttendance';
import { AttendanceStatus } from '../enums/AttendanceStatus.enum';
import mongoose from 'mongoose';

export class AttendanceRepository extends BaseRepository<IAttendance> {
  constructor() {
    super(Attendance);
  }

  /**
   * Find attendance by user and date
   */
  async findByUserAndDate(userId: string, date: Date): Promise<IAttendance | null> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      return await this.model
        .findOne({
          user: userId,
          date: { $gte: startOfDay, $lte: endOfDay },
        })
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding attendance by date: ${error}`);
    }
  }

  /**
   * Find today's attendance
   */
  async findTodaysAttendance(userId: string): Promise<IAttendance | null> {
    try {
      const today = new Date();
      return await this.findByUserAndDate(userId, today);
    } catch (error: any) {
      throw new Error(`Error finding today's attendance: ${error}`);
    }
  }

  /**
   * Check-in (mark present) - FIXED
   */
  async checkIn(userId: string, notes?: string): Promise<IAttendance> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let attendance = await this.findByUserAndDate(userId, today);

      if (!attendance) {
        attendance = await this.create({
          user: userId,          // was: new mongoose.Types.ObjectId(userId)
          date: today,
          status: AttendanceStatus.PRESENT,
          checkInTime: new Date(),
          wasAutoMarked: false,
          autoMarkReason: 'manual',
          notes,
        } as Partial<IAttendance>);
      } else {
        throw new Error('ALREADY_CHECKED_IN');   // service mein handle hoga
      }

      return attendance;
    } catch (error: any) {
      throw error;  // re-throw as-is
    }
  }

  /**
   * Auto mark present (based on study time)
   */
  async autoMarkPresent(userId: string, studyHours: number): Promise<IAttendance | null> {
    try {
      if (studyHours >= 1) {
        return await this.checkIn(userId);
      }
      return null;
    } catch (error: any) {
      throw new Error(`Error auto marking present: ${error}`);
    }
  }

  /**
   * Get attendance by date range
   */
  async findByDateRange(userId: string, startDate: Date, endDate: Date): Promise<IAttendance[]> {
    try {
      const result = await this.model
        .find({
          user: userId,
          date: { $gte: startDate, $lte: endDate },
        })
        .sort({ date: -1 })
        .exec();

      return result as IAttendance[];
    } catch (error: any) {
      throw new Error(`Error finding attendance by date range: ${error}`);
    }
  }

  /**
   * Get monthly attendance
   */
  async getMonthlyAttendance(userId: string, year: number, month: number): Promise<IAttendance[]> {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      return await this.findByDateRange(userId, startDate, endDate);
    } catch (error: any) {
      throw new Error(`Error getting monthly attendance: ${error}`);
    }
  }

  /**
   * Calculate attendance percentage
   */
  async calculateAttendancePercentage(userId: string, days: number = 30): Promise<number> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const attendance = await this.findByDateRange(userId, startDate, endDate);

      const presentDays = attendance.filter(
        (a) => a.status === AttendanceStatus.PRESENT
      ).length;

      return (presentDays / days) * 100;
    } catch (error: any) {
      throw new Error(`Error calculating attendance percentage: ${error}`);
    }
  }

  /**
   * Get attendance statistics
   */
  async getAttendanceStats(userId: string, days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await this.model.aggregate([
        {
          $match: {
            user: userId,               // was: new mongoose.Types.ObjectId(userId)
            date: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            totalDays: { $sum: 1 },
            presentDays: { $sum: { $cond: [{ $eq: ['$status', AttendanceStatus.PRESENT] }, 1, 0] } },
            absentDays: { $sum: { $cond: [{ $eq: ['$status', AttendanceStatus.ABSENT] }, 1, 0] } },
            lateDays: { $sum: { $cond: [{ $eq: ['$status', AttendanceStatus.LATE] }, 1, 0] } },
            totalStudyHours: { $sum: '$studyHours' },
          },
        },
        {
          $project: {
            _id: 0,
            totalDays: 1,
            presentDays: 1,
            absentDays: 1,
            lateDays: 1,
            totalStudyHours: 1,
            attendancePercentage: {
              $multiply: [{ $divide: ['$presentDays', '$totalDays'] }, 100],
            },
          },
        },
      ]);

      return stats[0] || {
        totalDays: 0, presentDays: 0, absentDays: 0,
        lateDays: 0, totalStudyHours: 0, attendancePercentage: 0,
      };
    } catch (error: any) {
      throw new Error(`Error getting attendance stats: ${error}`);
    }
  }

  // ADD: findWithPagination — history ke liye
  async findWithPagination(
    filter: any,
    sort: any,
    skip: number,
    limit: number
  ): Promise<IAttendance[]> {
    try {
      return await this.model
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec() as unknown as IAttendance[];
    } catch (error: any) {
      throw new Error(`Error finding attendance with pagination: ${error}`);
    }
  }

  // ADD: count
  async count(filter: any): Promise<number> {
    try {
      return await this.model.countDocuments(filter).exec();
    } catch (error: any) {
      throw new Error(`Error counting attendance: ${error}`);
    }
  }

  // ADD: getOverallStats — overall percentage ke liye
  async getOverallStats(userId: string): Promise<any> {
    try {
      const stats = await this.model.aggregate([
        { $match: { user: userId } },
        {
          $group: {
            _id: null,
            totalDays: { $sum: 1 },
            presentDays: { $sum: { $cond: [{ $eq: ['$status', AttendanceStatus.PRESENT] }, 1, 0] } },
            absentDays: { $sum: { $cond: [{ $eq: ['$status', AttendanceStatus.ABSENT] }, 1, 0] } },
            lateDays: { $sum: { $cond: [{ $eq: ['$status', AttendanceStatus.LATE] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            totalDays: 1,
            presentDays: 1,
            absentDays: 1,
            lateDays: 1,
            attendancePercentage: {
              $cond: [
                { $gt: ['$totalDays', 0] },
                { $multiply: [{ $divide: ['$presentDays', '$totalDays'] }, 100] },
                0,
              ],
            },
          },
        },
      ]);

      return stats[0] || {
        totalDays: 0, presentDays: 0,
        absentDays: 0, lateDays: 0, attendancePercentage: 0,
      };
    } catch (error: any) {
      throw new Error(`Error getting overall stats: ${error}`);
    }
  }

  // ADD: autoMark
  async autoMark(
    userId: string,
    reason: 'study_session' | 'task_completion',
    studyHours: number = 0
  ): Promise<IAttendance> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let attendance = await this.findByUserAndDate(userId, today);

      if (!attendance) {
        attendance = await this.create({
          user: userId,
          date: today,
          status: AttendanceStatus.PRESENT,
          checkInTime: new Date(),
          wasAutoMarked: true,
          autoMarkReason: reason,
          studyHours: reason === 'study_session' ? studyHours : 0,
          sessionsCompleted: reason === 'study_session' ? 1 : 0,
          tasksCompleted: reason === 'task_completion' ? 1 : 0,
        } as Partial<IAttendance>);
      } else {
        if (reason === 'study_session') {
          attendance.studyHours += studyHours;
          attendance.sessionsCompleted += 1;
        } else if (reason === 'task_completion') {
          attendance.tasksCompleted += 1;
        }
        await attendance.save();
      }

      return attendance;
    } catch (error: any) {
      throw new Error(`Error auto marking attendance: ${error}`);
    }
  }

  /**
   * Get attendance calendar (for UI)
   */
  async getAttendanceCalendar(userId: string, year: number, month: number): Promise<any[]> {
    try {
      const attendance = await this.getMonthlyAttendance(userId, year, month);

      const calendar = attendance.map((a) => ({
        date: a.date,
        status: a.status,
        checkInTime: a.checkInTime,
      }));

      return calendar;
    } catch (error: any) {
      throw new Error(`Error getting attendance calendar: ${error}`);
    }
  }

  /**
   * Mark absent for inactive users (cron job)
   */
  async markAbsentForInactiveUsers(date: Date): Promise<number> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // This would be called by a cron job
      // For users who don't have attendance record for the day
      // You'd need to implement logic to find such users

      return 0; // Placeholder
    } catch (error: any) {
      throw new Error(`Error marking absent: ${error}`);
    }
  }
}

export default new AttendanceRepository();