import studySessionRepository from '../repositories/studySession.repository';
import goalRepository from '../repositories/goal.repository';
import { SessionStatus } from '../interfaces/IStudySession';
import { NotFoundError, BadRequestError } from '@/shared/errors/app.error';
import {
  getStartOfDay, getEndOfDay,
  getStartOfWeek, getEndOfWeek,
  getStartOfMonth, getEndOfMonth,
} from '../utils/dateHelper';
import { logger } from '@/shared/logger.util';
import { generateSecureId } from '@/shared/security';

class TimerService {

  /**
   * Start a new study timer.
   * Only one active timer is allowed per user at a time.
   */
  async startTimer(
    userId: string,
    data: { goalId?: string; subject?: string; notes?: string }
  ): Promise<any> {
    const { goalId, subject, notes } = data;

    const activeSession = await studySessionRepository.findActiveSession(userId);
    if (activeSession) {
      throw new BadRequestError('You already have an active timer. Please stop or cancel it first.');
    }

    if (goalId) {
      const goal = await goalRepository.findByGoalId(goalId);
      if (!goal || goal.user !== userId) {
        throw new NotFoundError('Goal not found');
      }
    }

    const session = await studySessionRepository.create({
      sessionId: generateSecureId(),
      user:      userId,
      goal:      goalId,
      startTime: new Date(),
      status:    SessionStatus.ACTIVE,
      subject:   subject || '',
      notes:     notes || '',
    });

    logger.info(`Timer started: ${session.sessionId}`);

    return {
      sessionId: session.sessionId,
      startTime: session.startTime,
      status:    session.status,
      subject:   session.subject,
      goal:      goalId || null,
    };
  }

  /**
   * Pause an active timer
   */
  async pauseTimer(userId: string): Promise<any> {
    const session = await studySessionRepository.findByStatus(userId, SessionStatus.ACTIVE);
    if (!session) throw new NotFoundError('No active timer found');

    session.status   = SessionStatus.PAUSED;
    session.pausedAt = new Date();
    await session.save();

    const elapsedTime = Math.floor(
      (session.pausedAt.getTime() - session.startTime.getTime()) / 1000
    );

    logger.info(`Timer paused: ${session.sessionId}`);

    return {
      sessionId:   session.sessionId,
      status:      session.status,
      pausedAt:    session.pausedAt,
      elapsedTime,
    };
  }

  /**
   * Resume a paused timer.
   * Accumulates total paused duration so elapsed time stays accurate.
   */
  async resumeTimer(userId: string): Promise<any> {
    const session = await studySessionRepository.findByStatus(userId, SessionStatus.PAUSED);
    if (!session) throw new NotFoundError('No paused timer found');
    if (!session.pausedAt) throw new BadRequestError('Timer was not paused');

    const pauseDuration = Math.floor(
      (new Date().getTime() - session.pausedAt.getTime()) / 1000
    );
    session.pausedDuration += pauseDuration;
    session.status          = SessionStatus.ACTIVE;
    session.pausedAt        = null;
    await session.save();

    logger.info(`Timer resumed: ${session.sessionId}`);

    return {
      sessionId:          session.sessionId,
      status:             session.status,
      totalPausedDuration: session.pausedDuration,
    };
  }

  /**
   * Stop the active timer and record the completed session.
   * Updates goal progress if a goal was linked.
   */
  async stopTimer(userId: string, notes?: string): Promise<any> {
    const session = await studySessionRepository.findActiveSession(userId);
    if (!session) throw new NotFoundError('No active timer found');

    // If currently paused, add final pause duration before stopping
    if (session.status === SessionStatus.PAUSED && session.pausedAt) {
      const pauseDuration = Math.floor(
        (new Date().getTime() - session.pausedAt.getTime()) / 1000
      );
      session.pausedDuration += pauseDuration;
    }

    session.endTime = new Date();
    session.status  = SessionStatus.COMPLETED;
    if (notes) session.notes = notes;
    await session.save(); // pre-save hook calculates duration fields

    // Update linked goal progress
    if (session.goal) {
      const totalTime      = Math.floor(
        (session.endTime.getTime() - session.startTime.getTime()) / 1000
      );
      const actualDuration = Math.max(0, totalTime - session.pausedDuration);
      const hoursStudied   = parseFloat((actualDuration / 3600).toFixed(2));

      await goalRepository.updateProgressByGoalId(
        session.goal as string,
        userId,
        hoursStudied
      );
      logger.info(`Updated goal ${session.goal} with ${hoursStudied} hours`);
    }

    await session.populate('goal', 'title targetHours currentHours');

    logger.info(`Timer stopped: ${session.sessionId}, duration: ${session.durationInMinutes} minutes`);

    return {
      sessionId:         session.sessionId,
      startTime:         session.startTime,
      endTime:           session.endTime,
      duration:          session.duration,
      durationInMinutes: session.durationInMinutes,
      durationInHours:   session.durationInHours,
      status:            session.status,
      goal:              session.goal,
      subject:           session.subject,
      notes:             session.notes,
    };
  }

