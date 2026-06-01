/**
 * ====================================
 * REPORT GENERATION CRON JOB (FIXED)
 * ====================================
 * Runs monthly on the 1st to generate reports
 */

import cron from 'node-cron';
import { User } from '@/auth/models';
// import {Group, StudySession, Attendance, Goal, Streak, Task} from '../models';
import Group from '../models/Group.model';
import Goal from '../models/Goal.model';
import StudySession from '../models/StudySession.model';
import Attendance from '../models/Attendance.model';
import Streak from '../models/Streak.model';
import Task from '../models/Task.model';
import { LoggerUtil } from '@/shared/logger.util';
import { NotificationType } from '../enums';
import notificationService from '../services/notification.service';
import { addDays, getStartOfMonth, getEndOfMonth, formatReadableDate } from '../utils/dateHelper';

/**
 * Generate monthly report for a user
 */
const generateUserReport = async (userId: any): Promise<any> => {
  try {
    const now = new Date();
    const lastMonth = addDays(now, -30);
    const startOfLastMonth = getStartOfMonth(lastMonth);
    const endOfLastMonth = getEndOfMonth(lastMonth);

    const user = await User.findById(userId).select('name email');
    if (!user) return null;

    // Study sessions data
    const sessions = await StudySession.find({
      user: userId,
      createdAt: {
        $gte: startOfLastMonth,
        $lte: endOfLastMonth,
      },
      status: 'completed',
    });

    const totalSessions = sessions.length;
    const totalStudyTime = sessions.reduce(
      (sum, s) => sum + (s.duration || 0),
      0
    );
    const totalHours = (totalStudyTime / 3600).toFixed(2);
    const avgSessionLength = totalSessions > 0 
      ? Math.floor(totalStudyTime / totalSessions / 60) 
      : 0;

    // Attendance data
    const attendanceRecords = await Attendance.find({
      user: userId,
      date: {
        $gte: startOfLastMonth,
        $lte: endOfLastMonth,
      },
    });

    const presentDays = attendanceRecords.filter(
      (a) => a.status === 'present'
    ).length;
    const attendancePercentage = attendanceRecords.length > 0
      ? ((presentDays / attendanceRecords.length) * 100).toFixed(2)
      : '0';

    // Streak data
    const streak = await Streak.findOne({ user: userId });

    // Tasks data
    const tasksCompleted = await Task.countDocuments({
      user: userId,
      status: 'completed',
      completedAt: {
        $gte: startOfLastMonth,
        $lte: endOfLastMonth,
      },
    });

    // Goals data
    const goals = await Goal.find({
      user: userId,
      createdAt: {
        $gte: startOfLastMonth,
        $lte: endOfLastMonth,
      },
    });

    const goalsCompleted = goals.filter((g) => g.completed).length;
    const goalCompletionRate = goals.length > 0
      ? ((goalsCompleted / goals.length) * 100).toFixed(2)
      : '0';

    return {
      user: {
        name: user.username,
        email: user.email,
      },
      period: {
        start: formatReadableDate(startOfLastMonth),
        end: formatReadableDate(endOfLastMonth),
      },
      studyData: {
        totalSessions,
        totalHours,
        avgSessionLength: `${avgSessionLength} min`,
      },
      attendance: {
        presentDays,
        totalDays: attendanceRecords.length,
        percentage: `${attendancePercentage}%`,
      },
      streak: {
        current: streak?.currentStreak || 0,
        longest: streak?.longestStreak || 0,
      },
      tasks: {
        completed: tasksCompleted,
      },
      goals: {
        total: goals.length,
        completed: goalsCompleted,
        completionRate: `${goalCompletionRate}%`,
      },
    };
  } catch (error : any) {
    LoggerUtil.error(`Error generating report for user ${userId}:`, error);
    return null;
  }
};

/**
 * Generate monthly report for a group
 */
