import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { availabilityController } from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';

const router = Router();

// Validation rules
const createAvailabilityValidation = [
  body('mentorId')
    .isString()
    .notEmpty()
    .withMessage('Mentor ID is required')
    .custom((value) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(value)) {
        throw new Error('Invalid mentor ID format (UUID required)');
      }
      return true;
    }),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('slots').isArray({ min: 1 }).withMessage('At least one slot is required'),
  body('slots.*.startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid start time format'),
  body('slots.*.endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid end time format'),
  body('timezone').isString().notEmpty().withMessage('Timezone is required'),
  body('isRecurring').optional().isBoolean(),
  body('dayOfWeek').optional().isString(),
];

const bulkCreateValidation = [
  body('mentorId').isString().notEmpty().withMessage('Mentor ID is required'),
  body('dateRange.startDate').isISO8601().withMessage('Valid start date is required'),
  body('dateRange.endDate').isISO8601().withMessage('Valid end date is required'),
  body('slotConfig.startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid start time'),
  body('slotConfig.endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid end time'),
  body('slotConfig.slotDuration').isInt({ min: 15, max: 480 }).withMessage('Slot duration must be between 15 and 480 minutes'),
  body('timezone').isString().notEmpty().withMessage('Timezone is required'),
  body('daysOfWeek').optional().isArray(),
];

const compareMentorsValidation = [
  body('mentorIds').isArray({ min: 1, max: 3 }).withMessage('Provide 1-3 mentor IDs'),
  body('mentorIds.*').isString().notEmpty().withMessage('Invalid mentor ID'),
];

// Routes
router.post(
  '/create',
  AuthMiddleware.authenticate as any,
  validate(createAvailabilityValidation),
  availabilityController.createAvailability
);

router.post(
  '/bulk',
  AuthMiddleware.authenticate as any,
  validate(bulkCreateValidation),
  availabilityController.bulkCreateAvailability
);

router.get(
  '/get-all-db',
  AuthMiddleware.authenticate as any,
  availabilityController.getAllAvailabilityFromDB
);

router.get(
  '/mentor/:mentorId',
  AuthMiddleware.authenticate as any,
  validate([
    param('mentorId')
      .isString()
      .notEmpty()
      .custom((value) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          throw new Error('Invalid mentor ID format');
        }
        return true;
      }),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('status').optional().isIn(['available', 'booked', 'blocked']),
  ]),
  availabilityController.getMentorAvailability
);

router.get(
  '/slots/:mentorId',
  AuthMiddleware.authenticate as any,
  validate([
    param('mentorId')
      .isString()
      .notEmpty()
      .custom((value) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          throw new Error('Invalid mentor ID format');
        }
        return true;
      }),
    query('date').isISO8601().withMessage('Valid date is required'),
    query('timezone').optional().isString(),
  ]),
  availabilityController.getAvailableSlots
);

router.patch(
  '/update/:availabilityId',
  AuthMiddleware.authenticate as any,
  validate([
    param('availabilityId')
      .isString()
      .notEmpty()
      .custom((value) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          throw new Error('Invalid availability ID format');
        }
        return true;
      }),
  ]),
  availabilityController.updateAvailability
);

router.delete(
  '/delete/:availabilityId',
  AuthMiddleware.authenticate as any,
  validate([
    param('availabilityId')
      .isString()
      .notEmpty()
      .custom((value) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          throw new Error('Invalid availability ID format');
        }
        return true;
      }),
  ]),
  availabilityController.deleteAvailability
);

router.get(
  '/stats/:mentorId',
  AuthMiddleware.authenticate as any,
  validate([
    param('mentorId')
      .isString()
      .notEmpty()
      .custom((value) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          throw new Error('Invalid mentor ID format');
        }
        return true;
      }),
  ]),
  availabilityController.getAvailabilityStats
);

router.post(
  '/compare',
  AuthMiddleware.authenticate as any,
  validate(compareMentorsValidation),
  availabilityController.compareMentors
);

export default router;  