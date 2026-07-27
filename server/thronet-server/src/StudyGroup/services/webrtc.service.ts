/**
 * ====================================
 * WEBRTC SERVICE
 * ====================================
 * Business logic for WebRTC and live room management
 * Fixed: race condition in joinLiveRoom, lean() consistency
 */

import { Types } from 'mongoose';
import groupRepository from '../repositories/group.repository';
import groupMemberRepository from '../repositories/groupMember.repository';
import liveRoomRepository from '../repositories/liveRoom.repository';
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '@/shared/errors/app.error';
import { LoggerUtil } from '@/shared/logger.util';
import {
  CreateLiveRoomRequest,
  UpdateLiveRoomRequest,
  LiveRoomResponse,
  LiveRoomStatsResponse,
} from '../types/liveRoom.types';

/**
 * Create a new live room
 */
export const createLiveRoom = async (
  userId: string,
  groupId: string,
  data: CreateLiveRoomRequest
): Promise<LiveRoomResponse> => {
  try {
    LoggerUtil.info(`🎥 Creating live room for group ${groupId} by user ${userId}`);

    const group = await groupRepository.findByGroupId(groupId);
    if (!group) throw new NotFoundError('Group not found');
    if (!group.isActive) throw new BadRequestError('Cannot create live room in inactive group');

    const membership = await groupMemberRepository.findActiveOne(groupId, userId);
    if (!membership) throw new ForbiddenError('You are not a member of this group');

    const existingActiveRoom = await liveRoomRepository.findActiveByGroupId(groupId);
    if (existingActiveRoom) throw new ConflictError('An active live room already exists in this group');

    const liveRoom = await liveRoomRepository.createRoom({
      group: groupId,
      title: data.title,
      description: data.description,
      host: userId,
      maxParticipants: data.maxParticipants || 50,
      settings: {
        allowCamera: data.settings?.allowCamera ?? true,
        allowMic: data.settings?.allowMic ?? true,
        allowScreenShare: data.settings?.allowScreenShare ?? true,
        requireApproval: data.settings?.requireApproval ?? false,
        muteOnEntry: data.settings?.muteOnEntry ?? false,
      },
      participants: [],
      isActive: true,
      startedAt: new Date(),
    });

    await liveRoom.addParticipant(new Types.ObjectId(userId));
    await liveRoom.populate('host', 'name avatar email');
    await liveRoom.populate('participants.user', 'name avatar email');

    LoggerUtil.info(`✅ Live room created successfully: ${liveRoom._id}`);
    return formatLiveRoomResponse(liveRoom);
  } catch (error: any) {
    LoggerUtil.error(`❌ Error creating live room:`, error);
    throw error;
  }
};

/**
 * Get live room by ID
 */
export const getLiveRoomById = async (
  roomId: string,
  userId?: string
): Promise<LiveRoomResponse> => {
  try {
    LoggerUtil.info(`📖 Fetching live room: ${roomId}`);

    const liveRoom = await liveRoomRepository.findByIdWithPopulate(roomId);
    if (!liveRoom) throw new NotFoundError('Live room not found');

    if (userId) {
      const membership = await groupMemberRepository.findActiveOne(
        liveRoom.group.toString(),
        userId
      );
      if (!membership) throw new ForbiddenError('You do not have access to this live room');
    }

    LoggerUtil.info(`✅ Live room fetched: ${roomId}`);
    return formatLiveRoomResponse(liveRoom);
  } catch (error: any) {
    LoggerUtil.error(`❌ Error fetching live room:`, error);
    throw error;
  }
};

/**
 * Get all live rooms (with filters)
 */
export const getLiveRooms = async (filters: {
  groupId?: string;
  isActive?: boolean;
  host?: string;
  page?: number;
  limit?: number;
}): Promise<{ rooms: LiveRoomResponse[]; total: number; page: number }> => {
  try {
    LoggerUtil.info(`📋 Fetching live rooms with filters:`, filters);

    const query: any = {};
    if (filters.groupId) query.group = filters.groupId;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    if (filters.host) query.host = filters.host;

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    // FIX: Promise.all for parallel queries — lean() repository mein confirm karo
    const [rooms, total] = await Promise.all([
      liveRoomRepository.findWithFilters(query, skip, limit),
      liveRoomRepository.count(query),
    ]);

    LoggerUtil.info(`✅ Found ${rooms.length} live rooms (total: ${total})`);
    return { rooms: rooms.map(formatLiveRoomResponse), total, page };
  } catch (error: any) {
    LoggerUtil.error(`❌ Error fetching live rooms:`, error);
    throw error;
  }
};

