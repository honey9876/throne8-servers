// repositories/studySession.repository.ts

import { BaseRepository } from './base.repository';
import StudySession from '../models/StudySession.model';
import { IStudySession, SessionStatus } from '../interfaces/IStudySession';

export class StudySessionRepository extends BaseRepository<IStudySession> {
  constructor() {
    super(StudySession);
  }

  // Active session fetch karo — timer control ke liye
  async findActiveSession(userId: string): Promise<IStudySession | null> {
    try {
      return await this.model.findOne({
        user: userId,
        status: { $in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] },
      }).exec();
    } catch (error: any) {
      throw new Error(`Error finding active session: ${error}`);
    }
  }

  async cancelAllActive(userId: string): Promise<any> {
    try {
      return await this.model.updateMany(
        { user: userId, status: { $in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] } },
        { $set: { status: SessionStatus.CANCELLED } }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error cancelling active sessions: ${error}`);
    }
  }

  // Specific status se active session
  async findByStatus(userId: string, status: SessionStatus): Promise<IStudySession | null> {
    try {
      return await this.model.findOne({ user: userId, status }).exec();
    } catch (error: any) {
      throw new Error(`Error finding session by status: ${error}`);
    }
  }

  // sessionId UUID se fetch
  async findBySessionId(sessionId: string): Promise<IStudySession | null> {
    try {
      return await this.model
        .findOne({ sessionId })
        .populate('goal', 'title targetHours currentHours')
        .lean()
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding session by sessionId: ${error}`);
    }
  }

  // Raw session — save() ke liye
  async findRawBySessionId(sessionId: string, userId: string): Promise<IStudySession | null> {
    try {
      return await this.model.findOne({ sessionId, user: userId }).exec();
    } catch (error: any) {
      throw new Error(`Error finding raw session: ${error}`);
    }
  }

  // Pagination ke saath sessions fetch
  async findWithPagination(
    filter: any,
    sort: any,
    skip: number,
    limit: number
  ): Promise<IStudySession[]> {
    try {
      return await this.model
        .find(filter)
        .populate('goal', 'title targetHours currentHours')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec() as unknown as IStudySession[];
    } catch (error: any) {
      throw new Error(`Error finding sessions: ${error}`);
    }
  }

  // Count
  async count(filter: any): Promise<number> {
    try {
      return await this.model.countDocuments(filter).exec();
    } catch (error: any) {
      throw new Error(`Error counting sessions: ${error}`);
    }
  }

  // Today's completed sessions
  async findTodaySessions(userId: string, startOfDay: Date, endOfDay: Date): Promise<IStudySession[]> {
    try {
      return await this.model
        .find({
          user: userId,
          status: SessionStatus.COMPLETED,
          startTime: { $gte: startOfDay, $lte: endOfDay },
        })
        .populate('goal', 'title')
        .sort({ startTime: -1 })
        .lean()
        .exec() as unknown as IStudySession[];
    } catch (error: any) {
      throw new Error(`Error finding today sessions: ${error}`);
    }
  }

  // All completed sessions — stats ke liye
  async findAllCompleted(userId: string): Promise<IStudySession[]> {
    try {
      return await this.model
        .find({ user: userId, status: SessionStatus.COMPLETED })
        .lean()
        .exec() as unknown as IStudySession[];
    } catch (error: any) {
      throw new Error(`Error finding completed sessions: ${error}`);
    }
  }

  // Active session with goal populated
  async findActiveWithGoal(userId: string): Promise<IStudySession | null> {
    try {
      return await this.model
        .findOne({ user: userId, status: { $in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] } })
        .populate('goal', 'title')
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding active session with goal: ${error}`);
    }
  }

  async getTodayHours(userId: string, startOfDay: Date, endOfDay: Date): Promise<number> {
    const result = await this.model.aggregate([
      {
        $match: {
          user: userId,
          status: SessionStatus.COMPLETED,
          createdAt: { $gte: startOfDay, $lt: endOfDay },
        },
      },
      { $group: { _id: null, totalHours: { $sum: '$duration' } } },
    ]);
    return result[0]?.totalHours || 0;
  }

  async getTotalHoursByGroupId(groupId: string): Promise<number> {
    const GroupMember = (await import('../models/GroupMember.model')).default;
    const members = await GroupMember.find({ groupId, status: 'active' }).select('userId').lean();
    const userIds = members.map((m: any) => m.userId);

    const result = await this.model.aggregate([
      { $match: { user: { $in: userIds }, status: SessionStatus.COMPLETED } },
      { $group: { _id: null, totalHours: { $sum: '$duration' } } },
    ]);
    return result[0]?.totalHours || 0;
  }

  async getTodayHoursByGroupId(groupId: string, startOfDay: Date, endOfDay: Date): Promise<number> {
    const GroupMember = (await import('../models/GroupMember.model')).default;
    const members = await GroupMember.find({ groupId, status: 'active' }).select('userId').lean();
    const userIds = members.map((m: any) => m.userId);

    const result = await this.model.aggregate([
      {
        $match: {
          user: { $in: userIds },
          status: SessionStatus.COMPLETED,
          createdAt: { $gte: startOfDay, $lt: endOfDay },
        },
      },
      { $group: { _id: null, totalHours: { $sum: '$duration' } } },
    ]);
    return result[0]?.totalHours || 0;
  }

  async getDailyStats(userId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return await this.model.aggregate([
      {
        $match: {
          user: userId,
          status: SessionStatus.COMPLETED,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sessions: { $sum: 1 },
          totalHours: { $sum: '$duration' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  async getTotalHoursAll(): Promise<number> {
    const result = await this.model.aggregate([
      { $match: { status: SessionStatus.COMPLETED } },
      { $group: { _id: null, totalHours: { $sum: '$duration' } } },
    ]);
    return result[0]?.totalHours || 0;
  }

  async getTodayHoursAll(startOfDay: Date, endOfDay: Date): Promise<number> {
    const result = await this.model.aggregate([
      {
        $match: {
          status: SessionStatus.COMPLETED,
          createdAt: { $gte: startOfDay, $lt: endOfDay },
        },
      },
      { $group: { _id: null, totalHours: { $sum: '$duration' } } },
    ]);
    return result[0]?.totalHours || 0;
  }

  async getDailyActivityGrowth(startDate: Date, endDate: Date): Promise<any[]> {
    return await this.model.aggregate([
      {
        $match: {
          status: SessionStatus.COMPLETED,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sessions: { $sum: 1 },
          totalHours: { $sum: '$duration' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  async getStatsSummary(userId: string, dates: any): Promise<any> {
    const { todayStart, todayEnd, weekStart, weekEnd, monthStart, monthEnd } = dates;
    
    const result = await this.model.aggregate([
      { $match: { user: userId, status: SessionStatus.COMPLETED } },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          todayDuration: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$startTime', todayStart] }, { $lte: ['$startTime', todayEnd] }] },
                '$duration',
                0
              ]
            }
          },
          weekDuration: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$startTime', weekStart] }, { $lte: ['$startTime', weekEnd] }] },
                '$duration',
                0
              ]
            }
          },
          monthDuration: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$startTime', monthStart] }, { $lte: ['$startTime', monthEnd] }] },
                '$duration',
                0
              ]
            }
          }
        }
      }
    ]);
    
    if (!result || result.length === 0) {
      return {
        totalSessions: 0,
        totalHours: 0,
        todayHours: 0,
        weekHours: 0,
        monthHours: 0
      };
    }
    
    const stats = result[0];
    return {
      totalSessions: stats.totalSessions,
      totalHours: parseFloat((stats.totalDuration / 3600).toFixed(2)),
      todayHours: parseFloat((stats.todayDuration / 3600).toFixed(2)),
      weekHours: parseFloat((stats.weekDuration / 3600).toFixed(2)),
      monthHours: parseFloat((stats.monthDuration / 3600).toFixed(2))
    };
  }
}

export default new StudySessionRepository();