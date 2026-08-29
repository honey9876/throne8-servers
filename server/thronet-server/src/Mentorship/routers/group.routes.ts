import { Router } from 'express';
import { groupController } from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import Joi from 'joi';
import { validateJoi, validateQueryJoi } from '@/shared/middlewares/validation.middleware';
import logger from '@/shared/utils/company/logger';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import queryValidator from '../validations/query.validator';
import { uploadSingle } from '@/shared/upload/upload';
import { NextFunction, Request, Response } from 'express';

const parseFormDataFields = (req: Request, res: Response, next: NextFunction): void => {
  const fieldsToParse = ['outcomes', 'resources', 'followUp'];
  const numberFields = ['duration', 'maxParticipants', 'minParticipants', 'pricePerPerson', 'bufferTimeMinutes'];
  const body = req.body as Record<string, any>;

  for (const field of fieldsToParse) {
    if (body[field] && typeof body[field] === 'string') {
      try {
        body[field] = JSON.parse(body[field]);
      } catch (e) {
        // ignore
      }
    }
  }
  for (const field of numberFields) {
    if (body[field] !== undefined && typeof body[field] === 'string' && !isNaN(Number(body[field]))) {
      body[field] = Number(body[field]);
    }
  }
  next();
};

const router = Router();

// Validators
const createGroupSessionValidator = Joi.object({
  title: Joi.string().min(10).max(200).required(),
  description: Joi.string().min(50).max(2000).required(),
  topic: Joi.string().min(5).max(100).required(),
  category: Joi.string().max(50).optional(),
  scheduledAt: Joi.date().iso().greater('now').required(),
  duration: Joi.number().min(30).max(180).required(),
  timezone: Joi.string().required(),
  maxParticipants: Joi.number().min(3).max(50).required(),
  minParticipants: Joi.number().min(1).required(),
  pricePerPerson: Joi.number().min(0).required(),
  agenda: Joi.string().max(2000).optional().allow(''),
  outcomes: Joi.array().items(Joi.string()).optional(),
  paymentMethod: Joi.string().valid('razorpay', 'stripe', 'cash', 'bank_transfer', 'free').required(),
  followUp: Joi.object({
    allowed: Joi.boolean().required(),
    periodDays: Joi.number().min(0).max(30).when('allowed', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  }).optional(),
  bufferTimeMinutes: Joi.number().min(0).max(60).optional().default(0),
});

const joinGroupSessionValidator = Joi.object({
  transactionId: Joi.string().optional(),
});

const updateGroupSessionValidator = Joi.object({
  title: Joi.string().min(10).max(200).optional(),
  description: Joi.string().min(50).max(2000).optional(),
  agenda: Joi.string().max(2000).optional().allow(''),
  outcomes: Joi.array().items(Joi.string()).optional(),
  resources: Joi.array().items(Joi.string()).optional(),
});

const completeGroupSessionValidator = Joi.object({
  actualDuration: Joi.number().min(0).optional(),
  attendees: Joi.array().items(Joi.string()).optional(),
});

const cancelGroupSessionValidator = Joi.object({
  reason: Joi.string().min(10).max(500).required(),
});

const addFeedbackValidator = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(1000).optional().allow(''),
});

// ✅ listGroupSessionsValidator mein add karo
const listGroupSessionsValidator = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(10),
  status: Joi.string().optional().allow(''),
  topic: Joi.string().optional().allow(''),
  mentorId: Joi.string().optional().allow(''),
}).options({ convert: true });  // ← ADD KARO




/**
 * @route   POST /api/v1/group-sessions
 * @desc    Create a new group session (Mentor only)
 * @access  Private (Mentor)
 */
router.post(
  ['/create', '/'],
  AuthMiddleware.authenticate as any,
  uploadSingle('thumbnailImage'),
  parseFormDataFields,
  validateJoi(createGroupSessionValidator),
  groupController.createGroupSession
);

/**
 * @route   GET /api/v1/group-sessions
 * @desc    Get all group sessions with filters
 * @access  Private
 */
router.get(
  '/',
  (req, res, next) => {
      // Custom middleware to handle query params validation separately
      console.log('enter in validtion ')
      
    const {error, value} = listGroupSessionsValidator.validate(req.query);
    if (error) {
      const errors = error.details.map((detail: any) => ({
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
  // validateQueryJoi(listGroupSessionsValidator),
  groupController.getAllGroupSessions
);

/**
 * @route   GET /api/v1/group-sessions/upcoming
 * @desc    Get upcoming group sessions
 * @access  Private
 */
router.get('/upcoming', groupController.getUpcomingGroupSessions);

/**
 * @route   GET /api/v1/group-sessions/my-sessions
 * @desc    Get my group sessions
 * @access  Private
 */
router.get('/my-sessions', AuthMiddleware.authenticate as any, groupController.getMyGroupSessions);

/**
 * @route   GET /api/v1/group-sessions/:id
 * @desc    Get group session details by ID
 * @access  Private
 */
router.get('/:id', groupController.getGroupSessionById);

/**
 * @route   PUT /api/v1/group-sessions/:id
 * @desc    Update group session (Mentor only)
 * @access  Private (Mentor)
 */
router.put(
  '/:id',
  AuthMiddleware.authenticate as any,
  uploadSingle('thumbnailImage'),
  parseFormDataFields,
  validateJoi(updateGroupSessionValidator),
  groupController.updateGroupSession
);

/**
 * @route   POST /api/v1/group-sessions/:id/join
 * @desc    Join a group session
 * @access  Private (Mentee)
 */
router.post(
  '/:id/join',
  AuthMiddleware.authenticate as any,
  validateJoi(joinGroupSessionValidator),
  groupController.joinGroupSession
);

/**
 * @route   POST /api/v1/group-sessions/:id/leave
 * @desc    Leave a group session
 * @access  Private (Mentee)
 */
router.post('/:id/leave', AuthMiddleware.authenticate as any, groupController.leaveGroupSession);

/**
 * @route   POST /api/v1/group-sessions/:id/start
 * @desc    Start group session (Mentor only)
 * @access  Private (Mentor)
 */
router.post('/:id/start', AuthMiddleware.authenticate as any, groupController.startGroupSession);

/**
 * @route   POST /api/v1/group-sessions/:id/complete
 * @desc    Complete group session (Mentor only)
 * @access  Private (Mentor)
 */
router.post(
  '/:id/complete',
  AuthMiddleware.authenticate as any,
  validateJoi(completeGroupSessionValidator),
  groupController.completeGroupSession
);

/**
 * @route   POST /api/v1/group-sessions/:id/cancel
 * @desc    Cancel group session (Mentor only)
 * @access  Private (Mentor)
 */
router.post(
  '/:id/cancel',
  AuthMiddleware.authenticate as any,
  validateJoi(cancelGroupSessionValidator),
  groupController.cancelGroupSession
);

/**
 * @route   POST /api/v1/group-sessions/:id/feedback
 * @desc    Add feedback to group session
 * @access  Private (Mentee)
 */
router.post(
  '/:id/feedback',
  AuthMiddleware.authenticate as any,
  validateJoi(addFeedbackValidator),
  groupController.addFeedback
);

export default router;