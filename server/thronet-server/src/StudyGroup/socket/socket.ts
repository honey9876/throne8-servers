/**
 * ====================================
 * SOCKET.IO MAIN HANDLER
 * ====================================
 * Main socket.io event handler and connection manager
 *
 * Item L: Multi-instance Redis-backed socket state:
 * - Local Maps (userSockets, socketUsers, groupRooms, groupActiveSessions) replaced by
 *   Socket.IO rooms (user:<userId>, group:<groupId>) and Redis repositories
 *   (SocketPresenceRepository, SocketGroupSessionRepository, SocketGroupRoomRepository).
 * - Per-socket rate-limiting (socketBroadcastRateLimit) stays local in-memory:
 *   each socket connection is physically bound to one node; tracking per-connection
 *   packet intervals locally prevents Redis round-trip latency on rapid incoming packets.
 */

import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { LoggerUtil } from '@/shared/logger.util';
import { User } from '@/auth/models';
import GroupMember from '../models/GroupMember.model';
import { handleTypingEvents } from './typingHandler';
import { UserRole } from '../enums';
import {
  SocketPresenceRepository,
  SocketGroupSessionRepository,
  SocketGroupRoomRepository,
} from '@/shared/cache/socketCache';

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
}

// Per-socket rate limit: kept local in memory because each TCP connection is bound
// to a single server instance, and enforcing 3-second packet limits in memory
// avoids distributed latency overhead on rapid client emissions.
const socketBroadcastRateLimit = new Map<string, number>(); // socketId -> timestamp

const removeUserActiveSession = async (groupId: string, userId: string, io: Server) => {
  await SocketGroupSessionRepository.removeActiveSession(groupId, userId);
  io.to(`group:${groupId}`).to(groupId).emit('member-session-ended', { groupId, userId });
};

/**
 * Socket authentication middleware
 */
const authenticateSocket = async (socket: Socket): Promise<string | null> => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      LoggerUtil.warn(`⚠️  No token provided for socket: ${socket.id}`);
      return null;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

    // Verify user exists and is active
    const user = await User.findOne({ userId: decoded.userId }).select('userId status isActive');

    if (!user || user.status !== 'active') {
      LoggerUtil.warn(`⚠️  Invalid or inactive user for socket: ${socket.id}`);
      return null;
    }

    return decoded.userId;
  } catch (error: any) {
    LoggerUtil.error(`❌ Socket authentication error: ${error.message}`);
    return null;
  }
};

/**
 * Verify user is a member of the group
 */
const verifyGroupMembership = async (
  userId: string,
  groupId: string
): Promise<boolean> => {
  try {
    const membership = await GroupMember.findOne({
      userId: userId,
      groupId: groupId,
      status: 'active',
    });

    return !!membership;
  } catch (error: any) {
    LoggerUtil.error(`❌ Error verifying group membership:`, error);
    return false;
  }
};

/**
 * Initialize StudyGroup real-time session, active tracking and presence handlers
 */
