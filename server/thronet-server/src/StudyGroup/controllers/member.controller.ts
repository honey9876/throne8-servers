// controllers/member.controller.ts

import { Request, Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import ResponseUtil from '@/shared/response.util';
import { asyncHandler } from '@/shared/utils/helpers.util';
import { AuthenticationError } from '@/shared/errors/app.error';
import groupMemberService from '../services/groupMember.service';
import { logger } from '@/shared/logger.util';

export const joinGroup = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.id;
  if (!userId) throw new AuthenticationError('User not authenticated');

  const group = await groupMemberService.joinGroup(groupId, userId);
  ResponseUtil.success(res, group, 'Successfully joined the group');
});

export const leaveGroup = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.id;
  if (!userId) throw new AuthenticationError('User not authenticated');

  await groupMemberService.leaveGroup(groupId, userId);
  ResponseUtil.success(res, null, 'Successfully left the group');
});

export const addMember = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { groupId } = req.params;
  const { userId: memberUserId } = req.body;

  const result = await groupMemberService.addMember(groupId, memberUserId);
  ResponseUtil.created(res, result, 'Member added successfully');
});

export const removeMember = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { groupId, userId: memberUserId } = req.params;
  const currentUserId = (req as AuthRequest).user?.id;
  if (!currentUserId) throw new AuthenticationError('User not authenticated');

  await groupMemberService.removeMember(groupId, memberUserId);
  ResponseUtil.success(res, null, 'Member removed successfully');
});

export const getGroupMembers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { groupId } = req.params;
  logger.info("inside controller")

  const members = await groupMemberService.getGroupMembers(groupId);
  logger.info("after service response", members)
  ResponseUtil.success(res, { total: members.length, members }, 'Members retrieved successfully');
});

export const getMemberCount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { groupId } = req.params;

  const data = await groupMemberService.getMemberCount(groupId);
  ResponseUtil.success(res, data, 'Member count retrieved successfully');
});

export default {
  joinGroup,
  leaveGroup,
  addMember,
  removeMember,
  getGroupMembers,
  getMemberCount,
};

//   /**
//  * ====================================
//  * MEMBER CONTROLLER
//  * ====================================
//  * Handle all group member management operations
//  */

// import { Request, Response } from 'express';
// import { AuthRequest } from '@/shared/middlewares/auth.middleware';
// import ResponseUtil from '@/shared/response.util';
// import { asyncHandler } from '@/shared/utils/helpers.util';
// import Group from '../models/Group.model';
// import GroupMember from '../models/GroupMember.model';
// import { User } from '@/auth/models';
// import { MemberRole, MemberStatus } from '../interfaces/IGroupMember';
// import mongoose from 'mongoose';
// import { AuthenticationError, AuthorizationError, ConflictError, ForbiddenError, NotFoundError, ValidationError,  } from '@/shared/errors/app.error';


// /**
//  * @desc    Join a group
//  * @route   POST /api/groups/:groupId/join
//  * @access  Private
//  */
// export const joinGroup = asyncHandler(
//   async (req: Request, res: Response): Promise<void> => {
//     const { groupId } = req.params;
//     const userId = (req as AuthRequest).user?.id;

//     if (!userId) {
//       throw new AuthenticationError('User not authenticated');
//     }

//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       // Find group
//       const group = await Group.findById(groupId).session(session);

//       if (!group || !group.isActive) {
//         throw new NotFoundError('Group not found');
//       }

//       // Check capacity
//       if (group.currentMemberCount >= group.capacity) {
//         throw new ForbiddenError(
//           'Group has reached maximum capacity'
//         );
//       }

//       // Check if already a member
//       const existingMember = await GroupMember.findOne({
//         group: groupId,
//         user: userId,
//       }).session(session);

//       if (existingMember && existingMember.status === MemberStatus.ACTIVE) {
//         throw new ConflictError(
//           'You are already a member of this group'
//         );
//       }

//       if (existingMember && existingMember.status === MemberStatus.BANNED) {
//         throw new ForbiddenError(
//           'You have been banned from this group'
//         );
//       }

