// controllers/attendance.controller.ts

import { Request, Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { asyncHandler } from '@/shared/utils/helpers.util';
import ResponseUtil from '@/shared/response.util';
import {
  checkIn,
  autoMarkAttendance,
  getCurrentMonthPercentage,
  getOverallPercentage,
  getTodayStatus,
  getAttendanceHistory,
  getCalendarView,
} from '../services/attendance.service';
import { formatDate } from '../utils/dateHelper';

export const dailyCheckIn = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;  // was: user?.id
  const { notes } = req.body;

  const attendance = await checkIn(userId!, notes);

  return ResponseUtil.success(res, {
    attendanceId: attendance.attendanceId,  // was: attendance._id
    date: formatDate(attendance.date),
    checkInTime: attendance.checkInTime,
    status: attendance.status,
  }, 'Check-in successful', 201);
});

export const autoMark = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { reason, studyHours } = req.body;

  const attendance = await autoMarkAttendance(userId!, reason, studyHours);

  return ResponseUtil.success(res, {
    attendanceId: attendance.attendanceId,
    date: formatDate(attendance.date),
    status: attendance.status,
    wasAutoMarked: attendance.wasAutoMarked,
    autoMarkReason: attendance.autoMarkReason,
  }, 'Attendance marked automatically');
});

export const getPercentage = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;

  const [currentMonth, overall] = await Promise.all([
    getCurrentMonthPercentage(userId!),
    getOverallPercentage(userId!),
  ]);

  return ResponseUtil.success(res, {
    totalDays: overall.totalDays,
    presentDays: overall.presentDays,
    absentDays: overall.absentDays,
    lateDays: overall.lateDays,
    attendancePercentage: overall.attendancePercentage,
    currentMonthPercentage: currentMonth.attendancePercentage,
    overallPercentage: overall.attendancePercentage,
  }, 'Attendance percentage retrieved successfully');
});

export const getHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { page = '1', limit = '30' } = req.query;

  const [result, summary] = await Promise.all([
    getAttendanceHistory(userId!, Number(page), Number(limit)),
    getOverallPercentage(userId!),
  ]);

  return ResponseUtil.success(res, {
    attendance: result.attendance.map((a: any) => ({
      attendanceId: a.attendanceId,
      date: formatDate(a.date),
      status: a.status,
      checkInTime: a.checkInTime,
      checkOutTime: a.checkOutTime,
      totalActiveTime: a.totalActiveTime,
      studyHours: a.studyHours,
      sessionsCompleted: a.sessionsCompleted,
      wasAutoMarked: a.wasAutoMarked,
      notes: a.notes,
    })),
    summary: {
      totalDays: summary.totalDays,
      presentDays: summary.presentDays,
      absentDays: summary.absentDays,
      attendancePercentage: summary.attendancePercentage,
    },
    total: result.total,
    page: result.page,
    limit: result.limit,
  }, 'Attendance history retrieved successfully');
});

export const getCalendar = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const today = new Date();
  const month = Number(req.query.month) || today.getMonth() + 1;
  const year = Number(req.query.year) || today.getFullYear();

  const attendance = await getCalendarView(userId!, month, year);

  const daysInMonth = new Date(year, month, 0).getDate();
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(year, month - 1, i);
    const record = attendance.find((a: any) =>
      new Date(a.date).toDateString() === date.toDateString()
    );

    days.push({
      date: formatDate(date),
      day: i,
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      status: record?.status || 'not_marked',
      isToday: date.toDateString() === todayDate.toDateString(),
      isFuture: date > todayDate,
      studyHours: record?.studyHours || 0,
      checkInTime: record?.checkInTime,
    });
  }

  const presentDays = days.filter(d => d.status === 'present').length;
  const absentDays = days.filter(d => d.status === 'absent').length;
  const lateDays = days.filter(d => d.status === 'late').length;
  const notMarkedDays = days.filter(d => d.status === 'not_marked').length;
  const markedDays = daysInMonth - notMarkedDays;

  return ResponseUtil.success(res, {
    year,
    month,
    monthName: new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' }),
    days,
    summary: {
      totalDays: daysInMonth,
      presentDays,
      absentDays,
      lateDays,
      notMarkedDays,
      attendancePercentage: markedDays > 0
        ? parseFloat(((presentDays / markedDays) * 100).toFixed(2))
        : 0,
    },
  }, 'Calendar view retrieved successfully');
});

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const status = await getTodayStatus(userId!);

  return ResponseUtil.success(res, {
    todayStatus: status.status,
    hasCheckedInToday: status.hasCheckedIn,
    checkInTime: status.checkInTime,
    totalActiveTime: status.totalActiveTime,
    isActive: status.hasCheckedIn,
  }, 'Attendance status retrieved successfully');
});

