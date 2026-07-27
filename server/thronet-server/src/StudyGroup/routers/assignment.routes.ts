/**
 * ====================================
 * ASSIGNMENT ROUTES
 * ====================================
 * All assignment-related API endpoints
 */

import express from 'express';
import {
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
} from '../controllers/assignment.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validation } from '@/shared/middlewares/validation.middleware';
import { uploadMultiple } from '@/shared/upload/upload';
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  submitAssignmentSchema,
  gradeAssignmentSchema,
  assignmentListQuerySchema,
} from '../validators/assignment.validator';
import assert from 'assert';

const router = express.Router();

// ========================================
// ASSIGNMENT ROUTES
// ========================================

/**
 * @route   POST /api/v1/assignments
 * @desc    Create new assignment
 * @access  Private (Group Leader/Admin)
 */
router.post(
  '/',
  AuthMiddleware.authenticate as any as any,
  uploadMultiple('attachments', 5), // Max 5 files
  validation(createAssignmentSchema),
  createAssignment
);

/**
 * @route   GET /api/v1/assignments/group/:groupId
 * @desc    Get all assignments for a group
 * @access  Private (Group Members)
 */
router.get(
  '/group/:groupId',
  AuthMiddleware.authenticate as any,
  validation(assignmentListQuerySchema, 'query'),
  getAssignmentsByGroup
);

/**
 * @route   GET /api/v1/assignments/:assignmentId
 * @desc    Get assignment by ID
 * @access  Private (Group Members)
 */
router.get(
  '/:assignmentId',
  AuthMiddleware.authenticate as any,
  getAssignmentById
);

/**
 * @route   PUT /api/v1/assignments/:assignmentId
 * @desc    Update assignment
 * @access  Private (Creator only)
 */
router.put(
  '/:assignmentId',
  AuthMiddleware.authenticate as any,
  validation(updateAssignmentSchema),
  updateAssignment
);

/**
 * @route   DELETE /api/v1/assignments/:assignmentId
 * @desc    Delete assignment
 * @access  Private (Creator only)
 */
router.delete(
  '/:assignmentId',
  AuthMiddleware.authenticate as any,
  deleteAssignment
);

/**
 * @route   GET /api/v1/assignments/:assignmentId/stats
 * @desc    Get assignment statistics
 * @access  Private (Creator only)
 */
router.get(
  '/:assignmentId/stats',
  AuthMiddleware.authenticate as any,
  getAssignmentStats
);

// ========================================
// SUBMISSION ROUTES
// ========================================

/**
 * @route   POST /api/v1/assignments/:assignmentId/submit
 * @desc    Submit assignment
 * @access  Private (Group Members)
 */
router.post(
  '/:assignmentId/submit',
  AuthMiddleware.authenticate as any,
  uploadMultiple('submittedFiles', 5), // Max 5 files
  validation(submitAssignmentSchema),
  submitAssignment
);

/**
 * @route   GET /api/v1/assignments/:assignmentId/submissions
 * @desc    Get all submissions for an assignment
 * @access  Private (Creator only)
 */
router.get(
  '/:assignmentId/submissions',
  AuthMiddleware.authenticate as any,
  getAssignmentSubmissions
);

/**
 * @route   GET /api/v1/assignments/:assignmentId/my-submission
 * @desc    Get my submission for an assignment
 * @access  Private (Group Members)
 */
router.get(
  '/:assignmentId/my-submission',
  AuthMiddleware.authenticate as any,
  getMySubmission
);

/**
 * @route   PATCH /api/v1/assignments/:assignmentId/submissions/:submissionId/grade
 * @desc    Grade assignment submission
 * @access  Private (Creator only)
 */
router.patch(
  '/:assignmentId/submissions/:submissionId/grade',
  AuthMiddleware.authenticate as any,
  validation(gradeAssignmentSchema),
  gradeSubmission
);

export default router;