//       // Create or reactivate membership
//       if (existingMember) {
//         existingMember.status = MemberStatus.ACTIVE;
//         existingMember.joinedAt = new Date();
//         existingMember.lastActive = new Date();
//         await existingMember.save({ session });
//       } else {
//         await GroupMember.create(
//           [
//             {
//               group: groupId,
//               user: userId,
//               role: MemberRole.MEMBER,
//               status: MemberStatus.ACTIVE,
//             },
//           ],
//           { session }
//         );
//       }

//       // Increment member count
//       group.currentMemberCount += 1;
//       await group.save({ session });

//       await session.commitTransaction();

//       // Get updated group with leader info
//       const updatedGroup = await Group.findById(groupId).populate(
//         'leader',
//         'name email avatar'
//       );

//       ResponseUtil.success(res, updatedGroup, 'Successfully joined the group');
//     } catch (error : any) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }
// );

// /**
//  * @desc    Leave a group
//  * @route   POST /api/groups/:groupId/leave
//  * @access  Private
//  */
// export const leaveGroup = asyncHandler(
//   async (req: Request, res: Response): Promise<void> => {
//     const { groupId } = req.params;
//     const userId = (req as AuthRequest).user?.id;

//     if (!userId) {
//       throw new AuthenticationError('User not authenticated');
//     }

//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       // Find group
//       const group = await Group.findById(groupId).session(session);

//       if (!group) {
//         throw new NotFoundError('Group not found');
//       }

//       // Leader cannot leave
//       if (group.leaderId === userId) {
//         throw new ConflictError(

//           'Group leader cannot leave. Please delete the group or transfer leadership first'
//         );
//       }

//       // Find membership
//       const membership = await GroupMember.findOne({
//         group: groupId,
//         user: userId,
//         status: MemberStatus.ACTIVE,
//       }).session(session);

//       if (!membership) {
//         throw new AuthorizationError(
//           'You are not a member of this group'
//         );
//       }

//       // Remove membership
//       await GroupMember.findByIdAndDelete(membership._id).session(session);

//       // Decrement member count
//       group.currentMemberCount = Math.max(0, group.currentMemberCount - 1);
//       await group.save({ session });

//       await session.commitTransaction();

//       ResponseUtil.success(res, null, 'Successfully left the group');
//     } catch (error : any) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }
// );

// /**
//  * @desc    Add member to group (leader only)
//  * @route   POST /api/groups/:groupId/add-member
//  * @access  Private (Leader/Admin)
//  */
// export const addMember = asyncHandler(
//   async (req: Request, res: Response): Promise<void> => {
//     const { groupId } = req.params;
//     const { userId: memberUserId } = req.body;

//     if (!memberUserId) {
//       throw new ValidationError('User ID is required');
//     }

//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       // Find group
//       const group = await Group.findById(groupId).session(session);

//       if (!group || !group.isActive) {
//         throw new NotFoundError('Group not found');
//       }

//       // Check capacity
//       if (group.currentMemberCount >= group.capacity) {
//         throw new ForbiddenError(
//           'Group has reached maximum capacity'
//         );
//       }

//       // Check if user exists
//       const user = await User.findById(memberUserId);
//       if (!user || user.status !== 'active') {
//         throw new NotFoundError('User not found');
//       }

//       // Check if already a member
//       const existingMember = await GroupMember.findOne({
//         group: groupId,
//         user: memberUserId,
//       }).session(session);

//       if (existingMember && existingMember.status === MemberStatus.ACTIVE) {
//         throw new ConflictError(

//           'User is already a member of this group'
//         );
//       }

//       if (existingMember && existingMember.status === MemberStatus.BANNED) {
//         throw new AuthorizationError(

//           'User has been banned from this group'
//         );
//       }

