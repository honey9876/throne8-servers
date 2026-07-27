/**
 * ====================================
 * ASSIGNMENT CONTROLLER (PRODUCTION-LEVEL)
 * ====================================
 * Handle all assignment-related operations
 */

import { Request, Response } from 'express';
import { Assignment, AssignmentSubmission } from '../models/Assignment.model';
import { asyncHandler } from '@/shared/utils/helpers.util';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import { NotFoundError, BadRequestError, ForbiddenError } from '@/shared/errors/app.error';
import mongoose from 'mongoose';
import Group from '../models/Group.model';
import GroupMember from '../models/GroupMember.model';
import { getDaysRemaining, isExpired } from '../utils/dateHelper';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { groupMemberRepository, groupRepository } from '../repositories';
import { validId } from '@/shared/security';
import assignmentRepository from '../repositories/assignment.repository';
import assignmentSubmissionRepository from '../repositories/assignmentSubmission.repository';

/**
 * @desc    Create new assignment
 * @route   POST /api/v1/assignments
 * @access  Private (Group Leader/Admin)
 */
export const createAssignment = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { groupId, ...assignmentData } = req.body;

  LoggerUtil.info(`Creating assignment for group ${groupId} by user ${userId}`, { assignmentData });

  // Verify group exists
  // const group = await Group.findById(groupId);
  const group = await groupRepository.findByGroupId(groupId);
  if (!group) {
    throw new NotFoundError('Group not found');
  }

  // Check if user is group leader
  if (group.leaderId !== userId) {
    throw new ForbiddenError('Only group leader can create assignments');
  }

  // const assignment = await Assignment.create({
  //   ...assignmentData,
  //   group: groupId,
  //   creator: userId,
  // });
  const assignment = await assignmentRepository.createAssignment({
    ...assignmentData,
    group: groupId,
    creator: userId,
  });

  LoggerUtil.info(`Assignment created successfully: ${assignment.assignmentId}`);

  return ResponseUtil.created(res, assignment, 'Assignment created successfully');
});

/**
 * @desc    Get all assignments for a group
 * @route   GET /api/v1/assignments/group/:groupId
 * @access  Private (Group Members)
 */
export const getAssignmentsByGroup = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { groupId } = req.params;
  const {
    page = 1,
    limit = 10,
    status,
    assignmentType,
    subject,
    sortBy = 'dueDate',
    sortOrder = 'asc',
  } = req.query;

  LoggerUtil.info(`Fetching assignments for group ${groupId}`);

  // Verify user is group member
  const isMember = await groupMemberRepository.findActiveOne(groupId, userId!);
  if (!isMember) {
    throw new ForbiddenError('You must be a group member to view assignments');
  }

  // Build filter
  const filter: any = { group: groupId, isActive: true };

  if (assignmentType) filter.assignmentType = assignmentType;
  if (subject) filter.subject = subject;

  // Status filter
  const now = new Date();
  if (status === 'active') {
    filter.dueDate = { $gte: now };
  } else if (status === 'overdue') {
    filter.dueDate = { $lt: now };
  }

  // Pagination
  const pageNum = parseInt(page as string, 10);
  const limitNum = Math.min(parseInt(limit as string, 10), 100);
  const skip = (pageNum - 1) * limitNum;

  // Sorting
  const sortField = sortBy as string;
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [assignments, total] = await Promise.all([
    assignmentRepository.findWithFilters(filter, skip, limitNum, sortField, sortDir),
    assignmentRepository.countByFilter(filter),
  ]);

  // Check submission status for current user
  const assignmentIds = assignments.map((a: any) => a.assignmentId);
  const userSubmissions = await assignmentSubmissionRepository.findByAssignmentIdsAndStudent(
    assignmentIds,
    userId!
  )

  const submissionMap = new Map(
    userSubmissions.map((s: any) => [s.assignment, s])
  );

  // Enhance assignments with user-specific data
  const enhancedAssignments = assignments.map((assignment: any) => {
    const submission = submissionMap.get(assignment.assignmentId.toString());
    return {
      ...assignment,
      hasSubmitted: !!submission,
      mySubmission: submission,
      isOverdue: isExpired(assignment.dueDate),
      daysRemaining: getDaysRemaining(assignment.dueDate),
    };
  });

  const totalPages = Math.ceil(total / limitNum);

  LoggerUtil.info(`Retrieved ${assignments.length} assignments for group ${groupId}`);

  return ResponseUtil.success(
    res,
    {
      data: enhancedAssignments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    },
    'Assignments retrieved successfully',
  );
});

