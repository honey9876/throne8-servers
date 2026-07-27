/**
 * ====================================
 * TASK ROUTES (PRODUCTION-LEVEL)
 * ====================================
 * Define all task-related routes with validation
 */

import { Router } from 'express';
import  taskController from '../controllers/task.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validateJoi, validateParamsJoi, validateQueryJoi, validation } from '@/shared/middlewares/validation.middleware';
import {
  createTaskSchema,
  updateTaskSchema,
  taskIdSchema,
  taskQuerySchema,
} from '../validators/task.validator';
import Joi from 'joi';

const router = Router();

/**
 * Apply authentication middleware to all routes
 */
router.use(AuthMiddleware.authenticate as any);

router.use('/health',
  (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Task API is healthy' });
  }
);

/**
 * @route   GET /api/v1/tasks/stats
 * @desc    Get task statistics
 * @access  Private
 */
router.get('/stats', taskController.getTaskStats);

/**
 * @route   GET /api/v1/tasks/overdue
 * @desc    Get overdue tasks
 * @access  Private
 */
router.get('/overdue', taskController.getOverdueTasks);

/**
 * @route   GET /api/v1/tasks/upcoming
 * @desc    Get upcoming tasks (next 7 days by default)
 * @access  Private
 */
router.get('/upcoming', taskController.getUpcomingTasks);

/**
 * @route   POST /api/v1/tasks
 * @desc    Create new task
 * @access  Private
 */
router.post('/',
  (req, res, next) => {
    // Custom validation to ensure groupId is valid if provided
      console.log("before validation checked");
      next();
  },
   validation(createTaskSchema), 
   (req, res, next) => {
    // Custom validation to ensure groupId is valid if provided
      console.log("after validation");
      next();
  },
   taskController.createTask);

/**
 * @route   GET /api/v1/tasks
 * @desc    Get all tasks with filters and pagination
 * @access  Private
 */
router.get('/', validateQueryJoi(taskQuerySchema as Joi.ObjectSchema), taskController.getAllTasks);

/**
 * @route   GET /api/v1/tasks/:taskId
 * @desc    Get task by ID
 * @access  Private
 */
router.get('/:taskId', validateParamsJoi(taskIdSchema), taskController.getTaskById);

/**
 * @route   PUT /api/v1/tasks/:taskId
 * @desc    Update task
 * @access  Private
 */
router.put(
  '/:taskId',
  validateParamsJoi(taskIdSchema),
  validation(updateTaskSchema),
  taskController.updateTask
);

/**
 * @route   DELETE /api/v1/tasks/:taskId
 * @desc    Delete task
 * @access  Private
 */
router.delete('/:taskId', validateParamsJoi(taskIdSchema), taskController.deleteTask);

/**
 * @route   PATCH /api/v1/tasks/:taskId/complete
 * @desc    Mark task as completed
 * @access  Private
 */
router.patch(
  '/:taskId/complete',
  validateParamsJoi(taskIdSchema),
  taskController.markTaskComplete
);

/**
 * @route   PATCH /api/v1/tasks/:taskId/incomplete
 * @desc    Mark task as incomplete
 * @access  Private
 */
router.patch(
  '/:taskId/incomplete',
  validateParamsJoi(taskIdSchema),
  taskController.markTaskIncomplete
);

export default router;