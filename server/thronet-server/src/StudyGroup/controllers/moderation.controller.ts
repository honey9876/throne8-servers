/**
 * ====================================
 * MODERATION CONTROLLER (PRODUCTION READY - FIXED)
 * ====================================
 */

import { Request, Response } from 'express';
import { asyncHandler } from '@/shared/errors/app.error';
import ResponseUtil from '@/shared/response.util';
import { HttpStatus } from '../enums/HttpStatus.enum';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/shared/errors/app.error';
import { LoggerUtil } from '@/shared/logger.util';

// Models
import Group from '../models/Group.model';
import GroupMember from '../models/GroupMember.model';
import Message from '../models/Message.model';

// Services
import notificationService from '../services/notification.service';

// Types & Enums
import { MemberRole, MemberStatus } from '../interfaces/IGroupMember';
import { NotificationType } from '../enums/NotificationType.enum';
import mongoose from 'mongoose';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import groupRepository, { GroupRepository } from '../repositories/group.repository';
import groupMemberRepository from '../repositories/groupMember.repository';

/**
 * Check moderation permissions
 */
const checkModerationPermission = async (
  groupId: string,
  userId: string,
  requireLeader: boolean = false
): Promise<{ member: any; group: any }> => {
  const group = await groupRepository.findByGroupId(groupId);
  const member = await groupMemberRepository.findActiveOne(groupId, userId);
  if (!group) {
    throw new NotFoundError('Group not found');
  }

  // const member = await GroupMember.findOne({
  //   group: groupId,
  //   user: userId,
  //   status: MemberStatus.ACTIVE,
  // });

  if (!member) {
    throw new ForbiddenError('You are not a member of this group');
  }

  if (requireLeader && member.role !== MemberRole.LEADER) {
    throw new ForbiddenError('Only group leader can perform this action');
  }

  if (!requireLeader && member.role !== MemberRole.LEADER && member.role !== MemberRole.ADMIN) {
    throw new ForbiddenError('Only group leader or moderators can perform this action');
  }

  return { member, group };
};

/**
 * SET GROUP RULES
 */
export const setGroupRules = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const { rules } = req.body;
  const userId = (req as AuthRequest).user?.id;

  if (!groupId) {
    throw new BadRequestError('Group ID is required');
  }

  if (!rules || !Array.isArray(rules)) {
    throw new BadRequestError('Rules must be an array');
  }

  if (rules.length === 0) {
    throw new BadRequestError('At least one rule is required');
  }

  if (rules.length > 20) {
    throw new BadRequestError('Maximum 20 rules allowed');
  }

  for (const rule of rules) {
    if (typeof rule !== 'string' || rule.trim().length === 0) {
      throw new BadRequestError('Each rule must be a non-empty string');
    }
    if (rule.length > 500) {
      throw new BadRequestError('Each rule must not exceed 500 characters');
    }
  }

  await checkModerationPermission(groupId, userId!, true);

  const group = await Group.findOneAndUpdate(
    { groupId },
    {
      $set: {
        rules: rules.map((r: string) => r.trim()),
        rulesUpdatedAt: new Date(),
        rulesUpdatedBy: userId,
      },
    },
    { new: true, runValidators: true }
  );

  LoggerUtil.info(`✅ Group rules updated: ${groupId} by user ${userId}`);

  return ResponseUtil.success(
    res,
    {
      rules: (group as any)?.rules || [],
      updatedAt: (group as any)?.rulesUpdatedAt,
    },
    'Group rules updated successfully',
    HttpStatus.OK
  );
});

/**
 * GET GROUP RULES
 */
export const getGroupRules = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.id;

  const member = await GroupMember.findOne({
    group: groupId,
    user: userId,
  });

  if (!member) {
    throw new ForbiddenError('You must be a member to view group rules');
  }

  // const group = await Group.findById(groupId).select('title rules rulesUpdatedAt');
  const group = await groupRepository.findByGroupId(groupId);

  if (!group) {
    throw new NotFoundError('Group not found');
  }

  return ResponseUtil.success(
    res,
    {
      groupId: group.groupId,
      groupTitle: group.title,
      rules: (group as any).rules || [],
      updatedAt: (group as any).rulesUpdatedAt || null,
    },
    'Group rules fetched successfully',
    HttpStatus.OK
  );
});

