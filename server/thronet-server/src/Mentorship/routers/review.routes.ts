import { Router } from 'express';
import { mentorshipReviewController } from '../controllers';
import { validate } from '@/shared/middlewares/validation.middleware';
import { body, param, query } from 'express-validator';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = Router();

/**
 * Review Validation Rules
 */
const submitReviewValidation = [
  body('sessionId').notEmpty().withMessage('Session ID is required'),
  body('mentorId').notEmpty().withMessage('Mentor ID is required'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .notEmpty()
    .withMessage('Comment is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Comment must be between 10 and 1000 characters'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
];

const updateReviewValidation = [
  param('id').notEmpty().withMessage('Review ID is required'),
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Comment must be between 10 and 1000 characters'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
];

const addMentorResponseValidation = [
  param('id').notEmpty().withMessage('Review ID is required'),
  body('response')
    .notEmpty()
    .withMessage('Response is required')
    .isLength({ max: 500 })
    .withMessage('Response cannot exceed 500 characters'),
];

const reportReviewValidation = [
  param('id').notEmpty().withMessage('Review ID is required'),
  body('reason')
    .notEmpty()
    .withMessage('Report reason is required'),
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
];

/**
 * @route   POST /api/v1/reviews
 * @desc    Submit a new review
 * @access  Private (Mentee)
 */
router.post(
  '/',
  AuthMiddleware.authenticate as any,
  validate(submitReviewValidation),
  mentorshipReviewController.submitReview
);

/**
 * @route   GET /api/v1/reviews/mentor/:mentorId
 * @desc    Get reviews for a specific mentor
 * @access  Public
 */
router.get(
  '/mentor/:mentorId',
  validate([
    param('mentorId').notEmpty().withMessage('Mentor ID is required'),
    ...paginationValidation,
  ]),
  mentorshipReviewController.getMentorReviews
);

/**
 * @route   GET /api/v1/reviews/mentor/:mentorId/top
 * @desc    Get top reviews for a mentor
 * @access  Public
 */
router.get(
  '/mentor/:mentorId/top',
  validate([
    param('mentorId').notEmpty().withMessage('Mentor ID is required'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Limit must be between 1 and 20'),
  ]),
  mentorshipReviewController.getTopReviews
);

/**
 * @route   GET /api/v1/reviews/mentor/:mentorId/stats
 * @desc    Get review statistics for a mentor
 * @access  Public
 */
router.get(
  '/mentor/:mentorId/stats',
  validate([
    param('mentorId').notEmpty().withMessage('Mentor ID is required'),
  ]),
  mentorshipReviewController.getReviewStats
);

/**
 * @route   GET /api/v1/reviews/:id
 * @desc    Get review by ID
 * @access  Public
 */
router.get(
  '/:id',
  validate([
    param('id').notEmpty().withMessage('Review ID is required'),
  ]),
  mentorshipReviewController.getReviewById
);

/**
 * @route   PUT /api/v1/reviews/:id
 * @desc    Update review
 * @access  Private (Review Owner)
 */
router.put(
  '/:id',
  AuthMiddleware.authenticate as any,
  validate(updateReviewValidation),
  mentorshipReviewController.updateReview
);

/**
 * @route   DELETE /api/v1/reviews/:id
 * @desc    Delete review
 * @access  Private (Review Owner)
 */
router.delete(
  '/:id',
  AuthMiddleware.authenticate as any,
  validate([
    param('id').notEmpty().withMessage('Review ID is required'),
  ]),
  mentorshipReviewController.deleteReview
);

/**
 * @route   POST /api/v1/reviews/:id/response
 * @desc    Add mentor response to review
 * @access  Private (Mentor)
 */
router.post(
  '/:id/response',
  AuthMiddleware.authenticate as any,
  validate(addMentorResponseValidation),
  mentorshipReviewController.addMentorResponse
);

/**
 * @route   POST /api/v1/reviews/:id/helpful
 * @desc    Mark review as helpful
 * @access  Public
 */
router.post(
  '/:id/helpful',
  validate([
    param('id').notEmpty().withMessage('Review ID is required'),
  ]),
  mentorshipReviewController.markHelpful
);

/**
 * @route   POST /api/v1/reviews/:id/report
 * @desc    Report a review
 * @access  Private
 */
router.post(
  '/:id/report',
  AuthMiddleware.authenticate as any,
  validate(reportReviewValidation),
  mentorshipReviewController.reportReview
);

/**
 * @route   POST /api/v1/reviews/:id/moderate
 * @desc    Moderate review (Admin only)
 * @access  Private (Admin)
 */
router.post(
  '/:id/moderate',
  AuthMiddleware.authenticate as any,
  validate([
    param('id').notEmpty().withMessage('Review ID is required'),
    body('action')
      .isIn(['approve', 'hide', 'delete'])
      .withMessage('Invalid moderation action'),
    body('reason').optional(),
  ]),
  mentorshipReviewController.moderateReview
);

export default router;