export const setupStudyGroupSessionHandlers = (
  io: Server,
  socket: Socket,
  userId: string
): void => {
  // Join canonical personal room for direct cross-instance unicasts
  socket.join(`user:${userId}`);

  // Attach userId to socket data
  socket.data.userId = userId;
  (socket as any).userId = userId;

  LoggerUtil.info(`✅ User ${userId} connected via socket ${socket.id}`);

  // Get user details for live room handler
  User.findOne({ userId })
    .select('username name firstName lastName')
    .then((user) => {
      const userName =
        user?.username ||
        (user as any)?.name ||
        ((user as any)?.firstName ? `${(user as any).firstName} ${(user as any).lastName || ''}`.trim() : '') ||
        'Unknown User';
      socket.data.userName = userName;
      (socket as any).userName = userName;
    })
    .catch((err) => {
      LoggerUtil.error(`Failed to fetch user name for socket: ${err.message}`);
    });

  // ==========================================
  // JOIN GROUP ROOM
  // ==========================================
  socket.on('join-group', async (groupId: string) => {
    try {
      LoggerUtil.info(`📥 User ${userId} attempting to join group: ${groupId}`);

      // Verify membership
      const isMember = await verifyGroupMembership(userId, groupId);

      if (!isMember) {
        LoggerUtil.warn(`⚠️  User ${userId} is not a member of group ${groupId}`);
        socket.emit('error', { 
          event: 'join-group',
          message: 'You are not a member of this group' 
        });
        return;
      }

      // Join socket room (both raw and prefixed for cluster compatibility)
      socket.join(groupId);
      socket.join(`group:${groupId}`);

      // Track group membership in Redis (replacing local groupRooms Map)
      await SocketGroupRoomRepository.joinGroup(groupId, userId, socket.id);

      LoggerUtil.info(`✅ User ${userId} joined group room: ${groupId}`);
      
      // Notify user
      socket.emit('joined-group', { 
        groupId,
        message: 'Successfully joined group room' 
      });

      // Notify others in the group across all instances
      socket.to(`group:${groupId}`).to(groupId).emit('user-joined-group', {
        userId,
        groupId,
        timestamp: new Date(),
      });

      // Send online status to group members
      io.to(`group:${groupId}`).to(groupId).emit('user-online', {
        userId,
        timestamp: new Date(),
      });

      // Send current active study members to the joined user from Redis
      const activeList = await SocketGroupSessionRepository.getActiveMembers(groupId);
      socket.emit('active-members', {
        groupId,
        members: activeList,
      });

    } catch (error: any) {
      LoggerUtil.error(`❌ Error joining group:`, error);
      socket.emit('error', { 
        event: 'join-group',
        message: 'Failed to join group' 
      });
    }
  });

  // ==========================================
  // LEAVE GROUP ROOM
  // ==========================================
  socket.on('leave-group', async (groupId: string) => {
    try {
      LoggerUtil.info(`📤 User ${userId} leaving group: ${groupId}`);

      socket.leave(groupId);
      socket.leave(`group:${groupId}`);

      // Remove from Redis group room tracking
      await SocketGroupRoomRepository.leaveGroup(groupId, userId, socket.id);

      LoggerUtil.info(`✅ User ${userId} left group room: ${groupId}`);

      // Notify user
      socket.emit('left-group', { 
        groupId,
        message: 'Successfully left group room' 
      });

      // Remove active session if any
      await removeUserActiveSession(groupId, userId, io);

      // Notify others in the group across all instances
      socket.to(`group:${groupId}`).to(groupId).emit('user-left-group', {
        userId,
        groupId,
        timestamp: new Date(),
      });

    } catch (error: any) {
      LoggerUtil.error(`❌ Error leaving group:`, error);
      socket.emit('error', { 
        event: 'leave-group',
        message: 'Failed to leave group' 
      });
    }
  });

  // ==========================================
  // GET ACTIVE MEMBERS
  // ==========================================
  socket.on('get-active-members', async (data: { groupId: string } | string) => {
    try {
      const targetGroupId = typeof data === 'string' ? data : data?.groupId;
      if (!targetGroupId || typeof targetGroupId !== 'string') return;

      // Security: verify membership
      const isMember = await verifyGroupMembership(userId, targetGroupId);
      if (!isMember) {
        socket.emit('error', {
          event: 'get-active-members',
          message: 'You are not a member of this group',
        });
        return;
      }

      const activeList = await SocketGroupSessionRepository.getActiveMembers(targetGroupId);
      socket.emit('active-members', {
        groupId: targetGroupId,
        members: activeList,
      });
    } catch (err: any) {
      LoggerUtil.error('❌ Error handling get-active-members:', err);
    }
  });

  // ==========================================
  // SESSION PAUSED
  // ==========================================
  socket.on('session-paused', async (data: { groupId: string } | string) => {
    try {
      const targetGroupId = typeof data === 'string' ? data : data?.groupId;
      if (!targetGroupId || typeof targetGroupId !== 'string') return;

      // Security: verify membership
      const isMember = await verifyGroupMembership(userId, targetGroupId);
      if (!isMember) return;

      await SocketGroupSessionRepository.removeActiveSession(targetGroupId, userId);
      socket.to(`group:${targetGroupId}`).to(targetGroupId).emit('member-session-paused', {
        groupId: targetGroupId,
        userId,
      });
    } catch (err: any) {
      LoggerUtil.error('❌ Error handling session-paused:', err);
    }
  });

  // ==========================================
  // BROADCAST SESSION TIME
  // ==========================================
  socket.on('broadcast-session-time', async (data: { groupId: string; elapsedTime: number }) => {
    try {
      if (
        !data?.groupId ||
        typeof data.groupId !== 'string' ||
        typeof data.elapsedTime !== 'number' ||
        !Number.isFinite(data.elapsedTime) ||
        data.elapsedTime < 0
      ) {
        return;
      }

      // Rate limiting: at most once every 3 seconds per socket connection
      const now = Date.now();
      const last = socketBroadcastRateLimit.get(socket.id) || 0;
      if (now - last < 3000) {
        return;
      }
      socketBroadcastRateLimit.set(socket.id, now);

      // Verify group membership
      const isMember = await verifyGroupMembership(userId, data.groupId);
      if (!isMember) return;

      // Update in Redis active session hash
      await SocketGroupSessionRepository.updateActiveSession(data.groupId, userId, data.elapsedTime);

      socket.to(`group:${data.groupId}`).to(data.groupId).emit('member-session-update', {
        groupId: data.groupId,
        userId,
        elapsedTime: data.elapsedTime,
        timestamp: now,
      });
    } catch (err: any) {
      LoggerUtil.error('❌ Error handling broadcast-session-time:', err);
    }
  });

  // ==========================================
  // TYPING EVENTS (Local Timeout debouncing + Redis Adapter room emission)
  // ==========================================
  handleTypingEvents(socket, userId);

  // ==========================================
  // DISCONNECT
  // ==========================================
  socket.on('disconnect', async (reason) => {
    LoggerUtil.info(`🔌 Socket disconnected: ${socket.id}, Reason: ${reason}`);

    // Remove socket from tracking and rate limiter
    socketBroadcastRateLimit.delete(socket.id);

    // Clean up groups joined by this socket from Redis
    const joinedGroups = await SocketGroupRoomRepository.getSocketGroups(socket.id);
    for (const groupId of joinedGroups) {
      await SocketGroupRoomRepository.leaveGroup(groupId, userId, socket.id);
      await removeUserActiveSession(groupId, userId, io);
      io.to(`group:${groupId}`).to(groupId).emit('user-offline', {
        userId,
        lastSeen: new Date(),
      });
    }
  });

  // ==========================================
  // ERROR HANDLING
  // ==========================================
  socket.on('error', (error) => {
    LoggerUtil.error(`❌ Socket error on ${socket.id}:`, error);
  });
};

