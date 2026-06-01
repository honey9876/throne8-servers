import { Router } from 'express';
import {queryController} from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
// import validat
import queryValidator from '../validations/query.validator';
import { validateJoi, validateQueryJoi } from '@/shared/middlewares/validation.middleware';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import { logger } from '@/shared/logger.util';


const router = Router();

// All routes require authentication
router.use(AuthMiddleware.authenticate as any);

/**
 * @route   POST /api/v1/queries
 * @desc    Submit a new query
 * @access  Private (Mentee)
 */
router.post(
  '/submit',
  validateJoi(queryValidator.submitQuery),
  queryController.submitQuery
);

/**
 * @route   GET /api/v1/queries/pending
 * @desc    Get pending queries (for mentors)
 * @access  Private (Mentor)
 * 🔴 MUST BE BEFORE /:id
 */
router.get('/pending', queryController.getPendingQueries);

/**
 * @route   GET /api/v1/queries/stats
 * @desc    Get query statistics
 * @access  Private
 * 🔴 MUST BE BEFORE /:id
 */
router.get('/stats', queryController.getQueryStats);

/**
 * @route   GET /api/v1/queries
 * @desc    Get all queries for current user
 * @access  Private
 * 🔴 Query params don't conflict with path params
 */
router.get(
  '/',
    (req, res, next) => {
    // Custom middleware to handle query params validation separately
    console.log('enter in validtion ')
    
  const {error, value} = queryValidator.listQueries.validate(req.query);
  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    console.log('validation error in query params:', error);
    logger.warn('Query validation failed:', errors);
    ResponseHandler.badRequest(res, 'Query validation failed', errors);
    return;
  }
    // Custom middleware to handle query params validation separately
    console.log('after validation in routes')
    next();
  },
  queryController.getAllQueries
);

/**
 * @route   GET /api/v1/queries/:id
 * @desc    Get query details by ID
 * @access  Private
 * 🔴 MUST BE AFTER ALL SPECIFIC ROUTES
 */
router.get('/:id', queryController.getQueryById);

/**
 * @route   POST /api/v1/queries/:id/answer
 * @desc    Answer a query (Mentor only)
 * @access  Private (Mentor)
 */
router.post(
  '/:id/answer',
  validateJoi(queryValidator.answerQuery),
  queryController.answerQuery
);

/**
 * @route   POST /api/v1/queries/:id/follow-up
 * @desc    Submit follow-up question (Mentee only)
 * @access  Private (Mentee)
 */
router.post(
  '/:id/follow-up',
  validateJoi(queryValidator.submitFollowUp),
  queryController.submitFollowUp
);

/**
 * @route   POST /api/v1/queries/:id/follow-up/answer
 * @desc    Answer follow-up question (Mentor only)
 * @access  Private (Mentor)
 */
router.post(
  '/:id/follow-up/answer',
  validateJoi(queryValidator.answerFollowUp),
  queryController.answerFollowUp
);

/**
 * @route   POST /api/v1/queries/:id/feedback
 * @desc    Add feedback to query
 * @access  Private (Mentee)
 */
router.post(
  '/:id/feedback',
  validateJoi(queryValidator.addFeedback),
  queryController.addFeedback
);

export default router;    