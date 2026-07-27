/**
 * ====================================
 * GROUP MEMBER INTERFACE (WITH MODERATION FIELDS)
 * ====================================
 */

import { Document, Types } from 'mongoose';

export enum MemberRole {
  LEADER = 'leader',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum MemberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BANNED = 'banned',
}

export interface IGroupMember extends Document {
  _id: Types.ObjectId;
  groupId: string;
  userId: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: Date;
  lastActive?: Date;
  
  // ✅ MODERATION FIELDS
  warnings?: Array<{
    warnedBy: string;
    reason: string;
    warnedAt: Date;
  }>;
  
  warningCount?: number;
  
  bannedAt?: Date;
  bannedBy?: string;
  banReason?: string;
  banPermanent?: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Virtuals
  isBanned?: boolean;
  hasWarnings?: boolean;
}

export default IGroupMember;