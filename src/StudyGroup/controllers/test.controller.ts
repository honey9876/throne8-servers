/**
 * ====================================
 * TEST CONTROLLER (PRODUCTION-LEVEL)
 * ====================================
 * Handle all test-related operations
 */

import { Request, Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { asyncHandler } from '@/shared/utils/helpers.util';
import ResponseUtil from '@/shared/response.util';
import { NotFoundError, BadRequestError, ForbiddenError } from '@/shared/errors/app.error';
import { LoggerUtil } from '@/shared/logger.util';
import { groupMemberRepository, groupRepository } from '../repositories';
import { validId } from '@/shared/security';
import testRepository from '../repositories/test.repository';
import questionRepository from '../repositories/question.repository';

/**
 * @desc    Create new test
 * @route   POST /api/v1/tests
 * @access  Private (Group Leader/Admin)
 */
export const createTest = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { groupId, ...testData } = req.body;

  LoggerUtil.info(`Creating test for group ${groupId} by user ${userId}`, { testData });

  // Verify group exists
  // const group = await Group.findById(groupId);
  const group = await groupRepository.findByGroupId(groupId);
  if (!group) {
    throw new NotFoundError('Group not found');
  }

  // Check if user is group leader
  if (group.leaderId !== userId) {
    throw new ForbiddenError('Only group leader can create tests');
  }

  const test = await testRepository.createTest
    ({
      ...testData,
      group: groupId,
      creator: userId,
    });

  LoggerUtil.info(`Test created successfully: ${test._id}`);

  return ResponseUtil.created(res, test, 'Test created successfully');
});

/**
 * @desc    Get all tests for a group
 * @route   GET /api/v1/tests/group/:groupId
 * @access  Private (Group Members)
 */
export const getTestsByGroup = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { groupId } = req.params;
  const {
    page = 1,
    limit = 10,
    testType,
    isPublished,
    subject,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  LoggerUtil.info(`Fetching tests for group ${groupId}`);

  // Verify user is group member
  // const isMember = await GroupMember.findOne({ group: groupId, user: userId });
  const isMember = await groupMemberRepository.findActiveOne(groupId, userId!);
  if (!isMember) {
    throw new ForbiddenError('You must be a group member to view tests');
  }

  // Build filter
  const filter: any = { group: groupId };

  if (testType) filter.testType = testType;
  if (isPublished !== undefined) filter.isPublished = isPublished === 'true';
  if (subject) filter.subject = subject;

  // Pagination
  const pageNum = parseInt(page as string, 10);
  const limitNum = Number(Math.min(parseInt(limit as string, 10), 100));
  const skip = (pageNum - 1) * limitNum;

  // Sorting
  const sortField = sortBy as string;
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [tests, total] = await Promise.all([
    // Test.find(filter)
    //   .populate('creator', 'name email avatar')
    //   .sort({ [sortField]: sortDir })
    //   .skip(skip)
    //   .limit(limitNum)
    //   .lean()
    //   .exec(),
    // Test.countDocuments(filter),
    testRepository.findWithFilters(filter, skip, limit, sortField, sortDir),
    testRepository.count(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum);

  LoggerUtil.info(`Retrieved ${tests.length} tests for group ${groupId}`);

  return ResponseUtil.success(
    res,
    {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
      tests: tests
    },
    'Tests retrieved successfully',
    200,

  );
});

/**
 * @desc    Get test by ID
 * @route   GET /api/v1/tests/:testId
 * @access  Private (Group Members)
 */
export const getTestById = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { testId } = req.params;

  if (!testId || !validId(testId)) {
    LoggerUtil.warn(`Invalid test ID format: ${testId}`);
    throw new BadRequestError('Invalid test ID format');
  }

  LoggerUtil.info(`Fetching test ${testId} for user ${userId}`);

  // const test = await testRepository.findRawById(testId)
  //   .populate('creator', 'name email avatar')
  //   .populate('questions')
  //   .lean();
  const test = await testRepository.findByIdWithPopulate(testId)

  if (!test) {
    LoggerUtil.warn(`Test not found: ${testId}`);
    throw new NotFoundError('Test not found');
  }

  // Verify user is group member
  // const isMember = await GroupMember.findOne({ 
  //   group: test.group, 
  //   user: userId 
  // });
  const isMember = await groupMemberRepository.findActiveOne(test.group, userId!);

  if (!isMember) {
    throw new ForbiddenError('You must be a group member to view this test');
  }

  return ResponseUtil.success(res, test, 'Test retrieved successfully');
});

/**
 * @desc    Update test
 * @route   PUT /api/v1/tests/:testId
 * @access  Private (Creator only)
 */
export const updateTest = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { testId } = req.params;
  const updateData = req.body;

  if (!testId || !validId(testId)) {
    throw new BadRequestError('Invalid test ID format');
  }

  if (Object.keys(updateData).length === 0) {
    throw new BadRequestError('No update data provided');
  }

  LoggerUtil.info(`Updating test ${testId} by user ${userId}`);

  const test = await testRepository.findRawById(testId)

  if (!test) {
    throw new NotFoundError('Test not found');
  }

  // Only creator can update
  if (test.creator.toString() !== userId) {
    throw new ForbiddenError('Only test creator can update this test');
  }

  Object.assign(test, updateData);
  await test.save();

  LoggerUtil.info(`Test updated successfully: ${testId}`);

  return ResponseUtil.success(res, test, 'Test updated successfully');
});

