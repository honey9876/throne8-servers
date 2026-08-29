console.log('🟢 STEP-2: liveRoom.controller.ts file STARTED loading');
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '@/shared/utils/helpers.util';
import * as webrtcService from '../services/webrtc.service';
import ResponseUtil from '@/shared/response.util';
import { ValidationError } from '@/shared/errors/app.error';
import {
  createLiveRoomSchema,
  updateLiveRoomSchema,
  joinLiveRoomSchema,
  toggleCameraSchema,
  toggleMicSchema,
  toggleScreenShareSchema,
  liveRoomQuerySchema,
  liveRoomIdSchema,
} from '../validators/liveRoom.validator';
import liveRoomRepository from '../repositories/liveRoom.repository';
import { LoggerUtil } from '@/shared/logger.util';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';

/**
 * @route   POST /api/v1/study-group/live-rooms
 * @access  Private (Group members)
 */
export const createLiveRoom = asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = createLiveRoomSchema.validate(req.body);
  if (error) throw new ValidationError('Validation failed', error.details);

  const userId = (req as AuthRequest).user?.id;
  const { groupId, ...roomData } = value;

  const liveRoom = await webrtcService.createLiveRoom(userId!, groupId, { ...roomData, groupId });

  LoggerUtil.info(`Live room created by user ${userId}: ${liveRoom._id}`);
  return ResponseUtil.created(res, liveRoom, 'Live room created successfully');
});

/**
 * @route   GET /api/v1/study-group/live-rooms/:roomId
 * @access  Private (Group members)
 */
export const getLiveRoomById = asyncHandler(async (req: Request, res: Response) => {
  const { error } = liveRoomIdSchema.validate(req.params);
  if (error) throw new ValidationError('Invalid room ID');

  const userId = (req as AuthRequest).user?.id;
  const liveRoom = await webrtcService.getLiveRoomById(req.params.roomId!, userId!);

  return ResponseUtil.success(res, liveRoom, 'Live room retrieved successfully');
});

/**
 * @route   GET /api/v1/study-group/live-rooms
 * @access  Private
 */
export const getLiveRooms = asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = liveRoomQuerySchema.validate(req.query);
  if (error) throw new ValidationError('Validation failed', error.details);

  const result = await webrtcService.getLiveRooms(value);

  return ResponseUtil.success(res, { rooms: result.rooms, page: result.page, limit: value.limit, total: result.total }, 'Live rooms retrieved successfully');
});

/**
 * @route   GET /api/v1/study-group/live-rooms/group/:groupId
 * @access  Private (Group members)
 */
export const getGroupLiveRooms = asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = liveRoomQuerySchema.validate({
    ...req.query,
    groupId: req.params.groupId,
  });
  if (error) throw new ValidationError('Validation failed', error.details);

  const result = await webrtcService.getLiveRooms(value);

  return ResponseUtil.success(res, { rooms: result.rooms, page: result.page, limit: value.limit, total: result.total }, 'Group live rooms retrieved successfully');
});

/**
 * @route   GET /api/v1/study-group/live-rooms/group/:groupId/active
 * @access  Private (Group members)
 */
export const getActiveLiveRoom = asyncHandler(async (req: Request, res: Response) => {
  const result = await webrtcService.getLiveRooms({
    groupId: req.params.groupId!,
    isActive: true,
    limit: 1,
    page: 1,
  });

  if (result.rooms.length === 0) {
    return ResponseUtil.success(res, null, 'No active live room found for this group');
  }

  return ResponseUtil.success(res, result.rooms[0], 'Active live room retrieved successfully');
});

/**
 * @route   PUT /api/v1/study-group/live-rooms/:roomId
 * @access  Private (Host)
 */
