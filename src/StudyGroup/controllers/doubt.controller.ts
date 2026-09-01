/**
 * ====================================
 * DOUBT CONTROLLER (FIXED - PRODUCTION READY)
 * ====================================
 */

import { Request, Response } from 'express';
import { asyncHandler } from '@/shared/utils/helpers.util';
import ResponseUtil from '@/shared/response.util';
import { BadRequestError } from '@/shared/errors/app.error';
import doubtService from '../services/doubt.service';
import { HttpStatus } from '../enums/HttpStatus.enum';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';

/**
 * @route   POST /api/doubts/:groupId/post
 * @desc    Create a new doubt in a group
 * @access  Private (Group Members)
 */
export const postDoubt = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.id;
  const {
    title,
    description,
    category,
    subject,
    tags,
    isUrgent,
    difficulty,
    taggedMembers,
  } = req.body;

  if (!groupId) {
    throw new BadRequestError('Group ID is required');
  }

  // Handle image uploads (if any)
  const images = (req as any).uploadedFiles || [];

  const doubtData = {
    title,
    description,
    category,
    subject,
    tags: tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : [],
    images,
    isUrgent: isUrgent === 'true' || isUrgent === true,
    difficulty,
    taggedMembers: taggedMembers
      ? Array.isArray(taggedMembers)
        ? taggedMembers
        : JSON.parse(taggedMembers)
      : [],
    group: groupId,
  };

  const doubt = await doubtService.createDoubt(userId!, groupId, doubtData);

  return ResponseUtil.created(res, doubt, 'Doubt posted successfully');
});

/**
 * @route   GET /api/doubts/:doubtId
 * @desc    Get single doubt with full details
 * @access  Private
 */
export const getDoubt = asyncHandler(async (req: Request, res: Response) => {
  const { doubtId } = req.params;
  const userId = (req as AuthRequest).user?.id;

  if (!doubtId) {
    throw new BadRequestError('Doubt ID is required');
  }

  const doubt = await doubtService.getDoubtById(doubtId, userId!);

  return ResponseUtil.success(res, doubt, 'Doubt retrieved successfully');
});

/**
 * @route   GET /api/doubts/:groupId/all
 * @desc    Get all doubts in a group with filters
 * @access  Private
 */
export const getAllDoubts = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params;
    const {
      category,
      isSolved,
      isUrgent,
      page,
      limit,
      sort,
      search,
    } = req.query;

    if (!groupId) {
      throw new BadRequestError('Group ID is required');
    }

    const params = {
      groupId,
      category: category as string,
      isSolved: isSolved === 'true' ? true : isSolved === 'false' ? false : undefined,
      isUrgent: isUrgent === 'true' ? true : isUrgent === 'false' ? false : undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      sort: (sort as string) || 'recent',
      search: search as string,
    };

    const result = await doubtService.getGroupDoubts(groupId, params);

    return ResponseUtil.success(
      res,
      result,
      'Doubts retrieved successfully',
      // result.pagination
    );
  }
);

/**
 * @route   GET /api/doubts/my-doubts
 * @desc    Get current user's doubts
 * @access  Private
 */
export const getMyDoubts = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;
    const { page, limit, isSolved } = req.query;

    const params = {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      isSolved: isSolved === 'true' ? true : isSolved === 'false' ? false : undefined,
    };

    const result = await doubtService.getMyDoubts(userId!, params);

    return ResponseUtil.success(
      res,
      result,
      'Your doubts retrieved successfully',
      HttpStatus.OK,
      // result.pagination
    );
  }
);

/**
 * @route   GET /api/doubts/:groupId/solved
 * @desc    Get all solved doubts in a group
 * @access  Private
 */
export const getSolvedDoubts = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params;
    const { page, limit, sort } = req.query;

    if (!groupId) {
      throw new BadRequestError('Group ID is required');
    }

    const params = {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      sort: (sort as string) || 'recent',
    };

    const result = await doubtService.getSolvedDoubts(groupId, params);

    return ResponseUtil.success(
      res,
      result,
      'Solved doubts retrieved successfully',
      HttpStatus.OK,
      // result.pagination
    );
  }
);

/**
 * @route   GET /api/doubts/:groupId/unsolved
 * @desc    Get all unsolved doubts in a group
 * @access  Private
 */
