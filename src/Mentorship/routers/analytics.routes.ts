import { Router } from 'express';
import {mentorshipAnalyticsController} from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

import { query } from 'express-validator';
import { validate } from '@/shared/middlewares/validation.middleware';

const router = Router();

const dateRangeValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO8601 date'),
];

/**
 * @route   GET /api/v1/analytics/mentor/:mentorId
 */
router.get(
  '/mentor/:mentorId',
  AuthMiddleware.authenticate as any,
  validate(dateRangeValidation),
  (req, res) => mentorshipAnalyticsController.getMentorStats(req, res)
);

/**
 * @route   GET /api/v1/analytics/mentor/:mentorId/stats
 */
router.get(
  '/mentor/:mentorId/stats',
  AuthMiddleware.authenticate as any,
  validate(dateRangeValidation),
  (req, res) => mentorshipAnalyticsController.getMentorStats(req, res)
);

/**
 * @route   GET /api/v1/analytics/mentor/:mentorId/earnings
 */
router.get(
  '/mentor/:mentorId/earnings',
  AuthMiddleware.authenticate as any,
  validate(dateRangeValidation),
  (req, res) => mentorshipAnalyticsController.getMentorEarnings(req, res)
);

/**
 * @route   GET /api/v1/analytics/mentor/:mentorId/sessions
 */
router.get(
  '/mentor/:mentorId/sessions',
  AuthMiddleware.authenticate as any,
  validate(dateRangeValidation),
  (req, res) => mentorshipAnalyticsController.getMentorSessions(req, res)
);

/**
 * @route   GET /api/v1/analytics/mentor/:mentorId/reviews
 */
router.get(
  '/mentor/:mentorId/reviews',
  AuthMiddleware.authenticate as any,
  (req, res) => mentorshipAnalyticsController.getMentorReviews(req, res)
);

/**
 * @route   GET /api/v1/analytics/platform/stats
 */
router.get(
  '/platform/stats',
  AuthMiddleware.authenticate as any,
  validate(dateRangeValidation),
  (req, res) => mentorshipAnalyticsController.getPlatformStats(req, res)
);

/**
 * @route   GET /api/v1/analytics/platform/revenue
 */
router.get(
  '/platform/revenue',
  AuthMiddleware.authenticate as any,
  validate([
    ...dateRangeValidation,
    query('groupBy')
      .optional()
      .isIn(['day', 'week', 'month'])
      .withMessage('Group by must be day, week, or month'),
  ]),
  (req, res) => mentorshipAnalyticsController.getRevenueReport(req, res)
);

/**
 * @route   GET /api/v1/analytics/platform/sessions
 */
router.get(
  '/platform/sessions',
  AuthMiddleware.authenticate as any,
  validate([
    ...dateRangeValidation,
    query('groupBy')
      .optional()
      .isIn(['day', 'week', 'month', 'type'])
      .withMessage('Group by must be day, week, month, or type'),
  ]),
  (req, res) => mentorshipAnalyticsController.getSessionReport(req, res)
);

/**
 * @route   GET /api/v1/analytics/platform/mentors
 */
router.get(
  '/platform/mentors',
  AuthMiddleware.authenticate as any,
  (req, res) => mentorshipAnalyticsController.getMentorAnalytics(req, res)
);

/**
 * @route   GET /api/v1/analytics/platform/growth
 */
router.get(
  '/platform/growth',
  AuthMiddleware.authenticate as any,
  validate(dateRangeValidation),
  (req, res) => mentorshipAnalyticsController.getGrowthMetrics(req, res)
);

export default router;