export default {
  dailyCheckIn,
  autoMark,
  getPercentage,
  getHistory,
  getCalendar,
  getStatus,
};

// /**
//  * ====================================
//  * ATTENDANCE CONTROLLER
//  * ====================================
//  * HTTP handlers for attendance tracking
//  */

// import { Request, Response } from 'express';
// import ResponseUtil from '@/shared/response.util';
// import { asyncHandler } from '@/shared/utils/helpers.util';
// import {
//   checkIn,
//   autoMarkAttendance,
//   getCurrentMonthPercentage,
//   getOverallPercentage,
//   getTodayStatus,
//   getAttendanceHistory,
//   getCalendarView,
// } from '../services/attendance.service';
// import { formatDate } from '../utils/dateHelper';
// import { AuthRequest } from '@/shared/middlewares/auth.middleware';

// /**
//  * @route   POST /api/attendance/check-in
//  * @desc    Daily check-in
//  * @access  Private
//  */
// export const dailyCheckIn = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const { notes } = req.body;

//     const attendance = await checkIn(userId!, notes);

//     return ResponseUtil.success(
//       res,
//       {
//         attendanceId: attendance._id,
//         date: formatDate(attendance.date),
//         checkInTime: attendance.checkInTime,
//         status: attendance.status,
//         message: 'Successfully checked in for today!',
//       },
//       'Check-in successful',
//       201
//     );
//   }
// );

// /**
//  * @route   PATCH /api/attendance/auto-mark
//  * @desc    Auto-mark attendance after study session or task
//  * @access  Private
//  */
// export const autoMark = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const { reason, studyHours } = req.body;

//     const attendance = await autoMarkAttendance(userId!, reason, studyHours);

//     return ResponseUtil.success(
//       res,
//       {
//         attendanceId: attendance._id,
//         date: formatDate(attendance.date),
//         status: attendance.status,
//         wasAutoMarked: attendance.wasAutoMarked,
//         autoMarkReason: attendance.autoMarkReason,
//       },
//       'Attendance marked automatically'
//     );
//   }
// );

// /**
//  * @route   GET /api/attendance/percentage
//  * @desc    Get attendance percentage
//  * @access  Private
//  */
// export const getPercentage = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;

//     const currentMonth = await getCurrentMonthPercentage(userId!);
//     const overall = await getOverallPercentage(userId!);

//     return ResponseUtil.success(
//       res,
//       {
//         totalDays: overall.totalDays,
//         presentDays: overall.presentDays,
//         absentDays: overall.absentDays,
//         lateDays: overall.lateDays,
//         attendancePercentage: overall.attendancePercentage,
//         currentMonthPercentage: currentMonth.attendancePercentage,
//         overallPercentage: overall.attendancePercentage,
//       },
//       'Attendance percentage retrieved successfully'
//     );
//   }
// );

// /**
//  * @route   GET /api/attendance/history
//  * @desc    Get attendance history
//  * @access  Private
//  */
// export const getHistory = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const { page = '1', limit = '30' } = req.query;

//     const result = await getAttendanceHistory(
//       userId!,
//       Number(page),
//       Number(limit)
//     );

//     const summary = await getOverallPercentage(userId!);

