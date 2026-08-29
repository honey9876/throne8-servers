// services/doubt.service.ts

import doubtRepository from '../repositories/doubt.repository';
import answerRepository from '../repositories/answer.repository';
import groupMemberRepository from '../repositories/groupMember.repository';
import { IDoubt } from '../interfaces/IDoubt';
import { IAnswer } from '../interfaces/IAnswer';
import { NotFoundError, BadRequestError, ForbiddenError } from '@/shared/errors/app.error';
import { CreateDoubtDTO, UpdateDoubtDTO, DoubtQueryParams } from '../types/doubt.types';
import { MemberStatus } from '../interfaces/IGroupMember';

class DoubtService {

  async createDoubt(userId: string, groupId: string, data: CreateDoubtDTO): Promise<IDoubt> {
    // Membership check — string userId/groupId
    const membership = await groupMemberRepository.findActiveOne(groupId, userId);
    if (!membership) {
      throw new ForbiddenError('You must be a member of this group to post doubts');
    }

    const doubt = await doubtRepository.create({
      ...data,
      group: groupId,
      postedBy: userId,
    } as Partial<IDoubt>);

    await doubt.populate('postedBy', 'name email avatar');
    return doubt;
  }

  async getDoubtById(doubtId: string, userId?: string): Promise<IDoubt> {
    const doubt = await doubtRepository.findByDoubtId(doubtId);
    if (!doubt) throw new NotFoundError('Doubt not found');

    // View count increment — async
    if (userId && userId !== doubt.postedBy) {
      doubtRepository.update(doubt._id.toString(), { $inc: { viewCount: 1 } }).catch(() => {});
    }

    return doubt;
  }

