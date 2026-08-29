import progressRepository from '../repositories/progress.repository';
import studySessionRepository from '../repositories/studySession.repository';
import taskRepository from '../repositories/task.repository';
import goalRepository from '../repositories/goal.repository';
import { TaskStatus } from '../enums/TaskStatus.enum';
import {
  getStartOfDay, getEndOfDay,
  getStartOfWeek, getEndOfWeek,
  formatDate,
} from '../utils/dateHelper';
import { logger } from '@/shared/logger.util';

class ProgressService {

  /**
   * Get today's study progress for a user
   */
  async getDailyProgress(userId: string): Promise<any> {
    const today      = new Date();
    const startOfDay = getStartOfDay(today);
    const endOfDay   = getEndOfDay(today);

    const sessions = await studySessionRepository.findTodaySessions(
      userId, startOfDay, endOfDay
    );
    const totalStudyHours = sessions.reduce((sum, s) => sum + s.durationInHours, 0);

    const completedTasks = await taskRepository.count({
      user:      userId,
      status:    TaskStatus.COMPLETED,
      updatedAt: { $gte: startOfDay, $lte: endOfDay },
    });

    const goal = await goalRepository.findOne({
      user:      userId,
      completed: false,
      startDate: { $lte: endOfDay },
      endDate:   { $gte: startOfDay },
    });

    const goalHours = goal?.targetHours || 0;
    const progress  = goalHours > 0
      ? parseFloat(((totalStudyHours / goalHours) * 100).toFixed(2))
      : 0;

    logger.info(`Daily progress retrieved for user ${userId}`);

    return {
      date:             formatDate(today),
      studyHours:       parseFloat(totalStudyHours.toFixed(2)),
      goalHours,
      progress:         Math.min(100, progress),
      sessionsCompleted: sessions.length,
      tasksCompleted:   completedTasks,
      isGoalAchieved:   goalHours > 0 && totalStudyHours >= goalHours,
    };
  }

  /**
   * Get this week's study progress with a daily breakdown
   */
  async getWeeklyProgress(userId: string): Promise<any> {
    const today     = new Date();
    const weekStart = getStartOfWeek(today);
    const weekEnd   = getEndOfWeek(today);

    const sessions = await studySessionRepository.findTodaySessions(
      userId, weekStart, weekEnd
    );
    const totalStudyHours = sessions.reduce((sum, s) => sum + s.durationInHours, 0);

    const goal = await goalRepository.findOne({
      user:      userId,
      completed: false,
      startDate: { $lte: weekEnd },
      endDate:   { $gte: weekStart },
    });

    const goalHours = goal?.targetHours || 0;
    const progress  = goalHours > 0
      ? parseFloat(((totalStudyHours / goalHours) * 100).toFixed(2))
      : 0;

    const dailyBreakdown = [];
    for (let i = 0; i < 7; i++) {
      const date     = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const dayStart = getStartOfDay(date);
      const dayEnd   = getEndOfDay(date);

      const daySessions = sessions.filter(
        (s) => s.startTime >= dayStart && s.startTime <= dayEnd
      );
      const dayHours  = daySessions.reduce((sum, s) => sum + s.durationInHours, 0);
      const dailyGoal = goalHours > 0 ? goalHours / 7 : 0;

      dailyBreakdown.push({
        date:       formatDate(date),
        day:        date.toLocaleDateString('en-US', { weekday: 'short' }),
        studyHours: parseFloat(dayHours.toFixed(2)),
        goalHours:  parseFloat(dailyGoal.toFixed(2)),
        achieved:   dailyGoal > 0 && dayHours >= dailyGoal,
      });
    }

    const sortedDays = [...dailyBreakdown].sort((a, b) => b.studyHours - a.studyHours);

    logger.info(`Weekly progress retrieved for user ${userId}`);

    return {
      weekStartDate:     formatDate(weekStart),
      weekEndDate:       formatDate(weekEnd),
      totalStudyHours:   parseFloat(totalStudyHours.toFixed(2)),
      totalGoalHours:    goalHours,
      progress:          Math.min(100, progress),
      dailyBreakdown,
      averageDailyHours: parseFloat((totalStudyHours / 7).toFixed(2)),
      bestDay:           sortedDays[0]?.day || 'N/A',
      worstDay:          sortedDays[sortedDays.length - 1]?.day || 'N/A',
    };
  }

  /**
   * Get all-time total progress for a user
   */
  async getTotalProgress(userId: string): Promise<any> {
    const progress = await progressRepository.findOrCreate(userId);

    logger.info(`Total progress retrieved for user ${userId}`);

    return {
      totalStudyHours:         parseFloat(progress.totalStudyHours.toFixed(2)),
      totalSessions:           progress.totalSessions,
      averageSessionDuration:  parseFloat(progress.averageSessionDuration.toFixed(2)),
      studyDaysCount:          progress.studyDaysCount,
      consecutiveStudyDays:    progress.consecutiveStudyDays,
      completionRate:          progress.completionRate,
      consistencyScore:        progress.consistency,
      productivityScore:       progress.productivity,
    };
  }

  /**
   * Get study hours graph data for a given period.
   *
   * Load the relevant range of sessions once and aggregate them by date.
   */
  async getGraphData(userId: string, period: string): Promise<any> {
    let days = 7;
    if (period === '30days')   days = 30;
    else if (period === '3months')  days = 90;
    else if (period === '6months') days = 180;
    else if (period === '1year')   days = 365;

    const endDate   = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const sessions = await studySessionRepository.findTodaySessions(userId, startDate, endDate);

    // Build a date-keyed map for O(1) lookup
    const sessionsByDate: Record<string, { hours: number; count: number }> = {};
    for (const session of sessions) {
      const dateKey = formatDate(session.startTime);
      if (!sessionsByDate[dateKey]) {
        sessionsByDate[dateKey] = { hours: 0, count: 0 };
      }
      sessionsByDate[dateKey].hours += session.durationInHours;
      sessionsByDate[dateKey].count += 1;
    }

    const graphData    = [];
    let totalStudyHours = 0;
    let peakHours      = 0;
    let peakDay        = '';

    for (let i = 0; i < days; i++) {
      const date    = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = formatDate(date);
      const entry   = sessionsByDate[dateKey] || { hours: 0, count: 0 };

      totalStudyHours += entry.hours;

      if (entry.hours > peakHours) {
        peakHours = entry.hours;
        peakDay   = dateKey;
      }

      graphData.push({
        date:               dateKey,
        studyHours:         parseFloat(entry.hours.toFixed(2)),
        sessionsCompleted:  entry.count,
      });
    }

    logger.info(`Graph data retrieved for user ${userId}, period: ${period}`);

    return {
      period,
      startDate:          formatDate(startDate),
      endDate:            formatDate(endDate),
      data:               graphData,
      totalStudyHours:    parseFloat(totalStudyHours.toFixed(2)),
      averageDailyHours:  parseFloat((totalStudyHours / days).toFixed(2)),
      peakDay,
      peakHours:          parseFloat(peakHours.toFixed(2)),
    };
  }
}

export default new ProgressService();