//     return ResponseUtil.success(
//       res,
//       {
//         attendance: result.attendance.map((a: any) => ({
//           _id: a._id,
//           date: formatDate(a.date),
//           status: a.status,
//           checkInTime: a.checkInTime,
//           checkOutTime: a.checkOutTime,
//           totalActiveTime: a.totalActiveTime,
//           studyHours: a.studyHours,
//           sessionsCompleted: a.sessionsCompleted,
//           wasAutoMarked: a.wasAutoMarked,
//           notes: a.notes,
//         })),
//         summary: {
//           totalDays: summary.totalDays,
//           presentDays: summary.presentDays,
//           absentDays: summary.absentDays,
//           attendancePercentage: summary.attendancePercentage,
//         },
//         total: result.total,
//         page: result.page,
//         limit: result.limit,
//       },
//       'Attendance history retrieved successfully'
//     );
//   }
// );

// /**
//  * @route   GET /api/attendance/calendar
//  * @desc    Get calendar view of attendance
//  * @access  Private
//  */
// export const getCalendar = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const { month, year } = req.query;

//     if (!month || !year) {
//       const today = new Date();
//       const currentMonth = today.getMonth() + 1;
//       const currentYear = today.getFullYear();

//       const attendance = await getCalendarView(
//         userId!,
//         currentMonth,
//         currentYear
//       );

//       return ResponseUtil.success(
//         res,
//         {
//           year: currentYear,
//           month: currentMonth,
//           monthName: today.toLocaleString('default', { month: 'long' }),
//           days: attendance,
//         },
//         'Calendar view retrieved successfully'
//       );
//     }

//     const attendance = await getCalendarView(
//       userId!,
//       Number(month),
//       Number(year)
//     );

//     const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString(
//       'default',
//       { month: 'long' }
//     );

//     // Create calendar days array
//     const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const days = [];
//     for (let i = 1; i <= daysInMonth; i++) {
//       const date = new Date(Number(year), Number(month) - 1, i);

//       const attendanceRecord = attendance.find((a: any) =>
//         new Date(a.date).toDateString() === date.toDateString()
//       );

//       days.push({
//         date: formatDate(date),
//         day: i,
//         dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
//         status: attendanceRecord?.status || 'not_marked',
//         isToday: date.toDateString() === today.toDateString(),
//         isFuture: date > today,
//         studyHours: attendanceRecord?.studyHours || 0,
//         checkInTime: attendanceRecord?.checkInTime,
//       });
//     }

//     // Calculate summary
//     const presentDays = days.filter((d: any) => d.status === 'present').length;
//     const absentDays = days.filter((d: any) => d.status === 'absent').length;
//     const lateDays = days.filter((d: any) => d.status === 'late').length;
//     const notMarkedDays = days.filter((d: any) => d.status === 'not_marked').length;
//     const totalDays = daysInMonth;
//     const markedDays = totalDays - notMarkedDays;
//     const attendancePercentage =
//       markedDays > 0 ? parseFloat(((presentDays / markedDays) * 100).toFixed(2)) : 0;

//     return ResponseUtil.success(
//       res,
//       {
//         year: Number(year),
//         month: Number(month),
//         monthName,
//         days,
//         summary: {
//           totalDays,
//           presentDays,
//           absentDays,
//           lateDays,
//           notMarkedDays,
//           attendancePercentage,
//         },
//       },
//       'Calendar view retrieved successfully'
//     );
//   }
// );

// /**
//  * @route   GET /api/attendance/status
//  * @desc    Get today's attendance status
//  * @access  Private
//  */
// export const getStatus = asyncHandler(
//   async (req: Request, res: Response) => {
//     const userId = (req as AuthRequest).user?.id;
//     const status = await getTodayStatus(userId!);

//     return ResponseUtil.success(
//       res,
//       {
//         todayStatus: status.status,
//         hasCheckedInToday: status.hasCheckedIn,
//         checkInTime: status.checkInTime,
//         totalActiveTime: status.totalActiveTime,
//         isActive: status.hasCheckedIn,
//       },
//       'Attendance status retrieved successfully'
//     );
//   }
// );

// export default {
//   dailyCheckIn,
//   autoMark,
//   getPercentage,
//   getHistory,
//   getCalendar,
//   getStatus,
// };

