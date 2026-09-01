/**
 * ====================================
 * GROUP INTERFACE (WITH MODERATION FIELDS)
 * ====================================
 */

import { Document, Types } from 'mongoose';
import { GroupCategory } from '../enums/GroupCategory.enum';
import { GroupVisibility } from '../enums/GroupVisibility.enum';

export interface IGroup extends Document {
  _id: Types.ObjectId;
  groupId:string;
  title: string;
  description?: string;
  category: GroupCategory;
  visibility: GroupVisibility;
  avatar?: string;
  coverImage?: string;
  capacity: number;
  currentMemberCount: number;
  leaderId: String;
  goalHours?: number;
  tags?: string[];
  joinCode?: string;
  isActive: boolean;
  // ADD these fields after `isActive: boolean;`
cameraRequired: boolean;
attendanceRequired: boolean;
minAttendancePercent?: number;
  
  // ✅ MODERATION FIELDS
  rules?: string[];
  rulesUpdatedAt?: Date;
  rulesUpdatedBy?: string;
  
  moderationLogs?: Array<{
    action: 'kick' | 'ban' | 'unban' | 'warn' | 'delete_message';
    moderator: Types.ObjectId;
    target: Types.ObjectId;
    reason?: string;
    permanent?: boolean;
    timestamp: Date;
  }>;
  
  bannedUsers?: Array<{
    user: string;
    bannedBy: string;
    reason: string;
    bannedAt: Date;
    permanent: boolean;
  }>;
  
  reports?: Array<{
    reporter: string;
    reportedUser: string;
    reason: 'spam' | 'harassment' | 'inappropriate' | 'other';
    description: string;
    status: 'pending' | 'resolved' | 'dismissed';
    reportedAt: Date;
    resolvedAt?: Date;
    resolvedBy?: Types.ObjectId;
  }>;
  
  messageReports?: Array<{
    reporter: Types.ObjectId;
    messageId: Types.ObjectId;
    messageSender: Types.ObjectId;
    reason: 'spam' | 'harassment' | 'inappropriate' | 'other';
    description: string;
    status: 'pending' | 'resolved' | 'dismissed';
    reportedAt: Date;
    resolvedAt?: Date;
    resolvedBy?: Types.ObjectId;
  }>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Virtuals
  pendingReportsCount?: number;
  bannedUsersCount?: number;
}

export default IGroup;