/**
 * @desc    Get assignment by ID
 * @route   GET /api/v1/assignments/:assignmentId
 * @access  Private (Group Members)
 */
export const getAssignmentById = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { assignmentId } = req.params;

  if (!assignmentId || !validId(assignmentId)) {
    LoggerUtil.warn(`Invalid assignment ID format: ${assignmentId}`);
    throw new BadRequestError('Invalid assignment ID format');
  }

  LoggerUtil.info(`Fetching assignment ${assignmentId} for user ${userId}`);

  const assignment = await assignmentRepository.findByIdWithPopulate(assignmentId);

  if (!assignment) {
    LoggerUtil.warn(`Assignment not found: ${assignmentId}`);
    throw new NotFoundError('Assignment not found');
  }

  // Verify user is group member
  const isMember = await groupMemberRepository.findActiveOne(
    assignment.group as string, userId!
  );

  if (!isMember) {
    throw new ForbiddenError('You must be a group member to view this assignment');
  }

  // Get user's submission if exists
  const mySubmission = await assignmentSubmissionRepository.findByAssignmentAndStudent(
    assignmentId, userId!
  );

  const enhancedAssignment = {
    ...assignment,
    hasSubmitted: !!mySubmission,
    mySubmission,
    isOverdue: isExpired(assignment.dueDate),
    daysRemaining: getDaysRemaining(assignment.dueDate),
  };

  return ResponseUtil.success(res, enhancedAssignment, 'Assignment retrieved successfully');
});

/**
 * @desc    Update assignment
 * @route   PUT /api/v1/assignments/:assignmentId
 * @access  Private (Creator only)
 */
export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { assignmentId } = req.params;
  const updateData = req.body;

  if (!assignmentId || !validId(assignmentId)) {
    throw new BadRequestError('Invalid assignment ID format');
  }

  if (Object.keys(updateData).length === 0) {
    throw new BadRequestError('No update data provided');
  }

  LoggerUtil.info(`Updating assignment ${assignmentId} by user ${userId}`);

  const assignment = await assignmentRepository.findRawById(assignmentId);

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  // Only creator can update
  if (assignment.creator.toString() !== userId) {
    throw new ForbiddenError('Only assignment creator can update this assignment');
  }

  Object.assign(assignment, updateData);
  await assignmentRepository.save(assignment);

  LoggerUtil.info(`Assignment updated successfully: ${assignmentId}`);

  return ResponseUtil.success(res, assignment, 'Assignment updated successfully');
});

/**
 * @desc    Delete assignment
 * @route   DELETE /api/v1/assignments/:assignmentId
 * @access  Private (Creator only)
 */
export const deleteAssignment = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { assignmentId } = req.params;

  if (!assignmentId || !validId(assignmentId)) {
    throw new BadRequestError('Invalid assignment ID format');
  }

  LoggerUtil.info(`Deleting assignment ${assignmentId}`);

  const assignment = await assignmentRepository.findRawById(assignmentId);

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  // Only creator can delete
  if (assignment.creator.toString() !== userId) {
    throw new ForbiddenError('Only assignment creator can delete this assignment');
  }

  // Soft delete
  assignment.isActive = false;
  await assignmentRepository.save(assignment);

  LoggerUtil.info(`Assignment deleted: ${assignmentId}`);

  return ResponseUtil.noContent(res);
});

/**
 * @desc    Submit assignment
 * @route   POST /api/v1/assignments/:assignmentId/submit
 * @access  Private (Group Members)
 */