//       // Create or reactivate membership
//       if (existingMember) {
//         existingMember.status = MemberStatus.ACTIVE;
//         existingMember.joinedAt = new Date();
//         existingMember.lastActive = new Date();
//         await existingMember.save({ session });
//       } else {
//         await GroupMember.create(
//           [
//             {
//               group: groupId,
//               user: memberUserId,
//               role: MemberRole.MEMBER,
//               status: MemberStatus.ACTIVE,
//             },
//           ],
//           { session }
//         );
//       }

//       // Increment member count
//       group.currentMemberCount += 1;
//       await group.save({ session });

//       await session.commitTransaction();

//       ResponseUtil.created(res, { userId: memberUserId }, 'Member added successfully');
//     } catch (error : any) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }
// );

// /**
//  * @desc    Remove member from group (leader only)
//  * @route   DELETE /api/groups/:groupId/remove-member/:userId
//  * @access  Private (Leader/Admin)
//  */
// export const removeMember = asyncHandler(
//   async (req: Request, res: Response): Promise<void> => {
//     const { groupId, userId: memberUserId } = req.params;
//     const currentUserId = (req as AuthRequest).user?.id;

//     if (!currentUserId) {
//       throw new AuthenticationError('User not authenticated');
//     }

//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       // Find group
//       const group = await Group.findById(groupId).session(session);

//       if (!group) {
//         throw new NotFoundError('Group not found');
//       }

//       // Cannot remove the leader
//       if (group.leaderId === memberUserId) {
//         throw new AuthorizationError(
//           'Cannot remove the group leader'
//         );
//       }

//       // Find membership
//       const membership = await GroupMember.findOne({
//         group: groupId,
//         user: memberUserId,
//         status: MemberStatus.ACTIVE,
//       }).session(session);

//       if (!membership) {
//         throw new NotFoundError('Member not found in this group');
//       }

//       // Remove membership
//       await GroupMember.findByIdAndDelete(membership._id).session(session);

//       // Decrement member count
//       group.currentMemberCount = Math.max(0, group.currentMemberCount - 1);
//       await group.save({ session });

//       await session.commitTransaction();

//       ResponseUtil.success(res, null, 'Member removed successfully');
//     } catch (error : any) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }
// );

// /**
//  * @desc    Get all group members
//  * @route   GET /api/groups/:groupId/members
//  * @access  Private
//  */
// export const getGroupMembers = asyncHandler(
//   async (req: Request, res: Response): Promise<void> => {
//     const { groupId } = req.params;

//     // Find group
//     const group = await Group.findById(groupId);

//     if (!group) {
//       throw new NotFoundError('Group not found');
//     }

//     // Get members
//     const members = await GroupMember.find({
//       group: groupId,
//       status: MemberStatus.ACTIVE,
//     })
//       .populate('user', 'name email avatar')
//       .sort({ joinedAt: 1 })
//       .lean();

//     const formattedMembers = members.map((member) => ({
//       _id: member._id,
//       user: member.userId,
//       role: member.role,
//       joinedAt: member.joinedAt,
//       lastActive: member.lastActive,
//     }));

//     ResponseUtil.success(
//       res,
//       { total: formattedMembers.length, members: formattedMembers },
//       'Members retrieved successfully'
//     );
//   }
// );

// /**
//  * @desc    Get group member count
//  * @route   GET /api/groups/:groupId/member-count
//  * @access  Public
//  */
// export const getMemberCount = asyncHandler(
//   async (req: Request, res: Response): Promise<void> => {
//     const { groupId } = req.params;

//     // Find group
//     const group = await Group.findById(groupId);

//     if (!group) {
//       throw new NotFoundError('Group not found');
//     }

//     const count = await GroupMember.countDocuments({
//       group: groupId,
//       status: MemberStatus.ACTIVE,
//     });

//     ResponseUtil.success(
//       res,
//       {
//         groupId,
//         memberCount: count,
//         capacity: group.capacity,
//         availableSlots: group.capacity - count,
//       },
//       'Member count retrieved successfully'
//     );
//   }
// );

// export default {
//   joinGroup,
//   leaveGroup,
//   addMember,
//   removeMember,
//   getGroupMembers,
//   getMemberCount,
// };
