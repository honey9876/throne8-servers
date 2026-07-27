/**
 * ====================================
 * MODERATION ROUTES (PRODUCTION READY)
 * ====================================
 * Features:
 * - Group rules management
 * - Member moderation (kick, ban, warn)
 * - Moderator assignment
 * - Reporting system
 * 
 * Optimized for 100K+ users
 */

import express from 'express';
import rateLimit from 'express-rate-limit';

// Middleware
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validation } from '@/shared/middlewares/validation.middleware';

// Controllers
import {
  setGroupRules,
  getGroupRules,
  kickMember,
  banMember,
  unbanMember,
  warnMember,
  assignModerator,
  removeModerator,
  reportUser,
  reportMessage,
  getReports,
} from '../controllers/moderation.controller';

// Validators (Joi Schemas)
import {
  setRulesSchema,
  getRulesSchema,
  kickMemberSchema,
  banMemberSchema,
  unbanMemberSchema,
  warnMemberSchema,
  assignModeratorSchema,
  removeModeratorSchema,
  reportUserSchema,
  reportMessageSchema,
  getReportsSchema,
} from '../validators/moderation.validator';

const router = express.Router();

/**
 * ============================================
 * RATE LIMITERS
 * ============================================
 */

// Strict rate limit for moderation actions (prevent abuse)
const moderationActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 moderation actions per 15 minutes
  message: 'Too many moderation actions, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for reporting
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 reports per hour (prevent spam reports)
  message: 'Too many reports, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * ============================================
 * GROUP RULES ROUTES
 * ============================================
 */

// Set group rules (Leader only)
router.post(
  '/:groupId/set-rules',
  AuthMiddleware.authenticate as any,
  moderationActionLimiter,
  validation(setRulesSchema, 'params'),
  validation(setRulesSchema, 'body'),
  setGroupRules
);

// Get group rules (Any member)
router.get(
  '/:groupId/rules',
  AuthMiddleware.authenticate as any,
  validation(getRulesSchema, 'params'),
  getGroupRules
);

/**
 * ============================================
 * MEMBER MODERATION ROUTES
 * ============================================
 */

// Kick member (Leader or Moderator)
router.post(
  '/:groupId/kick/:userId',
  AuthMiddleware.authenticate as any,
  moderationActionLimiter,
  validation(kickMemberSchema, 'params'),
  kickMember
);

// Ban member (Leader only)
router.post(
  '/:groupId/ban/:userId',
  AuthMiddleware.authenticate as any,
  moderationActionLimiter,
  validation(banMemberSchema, 'params'),
  validation(banMemberSchema, 'body'),
  banMember
);

// Unban member (Leader only)
router.post(
  '/:groupId/unban/:userId',
  AuthMiddleware.authenticate as any,
  moderationActionLimiter,
  validation(unbanMemberSchema, 'params'),
  unbanMember
);

// Warn member (Leader or Moderator)
router.post(
  '/:groupId/warn/:userId',
  AuthMiddleware.authenticate as any,
  moderationActionLimiter,
  validation(warnMemberSchema, 'params'),
  validation(warnMemberSchema, 'body'),
  warnMember
);

/**
 * ============================================
 * MODERATOR MANAGEMENT ROUTES
 * ============================================
 */

// Assign moderator (Leader only)
router.post(
  '/:groupId/assign-moderator/:userId',
  AuthMiddleware.authenticate as any,
  moderationActionLimiter,
  validation(assignModeratorSchema, 'params'),
  assignModerator
);

// Remove moderator (Leader only)
router.post(
  '/:groupId/remove-moderator/:userId',
  AuthMiddleware.authenticate as any,
  moderationActionLimiter,
  validation(removeModeratorSchema, 'params'),
  removeModerator
);

/**
 * ============================================
 * REPORTING ROUTES
 * ============================================
 */

// Report user
router.post(
  '/report-user',
  AuthMiddleware.authenticate as any,
  reportLimiter,
  validation(reportUserSchema, 'body'),
  reportUser
);

// Report message
router.post(
  '/report-message',
  AuthMiddleware.authenticate as any,
  reportLimiter,
  validation(reportMessageSchema, 'body'),
  reportMessage
);

// Get reports (Leader or Moderator only)
router.get(
  '/:groupId/reports',
  AuthMiddleware.authenticate as any,
  validation(getReportsSchema, 'params'),
  validation(getReportsSchema, 'query'),
  getReports
);

/**
 * ============================================
 * EXPORT ROUTER
 * ============================================
 */
export default router;