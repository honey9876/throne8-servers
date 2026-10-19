/**
 * ====================================
 * LIVE ROOM HANDLER
 * ====================================
 * server/thronet-server/src/StudyGroup/socket/liveRoomHandler.ts
 *
 * Item L: Redis-backed Live Room participant sets and study session timer state.
 *  1. WebRTC signaling is peer-to-peer (user:{targetUserId} room), NOT room-wide broadcast,
 *     and does NOT touch Redis storage.
 *  2. Group membership verified before joining a room.
 *  3. Room participant limit enforced atomically in Redis (MAX_ROOM_SIZE).
 *  4. Study session timer state persisted in Redis across multi-instance nodes and restarts.
 */

import mongoose from 'mongoose';
import { Server } from 'socket.io';
import {
  AuthenticatedSocket,
  JoinLiveRoomPayload,
  LeaveLiveRoomPayload,
  ToggleCameraPayload,
  ToggleMicPayload,
  ToggleScreenSharePayload,
  GetRoomParticipantsPayload,
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  WebRTCIceCandidatePayload,
} from '../types/Socket.types';
import GroupMember from '../models/GroupMember.model';
import LiveRoom from '../models/LiveRoom.model';
import { LoggerUtil } from '@/shared/logger.util';
import { SessionMentor, Mentor, GroupSession, SeniorSession } from '@/Mentorship/models';
import { SocketLiveRoomRepository, RoomSessionState } from '@/shared/cache/socketCache';

// ─── Config ───────────────────────────────────────────────────────────────────
const MAX_ROOM_SIZE = 16; // WebRTC mesh: 16 peers = 120 connections - hard limit

const NOT_STARTED_REASON = 'Session has not been started yet (or it has already ended)';

// Re-export RoomSession for backward compatibility
export type RoomSession = RoomSessionState;

interface MembershipResult {
  ok: boolean;
  reason?: string;
}

// ─── Helper: verify mentor/mentee membership on a mentorship session room ─────
// roomId === booking._id (string)
async function isMentorshipSessionMember(userId: string, roomId: string): Promise<MembershipResult> {
  try {
    if (!mongoose.isValidObjectId(roomId)) return { ok: false };

    const session = await SessionMentor.findOne({ 'bookings._id': roomId }).lean();
    if (!session) return { ok: false };

    const booking = (session.bookings || []).find((b: any) => b._id.toString() === roomId);
    if (!booking) return { ok: false };

    // Membership: mentee of this booking, or the mentor of the session
    let isMember = false;
    const menteeId = booking.menteeId || booking.bookedBy;
    if (menteeId && userId === menteeId.toString()) {
      isMember = true;
    } else {
      const mentor = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false }).lean();
      isMember = !!mentor && mentor.userId.toString() === userId;
    }
    if (!isMember) return { ok: false };

    // Only allow while the specific booking is actually in progress
    if ((booking.status as string) !== 'in_progress') {
      return { ok: false, reason: NOT_STARTED_REASON };
    }

    return { ok: true };
  } catch (error: any) {
    LoggerUtil.warn(`isMentorshipSessionMember check failed: ${error.message}`);
    return { ok: false };
  }
}

// ─── Helper: verify mentor/mentee membership on a Senior Mentor 1:1 session room ─────
async function isSeniorOneToOneSessionMember(userId: string, roomId: string): Promise<MembershipResult> {
  try {
    if (!mongoose.isValidObjectId(roomId)) return { ok: false };

    const session = (await SeniorSession.findOne({ 'bookings._id': roomId }).lean()) as any;
    if (!session) return { ok: false };

    // Strictly one-to-one sessions only
    const sessionTypeStr = session.sessionType as string | undefined;
    if (sessionTypeStr && sessionTypeStr !== 'one_to_one' && sessionTypeStr !== '1_on_1') {
      return { ok: false };
    }

    const booking = (session.bookings || []).find((b: any) => b._id.toString() === roomId);
    if (!booking) return { ok: false };

    let isMember = false;
    const menteeId = (booking.menteeId || booking.bookedBy)?.toString();
    if (menteeId && userId === menteeId) {
      isMember = true;
    } else if (session.mentorId && session.mentorId.toString() === userId) {
      isMember = true;
    } else {
      const mentor = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false }).lean();
      isMember = !!mentor && mentor.userId?.toString() === userId;
    }
    if (!isMember) return { ok: false };

    if ((booking.status as string) !== 'in_progress') {
      return { ok: false, reason: NOT_STARTED_REASON };
    }

    return { ok: true };
  } catch (error: any) {
    LoggerUtil.warn(`isSeniorOneToOneSessionMember check failed: ${error.message}`);
    return { ok: false };
  }
}

