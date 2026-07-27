/**
 * ====================================
 * TYPING HANDLER
 * ====================================
 * Handle typing indicators
 */

import { Socket } from 'socket.io';
import { LoggerUtil } from '@/shared/logger.util';
import GroupMember from '../models/GroupMember.model';

// Store typing users per group
const typingUsers = new Map<string, Map<string, NodeJS.Timeout>>(); // groupId -> (userId -> timeout)

/**
 * Handle typing-related socket events
 */
export const handleTypingEvents = (socket: Socket, userId: string): void => {
  
  // ==========================================
  // USER TYPING
  // ==========================================
  socket.on('typing', async (data: { groupId: string }) => {
    try {
      const { groupId } = data;

      // Verify membership
      const isMember = await GroupMember.findOne({
        user: userId,
        group: groupId,
        status: 'active',
      });

      if (!isMember) {
        return;
      }

      // Initialize group typing map if doesn't exist
      if (!typingUsers.has(groupId)) {
        typingUsers.set(groupId, new Map());
      }

      const groupTyping = typingUsers.get(groupId)!;

      // Clear existing timeout if any
      if (groupTyping.has(userId)) {
        clearTimeout(groupTyping.get(userId)!);
      }

      // Set new timeout (auto-stop after 3 seconds)
      const timeout = setTimeout(() => {
        groupTyping.delete(userId);
        socket.to(groupId).emit('user-stopped-typing', {
          userId,
          groupId,
        });
      }, 3000);

      groupTyping.set(userId, timeout);

      LoggerUtil.debug(`⌨️  User ${userId} typing in group ${groupId}`);

      // Broadcast to others in group
      socket.to(groupId).emit('user-typing', {
        userId,
        groupId,
        timestamp: new Date(),
      });

    } catch (error: any) {
      LoggerUtil.error(`❌ Error handling typing event:`, error);
    }
  });

  // ==========================================
  // USER STOPPED TYPING
  // ==========================================
  socket.on('stop-typing', async (data: { groupId: string }) => {
    try {
      const { groupId } = data;

      if (!typingUsers.has(groupId)) {
        return;
      }

      const groupTyping = typingUsers.get(groupId)!;

      // Clear timeout if exists
      if (groupTyping.has(userId)) {
        clearTimeout(groupTyping.get(userId)!);
        groupTyping.delete(userId);
      }

      LoggerUtil.debug(`⏹️  User ${userId} stopped typing in group ${groupId}`);

      // Broadcast to others in group
      socket.to(groupId).emit('user-stopped-typing', {
        userId,
        groupId,
        timestamp: new Date(),
      });

    } catch (error: any) {
      LoggerUtil.error(`❌ Error handling stop-typing event:`, error);
    }
  });
};

/**
 * Clean up typing indicator for a user in a group
 */
export const cleanupTyping = (groupId: string, userId: string): void => {
  if (typingUsers.has(groupId)) {
    const groupTyping = typingUsers.get(groupId)!;
    if (groupTyping.has(userId)) {
      clearTimeout(groupTyping.get(userId)!);
      groupTyping.delete(userId);
    }
  }
};

export default { handleTypingEvents, cleanupTyping };