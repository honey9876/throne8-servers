/**
 * ====================================
 * SOCKET.IO — MAIN ENTRY POINT
 * ====================================
 * server/thronet-server/src/socket/index.ts
 *
 * Fixes applied:
 *  1. Removed duplicate handler registration
 *  2. Single AuthenticatedSocket type — always socket.data.userId
 *  3. Auto-join user:{userId} room on connect (no client-driven join needed)
 *  4. Disconnect cleanup centralized here
 */

import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { socketAuthMiddleware } from './middleware/auth.socket.middleware';
import { setupConnectionHandlers } from './handlers/connectionHandler';
import { setupNotificationHandlers } from './handlers/notificationHandler';
import { setupMessageHandlers } from './handlers/messageHandler';
import { LoggerUtil } from '@/shared/logger.util';
import { handleChatEvents } from '@/StudyGroup/socket/chatHandler';
import { liveRoomHandler } from '@/StudyGroup/socket/liveRoomHandler';
import { handlePresenceEvents } from '@/StudyGroup/socket/presenceHandler';

// ─── Single canonical type ────────────────────────────────────────────────────
// All handlers must read userId from socket.data.userId — never socket.userId
export interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email?: string;
    userName?: string;
  };
}

// ─── Singleton ────────────────────────────────────────────────────────────────
let io: Server | null = null;

// ─── Initialize ───────────────────────────────────────────────────────────────
export const initializeSocketIO = (httpServer: HTTPServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: (process.env['ALLOWED_ORIGINS'] || 'http://localhost:3000,http://localhost:3001')
        .split(',')
        .map((o) => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Authorization'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60_000,
    pingInterval: 25_000,
    allowEIO3: true,
    // Prevent event flooding from a single socket
    maxHttpBufferSize: 1e6, // 1 MB
  });

  // ── Auth middleware ──────────────────────────────────────────────────────────
  io.use((socket, next) => {
    socketAuthMiddleware(socket, next);
  });

  // ── Connection ───────────────────────────────────────────────────────────────
  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.data.userId;

    // Guard — middleware should have already rejected unauthenticated sockets,
    // but we double-check so handlers never run without a userId.
    if (!userId) {
      LoggerUtil.error('Socket connected without userId — disconnecting', {
        socketId: socket.id,
      });
      socket.disconnect(true);
      return;
    }

    LoggerUtil.info('Socket connected', {
      socketId: socket.id,
      userId,
      email: socket.data.email,
    });

    // ── Auto-join personal notification room ─────────────────────────────────
    // Do this server-side so it is guaranteed — never rely on client to call
    // 'join-notifications' before notifications can be delivered.
    socket.join(`user:${userId}`);

    // ── Register all handlers ONCE ───────────────────────────────────────────
    setupConnectionHandlers(io!, socket);
    setupNotificationHandlers(io!, socket);
    setupMessageHandlers(io!, socket);

    // StudyGroup-specific handlers
    handleChatEvents(io!, socket, userId);
    liveRoomHandler(io!, socket as any);
    handlePresenceEvents(io!, socket, userId);

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      LoggerUtil.info('Socket disconnected', {
        socketId: socket.id,
        userId,
        reason,
      });

      // Broadcast offline status to relevant parties only (presence handler
      // does the DB update; we just broadcast the event here so the handler
      // doesn't need access to io directly).
      io!.to(`user:${userId}:contacts`).emit('user-status-changed', {
        userId,
        isOnline: false,
        lastActive: new Date(),
      });
    });
  });

  LoggerUtil.info('Socket.IO initialized successfully');
  return io;
};

// ─── Accessor ─────────────────────────────────────────────────────────────────
export const getIO = (): Server => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocketIO first.');
  }
  return io;
};

/**
 * Send a notification to a specific user from anywhere in the server codebase.
 * Use this instead of exposing raw io — it enforces the room convention.
 */
export const emitToUser = (
  userId: string,
  event: string,
  payload: Record<string, unknown>
): void => {
  getIO().to(`user:${userId}`).emit(event, payload);
};