// ─── Helper: verify room access and determine max capacity ────────────────────
async function getRoomAccess(
  userId: string,
  roomId: string
): Promise<{ allowed: boolean; maxCapacity: number; errorReason?: string }> {
  // Allow mock group ID '1' for frontend UI testing
  if (roomId === '1' || (roomId as any) === 1) return { allowed: true, maxCapacity: MAX_ROOM_SIZE };

  if (!userId || !roomId) {
    LoggerUtil.warn(`Missing userId or roomId in getRoomAccess check`);
    return { allowed: false, maxCapacity: 0, errorReason: 'Missing user ID or room ID' };
  }

  // Best "why was I rejected" message collected while we try each room type.
  let denyReason: string | undefined;

  // 1. StudyGroup room
  //
  // ⚠️ FIX: mentorship 1:1 roomId is a booking._id, which is ALSO a valid ObjectId.
  // Earlier, any ObjectId roomId that wasn't a LiveRoom returned "Live room not found"
  // immediately, so mentorship rooms never reached the mentorship checks below.
  // Now a missing LiveRoom just means "this is not a study-group room" → fall through.
  try {
    let studyGroupId: any = null;

    if (mongoose.isValidObjectId(roomId)) {
      const liveRoom = await LiveRoom.findById(roomId).lean();
      if (liveRoom) {
        if (!liveRoom.isActive) {
          return { allowed: false, maxCapacity: 0, errorReason: 'This live room has ended' };
        }
        studyGroupId = liveRoom.group;
      }
      // liveRoom === null → not a study-group live room, try mentorship checks
    } else {
      // Non-ObjectId roomId: treated as a groupId directly (legacy behaviour)
      studyGroupId = roomId;
    }

    if (studyGroupId) {
      const member = await GroupMember.findOne({
        userId: userId,
        groupId: studyGroupId,
        status: 'active',
      }).lean();
      if (member) return { allowed: true, maxCapacity: MAX_ROOM_SIZE };
      denyReason = 'You are not a member of this group';
    }
  } catch (error: any) {
    LoggerUtil.warn(`StudyGroup check failed: ${error.message}`);
  }

  // 2. Mentorship 1:1 room
  try {
    const mentorship1on1 = await isMentorshipSessionMember(userId, roomId);
    if (mentorship1on1.ok) return { allowed: true, maxCapacity: 2 };
    if (mentorship1on1.reason) denyReason = mentorship1on1.reason;
  } catch (error: any) {
    LoggerUtil.warn(`1:1 Mentorship check failed: ${error.message}`);
  }

  // 3. Mentorship Group Session room
  try {
    const session = await GroupSession.findOne({ sessionId: roomId }).lean();
    if (session) {
      if ((session as any).status !== 'in_progress') {
        return { allowed: false, maxCapacity: 0, errorReason: NOT_STARTED_REASON };
      }

      let isAllowed = false;
      const participant = ((session as any).participants || []).find(
        (p: any) => p.menteeId.toString() === userId && p.requestStatus === 'accepted'
      );
      if (participant) {
        isAllowed = true;
      } else {
        const mentor = await Mentor.findOne({ mentorId: (session as any).mentorId, isDeleted: false }).lean();
        if (mentor && mentor.userId.toString() === userId) {
          isAllowed = true;
        }
      }

      if (isAllowed) {
        return { allowed: true, maxCapacity: session.maxParticipants + 1 };
      }
    }
  } catch (error: any) {
    LoggerUtil.warn(`Group Session check failed: ${error.message}`);
  }

  // 4. Senior Mentor 1:1 room
  try {
    const senior1on1 = await isSeniorOneToOneSessionMember(userId, roomId);
    if (senior1on1.ok) return { allowed: true, maxCapacity: 2 };
    if (senior1on1.reason) denyReason = senior1on1.reason;
  } catch (error: any) {
    LoggerUtil.warn(`Senior Mentor 1:1 check failed: ${error.message}`);
  }

  LoggerUtil.warn(`Room access denied: user ${userId} → room ${roomId} (${denyReason || 'no match'})`);
  return {
    allowed: false,
    maxCapacity: 0,
    errorReason: denyReason || 'You are not allowed to join this room',
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export const liveRoomHandler = (io: Server, socket: AuthenticatedSocket): void => {
  const userId = (socket.data as any).userId || (socket as any).userId;
  const userName = (socket.data as any).userName || (socket as any).userName || 'Unknown';

  // ── Join live room ─────────────────────────────────────────────────────────
  socket.on('join-live-room', async (data: JoinLiveRoomPayload) => {
    try {
      const { roomId } = data;
      if (!roomId) return;

      const { allowed, maxCapacity, errorReason } = await getRoomAccess(userId, roomId);
      if (!allowed) {
        socket.emit('error', {
          event: 'join-live-room',
          message: errorReason || 'You are not a member of this group',
        });
        return;
      }

      // Enforce room size limit and track participant in Redis
      const joinResult = await SocketLiveRoomRepository.addParticipant(
        roomId,
        userId,
        socket.id,
        { userName },
        maxCapacity
      );

      if (!joinResult.success) {
        socket.emit('error', {
          event: 'join-live-room',
          message: joinResult.errorReason || `Live room is full (max ${maxCapacity} participants)`,
        });
        return;
      }

      socket.join(`live-room:${roomId}`);
      LoggerUtil.info(`User ${userId} joined live room ${roomId}`);

      // Start study session automatically for the first user
      let session = await SocketLiveRoomRepository.getRoomSession(roomId);
      if (joinResult.isFirst) {
        if (!session) {
          session = await SocketLiveRoomRepository.startRoomSession(roomId);
          LoggerUtil.info(`Started study session automatically for room ${roomId}`);
        }
      }

      // Tell existing participants about the new arrival
      socket.to(`live-room:${roomId}`).emit('user-joined-room', {
        userId,
        userName,
        timestamp: new Date(),
      });

      // Send current participant list back to the joiner from Redis
      const participants = await SocketLiveRoomRepository.getRoomParticipants(roomId);

      socket.emit('room-participants-list', {
        roomId,
        participants,
        count: participants.length,
        session: session || null,
      });
    } catch (error: any) {
      LoggerUtil.error('Error joining live room', { error: error.message, userId });
      socket.emit('error', {
        event: 'join-live-room',
        message: 'Could not join the room. Please try again.',
      });
    }
  });

  // ── Leave live room ────────────────────────────────────────────────────────
  socket.on('leave-live-room', async (data: LeaveLiveRoomPayload) => {
    const { roomId } = data;
    if (!roomId) return;

    socket.leave(`live-room:${roomId}`);
    LoggerUtil.info(`User ${userId} left live room ${roomId}`);

    const { isRoomEmpty } = await SocketLiveRoomRepository.removeParticipant(roomId, socket.id);
    if (isRoomEmpty) {
      LoggerUtil.info(`Cleared study session for empty room ${roomId}`);
    }

    socket.to(`live-room:${roomId}`).emit('user-left-room', {
      userId,
      userName,
      timestamp: new Date(),
    });
  });

  // ── Heartbeat for live room presence ──────────────────────────────────────
  socket.on('liveroom:heartbeat', async (data: { roomId: string }) => {
    if (data?.roomId) {
      await SocketLiveRoomRepository.heartbeat(data.roomId, socket.id);
    }
  });

  // ── Camera toggle ──────────────────────────────────────────────────────────
  socket.on('toggle-camera', async (data: ToggleCameraPayload) => {
    const { roomId, cameraOn } = data;
    if (!roomId) return;

    (socket.data as any).camOn = cameraOn;
    await SocketLiveRoomRepository.updateParticipantState(roomId, socket.id, { camOn: cameraOn });

    socket.to(`live-room:${roomId}`).emit('user-camera-toggle', {
      userId,
      cameraOn,
      timestamp: new Date(),
    });
  });

  // ── Mic toggle ─────────────────────────────────────────────────────────────
  socket.on('toggle-mic', async (data: ToggleMicPayload) => {
    const { roomId, micOn } = data;
    if (!roomId) return;

    (socket.data as any).micOn = micOn;
    await SocketLiveRoomRepository.updateParticipantState(roomId, socket.id, { micOn });

    socket.to(`live-room:${roomId}`).emit('user-mic-toggle', {
      userId,
      micOn,
      timestamp: new Date(),
    });
  });

  // ── Screen share ───────────────────────────────────────────────────────────
  socket.on('toggle-screen-share', (data: ToggleScreenSharePayload) => {
    const { roomId, sharing } = data;
    if (!roomId) return;

    socket.to(`live-room:${roomId}`).emit('user-screen-share-toggle', {
      userId,
      sharing,
      timestamp: new Date(),
    });
  });

  // ── Disconnect cleanup ─────────────────────────────────────────────────────
  socket.on('disconnecting', async () => {
    try {
      const rooms = Array.from(socket.rooms || []).filter((r) => r.startsWith('live-room:'));
      for (const room of rooms) {
        const roomId = room.replace('live-room:', '');
        const { isRoomEmpty } = await SocketLiveRoomRepository.removeParticipant(roomId, socket.id);

        if (isRoomEmpty) {
          LoggerUtil.info(`Cleared study session for empty room ${roomId} (disconnect)`);
        }

        // Check if user still has another socket in the room
        const remainingParticipants = await SocketLiveRoomRepository.getRoomParticipants(roomId);
        const stillPresent = remainingParticipants.some((p) => p.userId === userId);
        if (stillPresent) continue;

        socket.to(room).emit('user-left-room', {
          userId,
          userName,
          timestamp: new Date(),
        });
      }
    } catch (error: any) {
      LoggerUtil.error('Error handling disconnect cleanup', { error: error.message, userId });
    }
  });

  // ── Get participants ───────────────────────────────────────────────────────
  socket.on('get-room-participants', async (data: GetRoomParticipantsPayload) => {
    try {
      const { roomId } = data;
      if (!roomId) return;

      const participants = await SocketLiveRoomRepository.getRoomParticipants(roomId);
      const session = await SocketLiveRoomRepository.getRoomSession(roomId);

      socket.emit('room-participants-list', {
        roomId,
        participants,
        count: participants.length,
        session: session || null,
      });
    } catch (error: any) {
      LoggerUtil.error('Error fetching room participants', { error: error.message, userId });
    }
  });

  // ── Session toggle ───────────────────────────────────────────────────────────
  socket.on('toggle-session', async (data: { roomId: string; active: boolean }) => {
    const { roomId, active } = data;
    if (!roomId) return;

    // Verify admin / leader
    const member = await GroupMember.findOne({
      userId,
      groupId: roomId,
      role: { $in: ['leader', 'moderator'] },
      status: 'active',
    }).lean();

    if (!member) {
      socket.emit('error', {
        event: 'toggle-session',
        message: 'Only leaders and moderators can toggle the study session',
      });
      return;
    }

    const session = await SocketLiveRoomRepository.toggleRoomSession(roomId, active);

    // Broadcast the new session state to everyone in the room
    io.in(`live-room:${roomId}`).emit('session-toggled', {
      roomId,
      session,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // WebRTC SIGNALING - peer-to-peer, NOT room-wide broadcast
  // WebRTC signaling does NOT touch Redis storage. It is routed peer-to-peer
  // via Socket.IO events to user:{targetUserId}.
  // ─────────────────────────────────────────────────────────────────────────

  const validateSignaling = async (senderId: string, targetId: string, roomId: string): Promise<boolean> => {
    const { allowed } = await getRoomAccess(senderId, roomId);
    if (!allowed) {
      LoggerUtil.warn(`Signaling blocked: sender ${senderId} not allowed in room ${roomId}`);
      return false;
    }

    const participants = await SocketLiveRoomRepository.getRoomParticipants(roomId);
    const isTargetInRoom = participants.some((p) => p.userId === targetId);
    if (!isTargetInRoom) {
      // Fallback check in local room sockets
      const targetSockets = await io.in(`live-room:${roomId}`).fetchSockets();
      const isTargetInLocal = targetSockets.some(
        (s: any) => s.data?.userId === targetId || (s as any).userId === targetId
      );
      if (!isTargetInLocal) {
        LoggerUtil.warn(`Signaling blocked: target ${targetId} not in room ${roomId}`);
        return false;
      }
    }

    return true;
  };

  socket.on('webrtc-offer', async (data: WebRTCOfferPayload) => {
    const { targetUserId, roomId, offer } = data;
    if (!targetUserId || !offer || !roomId) return;

    if (!(await validateSignaling(userId, targetUserId, roomId))) return;

    LoggerUtil.debug(`WebRTC offer from ${userId} to ${targetUserId}`);

    io.to(`user:${targetUserId}`).emit('webrtc-offer-received', {
      fromUserId: userId,
      roomId,
      offer,
    });
  });

  socket.on('webrtc-answer', async (data: WebRTCAnswerPayload) => {
    const { targetUserId, roomId, answer } = data;
    if (!targetUserId || !answer || !roomId) return;

    if (!(await validateSignaling(userId, targetUserId, roomId))) return;

    LoggerUtil.debug(`WebRTC answer from ${userId} to ${targetUserId}`);

    io.to(`user:${targetUserId}`).emit('webrtc-answer-received', {
      fromUserId: userId,
      roomId,
      answer,
    });
  });

  socket.on('webrtc-ice-candidate', async (data: WebRTCIceCandidatePayload) => {
    const { targetUserId, roomId, candidate } = data;
    if (!targetUserId || !candidate || !roomId) return;

    if (!(await validateSignaling(userId, targetUserId, roomId))) return;

    io.to(`user:${targetUserId}`).emit('webrtc-ice-candidate-received', {
      fromUserId: userId,
      roomId,
      candidate,
    });
  });
};

export default liveRoomHandler;