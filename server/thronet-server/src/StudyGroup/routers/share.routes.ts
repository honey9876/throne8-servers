/**
 * ====================================
 * SHARE ROUTES
 * ====================================
 * Routes for invite links and QR codes
 */

import express from 'express';
import shareController  from '../controllers/share.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = express.Router();

/**
 * ============================================
 * PROTECTED ROUTES (Require Authentication)
 * ============================================
 */

/**
 * Generate invite link for group
 * POST /api/share/:groupId/generate-link
 */
router.post('/:groupId/generate-link',
   AuthMiddleware.authenticate as any,
    shareController.generateInviteLink
  );

/**
 * Generate QR code for group
 * POST /api/share/:groupId/generate-qr
 */
router.post('/:groupId/generate-qr',
   AuthMiddleware.authenticate as any,
    shareController.generateQRCode
  );

/**
 * Get social share links
 * GET /api/share/:groupId/social-links
 */
router.get('/:groupId/social-links',
   AuthMiddleware.authenticate as any,
    shareController.getSocialShareLinks
  );

/**
 * Get invite analytics
 * GET /api/share/:groupId/analytics
 */
router.get('/:groupId/analytics',
   AuthMiddleware.authenticate as any,
    shareController.getInviteAnalytics
  );

/**
 * Get all invite links for group
 * GET /api/share/:groupId/links
 */
router.get('/:groupId/links',
   AuthMiddleware.authenticate as any,
    shareController.getGroupInviteLinks
  );

/**
 * Revoke invite link
 * DELETE /api/share/:inviteCode/revoke
 */
router.delete('/:inviteCode/revoke',
   AuthMiddleware.authenticate as any,
    shareController.revokeInviteLink
  );

/**
 * ============================================
 * PUBLIC ROUTES (No Authentication Required)
 * ============================================
 */

/**
 * Validate invite code (public)
 * GET /api/share/validate/:inviteCode
 */
router.get('/validate/:inviteCode', shareController.validateInviteCode);

/**
 * Track successful join from invite
 * POST /api/share/:inviteCode/track-join
 */
router.post('/:inviteCode/track-join', shareController.trackSuccessfulJoin);

export default router;