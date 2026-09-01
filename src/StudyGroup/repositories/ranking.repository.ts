// repositories/ranking.repository.ts

import { BaseRepository } from './base.repository';
import Ranking from '../models/Ranking.model';
import { IRanking } from '../interfaces/IRanking';
import { GroupCategory } from '../enums/GroupCategory.enum';

export class RankingRepository extends BaseRepository<IRanking> {
  constructor() {
    super(Ranking);
  }

  // userId UUID se find
  async findByUserId(userId: string): Promise<IRanking | null> {
    try {
      return await this.model.findOne({ userId }).exec();
    } catch (error: any) {
      throw new Error(`Error finding ranking by userId: ${error}`);
    }
  }

  // Populate ke saath find
  async findByUserIdWithPopulate(userId: string): Promise<IRanking | null> {
    try {
      return await this.model
        .findOne({ userId })
        .populate('userId', 'name avatar')
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding ranking with populate: ${error}`);
    }
  }

  // getOrCreate
  async getOrCreate(userId: string): Promise<IRanking> {
    try {
      let ranking = await this.findByUserId(userId);
      if (!ranking) {
        ranking = await this.create({
          userId,
          globalRank: 0,
          categoryRank: 0,
          groupRank: 0,
          cityRank: 0,
          rankScore: 0,
        } as Partial<IRanking>);
      }
      return ranking;
    } catch (error: any) {
      throw new Error(`Error in getOrCreate ranking: ${error}`);
    }
  }

  // Global leaderboard — pagination
  async getGlobalLeaderboard(skip: number, limit: number): Promise<IRanking[]> {
    try {
      return await this.model
        .find({ globalRank: { $gt: 0 } })
        .sort({ globalRank: 1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name avatar')
        .lean()
        .exec() as unknown as IRanking[];
    } catch (error: any) {
      throw new Error(`Error getting global leaderboard: ${error}`);
    }
  }

  // Category leaderboard
  async getCategoryLeaderboard(
    category: GroupCategory,
    skip: number,
    limit: number
  ): Promise<IRanking[]> {
    try {
      return await this.model
        .find({ category, categoryRank: { $gt: 0 } })
        .sort({ categoryRank: 1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name avatar')
        .lean()
        .exec() as unknown as IRanking[];
    } catch (error: any) {
      throw new Error(`Error getting category leaderboard: ${error}`);
    }
  }

  // Group members ke liye rankings
  async getGroupMemberRankings(userIds: string[], skip: number, limit: number): Promise<IRanking[]> {
    try {
      return await this.model
        .find({ userId: { $in: userIds } })
        .sort({ rankScore: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name avatar')
        .lean()
        .exec() as unknown as IRanking[];
    } catch (error: any) {
      throw new Error(`Error getting group member rankings: ${error}`);
    }
  }

  // Weekly leaderboard
  async getWeeklyLeaderboard(skip: number, limit: number): Promise<IRanking[]> {
    try {
      return await this.model
        .find({ weeklyHours: { $gt: 0 } })
        .sort({ weeklyHours: -1, rankScore: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name avatar')
        .lean()
        .exec() as unknown as IRanking[];
    } catch (error: any) {
      throw new Error(`Error getting weekly leaderboard: ${error}`);
    }
  }

  // Monthly leaderboard
  async getMonthlyLeaderboard(skip: number, limit: number): Promise<IRanking[]> {
    try {
      return await this.model
        .find({ monthlyHours: { $gt: 0 } })
        .sort({ monthlyHours: -1, rankScore: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name avatar')
        .lean()
        .exec() as unknown as IRanking[];
    } catch (error: any) {
      throw new Error(`Error getting monthly leaderboard: ${error}`);
    }
  }

  // Count
  async count(filter: any): Promise<number> {
    try {
      return await this.model.countDocuments(filter).exec();
    } catch (error: any) {
      throw new Error(`Error counting rankings: ${error}`);
    }
  }

  // Nearby ranks — 1 above, 1 below
  async findByGlobalRank(rank: number): Promise<IRanking | null> {
    try {
      return await this.model
        .findOne({ globalRank: rank })
        .populate('userId', 'name avatar')
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding ranking by rank: ${error}`);
    }
  }

  // Bulk update ranks
  async bulkUpdateRanks(updates: { id: string; rank: number; field: string }[]): Promise<void> {
    try {
      const bulkOps = updates.map(u => ({
        updateOne: {
          filter: { _id: u.id },
          update: { $set: { [u.field]: u.rank } },
        },
      }));
      if (bulkOps.length > 0) {
        await this.model.bulkWrite(bulkOps);
      }
    } catch (error: any) {
      throw new Error(`Error bulk updating ranks: ${error}`);
    }
  }

  // Category ke distinct values — rank recalculate ke liye
  async getDistinctCities(): Promise<string[]> {
    try {
      return await this.model.distinct('city', { city: { $ne: '' } });
    } catch (error: any) {
      throw new Error(`Error getting distinct cities: ${error}`);
    }
  }

  // All ranked documents — recalculation ke liye
  async findAllRankedByScore(filter: any = {}): Promise<{ _id: string }[]> {
    try {
      return await this.model
        .find({ rankScore: { $gt: 0 }, ...filter })
        .sort({ rankScore: -1 })
        .select('_id')
        .lean()
        .exec() as unknown as { _id: string }[];
    } catch (error: any) {
      throw new Error(`Error finding ranked documents: ${error}`);
    }
  }
}

export default new RankingRepository();