/**
 * ====================================
 * PRESENCE HANDLER
 * ====================================
 * server/thronet-server/src/StudyGroup/socket/presenceHandler.ts
 *
 * Fixes applied:
 *  1. Online status broadcast goes ONLY to the user's contact room,
 *     NOT socket.broadcast (entire server)
 *  2. lastActive DB write is debounced — max once per 60 seconds per user
 *  3. userId read from socket.data.userId (canonical location)
 *  4. fetchSockets reads s.data.userId consistently
 */

import { Server, Socket } from 'socket.io';
import { LoggerUtil } from '@/shared/logger.util';
import { User } from '@/auth/models';
import { SocketPresenceRepository } from '@/shared/cache/socketCache';

async function updateLastActive(userId: string): Promise<void> {
  try {
    const lockAcquired = await SocketPresenceRepository.acquireLastActiveLock(userId, 60);
    if (!lockAcquired) return; // Debounced across cluster

    await User.findByIdAndUpdate(userId, { lastActive: new Date() });
  } catch (err: any) {
    LoggerUtil.error('Failed to update lastActive', { error: err.message, userId });
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export const handlePresenceEvents = (io: Server, socket: Socket, userId: string): void => {

  // ── User comes online ──────────────────────────────────────────────────────
  socket.on('user-online', async () => {
    try {
      LoggerUtil.debug(`User ${userId} online`);

      // Debounced DB write
      await updateLastActive(userId);

      // Broadcast ONLY to contacts room
      io.to(`user:${userId}:contacts`).emit('user-status-changed', {
        userId,
        isOnline: true,
        lastActive: new Date(),
      });

    } catch (error: any) {
      LoggerUtil.error('Error handling user-online', { error: error.message, userId });
    }
  });

  // ── User goes offline ──────────────────────────────────────────────────────
  socket.on('user-offline', async () => {
    try {
      // Check if user still has other active sockets (multi-tab/device safe)
      const isOnline = await SocketPresenceRepository.isUserOnline(userId);
      if (isOnline) {
        // User is still active on another tab or device; do not broadcast offline
        return;
      }

      await updateLastActive(userId);

      io.to(`user:${userId}:contacts`).emit('user-status-changed', {
        userId,
        isOnline: false,
        lastActive: new Date(),
      });

    } catch (error: any) {
      LoggerUtil.error('Error handling user-offline', { error: error.message, userId });
    }
  });

  // ── Subscribe to a contact's presence ─────────────────────────────────────
  // When user A wants to see user B's online status, A joins B's contact room.
  // This is the correct pattern — pull rather than broadcast to all.
  socket.on('subscribe-presence', (data: { contactUserId: string }) => {
    const { contactUserId } = data;
    if (!contactUserId || typeof contactUserId !== 'string') return;

    // A joins B's contact notification room
    socket.join(`user:${contactUserId}:contacts`);
    LoggerUtil.debug(`User ${userId} subscribed to presence of ${contactUserId}`);
  });

  socket.on('unsubscribe-presence', (data: { contactUserId: string }) => {
    const { contactUserId } = data;
    if (!contactUserId || typeof contactUserId !== 'string') return;

    socket.leave(`user:${contactUserId}:contacts`);
    LoggerUtil.debug(`User ${userId} unsubscribed from presence of ${contactUserId}`);
  });

  // ── Get online users in a group ────────────────────────────────────────────
  socket.on('get-online-users', async (data: { groupId: string }) => {
    try {
      const { groupId } = data;
      if (!groupId) return;

      const socketsInRoom = await io.in(groupId).fetchSockets();

      // Read userId from socket.data consistently
      const onlineUserIds = [
        ...new Set(
          socketsInRoom
            .map((s: any) => s.data.userId as string | undefined)
            .filter((id): id is string => !!id)
        ),
      ];

      LoggerUtil.debug(`Online users in group ${groupId}: ${onlineUserIds.length}`);

      socket.emit('online-users', {
        groupId,
        users: onlineUserIds,
        count: onlineUserIds.length,
      });

    } catch (error: any) {
      LoggerUtil.error('Error getting online users', { error: error.message, userId });
    }
  });
};

export default { handlePresenceEvents };