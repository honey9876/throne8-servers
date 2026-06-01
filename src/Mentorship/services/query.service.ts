import mentorService from './mentor.service';
import { logger } from '@/shared/logger.util';
import { NotFoundError } from '@/shared/errors/app.error';
import { User } from '@/auth/models';
import { Query } from '../models';
import { BadRequestError, ForbiddenError } from '@/shared/errors/app.error';
import { generateSecureId } from '@/shared/security';
import queryRepository from '../repositories/query.repository';
import queryValidator from '../validations/query.validator';
import mentorRepository from '../repositories/mentor.repository';

interface SubmitQueryInput {
  mentorId: string;
  menteeId: string;
  question: string;
  context?: string;
  attachments?: string[];
  category?: string;
  priority?: 'normal' | 'high';
  transactionId?: string;
}

class QueryService {
  /**
   * Submit a new query
   */
  async submitQuery(input: SubmitQueryInput, authToken?: string): Promise<any> {
    try {
      logger.info(`Submitting query to mentor ${input.mentorId}`);

      // Validate mentor exists
      const mentor = await mentorService.getMentorById(input.mentorId, authToken);
      if (!mentor) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      // Verify mentee exists
      await User.findByUserId(input.menteeId)

      // Get pricing
      const amount = mentor.pricing?.askQuery || 199;

      // Create query
      const query = new Query({
        queryId: generateSecureId(), // Generate unique queryId UUID
        mentorId: input.mentorId,
        menteeId: input.menteeId,
        question: input.question,
        context: input.context,
        attachments: input.attachments,
        category: input.category,
        priority: input.priority || 'normal',
        status: 'pending',
        pricing: {
          amount,
          currency: 'INR',
          transactionId: input.transactionId,
          paidAt: input.transactionId ? new Date() : undefined,
        },
      });

      await query.save();

      logger.info(`Query submitted successfully: ${query._id}`);

      // TODO: Send notification to mentor

      // return query;
      return query.toObject();
    } catch (error: any) {
      logger.error('Failed to submit query:', error);
      throw error;
    }
  }

  /**
   * Get query by ID
   */
  async getQueryById(queryId: string, userId?: string, _authToken?: string): Promise<any> {
    try {
      // const query = await Query.findById(queryId);
      // ✅ Fix — queryId (UUID) se dhundho
      const query = await queryRepository.findByQueryId(queryId);
      if (!query) {
        throw new NotFoundError('QUERY_NOT_FOUND');
      }

      // Check access permission
      if (userId && query.mentorId !== userId && query.menteeId !== userId) {
        throw new ForbiddenError(
          'UNAUTHORIZED_ACCESS'
        );
      }

      return query;
    } catch (error: any) {
      logger.error('Failed to fetch query:', error);
      throw error;
    }
  }

