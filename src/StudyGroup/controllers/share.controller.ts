// controllers/share.controller.ts

import { Request, Response } from 'express';
import shareService from '../services/share.service';
import ResponseUtil from '@/shared/response.util';
import { asyncHandler } from '@/shared/utils/helpers.util';
import { AuthenticationError, BadRequestError, NotFoundError } from '@/shared/errors/app.error';
import { LoggerUtil } from '@/shared/logger.util';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';

const assertGroupId = (groupId: string | undefined): string => {
  if (!groupId) throw new BadRequestError('Group ID is required');
  return groupId;
};

const assertInviteCode = (inviteCode: string | undefined): string => {
  if (!inviteCode) throw new BadRequestError('Invite code is required');
  return inviteCode;
};

const assertUserId = (userId: string | undefined): string => {
  if (!userId) throw new AuthenticationError('User authentication required');
  return userId;
};

export const generateInviteLink = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.userId;   // was: (req as any).userId
  const { expiresInHours, maxUses } = req.body;

  const validGroupId = assertGroupId(groupId);
  const validUserId = assertUserId(userId);

  if (expiresInHours !== undefined) {
    const hours = Number(expiresInHours);
    if (isNaN(hours) || hours <= 0 || hours > 8760) {
      throw new BadRequestError('Expires in hours must be between 1 and 8760');
    }
  }

  if (maxUses !== undefined) {
    const uses = Number(maxUses);
    if (isNaN(uses) || uses <= 0 || uses > 10000) {
      throw new BadRequestError('Max uses must be between 1 and 10000');
    }
  }

  const result = await shareService.generateInviteLink(validGroupId, validUserId, {
    expiresInHours: expiresInHours ? Number(expiresInHours) : undefined,
    maxUses: maxUses ? Number(maxUses) : undefined,
  });

  return ResponseUtil.created(res, result, 'Invite link generated successfully');
});

export const generateQRCode = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.userId;   // was: (req as any).userId

  const validGroupId = assertGroupId(groupId);
  const validUserId = assertUserId(userId);

  const result = await shareService.generateGroupQRCode(validGroupId, validUserId);
  return ResponseUtil.created(res, result, 'QR code generated successfully');
});

export const validateInviteCode = asyncHandler(async (req: Request, res: Response) => {
  const { inviteCode } = req.params;
  const validInviteCode = assertInviteCode(inviteCode);

  // Track click — non-blocking
  shareService.trackInviteClick(validInviteCode).catch(err => {
    LoggerUtil.error('Failed to track invite click', { error: err.message, inviteCode: validInviteCode });
  });

  const result = await shareService.validateInviteCode(validInviteCode);

  if (!result.isValid) {
    return ResponseUtil.badRequest(res, result.message || 'Invalid invite code');
  }

  return ResponseUtil.success(res, { groupId: result.groupId }, 'Invite code is valid');
});

export const getSocialShareLinks = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.userId;   // was: (req as any).userId

  const validGroupId = assertGroupId(groupId);
  const validUserId = assertUserId(userId);

  const { inviteLink, groupName } = await shareService.getGroupInviteLinkAndName(
    validGroupId,
    validUserId
  );

  const socialLinks = shareService.generateSocialShareLinks(inviteLink, groupName);

  return ResponseUtil.success(res, { inviteLink, socialLinks }, 'Social share links generated successfully');
});

export const getInviteAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  const validGroupId = assertGroupId(groupId);
  const validUserId = assertUserId(userId);

  const analytics = await shareService.getInviteAnalytics(validGroupId, validUserId);
  return ResponseUtil.success(res, analytics, 'Analytics fetched successfully');
});

export const getGroupInviteLinks = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  const validGroupId = assertGroupId(groupId);
  const validUserId = assertUserId(userId);

  const links = await shareService.getGroupInviteLinks(validGroupId, validUserId);
  return ResponseUtil.success(res, { inviteLinks: links, total: links.length }, 'Invite links fetched successfully');
});

export const revokeInviteLink = asyncHandler(async (req: Request, res: Response) => {
  const { inviteCode } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  const validInviteCode = assertInviteCode(inviteCode);
  const validUserId = assertUserId(userId);

  await shareService.revokeInviteLink(validInviteCode, validUserId);
  return ResponseUtil.success(res, null, 'Invite link revoked successfully');
});

export const trackSuccessfulJoin = asyncHandler(async (req: Request, res: Response) => {
  const { inviteCode } = req.params;
  const validInviteCode = assertInviteCode(inviteCode);

  await shareService.trackSuccessfulJoin(validInviteCode);
  return ResponseUtil.success(res, null, 'Join tracked successfully');
});

export const getInviteLinkDetails = asyncHandler(async (req: Request, res: Response) => {
  const { inviteCode } = req.params;
  const userId = (req as AuthRequest).user?.userId;

  const validInviteCode = assertInviteCode(inviteCode);
  const validUserId = assertUserId(userId);

  const details = await shareService.getInviteLinkDetails(validInviteCode, validUserId);
  return ResponseUtil.success(res, details, 'Invite link details fetched successfully');
});