/**
 * @desc    Delete test
 * @route   DELETE /api/v1/tests/:testId
 * @access  Private (Creator only)
 */
export const deleteTest = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { testId } = req.params;

  if (!testId || !validId(testId)) {
    throw new BadRequestError('Invalid test ID format');
  }

  LoggerUtil.info(`Deleting test ${testId}`);

  const test = await testRepository.findRawById(testId);

  if (!test) {
    throw new NotFoundError('Test not found');
  }

  // Only creator can delete
  if (test.creator.toString() !== userId) {
    throw new ForbiddenError('Only test creator can delete this test');
  }

  // Delete all questions associated with this test
  await questionRepository.deleteManyByTestId(testId);

  // Delete the test
  await testRepository.deleteById(testId);

  LoggerUtil.info(`Test deleted: ${testId}`);

  return ResponseUtil.noContent(res);
});

/**
 * @desc    Add question to test
 * @route   POST /api/v1/tests/:testId/questions
 * @access  Private (Creator only)
 */
export const addQuestion = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { testId } = req.params;
  const questionData = req.body;

  if (!testId || !validId(testId)) {
    throw new BadRequestError('Invalid test ID format');
  }

  LoggerUtil.info(`Adding question to test ${testId}`);

  const test = await testRepository.findRawById(testId);

  if (!test) {
    throw new NotFoundError('Test not found');
  }

  // Only creator can add questions
  if (test.creator.toString() !== userId) {
    throw new ForbiddenError('Only test creator can add questions');
  }

  // Create question
  const question = await questionRepository.createQuestion({
    ...questionData,
    test: testId,
  });

  // Add question to test

  test.totalQuestions = test.questions.length;

  // Update total marks
  test.totalMarks += questionData.marks || 0;

  await testRepository.save(test);

  LoggerUtil.info(`Question added to test: ${question._id}`);

  return ResponseUtil.created(res, question, 'Question added successfully');
});

/**
 * @desc    Update question
 * @route   PUT /api/v1/tests/:testId/questions/:questionId
 * @access  Private (Creator only)
 */
export const updateQuestion = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { testId, questionId } = req.params;
  const updateData = req.body;

  if (!testId || !validId(testId)) {
    throw new BadRequestError('Invalid test ID format');
  }

  if (!questionId || !validId(questionId)) {
    throw new BadRequestError('Invalid question ID format');
  }

  LoggerUtil.info(`Updating question ${questionId} in test ${testId}`);

  const test = await testRepository.findRawById(testId);

  if (!test) {
    throw new NotFoundError('Test not found');
  }

  // Only creator can update questions
  if (test.creator.toString() !== userId) {
    throw new ForbiddenError('Only test creator can update questions');
  }

  const question = await questionRepository.findByIdAndTestId(questionId, testId)

  if (!question) {
    throw new NotFoundError('Question not found');
  }

  // If marks are updated, adjust total marks
  if (updateData.marks && updateData.marks !== question.marks) {
    const marksDiff = updateData.marks - question.marks;
    test.totalMarks += marksDiff;
    await testRepository.save(test);
  }

  Object.assign(question, updateData);
  await questionRepository.save(question);

  LoggerUtil.info(`Question updated: ${questionId}`);

  return ResponseUtil.success(res, question, 'Question updated successfully');
});

/**
 * @desc    Delete question
 * @route   DELETE /api/v1/tests/:testId/questions/:questionId
 * @access  Private (Creator only)
 */
export const deleteQuestion = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { testId, questionId } = req.params;

  if (!testId || !validId(testId)) {
    throw new BadRequestError('Invalid test ID format');
  }

  if (!questionId || !validId(questionId)) {
    throw new BadRequestError('Invalid question ID format');
  }

  LoggerUtil.info(`Deleting question ${questionId} from test ${testId}`);

  const test = await testRepository.findRawById(testId);

  if (!test) {
    throw new NotFoundError('Test not found');
  }

  // Only creator can delete questions
  if (test.creator.toString() !== userId) {
    throw new ForbiddenError('Only test creator can delete questions');
  }

  const question = await questionRepository.findByIdAndTestId(questionId, testId);

  if (!question) {
    throw new NotFoundError('Question not found');
  }

  // ✅ FIX: Proper type casting for filter
  // test.questions = test.questions.filter(
  //   (q) => (q as mongoose.Types.ObjectId).toString() !== questionId
  // ) as mongoose.Types.ObjectId[];

  test.questions = test.questions.filter(
    (q) => q.toString() !== questionId
  ) as any[];

  test.totalQuestions = test.questions.length;
  test.totalMarks -= question.marks;

  await testRepository.save(test);

  // Delete question
  await questionRepository.deleteById(questionId);

  LoggerUtil.info(`Question deleted: ${questionId}`);

  return ResponseUtil.noContent(res);
});