  /**
   * Get all queries for a user
   */
  async getAllQueries(
    userId: string,
    role: 'mentor' | 'mentee',
    page: number = 1,
    limit: number = 10,
    status?: string,
    _authToken?: string
  ): Promise<{
    queries: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const query: any = {};

      // Role-based filter
      if (role === 'mentor') {
        query.mentorId = userId;
      } else {
        query.menteeId = userId;
      }

      // Status filter
      if (status) {
        query.status = status;
      }

      const skip = (page - 1) * limit;

      // const [queries, total] = await Promise.all([
      //   Query.find(query)
      //     .sort({ createdAt: -1 })
      //     .skip(skip)
      //     .limit(limit)
      //     .lean(),
      //   Query.countDocuments(query),
      // ]);

      const [queries, total] = await Promise.all([
        queryRepository.findAll(query, skip, limit),
        queryRepository.count(query),
      ]);

      return {
        queries,
        total,
        page,
        limit,
      };
    } catch (error: any) {
      logger.error('Failed to fetch queries:', error);
      throw error;
    }
  }

  /**
   * Get pending queries for mentor
   */
  async getPendingQueries(mentorId: string, _authToken?: string): Promise<any[]> {
    try {
      // const queries = await Query.find({
      //   mentorId,
      //   status: 'pending',
      // })
      //   .sort({ priority: -1, createdAt: 1 })
      //   .lean();

      const queries = await queryRepository.findPendingByMentorId(mentorId);

      return queries;
    } catch (error: any) {
      logger.error('Failed to fetch pending queries:', error);
      throw error;
    }
  }

  /**
   * Answer a query (mentor only)
   * 🔴 FIXED: Proper string comparison
   */
  async answerQuery(
    queryId: string,
    userId: string,      // ye User ka userId hai (auth se aata hai)
    answer: string,
    authToken?: string
  ): Promise<any> {
    try {
      // ✅ Pehle userId se mentor dhundo
      const mentor = await mentorRepository.findByUserId(userId);

      if (!mentor) {
        throw new ForbiddenError('Only mentors can answer queries');
      }

      const mentorId = mentor.mentorId; // "25cb9b21-8dae-4f4f-b650-67df3e00bc4e"

      // ✅ Ab getQueryById ko mentorId se call karo, userId se nahi
      const query = await this.getQueryById(queryId, mentorId, authToken);

      if (query.mentorId !== mentorId) {
        throw new ForbiddenError('Only the mentor can answer this query');
      }

      if (query.status !== 'pending') {
        throw new BadRequestError('Query has already been answered or expired');
      }

      await query.answerQuery(answer);

      logger.info(`Query answered: ${queryId}`);
      return query;

    } catch (error: any) {
      logger.error('Failed to answer query:', error);
      throw error;
    }
  }

  /**
   * Submit follow-up question (mentee only)
   * 🔴 FIXED: Proper string comparison
   */
  async submitFollowUp(
    queryId: string,
    menteeId: string,
    question: string,
    authToken?: string
  ): Promise<any> {
    try {
      const query = await this.getQueryById(queryId, menteeId, authToken);

      // 🔴 FIX: Direct string comparison
      if (query.menteeId !== menteeId) {
        throw new ForbiddenError(
          'Only the mentee can submit a follow-up'
        );
      }

      if (query.status !== 'answered') {
        throw new BadRequestError(
          'Can only submit follow-up for answered queries'
        );
      }

      if (query.followUp?.askedAt) {
        throw new BadRequestError(
          'Follow-up already submitted'
        );
      }

      await query.addFollowUp(question);

      logger.info(`Follow-up submitted for query: ${queryId}`);

      // TODO: Notify mentor

      return query;
    } catch (error: any) {
      logger.error('Failed to submit follow-up:', error);
      throw error;
    }
  }

  /**
   * Answer follow-up question (mentor only)
   * 🔴 FIXED: Proper string comparison
   */
  async answerFollowUp(queryId: string, userId: string, answer: string, authToken?: string) {
    try {
      const mentor = await mentorRepository.findByUserId(userId);
      if (!mentor) throw new ForbiddenError('Only mentors can answer queries');

      const mentorId = mentor.mentorId;
      const query = await this.getQueryById(queryId, mentorId, authToken);

      // 🔴 FIX: Direct string comparison
      if (query.mentorId !== mentorId) {
        throw new ForbiddenError(
          'Only the mentor can answer the follow-up'
        );
      }

      if (!query.followUp?.question) {
        throw new BadRequestError(
          'No follow-up question found'
        );
      }

      if (query.followUp.answeredAt) {
        throw new BadRequestError(
          'Follow-up already answered'
        );
      }

      await query.answerFollowUp(answer);

      logger.info(`Follow-up answered for query: ${queryId}`);

      // TODO: Notify mentee

      return query;
    } catch (error: any) {
      logger.error('Failed to answer follow-up:', error);
      throw error;
    }
  }

  /**
   * Add feedback to query
   * 🔴 FIXED: Proper string comparison
   */
  async addFeedback(
    queryId: string,
    menteeId: string,
    rating: number,
    comment?: string,
    authToken?: string
  ): Promise<any> {
    try {
      const query = await this.getQueryById(queryId, menteeId, authToken);

      // 🔴 FIX: Direct string comparison
      if (query.menteeId !== menteeId) {
        throw new ForbiddenError(
          'Only the mentee can provide feedback'
        );
      }

      if (query.status !== 'answered') {
        throw new BadRequestError(
          'Can only provide feedback for answered queries'
        );
      }

      if (query.feedback) {
        throw new BadRequestError(
          'Feedback already submitted'
        );
      }

      await query.addFeedback(rating, comment);

      logger.info(`Feedback added for query: ${queryId}`);

      return query;
    } catch (error: any) {
      logger.error('Failed to add feedback:', error);
      throw error;
    }
  }

  /**
   * Get query statistics
   */
  async getQueryStats(
    userId: string,
    role: 'mentor' | 'mentee',
    _authToken?: string
  ): Promise<any> {
    try {
      const matchField = role === 'mentor' ? 'mentorId' : 'menteeId';

      // const stats = 
      // await Query.aggregate([
      //   { $match: { [matchField]: userId } },
      //   {
      //     $group: {
      //       _id: null,
      //       total: { $sum: 1 },
      //       pending: {
      //         $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
      //       },
      //       answered: {
      //         $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] },
      //       },
      //       expired: {
      //         $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] },
      //       },
      //       totalRevenue: { $sum: '$pricing.amount' },
      //       avgRating: { $avg: '$feedback.rating' },
      //     },
      //   },
      // ]);

      // return stats[0] || {
      //   total: 0,
      //   pending: 0,
      //   answered: 0,
      //   expired: 0,
      //   totalRevenue: 0,
      //   avgRating: 0,
      // };

      return await queryRepository.getStatsByUserId(userId, role);

    } catch (error: any) {
      logger.error('Failed to fetch query stats:', error);
      throw error;
    }
  }

  /**
   * Mark expired queries
   */
  async markExpiredQueries(): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago

      // const result = await Query.updateMany(
      //   {
      //     status: 'pending',
      //     createdAt: { $lt: cutoffDate },
      //   },
      //   {
      //     $set: { status: 'expired' },
      //   }
      // );

      // ✅ REPLACE WITH
      return await queryRepository.markExpired(cutoffDate);

      // logger.info(`Marked ${result.modifiedCount} queries as expired`);

      // return result.modifiedCount;
    } catch (error: any) {
      logger.error('Failed to mark expired queries:', error);
      throw error;
    }
  }
}

export default new QueryService();