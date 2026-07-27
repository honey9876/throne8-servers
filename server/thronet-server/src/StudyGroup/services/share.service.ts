// services/share.service.ts

import crypto from 'crypto';
import groupRepository from '../repositories/group.repository';
import { NotFoundError, ForbiddenError, BadRequestError } from '@/shared/errors/app.error';
import { LoggerUtil } from '@/shared/logger.util';
import qrCodeService from './qrCode.service';

// ===================================
// INTERFACES — UUID strings, no ObjectId
// ===================================

interface InviteLink {
  groupId: string;          // was: Types.ObjectId
  code: string;
  createdBy: string;        // was: Types.ObjectId
  createdAt: Date;
  expiresAt: Date | null;
  maxUses: number | null;
  currentUses: number;
  clicks: number;
  successfulJoins: number;
}

interface GenerateInviteLinkOptions {
  expiresInHours?: number;
  maxUses?: number;
}

interface InviteAnalytics {
  totalInvites: number;
  totalClicks: number;
  totalJoins: number;
  conversionRate: number;
  activeInvites: number;
  expiredInvites: number;
}

interface SocialShareLinks {
  whatsapp: string;
  telegram: string;
  twitter: string;
  facebook: string;
}

// In-memory store (production mein Redis use karo)
const inviteLinks: Map<string, InviteLink> = new Map();

class ShareService {
  private readonly INVITE_CODE_LENGTH = 6;
  private readonly MAX_EXPIRY_HOURS = 8760;
  private readonly MAX_USES_LIMIT = 10000;
  private readonly MIN_GROUP_NAME_LENGTH = 1;
  private readonly MAX_GROUP_NAME_LENGTH = 100;

  private generateInviteCode(): string {
    return crypto.randomBytes(this.INVITE_CODE_LENGTH).toString('hex').toUpperCase();
  }

  private async generateUniqueInviteCode(): Promise<string> {
    let attempts = 0;
    while (attempts < 10) {
      const code = this.generateInviteCode();
      if (!inviteLinks.has(code)) return code;
      attempts++;
    }
    throw new Error('Failed to generate unique invite code');
  }

  private validateGenerateOptions(options?: GenerateInviteLinkOptions): void {
    if (options?.expiresInHours !== undefined) {
      if (options.expiresInHours <= 0 || options.expiresInHours > this.MAX_EXPIRY_HOURS) {
        throw new BadRequestError(`Expiry hours must be between 1 and ${this.MAX_EXPIRY_HOURS}`);
      }
    }
    if (options?.maxUses !== undefined) {
      if (options.maxUses <= 0 || options.maxUses > this.MAX_USES_LIMIT) {
        throw new BadRequestError(`Max uses must be between 1 and ${this.MAX_USES_LIMIT}`);
      }
    }
  }

