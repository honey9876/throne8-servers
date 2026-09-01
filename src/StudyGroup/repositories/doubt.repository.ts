// repositories/doubt.repository.ts

import { BaseRepository } from './base.repository';
import Doubt from '../models/Doubt.model';
import { IDoubt } from '../interfaces/IDoubt';

export class DoubtRepository extends BaseRepository<IDoubt> {
  constructor() {
    super(Doubt);
  }

  // doubtId UUID se find
  async findByDoubtId(doubtId: string): Promise<IDoubt | null> {
    try {
      return await this.model
        .findOne({ doubtId })
        .populate('postedBy', 'name email avatar')
        .populate('group', 'title category')
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding doubt by doubtId: ${error}`);
    }
  }

  // Raw — save() mutations ke liye
  async findRawByDoubtId(doubtId: string, userId?: string): Promise<IDoubt | null> {
    try {
      const filter: any = { doubtId };
      if (userId) filter.postedBy = userId;
      return await this.model.findOne(filter).exec();
    } catch (error: any) {
      throw new Error(`Error finding raw doubt: ${error}`);
    }
  }

  async findByGroup(
    groupId: string,
    options: { isSolved?: boolean; limit?: number; sort?: any } = {}
  ): Promise<IDoubt[]> {
    try {
      const query: any = { group: groupId, isDeleted: false };
      if (options.isSolved !== undefined) query.isSolved = options.isSolved;
      return await this.model
        .find(query)
        .populate('postedBy', 'name email avatar')
        .sort(options.sort || { createdAt: -1 })
        .limit(options.limit || 50)
        .exec() as IDoubt[];
    } catch (error: any) {
      throw new Error(`Error finding doubts by group: ${error}`);
    }
  }

  async findWithPagination(
    filter: any,
    sort: any,
    skip: number,
    limit: number
  ): Promise<IDoubt[]> {
    try {
      return await this.model
        .find(filter)
        .populate('postedBy', 'name email avatar')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec() as IDoubt[];
    } catch (error: any) {
      throw new Error(`Error finding doubts with pagination: ${error}`);
    }
  }

  async findByUser(
    userId: string,
    filter: any = {},
    skip: number = 0,
    limit: number = 20
  ): Promise<IDoubt[]> {
    try {
      return await this.model
        .find({ postedBy: userId, isDeleted: false, ...filter })
        .populate('group', 'title category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec() as IDoubt[];
    } catch (error: any) {
      throw new Error(`Error finding doubts by user: ${error}`);
    }
  }

  async findUrgent(groupId: string): Promise<IDoubt[]> {
    try {
      return await this.model
        .find({ group: groupId, isUrgent: true, isSolved: false, isDeleted: false })
        .populate('postedBy', 'name email avatar')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
        .exec() as IDoubt[];
    } catch (error: any) {
      throw new Error(`Error finding urgent doubts: ${error}`);
    }
  }

  async searchDoubts(query: string, groupId?: string): Promise<IDoubt[]> {
    try {
      const searchQuery: any = { $text: { $search: query }, isDeleted: false };
      if (groupId) searchQuery.group = groupId;
      return await this.model
        .find(searchQuery, { score: { $meta: 'textScore' } })
        .populate('postedBy', 'name email avatar')
        .populate('group', 'title')
        .sort({ score: { $meta: 'textScore' } })
        .limit(50)
        .lean()
        .exec() as IDoubt[];
    } catch (error: any) {
      throw new Error(`Error searching doubts: ${error}`);
    }
  }

  async findByCategory(category: string, groupId?: string): Promise<IDoubt[]> {
    try {
      const query: any = { category, isDeleted: false };
      if (groupId) query.group = groupId;
      return await this.model
        .find(query)
        .populate('postedBy', 'name email avatar')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
        .exec() as IDoubt[];
    } catch (error: any) {
      throw new Error(`Error finding doubts by category: ${error}`);
    }
  }

  // Aggregate — string match, no ObjectId wrap
  async getStatsByGroup(groupId: string): Promise<any> {
    try {
      const stats = await this.model.aggregate([
        { $match: { group: groupId, isDeleted: false } },    // string — no ObjectId
        {
          $group: {
            _id: null,
            totalDoubts: { $sum: 1 },
            solvedDoubts: { $sum: { $cond: [{ $eq: ['$isSolved', true] }, 1, 0] } },
            unsolvedDoubts: { $sum: { $cond: [{ $eq: ['$isSolved', false] }, 1, 0] } },
            urgentDoubts: { $sum: { $cond: [{ $eq: ['$isUrgent', true] }, 1, 0] } },
            totalAnswers: { $sum: '$answerCount' },
            totalViews: { $sum: '$viewCount' },
            avgAnswersPerDoubt: { $avg: '$answerCount' },
            avgViewsPerDoubt: { $avg: '$viewCount' },
          },
        },
      ]);
      return stats[0] || {};
    } catch (error: any) {
      throw new Error(`Error getting doubt stats by group: ${error}`);
    }
  }

  async getStatsByUser(userId: string): Promise<any> {
    try {
      const stats = await this.model.aggregate([
        { $match: { postedBy: userId, isDeleted: false } },  // string — no ObjectId
        {
          $group: {
            _id: null,
            totalDoubtsPosted: { $sum: 1 },
            solvedDoubts: { $sum: { $cond: [{ $eq: ['$isSolved', true] }, 1, 0] } },
            unsolvedDoubts: { $sum: { $cond: [{ $eq: ['$isSolved', false] }, 1, 0] } },
            totalAnswersReceived: { $sum: '$answerCount' },
            totalViews: { $sum: '$viewCount' },
          },
        },
      ]);
      return stats[0] || {};
    } catch (error: any) {
      throw new Error(`Error getting doubt stats by user: ${error}`);
    }
  }

  async softDelete(doubtId: string): Promise<void> {
    try {
      await this.model.updateMany(
        { doubtId },
        { $set: { isDeleted: true, deletedAt: new Date() } }
      );
    } catch (error: any) {
      throw new Error(`Error soft deleting doubt: ${error}`);
    }
  }
}

export default new DoubtRepository();