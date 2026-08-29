/**
 * ====================================
 * TEST ROUTES
 * ====================================
 * All test-related API endpoints
 */

import express from 'express';
import testController  from '../controllers/test.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validation } from '@/shared/middlewares/validation.middleware';
import {
  createTestSchema,
  updateTestSchema,
  addQuestionSchema,
  testListQuerySchema,
} from '../validators/test.validator';

const router = express.Router();

// ========================================
// TEST ROUTES
// ========================================

/**
 * @route   POST /api/v1/tests
 * @desc    Create new test
 * @access  Private (Group Leader/Admin)
 */
router.post(
  '/',
  AuthMiddleware.authenticate as any,
  validation(createTestSchema),
  testController.createTest
);

/**
 * @route   GET /api/v1/tests/group/:groupId
 * @desc    Get all tests for a group
 * @access  Private (Group Members)
 */
router.get(
  '/group/:groupId',
  AuthMiddleware.authenticate as any,
  validation(testListQuerySchema, 'query'),
   testController.getTestsByGroup
);

/**
 * @route   GET /api/v1/tests/:testId
 * @desc    Get test by ID
 * @access  Private (Group Members)
 */
router.get(
  '/:testId',
  AuthMiddleware.authenticate as any,
   testController.getTestById
);

/**
 * @route   PUT /api/v1/tests/:testId
 * @desc    Update test
 * @access  Private (Creator only)
 */
router.put(
  '/:testId',
  AuthMiddleware.authenticate as any,
  validation(updateTestSchema),
   testController.updateTest
);

/**
 * @route   DELETE /api/v1/tests/:testId
 * @desc    Delete test
 * @access  Private (Creator only)
 */
router.delete(
  '/:testId',
  AuthMiddleware.authenticate as any,
   testController.deleteTest
);

/**
 * @route   PATCH /api/v1/tests/:testId/publish
 * @desc    Publish test
 * @access  Private (Creator only)
 */
router.patch(
  '/:testId/publish',
  AuthMiddleware.authenticate as any,
   testController.publishTest
);

/**
 * @route   PATCH /api/v1/tests/:testId/unpublish
 * @desc    Unpublish test
 * @access  Private (Creator only)
 */
router.patch(
  '/:testId/unpublish',
  AuthMiddleware.authenticate as any,
   testController.unpublishTest
);

/**
 * @route   GET /api/v1/tests/:testId/stats
 * @desc    Get test statistics
 * @access  Private (Creator only)
 */
router.get(
  '/:testId/stats',
  AuthMiddleware.authenticate as any,
   testController.getTestStats
);

// ========================================
// QUESTION ROUTES
// ========================================

/**
 * @route   POST /api/v1/tests/:testId/questions
 * @desc    Add question to test
 * @access  Private (Creator only)
 */
router.post(
  '/:testId/questions',
  AuthMiddleware.authenticate as any,
  validation(addQuestionSchema),
   testController.addQuestion
);

/**
 * @route   GET /api/v1/tests/:testId/questions
 * @desc    Get all questions for a test
 * @access  Private (Group Members)
 */
router.get(
  '/:testId/questions',
  AuthMiddleware.authenticate as any,
   testController.getTestQuestions
);

/**
 * @route   PUT /api/v1/tests/:testId/questions/:questionId
 * @desc    Update question
 * @access  Private (Creator only)
 */
router.put(
  '/:testId/questions/:questionId',
  AuthMiddleware.authenticate as any,
  validation(addQuestionSchema),
   testController.updateQuestion
);

/**
 * @route   DELETE /api/v1/tests/:testId/questions/:questionId
 * @desc    Delete question
 * @access  Private (Creator only)
 */
router.delete(
  '/:testId/questions/:questionId',
  AuthMiddleware.authenticate as any,
   testController.deleteQuestion
);

export default router;