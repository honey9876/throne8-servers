/**
 * ====================================
 * ATTENDANCE RESET CRON JOB (FIXED)
 * ====================================
 * Runs daily at 12:00 AM to process attendance
 */

import cron from 'node-cron';
import { User } from '@/auth/models';
import Attendance from '../models/Attendance.model';
import StudySession from '../models/StudySession.model';
import { LoggerUtil } from '@/shared/logger.util';
import attendanceService from '../services/attendance.service';
import { AttendanceStatus, NotificationType } from '../enums';
import notificationService from '../services/notification.service';
import { addDays ,
  getStartOfDay,
  getEndOfDay,
  getStartOfMonth,
} from '../utils/dateHelper';


/**
 * Check if user had any activity yesterday
 */
const hadActivityYesterday = async (userId: any): Promise<boolean> => {
  try {
    const yesterday = addDays(new Date(), -1);
    const startOfYesterday = getStartOfDay(yesterday);
    const endOfYesterday = getEndOfDay(yesterday);

    const attendance = await Attendance.findOne({
      user: userId,
      date: {
        $gte: startOfYesterday,
        $lte: endOfYesterday,
      },
    });

    if (attendance) {
      return attendance.status === AttendanceStatus.PRESENT;
    }

    const sessions = await StudySession.find({
      user: userId,
      createdAt: {
        $gte: startOfYesterday,
        $lte: endOfYesterday,
      },
      status: 'completed',
    });

    const totalStudyTime = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const studyHours = totalStudyTime / 3600;

    return studyHours >= 1;
  } catch (error : any) {
    LoggerUtil.error(`Error checking activity for user ${userId}:`, error);
    return false;
  }
};

/**
 * Process attendance for a single user
 */
const processUserAttendance = async (userId: any): Promise<void> => {
  try {
    const yesterday = addDays(new Date(), -1);
    const startOfYesterday = getStartOfDay(yesterday);

    const existingAttendance = await Attendance.findOne({
      user: userId,
      date: startOfYesterday,
    });

    if (existingAttendance) {
      return;
    }

    const wasActive = await hadActivityYesterday(userId);

    const attendance = await Attendance.create({
      user: userId,
      date: startOfYesterday,
      status: wasActive ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT,
      wasAutoMarked: true,
      autoMarkReason: wasActive ? 'study_session' : 'manual',
    });

    LoggerUtil.info(
      `Attendance marked for user ${userId}: ${attendance.status} (auto-marked)`
    );
  } catch (error : any) {
    LoggerUtil.error(`Error processing attendance for user ${userId}:`, error);
  }
};

/**
 * Calculate and update monthly attendance percentage
 */
const updateMonthlyAttendance = async (userId: any): Promise<void> => {
  try {
    const startOfThisMonth = getStartOfMonth(new Date());

    const totalDays = await Attendance.countDocuments({
      user: userId,
      date: { $gte: startOfThisMonth },
    });

    if (totalDays === 0) return;

    const presentDays = await Attendance.countDocuments({
      user: userId,
      date: { $gte: startOfThisMonth },
      status: AttendanceStatus.PRESENT,
    });

    const percentage = ((presentDays / totalDays) * 100).toFixed(2);

    LoggerUtil.info(
      `User ${userId} monthly attendance: ${presentDays}/${totalDays} (${percentage}%)`
    );
  } catch (error : any) {
    LoggerUtil.error(`Error updating monthly attendance for user ${userId}:`, error);
  }
};

/**
 * Send weekly attendance summary (Sunday)
 */
