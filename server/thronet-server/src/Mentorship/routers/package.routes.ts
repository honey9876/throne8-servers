// src/routes/package.routes.ts
import express from 'express';
import {
  getPackagePricing,
  getSpecificPackagePricing,
  purchasePackage,
  getPackageById,
  getUserPackages,
  getPackageSummary,
  usePackageCredit,
  getAvailableCredits,
  cancelPackage,
} from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { body, param, query } from 'express-validator';

const router = express.Router();

/**
 * Public Routes
 */

// Get all package pricing options
router.get('/pricing', getPackagePricing);

// Get specific package pricing
router.get(
  '/pricing/:packageType',
  validate([
    param('packageType')
      .isIn(['starter', 'professional', 'premium', 'custom'])
      .withMessage('Invalid package type'),
  ]),
  getSpecificPackagePricing
);

/**
 * Protected Routes
 */

// Purchase a package
router.post(
  '/purchase',
  AuthMiddleware.authenticate as any,
  validate([
    body('packageType')
      .isIn(['starter', 'professional', 'premium', 'custom'])
      .withMessage('Invalid package type'),
    body('paymentMethod').notEmpty().withMessage('Payment method is required'),
    body('mentorId').optional().isString().withMessage('Invalid mentor ID'),
    body('transactionId').optional().isString().withMessage('Invalid transaction ID'),
    body('customSessions')
      .if(body('packageType').equals('custom'))
      .isInt({ min: 1 })
      .withMessage('Custom sessions must be at least 1'),
    body('customPrice')
      .if(body('packageType').equals('custom'))
      .isFloat({ min: 0 })
      .withMessage('Custom price must be a positive number'),
  ]),
  purchasePackage
);

// Get package summary
router.get('/summary', AuthMiddleware.authenticate as any, getPackageSummary);

// Get available credits
router.get(
  '/credits',
  AuthMiddleware.authenticate as any,
  validate([
    query('packageId').optional().isUUID().withMessage('Invalid package ID')
  ]),
  getAvailableCredits
);

// Get all packages for user
router.get(
  '/',
  AuthMiddleware.authenticate as any,
  validate([
    query('status')
      .optional()
      .isIn(['active', 'expired', 'exhausted', 'cancelled'])
      .withMessage('Invalid status'),
  ]),
  getUserPackages
);

// Get package by ID
router.get(
  '/:packageId',
  AuthMiddleware.authenticate as any,
  validate([
    param('packageId').isUUID().withMessage('Invalid package ID')
  ]),
  getPackageById
);

// Use a credit from package
router.post(
  '/:packageId/use-credit',
  AuthMiddleware.authenticate as any,
  validate([
    param('packageId').isUUID().withMessage('Invalid package ID'),
    body('sessionId').isUUID().withMessage('Invalid session ID'),
    body('sessionType').notEmpty().withMessage('Session type is required'),
    body('sessionDate').isISO8601().withMessage('Invalid session date'),
  ]),
  usePackageCredit
);

// Cancel package
router.put(
  '/:packageId/cancel',
  AuthMiddleware.authenticate as any,
  validate([
    param('packageId').isUUID().withMessage('Invalid package ID'),
    body('reason').notEmpty().withMessage('Cancellation reason is required'),
  ]),
  cancelPackage
);

export default router;