/**
 * Update live room
 */
export const updateLiveRoom = async (
  roomId: string,
  userId: string,
  data: UpdateLiveRoomRequest
): Promise<LiveRoomResponse> => {
  try {
    LoggerUtil.info(`✏️ Updating live room ${roomId} by user ${userId}`);

    const liveRoom = await liveRoomRepository.findRawById(roomId);
    if (!liveRoom) throw new NotFoundError('Live room not found');
    if (liveRoom.host.toString() !== userId.toString()) throw new ForbiddenError('Only the host can update the live room');
    if (!liveRoom.isActive) throw new BadRequestError('Cannot update an ended live room');

    if (data.title) liveRoom.title = data.title;
    if (data.description !== undefined) liveRoom.description = data.description;
    if (data.maxParticipants) liveRoom.maxParticipants = data.maxParticipants;

    if (data.settings) {
      const s = data.settings;
      if (s.allowCamera !== undefined) liveRoom.settings.allowCamera = s.allowCamera;
      if (s.allowMic !== undefined) liveRoom.settings.allowMic = s.allowMic;
      if (s.allowScreenShare !== undefined) liveRoom.settings.allowScreenShare = s.allowScreenShare;
      if (s.requireApproval !== undefined) liveRoom.settings.requireApproval = s.requireApproval;
      if (s.muteOnEntry !== undefined) liveRoom.settings.muteOnEntry = s.muteOnEntry;
    }

    await liveRoom.save();
    await liveRoom.populate('host', 'name avatar email');
    await liveRoom.populate('participants.user', 'name avatar email');

    LoggerUtil.info(`✅ Live room updated: ${roomId}`);
    return formatLiveRoomResponse(liveRoom);
  } catch (error: any) {
    LoggerUtil.error(`❌ Error updating live room:`, error);
    throw error;
  }
};

/**
 * Join live room
 * FIX: Atomic participant settings update — race condition removed
 */
export const joinLiveRoom = async (
  roomId: string,
  userId: string,
  options: { cameraOn?: boolean; micOn?: boolean }
): Promise<LiveRoomResponse> => {
  try {
    LoggerUtil.info(`🚪 User ${userId} joining live room ${roomId}`);

    const liveRoom = await liveRoomRepository.findRawById(roomId);
    if (!liveRoom) throw new NotFoundError('Live room not found');
    if (!liveRoom.isActive) throw new BadRequestError('This live room has ended');

    const membership = await groupMemberRepository.findActiveOne(
      liveRoom.group.toString(),
      userId
    );
    if (!membership) throw new ForbiddenError('You are not a member of this group');

    // FIX: addParticipant first
    await liveRoom.addParticipant(new Types.ObjectId(userId));

    // FIX: Atomic update for camera/mic — no extra save() call
    if (options.cameraOn !== undefined || options.micOn !== undefined) {
      await liveRoomRepository.updateParticipantSettings(roomId, userId, {
        cameraOn: liveRoom.settings.allowCamera ? options.cameraOn : false,
        micOn: liveRoom.settings.allowMic ? options.micOn : false,
      });
    }

    // Fresh fetch after updates — populated
    const updatedRoom = await liveRoomRepository.findByIdWithPopulate(roomId);
    if (!updatedRoom) throw new NotFoundError('Live room not found after join');

    LoggerUtil.info(`✅ User ${userId} joined live room ${roomId}`);
    return formatLiveRoomResponse(updatedRoom);
  } catch (error: any) {
    LoggerUtil.error(`❌ Error joining live room:`, error);
    throw error;
  }
};

/**
 * Leave live room
 */