export const updateLiveRoom = asyncHandler(async (req: Request, res: Response) => {
  const { error: idError } = liveRoomIdSchema.validate(req.params);
  if (idError) throw new ValidationError('Invalid room ID');

  const { error, value } = updateLiveRoomSchema.validate(req.body);
  if (error) throw new ValidationError('Validation failed', error.details);

  const userId = (req as AuthRequest).user?.id;
  const liveRoom = await webrtcService.updateLiveRoom(req.params.roomId!, userId!, value);

  LoggerUtil.info(`Live room updated by user ${userId}: ${req.params.roomId}`);
  return ResponseUtil.success(res, liveRoom, 'Live room updated successfully');
});

/**
 * @route   POST /api/v1/study-group/live-rooms/:roomId/join
 * @access  Private (Group members)
 */
export const joinLiveRoom = asyncHandler(async (req: Request, res: Response) => {
  const { error: idError } = liveRoomIdSchema.validate(req.params);
  if (idError) throw new ValidationError('Invalid room ID');

  const { error, value } = joinLiveRoomSchema.validate(req.body);
  if (error) throw new ValidationError('Validation failed', error.details);

  const userId = (req as AuthRequest).user?.id;
  const liveRoom = await webrtcService.joinLiveRoom(req.params.roomId!, userId!, value);

  LoggerUtil.info(`User ${userId} joined live room: ${req.params.roomId}`);
  return ResponseUtil.success(res, liveRoom, 'Joined live room successfully');
});

/**
 * @route   POST /api/v1/study-group/live-rooms/:roomId/leave
 * @access  Private
 */
export const leaveLiveRoom = asyncHandler(async (req: Request, res: Response) => {
  const { error } = liveRoomIdSchema.validate(req.params);
  if (error) throw new ValidationError('Invalid room ID');

  const userId = (req as AuthRequest).user?.id;
  await webrtcService.leaveLiveRoom(req.params.roomId!, userId!);

  LoggerUtil.info(`User ${userId} left live room: ${req.params.roomId}`);
  return ResponseUtil.success(res, null, 'Left live room successfully');
});

/**
 * @route   POST /api/v1/study-group/live-rooms/:roomId/end
 * @access  Private (Host)
 */
export const endLiveRoom = asyncHandler(async (req: Request, res: Response) => {
  const { error } = liveRoomIdSchema.validate(req.params);
  if (error) throw new ValidationError('Invalid room ID');

  const userId = (req as AuthRequest).user?.id;
  const liveRoom = await webrtcService.endLiveRoom(req.params.roomId!, userId!);

  LoggerUtil.info(`Live room ended by user ${userId}: ${req.params.roomId}`);
  return ResponseUtil.success(res, liveRoom, 'Live room ended successfully');
});

/**
 * @route   PATCH /api/v1/study-group/live-rooms/:roomId/toggle-camera
 * @access  Private (Participants)
 */
export const toggleCamera = asyncHandler(async (req: Request, res: Response) => {
  const { error: idError } = liveRoomIdSchema.validate(req.params);
  if (idError) throw new ValidationError('Invalid room ID');

  const { error, value } = toggleCameraSchema.validate(req.body);
  if (error) throw new ValidationError('Validation failed', error.details);

  const userId = (req as AuthRequest).user?.id;
  const liveRoom = await liveRoomRepository.findRawById(req.params.roomId!);
  if (!liveRoom) throw new ValidationError('Live room not found');

  await liveRoom.toggleCamera(new Types.ObjectId(userId!), value.cameraOn);

  LoggerUtil.info(`User ${userId} toggled camera ${value.cameraOn ? 'ON' : 'OFF'} in room ${req.params.roomId}`);
  return ResponseUtil.success(res, { cameraOn: value.cameraOn }, `Camera turned ${value.cameraOn ? 'on' : 'off'} successfully`);
});

/**
 * @route   PATCH /api/v1/study-group/live-rooms/:roomId/toggle-mic
 * @access  Private (Participants)
 */