  /**
   * Cancel an active timer without saving progress
   */
  async cancelTimer(userId: string): Promise<void> {
    const session = await studySessionRepository.findActiveSession(userId);
    if (!session) throw new NotFoundError('No active timer found');

    session.status = SessionStatus.CANCELLED;
    await session.save();

    logger.info(`Timer cancelled: ${session.sessionId}`);
  }

  /**
   * Get the currently active or paused timer for a user
   */
  async getActiveTimer(userId: string): Promise<any> {
    const session = await studySessionRepository.findActiveWithGoal(userId);
    if (!session) return null;

    const now           = new Date();
    const referenceTime = session.pausedAt || now;
    const elapsedTime   = Math.floor(
      (referenceTime.getTime() - session.startTime.getTime()) / 1000
    ) - session.pausedDuration;

    return {
      sessionId: session.sessionId,
      startTime: session.startTime,
      pausedAt:  session.pausedAt,
      elapsedTime,
      status:    session.status,
      subject:   session.subject,
      goal:      session.goal,
    };
  }

  /**
   * Get all sessions for a user with filters and pagination
   */
  async getAllSessions(userId: string, query: any): Promise<any> {
    const {
      page      = 1,
      limit     = 10,
      status, goalId, subject,
      startDate, endDate,
      sortBy    = 'startTime',
      sortOrder = 'desc',
    } = query;

    const filter: any = {
      user:   userId,
      status: { $ne: SessionStatus.CANCELLED },
    };

    if (status)  filter.status  = status;
    if (goalId)  filter.goal    = goalId;
    if (subject) filter.subject = { $regex: subject, $options: 'i' };

    if (startDate || endDate) {
      filter.startTime = {};
      if (startDate) filter.startTime.$gte = new Date(startDate);
      if (endDate)   filter.startTime.$lte = new Date(endDate);
    }

    const sort     = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    const pageNum  = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);
    const skip     = (pageNum - 1) * limitNum;

    const [sessions, total] = await Promise.all([
      studySessionRepository.findWithPagination(filter, sort, skip, limitNum),
      studySessionRepository.count(filter),
    ]);

    return {
      sessions,
      pagination: {
        total,
        page:  pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    };
  }

  /**
   * Get a single session by sessionId
   */
  async getSessionById(sessionId: string, userId: string): Promise<any> {
    const session = await studySessionRepository.findBySessionId(sessionId);
    if (!session || session.user !== userId) throw new NotFoundError('Session not found');
    return session;
  }

  /**
   * Get all sessions for today
   */
  async getTodaySessions(userId: string): Promise<any> {
    const now      = new Date();
    const sessions = await studySessionRepository.findTodaySessions(
      userId,
      getStartOfDay(now),
      getEndOfDay(now)
    );

    const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);

    return {
      sessions,
      count:                    sessions.length,
      totalDuration,
      totalDurationInMinutes:   Math.floor(totalDuration / 60),
      totalDurationInHours:     parseFloat((totalDuration / 3600).toFixed(2)),
    };
  }

  /**
   * Get session statistics for a user.
   *
   * FIX: Original fetched ALL completed sessions into memory with findAllCompleted(),
   * then ran array.filter() for today/week/month — O(n * 4) in JS.
   * For a user with 1000+ sessions this caused high memory and slow response.
   *
   * Now uses a single MongoDB aggregation pipeline that computes all breakdowns
   * on the DB side. Only the summary rows are transferred over the wire.
   */
  async getSessionStats(userId: string): Promise<any> {
    const now = new Date();

    const stats = await studySessionRepository.getStatsSummary(userId, {
      todayStart:   getStartOfDay(now),
      todayEnd:     getEndOfDay(now),
      weekStart:    getStartOfWeek(now),
      weekEnd:      getEndOfWeek(now),
      monthStart:   getStartOfMonth(now),
      monthEnd:     getEndOfMonth(now),
    });

    logger.info(`Session stats retrieved for user ${userId}`);
    return stats;
  }

  /**
   * Delete a session and subtract its hours from the linked goal
   */
  async deleteSession(sessionId: string, userId: string): Promise<void> {
    const session = await studySessionRepository.findRawBySessionId(sessionId, userId);
    if (!session) throw new NotFoundError('Session not found');

    if (session.goal && session.status === SessionStatus.COMPLETED) {
      await goalRepository.updateProgressByGoalId(
        session.goal as string,
        userId,
        -session.durationInHours
      );
      logger.info(`Subtracted ${session.durationInHours} hours from goal ${session.goal}`);
    }

    await session.deleteOne();
    logger.info(`Session deleted: ${sessionId}`);
  }
}

export default new TimerService();