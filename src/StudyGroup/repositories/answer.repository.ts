// repositories/answer.repository.ts

import { BaseRepository } from './base.repository';
import Answer from '../models/Answer.model';
import { IAnswer } from '../interfaces/IAnswer';

export class AnswerRepository extends BaseRepository<IAnswer> {
  constructor() {
    super(Answer);
  }

  // answerId UUID se find
  async findByAnswerId(answerId: string): Promise<IAnswer | null> {
    try {
      return await this.model.findOne({ answerId }).exec();
    } catch (error: any) {
      throw new Error(`Error finding answer by answerId: ${error}`);
    }
  }

  // Raw — save() mutations ke liye
  async findRawByAnswerId(answerId: string, userId?: string): Promise<IAnswer | null> {
    try {
      const filter: any = { answerId };
      if (userId) filter.answeredBy = userId;
      return await this.model.findOne(filter).exec();
    } catch (error: any) {
      throw new Error(`Error finding raw answer: ${error}`);
    }
  }

  // Doubt ke sab answers — paginated
  async findByDoubt(doubtId: string, page: number = 1, limit: number = 20): Promise<IAnswer[]> {
    try {
      const skip = (page - 1) * limit;
      return await this.model
        .find({ doubt: doubtId, isDeleted: false })
        .populate('answeredBy', 'name email avatar')
        .sort({ isBestAnswer: -1, upvotes: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec() as unknown as IAnswer[];
    } catch (error: any) {
      throw new Error(`Error finding answers by doubt: ${error}`);
    }
  }

  // doubtId + answerId se find — markAsSolved ke liye
  async findByDoubtAndAnswerId(answerId: string, doubtId: string): Promise<IAnswer | null> {
    try {
      return await this.model
        .findOne({ answerId, doubt: doubtId, isDeleted: false })
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding answer by doubt and answerId: ${error}`);
    }
  }

  // Upvote — string userId
  async addUpvote(answerId: string, userId: string): Promise<IAnswer | null> {
    try {
      return await this.model.findOneAndUpdate(
        { answerId, upvotedBy: { $ne: userId } },
        {
          $addToSet: { upvotedBy: userId },
          $pull: { downvotedBy: userId },
          $inc: { upvotes: 1 },
        },
        { new: true }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error adding upvote: ${error}`);
    }
  }

  // Downvote — string userId
  async addDownvote(answerId: string, userId: string): Promise<IAnswer | null> {
    try {
      return await this.model.findOneAndUpdate(
        { answerId, downvotedBy: { $ne: userId } },
        {
          $addToSet: { downvotedBy: userId },
          $pull: { upvotedBy: userId },
          $inc: { downvotes: 1 },
        },
        { new: true }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error adding downvote: ${error}`);
    }
  }

  // Remove vote
  async removeVote(answerId: string, userId: string): Promise<IAnswer | null> {
    try {
      const answer = await this.model.findOne({ answerId }).exec();
      if (!answer) return null;

      const wasUpvoted = answer.upvotedBy.includes(userId);
      const wasDownvoted = answer.downvotedBy.includes(userId);

      return await this.model.findOneAndUpdate(
        { answerId },
        {
          $pull: { upvotedBy: userId, downvotedBy: userId },
          $inc: {
            upvotes: wasUpvoted ? -1 : 0,
            downvotes: wasDownvoted ? -1 : 0,
          },
        },
        { new: true }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error removing vote: ${error}`);
    }
  }

  // Best answer mark karo — doubt update ke saath
  async markAsBest(answerId: string, doubtId: string): Promise<IAnswer | null> {
    try {
      // Pehle sab answers ka isBestAnswer false karo
      await this.model.updateMany(
        { doubt: doubtId },
        { $set: { isBestAnswer: false, markedBestAt: null } }
      );

      // Phir ye answer best mark karo
      return await this.model.findOneAndUpdate(
        { answerId },
        { $set: { isBestAnswer: true, markedBestAt: new Date() } },
        { new: true }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error marking answer as best: ${error}`);
    }
  }

  // Soft delete
  async softDeleteAnswer(answerId: string): Promise<void> {
    try {
      await this.model.findOneAndUpdate(
        { answerId },
        { $set: { isDeleted: true, deletedAt: new Date() } }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error soft deleting answer: ${error}`);
    }
  }

  // Doubt ke sab answers soft delete — doubt delete pe
  async softDeleteByDoubt(doubtId: string): Promise<void> {
    try {
      await this.model.updateMany(
        { doubt: doubtId },
        { $set: { isDeleted: true, deletedAt: new Date() } }
      );
    } catch (error: any) {
      throw new Error(`Error soft deleting answers by doubt: ${error}`);
    }
  }

  // Stats — string userId, no ObjectId wrap
  async getStatsByUser(userId: string): Promise<any> {
    try {
      const stats = await this.model.aggregate([
        { $match: { answeredBy: userId, isDeleted: false } },  // string — no ObjectId
        {
          $group: {
            _id: null,
            totalAnswers: { $sum: 1 },
            bestAnswers: { $sum: { $cond: [{ $eq: ['$isBestAnswer', true] }, 1, 0] } },
            totalUpvotes: { $sum: '$upvotes' },
            totalDownvotes: { $sum: '$downvotes' },
            avgUpvotes: { $avg: '$upvotes' },
            highestUpvotes: { $max: '$upvotes' },
          },
        },
      ]);
      return stats[0] || {};
    } catch (error: any) {
      throw new Error(`Error getting answer stats by user: ${error}`);
    }
  }
}

export default new AnswerRepository();