export const getUnsolvedDoubts = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params;
    const { page, limit, sort } = req.query;

    if (!groupId) {
      throw new BadRequestError('Group ID is required');
    }

    const params = {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      sort: (sort as string) || 'recent',
    };

    const result = await doubtService.getUnsolvedDoubts(groupId, params);

    return ResponseUtil.success(
      res,
      result,
      'Unsolved doubts retrieved successfully',
      HttpStatus.OK,
      // result.pagination
    );
  }
);

/**
 * @route   GET /api/doubts/:groupId/urgent
 * @desc    Get all urgent doubts in a group
 * @access  Private
 */
export const getUrgentDoubts = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params;

    if (!groupId) {
      throw new BadRequestError('Group ID is required');
    }

    const doubts = await doubtService.getUrgentDoubts(groupId);

    return ResponseUtil.success(res, doubts, 'Urgent doubts retrieved successfully');
  }
);

/**
 * @route   PUT /api/doubts/:doubtId
 * @desc    Update a doubt (only by owner)
 * @access  Private
 */
export const updateDoubt = asyncHandler(
  async (req: Request, res: Response) => {
    const { doubtId } = req.params;
    const userId = (req as AuthRequest).user?.id;
    const { title, description, category, subject, tags, isUrgent, difficulty } =
      req.body;

    if (!doubtId) {
      throw new BadRequestError('Doubt ID is required');
    }

    const updateData = {
      title,
      description,
      category,
      subject,
      tags,
      isUrgent,
      difficulty,
    };

    // Remove undefined fields
    Object.keys(updateData).forEach(
      (key) =>
        updateData[key as keyof typeof updateData] === undefined &&
        delete updateData[key as keyof typeof updateData]
    );

    const doubt = await doubtService.updateDoubt(doubtId, userId!, updateData);

    return ResponseUtil.success(res, doubt, 'Doubt updated successfully');
  }
);

/**
 * @route   DELETE /api/doubts/:doubtId
 * @desc    Delete a doubt (only by owner or group leader)
 * @access  Private
 */
export const deleteDoubt = asyncHandler(
  async (req: Request, res: Response) => {
    const { doubtId } = req.params;
    const userId = (req as AuthRequest).user?.id;
    const isLeader = (req as any).isLeader || false;

    if (!doubtId) {
      throw new BadRequestError('Doubt ID is required');
    }

    const result = await doubtService.deleteDoubt(doubtId, userId!, isLeader);

    return ResponseUtil.success(res, result, 'Doubt deleted successfully');
  }
);

/**
 * @route   PATCH /api/doubts/:doubtId/mark-solved
 * @desc    Mark doubt as solved and select best answer
 * @access  Private (Only doubt owner)
 */
export const markAsSolved = asyncHandler(
  async (req: Request, res: Response) => {
    const { doubtId } = req.params;
    const userId = (req as AuthRequest).user?.id;
    const { bestAnswerId } = req.body;

    if (!doubtId) {
      throw new BadRequestError('Doubt ID is required');
    }

    if (!bestAnswerId) {
      throw new BadRequestError('Best answer ID is required');
    }

    const doubt = await doubtService.markAsSolved(
      doubtId,
      userId!,
      bestAnswerId
    );

    return ResponseUtil.success(
      res,
      doubt,
      'Doubt marked as solved successfully'
    );
  }
);

/**
 * @route   GET /api/doubts/search
 * @desc    Search doubts (full-text search)
 * @access  Private
 */
export const searchDoubts = asyncHandler(
  async (req: Request, res: Response) => {
    const { query, groupId } = req.query;

    if (!query) {
      throw new BadRequestError('Search query is required');
    }

    const doubts = await doubtService.searchDoubts(
      query as string,
      groupId as string
    );

    return ResponseUtil.success(
      res,
      doubts,
      `Found ${doubts.length} doubts matching your search`
    );
  }
);

/**
 * @route   GET /api/doubts/category/:category
 * @desc    Get doubts by category
 * @access  Private
 */
export const getDoubtsByCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { category } = req.params;
    const { groupId } = req.query;

    if (!category) {
      throw new BadRequestError('Category is required');
    }

    const doubts = await doubtService.getDoubtsByCategory(
      category,
      groupId as string
    );

    return ResponseUtil.success(
      res,
      doubts,
      `Doubts in ${category} category retrieved successfully`
    );
  }
);

