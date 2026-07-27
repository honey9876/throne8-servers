// repositories/query.repository.ts

import { Query } from '../models';
import { logger } from '@/shared/logger.util';

class QueryRepository {

  /**
   * Find by queryId (UUID) - External/Public
   */
  async findByQueryId(queryId: string): Promise<any | null> {
  return await Query.findOne({ queryId });
}
  /**
   * Find by ObjectId - Internal only
   */
  async findById(objectId: string): Promise<any | null> {
    return await Query.findById(objectId).lean();
  }

  /**
   * Create query
   */
  async create(data: any): Promise<any> {
    const query = new Query(data);
    await query.save();
    return query.toObject();
  }

  /**
   * Find all queries with filters
   */
  async findAll(
    filter: any,
    skip: number,
    limit: number
  ): Promise<any[]> {
    return await Query.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  /**
   * Count documents
   */
  async count(filter: any): Promise<number> {
    return await Query.countDocuments(filter);
  }

  /**
   * Find pending queries by mentorId (UUID)
   */
  async findPendingByMentorId(mentorId: string): Promise<any[]> {
    return await Query.find({
      mentorId,
      status: 'pending',
    })
      .sort({ priority: -1, createdAt: 1 })
      .lean();
  }

  /**
   * Update by queryId (UUID)
   */
  async updateByQueryId(queryId: string, updates: any): Promise<any | null> {
    const query = await Query.findOne({ queryId });
    if (!query) return null;

    Object.assign(query, updates);
    await query.save();
    return query.toObject();
  }

  /**
   * Get stats by userId (mentor or mentee)
   */
  async getStatsByUserId(
    userId: string,
    role: 'mentor' | 'mentee'
  ): Promise<any> {
    const matchField = role === 'mentor' ? 'mentorId' : 'menteeId';

    const stats = await Query.aggregate([
      { $match: { [matchField]: userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          answered: {
            $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] },
          },
          expired: {
            $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] },
          },
          totalRevenue: { $sum: '$pricing.amount' },
          avgRating: { $avg: '$feedback.rating' },
        },
      },
    ]);

    return stats[0] || {
      total: 0, pending: 0, answered: 0,
      expired: 0, totalRevenue: 0, avgRating: 0,
    };
  }

  /**
   * Mark expired queries (bulk update)
   */
  async markExpired(cutoffDate: Date): Promise<number> {
    const result = await Query.updateMany(
      { status: 'pending', createdAt: { $lt: cutoffDate } },
      { $set: { status: 'expired' } }
    );
    return result.modifiedCount;
  }
}

export default new QueryRepository();