  async generateInviteLink(
    groupId: string,          // was: string | Types.ObjectId
    userId: string,           // was: string | Types.ObjectId
    options?: GenerateInviteLinkOptions
  ): Promise<{ inviteLink: string; inviteCode: string; expiresAt: Date | null; maxUses: number | null }> {
    try {
      this.validateGenerateOptions(options);

      // Group existence + leader check — repository se
      const group = await groupRepository.findByGroupId(groupId);
      if (!group) throw new NotFoundError('Group not found');

      // leaderId field — UUID string comparison
      if (group.leaderId !== userId) {
        throw new ForbiddenError('Only group leader can generate invite links');
      }

      const inviteCode = await this.generateUniqueInviteCode();

      let expiresAt: Date | null = null;
      if (options?.expiresInHours) {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + options.expiresInHours);
      }

      const inviteLinkData: InviteLink = {
        groupId,              // UUID string
        code: inviteCode,
        createdBy: userId,    // UUID string
        createdAt: new Date(),
        expiresAt,
        maxUses: options?.maxUses || null,
        currentUses: 0,
        clicks: 0,
        successfulJoins: 0,
      };

      inviteLinks.set(inviteCode, inviteLinkData);

      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const inviteLink = `${baseUrl}/invite/${inviteCode}`;

      LoggerUtil.info('Invite link generated', { groupId, inviteCode, userId });

      return { inviteLink, inviteCode, expiresAt, maxUses: options?.maxUses || null };
    } catch (error: any) {
      LoggerUtil.error('Error generating invite link', { error: error.message, groupId, userId });
      throw error;
    }
  }

  async generateGroupQRCode(groupId: string, userId: string): Promise<{
    qrCode: string; inviteLink: string; inviteCode: string;
  }> {
    try {
      const { inviteLink, inviteCode } = await this.generateInviteLink(groupId, userId);
      const qrCode = await qrCodeService.generateGroupInviteQR(inviteLink);
      LoggerUtil.info('QR code generated', { groupId, inviteCode });
      return { qrCode, inviteLink, inviteCode };
    } catch (error: any) {
      LoggerUtil.error('Error generating QR code', { error: error.message, groupId });
      throw error;
    }
  }

  async validateInviteCode(inviteCode: string): Promise<{
    isValid: boolean; groupId?: string; message?: string;
  }> {
    try {
      const inviteData = inviteLinks.get(inviteCode);
      if (!inviteData) return { isValid: false, message: 'Invalid invite code' };

      if (inviteData.expiresAt && inviteData.expiresAt < new Date()) {
        return { isValid: false, message: 'Invite link has expired' };
      }

      if (inviteData.maxUses && inviteData.currentUses >= inviteData.maxUses) {
        return { isValid: false, message: 'Invite link has reached maximum uses' };
      }

      // Group still exists check
      const group = await groupRepository.findByGroupId(inviteData.groupId);
      if (!group) return { isValid: false, message: 'Group no longer exists' };

      return { isValid: true, groupId: inviteData.groupId };
    } catch (error: any) {
      LoggerUtil.error('Error validating invite code', { error: error.message, inviteCode });
      throw error;
    }
  }

  async trackInviteClick(inviteCode: string): Promise<void> {
    try {
      const inviteData = inviteLinks.get(inviteCode);
      if (inviteData) {
        inviteData.clicks += 1;
        inviteLinks.set(inviteCode, inviteData);
      }
    } catch (error: any) {
      LoggerUtil.error('Error tracking invite click', { error: error.message, inviteCode });
    }
  }

  async trackSuccessfulJoin(inviteCode: string): Promise<void> {
    try {
      const inviteData = inviteLinks.get(inviteCode);
      if (inviteData) {
        inviteData.currentUses += 1;
        inviteData.successfulJoins += 1;
        inviteLinks.set(inviteCode, inviteData);
      }
    } catch (error: any) {
      LoggerUtil.error('Error tracking join', { error: error.message, inviteCode });
    }
  }

  async getInviteAnalytics(groupId: string, userId: string): Promise<InviteAnalytics> {
    try {
      const group = await groupRepository.findByGroupId(groupId);
      if (!group) throw new NotFoundError('Group not found');

      // leaderId — string comparison
      if (group.leaderId !== userId) {
        throw new ForbiddenError('Only group leader can view analytics');
      }

      const groupInvites = Array.from(inviteLinks.values()).filter(
        invite => invite.groupId === groupId    // string comparison ✅
      );

      const totalInvites = groupInvites.length;
      const totalClicks = groupInvites.reduce((sum, inv) => sum + inv.clicks, 0);
      const totalJoins = groupInvites.reduce((sum, inv) => sum + inv.successfulJoins, 0);
      const conversionRate = totalClicks > 0 ? (totalJoins / totalClicks) * 100 : 0;

      const now = new Date();
      const activeInvites = groupInvites.filter(inv =>
        (!inv.expiresAt || inv.expiresAt > now) &&
        (!inv.maxUses || inv.currentUses < inv.maxUses)
      ).length;

      return {
        totalInvites, totalClicks, totalJoins,
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        activeInvites,
        expiredInvites: totalInvites - activeInvites,
      };
    } catch (error: any) {
      LoggerUtil.error('Error getting invite analytics', { error: error.message, groupId });
      throw error;
    }
  }

  async revokeInviteLink(inviteCode: string, userId: string): Promise<void> {
    try {
      const inviteData = inviteLinks.get(inviteCode);
      if (!inviteData) throw new NotFoundError('Invite link not found');

      // Creator ya group leader — string comparison
      if (inviteData.createdBy !== userId) {
        const group = await groupRepository.findByGroupId(inviteData.groupId);
        if (!group || group.leaderId !== userId) {
          throw new ForbiddenError('Not authorized to revoke this invite');
        }
      }

      inviteLinks.delete(inviteCode);
      LoggerUtil.info('Invite link revoked', { inviteCode, userId });
    } catch (error: any) {
      LoggerUtil.error('Error revoking invite link', { error: error.message, inviteCode });
      throw error;
    }
  }

  generateSocialShareLinks(inviteLink: string, groupName: string): SocialShareLinks {
    if (!inviteLink || !groupName) {
      throw new BadRequestError('Invite link and group name are required');
    }
    if (groupName.length < this.MIN_GROUP_NAME_LENGTH || groupName.length > this.MAX_GROUP_NAME_LENGTH) {
      throw new BadRequestError(`Group name must be between ${this.MIN_GROUP_NAME_LENGTH} and ${this.MAX_GROUP_NAME_LENGTH} characters`);
    }

    const message = `Join my study group "${groupName}" on StudyGroup App!`;
    const encodedMessage = encodeURIComponent(message);
    const encodedLink = encodeURIComponent(inviteLink);

    return {
      whatsapp: `https://wa.me/?text=${encodedMessage}%20${encodedLink}`,
      telegram: `https://t.me/share/url?url=${encodedLink}&text=${encodedMessage}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodedMessage}&url=${encodedLink}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`,
    };
  }

  // Controller ke liye — getSocialShareLinks mein Group.findById replace
  async getGroupInviteLinkAndName(
    groupId: string,
    userId: string
  ): Promise<{ inviteLink: string; groupName: string }> {
    const { inviteLink } = await this.generateInviteLink(groupId, userId);
    const group = await groupRepository.findByGroupId(groupId);
    if (!group) throw new NotFoundError('Group not found');
    return { inviteLink, groupName: group.title };
  }

  async getGroupInviteLinks(groupId: string, userId: string): Promise<any[]> {
    try {
      const group = await groupRepository.findByGroupId(groupId);
      if (!group) throw new NotFoundError('Group not found');

      if (group.leaderId !== userId) {
        throw new ForbiddenError('Only group leader can view invite links');
      }

      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const now = new Date();

      return Array.from(inviteLinks.entries())
        .filter(([_, invite]) => invite.groupId === groupId)    // string comparison ✅
        .map(([code, invite]) => ({
          inviteCode: code,
          inviteLink: `${baseUrl}/invite/${code}`,
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
          maxUses: invite.maxUses,
          currentUses: invite.currentUses,
          clicks: invite.clicks,
          successfulJoins: invite.successfulJoins,
          conversionRate: invite.clicks > 0
            ? parseFloat(((invite.successfulJoins / invite.clicks) * 100).toFixed(2))
            : 0,
          isActive:
            (!invite.expiresAt || invite.expiresAt > now) &&
            (!invite.maxUses || invite.currentUses < invite.maxUses),
        }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error: any) {
      LoggerUtil.error('Error getting group invite links', { error: error.message, groupId });
      throw error;
    }
  }

  async getInviteLinkDetails(inviteCode: string, userId: string): Promise<any> {
    try {
      const inviteData = inviteLinks.get(inviteCode);
      if (!inviteData) throw new NotFoundError('Invite link not found');

      const group = await groupRepository.findByGroupId(inviteData.groupId);
      if (!group) throw new NotFoundError('Group not found');

      // Creator ya leader — string comparison
      if (inviteData.createdBy !== userId && group.leaderId !== userId) {
        throw new ForbiddenError('Not authorized to view this invite link');
      }

      const now = new Date();
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      return {
        inviteCode,
        inviteLink: `${baseUrl}/invite/${inviteCode}`,
        groupId: inviteData.groupId,
        groupName: group.title,
        createdBy: inviteData.createdBy,
        createdAt: inviteData.createdAt,
        expiresAt: inviteData.expiresAt,
        maxUses: inviteData.maxUses,
        currentUses: inviteData.currentUses,
        clicks: inviteData.clicks,
        successfulJoins: inviteData.successfulJoins,
        conversionRate: inviteData.clicks > 0
          ? parseFloat(((inviteData.successfulJoins / inviteData.clicks) * 100).toFixed(2))
          : 0,
        isActive:
          (!inviteData.expiresAt || inviteData.expiresAt > now) &&
          (!inviteData.maxUses || inviteData.currentUses < inviteData.maxUses),
      };
    } catch (error: any) {
      LoggerUtil.error('Error getting invite link details', { error: error.message, inviteCode });
      throw error;
    }
  }

  async cleanupExpiredInvites(): Promise<number> {
    try {
      const now = new Date();
      let deletedCount = 0;
      for (const [code, invite] of inviteLinks.entries()) {
        if (invite.expiresAt && invite.expiresAt < now) {
          inviteLinks.delete(code);
          deletedCount++;
        }
      }
      if (deletedCount > 0) LoggerUtil.info('Expired invites cleaned up', { deletedCount });
      return deletedCount;
    } catch (error: any) {
      LoggerUtil.error('Error cleaning up expired invites', { error: error.message });
      return 0;
    }
  }
}

export default new ShareService();

// /**
//  * ====================================
//  * SHARE SERVICE
//  * ====================================
//  * Manage invite links and share analytics
//  * Production-ready for 100k+ users with Redis caching
//  */

// import crypto from 'crypto';
// import Group from '../models/Group.model';
// // import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/apiError';
// import { NotFoundError, ForbiddenError, BadRequestError } from '@/shared/errors/app.error';
// import { LoggerUtil } from '@/shared/logger.util';
// import qrCodeService from './qrCode.service';
// import { Types } from 'mongoose';

// // ===================================
// // INTERFACES
// // ===================================

// interface InviteLink {
//   groupId: Types.ObjectId;
//   code: string;
//   createdBy: Types.ObjectId;
//   createdAt: Date;
//   expiresAt: Date | null;
//   maxUses: number | null;
//   currentUses: number;
//   clicks: number;
//   successfulJoins: number;
// }

// interface GenerateInviteLinkOptions {
//   expiresInHours?: number;
//   maxUses?: number;
// }

// interface InviteAnalytics {
//   totalInvites: number;
//   totalClicks: number;
//   totalJoins: number;
//   conversionRate: number;
//   activeInvites: number;
//   expiredInvites: number;
// }

// interface SocialShareLinks {
//   whatsapp: string;
//   telegram: string;
//   twitter: string;
//   facebook: string;
// }

// // ===================================
// // IN-MEMORY STORE (For Development)
// // In production, replace with Redis
// // ===================================

// const inviteLinks: Map<string, InviteLink> = new Map();

// // TODO: For production with 100k+ users, integrate Redis:
// /*
// import Redis from 'ioredis';
// const redis = new Redis({
//   host: process.env.REDIS_HOST || 'localhost',
//   port: parseInt(process.env.REDIS_PORT || '6379'),
//   password: process.env.REDIS_PASSWORD,
//   db: 0,
//   retryStrategy: (times: number) => {
//     const delay = Math.min(times * 50, 2000);
//     return delay;
//   },
// });
// */

// class ShareService {
//   // Constants for validation
//   private readonly INVITE_CODE_LENGTH = 6;
//   private readonly MAX_EXPIRY_HOURS = 8760; // 1 year
//   private readonly MAX_USES_LIMIT = 10000;
//   private readonly MIN_GROUP_NAME_LENGTH = 1;
//   private readonly MAX_GROUP_NAME_LENGTH = 100;

//   /**
//    * Generate cryptographically secure invite code
//    * @returns string - Unique 12-character uppercase code
//    */
//   private generateInviteCode(): string {
//     return crypto
//       .randomBytes(this.INVITE_CODE_LENGTH)
//       .toString('hex')
//       .toUpperCase();
//   }

//   /**
//    * Ensure invite code is unique
//    * @returns string - Unique invite code
//    */
//   private async generateUniqueInviteCode(): Promise<string> {
//     let attempts = 0;
//     const maxAttempts = 10;

//     while (attempts < maxAttempts) {
//       const code = this.generateInviteCode();
      
//       // Check if code already exists
//       if (!inviteLinks.has(code)) {
//         return code;
//       }
      
//       attempts++;
//       LoggerUtil.warn('Invite code collision detected, regenerating', { attempt: attempts });
//     }

//     throw new Error('Failed to generate unique invite code after multiple attempts');
//   }

//   /**
//    * Validate generate invite link options
//    */
//   private validateGenerateOptions(options?: GenerateInviteLinkOptions): void {
//     if (options?.expiresInHours !== undefined) {
//       if (options.expiresInHours <= 0 || options.expiresInHours > this.MAX_EXPIRY_HOURS) {
//         throw new BadRequestError(
//           `Expiry hours must be between 1 and ${this.MAX_EXPIRY_HOURS}`
//         );
//       }
//     }

//     if (options?.maxUses !== undefined) {
//       if (options.maxUses <= 0 || options.maxUses > this.MAX_USES_LIMIT) {
//         throw new BadRequestError(
//           `Max uses must be between 1 and ${this.MAX_USES_LIMIT}`
//         );
//       }
//     }
//   }

//   /**
//    * Generate invite link for group
//    * @param groupId - Group ID (string or ObjectId)
//    * @param userId - User ID (string or ObjectId)
//    * @param options - Optional expiry and max uses
//    * @returns Promise with invite details
//    */
//   async generateInviteLink(
//     groupId: string | Types.ObjectId,
//     userId: string | Types.ObjectId,
//     options?: GenerateInviteLinkOptions
//   ): Promise<{
//     inviteLink: string;
//     inviteCode: string;
//     expiresAt: Date | null;
//     maxUses: number | null;
//   }> {
//     try {
//       // Validate options
//       this.validateGenerateOptions(options);

//       // Convert to ObjectId if string
//       const groupObjectId = typeof groupId === 'string' 
//         ? new Types.ObjectId(groupId) 
//         : groupId;
      
//       const userObjectId = typeof userId === 'string'
//         ? new Types.ObjectId(userId)
//         : userId;

//       // Verify group exists
//       const group = await Group.findById(groupObjectId);
//       if (!group) {
//         throw new NotFoundError('Group not found');
//       }

//       // Verify user is group leader
//       if (group.leader.toString() !== userObjectId.toString()) {
//         throw new ForbiddenError('Only group leader can generate invite links');
//       }

//       // Generate unique code
//       const inviteCode = await this.generateUniqueInviteCode();

//       // Calculate expiry
//       let expiresAt: Date | null = null;
//       if (options?.expiresInHours) {
//         expiresAt = new Date();
//         expiresAt.setHours(expiresAt.getHours() + options.expiresInHours);
//       }

//       // Store invite link
//       const inviteLinkData: InviteLink = {
//         groupId: groupObjectId,
//         code: inviteCode,
//         createdBy: userObjectId,
//         createdAt: new Date(),
//         expiresAt,
//         maxUses: options?.maxUses || null,
//         currentUses: 0,
//         clicks: 0,
//         successfulJoins: 0,
//       };

//       inviteLinks.set(inviteCode, inviteLinkData);

//       // For production, store in Redis:
//       // await redis.setex(
//       //   `invite:${inviteCode}`,
//       //   expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 1000) : 31536000, // 1 year default
//       //   JSON.stringify(inviteLinkData)
//       // );

//       // Generate invite URL
//       const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
//       const inviteLink = `${baseUrl}/invite/${inviteCode}`;

//       LoggerUtil.info('Invite link generated', {
//         groupId: groupObjectId.toString(),
//         inviteCode,
//         expiresAt: expiresAt?.toISOString(),
//         maxUses: options?.maxUses,
//         userId: userObjectId.toString(),
//       });

//       return {
//         inviteLink,
//         inviteCode,
//         expiresAt,
//         maxUses: options?.maxUses || null,
//       };
//     } catch (error: any) {
//       LoggerUtil.error('Error generating invite link', {
//         error: error.message,
//         stack: error.stack,
//         groupId: groupId.toString(),
//         userId: userId.toString(),
//       });
//       throw error;
//     }
//   }

//   /**
//    * Generate QR code for group
//    */
//   async generateGroupQRCode(
//     groupId: string | Types.ObjectId,
//     userId: string | Types.ObjectId
//   ): Promise<{
//     qrCode: string;
//     inviteLink: string;
//     inviteCode: string;
//   }> {
//     try {
//       // Generate invite link first
//       const { inviteLink, inviteCode } = await this.generateInviteLink(
//         groupId,
//         userId
//       );

//       // Generate QR code
//       const qrCode = await qrCodeService.generateGroupInviteQR(inviteLink);

//       LoggerUtil.info('QR code generated', {
//         groupId: groupId.toString(),
//         inviteCode,
//       });

//       return {
//         qrCode,
//         inviteLink,
//         inviteCode,
//       };
//     } catch (error: any) {
//       LoggerUtil.error('Error generating QR code', {
//         error: error.message,
//         groupId: groupId.toString(),
//       });
//       throw error;
//     }
//   }

//   /**
//    * Validate and get invite link
//    */
//   async validateInviteCode(inviteCode: string): Promise<{
//     isValid: boolean;
//     groupId?: Types.ObjectId;
//     message?: string;
//   }> {
//     try {
//       const inviteData = inviteLinks.get(inviteCode);
//       // For production: const inviteData = await redis.get(`invite:${inviteCode}`);

//       if (!inviteData) {
//         LoggerUtil.warn('Invalid invite code attempted', { inviteCode });
//         return {
//           isValid: false,
//           message: 'Invalid invite code',
//         };
//       }

//       // Check expiry
//       if (inviteData.expiresAt && inviteData.expiresAt < new Date()) {
//         LoggerUtil.info('Expired invite code attempted', { 
//           inviteCode, 
//           expiresAt: inviteData.expiresAt 
//         });
//         return {
//           isValid: false,
//           message: 'Invite link has expired',
//         };
//       }

//       // Check max uses
//       if (
//         inviteData.maxUses &&
//         inviteData.currentUses >= inviteData.maxUses
//       ) {
//         LoggerUtil.info('Max uses reached for invite code', {
//           inviteCode,
//           currentUses: inviteData.currentUses,
//           maxUses: inviteData.maxUses,
//         });
//         return {
//           isValid: false,
//           message: 'Invite link has reached maximum uses',
//         };
//       }

//       // Verify group still exists
//       const group = await Group.findById(inviteData.groupId);
//       if (!group) {
//         LoggerUtil.error('Group not found for valid invite code', {
//           inviteCode,
//           groupId: inviteData.groupId,
//         });
//         return {
//           isValid: false,
//           message: 'Group no longer exists',
//         };
//       }

//       return {
//         isValid: true,
//         groupId: inviteData.groupId,
//       };
//     } catch (error: any) {
//       LoggerUtil.error('Error validating invite code', {
//         error: error.message,
//         inviteCode,
//       });
//       throw error;
//     }
//   }

//   /**
//    * Track invite link click (non-blocking)
//    */
//   async trackInviteClick(inviteCode: string): Promise<void> {
//     try {
//       const inviteData = inviteLinks.get(inviteCode);

//       if (inviteData) {
//         inviteData.clicks += 1;
//         inviteLinks.set(inviteCode, inviteData);
        
//         LoggerUtil.debug('Invite click tracked', { 
//           inviteCode, 
//           totalClicks: inviteData.clicks 
//         });
//       }
//     } catch (error: any) {
//       // Non-critical error, just log
//       LoggerUtil.error('Error tracking invite click', {
//         error: error.message,
//         inviteCode,
//       });
//     }
//   }

//   /**
//    * Track successful join from invite
//    */
//   async trackSuccessfulJoin(inviteCode: string): Promise<void> {
//     try {
//       const inviteData = inviteLinks.get(inviteCode);

//       if (inviteData) {
//         inviteData.currentUses += 1;
//         inviteData.successfulJoins += 1;
//         inviteLinks.set(inviteCode, inviteData);
        
//         LoggerUtil.info('Successful join tracked', {
//           inviteCode,
//           currentUses: inviteData.currentUses,
//           successfulJoins: inviteData.successfulJoins,
//         });
//       }
//     } catch (error: any) {
//       LoggerUtil.error('Error tracking successful join', {
//         error: error.message,
//         inviteCode,
//       });
//     }
//   }

//   /**
//    * Get invite analytics for group
//    */
//   async getInviteAnalytics(
//     groupId: string | Types.ObjectId,
//     userId: string | Types.ObjectId
//   ): Promise<InviteAnalytics> {
//     try {
//       const groupObjectId = typeof groupId === 'string'
//         ? new Types.ObjectId(groupId)
//         : groupId;

//       // Verify user is group leader
//       const group = await Group.findById(groupObjectId);
//       if (!group) {
//         throw new NotFoundError('Group not found');
//       }

//       if (group.leader.toString() !== userId.toString()) {
//         throw new ForbiddenError('Only group leader can view analytics');
//       }

//       // Calculate analytics
//       const groupInvites = Array.from(inviteLinks.values()).filter(
//         (invite) => invite.groupId.toString() === groupObjectId.toString()
//       );

//       const totalInvites = groupInvites.length;
//       const totalClicks = groupInvites.reduce((sum, inv) => sum + inv.clicks, 0);
//       const totalJoins = groupInvites.reduce(
//         (sum, inv) => sum + inv.successfulJoins,
//         0
//       );

//       const conversionRate =
//         totalClicks > 0 ? (totalJoins / totalClicks) * 100 : 0;

//       const now = new Date();
//       const activeInvites = groupInvites.filter(
//         (inv) =>
//           (!inv.expiresAt || inv.expiresAt > now) &&
//           (!inv.maxUses || inv.currentUses < inv.maxUses)
//       ).length;

//       const expiredInvites = totalInvites - activeInvites;

//       LoggerUtil.info('Invite analytics calculated', {
//         groupId: groupObjectId.toString(),
//         totalInvites,
//         activeInvites,
//         expiredInvites,
//       });

//       return {
//         totalInvites,
//         totalClicks,
//         totalJoins,
//         conversionRate: parseFloat(conversionRate.toFixed(2)),
//         activeInvites,
//         expiredInvites,
//       };
//     } catch (error: any) {
//       LoggerUtil.error('Error getting invite analytics', {
//         error: error.message,
//         groupId: groupId.toString(),
//       });
//       throw error;
//     }
//   }

//   /**
//    * Revoke invite link
//    */
//   async revokeInviteLink(
//     inviteCode: string,
//     userId: string | Types.ObjectId
//   ): Promise<void> {
//     try {
//       const inviteData = inviteLinks.get(inviteCode);

//       if (!inviteData) {
//         throw new NotFoundError('Invite link not found');
//       }

//       // Verify user is the creator or group leader
//       const userObjectId = typeof userId === 'string'
//         ? new Types.ObjectId(userId)
//         : userId;

//       if (inviteData.createdBy.toString() !== userObjectId.toString()) {
//         const group = await Group.findById(inviteData.groupId);
//         if (!group || group.leader.toString() !== userObjectId.toString()) {
//           throw new ForbiddenError('Not authorized to revoke this invite');
//         }
//       }

//       // Remove invite link
//       inviteLinks.delete(inviteCode);
//       // For production: await redis.del(`invite:${inviteCode}`);

//       LoggerUtil.info('Invite link revoked', {
//         inviteCode,
//         userId: userObjectId.toString(),
//       });
//     } catch (error: any) {
//       LoggerUtil.error('Error revoking invite link', {
//         error: error.message,
//         inviteCode,
//       });
//       throw error;
//     }
//   }

//   /**
//    * Generate social media share links
//    */
//   generateSocialShareLinks(
//     inviteLink: string,
//     groupName: string
//   ): SocialShareLinks {
//     // Validate inputs
//     if (!inviteLink || !groupName) {
//       throw new BadRequestError('Invite link and group name are required');
//     }

//     if (groupName.length < this.MIN_GROUP_NAME_LENGTH || 
//         groupName.length > this.MAX_GROUP_NAME_LENGTH) {
//       throw new BadRequestError(
//         `Group name must be between ${this.MIN_GROUP_NAME_LENGTH} and ${this.MAX_GROUP_NAME_LENGTH} characters`
//       );
//     }

//     const message = `Join my study group "${groupName}" on StudyGroup App!`;
//     const encodedMessage = encodeURIComponent(message);
//     const encodedLink = encodeURIComponent(inviteLink);

//     return {
//       whatsapp: `https://wa.me/?text=${encodedMessage}%20${encodedLink}`,
//       telegram: `https://t.me/share/url?url=${encodedLink}&text=${encodedMessage}`,
//       twitter: `https://twitter.com/intent/tweet?text=${encodedMessage}&url=${encodedLink}`,
//       facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`,
//     };
//   }

//   /**
//    * Get all invite links for a group
//    */
//   async getGroupInviteLinks(
//     groupId: string | Types.ObjectId,
//     userId: string | Types.ObjectId
//   ): Promise<any[]> {
//     try {
//       const groupObjectId = typeof groupId === 'string'
//         ? new Types.ObjectId(groupId)
//         : groupId;

//       // Verify user is group leader
//       const group = await Group.findById(groupObjectId);
//       if (!group) {
//         throw new NotFoundError('Group not found');
//       }

//       if (group.leader.toString() !== userId.toString()) {
//         throw new ForbiddenError('Only group leader can view invite links');
//       }

//       const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
//       const now = new Date();

//       // Get all invites for this group
//       const groupInvites = Array.from(inviteLinks.entries())
//         .filter(([_, invite]) => invite.groupId.toString() === groupObjectId.toString())
//         .map(([code, invite]) => ({
//           inviteCode: code,
//           inviteLink: `${baseUrl}/invite/${code}`,
//           createdAt: invite.createdAt,
//           expiresAt: invite.expiresAt,
//           maxUses: invite.maxUses,
//           currentUses: invite.currentUses,
//           clicks: invite.clicks,
//           successfulJoins: invite.successfulJoins,
//           conversionRate: invite.clicks > 0 
//             ? parseFloat(((invite.successfulJoins / invite.clicks) * 100).toFixed(2))
//             : 0,
//           isActive:
//             (!invite.expiresAt || invite.expiresAt > now) &&
//             (!invite.maxUses || invite.currentUses < invite.maxUses),
//         }))
//         .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Most recent first

//       LoggerUtil.info('Group invite links fetched', {
//         groupId: groupObjectId.toString(),
//         count: groupInvites.length,
//       });

//       return groupInvites;
//     } catch (error: any) {
//       LoggerUtil.error('Error getting group invite links', {
//         error: error.message,
//         groupId: groupId.toString(),
//       });
//       throw error;
//     }
//   }

//   /**
//    * Get invite link details (for analytics)
//    */
//   async getInviteLinkDetails(
//     inviteCode: string,
//     userId: string | Types.ObjectId
//   ): Promise<any> {
//     try {
//       const inviteData = inviteLinks.get(inviteCode);

//       if (!inviteData) {
//         throw new NotFoundError('Invite link not found');
//       }

//       // Verify user is creator or group leader
//       const userObjectId = typeof userId === 'string'
//         ? new Types.ObjectId(userId)
//         : userId;

//       const group = await Group.findById(inviteData.groupId);
//       if (!group) {
//         throw new NotFoundError('Group not found');
//       }

//       if (
//         inviteData.createdBy.toString() !== userObjectId.toString() &&
//         group.leader.toString() !== userObjectId.toString()
//       ) {
//         throw new ForbiddenError('Not authorized to view this invite link');
//       }

//       const now = new Date();
//       const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

//       return {
//         inviteCode,
//         inviteLink: `${baseUrl}/invite/${inviteCode}`,
//         groupId: inviteData.groupId,
//         groupName: group.title,
//         createdBy: inviteData.createdBy,
//         createdAt: inviteData.createdAt,
//         expiresAt: inviteData.expiresAt,
//         maxUses: inviteData.maxUses,
//         currentUses: inviteData.currentUses,
//         clicks: inviteData.clicks,
//         successfulJoins: inviteData.successfulJoins,
//         conversionRate: inviteData.clicks > 0
//           ? parseFloat(((inviteData.successfulJoins / inviteData.clicks) * 100).toFixed(2))
//           : 0,
//         isActive:
//           (!inviteData.expiresAt || inviteData.expiresAt > now) &&
//           (!inviteData.maxUses || inviteData.currentUses < inviteData.maxUses),
//       };
//     } catch (error: any) {
//       LoggerUtil.error('Error getting invite link details', {
//         error: error.message,
//         inviteCode,
//       });
//       throw error;
//     }
//   }

//   /**
//    * Clean up expired invite links (for cron job)
//    */
//   async cleanupExpiredInvites(): Promise<number> {
//     try {
//       const now = new Date();
//       let deletedCount = 0;

//       for (const [code, invite] of inviteLinks.entries()) {
//         if (invite.expiresAt && invite.expiresAt < now) {
//           inviteLinks.delete(code);
//           deletedCount++;
//         }
//       }

//       if (deletedCount > 0) {
//         LoggerUtil.info('Expired invites cleaned up', { deletedCount });
//       }

//       return deletedCount;
//     } catch (error: any) {
//       LoggerUtil.error('Error cleaning up expired invites', {
//         error: error.message,
//       });
//       return 0;
//     }
//   }
// }

// export default new ShareService();