  async getGroupDoubts(groupId: string, params: DoubtQueryParams) {
    const { category, isSolved, isUrgent, page = 1, limit = 20, sort = 'recent', search } = params;

    const filter: any = { group: groupId, isDeleted: false };
    if (category) filter.category = category;
    if (isSolved !== undefined) filter.isSolved = isSolved;
    if (isUrgent !== undefined) filter.isUrgent = isUrgent;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const sortMap: Record<string, any> = {
      oldest: { createdAt: 1 },
      mostAnswered: { answerCount: -1, createdAt: -1 },
      mostViewed: { viewCount: -1, createdAt: -1 },
      urgent: { isUrgent: -1, createdAt: -1 },
      recent: { createdAt: -1 },
    };

    const skip = (page - 1) * limit;
    const [doubts, total] = await Promise.all([
      doubtRepository.findWithPagination(filter, sortMap[sort] || sortMap.recent, skip, limit),
      doubtRepository.count(filter),
    ]);

    return {
      doubts,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  async getMyDoubts(userId: string, params: DoubtQueryParams) {
    const { page = 1, limit = 20, isSolved } = params;
    const filter: any = {};
    if (isSolved !== undefined) filter.isSolved = isSolved;

    const skip = (page - 1) * limit;
    const [doubts, total] = await Promise.all([
      doubtRepository.findByUser(userId, filter, skip, limit),
      doubtRepository.count({ postedBy: userId, isDeleted: false, ...filter }),
    ]);

    return {
      doubts,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateDoubt(doubtId: string, userId: string, data: UpdateDoubtDTO): Promise<IDoubt> {
    const doubt = await doubtRepository.findRawByDoubtId(doubtId, userId);
    if (!doubt) throw new NotFoundError('Doubt not found');
    if (doubt.postedBy !== userId) throw new ForbiddenError('You can only update your own doubts');
    if (doubt.isSolved) throw new BadRequestError('Cannot update a solved doubt');

    Object.assign(doubt, data);
    await doubt.save();
    await doubt.populate('postedBy', 'name email avatar');
    return doubt;
  }

  async deleteDoubt(doubtId: string, userId: string, isLeader: boolean = false): Promise<{ message: string }> {
    const doubt = await doubtRepository.findRawByDoubtId(doubtId);
    if (!doubt) throw new NotFoundError('Doubt not found');
    if (doubt.postedBy !== userId && !isLeader) {
      throw new ForbiddenError('You can only delete your own doubts');
    }

    await doubt.softDelete();
    await answerRepository.softDeleteByDoubt(doubtId);
    return { message: 'Doubt deleted successfully' };
  }

  async markAsSolved(doubtId: string, userId: string, bestAnswerId: string): Promise<IDoubt> {
    const doubt = await doubtRepository.findRawByDoubtId(doubtId);
    if (!doubt) throw new NotFoundError('Doubt not found');
    if (doubt.postedBy !== userId) throw new ForbiddenError('Only the doubt poster can mark it as solved');
    if (doubt.isSolved) throw new BadRequestError('Doubt is already marked as solved');

    // Answer verify karo — UUID se
    const answer = await answerRepository.findByDoubtAndAnswerId(bestAnswerId, doubtId);
    if (!answer) throw new NotFoundError('Answer not found or does not belong to this doubt');

    // Best answer mark karo
    await answerRepository.markAsBest(bestAnswerId, doubtId);

    // Doubt update karo
    doubt.isSolved = true;
    doubt.solvedAt = new Date();
    doubt.bestAnswer = bestAnswerId;
    await doubt.save();

    await doubt.populate('postedBy', 'name email avatar');
    await doubt.populate('bestAnswer');
    return doubt;
  }

  async getSolvedDoubts(groupId: string, params: DoubtQueryParams) {
    return this.getGroupDoubts(groupId, { ...params, isSolved: true });
  }

  async getUnsolvedDoubts(groupId: string, params: DoubtQueryParams) {
    return this.getGroupDoubts(groupId, { ...params, isSolved: false });
  }

  async getUrgentDoubts(groupId: string): Promise<IDoubt[]> {
    return await doubtRepository.findUrgent(groupId);
  }

  async searchDoubts(query: string, groupId?: string): Promise<IDoubt[]> {
    return await doubtRepository.searchDoubts(query, groupId);
  }

  async getDoubtsByCategory(category: string, groupId?: string): Promise<IDoubt[]> {
    return await doubtRepository.findByCategory(category, groupId);
  }

  async tagMembers(doubtId: string, userId: string, memberIds: string[]): Promise<IDoubt> {
    const doubt = await doubtRepository.findRawByDoubtId(doubtId);
    if (!doubt) throw new NotFoundError('Doubt not found');
    if (doubt.postedBy !== userId) throw new ForbiddenError('Only doubt poster can tag members');

    // Validate members — string userId comparison
    const validMembers = await groupMemberRepository.findByGroupId(doubt.group);
    const validMemberIds = validMembers.map(m => m.userId);
    const allValid = memberIds.every(id => validMemberIds.includes(id));

    if (!allValid) throw new BadRequestError('Some users are not members of this group');

    // Duplicates avoid karo
    doubt.taggedMembers = [...new Set([...doubt.taggedMembers, ...memberIds])];
    await doubt.save();
    return doubt;
  }

  async getGroupDoubtStats(groupId: string) {
    return await doubtRepository.getStatsByGroup(groupId);
  }

  async getUserDoubtStats(userId: string) {
    return await doubtRepository.getStatsByUser(userId);
  }

  // ====== ANSWER OPERATIONS ======

  async answerDoubt(doubtId: string, userId: string, content: string, links?: any[]): Promise<IAnswer> {
    const doubt = await doubtRepository.findRawByDoubtId(doubtId);
    if (!doubt) throw new NotFoundError('Doubt not found');

    const membership = await groupMemberRepository.findActiveOne(doubt.group, userId);
    if (!membership) throw new ForbiddenError('You must be a member to answer doubts');

    const answer = await answerRepository.create({
      doubt: doubtId,
      answeredBy: userId,
      content,
      links: links || [],
    } as Partial<IAnswer>);

    await answer.populate('answeredBy', 'name email avatar');
    return answer;
  }

  async getDoubtAnswers(doubtId: string, page: number = 1, limit: number = 20) {
    const [answers, total] = await Promise.all([
      answerRepository.findByDoubt(doubtId, page, limit),
      answerRepository.count({ doubt: doubtId, isDeleted: false }),
    ]);

    return {
      answers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async upvoteAnswer(answerId: string, userId: string): Promise<IAnswer> {
    const answer = await answerRepository.findByAnswerId(answerId);
    if (!answer) throw new NotFoundError('Answer not found');

    await answer.upvote(userId);
    return answer;
  }

  async downvoteAnswer(answerId: string, userId: string): Promise<IAnswer> {
    const answer = await answerRepository.findByAnswerId(answerId);
    if (!answer) throw new NotFoundError('Answer not found');

    await answer.downvote(userId);
    return answer;
  }

  async updateAnswer(answerId: string, userId: string, content: string, links?: any[]): Promise<IAnswer> {
    const answer = await answerRepository.findRawByAnswerId(answerId, userId);
    if (!answer) throw new NotFoundError('Answer not found');
    if (answer.answeredBy !== userId) throw new ForbiddenError('You can only update your own answers');

    // 1 hour check
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (answer.createdAt < oneHourAgo && !answer.isEdited) {
      throw new BadRequestError('You can only edit answers within 1 hour of posting');
    }

    answer.content = content;
    if (links) answer.links = links;
    await answer.save();
    await answer.populate('answeredBy', 'name email avatar');
    return answer;
  }

  async deleteAnswer(answerId: string, userId: string, isLeader: boolean = false): Promise<{ message: string }> {
    const answer = await answerRepository.findRawByAnswerId(answerId);
    if (!answer) throw new NotFoundError('Answer not found');
    if (answer.answeredBy !== userId && !isLeader) {
      throw new ForbiddenError('You can only delete your own answers');
    }
    if (answer.isBestAnswer) throw new BadRequestError('Cannot delete the best answer');

    await answer.softDelete();
    return { message: 'Answer deleted successfully' };
  }
}

export default new DoubtService();


// /**
//  * ====================================
//  * DOUBT SERVICE (FIXED - PRODUCTION READY)
//  * ====================================
//  */

// import Doubt from '../models/Doubt.model';
// import GroupMember from '../models/GroupMember.model';
// import { IDoubt } from '../interfaces/IDoubt';
// import { IAnswer } from '../interfaces/IAnswer';
// import { NotFoundError,  BadRequestError, ForbiddenError } from '@/shared/errors/app.error';
// import {
//   CreateDoubtDTO,
//   UpdateDoubtDTO,
//   DoubtQueryParams,
// } from '../types/doubt.types';
// import { MemberStatus } from '../interfaces/IGroupMember';
// import Answer from '../models/Answer.model';

// class DoubtService {
//   /**
//    * Create a new doubt
//    */
//   async createDoubt(
//     userId: string,
//     groupId: string,
//     data: CreateDoubtDTO
//   ): Promise<IDoubt> {
//     // Verify user is a member of the group
//     const membership = await GroupMember.findOne({
//       user: userId,
//       group: groupId,
//       status: MemberStatus.ACTIVE,
//     });

//     if (!membership) {
//       throw new ForbiddenError('You must be a member of this group to post doubts');
//     }

//     // Create doubt
//     const doubt = await Doubt.create({
//       ...data,
//       group: groupId,
//       postedBy: userId,
//     });

//     // Populate postedBy details
//     await doubt.populate('postedBy', 'name email avatar');

//     return doubt;
//   }

//   /**
//    * Get doubt by ID with full details
//    */
//   async getDoubtById(doubtId: string, userId?: string): Promise<IDoubt> {
//     const doubt = await Doubt.findById(doubtId)
//       .populate('postedBy', 'name email avatar')
//       .populate('group', 'title category')
//       .populate({
//         path: 'bestAnswer',
//         populate: {
//           path: 'answeredBy',
//           select: 'name email avatar',
//         },
//       });

//     if (!doubt) {
//       throw new NotFoundError('Doubt not found');
//     }

//     // Increment view count (async, don't wait)
//     if (userId && userId !== doubt.postedBy._id.toString()) {
//       doubt.incrementViewCount().catch(() => {});
//     }

//     return doubt;
//   }

//   /**
//    * Get all doubts in a group with filters
//    */
//   async getGroupDoubts(groupId: string, params: DoubtQueryParams) {
//     const {
//       category,
//       isSolved,
//       isUrgent,
//       page = 1,
//       limit = 20,
//       sort = 'recent',
//       search,
//     } = params;

//     const query: any = { group: groupId, isDeleted: false };

//     // Apply filters
//     if (category) query.category = category;
//     if (isSolved !== undefined) query.isSolved = isSolved;
//     if (isUrgent !== undefined) query.isUrgent = isUrgent;

//     // Search
//     if (search) {
//       query.$or = [
//         { title: { $regex: search, $options: 'i' } },
//         { description: { $regex: search, $options: 'i' } },
//         { tags: { $in: [new RegExp(search, 'i')] } },
//       ];
//     }

//     // Sorting
//     let sortOption: any = { createdAt: -1 };
//     switch (sort) {
//       case 'oldest':
//         sortOption = { createdAt: 1 };
//         break;
//       case 'mostAnswered':
//         sortOption = { answerCount: -1, createdAt: -1 };
//         break;
//       case 'mostViewed':
//         sortOption = { viewCount: -1, createdAt: -1 };
//         break;
//       case 'urgent':
//         sortOption = { isUrgent: -1, createdAt: -1 };
//         break;
//       default:
//         sortOption = { createdAt: -1 };
//     }

//     // Pagination
//     const skip = (page - 1) * limit;

//     const [doubts, total] = await Promise.all([
//       Doubt.find(query)
//         .populate('postedBy', 'name email avatar')
//         .sort(sortOption)
//         .skip(skip)
//         .limit(limit)
//         .lean(),
//       Doubt.countDocuments(query),
//     ]);

//     return {
//       doubts,
//       pagination: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//         hasNextPage: page < Math.ceil(total / limit),
//         hasPrevPage: page > 1,
//       },
//     };
//   }

//   /**
//    * Get user's own doubts
//    */
//   async getMyDoubts(userId: string, params: DoubtQueryParams) {
//     const { page = 1, limit = 20, isSolved } = params;

//     const query: any = { postedBy: userId, isDeleted: false };
//     if (isSolved !== undefined) query.isSolved = isSolved;

//     const skip = (page - 1) * limit;

//     const [doubts, total] = await Promise.all([
//       Doubt.find(query)
//         .populate('group', 'title category')
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(limit)
//         .lean(),
//       Doubt.countDocuments(query),
//     ]);

//     return {
//       doubts,
//       pagination: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//       },
//     };
//   }

//   /**
//    * Update doubt
//    */
//   async updateDoubt(
//     doubtId: string,
//     userId: string,
//     data: UpdateDoubtDTO
//   ): Promise<IDoubt> {
//     const doubt = await Doubt.findById(doubtId);

//     if (!doubt) {
//       throw new NotFoundError('Doubt not found');
//     }

//     if (doubt.postedBy.toString() !== userId) {
//       throw new ForbiddenError('You can only update your own doubts');
//     }

//     if (doubt.isSolved) {
//       throw new BadRequestError('Cannot update a solved doubt');
//     }

//     Object.assign(doubt, data);
//     await doubt.save();

//     await doubt.populate('postedBy', 'name email avatar');

//     return doubt;
//   }

//   /**
//    * Delete doubt
//    */
//   async deleteDoubt(
//     doubtId: string,
//     userId: string,
//     isLeader: boolean = false
//   ): Promise<{ message: string }> {
//     const doubt = await Doubt.findById(doubtId);

//     if (!doubt) {
//       throw new NotFoundError('Doubt not found');
//     }

//     // Only owner or group leader can delete
//     if (doubt.postedBy.toString() !== userId && !isLeader) {
//       throw new ForbiddenError('You can only delete your own doubts');
//     }

//     await doubt.softDelete();

//     // Also soft delete all answers
//     await Answer.updateMany(
//       { doubt: doubtId },
//       { isDeleted: true, deletedAt: new Date() }
//     );

//     return { message: 'Doubt deleted successfully' };
//   }

//   /**
//    * Mark doubt as solved
//    */
//   async markAsSolved(
//     doubtId: string,
//     userId: string,
//     bestAnswerId: string
//   ): Promise<IDoubt> {
//     const doubt = await Doubt.findById(doubtId);

//     if (!doubt) {
//       throw new NotFoundError('Doubt not found');
//     }

//     if (doubt.postedBy.toString() !== userId) {
//       throw new ForbiddenError('Only the doubt poster can mark it as solved');
//     }

//     if (doubt.isSolved) {
//       throw new BadRequestError('Doubt is already marked as solved');
//     }

//     // Verify answer exists and belongs to this doubt
//     const answer = await Answer.findOne({
//       _id: bestAnswerId,
//       doubt: doubtId,
//       isDeleted: false,
//     });

//     if (!answer) {
//       throw new NotFoundError('Answer not found or does not belong to this doubt');
//     }

//     // Mark answer as best (handles transaction internally)
//     await answer.markAsBest();

//     await doubt.populate('postedBy', 'name email avatar');
//     await doubt.populate('bestAnswer');

//     return doubt;
//   }

//   /**
//    * Get solved doubts
//    */
//   async getSolvedDoubts(groupId: string, params: DoubtQueryParams) {
//     return this.getGroupDoubts(groupId, { ...params, isSolved: true });
//   }

//   /**
//    * Get unsolved doubts
//    */
//   async getUnsolvedDoubts(groupId: string, params: DoubtQueryParams) {
//     return this.getGroupDoubts(groupId, { ...params, isSolved: false });
//   }

//   /**
//    * Get urgent doubts
//    */
//   async getUrgentDoubts(groupId: string) {
//     const doubts = await Doubt.find({
//       group: groupId,
//       isUrgent: true,
//       isSolved: false,
//       isDeleted: false,
//     })
//       .populate('postedBy', 'name email avatar')
//       .sort({ createdAt: -1 })
//       .limit(50)
//       .lean();

//     return doubts;
//   }

//   /**
//    * Search doubts (full-text search)
//    */
//   async searchDoubts(query: string, groupId?: string) {
//     const searchQuery: any = {
//       $text: { $search: query },
//       isDeleted: false,
//     };

//     if (groupId) {
//       searchQuery.group = groupId;
//     }

//     const doubts = await Doubt.find(searchQuery, {
//       score: { $meta: 'textScore' },
//     })
//       .populate('postedBy', 'name email avatar')
//       .populate('group', 'title')
//       .sort({ score: { $meta: 'textScore' } })
//       .limit(50)
//       .lean();

//     return doubts;
//   }

//   /**
//    * Get doubts by category
//    */
//   async getDoubtsByCategory(category: string, groupId?: string) {
//     const query: any = { category, isDeleted: false };
//     if (groupId) query.group = groupId;

//     const doubts = await Doubt.find(query)
//       .populate('postedBy', 'name email avatar')
//       .sort({ createdAt: -1 })
//       .limit(100)
//       .lean();

//     return doubts;
//   }

//   /**
//    * Tag members in doubt
//    */
//   async tagMembers(
//     doubtId: string,
//     userId: string,
//     memberIds: string[]
//   ): Promise<IDoubt> {
//     const doubt = await Doubt.findById(doubtId);

//     if (!doubt) {
//       throw new NotFoundError('Doubt not found');
//     }

//     if (doubt.postedBy.toString() !== userId) {
//       throw new ForbiddenError('Only doubt poster can tag members');
//     }

//     // Verify all members are part of the group
//     const validMembers = await GroupMember.find({
//       group: doubt.group,
//       user: { $in: memberIds },
//       status: MemberStatus.ACTIVE,
//     }).distinct('user');

//     if (validMembers.length !== memberIds.length) {
//       throw new BadRequestError('Some users are not members of this group');
//     }

//     // Add to tagged members (avoid duplicates)
//     doubt.taggedMembers = [
//       ...new Set([...doubt.taggedMembers.map(String), ...memberIds]),
//     ] as any;

//     await doubt.save();

//     return doubt;
//   }

//   /**
//    * Get doubt statistics for a group
//    */
//   async getGroupDoubtStats(groupId: string) {
//     return await Doubt.getDoubtStatsByGroup(groupId);
//   }

//   /**
//    * Get doubt statistics for a user
//    */
//   async getUserDoubtStats(userId: string) {
//     return await Doubt.getDoubtStatsByUser(userId);
//   }

//   /**
//    * Answer a doubt
//    */
//   async answerDoubt(
//     doubtId: string,
//     userId: string,
//     content: string,
//     links?: Array<{ url: string; title?: string }>
//   ): Promise<IAnswer> {
//     const doubt = await Doubt.findById(doubtId);

//     if (!doubt) {
//       throw new NotFoundError('Doubt not found');
//     }

//     // Verify user is a member
//     const membership = await GroupMember.findOne({
//       user: userId,
//       group: doubt.group,
//       status: MemberStatus.ACTIVE,
//     });

//     if (!membership) {
//       throw new ForbiddenError('You must be a member to answer doubts');
//     }

//     const answer = await Answer.create({
//       doubt: doubtId,
//       answeredBy: userId,
//       content,
//       links: links || [],
//     });

//     await answer.populate('answeredBy', 'name email avatar');

//     return answer;
//   }

//   /**
//    * Get answers for a doubt
//    */
//   async getDoubtAnswers(doubtId: string, page: number = 1, limit: number = 20) {
//     const answers = await Answer.findByDoubt(doubtId, { page, limit });
//     const total = await Answer.countDocuments({ doubt: doubtId, isDeleted: false });

//     return {
//       answers,
//       pagination: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//       },
//     };
//   }

//   /**
//    * Upvote an answer
//    */
//   async upvoteAnswer(answerId: string, userId: string): Promise<IAnswer> {
//     const answer = await Answer.findById(answerId);

//     if (!answer) {
//       throw new NotFoundError('Answer not found');
//     }

//     await answer.upvote(userId);
//     return answer;
//   }

//   /**
//    * Downvote an answer
//    */
//   async downvoteAnswer(answerId: string, userId: string): Promise<IAnswer> {
//     const answer = await Answer.findById(answerId);

//     if (!answer) {
//       throw new NotFoundError('Answer not found');
//     }

//     await answer.downvote(userId);
//     return answer;
//   }

//   /**
//    * Update answer
//    */
//   async updateAnswer(
//     answerId: string,
//     userId: string,
//     content: string,
//     links?: any[]
//   ): Promise<IAnswer> {
//     const answer = await Answer.findById(answerId);

//     if (!answer) {
//       throw new NotFoundError('Answer not found');
//     }

//     if (answer.answeredBy.toString() !== userId) {
//       throw new ForbiddenError('You can only update your own answers');
//     }

//     // Check if answer was posted within 1 hour
//     const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
//     if (answer.createdAt < oneHourAgo && !answer.isEdited) {
//       throw new BadRequestError('You can only edit answers within 1 hour of posting');
//     }

//     answer.content = content;
//     if (links) answer.links = links;

//     await answer.save();
//     await answer.populate('answeredBy', 'name email avatar');

//     return answer;
//   }

//   /**
//    * Delete answer
//    */
//   async deleteAnswer(
//     answerId: string,
//     userId: string,
//     isLeader: boolean = false
//   ): Promise<{ message: string }> {
//     const answer = await Answer.findById(answerId);

//     if (!answer) {
//       throw new NotFoundError('Answer not found');
//     }

//     if (answer.answeredBy.toString() !== userId && !isLeader) {
//       throw new ForbiddenError('You can only delete your own answers');
//     }

//     if (answer.isBestAnswer) {
//       throw new BadRequestError('Cannot delete the best answer');
//     }

//     await answer.softDelete();
//     return { message: 'Answer deleted successfully' };
//   }
// }

// export default new DoubtService();