export default {
  generateInviteLink, generateQRCode, validateInviteCode,
  getSocialShareLinks, getInviteAnalytics, getGroupInviteLinks,
  revokeInviteLink, trackSuccessfulJoin, getInviteLinkDetails,
};

// /**
//  * ====================================
//  * SHARE CONTROLLER
//  * ====================================
//  * Handle invite links and QR codes
//  * Production-ready for 100k+ users
//  */

// import { Request, Response } from 'express';
// import shareService from '../services/share.service';
// import ResponseUtil, { HttpStatus } from '@/shared/response.util';
// import { asyncHandler, AuthenticationError, BadRequestError, NotFoundError } from '@/shared/errors/app.error';
// import { LoggerUtil } from '@/shared/logger.util';
// import { AuthRequest } from '@/shared/middlewares/auth.middleware';

// /**
//  * Validate and assert group ID
//  */
// const assertGroupId = (groupId: string | undefined): string => {
//   if (!groupId) {
//     throw new BadRequestError('Group ID is required');
//   }
//   return groupId;
// };

// /**
//  * Validate and assert invite code
//  */
// const assertInviteCode = (inviteCode: string | undefined): string => {
//   if (!inviteCode) {
//     throw new BadRequestError('Invite code is required');
//   }
//   return inviteCode;
// };

// /**
//  * Validate and assert user ID
//  */
// const assertUserId = (userId: string | undefined): string => {
//   if (!userId) {
//     throw new AuthenticationError( 'User authentication required');
//   }
//   return userId;
// };

// /**
//  * Generate invite link for group
//  * POST /api/share/:groupId/generate-link
//  * @body { expiresInHours?: number, maxUses?: number }
//  */
// export const generateInviteLink = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { groupId } = req.params;
//     const userId = (req as AuthRequest).user?.id;
//     const { expiresInHours, maxUses } = req.body;

//     // Assert and validate required parameters
//     const validGroupId = assertGroupId(groupId);
//     const validUserId = assertUserId(userId);

//     // Validate optional parameters
//     if (expiresInHours !== undefined) {
//       const hours = Number(expiresInHours);
//       if (isNaN(hours) || hours <= 0 || hours > 8760) { // Max 1 year
//         throw new BadRequestError('Expires in hours must be between 1 and 8760 (1 year)');
//       }
//     }

//     if (maxUses !== undefined) {
//       const uses = Number(maxUses);
//       if (isNaN(uses) || uses <= 0 || uses > 10000) {
//         throw new BadRequestError('Max uses must be between 1 and 10000');
//       }
//     }

//     LoggerUtil.info('Generating invite link', { 
//       groupId: validGroupId, 
//       userId: validUserId, 
//       expiresInHours, 
//       maxUses 
//     });

//     const result = await shareService.generateInviteLink(validGroupId, validUserId, {
//       expiresInHours: expiresInHours ? Number(expiresInHours) : undefined,
//       maxUses: maxUses ? Number(maxUses) : undefined,
//     });

//     return ResponseUtil.success(
//       res,
//       result,
//       'Invite link generated successfully',
//       HttpStatus.CREATED
//     );
//   }
// );

// /**
//  * Generate QR code for group
//  * POST /api/share/:groupId/generate-qr
//  */
// export const generateQRCode = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { groupId } = req.params;
//     const userId = (req as AuthRequest).user?.id;

//     // Assert and validate required parameters
//     const validGroupId = assertGroupId(groupId);
//     const validUserId = assertUserId(userId);

//     LoggerUtil.info('Generating QR code', { groupId: validGroupId, userId: validUserId });

//     const result = await shareService.generateGroupQRCode(validGroupId, validUserId);

//     return ResponseUtil.success(
//       res,
//       result,
//       'QR code generated successfully',
//       HttpStatus.CREATED
//     );
//   }
// );

// /**
//  * Validate invite code
//  * GET /api/share/validate/:inviteCode
//  */
// export const validateInviteCode = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { inviteCode } = req.params;

//     // Assert and validate required parameters
//     const validInviteCode = assertInviteCode(inviteCode);

//     LoggerUtil.info('Validating invite code', { inviteCode: validInviteCode });

//     // Track click (non-blocking)
//     shareService.trackInviteClick(validInviteCode).catch(err => {
//       LoggerUtil.error('Failed to track invite click', { error: err.message, inviteCode: validInviteCode });
//     });

//     const result = await shareService.validateInviteCode(validInviteCode);

//     if (!result.isValid) {
//       return ResponseUtil.badRequest(
//         res,
//         result.message || 'Invalid invite code',
//         // HttpStatus.BAD_REQUEST
//       );
//     }

