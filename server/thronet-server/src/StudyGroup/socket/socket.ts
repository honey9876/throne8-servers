/**
 * ====================================
 * SOCKET.IO MAIN HANDLER
 * ====================================
 * Main socket.io event handler and connection manager
 */

import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { LoggerUtil } from '@/shared/logger.util';
import { User } from '@/auth/models';
import GroupMember from '../models/GroupMember.model';
import { handleChatEvents } from './chatHandler';
import { handleTypingEvents } from './typingHandler';
import { handlePresenceEvents } from './presenceHandler';
import { liveRoomHandler } from './liveRoomHandler';
import { UserRole } from '../enums';

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
}

// Store active socket connections
const userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds
const socketUsers = new Map<string, string>(); // socketId -> userId
const groupRooms = new Map<string, Set<string>>(); // groupId -> Set of userIds



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
    const user = await User.findById(decoded.userId).select('_id isActive');
    
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
      user: userId,
      group: groupId,
      status: 'active',
    });

    return !!membership;
  } catch (error : any) {
    LoggerUtil.error(`❌ Error verifying group membership:`, error);
    return false;
  }
};

/**
 * Initialize Socket.io event handlers
 */
export const setupSocketHandlers = (io: Server): void => {
  io.on('connection', async (socket: Socket) => {
    LoggerUtil.info(`🔌 New socket connection: ${socket.id}`);

    // Authenticate socket
    const userId = await authenticateSocket(socket);

    if (!userId) {
      LoggerUtil.warn(`⚠️  Unauthenticated socket connection: ${socket.id}`);
      socket.emit('error', { message: 'Authentication required' });
      socket.disconnect(true);
      return;
    }

    // Store socket connection
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);
    socketUsers.set(socket.id, userId);

    LoggerUtil.info(`✅ User ${userId} connected via socket ${socket.id}`);
    LoggerUtil.info(`👥 Total active sockets for user ${userId}: ${userSockets.get(userId)!.size}`);

    // Attach userId to socket
    socket.data.userId = userId;

    // Get user details for live room handler
    const user = await User.findById(userId).select('name');
    const userName = user?.username || 'Unknown User';

    // Attach userName to socket for live room events
    (socket as any).userId = userId;
    (socket as any).userName = userName;

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

        // Join socket room
        socket.join(groupId);

        // Track group room membership
        if (!groupRooms.has(groupId)) {
          groupRooms.set(groupId, new Set());
        }
        groupRooms.get(groupId)!.add(userId);

        LoggerUtil.info(`✅ User ${userId} joined group room: ${groupId}`);
        
        // Notify user
        socket.emit('joined-group', { 
          groupId,
          message: 'Successfully joined group room' 
        });

        // Notify others in the group
        socket.to(groupId).emit('user-joined-group', {
          userId,
          groupId,
          timestamp: new Date(),
        });

        // Send online status to group members
        io.to(groupId).emit('user-online', {
          userId,
          timestamp: new Date(),
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

        // Remove from group room tracking
        if (groupRooms.has(groupId)) {
          groupRooms.get(groupId)!.delete(userId);
          if (groupRooms.get(groupId)!.size === 0) {
            groupRooms.delete(groupId);
          }
        }

        LoggerUtil.info(`✅ User ${userId} left group room: ${groupId}`);

        // Notify user
        socket.emit('left-group', { 
          groupId,
          message: 'Successfully left group room' 
        });

        // Notify others in the group
        socket.to(groupId).emit('user-left-group', {
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
    // CHAT EVENTS
    // ==========================================
    handleChatEvents(io, socket, userId);

    // ==========================================
    // TYPING EVENTS
    // ==========================================
    handleTypingEvents(socket, userId);

    // ==========================================
    // PRESENCE EVENTS
    // ==========================================
    handlePresenceEvents(io, socket, userId);

    // ==========================================
    // LIVE ROOM EVENTS (NEW)
    // ==========================================
    liveRoomHandler(io, socket as any);

    // ==========================================
    // DISCONNECT
    // ==========================================
    socket.on('disconnect', (reason) => {
      LoggerUtil.info(`🔌 Socket disconnected: ${socket.id}, Reason: ${reason}`);

      // Remove socket from tracking
      if (userSockets.has(userId)) {
        userSockets.get(userId)!.delete(socket.id);
        if (userSockets.get(userId)!.size === 0) {
          userSockets.delete(userId);
          
          // User is completely offline
          LoggerUtil.info(`👋 User ${userId} is now offline (all sockets disconnected)`);

          // Notify all groups where user was present
          groupRooms.forEach((members, groupId) => {
            if (members.has(userId)) {
              io.to(groupId).emit('user-offline', {
                userId,
                lastSeen: new Date(),
              });
              members.delete(userId);
            }
          });
        }
      }

      socketUsers.delete(socket.id);

      LoggerUtil.info(`👥 Remaining active connections for user ${userId}: ${userSockets.get(userId)?.size || 0}`);
    });

    // ==========================================
    // ERROR HANDLING
    // ==========================================
    socket.on('error', (error) => {
      LoggerUtil.error(`❌ Socket error on ${socket.id}:`, error);
    });
  });

  LoggerUtil.info('✅ Socket.io event handlers initialized');
};

/**
 * Get socket IDs for a user
 */
export const getUserSockets = (userId: string): Set<string> => {
  return userSockets.get(userId) || new Set();
};

/**
 * Get user ID from socket ID
 */
export const getUserFromSocket = (socketId: string): string | undefined => {
  return socketUsers.get(socketId);
};

/**
 * Check if user is online
 */
export const isUserOnline = (userId: string): boolean => {
  return userSockets.has(userId) && userSockets.get(userId)!.size > 0;
};

/**
 * Get all online users in a group
 */
export const getOnlineUsersInGroup = (groupId: string): string[] => {
  const members = groupRooms.get(groupId);
  return members ? Array.from(members) : [];
};

/**
 * Emit to all sockets of a user
 */
export const emitToUser = (io: Server, userId: string, event: string, data: any): void => {
  const sockets = getUserSockets(userId);
  sockets.forEach((socketId) => {
    io.to(socketId).emit(event, data);
  });
};

export default {
  setupSocketHandlers,
  getUserSockets,
  getUserFromSocket,
  isUserOnline,
  getOnlineUsersInGroup,
  emitToUser,
};