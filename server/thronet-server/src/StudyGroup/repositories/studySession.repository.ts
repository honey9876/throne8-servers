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

}

export default new StudySessionRepository();