//     return ResponseUtil.success(
//       res,
//       { groupId: result.groupId },
//       'Invite code is valid'
//     );
//   }
// );

// /**
//  * Get social share links
//  * GET /api/share/:groupId/social-links
//  */
// export const getSocialShareLinks = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { groupId } = req.params;
//     const userId = (req as AuthRequest).user?.id;

//     // Assert and validate required parameters
//     const validGroupId = assertGroupId(groupId);
//     const validUserId = assertUserId(userId);

//     LoggerUtil.info('Generating social share links', { groupId: validGroupId, userId: validUserId });

//     // Generate invite link first
//     const { inviteLink } = await shareService.generateInviteLink(
//       validGroupId,
//       validUserId
//     );

//     // Get group details
//     const Group = (await import('../models/Group.model')).default;
//     const group = await Group.findById(validGroupId).select('title');

//     if (!group) {
//       throw new NotFoundError( 'Group not found');
//     }

//     // Generate social share links
//     const socialLinks = shareService.generateSocialShareLinks(
//       inviteLink,
//       group.title
//     );

//     return ResponseUtil.success(
//       res,
//       {
//         inviteLink,
//         socialLinks,
//       },
//       'Social share links generated successfully'
//     );
//   }
// );

// /**
//  * Get invite analytics
//  * GET /api/share/:groupId/analytics
//  */
// export const getInviteAnalytics = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { groupId } = req.params;
//     const userId = (req as AuthRequest).user?.id;

//     // Assert and validate required parameters
//     const validGroupId = assertGroupId(groupId);
//     const validUserId = assertUserId(userId);

//     LoggerUtil.info('Fetching invite analytics', { groupId: validGroupId, userId: validUserId });

//     const analytics = await shareService.getInviteAnalytics(validGroupId, validUserId);

//     return ResponseUtil.success(
//       res,
//       analytics,
//       'Analytics fetched successfully'
//     );
//   }
// );

// /**
//  * Get all invite links for group
//  * GET /api/share/:groupId/links
//  */
// export const getGroupInviteLinks = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { groupId } = req.params;
//     const userId = (req as AuthRequest).user?.id;

//     // Assert and validate required parameters
//     const validGroupId = assertGroupId(groupId);
//     const validUserId = assertUserId(userId);

//     LoggerUtil.info('Fetching group invite links', { groupId: validGroupId, userId: validUserId });

//     const links = await shareService.getGroupInviteLinks(validGroupId, validUserId);

//     return ResponseUtil.success(
//       res,
//       { 
//         inviteLinks: links,
//         total: links.length 
//       },
//       'Invite links fetched successfully'
//     );
//   }
// );

// /**
//  * Revoke invite link
//  * DELETE /api/share/:inviteCode/revoke
//  */
// export const revokeInviteLink = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { inviteCode } = req.params;
//     const userId = (req as AuthRequest).user?.id;

//     // Assert and validate required parameters
//     const validInviteCode = assertInviteCode(inviteCode);
//     const validUserId = assertUserId(userId);

//     LoggerUtil.info('Revoking invite link', { inviteCode: validInviteCode, userId: validUserId });

//     await shareService.revokeInviteLink(validInviteCode, validUserId);

//     return ResponseUtil.success(
//       res,
//       null,
//       'Invite link revoked successfully'
//     );
//   }
// );

// /**
//  * Track successful join from invite
//  * POST /api/share/:inviteCode/track-join
//  */
// export const trackSuccessfulJoin = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { inviteCode } = req.params;

//     // Assert and validate required parameters
//     const validInviteCode = assertInviteCode(inviteCode);

//     LoggerUtil.info('Tracking successful join', { inviteCode: validInviteCode });

//     await shareService.trackSuccessfulJoin(validInviteCode);

//     return ResponseUtil.success(
//       res,
//       null,
//       'Join tracked successfully'
//     );
//   }
// );

// /**
//  * Get invite link details
//  * GET /api/share/invite/:inviteCode/details
//  */
// export const getInviteLinkDetails = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { inviteCode } = req.params;
//     const userId = (req as AuthRequest).user?.id;

//     // Assert and validate required parameters
//     const validInviteCode = assertInviteCode(inviteCode);
//     const validUserId = assertUserId(userId);

//     LoggerUtil.info('Fetching invite link details', { inviteCode: validInviteCode, userId: validUserId });

//     const details = await shareService.getInviteLinkDetails(validInviteCode, validUserId);

//     return ResponseUtil.success(
//       res,
//       details,
//       'Invite link details fetched successfully'
//     );
//   }
// );

// export default {
//   generateInviteLink,
//   generateQRCode,
//   validateInviteCode,
//   getSocialShareLinks,
//   getInviteAnalytics,
//   getGroupInviteLinks,
//   revokeInviteLink,
//   trackSuccessfulJoin,
//   getInviteLinkDetails,
// };