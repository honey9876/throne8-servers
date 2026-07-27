/**
 * ====================================
 * GROUP ACCESS MIDDLEWARE
 * ====================================
 * Check user's access permissions for group operations
 */

import { Request, Response, NextFunction } from 'express';
import { MemberRole, MemberStatus } from '../interfaces/IGroupMember';
import { NotFoundError, ForbiddenError, AuthorizationError, asyncHandler } from '@/shared/errors/app.error';
import { groupMemberRepository, groupRepository } from '../repositories';


/**
 * Check if user is a member of the groupx
 */
export const isMember = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const { groupId } = req.params;
    // const userId = req.user?.id!;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthorizationError('Authentication required');
    }

    const group = await groupRepository.findByGroupId(groupId);
    if (!group) {
      throw new NotFoundError('Group not found');
    }

    // const membership = await GroupMember.findOne({
    //   group: groupId,
    //   user: userId,
    //   status: MemberStatus.ACTIVE,
    // });

    const membership = await groupMemberRepository.findActiveOne(groupId, userId)

    if (!membership) {
      throw new ForbiddenError('You are not a member of this group');
    }

    // Attach membership to request for later use
    (req as any).membership = membership;
    (req as any).group = group;

    next();
  }
);

/**
 * Check if user is the leader of the group
 */
export const isLeader = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const { groupId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthorizationError('Authentication required');
    }

    const group = await groupRepository.findByGroupId(groupId);
    if (!group) {
      throw new NotFoundError('Group not found');
    }

    if (group.leaderId !== userId) {
      throw new ForbiddenError('Only group leader can perform this action');
    }

    (req as any).group = group;
    next();
  }
);

/**
 * Check if user is leader or admin of the group
 */
export const isLeaderOrAdmin = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const { groupId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthorizationError('Authentication required');
    }

    const group = await groupRepository.findByGroupId(groupId);
    if (!group) {
      throw new NotFoundError('Group not found');
    }

    // Check if user is the leader
    if (group.leaderId === userId) {
      (req as any).group = group;
      (req as any).isLeader = true;
      return next();
    }

    // Check if user is an admin
    // const membership = await GroupMember.findOne({
    //   group: groupId,
    //   user: userId,
    //   role: { $in: [MemberRole.LEADER, MemberRole.ADMIN] },
    //   status: MemberStatus.ACTIVE,
    // });
    const membership = await groupMemberRepository.findActiveOne(groupId, userId);

    if (!membership) {
      throw new ForbiddenError('Only group leader or admin can perform this action');
    }

    (req as any).group = group;
    (req as any).membership = membership;
    (req as any).isAdmin = true;

    next();
  }
);

/**
 * Check if group is not full
 */
export const isGroupNotFull = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const { groupId } = req.params;

    const group = await groupRepository.findByGroupId(groupId);
    if (!group) {
      throw new NotFoundError('Group not found');
    }

    if (group.currentMemberCount >= group.capacity) {
      throw new ForbiddenError('Group has reached maximum capacity');
    }

    (req as any).group = group;
    next();
  }
);

/**
 * Check if user is NOT already a member
 */
export const isNotMember = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const { groupId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthorizationError('Authentication required');
    }

    // const membership = await GroupMember.findOne({
    //   group: groupId,
    //   user: userId,
    // });
    const membership = await groupMemberRepository.findOne(groupId, userId);

    if (membership && membership.status === MemberStatus.ACTIVE) {
      throw new ForbiddenError('You are already a member of this group');
    }

    if (membership && membership.status === MemberStatus.BANNED) {
      throw new ForbiddenError('You have been banned from this group');
    }

    next();
  }
);

export default {
  isMember,
  isLeader,
  isLeaderOrAdmin,
  isGroupNotFull,
  isNotMember,
};