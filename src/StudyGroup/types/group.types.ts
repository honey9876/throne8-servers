/**
 * ====================================
 * GROUP TYPES
 * ====================================
 */

import { GroupCategory } from '../enums/GroupCategory.enum';
import { GroupVisibility } from '../enums/GroupVisibility.enum';
import { MemberRole } from '../interfaces/IGroupMember';

/**
 * Create Group Data
 */
export interface CreateGroupData {
  title: string;
  description?: string;
  category: GroupCategory;
  visibility: GroupVisibility;
  capacity?: number;
  goalHours?: number;
  tags?: string[];
  // ADD these 3 fields
cameraRequired?: boolean;
attendanceRequired?: boolean;
minAttendancePercent?: number;
}

/**
 * Update Group Data
 */
export interface UpdateGroupData {
  title?: string;
  description?: string;
  category?: GroupCategory;
  visibility?: GroupVisibility;
  capacity?: number;
  goalHours?: number;
  tags?: string[];
  avatar?: string;
  coverImage?: string;
  // ADD same 3 fields
cameraRequired?: boolean;
attendanceRequired?: boolean;
minAttendancePercent?: number;
}

/**
 * Group Response
 */
export interface GroupResponse {
  _id: string;
  groupId:string;
  title: string;
  description?: string;
  category: GroupCategory;
  visibility: GroupVisibility;
  avatar?: string;
  coverImage?: string;
  capacity: number;
  currentMemberCount: number;
  leaderId: string;
  goalHours?: number;
  tags?: string[];
  joinCode?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  memberRole?: MemberRole;
  isMember?: boolean;
  // ADD same 3 fields
cameraRequired: boolean;
attendanceRequired: boolean;
minAttendancePercent?: number;
}

/**
 * Group List Query
 */
export interface GroupListQuery {
  page?: number;
  limit?: number;
  category?: GroupCategory;
  visibility?: GroupVisibility;
  search?: string;
  sortBy?: 'createdAt' | 'memberCount' | 'title';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Join Group Data
 */
export interface JoinGroupData {
  joinCode?: string;
}