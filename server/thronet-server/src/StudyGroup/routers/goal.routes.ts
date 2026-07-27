/**
 * ====================================
 * GOAL ROUTES
 * ====================================
 * Define all goal-related routes
 */

import { Router } from 'express';
import goalController  from '../controllers/goal.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validateParamsJoi, validateQueryJoi, validation } from '@/shared/middlewares/validation.middleware';
import {
  createGoalSchema,
  updateGoalSchema,
  goalIdSchema,
  updateGoalProgressSchema,
  goalQuerySchema,
} from '../validators/goal.validator';
import Joi from 'joi';

const router = Router();

/**
 * Apply authentication middleware to all routes
 */
router.use(AuthMiddleware.authenticate as any);

/**
 * @route   GET /api/v1/goals/stats
 * @desc    Get goal statistics
 * @access  Private
 */
router.get('/stats', goalController.getGoalStats);

/**
 * @route   GET /api/v1/goals/active
 * @desc    Get active goals
 * @access  Private
 */
router.get('/active', goalController.getActiveGoals);

/**
 * @route   GET /api/v1/goals/upcoming
 * @desc    Get upcoming goals
 * @access  Private
 */
router.get('/upcoming', goalController.getUpcomingGoals);

/**
 * @route   POST /api/v1/goals
 * @desc    Create new goal
 * @access  Private
 */
router.post('/', validation(createGoalSchema), goalController.createGoal);

/**
 * @route   GET /api/v1/goals
 * @desc    Get all goals
 * @access  Private
 */
router.get('/', 
  // validation(goalQuerySchema, 'query'),
  //  validateQueryJoi(goalQuerySchema),
  validateQueryJoi(goalQuerySchema as Joi.ObjectSchema),
   goalController.getAllGoals);

/**
 * @route   GET /api/v1/goals/:goalId
 * @desc    Get goal by ID
 * @access  Private
 */
// router.get('/:goalId', validation(goalIdSchemaas any), goalController.getGoalById);
router.get('/:goalId', validateParamsJoi(goalIdSchema as any), goalController.getGoalById);

/**
 * @route   PUT /api/v1/goals/:goalId
 * @desc    Update goal
 * @access  Private
 */
router.put(
  '/:goalId',
  validateParamsJoi(goalIdSchema as any),
  validation(updateGoalSchema),
  goalController.updateGoal
);

/**
 * @route   DELETE /api/v1/goals/:goalId
 * @desc    Delete goal
 * @access  Private
 */
router.delete('/:goalId', validateParamsJoi(goalIdSchema as any), goalController.deleteGoal);

/**
 * @route   PATCH /api/v1/goals/:goalId/progress
 * @desc    Update goal progress
 * @access  Private
 */
router.patch(
  '/:goalId/progress',
  validateParamsJoi(goalIdSchema as any),
  validation(updateGoalProgressSchema),
  goalController.updateGoalProgress
);

/**
 * @route   PATCH /api/v1/goals/:goalId/complete
 * @desc    Mark goal as completed
 * @access  Private
 */
router.patch('/:goalId/complete', validateParamsJoi(goalIdSchema as any), goalController.markGoalComplete);

/**
 * @route   PATCH /api/v1/goals/:goalId/incomplete
 * @desc    Mark goal as incomplete
 * @access  Private
 */
router.patch('/:goalId/incomplete', validateParamsJoi(goalIdSchema as any), goalController.markGoalIncomplete);

export default router;