export const toggleMic = asyncHandler(async (req: Request, res: Response) => {
  const { error: idError } = liveRoomIdSchema.validate(req.params);
  if (idError) throw new ValidationError('Invalid room ID');

  const { error, value } = toggleMicSchema.validate(req.body);
  if (error) throw new ValidationError('Validation failed', error.details);

  const userId = (req as AuthRequest).user?.id;
  const liveRoom = await liveRoomRepository.findRawById(req.params.roomId!);
  if (!liveRoom) throw new ValidationError('Live room not found');

  await liveRoom.toggleMic(new Types.ObjectId(userId!), value.micOn);

  LoggerUtil.info(`User ${userId} toggled mic ${value.micOn ? 'ON' : 'OFF'} in room ${req.params.roomId}`);
  return ResponseUtil.success(res, { micOn: value.micOn }, `Microphone turned ${value.micOn ? 'on' : 'off'} successfully`);
});

/**
 * @route   PATCH /api/v1/study-group/live-rooms/:roomId/toggle-screen-share
 * @access  Private (Participants)
 */
export const toggleScreenShare = asyncHandler(async (req: Request, res: Response) => {
  const { error: idError } = liveRoomIdSchema.validate(req.params);
  if (idError) throw new ValidationError('Invalid room ID');

  const { error, value } = toggleScreenShareSchema.validate(req.body);
  if (error) throw new ValidationError('Validation failed', error.details);

  const userId = (req as AuthRequest).user?.id;
  const liveRoom = await liveRoomRepository.findRawById(req.params.roomId!);
  if (!liveRoom) throw new ValidationError('Live room not found');

  await liveRoom.toggleScreenShare(new Types.ObjectId(userId!), value.sharing);

  LoggerUtil.info(`User ${userId} toggled screen share ${value.sharing ? 'ON' : 'OFF'} in room ${req.params.roomId}`);
  return ResponseUtil.success(res, { sharing: value.sharing }, `Screen sharing ${value.sharing ? 'started' : 'stopped'} successfully`);
});

/**
 * @route   GET /api/v1/study-group/live-rooms/:roomId/participants
 * @access  Private (Participants)
 */
export const getLiveRoomParticipants = asyncHandler(async (req: Request, res: Response) => {
  const { error } = liveRoomIdSchema.validate(req.params);
  if (error) throw new ValidationError('Invalid room ID');

  const userId = (req as AuthRequest).user?.id;
  const liveRoom = await webrtcService.getLiveRoomById(req.params.roomId!, userId!);
  const activeParticipants = liveRoom.participants.filter((p: any) => !p.leftAt);

  return ResponseUtil.success(res, {
    participants: activeParticipants,
    count: activeParticipants.length,
    maxParticipants: liveRoom.maxParticipants,
  }, 'Participants retrieved successfully');
});

/**
 * @route   GET /api/v1/study-group/live-rooms/group/:groupId/stats
 * @access  Private (Group members)
 */
export const getLiveRoomStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;
  const stats = await webrtcService.getLiveRoomStats(req.params.groupId!, userId!);

  return ResponseUtil.success(res, stats, 'Live room statistics retrieved successfully');
});

/**
 * @route   DELETE /api/v1/study-group/live-rooms/:roomId
 * @access  Private (Host)
 */
export const deleteLiveRoom = asyncHandler(async (req: Request, res: Response) => {
  const { error } = liveRoomIdSchema.validate(req.params);
  if (error) throw new ValidationError('Invalid room ID');

  const userId = (req as AuthRequest).user?.id;
  await webrtcService.endLiveRoom(req.params.roomId!, userId!);

  LoggerUtil.info(`Live room deleted by user ${userId}: ${req.params.roomId}`);
  return ResponseUtil.success(res, null, 'Live room deleted successfully');
});

export default {
  createLiveRoom,
  getLiveRoomById,
  getLiveRooms,
  getGroupLiveRooms,
  getActiveLiveRoom,
  updateLiveRoom,
  joinLiveRoom,
  leaveLiveRoom,
  endLiveRoom,
  toggleCamera,
  toggleMic,
  toggleScreenShare,
  getLiveRoomParticipants,
  getLiveRoomStats,
  deleteLiveRoom,
};