/**
 * KICK MEMBER
 */
export const kickMember = asyncHandler(async (req: Request, res: Response) => {
  const { groupId, userId: targetUserId } = req.params;
  const { reason } = req.body;
  const moderatorId = (req as AuthRequest).user?.id;

  if (!groupId) {
    throw new BadRequestError('Group ID is required');
  }

  if (!targetUserId) {
    throw new BadRequestError('Target user ID is required');
  }

  if (!reason || reason.trim().length === 0) {
    throw new BadRequestError('Reason is required');
  }

  if (reason.length > 500) {
    throw new BadRequestError('Reason must not exceed 500 characters');
  }

  const { group } = await checkModerationPermission(groupId, moderatorId!, false);

  if (moderatorId === targetUserId) {
    throw new BadRequestError('You cannot kick yourself');
  }

  if (group.leaderId === targetUserId) {
    throw new BadRequestError('Cannot kick the group leader');
  }

  const targetMember = await groupMemberRepository.findOne(groupId, targetUserId);

  if (!targetMember) {
    throw new NotFoundError('Member not found or already removed');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await GroupMember.findByIdAndDelete(targetMember._id, { session });
    await Group.findOneAndUpdate(
      { groupId },
      { $inc: { currentMemberCount: -1 } },
      { session }
    );

    await Group.findOneAndUpdate(
      { groupId },
      {
        $push: {
          moderationLogs: {
            action: 'kick',
            moderator: moderatorId,
            target: targetUserId,
            reason: reason.trim(),
            timestamp: new Date(),
          },
        },
      },
      { session }
    );

    await session.commitTransaction();

    LoggerUtil.info(`✅ Member kicked: ${targetUserId} from group ${groupId} by ${moderatorId}`);

    notificationService.createNotification({
      type: NotificationType.KICKED,
      recipient: targetUserId,
      sender: moderatorId,
      title: 'Kicked from Group',
      message: `You have been removed from "${group.title}". Reason: ${reason.trim()}`,
      data: { groupId, reason: reason.trim() },
      priority: 'high',
    }).catch((err: any) => LoggerUtil.error(`Failed to send notification: ${err.message}`));

    return ResponseUtil.success(
      res,
      {
        groupId,
        kickedUserId: targetUserId,
        reason: reason.trim(),
      },
      'Member kicked successfully',
      HttpStatus.OK
    );
  } catch (error: any) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * BAN MEMBER
 */
export const banMember = asyncHandler(async (req: Request, res: Response) => {
  const { groupId, userId: targetUserId } = req.params;
  const { reason, permanent = true } = req.body;
  const moderatorId = (req as AuthRequest).user?.id;

  if (!groupId) {
    throw new BadRequestError('Group ID is required');
  }

  if (!targetUserId) {
    throw new BadRequestError('Target user ID is required');
  }

  if (!reason || reason.trim().length === 0) {
    throw new BadRequestError('Reason is required');
  }

  const { group } = await checkModerationPermission(groupId, moderatorId!, true);

  if (moderatorId === targetUserId) {
    throw new BadRequestError('You cannot ban yourself');
  }

  const targetMember = await groupMemberRepository.findOne(groupId, targetUserId)

  if (!targetMember) {
    throw new NotFoundError('User is not a member of this group');
  }

  if (targetMember.status === MemberStatus.BANNED) {
    throw new BadRequestError('User is already banned');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await GroupMember.findByIdAndUpdate(
      targetMember._id,
      {
        $set: {
          status: MemberStatus.BANNED,
          bannedAt: new Date(),
          bannedBy: moderatorId,
          banReason: reason.trim(),
          banPermanent: permanent,
        },
      },
      { session }
    );

    if (targetMember.status === MemberStatus.ACTIVE) {
      await Group.findOneAndUpdate(
        { groupId },
        { $inc: { currentMemberCount: -1 } },
        { session }
      );
    }

    await Group.findOneAndUpdate(
      { groupId },
      {
        $push: {
          bannedUsers: {
            user: targetUserId,
            bannedBy: moderatorId,
            reason: reason.trim(),
            bannedAt: new Date(),
            permanent,
          },
        },
      },
      { session }
    );

    await session.commitTransaction();

    LoggerUtil.info(`✅ Member banned: ${targetUserId} from group ${groupId}`);

    notificationService.createNotification({
      type: NotificationType.BANNED,
      recipient: targetUserId,
      sender: moderatorId,
      title: 'Banned from Group',
      message: `You have been ${permanent ? 'permanently' : 'temporarily'} banned from "${group.title}"`,
      data: { groupId, reason: reason.trim(), permanent },
      priority: 'high',
    }).catch((err: any) => LoggerUtil.error(`Failed to send notification: ${err.message}`));

    return ResponseUtil.success(
      res,
      { groupId, bannedUserId: targetUserId, reason: reason.trim(), permanent },
      'Member banned successfully',
      HttpStatus.OK
    );
  } catch (error: any) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * UNBAN MEMBER
 */
export const unbanMember = asyncHandler(async (req: Request, res: Response) => {
  const { groupId, userId: targetUserId } = req.params;
  const moderatorId = (req as AuthRequest).user?.id;

  if (!groupId) {
    throw new BadRequestError('Group ID is required');
  }

  if (!targetUserId) {
    throw new BadRequestError('Target user ID is required');
  }

  const { group } = await checkModerationPermission(groupId, moderatorId!, true);

  const targetMember = await groupMemberRepository.findOne(groupId, targetUserId)

  if (!targetMember) {
    throw new NotFoundError('User is not banned');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await GroupMember.findByIdAndUpdate(
      targetMember._id,
      {
        $set: { status: MemberStatus.INACTIVE },
        $unset: { bannedAt: '', bannedBy: '', banReason: '', banPermanent: '' },
      },
      { session }
    );

    await Group.findOneAndUpdate(
      { groupId },
      { $pull: { bannedUsers: { user: targetUserId } } },
      { session }
    );

    await session.commitTransaction();

    LoggerUtil.info(`✅ Member unbanned: ${targetUserId}`);

    notificationService.createNotification({
      type: NotificationType.UNBANNED,
      recipient: targetUserId,
      sender: moderatorId,
      title: 'Unbanned from Group',
      message: `You have been unbanned from "${group.title}"`,
      data: { groupId },
      priority: 'medium',
    }).catch((err: any) => LoggerUtil.error(`Failed to send notification: ${err.message}`));

    return ResponseUtil.success(
      res,
      { groupId, unbannedUserId: targetUserId },
      'Member unbanned successfully',
      HttpStatus.OK
    );
  } catch (error: any) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * WARN MEMBER
 */
export const warnMember = asyncHandler(async (req: Request, res: Response) => {
  const { groupId, userId: targetUserId } = req.params;
  const { reason } = req.body;
  const moderatorId = (req as AuthRequest).user?.id;

  if (!groupId) {
    throw new BadRequestError('Group ID is required');
  }

  if (!targetUserId) {
    throw new BadRequestError('Target user ID is required');
  }

  if (!reason || reason.trim().length === 0) {
    throw new BadRequestError('Reason is required');
  }

  const { group } = await checkModerationPermission(groupId, moderatorId!, false);

  if (moderatorId === targetUserId) {
    throw new BadRequestError('You cannot warn yourself');
  }

  if (group.leaderId === targetUserId) {
    throw new BadRequestError('Cannot warn the group leader');
  }

  const targetMember = await groupMemberRepository.findOne(groupId, targetUserId)
  // GroupMember.findOne({
  //   group: groupId,
  //   user: targetUserId,
  //   status: MemberStatus.ACTIVE,
  // });

  if (!targetMember) {
    throw new NotFoundError('Member not found');
  }

  const updatedMember = await GroupMember.findByIdAndUpdate(
    targetMember._id,
    {
      $push: {
        warnings: {
          warnedBy: moderatorId,
          reason: reason.trim(),
          warnedAt: new Date(),
        },
      },
      $inc: { warningCount: 1 },
    },
    { new: true }
  );

  const warningCount = (updatedMember as any).warningCount || 1;

  LoggerUtil.info(`✅ Warning issued: ${targetUserId} (Warning #${warningCount})`);

  let autoKicked = false;
  if (warningCount >= 3) {
    await GroupMember.findByIdAndDelete(targetMember._id);
    await Group.findOneAndUpdate({ groupId }, { $inc: { currentMemberCount: -1 } });
    autoKicked = true;

    notificationService.createNotification({
      type: NotificationType.KICKED,
      recipient: targetUserId,
      sender: moderatorId,
      title: 'Kicked from Group (3 Warnings)',
      message: `You have been removed from "${group.title}" after 3 warnings`,
      data: { groupId, autoKicked: true },
      priority: 'high',
    }).catch((err: any) => LoggerUtil.error(`Failed to send notification: ${err.message}`));
  } else {
    notificationService.createNotification({
      type: NotificationType.WARNING_RECEIVED,
      recipient: targetUserId,
      sender: moderatorId,
      title: `Warning #${warningCount} in Group`,
      message: `You received a warning in "${group.title}". Reason: ${reason.trim()}`,
      data: { groupId, reason: reason.trim(), warningCount },
      priority: 'high',
    }).catch((err: any) => LoggerUtil.error(`Failed to send notification: ${err.message}`));
  }

  return ResponseUtil.success(
    res,
    { groupId, warnedUserId: targetUserId, reason: reason.trim(), warningCount, autoKicked },
    autoKicked ? 'Member warned and auto-kicked (3 warnings)' : `Warning issued (${warningCount}/3)`,
    HttpStatus.OK
  );
});

/**
 * ASSIGN MODERATOR
 */
export const assignModerator = asyncHandler(async (req: Request, res: Response) => {
  const { groupId, userId: targetUserId } = req.params;
  const leaderId = (req as AuthRequest).user?.id;

  if (!groupId) {
    throw new BadRequestError('Group ID is required');
  }

  if (!targetUserId) {
    throw new BadRequestError('Target user ID is required');
  }

  await checkModerationPermission(groupId, leaderId!, true);

  if (leaderId === targetUserId) {
    throw new BadRequestError('You are already the leader');
  }

  const targetMember = await groupMemberRepository.findOne(groupId, targetUserId)
  // GroupMember.findOne({
  //   group: groupId,
  //   user: targetUserId,
  //   status: MemberStatus.ACTIVE,
  // });

  if (!targetMember) {
    throw new NotFoundError('Member not found');
  }

  if (targetMember.role === MemberRole.ADMIN) {
    throw new BadRequestError('User is already a moderator');
  }

  await GroupMember.findByIdAndUpdate(targetMember._id, {
    $set: { role: MemberRole.ADMIN },
  });

  LoggerUtil.info(`✅ Moderator assigned: ${targetUserId} in group ${groupId}`);

  // const group = await Group.findById(groupId).select('title');
  const group = await groupRepository.findByGroupId(groupId);

  notificationService.createNotification({
    type: NotificationType.MODERATOR_ASSIGNED,
    recipient: targetUserId,
    sender: leaderId,
    title: 'Promoted to Moderator',
    message: `You are now a moderator in "${group?.title}"`,
    data: { groupId, role: MemberRole.ADMIN },
    priority: 'medium',
  }).catch((err: any) => LoggerUtil.error(`Failed to send notification: ${err.message}`));

  return ResponseUtil.success(
    res,
    { groupId, userId: targetUserId, newRole: MemberRole.ADMIN },
    'Moderator assigned successfully',
    HttpStatus.OK
  );
});

/**
 * REMOVE MODERATOR
 */
export const removeModerator = asyncHandler(async (req: Request, res: Response) => {
  const { groupId, userId: targetUserId } = req.params;
  const leaderId = (req as AuthRequest).user?.id;

  if (!groupId) {
    throw new BadRequestError('Group ID is required');
  }

  if (!targetUserId) {
    throw new BadRequestError('Target user ID is required');
  }

  await checkModerationPermission(groupId, leaderId!, true);

  if (leaderId === targetUserId) {
    throw new BadRequestError('You cannot remove yourself as leader');
  }

  const targetMember = await groupMemberRepository.findOne(groupId, targetUserId)
  // GroupMember.findOne({
  //   group: groupId,
  //   user: targetUserId,
  //   status: MemberStatus.ACTIVE,
  // });

  if (!targetMember) {
    throw new NotFoundError('Member not found');
  }

  if (targetMember.role !== MemberRole.ADMIN) {
    throw new BadRequestError('User is not a moderator');
  }

  await GroupMember.findByIdAndUpdate(targetMember._id, {
    $set: { role: MemberRole.MEMBER },
  });

  LoggerUtil.info(`✅ Moderator removed: ${targetUserId}`);

  const group = await Group.findById(groupId).select('title');

  notificationService.createNotification({
    type: NotificationType.MODERATOR_REMOVED,
    recipient: targetUserId,
    sender: leaderId,
    title: 'Moderator Role Removed',
    message: `You are no longer a moderator in "${group?.title}"`,
    data: { groupId, role: MemberRole.MEMBER },
    priority: 'medium',
  }).catch((err: any) => LoggerUtil.error(`Failed to send notification: ${err.message}`));

  return ResponseUtil.success(
    res,
    { groupId, userId: targetUserId, newRole: MemberRole.MEMBER },
    'Moderator role removed successfully',
    HttpStatus.OK
  );
});

/**
 * REPORT USER
 */
export const reportUser = asyncHandler(async (req: Request, res: Response) => {
  const { groupId, reportedUserId, reason, description } = req.body;
  const reporterId = (req as AuthRequest).user?.id;

  if (!groupId || !reportedUserId || !reason) {
    throw new BadRequestError('Group ID, reported user ID, and reason are required');
  }

  if (!description || description.trim().length === 0) {
    throw new BadRequestError('Description is required');
  }

  if (reporterId === reportedUserId) {
    throw new BadRequestError('You cannot report yourself');
  }

  const [reporter, reportedUser] = await Promise.all([
    groupMemberRepository.findOne(groupId, reporterId!),
    groupMemberRepository.findOne(groupId, reportedUserId)
  ]);

  if (!reporter) {
    throw new ForbiddenError('You are not a member of this group');
  }

  if (!reportedUser) {
    throw new NotFoundError('Reported user is not a member of this group');
  }

  await Group.findOneAndUpdate({ groupId }, {
    $push: {
      reports: {
        reporter: reporterId,
        reportedUser: reportedUserId,
        reason,
        description: description.trim(),
        status: 'pending',
        reportedAt: new Date(),
      },
    },
  });

  LoggerUtil.info(`✅ User reported: ${reportedUserId} in group ${groupId}`);

  // const moderators = await 
  // GroupMember.find({
  //   group: groupId,
  //   role: { $in: [MemberRole.LEADER, MemberRole.ADMIN] },
  // }).select('user');

  const allMembers = await groupMemberRepository.findByGroupId(groupId);
  const moderatorIds = allMembers
    .filter(m => m.role === MemberRole.LEADER || m.role === MemberRole.ADMIN)
    .map(m => m.userId);


  if (moderatorIds.length > 0) {
    notificationService.createBulkNotifications({
      type: NotificationType.USER_REPORTED,
      recipients: moderatorIds,
      sender: reporterId,
      title: 'New User Report',
      message: `A user has been reported. Reason: ${reason}`,
      data: { groupId, reportedUserId, reason },
      priority: 'high',
    }).catch((err: any) => LoggerUtil.error(`Failed to send notifications: ${err.message}`));
  }

  return ResponseUtil.success(
    res,
    { groupId, reportedUserId, reason },
    'User reported successfully',
    HttpStatus.CREATED
  );
});

/**
 * REPORT MESSAGE
 */
export const reportMessage = asyncHandler(async (req: Request, res: Response) => {
  const { messageId, reason, description } = req.body;
  const reporterId = (req as AuthRequest).user?.id;

  if (!messageId || !reason) {
    throw new BadRequestError('Message ID and reason are required');
  }

  if (!description || description.trim().length === 0) {
    throw new BadRequestError('Description is required');
  }

  // const message = await Message.findById(messageId).select('groupId sender content');

  const message = await Message.findOne({ _id: messageId }).select('groupId sender content');

  if (!message) {
    throw new NotFoundError('Message not found');
  }

  if (message.sender === reporterId) {
    throw new BadRequestError('You cannot report your own message');
  }

  const reporter = await groupMemberRepository.findOne(message.groupId, reporterId!)
  // GroupMember.findOne({
  //   group: message.groupId,
  //   user: reporterId,
  // });

  if (!reporter) {
    throw new ForbiddenError('You are not a member of this group');
  }

  await Group.findOneAndUpdate({ groupId: message.groupId }, {
    $push: {
      messageReports: {
        reporter: reporterId,
        messageId,
        messageSender: message.sender,
        reason,
        description: description.trim(),
        status: 'pending',
        reportedAt: new Date(),
      },
    },
  });

  LoggerUtil.info(`✅ Message reported: ${messageId}`);

  // const moderators = await GroupMember.find({
  //   group: message.groupId,
  //   role: { $in: [MemberRole.LEADER, MemberRole.ADMIN] },
  // }).select('user');

  // const moderatorIds = moderators.map((m) => m.userId.toString());

  const allMembers = await groupMemberRepository.findByGroupId(message.groupId);
  const moderatorIds = allMembers
    .filter(m => m.role === MemberRole.LEADER || m.role === MemberRole.ADMIN)
    .map(m => m.userId);

  if (moderatorIds.length > 0) {
    notificationService.createBulkNotifications({
      type: NotificationType.MESSAGE_REPORTED,
      recipients: moderatorIds,
      sender: reporterId,
      title: 'Message Reported',
      message: `A message has been reported. Reason: ${reason}`,
      data: { messageId, reason },
      priority: 'high',
    }).catch((err: any) => LoggerUtil.error(`Failed to send notifications: ${err.message}`));
  }

  return ResponseUtil.success(
    res,
    { messageId, reason },
    'Message reported successfully',
    HttpStatus.CREATED
  );
});

/**
 * GET REPORTS
 */
export const getReports = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const { status = 'pending', type = 'all' } = req.query;
  const userId = (req as AuthRequest).user?.id;

  if (!groupId) {
    throw new BadRequestError('Group ID is required');
  }

  await checkModerationPermission(groupId, userId!, false);

  // const group = await groupMemberRepository.findByGroupId(groupId).select('reports messageReports title')
  // Group.findById(groupId).select('reports messageReports title');

  const group = await groupRepository.findByGroupIdWithReports(groupId);

  if (!group) {
    throw new NotFoundError('Group not found');
  }

  let userReports = (group as any).reports || [];
  let messageReports = (group as any).messageReports || [];

  if (status !== 'all') {
    userReports = userReports.filter((r: any) => r.status === status);
    messageReports = messageReports.filter((r: any) => r.status === status);
  }

  let reports: any[] = [];
  if (type === 'user') {
    reports = userReports;
  } else if (type === 'message') {
    reports = messageReports;
  } else {
    reports = [...userReports, ...messageReports];
  }

  reports.sort((a, b) => b.reportedAt - a.reportedAt);

  return ResponseUtil.success(
    res,
    {
      groupId,
      groupTitle: group.title,
      reports,
      totalCount: reports.length,
      userReportsCount: userReports.length,
      messageReportsCount: messageReports.length,
    },
    'Reports fetched successfully',
    HttpStatus.OK
  );
});