/**
 * @desc    Get all questions for a test
 * @route   GET /api/v1/tests/:testId/questions
 * @access  Private (Group Members)
 */
export const getTestQuestions = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { testId } = req.params;
  const { includeAnswers = 'false' } = req.query;

  if (!testId || !validId(testId)) {
    throw new BadRequestError('Invalid test ID format');
  }

  LoggerUtil.info(`Fetching questions for test ${testId}`);

  const test = await testRepository.findRawById(testId);

  if (!test) {
    throw new NotFoundError('Test not found');
  }

  // Verify user is group member
  // const isMember = await GroupMember.findOne({
  //   group: test.group,
  //   user: userId
  // });
  const isMember = await groupMemberRepository.findActiveOne(
    test.group as string,
    userId!
  );

  if (!isMember) {
    throw new ForbiddenError('You must be a group member to view questions');
  }

  const questions = await questionRepository.findByTestId(testId);

  // Hide answers unless explicitly requested and test settings allow
  if (includeAnswers === 'false' || !test.settings.showAnswersAfterSubmit) {
    questions.forEach((q: any) => {
      delete q.correctAnswer;
      delete q.sampleAnswer;
      delete q.explanation;
    });
  }

  LoggerUtil.info(`Retrieved ${questions.length} questions`);

  return ResponseUtil.success(res, questions, 'Questions retrieved successfully');
});

/**
 * @desc    Publish test
 * @route   PATCH /api/v1/tests/:testId/publish
 * @access  Private (Creator only)
 */
export const publishTest = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { testId } = req.params;

  if (!testId || !validId(testId)) {
    throw new BadRequestError('Invalid test ID format');
  }

  LoggerUtil.info(`Publishing test ${testId}`);

  const test = await testRepository.findRawById(testId);

  if (!test) {
    throw new NotFoundError('Test not found');
  }

  // Only creator can publish
  if (test.creator.toString() !== userId) {
    throw new ForbiddenError('Only test creator can publish this test');
  }

  if (test.isPublished) {
    throw new BadRequestError('Test is already published');
  }

  // Validate test has questions
  if (!test.questions || test.questions.length === 0) {
    throw new BadRequestError('Cannot publish test without questions');
  }

  test.isPublished = true;
  test.publishedAt = new Date();
  await test.save();

  LoggerUtil.info(`Test published: ${testId}`);

  return ResponseUtil.success(res, test, 'Test published successfully');
});

/**
 * @desc    Unpublish test
 * @route   PATCH /api/v1/tests/:testId/unpublish
 * @access  Private (Creator only)
 */
export const unpublishTest = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { testId } = req.params;

  if (!testId || !validId(testId)) {
    throw new BadRequestError('Invalid test ID format');
  }

  LoggerUtil.info(`Unpublishing test ${testId}`);

  const test = await testRepository.findRawById(testId);

  if (!test) {
    throw new NotFoundError('Test not found');
  }

  // Only creator can unpublish
  if (test.creator.toString() !== userId) {
    throw new ForbiddenError('Only test creator can unpublish this test');
  }

  if (!test.isPublished) {
    throw new BadRequestError('Test is not published');
  }

  test.isPublished = false;
  await test.save();

  LoggerUtil.info(`Test unpublished: ${testId}`);

  return ResponseUtil.success(res, test, 'Test unpublished successfully');
});

/**
 * @desc    Get test statistics
 * @route   GET /api/v1/tests/:testId/stats
 * @access  Private (Creator only)
 */
export const getTestStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { testId } = req.params;

  if (!testId || !validId(testId)) {
    throw new BadRequestError('Invalid test ID format');
  }

  LoggerUtil.info(`Fetching statistics for test ${testId}`);

  const test = await testRepository.findRawById(testId);

  if (!test) {
    throw new NotFoundError('Test not found');
  }

  // Only creator can view stats
  if (test.creator.toString() !== userId) {
    throw new ForbiddenError('Only test creator can view statistics');
  }

  const questionStats = await questionRepository.getStatsByTestId(testId)
  // Question.aggregate([
  //   { $match: { test: new mongoose.Types.ObjectId(testId) } },
  //   {
  //     $group: {
  //       _id: '$difficulty',
  //       count: { $sum: 1 },
  //       totalMarks: { $sum: '$marks' },
  //     },
  //   },
  // ]);

  const stats = {
    totalQuestions: test.totalQuestions,
    totalMarks: test.totalMarks,
    passingMarks: test.passingMarks,
    duration: test.duration,
    isPublished: test.isPublished,
    questionsByDifficulty: questionStats.reduce((acc, item) => {
      acc[item._id] = {
        count: item.count,
        marks: item.totalMarks,
      };
      return acc;
    }, {} as any),
    createdAt: test.createdAt,
    publishedAt: test.publishedAt,
  };

  LoggerUtil.info(`Test stats retrieved for ${testId}`);

  return ResponseUtil.success(res, stats, 'Test statistics retrieved successfully');
});

export default {
  createTest,
  getTestsByGroup,
  getTestById,
  updateTest,
  deleteTest,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  getTestQuestions,
  publishTest,
  unpublishTest,
  getTestStats,
};