export const submitAssignment = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { assignmentId } = req.params;
  const { submissionText } = req.body;
  const files = req.files as Express.Multer.File[];

  if (!assignmentId || !validId(assignmentId)) {
    throw new BadRequestError('Invalid assignment ID format');
  }

  LoggerUtil.info(`Submitting assignment ${assignmentId} by user ${userId}`);

  const assignment = await assignmentRepository.findRawById(assignmentId);

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  if (!assignment.isActive) {
    throw new BadRequestError('This assignment is no longer accepting submissions');
  }

  // Verify user is group member
  const isMember = await groupMemberRepository.findActiveOne(
    assignment.group as string, userId!
  );

  if (!isMember) {
    throw new ForbiddenError('You must be a group member to submit');
  }

  // Check if already submitted
  const existingSubmission = await assignmentSubmissionRepository.findByAssignmentAndStudent(
    assignmentId, userId!
  );

  if (existingSubmission) {
    throw new BadRequestError('You have already submitted this assignment');
  }

  // Check if late
  const isLate = isExpired(assignment.dueDate);

  if (isLate && !assignment.lateSubmissionAllowed) {
    throw new BadRequestError('Assignment deadline has passed');
  }

  // Process uploaded files
  const submittedFiles = files?.map((file) => ({
    fileName: file.originalname,
    fileUrl: file.path, // Replace with actual cloud storage URL
    fileType: file.mimetype,
    uploadedAt: new Date(),
  })) || [];

  // Create submission
  const submission = await assignmentSubmissionRepository.createSubmission({
    assignment: assignmentId,
    student: userId,
    submittedFiles,
    submissionText,
    isLate,
  });

  // Add submission to assignment
  assignment.submissions.push(submission._id as any);
  assignment.totalSubmissions = assignment.submissions.length;
  await assignmentRepository.save(assignment);

  LoggerUtil.info(`Assignment submitted: ${submission._id}`);

  return ResponseUtil.created(res, submission, 'Assignment submitted successfully');
});

/**
 * @desc    Grade assignment submission
 * @route   PATCH /api/v1/assignments/:assignmentId/submissions/:submissionId/grade
 * @access  Private (Creator only)
 */
export const gradeSubmission = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { assignmentId, submissionId } = req.params;
  const { marksObtained, feedback } = req.body;

  if (!assignmentId || !validId(assignmentId)) {
    throw new BadRequestError('Invalid assignment ID format');
  }

  if (!submissionId || !validId(submissionId)) {
    throw new BadRequestError('Invalid submission ID format');
  }

  LoggerUtil.info(`Grading submission ${submissionId}`);

  const assignment = await assignmentRepository.findRawById(assignmentId);

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  // Only creator can grade
  if (assignment.creator.toString() !== userId) {
    throw new ForbiddenError('Only assignment creator can grade submissions');
  }

  const submission = await assignmentSubmissionRepository.findBySubmissionIdAndAssignmentId(
    submissionId, assignmentId
  );

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }

  // Validate marks
  if (marksObtained > assignment.totalMarks) {
    throw new BadRequestError('Marks obtained cannot exceed total marks');
  }

  // Apply late penalty if applicable
  let finalMarks = marksObtained;
  if (submission.isLate && assignment.latePenalty) {
    const penalty = (marksObtained * assignment.latePenalty) / 100;
    finalMarks = Math.max(0, marksObtained - penalty);
  }

  submission.marksObtained = finalMarks;
  submission.feedback = feedback;
  submission.gradedBy = new mongoose.Types.ObjectId(userId) as any;
  submission.gradedAt = new Date();
  submission.status = 'graded';

  await assignmentSubmissionRepository.save(submission);

  LoggerUtil.info(`Submission graded: ${submissionId}`);

  return ResponseUtil.success(res, submission, 'Submission graded successfully');
});

/**
 * @desc    Get all submissions for an assignment
 * @route   GET /api/v1/assignments/:assignmentId/submissions
 * @access  Private (Creator only)
 */
export const getAssignmentSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { assignmentId } = req.params;
  const {
    page = 1,
    limit = 10,
    status,
    sortBy = 'submittedAt',
    sortOrder = 'desc',
  } = req.query;

  if (!assignmentId || !validId(assignmentId)) {
    throw new BadRequestError('Invalid assignment ID format');
  }

  LoggerUtil.info(`Fetching submissions for assignment ${assignmentId}`);

  const assignment = await assignmentRepository.findRawById(assignmentId);

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  // Only creator can view all submissions
  if (assignment.creator.toString() !== userId) {
    throw new ForbiddenError('Only assignment creator can view all submissions');
  }

  // Build filter
  const filter: any = { assignment: assignmentId };

  if (status) filter.status = status;

  // Pagination
  const pageNum = parseInt(page as string, 10);
  const limitNum = Math.min(parseInt(limit as string, 10), 100);
  const skip = (pageNum - 1) * limitNum;

  // Sorting
  const sortField = sortBy as string;
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [submissions, total] = await Promise.all([
    assignmentSubmissionRepository.findWithFilters(filter, skip, limitNum, sortField, sortDir),
    assignmentSubmissionRepository.countByFilter(filter),
  ]);

  const totalPages = Math.ceil(total / limitNum);

  LoggerUtil.info(`Retrieved ${submissions.length} submissions`);

  return ResponseUtil.success(
    res,
    {
      data: submissions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    },
    'Submissions retrieved successfully',
  );
});

