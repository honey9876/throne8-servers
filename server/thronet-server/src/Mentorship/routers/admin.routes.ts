import { Router } from 'express';
import { adminController } from '../controllers';
import { body, param, query } from 'express-validator';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';

const router = Router();

// routes mein add karo — sabse upar
router.use(AuthMiddleware.authenticate as any);
router.use((req, res, next) => {
  if (req.user?.role !== 'admin') {
    return ResponseHandler.forbidden(res, 'Admin access required');
  }
  next();
});

// Controller se sab isAdmin() checks hata do

/**
 * Admin Validation Rules
 */
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

const statusUpdateValidation = [
  param('id').notEmpty().withMessage('ID is required'),
  body('status').notEmpty().withMessage('Status is required'),
  body('reason').optional(),
];

/**
 * @route   GET /api/v1/admin/dashboard
 * @desc    Get dashboard statistics
 * @access  Private (Admin)
 */
router.get(
  '/dashboard',
  AuthMiddleware.authenticate as any,
  adminController.getDashboardStats
);

/**
 * @route   GET /api/v1/admin/mentors
 * @desc    Get all mentors with filters
 * @access  Private (Admin)
 */
// / ✅ Replace with
router.get(
  '/mentors',
  AuthMiddleware.authenticate as any,
  validate([
    ...paginationValidation,
    query('status').optional(),
    query('search').optional(),
  ]),
  adminController.getAllMentors
);

/**
 * @route   GET /api/v1/admin/mentors/pending
 * @desc    Get pending mentor approvals
 * @access  Private (Admin)
 */
router.get(
  '/mentors/pending',
  AuthMiddleware.authenticate as any,
  validate(paginationValidation),
  adminController.getPendingMentors
);

/**
 * @route   POST /api/v1/admin/mentors/:id/status
 * @desc    Update mentor status (approve/reject)
 * @access  Private (Admin)
 */
router.post(
  '/mentors/:id/status',
  AuthMiddleware.authenticate as any,
  validate(statusUpdateValidation),
  adminController.updateMentorStatus
);

/**
 * @route   GET /api/v1/admin/sessions
 * @desc    Get all sessions with filters
 * @access  Private (Admin)
 */
router.get(
  '/sessions',
  AuthMiddleware.authenticate as any,
  validate([
    ...paginationValidation,
    query('status').optional(),
    query('sessionType').optional(),
  ]),
  adminController.getAllSessions
);

/**
 * @route   GET /api/v1/admin/reviews
 * @desc    Get all reviews with filters
 * @access  Private (Admin)
 */
router.get(
  '/reviews',
  AuthMiddleware.authenticate as any,
  validate([
    ...paginationValidation,
    query('reported')
      .optional()
      .isBoolean()
      .withMessage('Reported must be a boolean'),
    query('rating')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be between 1 and 5'),
  ]),
  adminController.getAllReviews
);

/**
 * @route   GET /api/v1/admin/reviews/reported
 * @desc    Get reported reviews
 * @access  Private (Admin)
 */
router.get(
  '/reviews/reported',
  AuthMiddleware.authenticate as any,
  validate(paginationValidation),
  adminController.getReportedReviews
);

/**
 * @route   POST /api/v1/admin/reviews/:id/moderate
 * @desc    Moderate a review
 * @access  Private (Admin)
 */
router.post(
  '/reviews/:id/moderate',
  AuthMiddleware.authenticate as any,
  validate([
    param('id').isUUID().withMessage('Invalid ID format'),
    body('action')
      .isIn(['approve', 'hide', 'delete'])
      .withMessage('Invalid moderation action'),
    body('reason').optional(),
  ]),
  adminController.moderateReview
);

/**
 * @route   GET /api/v1/admin/payments
 * @desc    Get payment logs/transactions
 * @access  Private (Admin)
 */
router.get(
  '/payments',
  AuthMiddleware.authenticate as any,
  validate([
    ...paginationValidation,
    query('status').optional(),
  ]),
  adminController.getPaymentLogs
);

export default router;