/**
 * Initialize Socket.io event handlers (legacy wrapper)
 */
export const setupSocketHandlers = (io: Server): void => {
  io.on('connection', async (socket: Socket) => {
    const userId = await authenticateSocket(socket);
    if (!userId) return;
    setupStudyGroupSessionHandlers(io, socket, userId);
  });
};

/**
 * Get socket IDs for a user across all cluster instances
 */
export const getUserSockets = async (userId: string): Promise<string[]> => {
  return SocketPresenceRepository.getUserSockets(userId);
};

/**
 * Get user ID from socket ID
 */
export const getUserFromSocket = async (socketId: string): Promise<string | undefined> => {
  const userId = await SocketPresenceRepository.getSocketUserId(socketId);
  return userId || undefined;
};

/**
 * Check if user is online across any cluster instance
 */
export const isUserOnline = async (userId: string): Promise<boolean> => {
  return SocketPresenceRepository.isUserOnline(userId);
};

/**
 * Get all online users in a group across all cluster instances
 */
export const getOnlineUsersInGroup = async (groupId: string): Promise<string[]> => {
  return SocketGroupRoomRepository.getOnlineUsersInGroup(groupId);
};

/**
 * Emit to all sockets of a user across all server instances via Socket.IO Redis room
 */
export const emitToUser = (io: Server, userId: string, event: string, data: any): void => {
  io.to(`user:${userId}`).emit(event, data);
};

export default {
  setupSocketHandlers,
  setupStudyGroupSessionHandlers,
  getUserSockets,
  getUserFromSocket,
  isUserOnline,
  getOnlineUsersInGroup,
  emitToUser,
};