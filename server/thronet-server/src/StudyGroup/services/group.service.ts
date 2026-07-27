/**
 * ====================================
 * GROUP SERVICE
 * ====================================
 * Business logic for group operations
 * Fixed:
 *   1. Race condition in joinGroup/leaveGroup — atomic $inc
 *   2. getGroupMembers — logic bug (double userId check)
 *   3. getTopRankedGroups — N+1 query removed (batch membership check)
 *   4. deleteGroup — session pass to softDeleteById
 *   5. console.log removed — logger used everywhere
 */

import mongoose from 'mongoose';
import {
  CreateGroupData,
  UpdateGroupData,
  GroupResponse,
  GroupListQuery,
  JoinGroupData,
} from '../types/group.types';
import { MemberRole, MemberStatus } from '../interfaces/IGroupMember';
import { GroupVisibility } from '../enums';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors/app.error';
import { ERROR_MESSAGES } from '../utils/constants';
import groupRepository from '../repositories/group.repository';
import groupMemberRepository from '../repositories/groupMember.repository';
import { generateSecureId } from '@/shared/security';
import { logger } from '@/shared/logger.util';

class GroupService {

  /**
   * Create a new group
   */
  static createGroup = async (
    userId: string,
    groupData: CreateGroupData
  ): Promise<GroupResponse> => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const createdGroup = await groupRepository.create(
        {
          groupId: generateSecureId(),
          ...groupData,
          leaderId: userId,
          currentMemberCount: 1,
        },
        session
      );

      await groupMemberRepository.create(
        {
          groupId: createdGroup.groupId,
          userId,
          role: MemberRole.LEADER,
          status: MemberStatus.ACTIVE,
        },
        session
      );

      await session.commitTransaction();

      const populatedGroup = await groupRepository.findByGroupId(createdGroup.groupId);
      if (!populatedGroup) throw new NotFoundError('Group not found after creation');

