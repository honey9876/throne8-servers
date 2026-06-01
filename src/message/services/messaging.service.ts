/**
 * message.service.ts
 * Business logic layer for messaging core.
 * Coordinates repository, socket emissions, and cache.
 * Controllers call only this layer.
 */

import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
    SendMessageDTO,
    GetHistoryDTO,
    SearchMessagesDTO,
    UpdateStatusDTO,
    AddReactionDTO,
    MessageType,
    MessageStatus,
    MessageResponse,
    ConversationResponse,
    PaginatedMessages,
    SocketNewMessage,
    SocketStatusUpdate,
    ConversationType,
} from '../types/message.types';
// import { getIO } from '../../socket';   // your existing Socket.IO singleton
import { LoggerUtil as logger } from '../../shared/logger.util';
import { conversationRepo, messageRepo } from '../repository/messaging.repository';

// ==================== HELPERS ====================

console.log('🔍 message.service.ts LOADING START');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

function clampLimit(limit?: number): number {
    if (!limit || limit < 1) return DEFAULT_LIMIT;
    return Math.min(limit, MAX_LIMIT);
}

function buildMessageResponse(msg: any, currentUserId: string): MessageResponse {
    return {
        messageId: msg.messageId,
        conversationId: msg.conversationId?.toString?.() ?? msg.conversationId,
        senderId: msg.senderId,
        type: msg.type,
        text: msg.text,
        mediaUrl: msg.mediaUrl,
        mediaDuration: msg.mediaDuration,
        status: msg.status,
        reactions: (msg.reactions || []).map((r: any) => ({
            emoji: r.emoji,
            count: r.userIds?.length ?? 0,
            reactedByMe: (r.userIds || []).includes(currentUserId),
        })),
        isPinned: msg.isPinned,
        metadata: msg.metadata,
        createdAt: new Date(msg.createdAt).toISOString(),
        deliveredAt: msg.deliveredAt ? new Date(msg.deliveredAt).toISOString() : undefined,
        seenAt: msg.seenAt ? new Date(msg.seenAt).toISOString() : undefined,
    };
}

// ==================== MESSAGE SERVICE ====================

class MessageService {

    // ── 1. SEND MESSAGE ──────────────────────────────────────────────────────────

    /**
     * Send a message from one user to another inside a conversation.
     * Steps:
     *   1. Resolve conversationId (UUID → ObjectId)
     *   2. Verify sender is a member
     *   3. Persist message to DB
     *   4. Update conversation's lastMessage snapshot
     *   5. Increment unread counts for recipients
     *   6. Emit Socket.IO event to conversation room
     */
    async sendMessage(
        senderUserId: string,
        dto: SendMessageDTO
    ): Promise<MessageResponse> {
        // Step 1: resolve ObjectId
        const conversationObjectId = await conversationRepo.resolveObjectId(dto.conversationId);
        if (!conversationObjectId) {
            throw Object.assign(new Error('Conversation not found'), { status: 404 });
        }

        // Step 2: membership check
        const isMember = await conversationRepo.isMember(conversationObjectId, senderUserId);
        if (!isMember) {
            throw Object.assign(new Error('You are not a member of this conversation'), { status: 403 });
        }

        // Step 3: persist
        const message = await messageRepo.create({
            conversationId: conversationObjectId,
            conversationUUID: dto.conversationId,
            senderId: senderUserId,
            type: dto.type ?? MessageType.TEXT,
            text: dto.text,
            mediaUrl: dto.mediaUrl,
            mediaDuration: dto.mediaDuration,
            metadata: dto.metadata,
        });

        // Step 4 + 5: update conversation concurrently
        await Promise.all([
            conversationRepo.updateLastMessage(conversationObjectId, message),
            conversationRepo.incrementUnreadForRecipients(conversationObjectId, senderUserId),
        ]);

        // Step 6: real-time emit to everyone in the conversation room
        const socketPayload: SocketNewMessage = {
            messageId: message.messageId,
            conversationId: dto.conversationId,
            senderId: senderUserId,
            type: message.type,
            text: message.text,
            mediaUrl: message.mediaUrl,
            status: MessageStatus.SENT,
            createdAt: message.createdAt.toISOString(),
        };

        try {
            const { getIO } = await import('../../socket');
            const io = getIO();
            io.to(`conversation:${dto.conversationId}`).emit('message:new', socketPayload);
        } catch (err) {
            // Socket not critical — message is already saved
            logger.warn('Socket emit failed for message:new', { error: (err as Error).message });
        }

        logger.info('Message sent', {
            messageId: message.messageId,
            conversationId: dto.conversationId,
            senderId: senderUserId,
        });

        return buildMessageResponse(message, senderUserId);
    }

    // ── 2. GET MESSAGE HISTORY (cursor-based pagination) ────────────────────────