const sendWeeklyAttendanceSummary = async (): Promise<void> => {
  LoggerUtil.info('📊 Sending weekly attendance summaries...');

  try {
    const users = await User.find({ isActive: true }).select('_id name');
    let sent = 0;

    for (const user of users) {
      try {
        const weekStart = addDays(new Date(), -7);

        const attendanceRecords = await Attendance.find({
          user: user._id,
          date: { $gte: weekStart },
        });

        const presentDays = attendanceRecords.filter(
          (a) => a.status === AttendanceStatus.PRESENT
        ).length;

        const totalDays = attendanceRecords.length;
        const percentage = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

        await notificationService.createNotification({
          recipient: user._id,
          type: NotificationType.SYSTEM_UPDATE,
          title: '📊 Weekly Attendance Summary',
          message: `This week: ${presentDays}/${totalDays} days present (${Math.round(percentage)}%)`,
          data: {
            presentDays,
            totalDays,
            percentage: Math.round(percentage),
            period: 'weekly',
          },
        });

        sent++;
      } catch (error : any) {
        LoggerUtil.error(`Failed to send summary to user ${user._id}:`, error);
      }
    }

    LoggerUtil.info(`✅ Weekly summaries sent: ${sent}`);
  } catch (error : any) {
    LoggerUtil.error('❌ Failed to send weekly attendance summaries:', error);
  }
};

/**
 * Send monthly attendance report (1st of month)
 */
const sendMonthlyAttendanceReport = async (): Promise<void> => {
  LoggerUtil.info('📅 Sending monthly attendance reports...');

  try {
    const users = await User.find({ isActive: true }).select('_id name email');
    let sent = 0;

    for (const user of users) {
      try {
        const attendanceData = await attendanceService.getAttendancePercentage(
          user._id
        );

        if (attendanceData.totalDays > 0) {
          await notificationService.createNotification({
            recipient: user._id,
            type: NotificationType.SYSTEM_UPDATE,
            title: '📅 Monthly Attendance Report',
            message: `Last month: ${attendanceData.presentDays}/${attendanceData.totalDays} days (${attendanceData.attendancePercentage}%)`,
            data: {
              presentDays: attendanceData.presentDays,
              totalDays: attendanceData.totalDays,
              percentage: attendanceData.attendancePercentage,
              period: 'monthly',
            },
          });

          sent++;
        }
      } catch (error : any) {
        LoggerUtil.error(`Failed to send report to user ${user._id}:`, error);
      }
    }

    LoggerUtil.info(`✅ Monthly reports sent: ${sent}`);
  } catch (error : any) {
    LoggerUtil.error('❌ Failed to send monthly reports:', error);
  }
};

/**
 * Main attendance reset job
 */
 const attendanceResetJob = async (): Promise<void> => {
  const startTime = Date.now();
  LoggerUtil.info('📋 Starting attendance reset job...');

  try {
    const users = await User.find({ isActive: true }).select('_id');
    LoggerUtil.info(`Processing attendance for ${users.length} users...`);

    let processed = 0;
    let errors = 0;

    for (const user of users) {
      try {
        await processUserAttendance(user._id);
        await updateMonthlyAttendance(user._id);
        processed++;
      } catch (error : any) {
        errors++;
        LoggerUtil.error(`Failed to process user ${user._id}:`, error);
      }
    }

    const timeTaken = Date.now() - startTime;

    LoggerUtil.info(
      `✅ Attendance reset completed. Processed: ${processed}, Errors: ${errors}, Time: ${timeTaken}ms`
    );
  } catch (error : any) {
    LoggerUtil.error('❌ Attendance reset job failed:', error);
  }
};

/**
 * Schedule attendance jobs
 */
 const scheduleAttendanceJobs = (): void => {
  cron.schedule('0 0 * * *', attendanceResetJob, {
    timezone: 'Asia/Kolkata',
  });

  cron.schedule('0 21 * * 0', sendWeeklyAttendanceSummary, {
    timezone: 'Asia/Kolkata',
  });

  cron.schedule('0 10 1 * *', sendMonthlyAttendanceReport, {
    timezone: 'Asia/Kolkata',
  });

  LoggerUtil.info('📅 Attendance jobs scheduled:');
  LoggerUtil.info('  - Daily reset: 12:00 AM');
  LoggerUtil.info('  - Weekly summary: Sunday 9:00 PM');
  LoggerUtil.info('  - Monthly report: 1st of month 10:00 AM');
};

export  {
  attendanceResetJob,
  sendWeeklyAttendanceSummary,
  sendMonthlyAttendanceReport,
  scheduleAttendanceJobs,
};