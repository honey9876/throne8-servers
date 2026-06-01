/**
 * messageHandler.ts  (socket/handlers/)
 * Real-time Socket.IO handlers for messaging.
 * Integrates into your existing initializeSocketIO in socket/index.ts.
 *
 * Events handled:
 *   conversation:join    — user joins a conversation room
 *   conversation:leave   — user leaves a conversation room
 *   message:typing       — typing indicator broadcast
 *   message:delivered    — client confirms message received
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../index';  // your existing type
import { LoggerUtil as logger } from '../../shared/logger.util';
import messageService from '@/message/services/messaging.service';

export const setupMessageHandlers = (io: Server, socket: AuthenticatedSocket) => {
    const userId = socket.data.userId || socket.userId;

    if (!userId) {
        logger.error('No userId in message handler');
        return;
    }

    // ── JOIN CONVERSATION ROOM ────────────────────────────────────────────────
    /**
     * Client emits this when it opens a conversation view.
     * Allows the server to target that conversation's room for real-time updates.
     * Also triggers bulk mark-seen for unread messages.
     */
    socket.on('conversation:join', async (conversationId: string) => {
        if (!conversationId) return;

        socket.join(`conversation:${conversationId}`);
        logger.debug('User joined conversation room', { userId, conversationId });

        // Auto mark-seen when user enters the conversation
        try {
            await messageService.markConversationSeen(conversationId, userId);
        } catch (err) {
            logger.warn('markConversationSeen failed on join', {
                userId,
                conversationId,
                error: (err as Error).message,
            });
        }
    });

    // ── LEAVE CONVERSATION ROOM ───────────────────────────────────────────────
    socket.on('conversation:leave', (conversationId: string) => {
        if (!conversationId) return;
        socket.leave(`conversation:${conversationId}`);
        logger.debug('User left conversation room', { userId, conversationId });
    });

    // ── TYPING INDICATOR ──────────────────────────────────────────────────────
    /**
     * Broadcast typing status to everyone in the conversation EXCEPT the sender.
     * Client emits: { conversationId, isTyping: true/false }
     */
    socket.on(
        'message:typing',
        (data: { conversationId: string; isTyping: boolean }) => {
            if (!data?.conversationId) return;

            socket.to(`conversation:${data.conversationId}`).emit('message:typing', {
                conversationId: data.conversationId,
                userId,
                isTyping: data.isTyping,
            });
        }
    );

    // ── MESSAGE DELIVERED CONFIRMATION ────────────────────────────────────────
    /**
     * Client emits this when it receives a message (e.g. on socket connect
     * and receives a pending message).
     * Server advances status: SENT → DELIVERED and notifies the original sender.
     */
    socket.on('message:delivered', async (messageId: string) => {
        if (!messageId) return;

        try {
            await messageService.markDelivered(messageId, userId);
        } catch (err) {
            logger.warn('markDelivered failed', {
                userId,
                messageId,
                error: (err as Error).message,
            });
        }
    });
};