export const leaveLiveRoom = async (
  roomId: string,
  userId: string
): Promise<void> => {
  try {
    LoggerUtil.info(`🚪 User ${userId} leaving live room ${roomId}`);

    const liveRoom = await liveRoomRepository.findRawById(roomId);
    if (!liveRoom) throw new NotFoundError('Live room not found');

    await liveRoom.removeParticipant(new Types.ObjectId(userId));

    // Host ne leave kiya — room end karo
    if (liveRoom.host.toString() === userId.toString() && liveRoom.isActive) {
      LoggerUtil.info(`⚠️ Host left, ending live room ${roomId}`);
      await liveRoom.endSession();
    }

    LoggerUtil.info(`✅ User ${userId} left live room ${roomId}`);
  } catch (error: any) {
    LoggerUtil.error(`❌ Error leaving live room:`, error);
    throw error;
  }
};

/**
 * End live room
 */
export const endLiveRoom = async (
  roomId: string,
  userId: string
): Promise<LiveRoomResponse> => {
  try {
    LoggerUtil.info(`⏹️ Ending live room ${roomId} by user ${userId}`);

    const liveRoom = await liveRoomRepository.findRawById(roomId);
    if (!liveRoom) throw new NotFoundError('Live room not found');
    if (liveRoom.host.toString() !== userId.toString()) throw new ForbiddenError('Only the host can end the live room');
    if (!liveRoom.isActive) throw new BadRequestError('Live room has already ended');

    await liveRoom.endSession();
    await liveRoom.populate('host', 'name avatar email');
    await liveRoom.populate('participants.user', 'name avatar email');

    LoggerUtil.info(`✅ Live room ended: ${roomId}`);
    return formatLiveRoomResponse(liveRoom);
  } catch (error: any) {
    LoggerUtil.error(`❌ Error ending live room:`, error);
    throw error;
  }
};

/**
 * Get live room statistics
 */
export const getLiveRoomStats = async (
  groupId: string,
  userId: string
): Promise<LiveRoomStatsResponse> => {
  try {
    LoggerUtil.info(`📊 Fetching live room stats for group ${groupId}`);

    const membership = await groupMemberRepository.findActiveOne(groupId, userId);
    if (!membership) throw new ForbiddenError('You do not have access to this group');

    const stats = await liveRoomRepository.getStatsByGroupId(groupId);

    if (!stats.length) {
      return {
        totalSessions: 0,
        totalDuration: 0,
        averageDuration: 0,
        totalParticipants: 0,
        averageParticipants: 0,
        peakParticipants: 0,
      };
    }

    const result = stats[0];
    LoggerUtil.info(`✅ Live room stats fetched for group ${groupId}`);

    return {
      totalSessions: result.totalSessions,
      totalDuration: result.totalDuration,
      averageDuration: result.totalSessions > 0
        ? Math.round(result.totalDuration / result.totalSessions)
        : 0,
      totalParticipants: result.totalParticipants,
      averageParticipants: result.totalSessions > 0
        ? Math.round(result.totalParticipants / result.totalSessions)
        : 0,
      peakParticipants: result.peakParticipants || 0,
    };
  } catch (error: any) {
    LoggerUtil.error(`❌ Error fetching live room stats:`, error);
    throw error;
  }
};

/**
 * Format live room response
 */
const formatLiveRoomResponse = (liveRoom: any): LiveRoomResponse => {
  return {
    _id: liveRoom._id,
    group: liveRoom.group,
    title: liveRoom.title,
    description: liveRoom.description,
    host: liveRoom.host,
    participants: liveRoom.participants.map((p: any) => ({
      userId: p.user._id || p.user,
      userName: p.user.name,
      userAvatar: p.user.avatar,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      cameraOn: p.cameraOn,
      micOn: p.micOn,
      screenSharing: p.screenSharing,
      connectionQuality: p.connectionQuality,
    })),
    maxParticipants: liveRoom.maxParticipants,
    isActive: liveRoom.isActive,
    startedAt: liveRoom.startedAt,
    endedAt: liveRoom.endedAt,
    duration: liveRoom.duration,
    isRecording: liveRoom.isRecording,
    settings: liveRoom.settings,
    stats: liveRoom.stats,
    createdAt: liveRoom.createdAt,
    updatedAt: liveRoom.updatedAt,
  };
};

export default {
  createLiveRoom,
  getLiveRoomById,
  getLiveRooms,
  updateLiveRoom,
  joinLiveRoom,
  leaveLiveRoom,
  endLiveRoom,
  getLiveRoomStats,
};