    /**
     * Returns messages for a conversation older than the given cursor.
     * Default cursor = now (most recent messages first).
     * Client sends the createdAt of its oldest loaded message to load more.
     */
    async getHistory(
        userId: string,
        dto: GetHistoryDTO
    ): Promise<PaginatedMessages> {
        const conversationObjectId = await conversationRepo.resolveObjectId(dto.conversationId);
        if (!conversationObjectId) {
            throw Object.assign(new Error('Conversation not found'), { status: 404 });
        }

        const isMember = await conversationRepo.isMember(conversationObjectId, userId);
        if (!isMember) {
            throw Object.assign(new Error('Access denied'), { status: 403 });
        }

        const limit = clampLimit(dto.limit);
        const before = dto.cursor ? new Date(dto.cursor) : new Date();

        const messages = await messageRepo.findByConversation(conversationObjectId, {
            before,
            limit: limit + 1,   // fetch one extra to detect hasMore
        });

        const hasMore = messages.length > limit;
        const result = hasMore ? messages.slice(0, limit) : messages;

        const nextCursor =
            result.length > 0
                ? new Date(result[result.length - 1].createdAt).toISOString()
                : null;

        return {
            messages: result.map((m) => buildMessageResponse(m, userId)),
            nextCursor: hasMore ? nextCursor : null,
            hasMore,
        };
    }

    // ── 3. MARK DELIVERED ───────────────────────────────────────────────────────

    /**
     * Called by the recipient's device when a message arrives (WebSocket connect).
     * Only advances status: SENT → DELIVERED (never backwards).
     */
    async markDelivered(
        messageId: string,
        recipientUserId: string
    ): Promise<void> {
        const message = await messageRepo.markDelivered(messageId);
        if (!message) return;

        const conv = await conversationRepo.findByUUID(
            message.conversationId.toString()
        );

        const socketPayload: SocketStatusUpdate = {
            messageId: message.messageId,
            conversationId: conv?.conversationId ?? message.conversationId.toString(),
            status: MessageStatus.DELIVERED,
            updatedAt: new Date().toISOString(),
        };

        try {
            const { getIO } = await import('../../socket');
            const io = getIO();
            io.to(`user:${message.senderId}`).emit('message:status', socketPayload);
        } catch (err) {
            logger.warn('Socket emit failed for message:status (delivered)', {
                error: (err as Error).message,
            });
        }
    }

    // ── 4. MARK SEEN (bulk, per conversation) ───────────────────────────────────

    /**
     * Called when a user opens a conversation.
     * Bulk-updates all unseen messages in that conversation to SEEN.
     * Resets unread count for this user.
     * Notifies the sender(s) via Socket.IO.
     */
    async markConversationSeen(
        conversationId: string,     // UUID (external)
        readerUserId: string
    ): Promise<void> {
        const conversationObjectId = await conversationRepo.resolveObjectId(conversationId);
        if (!conversationObjectId) return;

        const isMember = await conversationRepo.isMember(conversationObjectId, readerUserId);
        if (!isMember) return;

        const [modifiedCount] = await Promise.all([
            messageRepo.bulkMarkSeen(conversationObjectId, readerUserId),
            conversationRepo.resetUnreadCount(conversationObjectId, readerUserId),
        ]);

        if (modifiedCount === 0) return;

        // Emit seen event to all conversation members
        try {
            const { getIO } = await import('../../socket');
            const io = getIO();
            io.to(`conversation:${conversationId}`).emit('conversation:seen', {
                conversationId,
                seenBy: readerUserId,
                seenAt: new Date().toISOString(),
            });
        } catch (err) {
            logger.warn('Socket emit failed for conversation:seen', {
                error: (err as Error).message,
            });
        }
    }

    // ── 5. SEARCH MESSAGES ──────────────────────────────────────────────────────

    async searchMessages(
        userId: string,
        dto: SearchMessagesDTO
    ): Promise<{ messages: MessageResponse[]; total: number; page: number }> {
        if (!dto.keyword || dto.keyword.trim().length < 2) {
            throw Object.assign(new Error('Search keyword must be at least 2 characters'), {
                status: 400,
            });
        }

        const conversationObjectId = await conversationRepo.resolveObjectId(dto.conversationId);
        if (!conversationObjectId) {
            throw Object.assign(new Error('Conversation not found'), { status: 404 });
        }

        const isMember = await conversationRepo.isMember(conversationObjectId, userId);
        if (!isMember) {
            throw Object.assign(new Error('Access denied'), { status: 403 });
        }

        const limit = clampLimit(dto.limit);
        const page = Math.max(1, dto.page ?? 1);
        const skip = (page - 1) * limit;

        const messages = await messageRepo.searchInConversation(
            conversationObjectId,
            dto.keyword.trim(),
            limit,
            skip
        );

        return {
            messages: messages.map((m) => buildMessageResponse(m, userId)),
            total: messages.length,
            page,
        };
    }

    // ── 6. GET CONVERSATION LIST ────────────────────────────────────────────────

