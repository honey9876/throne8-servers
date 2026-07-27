/**
 * ====================================
 * GROUP CONTROLLER
 * ====================================
 * Request handlers for group routes
 */

import { Request, Response } from 'express';
import { asyncHandler } from '@/shared/errors/app.error';
import groupService from '../services/group.service';
import ResponseUtil, { createPaginatedResponse } from '@/shared/response.util';
import { SUCCESS_MESSAGES } from '../utils/constants';
import {
  createGroupSchema,
  updateGroupSchema,
  joinGroupSchema,
  groupListQuerySchema,
  objectIdSchema,
} from '../validators/group.validator';
import { ValidationError } from '@/shared/errors/app.error';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { logger } from '@/shared/logger.util';
import { validId } from '@/shared/security';

class GroupController {
  /**
   * @route   POST /api/v1/groups
   * @desc    Create a new group
   * @access  Private
   */
  static createGroup = asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = createGroupSchema.validate(req.body);
    if (error) {
      logger.error(`Validation failed ${error}`)
      throw new ValidationError(`Validation failed ${error}`);
    }

    const userId = (req as AuthRequest).user?.id;
    const group = await groupService.createGroup(userId!, value);

    return ResponseUtil.created(res, group, SUCCESS_MESSAGES.GROUP_CREATED);
  });

  /**
   * @route   GET /api/v1/groups
   * @desc    Get all groups with filters and pagination
   * @access  Public
   */
  static getGroups = asyncHandler(async (req: Request, res: Response) => {
    logger.info("inside controller")
    const { error, value } = groupListQuerySchema.validate(req.query);
    if (error) {
      throw new ValidationError('Validation failed', error.details);
    }

    const userId = (req as AuthRequest).user?.id;
    const result = await groupService.getGroups(value, userId!);

    // return createPaginatedResponse(

    //   result.groups,
    //   result.page,
    //   value.limit,
    //   result.total,
    //   'Groups retrieved successfully'
    // );

    return ResponseUtil.success(
      res,
      {
        groups: result.groups,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages
      },
      'Groups retrieved successfully');
  });

  /**
   * @route   GET /api/v1/groups/my-groups
   * @desc    Get user's groups
   * @access  Private
   */
  static getMyGroups = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;
    const groups = await groupService.getUserGroups(userId!);
    console.log(`data at conytroller ${groups}`)

    return ResponseUtil.success(res, groups, 'Your groups retrieved successfully');
  });

  /**
   * @route   GET /api/v1/groups/:groupId
   * @desc    Get group by ID
   * @access  Public/Private (depends on visibility)
   */
  static getGroupById = asyncHandler(async (req: Request, res: Response) => {
    
    if (!validId(req.params.groupId)) {
      throw new ValidationError('Invalid group ID');
    }

    const groupId = req.params.groupId!; // Type assertion after validation
    const userId = (req as AuthRequest).user?.id;

    const group = await groupService.getGroupById(groupId, userId!);

    return ResponseUtil.success(res, group, 'Group retrieved successfully');
  });

  /**
   * @route   PUT /api/v1/groups/:groupId
   * @desc    Update group
   * @access  Private (Leader only)
   */
  static updateGroup = asyncHandler(async (req: Request, res: Response) => {
   
    if (!validId(req.params.groupId)) {
      throw new ValidationError('Invalid group ID');
    }

    const { error, value } = updateGroupSchema.validate(req.body);
    if (error) {
      throw new ValidationError('Validation failed', error.details);
    }

    const groupId = req.params.groupId!; // Type assertion after validation
    const userId = (req as AuthRequest).user?.id;

    const group = await groupService.updateGroup(groupId, userId!, value);

    return ResponseUtil.success(res, group, SUCCESS_MESSAGES.GROUP_UPDATED);
  });

  /**
   * @route   DELETE /api/v1/groups/:groupId
   * @desc    Delete group (soft delete)
   * @access  Private (Leader only)
   */
  static deleteGroup = asyncHandler(async (req: Request, res: Response) => {
    
    if (!validId(req.params.groupId)) {
      throw new ValidationError('Invalid group ID');
    }

    const groupId = req.params.groupId!; // Type assertion after validation
    const userId = (req as AuthRequest).user?.id;

    await groupService.deleteGroup(groupId, userId!);

    return ResponseUtil.success(res, null, SUCCESS_MESSAGES.GROUP_DELETED);
  });

  /**
   * @route   POST /api/v1/groups/:groupId/join
   * @desc    Join a group
   * @access  Private
   */
  static joinGroup = asyncHandler(async (req: Request, res: Response) => {
  
    if (!validId(req.params.groupId)) {
      throw new ValidationError('Invalid group ID');
    }

    const { error, value } = joinGroupSchema.validate(req.body);
    if (error) {
      throw new ValidationError('Validation failed', error.details);
    }

    const groupId = req.params.groupId!; // Type assertion after validation
    const userId = (req as AuthRequest).user?.id;

    const group = await groupService.joinGroup(groupId, userId!, value);

    return ResponseUtil.success(res, group, SUCCESS_MESSAGES.JOINED_GROUP);
  });

  /**
   * @route   POST /api/v1/groups/:groupId/leave
   * @desc    Leave a group
   * @access  Private
   */
  static leaveGroup = asyncHandler(async (req: Request, res: Response) => {

    if (!validId(req.params.groupId)) {
      throw new ValidationError('Invalid group ID');
    }

    const groupId = req.params.groupId!; // Type assertion after validation
    const userId = (req as AuthRequest).user?.id;

    await groupService.leaveGroup(groupId, userId!);

    return ResponseUtil.success(res, null, SUCCESS_MESSAGES.LEFT_GROUP);
  });

  /**
   * @route   GET /api/v1/groups/:groupId/members
   * @desc    Get group members
   * @access  Public/Private (depends on group visibility)
   */
  static getGroupMembers = asyncHandler(
    async (req: Request, res: Response) => {
      console.log("req.params.groupId", req.params.groupId)
      if (!validId(req.params.groupId)) {
        throw new ValidationError('Invalid group ID');
      }

      const groupId = req.params.groupId!; // Type assertion after validation
      const userId = (req as AuthRequest).user?.id;

      const members = await groupService.getGroupMembers(groupId, userId!);
      return ResponseUtil.success(res, members, 'Group members retrieved successfully');
    });

  static getTopRankedGroups = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 3, 20);
   const userId = (req as AuthRequest).user?.id;  // ← ADD
  const groups = await groupService.getTopRankedGroups(limit, userId);
  
  
  logger.info(`✅ final groups to send: ${groups.length}`);
  logger.info(`✅ is array: ${Array.isArray(groups)}`);

  return ResponseUtil.success(res, { groups }, 'Top ranked groups retrieved successfully');
});

}

export default GroupController;
