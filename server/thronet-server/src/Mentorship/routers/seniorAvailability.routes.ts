import { Router } from 'express';
console.log('✅ [BOOT] seniorAvailability.routes.ts parsed!');

import SeniorAvailabilityController from '../controllers/seniorAvailability.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

import {
  updateAvailabilityValidator,
  getSlotsValidator,
  addBlockedTimeValidator,
  removeBlockedTimeValidator
} from '../validations/seniorAvailability.validator';

const router = Router();

/**
 * All Senior Availability routes require authentication.
 */
router.use(AuthMiddleware.authenticate);

/**
 * Get mentor's availability configuration
 * GET /senior-availability/config
 */
router.get(
  '/config',
  SeniorAvailabilityController.getAvailabilityConfig
);

/**
 * Create or update mentor's availability configuration
 * PUT /senior-availability/config
 */
router.put(
  '/config',
  updateAvailabilityValidator,
  SeniorAvailabilityController.updateAvailabilityConfig
);

/**
 * Get available slots for a specific date (dynamic generation)
 * GET /senior-availability/slots?date=YYYY-MM-DD&duration=60
 */
router.get(
  '/slots',
  getSlotsValidator,
  SeniorAvailabilityController.getAvailableSlots
);

/**
 * Get monthly available slots (dynamic generation)
 * GET /senior-availability/monthly-slots?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&duration=60
 */
router.get(
  '/monthly-slots',
  SeniorAvailabilityController.getMonthlyAvailability
);

/**
 * Block a specific time frame
 * POST /senior-availability/blocked
 */
router.post(
  '/blocked',
  addBlockedTimeValidator,
  SeniorAvailabilityController.addBlockedTime
);

/**
 * Unblock a specific time frame
 * DELETE /senior-availability/blocked/:id
 */
router.delete(
  '/blocked/:id',
  removeBlockedTimeValidator,
  SeniorAvailabilityController.removeBlockedTime
);

export default router;