      return GroupService.formatGroupResponse(populatedGroup, userId);
    } catch (error: any) {
      logger.error('Create group error:', error);
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  };

  /**
   * Get all groups with filters and pagination
   */
  static getGroups = async (
    query: GroupListQuery,
    userId?: string
  ): Promise<{ groups: GroupResponse[]; total: number; page: number; totalPages: number }> => {
    logger.info('Inside getGroups service');

    const {
      page = 1,
      limit = 10,
      category,
      visibility,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const filter: any = { isActive: true };

    if (category) filter.category = category;
    if (visibility) filter.visibility = visibility;

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const sortOptions: any = {};
    if (sortBy === 'memberCount') {
      sortOptions.currentMemberCount = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'title') {
      sortOptions.title = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions.createdAt = sortOrder === 'asc' ? 1 : -1;
    }

    const skip = (page - 1) * limit;

    const [groups, total] = await Promise.all([
      groupRepository.findAll(filter, sortOptions, skip, limit),
      groupRepository.count(filter),
    ]);

    const formattedGroups = await GroupService.batchFormatGroupResponse(groups, userId);

    return {
      groups: formattedGroups,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  };

  /**
   * Get group by ID
   */
  static getGroupById = async (
    groupId: string,
    userId?: string
  ): Promise<GroupResponse> => {
    const group = await groupRepository.findByGroupId(groupId);
    if (!group) throw new NotFoundError(ERROR_MESSAGES.GROUP_NOT_FOUND);

    // Private group — only members can view
    if (group.visibility === GroupVisibility.PRIVATE) {
      if (!userId) throw new ForbiddenError('Login required to view private groups');

      const isMember = await groupMemberRepository.findActiveOne(groupId, userId);
      if (!isMember && group.leaderId !== userId) {
        throw new ForbiddenError('This group is private');
      }
    }

    return GroupService.formatGroupResponse(group, userId);
  };

  /**
   * Update group
   */
  static updateGroup = async (
    groupId: string,
    userId: string,
    updateData: UpdateGroupData
  ): Promise<GroupResponse> => {
    const group = await groupRepository.findByGroupId(groupId);
    if (!group) throw new NotFoundError(ERROR_MESSAGES.GROUP_NOT_FOUND);

    if (group.leaderId !== userId) throw new ForbiddenError(ERROR_MESSAGES.ONLY_LEADER);

    if (updateData.capacity && updateData.capacity < group.currentMemberCount) {
      throw new BadRequestError('Cannot set capacity lower than current member count');
    }

    const updatedGroup = await groupRepository.updateById(groupId, updateData);
    if (!updatedGroup) throw new NotFoundError('Group not found after update');

    return GroupService.formatGroupResponse(updatedGroup, userId);
  };

  /**
   * Delete group
   * FIX: session passed to softDeleteById
   */
  static deleteGroup = async (
    groupId: string,
    userId: string
  ): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const group = await groupRepository.findByGroupId(groupId);
      if (!group) throw new NotFoundError(ERROR_MESSAGES.GROUP_NOT_FOUND);
      if (group.leaderId !== userId) throw new ForbiddenError(ERROR_MESSAGES.ONLY_LEADER);

      // FIX: session pass karo
      await groupRepository.softDeleteById(groupId, session);

      await groupMemberRepository.updateMany(
        { groupId },
        { status: MemberStatus.INACTIVE },
        session
      );

      await session.commitTransaction();
    } catch (error: any) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  };

  /**
   * Join group
   * FIX: atomic $inc — race condition removed
   */
  static joinGroup = async (
    groupId: string,
    userId: string,
    joinData?: JoinGroupData
  ): Promise<GroupResponse> => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const group = await groupRepository.findByGroupId(groupId);
      if (!group || !group.isActive) throw new NotFoundError(ERROR_MESSAGES.GROUP_NOT_FOUND);
      if (group.currentMemberCount >= group.capacity) throw new ForbiddenError(ERROR_MESSAGES.GROUP_FULL);

      const existingMember = await groupMemberRepository.findOne(groupId, userId);

      if (existingMember) {
        if (existingMember.status === MemberStatus.ACTIVE) throw new ConflictError(ERROR_MESSAGES.ALREADY_MEMBER);
        if (existingMember.status === MemberStatus.BANNED) throw new ForbiddenError('You have been banned from this group');
      }

      if (group.visibility === GroupVisibility.PRIVATE) {
        if (!joinData?.joinCode || joinData.joinCode !== group.joinCode) {
          throw new BadRequestError('Invalid join code');
        }
      }

      if (existingMember) {
        await groupMemberRepository.updateStatus(groupId, userId, MemberStatus.ACTIVE);
      } else {
        await groupMemberRepository.create(
          { groupId, userId, role: MemberRole.MEMBER, status: MemberStatus.ACTIVE },
          session
        );
      }

      // FIX: atomic increment — no stale read issue
      await groupRepository.incrementMemberCount(groupId, 1);

      await session.commitTransaction();

      const updatedGroup = await groupRepository.findByGroupId(groupId);
      if (!updatedGroup) throw new NotFoundError('Group not found after joining');

      return GroupService.formatGroupResponse(updatedGroup, userId);
    } catch (error: any) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  };

  /**
   * Leave group
   * FIX: atomic $inc decrement
   */
  static leaveGroup = async (
    groupId: string,
    userId: string
  ): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const group = await groupRepository.findByGroupId(groupId);
      if (!group) throw new NotFoundError(ERROR_MESSAGES.GROUP_NOT_FOUND);

      if (group.leaderId === userId) {
        throw new BadRequestError(
          'Group leader cannot leave. Please delete the group or transfer leadership first'
        );
      }

      const membership = await groupMemberRepository.findActiveOne(groupId, userId);
      if (!membership) throw new NotFoundError(ERROR_MESSAGES.NOT_MEMBER);

      await groupMemberRepository.deleteById(membership._id.toString(), session);

      // FIX: atomic decrement — floor at 0
      await groupRepository.incrementMemberCount(groupId, -1);

      await session.commitTransaction();
    } catch (error: any) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  };

  /**
   * Get group members
   * FIX: removed double userId check bug
   */
  static getGroupMembers = async (
    groupId: string,
    userId?: string
  ): Promise<any[]> => {
    const group = await groupRepository.findByGroupId(groupId);
    if (!group) throw new NotFoundError(ERROR_MESSAGES.GROUP_NOT_FOUND);

    // FIX: clean guard — pehle login check, phir membership check
    if (group.visibility === GroupVisibility.PRIVATE) {
      if (!userId) throw new ForbiddenError('Login required to view private groups');

      const isMember = await groupMemberRepository.findActiveOne(groupId, userId);
      if (!isMember && group.leaderId !== userId) {
        throw new ForbiddenError('You do not have access to view group members');
      }
    }

    const members = await groupMemberRepository.findByGroupId(groupId);

    return members.map((member) => ({
      _id: member._id,
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt,
      lastActive: member.lastActive,
    }));
  };

  /**
   * Get user's groups
   */
  static getUserGroups = async (userId: string): Promise<GroupResponse[]> => {
    logger.info(`getUserGroups called for userId: ${userId}`);

    const memberships = await groupMemberRepository.findByUserId(userId);
    logger.info(`Found ${memberships.length} memberships for user ${userId}`);

    const groups = memberships
      .filter((m) => m.groupId)
      .map((m) => GroupService.formatGroupResponse(m.groupId, userId));

    return Promise.all(groups);
  };

  /**
   * Get top ranked groups by scoring algorithm
   * FIX: N+1 removed — single batch membership query
   */
  static getTopRankedGroups = async (
    limit: number = 3,
    userId?: string
  ): Promise<GroupResponse[]> => {
    const groups = await groupRepository.findAll({ isActive: true }, {}, 0, 200);

    logger.info(`Groups fetched from DB: ${groups.length}`);

    // FIX: single batch query for user memberships
    let memberGroupIds = new Set<string>();
    if (userId) {
      const userMemberships = await groupMemberRepository.findByUserId(userId);
      memberGroupIds = new Set(userMemberships.map((m: any) => m.groupId));
    }

    const scored = groups
      .filter((g) => g && g.groupId)
      .map((g) => {
        const raw = g as any;
        const createdAt = raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now();
        const ageInMonths = (Date.now() - createdAt) / (1000 * 60 * 60 * 24 * 30);

        const fillRate = raw.capacity > 0 ? (raw.currentMemberCount / raw.capacity) * 100 : 0;
        const goalScore = ((raw.goalHours || 0) / 24) * 100;
        const attendance = raw.attendanceRequired ? (raw.minAttendancePercent || 75) : 50;
        const ageBonus = (Math.min(ageInMonths, 12) / 12) * 100;

        const groupScore =
          fillRate * 0.3 +
          goalScore * 0.2 +
          attendance * 0.4 +
          ageBonus * 0.1;

        return { ...raw, groupScore };
      });

    scored.sort((a, b) => b.groupScore - a.groupScore);

    // FIX: formatGroupResponseSync — no DB call inside, uses preloaded memberGroupIds
    const result = scored.slice(0, limit).map((g) =>
      GroupService.formatGroupResponseSync(g, userId, memberGroupIds)
    );

    logger.info(`Top ranked groups formatted: ${result.length}`);
    return result;
  };

  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────

  /**
   * Format single group response (with DB call for membership)
   * Use for single-group endpoints only
   */
  static formatGroupResponse = async (
    group: any,
    userId?: string
  ): Promise<GroupResponse> => {
    let memberRole: MemberRole | undefined;
    let isMember = false;

    if (userId) {
      const membership = await groupMemberRepository.findActiveOne(group.groupId, userId);
      if (membership) {
        memberRole = membership.role;
        isMember = true;
      }
    }

    return GroupService.buildGroupResponse(group, isMember, memberRole, userId);
  };

  /**
   * FIX: Sync version — uses preloaded memberGroupIds Set, no DB call
   * Use for list/batch endpoints to avoid N+1
   */
  private static formatGroupResponseSync = (
    group: any,
    userId?: string,
    memberGroupIds: Set<string> = new Set()
  ): GroupResponse => {
    const isMember = userId ? memberGroupIds.has(group.groupId) : false;
    return GroupService.buildGroupResponse(group, isMember, undefined, userId);
  };

  /**
   * Batch format — single DB call for all groups
   * Use for list endpoints
   */
  private static batchFormatGroupResponse = async (
    groups: any[],
    userId?: string
  ): Promise<GroupResponse[]> => {
    let memberGroupIds = new Set<string>();
    if (userId) {
      const userMemberships = await groupMemberRepository.findByUserId(userId);
      memberGroupIds = new Set(userMemberships.map((m: any) => m.groupId));
    }

    return groups.map((group) =>
      GroupService.formatGroupResponseSync(group, userId, memberGroupIds)
    );
  };

  /**
   * Build final GroupResponse object — shared by sync and async formatters
   */
  private static buildGroupResponse = (
    group: any,
    isMember: boolean,
    memberRole?: MemberRole,
    userId?: string
  ): GroupResponse => {
    return {
      _id: group._id?.toString() ?? '',
      groupId: group.groupId,
      title: group.title,
      description: group.description,
      category: group.category,
      visibility: group.visibility,
      avatar: group.avatar,
      coverImage: group.coverImage,
      capacity: group.capacity,
      currentMemberCount: group.currentMemberCount,
      leaderId: group.leaderId,
      goalHours: group.goalHours,
      tags: group.tags,
      joinCode: isMember || group.leaderId === userId ? group.joinCode : undefined,
      isActive: group.isActive,
      cameraRequired: group.cameraRequired ?? false,
      attendanceRequired: group.attendanceRequired ?? false,
      minAttendancePercent: group.minAttendancePercent ?? null,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      memberRole,
      isMember,
    };
  };
}

export default GroupService;