/**
 * ====================================
 * MEMBER ROUTES
 * ====================================
 * Routes for group member management
 */

import { NextFunction, Router } from 'express';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { isLeaderOrAdmin, isMember, isNotMember } from '../middleware/groupAccess.middleware';
import { checkGroupCapacity } from '../middleware/permission.middleware';
import { logger } from '@/shared/logger.util';
import memberController from '../controllers/member.controller';
// import {
//   isLeaderOrAdmin,
//   checkGroupCapacity,
//   isNotMember,
// } from '../middlewares/permission.middleware';

const router = Router();

// group join and leave also done in group routes doing same work

// /**
//  * @route   POST /api/groups/:groupId/join
//  * @desc    Join a group
//  * @access  Private
//  */
// router.post(
//   '/:groupId/join',
//   AuthMiddleware.authenticate as any,
//   isNotMember,
//   checkGroupCapacity as any,
//   memberController.joinGroup
// );

// /**
//  * @route   POST /api/groups/:groupId/leave
//  * @desc    Leave a group
//  * @access  Private
//  */
// router.post('/:groupId/leave', AuthMiddleware.authenticate as any, isMember,  memberController.leaveGroup);

/**
 * @route   POST /api/groups/:groupId/add-member
 * @desc    Add member to group (leader/admin only)
 * @access  Private (Leader/Admin)
 */
router.post(
  '/:groupId/add-member',
  AuthMiddleware.authenticate as any,
  isLeaderOrAdmin,
  checkGroupCapacity as any,
  memberController.addMember
);

/**
 * @route   DELETE /api/groups/:groupId/remove-member/:userId
 * @desc    Remove member from group (leader/admin only)
 * @access  Private (Leader/Admin)
 */
router.delete(
  '/:groupId/remove-member/:userId',
  AuthMiddleware.authenticate as any,
  isLeaderOrAdmin,
  memberController.removeMember
);

/**
 * @route   GET /api/groups/:groupId/members
 * @desc    Get all group members
 * @access  Private
 */
// router.get(
//   '/:groupId/members',
//   () => {
//     logger.info("after auth middleware")
//   },
//   AuthMiddleware.authenticate as any,
//   (next: NextFunction) => {
//     logger.info("after auth middleware")
//     next()
//   },
//   isMember,
//   (next:NextFunction) => {
//     logger.info("after ismember middleware")
//     next()
//   },
//   memberController.getGroupMembers);
router.get(
  '/:groupId/members',
  
  AuthMiddleware.authenticate as any,
  isMember,
  
  memberController.getGroupMembers);

/**
 * @route   GET /api/groups/:groupId/member-count
 * @desc    Get group member count
 * @access  Public
 */
router.get('/:groupId/member-count', memberController.getMemberCount);

export default router;