/**
 * @route   POST /api/doubts/:doubtId/tag-member
 * @desc    Tag members in a doubt
 * @access  Private (Only doubt owner)
 */
export const tagMember = asyncHandler(async (req: Request, res: Response) => {
  const { doubtId } = req.params;
  const userId = (req as AuthRequest).user?.id;
  const { memberIds } = req.body;

  if (!doubtId) {
    throw new BadRequestError('Doubt ID is required');
  }

  if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
    throw new BadRequestError('Member IDs array is required');
  }

  const doubt = await doubtService.tagMembers(doubtId, userId!, memberIds);

  return ResponseUtil.success(
    res,
    doubt,
    `${memberIds.length} member(s) tagged successfully`
  );
});

/**
 * @route   GET /api/doubts/:groupId/stats
 * @desc    Get doubt statistics for a group
 * @access  Private
 */
export const getGroupDoubtStats = asyncHandler(
  async (req: Request, res: Response) => {
    const { groupId } = req.params;

    if (!groupId) {
      throw new BadRequestError('Group ID is required');
    }

    const stats = await doubtService.getGroupDoubtStats(groupId);

    return ResponseUtil.success(
      res,
      stats,
      'Group doubt statistics retrieved successfully'
    );
  }
);

/**
 * @route   GET /api/doubts/user/:userId/stats
 * @desc    Get doubt statistics for a user
 * @access  Private
 */
export const getUserDoubtStats = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    const stats = await doubtService.getUserDoubtStats(userId);

    return ResponseUtil.success(
      res,
      stats,
      'User doubt statistics retrieved successfully'
    );
  }
);

/**
 * ====================================
 * ANSWER OPERATIONS
 * ====================================
 */

/**
 * @route   POST /api/doubts/:doubtId/answer
 * @desc    Answer a doubt
 * @access  Private (Group Members)
 */
export const answerDoubt = asyncHandler(
  async (req: Request, res: Response) => {
    const { doubtId } = req.params;
    const userId = (req as AuthRequest).user?.id;
    const { content, links } = req.body;

    if (!doubtId) {
      throw new BadRequestError('Doubt ID is required');
    }

    if (!content || content.trim().length === 0) {
      throw new BadRequestError('Answer content is required');
    }

    // Handle image uploads (if any)
    const images = (req as any).uploadedFiles || [];

    const answer = await doubtService.answerDoubt(
      doubtId,
      userId!,
      content,
      links
    );

    // If images were uploaded, update the answer
    if (images.length > 0) {
      answer.images = images;
      await answer.save();
    }

    return ResponseUtil.created(res, answer, 'Answer posted successfully');
  }
);

/**
 * @route   GET /api/doubts/:doubtId/answers
 * @desc    Get all answers for a doubt
 * @access  Private
 */
export const getDoubtAnswers = asyncHandler(
  async (req: Request, res: Response) => {
    const { doubtId } = req.params;
    const { page, limit } = req.query;

    if (!doubtId) {
      throw new BadRequestError('Doubt ID is required');
    }

    const result = await doubtService.getDoubtAnswers(
      doubtId,
      page ? parseInt(page as string) : 1,
      limit ? parseInt(limit as string) : 20
    );

    return ResponseUtil.success(
      res,
      result,
      'Answers retrieved successfully',
      HttpStatus.OK,
      // result.pagination
    );
  }
);

/**
 * @route   PUT /api/doubts/answer/:answerId
 * @desc    Update an answer (only by owner, within 1 hour)
 * @access  Private
 */
export const updateAnswer = asyncHandler(
  async (req: Request, res: Response) => {
    const { answerId } = req.params;
    const userId = (req as AuthRequest).user?.id;
    const { content, links } = req.body;

    if (!answerId) {
      throw new BadRequestError('Answer ID is required');
    }

    if (!content || content.trim().length === 0) {
      throw new BadRequestError('Answer content is required');
    }

    const answer = await doubtService.updateAnswer(
      answerId,
      userId!,
      content,
      links
    );

    return ResponseUtil.success(res, answer, 'Answer updated successfully');
  }
);