/**
 * @desc    Get my submission for an assignment
 * @route   GET /api/v1/assignments/:assignmentId/my-submission
 * @access  Private (Group Members)
 */
export const getMySubmission = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { assignmentId } = req.params;

  if (!assignmentId || !validId(assignmentId)) {
    throw new BadRequestError('Invalid assignment ID format');
  }

  LoggerUtil.info(`Fetching submission for assignment ${assignmentId} by user ${userId}`);

  const assignment = await assignmentRepository.findRawById(assignmentId);

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  // Verify user is group member
  const isMember = await groupMemberRepository.findActiveOne(
    assignment.group as string, userId!
  );

  if (!isMember) {
    throw new ForbiddenError('You must be a group member to view your submission');
  }

  const submission = await assignmentSubmissionRepository.findMySubmission(
    assignmentId, userId!
  );

  if (!submission) {
    throw new NotFoundError('You have not submitted this assignment yet');
  }

  return ResponseUtil.success(res, submission, 'Submission retrieved successfully');
});

/**
 * @desc    Get assignment statistics
 * @route   GET /api/v1/assignments/:assignmentId/stats
 * @access  Private (Creator only)
 */
export const getAssignmentStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const { assignmentId } = req.params;

  if (!assignmentId || !validId(assignmentId)) {
    throw new BadRequestError('Invalid assignment ID format');
  }

  LoggerUtil.info(`Fetching statistics for assignment ${assignmentId}`);

  const assignment = await assignmentRepository.findRawById(assignmentId);

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  // Only creator can view stats
  if (assignment.creator.toString() !== userId) {
    throw new ForbiddenError('Only assignment creator can view statistics');
  }

  // const [
  //   totalSubmissions,
  //   pendingSubmissions,
  //   gradedSubmissions,
  //   lateSubmissions,
  //   averageMarks,
  // ] = await Promise.all([
  //   AssignmentSubmission.countDocuments({ assignment: assignmentId }),
  //   AssignmentSubmission.countDocuments({
  //     assignment: assignmentId,
  //     status: 'submitted'
  //   }),
  //   AssignmentSubmission.countDocuments({
  //     assignment: assignmentId,
  //     status: 'graded'
  //   }),
  //   AssignmentSubmission.countDocuments({
  //     assignment: assignmentId,
  //     isLate: true
  //   }),
  //   AssignmentSubmission.aggregate([
  //     {
  //       $match: {
  //         assignment: new mongoose.Types.ObjectId(assignmentId),
  //         status: 'graded',
  //       }
  //     },
  //     {
  //       $group: {
  //         _id: null,
  //         averageMarks: { $avg: '$marksObtained' },
  //         highestMarks: { $max: '$marksObtained' },
  //         lowestMarks: { $min: '$marksObtained' },
  //       },
  //     },
  //   ]),
  // ]);

  const stats = await assignmentSubmissionRepository.getStatsByAssignmentId(assignmentId);

  // const stats = {
  //   totalSubmissions,
  //   pendingGrading: pendingSubmissions,
  //   graded: gradedSubmissions,
  //   lateSubmissions,
  //   submissionRate: totalSubmissions > 0
  //     ? Math.round((totalSubmissions / assignment.totalSubmissions) * 100)
  //     : 0,
  //   averageMarks: averageMarks[0]?.averageMarks || 0,
  //   highestMarks: averageMarks[0]?.highestMarks || 0,
  //   lowestMarks: averageMarks[0]?.lowestMarks || 0,
  //   totalMarks: assignment.totalMarks,
  //   isOverdue: isExpired(assignment.dueDate),
  //   daysRemaining: getDaysRemaining(assignment.dueDate),
  // };

  LoggerUtil.info(`Assignment stats retrieved for ${assignmentId}`);

  return ResponseUtil.success(res, stats, 'Assignment statistics retrieved successfully');
});

export default {
  createAssignment,
  getAssignmentsByGroup,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  gradeSubmission,
  getAssignmentSubmissions,
  getMySubmission,
  getAssignmentStats,
};