const generateGroupReport = async (groupId: any): Promise<any> => {
  try {
    const now = new Date();
    const lastMonth = addDays(now, -30);
    const startOfLastMonth = getStartOfMonth(lastMonth);
    const endOfLastMonth = getEndOfMonth(lastMonth);

    const group = await Group.findById(groupId)
      .select('title currentMemberCount leader')
      .populate('leader', 'name email');
    
    if (!group) return null;

    const members = await User.find({
      _id: { $in: group.currentMemberCount },
    });

    const memberIds = members.map((m) => m._id);
    const sessions = await StudySession.find({
      user: { $in: memberIds },
      createdAt: {
        $gte: startOfLastMonth,
        $lte: endOfLastMonth,
      },
      status: 'completed',
    });

    const totalGroupHours = sessions.reduce(
      (sum, s) => sum + (s.duration || 0),
      0
    ) / 3600;

    const avgHoursPerMember = members.length > 0
      ? (totalGroupHours / members.length).toFixed(2)
      : '0';

    return {
      group: {
        title: group.title,
        memberCount: group.currentMemberCount,
        leader: (group.leader as any).name,
      },
      period: {
        start: formatReadableDate(startOfLastMonth),
        end: formatReadableDate(endOfLastMonth),
      },
      activity: {
        totalSessions: sessions.length,
        totalHours: totalGroupHours.toFixed(2),
        avgHoursPerMember,
      },
    };
  } catch (error : any) {
    LoggerUtil.error(`Error generating report for group ${groupId}:`, error);
    return null;
  }
};

/**
 * Send in-app notification with report summary
 */
const sendReportNotification = async (userId: any, report: any): Promise<void> => {
  try {
    await notificationService.createNotification({
      recipient: userId,
      type: NotificationType.SYSTEM_UPDATE,
      title: '📊 Monthly Report Available',
      message: `You studied ${report.studyData.totalHours} hours with ${report.attendance.percentage} attendance!`,
      data: {
        totalHours: report.studyData.totalHours,
        attendance: report.attendance.percentage,
        tasksCompleted: report.tasks.completed,
      },
    });

    LoggerUtil.info(`Report notification sent to user ${userId}`);
  } catch (error : any) {
    LoggerUtil.error(`Error sending report notification to user ${userId}:`, error);
  }
};

/**
 * Main report generation job
 */
 const reportGenerationJob = async (): Promise<void> => {
  const startTime = Date.now();
  LoggerUtil.info('📊 Starting monthly report generation job...');

  try {
    const users = await User.find({ isActive: true }).select('_id');
    LoggerUtil.info(`Generating reports for ${users.length} users...`);

    let userReportsGenerated = 0;
    let notificationsSent = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const report = await generateUserReport(user._id);

        if (report) {
          await sendReportNotification(user._id, report);
          notificationsSent++;
          userReportsGenerated++;
        }
      } catch (error : any) {
        errors++;
        LoggerUtil.error(`Failed to generate report for user ${user._id}:`, error);
      }
    }

    // Generate group reports (optional)
    const groups = await Group.find({ isActive: true }).select('_id');
    let groupReportsGenerated = 0;

    for (const group of groups) {
      try {
        const report = await generateGroupReport(group._id);
        if (report) {
          groupReportsGenerated++;
        }
      } catch (error : any) {
        LoggerUtil.error(`Failed to generate report for group ${group._id}:`, error);
      }
    }

    const timeTaken = Date.now() - startTime;

    LoggerUtil.info(
      `✅ Report generation completed:
      - User reports: ${userReportsGenerated}
      - Notifications sent: ${notificationsSent}
      - Group reports: ${groupReportsGenerated}
      - Errors: ${errors}
      - Time taken: ${timeTaken}ms`
    );
  } catch (error : any) {
    LoggerUtil.error('❌ Report generation job failed:', error);
  }
};

/**
 * Schedule report generation job
 */
 const scheduleReportGenerationJob = (): void => {
  cron.schedule('0 8 1 * *', reportGenerationJob, {
    timezone: 'Asia/Kolkata',
  });

  LoggerUtil.info('📅 Report generation job scheduled: 1st of every month at 8:00 AM');
};

export  {
  reportGenerationJob,
  scheduleReportGenerationJob,
};