import mongoose from 'mongoose';
import groupRepository from '../repositories/group.repository';
import groupMemberRepository from '../repositories/groupMember.repository';
import { MemberRole, MemberStatus } from '../interfaces/IGroupMember';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/shared/errors/app.error';
import { logger } from '@/shared/logger.util';
import { userRepository } from '../repositories';

class GroupMemberService {

  async joinGroup(groupId: string, userId: string): Promise<any> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const group = await groupRepository.findByGroupId(groupId);
      if (!group || !group.isActive) throw new NotFoundError('Group not found');

      if (group.currentMemberCount >= group.capacity) {
        throw new ForbiddenError('Group has reached maximum capacity');
      }

      const existingMember = await groupMemberRepository.findOne(groupId, userId);

      if (existingMember?.status === MemberStatus.ACTIVE) {
        throw new ConflictError('You are already a member of this group');
      }
      if (existingMember?.status === MemberStatus.BANNED) {
        throw new ForbiddenError('You have been banned from this group');
      }

      if (existingMember) {
        await groupMemberRepository.updateStatus(groupId, userId, MemberStatus.ACTIVE);
      } else {
        await groupMemberRepository.create(
          { groupId, userId, role: MemberRole.MEMBER, status: MemberStatus.ACTIVE },
          session
        );
      }

      // FIX: $inc via updateById — atomic, no race condition
      await groupRepository.updateById(groupId, { $inc: { currentMemberCount: 1 } });

      await session.commitTransaction();
      logger.info(`User ${userId} joined group ${groupId}`);
      return await groupRepository.findByGroupId(groupId);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async leaveGroup(groupId: string, userId: string): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const group = await groupRepository.findByGroupId(groupId);
      if (!group) throw new NotFoundError('Group not found');

      if (group.leaderId === userId) {
        throw new ConflictError(
          'Group leader cannot leave. Please delete the group or transfer leadership first.'
        );
      }

      const membership = await groupMemberRepository.findActiveOne(groupId, userId);
      if (!membership) throw new AuthorizationError('You are not a member of this group');

      await groupMemberRepository.deleteById(membership._id.toString(), session);
      await groupRepository.updateById(groupId, { $inc: { currentMemberCount: -1 } });

      await session.commitTransaction();
      logger.info(`User ${userId} left group ${groupId}`);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async addMember(groupId: string, memberUserId: string): Promise<any> {
    if (!memberUserId) throw new ValidationError('User ID is required');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const group = await groupRepository.findByGroupId(groupId);
      if (!group || !group.isActive) throw new NotFoundError('Group not found');

      if (group.currentMemberCount >= group.capacity) {
        throw new ForbiddenError('Group has reached maximum capacity');
      }

      const user = await userRepository.findByUserId(memberUserId);
      if (!user) throw new NotFoundError('User not found');

      const existingMember = await groupMemberRepository.findOne(groupId, memberUserId);

      if (existingMember?.status === MemberStatus.ACTIVE) {
        throw new ConflictError('User is already a member of this group');
      }
      if (existingMember?.status === MemberStatus.BANNED) {
        throw new AuthorizationError('User has been banned from this group');
      }

      if (existingMember) {
        await groupMemberRepository.updateStatus(groupId, memberUserId, MemberStatus.ACTIVE);
      } else {
        await groupMemberRepository.create(
          { groupId, userId: memberUserId, role: MemberRole.MEMBER, status: MemberStatus.ACTIVE },
          session
        );
      }

      await groupRepository.updateById(groupId, { $inc: { currentMemberCount: 1 } });

      await session.commitTransaction();
      logger.info(`Member ${memberUserId} added to group ${groupId}`);
      return { userId: memberUserId };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async removeMember(groupId: string, memberUserId: string): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const group = await groupRepository.findByGroupId(groupId);
      if (!group) throw new NotFoundError('Group not found');

      if (group.leaderId === memberUserId) {
        throw new AuthorizationError('Cannot remove the group leader');
      }

      const membership = await groupMemberRepository.findActiveOne(groupId, memberUserId);
      if (!membership) throw new NotFoundError('Member not found in this group');

      await groupMemberRepository.deleteById(membership._id.toString(), session);
      await groupRepository.updateById(groupId, { $inc: { currentMemberCount: -1 } });

      await session.commitTransaction();
      logger.info(`Member ${memberUserId} removed from group ${groupId}`);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getGroupMembers(groupId: string): Promise<any[]> {
    const group = await groupRepository.findByGroupId(groupId);
    if (!group) throw new NotFoundError('Group not found');

    const members = await groupMemberRepository.findByGroupId(groupId);

    return members.map((member) => ({
      _id:        member._id,
      userId:     member.userId,
      role:       member.role,
      joinedAt:   member.joinedAt,
      lastActive: member.lastActive,
    }));
  }

  async getMemberCount(groupId: string): Promise<{
    groupId: string;
    memberCount: number;
    capacity: number;
    availableSlots: number;
  }> {
    const group = await groupRepository.findByGroupId(groupId);
    if (!group) throw new NotFoundError('Group not found');

    const members = await groupMemberRepository.findByGroupId(groupId);
    const count   = members.length;

    return {
      groupId,
      memberCount:    count,
      capacity:       group.capacity,
      availableSlots: group.capacity - count,
    };
  }
}

export default new GroupMemberService();