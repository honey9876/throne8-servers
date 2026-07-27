import {  attendanceResetJob,
  sendWeeklyAttendanceSummary,
  sendMonthlyAttendanceReport,
  scheduleAttendanceJobs,
} from "./attendanceReset.job";
import {scheduleDataCleanupJob,
  dataCleanupJob,
} from "./dataCleanup.job";
import {morningGoalReminderJob,
  eveningGoalReminderJob,
  weeklyGoalSummaryJob,
  sendMotivationalMessages,
  scheduleGoalReminderJobs,} from "./goalReminder.job";
import {rankingUpdateJob,
  quickRankingUpdateJob,
  scheduleRankingUpdateJob,} from "./rankingUpdate.job";
import {reportGenerationJob,
  scheduleReportGenerationJob,} from "./reportGeneration.job";
import  {streakCheckJob,
  streakWarningJob,
  scheduleStreakCheckJob,} from "./streakCheck.job";

export {
     attendanceResetJob,
  sendWeeklyAttendanceSummary,
  sendMonthlyAttendanceReport,
  scheduleAttendanceJobs,
  scheduleDataCleanupJob,
  dataCleanupJob,
   morningGoalReminderJob,
  eveningGoalReminderJob,
  weeklyGoalSummaryJob,
  sendMotivationalMessages,
  scheduleGoalReminderJobs,
   rankingUpdateJob,
  quickRankingUpdateJob,
  scheduleRankingUpdateJob,
   reportGenerationJob,
  scheduleReportGenerationJob,
   streakCheckJob,
  streakWarningJob,
  scheduleStreakCheckJob,
    }