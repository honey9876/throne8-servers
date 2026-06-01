/**
 * ====================================
 * PERMISSION MIDDLEWARE
 * ====================================
 * Advanced permission checks for group operations
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import Group from '../models/Group.model';
import GroupMember from '../models/GroupMember.model';
import { MemberRole, MemberStatus } from '../interfaces/IGroupMember';
import { AuthenticationError, AuthorizationError, ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors/app.error';
import { groupMemberRepository, groupRepository } from '../repositories';

/**
 * Check if user is the group leader
 */
export const isGroupLeader = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    // Find group
    const group = await groupRepository.findByGroupId(groupId);

    if (!group) {
      throw new NotFoundError('Group not found');
    }

    // Check if user is the leader
    if (group.leaderId !== userId.toString()) {
      throw new ForbiddenError('Only group leader can perform this action');
    }

    next();
  } catch (error: any) {
    next(error);
  }
};

/**
 * Check if user is a member of the group
 */
export const isGroupMember = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    // Check membership
    // const membership = await GroupMember.findOne({
    //   group: groupId,
    //   user: userId,
    //   status: MemberStatus.ACTIVE,
    // });
    const membership = await groupMemberRepository.findActiveOne(groupId, userId);

    if (!membership) {
      throw new AuthorizationError(

        'You are not a member of this group'
      );
    }

    // Attach membership to request
    (req as any).membership = membership;

    next();
  } catch (error: any) {
    next(error);
  }
};

/**
 * Check if user is leader or admin
 */
export const isLeaderOrAdmin = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const group = await groupRepository.findByGroupId(groupId);

    if (!group) {
      throw new NotFoundError('Group not found');
    }

    // Check if leader
    if (group.leaderId === userId.toString()) {
      (req as any).isLeader = true;
      return next();
    }

    // Check if admin
    // const membership = await GroupMember.findOne({
    //   group: groupId,
    //   user: userId,
    //   role: MemberRole.ADMIN,
    //   status: MemberStatus.ACTIVE,
    // });

    const membership = await groupMemberRepository.findOne(groupId, userId);

    if (!membership || membership.role !== MemberRole.ADMIN || membership.status !== MemberStatus.ACTIVE) {
      throw new AuthorizationError(

        'Only group leader or admin can perform this action'
      );
    }

    (req as any).isAdmin = true;
    next();
  } catch (error: any) {
    next(error);
  }
};

/**
 * Check if user can manage members (leader or admin)
 */
export const canManageMembers = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    const group = await groupRepository.findByGroupId(groupId);

    if (!group) {
      throw new NotFoundError('Group not found');
    }

    // Check if leader
    if (group.leaderId === userId.toString()) {
      return next();
    }

    // Check if admin
    // const membership = await GroupMember.findOne({
    //   group: groupId,
    //   user: userId,
    //   role: MemberRole.ADMIN,
    //   status: MemberStatus.ACTIVE,
    // });
    const membership = await groupMemberRepository.findOne(groupId, userId);

    if (!membership || membership.role !== MemberRole.ADMIN || membership.status !== MemberStatus.ACTIVE) {
      throw new AuthorizationError(

        'You do not have permission to manage members'
      );
    }

    next();
  } catch (error: any) {
    next(error);
  }
};

/**
 * Check if group is not full
 */
export const checkGroupCapacity = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { groupId } = req.params;

    const group = await groupRepository.findByGroupId(groupId);

    if (!group) {
      throw new NotFoundError('Group not found');
    }

    if (group.currentMemberCount >= group.capacity) {
      throw new ForbiddenError(

        'Group has reached maximum capacity'
      );
    }

    next();
  } catch (error: any) {
    next(error);
  }
};

/**
 * Check if user is NOT already a member
 */
export const isNotMember = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError('User not authenticated');
    }

    // const membership = await GroupMember.findOne({
    //   group: groupId,
    //   user: userId,
    // });
    const membership = await groupMemberRepository.findOne(groupId, userId);

    if (membership && membership.status === MemberStatus.ACTIVE) {
      throw new ConflictError(

        'You are already a member of this group'
      );
    }

    if (membership && membership.status === MemberStatus.BANNED) {
      throw new AuthorizationError(

        'You have been banned from this group'
      );
    }

    next();
  } catch (error: any) {
    next(error);
  }
};

export default {
  isGroupLeader,
  isGroupMember,
  isLeaderOrAdmin,
  canManageMembers,
  checkGroupCapacity,
  isNotMember,
};