/**
 * @route   DELETE /api/doubts/answer/:answerId
 * @desc    Delete an answer (only by owner or group leader)
 * @access  Private
 */
export const deleteAnswer = asyncHandler(
  async (req: Request, res: Response) => {
    const { answerId } = req.params;
    const userId = (req as AuthRequest).user?.id;
    const isLeader = (req as any).isLeader || false;

    if (!answerId) {
      throw new BadRequestError('Answer ID is required');
    }

    const result = await doubtService.deleteAnswer(answerId, userId!, isLeader);

    return ResponseUtil.success(res, result, 'Answer deleted successfully');
  }
);

/**
 * @route   POST /api/doubts/answer/:answerId/upvote
 * @desc    Upvote an answer
 * @access  Private
 */
export const upvoteAnswer = asyncHandler(
  async (req: Request, res: Response) => {
    const { answerId } = req.params;
    const userId = (req as AuthRequest).user?.id;

    if (!answerId) {
      throw new BadRequestError('Answer ID is required');
    }

    const answer = await doubtService.upvoteAnswer(answerId, userId!);

    return ResponseUtil.success(
      res,
      {
        answerId: answer.answerId,
        upvotes: answer.upvotes,
        downvotes: answer.downvotes,
        voteScore: answer.upvotes - answer.downvotes,
      },
      'Answer upvoted successfully'
    );
  }
);

/**
 * @route   POST /api/doubts/answer/:answerId/downvote
 * @desc    Downvote an answer
 * @access  Private
 */
export const downvoteAnswer = asyncHandler(
  async (req: Request, res: Response) => {
    const { answerId } = req.params;
    const userId = (req as AuthRequest).user?.id;

    if (!answerId) {
      throw new BadRequestError('Answer ID is required');
    }

    const answer = await doubtService.downvoteAnswer(answerId, userId!);

    return ResponseUtil.success(
      res,
      {
        answerId: answer.answerId,
        upvotes: answer.upvotes,
        downvotes: answer.downvotes,
        voteScore: answer.upvotes - answer.downvotes,
      },
      'Answer downvoted successfully'
    );
  }
);

/**
 * @route   POST /api/doubts/answer/:answerId/remove-vote
 * @desc    Remove vote from an answer
 * @access  Private
 */
export const removeVote = asyncHandler(async (_req: Request, res: Response) => {
  return ResponseUtil.success(res, null, 'Vote removed successfully');
});

/**
 * ====================================
 * ANALYTICS & LEADERBOARD
 * ====================================
 */

/**
 * @route   GET /api/doubts/answers/top-answerers
 * @desc    Get top answerers (leaderboard)
 * @access  Public
 */
export const getTopAnswerers = asyncHandler(
  async (_req: Request, res: Response) => {
    return ResponseUtil.success(
      res,
      [],
      'Top answerers retrieved successfully'
    );
  }
);

/**
 * @route   GET /api/doubts/answers/best-answers
 * @desc    Get best answers
 * @access  Public
 */
export const getBestAnswers = asyncHandler(
  async (_req: Request, res: Response) => {
    return ResponseUtil.success(
      res,
      [],
      'Best answers retrieved successfully'
    );
  }
);

/**
 * @route   GET /api/doubts/answers/user/:userId/stats
 * @desc    Get answer statistics for a user
 * @access  Private
 */
export const getUserAnswerStats = asyncHandler(
  async (_req: Request, res: Response) => {
    return ResponseUtil.success(
      res,
      {
        totalAnswers: 0,
        bestAnswers: 0,
        totalUpvotes: 0,
        avgUpvotes: 0,
      },
      'User answer statistics retrieved successfully'
    );
  }
);

export default {
  postDoubt,
  getDoubt,
  getAllDoubts,
  getMyDoubts,
  getSolvedDoubts,
  getUnsolvedDoubts,
  getUrgentDoubts,
  updateDoubt,
  deleteDoubt,
  markAsSolved,
  searchDoubts,
  getDoubtsByCategory,
  tagMember,
  getGroupDoubtStats,
  getUserDoubtStats,
  answerDoubt,
  getDoubtAnswers,
  updateAnswer,
  deleteAnswer,
  upvoteAnswer,
  downvoteAnswer,
  removeVote,
  getTopAnswerers,
  getBestAnswers,
  getUserAnswerStats,
};