    async getConversations(userId: string): Promise<ConversationResponse[]> {
        const conversations = await conversationRepo.findByUserId(userId);

        return conversations.map((conv) => {
            const unreadCount = (conv.unreadCounts as Map<string, number>)?.get?.(userId) ?? 0;

            return {
                conversationId: conv.conversationId,
                type: conv.type,
                members: conv.members,
                lastMessage: conv.lastMessage
                    ? {
                        messageId: conv.lastMessage.messageId,
                        text: conv.lastMessage.text,
                        type: conv.lastMessage.type,
                        senderId: conv.lastMessage.senderId,
                        sentAt: new Date(conv.lastMessage.sentAt).toISOString(),
                    }
                    : undefined,
                unreadCount,
                groupName: conv.groupName,
                groupAvatar: conv.groupAvatar,
                isActive: conv.isActive,
                createdAt: new Date(conv.createdAt).toISOString(),
            };
        });
    }

    // ── 7. GET OR CREATE DIRECT CONVERSATION ────────────────────────────────────

    async getOrCreateDirectConversation(
        userIdA: string,
        userIdB: string
    ): Promise<ConversationResponse> {
        if (userIdA === userIdB) {
            throw Object.assign(new Error('Cannot create conversation with yourself'), { status: 400 });
        }

        const conv = await conversationRepo.getOrCreateDirect(userIdA, userIdB);
        const unreadCount = (conv.unreadCounts as Map<string, number>)?.get?.(userIdA) ?? 0;

        return {
            conversationId: conv.conversationId,
            type: conv.type,
            members: conv.members,
            unreadCount,
            isActive: conv.isActive,
            createdAt: new Date(conv.createdAt).toISOString(),
        };
    }

    // ── 8. REACTIONS ────────────────────────────────────────────────────────────

    async toggleReaction(
        userId: string,
        dto: AddReactionDTO
    ): Promise<MessageResponse> {
        const message = await messageRepo.toggleReaction(dto.messageId, userId, dto.emoji);
        if (!message) {
            throw Object.assign(new Error('Message not found'), { status: 404 });
        }

        const conv = await conversationRepo.findByUUID(
            message.conversationId.toString()
        );

        // Emit reaction update to conversation room
        try {
            const { getIO } = await import('../../socket');
            const io = getIO();
            io.to(`conversation:${conv?.conversationId}`).emit('message:reaction', {
                messageId: dto.messageId,
                reactions: message.reactions.map((r) => ({
                    emoji: r.emoji,
                    count: r.userIds.length,
                })),
            });
        } catch (err) {
            logger.warn('Socket emit failed for message:reaction', {
                error: (err as Error).message,
            });
        }

        return buildMessageResponse(message, userId);
    }

    // ── 9. PIN / UNPIN ──────────────────────────────────────────────────────────

    async togglePin(
        userId: string,
        messageId: string
    ): Promise<MessageResponse> {
        const message = await messageRepo.findByUUID(messageId);
        if (!message) {
            throw Object.assign(new Error('Message not found'), { status: 404 });
        }

        const isMember = await conversationRepo.isMember(
            message.conversationId as Types.ObjectId,
            userId
        );
        if (!isMember) {
            throw Object.assign(new Error('Access denied'), { status: 403 });
        }

        const updated = await messageRepo.togglePin(messageId, userId);
        return buildMessageResponse(updated!, userId);
    }

    // ── 10. GET PINNED MESSAGES ─────────────────────────────────────────────────

    async getPinnedMessages(
        userId: string,
        conversationId: string
    ): Promise<MessageResponse[]> {
        const conversationObjectId = await conversationRepo.resolveObjectId(conversationId);
        if (!conversationObjectId) {
            throw Object.assign(new Error('Conversation not found'), { status: 404 });
        }

        const isMember = await conversationRepo.isMember(conversationObjectId, userId);
        if (!isMember) {
            throw Object.assign(new Error('Access denied'), { status: 403 });
        }

        const pinned = await messageRepo.getPinned(conversationObjectId);
        return pinned.map((m) => buildMessageResponse(m, userId));
    }

    // ── 11. SOFT DELETE MESSAGE ─────────────────────────────────────────────────

    async deleteMessage(userId: string, messageId: string): Promise<void> {
        const message = await messageRepo.findByUUID(messageId);
        if (!message) {
            throw Object.assign(new Error('Message not found'), { status: 404 });
        }

        if (message.senderId !== userId) {
            throw Object.assign(new Error('You can only delete your own messages'), { status: 403 });
        }

        await messageRepo.softDelete(messageId, userId);

        // Notify conversation room
        try {
            const { getIO } = await import('../../socket');
            const io = getIO();
            const conv = await conversationRepo.findByUUID(
                message.conversationId.toString()
            );
            io.to(`conversation:${conv?.conversationId}`).emit('message:deleted', {
                messageId,
                deletedAt: new Date().toISOString(),
            });
        } catch (err) {
            logger.warn('Socket emit failed for message:deleted', {
                error: (err as Error).message,
            });
        }
    }
}

// ==================== SINGLETON EXPORT ====================

const messageService = new MessageService();
export default messageService;

console.log('🔍 message.service.ts LOADING END');