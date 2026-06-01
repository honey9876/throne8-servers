/**
 * message.repository.ts
 * All raw DB operations for messages and conversations.
 * Service layer calls this — controllers never touch DB directly.
 * 
 * External IDs (UUID) come in → resolved to ObjectId internally here.
 * Responses always use UUIDs, never ObjectIds.
 */

import { Types } from 'mongoose';
// import Message from '../models/messaging.model';
import mongoose from 'mongoose';
import Conversation from '../models/conversation.model';
import {
    IMessage,
    IConversation,
    CreateMessageInput,
    MessageStatus,
    MessageType,
    PaginationCursor,
    ConversationType,
} from '../types/message.types';

async function getMessageModel() {
    if (mongoose.models['DirectMessage']) {
        return mongoose.models['DirectMessage'];
    }
    const { default: Message } = await import('../models/messaging.model');
    return Message;
}
// ==================== CONVERSATION REPOSITORY ====================

export class ConversationRepository {

    /**
     * Resolve external UUID → internal ObjectId
     * Used internally before any message insert
     */
    async resolveObjectId(conversationId: string): Promise<Types.ObjectId | null> {
        const conv = await Conversation.findOne(
            { conversationId, isActive: true },
            { _id: 1 }
        ).lean();
        return conv ? conv._id as Types.ObjectId : null;
    }

    /**
     * Find conversation by UUID (external)
     */
    async findByUUID(conversationId: string): Promise<IConversation | null> {
        return Conversation.findOne({ conversationId, isActive: true });
    }

    /**
     * Get all conversations for a user, sorted by latest activity
     */
    async findByUserId(userId: string): Promise<IConversation[]> {
        return Conversation.find(
            { members: userId, isActive: true },
            {
                conversationId: 1,
                type: 1,
                members: 1,
                lastMessage: 1,
                unreadCounts: 1,
                groupName: 1,
                groupAvatar: 1,
                isActive: 1,
                createdAt: 1,
                updatedAt: 1,
            }
        )
            .sort({ updatedAt: -1 }) as unknown as Promise<IConversation[]>;
    }

    /**
     * Get or create a direct conversation between two users
     */
    async getOrCreateDirect(
        userIdA: string,
        userIdB: string
    ): Promise<IConversation> {
        return (Conversation as any).getOrCreateDirect(userIdA, userIdB);
    }

    /**
     * Increment unread count for all members EXCEPT the sender
     */
    async incrementUnreadForRecipients(
        conversationObjectId: Types.ObjectId,
        senderUserId: string
    ): Promise<void> {
        const conv = await Conversation.findById(conversationObjectId, { members: 1 });
        if (!conv) return;

        const recipients = conv.members.filter((m) => m !== senderUserId);
        if (!recipients.length) return;

        const inc: Record<string, number> = {};
        recipients.forEach((uid) => {
            inc[`unreadCounts.${uid}`] = 1;
        });

        await Conversation.updateOne({ _id: conversationObjectId }, { $inc: inc });
    }

    /**
     * Reset unread count to 0 for a specific user (called on seen)
     */
    async resetUnreadCount(
        conversationObjectId: Types.ObjectId,
        userId: string
    ): Promise<void> {
        await Conversation.updateOne(
            { _id: conversationObjectId },
            { $set: { [`unreadCounts.${userId}`]: 0 } }
        );
    }

    /**
     * Update lastMessage snapshot after a new message is saved
     */
    async updateLastMessage(
        conversationObjectId: Types.ObjectId,
        message: IMessage
    ): Promise<void> {
        await Conversation.updateOne(
            { _id: conversationObjectId },
            {
                $set: {
                    lastMessage: {
                        messageId: message.messageId,
                        text: message.text || '',
                        type: message.type,
                        senderId: message.senderId,
                        sentAt: message.createdAt,
                    },
                    updatedAt: new Date(),
                },
            }
        );
    }

    /**
     * Verify that a userId is a member of the conversation
     */
    async isMember(conversationObjectId: Types.ObjectId, userId: string): Promise<boolean> {
        const conv = await Conversation.findOne(
            { _id: conversationObjectId, members: userId },
            { _id: 1 }
        ).lean();
        return !!conv;
    }
}

// ==================== MESSAGE REPOSITORY ====================

export class MessageRepository {

    /**
     * Insert a new message document
     */
    async create(input: CreateMessageInput): Promise<IMessage> {
        const Message = await getMessageModel();
        const message = new Message({
            conversationId: input.conversationId,       // ObjectId
            senderId: input.senderId,
            type: input.type,
            text: input.text,
            mediaUrl: input.mediaUrl,
            mediaDuration: input.mediaDuration,
            mediaSize: input.mediaSize,
            status: MessageStatus.SENT,
            metadata: input.metadata,
        });
        return message.save();
    }

    /**
     * Fetch message by external UUID
     */
    async findByUUID(messageId: string): Promise<IMessage | null> {
        const Message = await getMessageModel();
        return Message.findOne({ messageId, isDeleted: false });
    }

    /**
     * Cursor-based pagination — returns messages older than cursor timestamp
     * Sorted: newest first (for chat UI)
     */
    async findByConversation(
        conversationObjectId: Types.ObjectId,
        cursor: PaginationCursor
    ): Promise<IMessage[]> {
        const Message = await getMessageModel();
        return Message.find(
            {
                conversationId: conversationObjectId,
                isDeleted: false,
                createdAt: { $lt: cursor.before },
            },
            {
                messageId: 1,
                conversationId: 1,
                senderId: 1,
                type: 1,
                text: 1,
                mediaUrl: 1,
                mediaDuration: 1,
                status: 1,
                reactions: 1,
                isPinned: 1,
                metadata: 1,
                createdAt: 1,
                deliveredAt: 1,
                seenAt: 1,
            }
        )
            .sort({ createdAt: -1 })
            .limit(cursor.limit)
            .lean() as unknown as IMessage[];
    }

    /**
     * Count messages in a conversation (for pagination metadata)
     */
    async countByConversation(conversationObjectId: Types.ObjectId): Promise<number> {
        const Message = await getMessageModel();
        return Message.countDocuments({ conversationId: conversationObjectId, isDeleted: false });
    }

    /**
     * Full-text search across a conversation's messages
     * Uses MongoDB text index on `text` field
     */
    async searchInConversation(
        conversationObjectId: Types.ObjectId,
        keyword: string,
        limit: number,
        skip: number
    ): Promise<IMessage[]> {
        const Message = await getMessageModel();
        return Message.find(
            {
                conversationId: conversationObjectId,
                isDeleted: false,
                $text: { $search: keyword },
            },
            { score: { $meta: 'textScore' } }
        )
            .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean() as unknown as IMessage[];
    }

    /**
     * Mark a single message as delivered
     */
    async markDelivered(messageId: string): Promise<IMessage | null> {
        const Message = await getMessageModel();
        return Message.findOneAndUpdate(
            {
                messageId,
                status: MessageStatus.SENT,     // only advance if currently SENT
                isDeleted: false,
            },
            {
                $set: {
                    status: MessageStatus.DELIVERED,
                    deliveredAt: new Date(),
                },
            },
            { new: true }
        );
    }

    /**
     * Bulk mark all SENT/DELIVERED messages in a conversation as SEEN
     * Called when recipient opens the conversation
     * Only marks messages NOT sent by the current user (the reader)
     */
    async bulkMarkSeen(
        conversationObjectId: Types.ObjectId,
        readerUserId: string
    ): Promise<number> {
        const Message = await getMessageModel();
        const result = await Message.updateMany(
            {
                conversationId: conversationObjectId,
                senderId: { $ne: readerUserId },
                status: { $in: [MessageStatus.SENT, MessageStatus.DELIVERED] },
                isDeleted: false,
            },
            {
                $set: {
                    status: MessageStatus.SEEN,
                    seenAt: new Date(),
                },
            }
        );
        return result.modifiedCount;
    }

    /**
     * Toggle a reaction on a message
     * If user already reacted with same emoji → remove it (toggle off)
     * Else → add userId to that emoji's userIds array
     */
    async toggleReaction(
        messageId: string,
        userId: string,
        emoji: string
    ): Promise<IMessage | null> {
        const Message = await getMessageModel();
        const message = await Message.findOne({ messageId, isDeleted: false });
        if (!message) return null;

        const existing = message.reactions.find((r) => r.emoji === emoji);

        if (existing) {
            if (existing.userIds.includes(userId)) {
                // Remove reaction
                existing.userIds = existing.userIds.filter((id) => id !== userId);
                if (existing.userIds.length === 0) {
                    message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
                }
            } else {
                existing.userIds.push(userId);
            }
        } else {
            message.reactions.push({ emoji, userIds: [userId] });
        }

        return message.save();
    }

    /**
     * Soft delete a message
     */
    async softDelete(messageId: string, deletedBy: string): Promise<IMessage | null> {
        const Message = await getMessageModel();
        return Message.findOneAndUpdate(
            { messageId, isDeleted: false },
            {
                $set: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy,
                    text: undefined,      // wipe content
                    mediaUrl: undefined,
                },
            },
            { new: true }
        );
    }

    /**
     * Get all pinned messages in a conversation
     */
    async getPinned(conversationObjectId: Types.ObjectId): Promise<IMessage[]> {
        const Message = await getMessageModel();
        return Message.find(
            { conversationId: conversationObjectId, isPinned: true, isDeleted: false },
            { messageId: 1, text: 1, type: 1, senderId: 1, pinnedAt: 1, pinnedBy: 1, createdAt: 1 }
        )
            .sort({ pinnedAt: -1 })
            .lean() as unknown as IMessage[];
    }

    /**
     * Toggle pin on a message
     */
    async togglePin(
        messageId: string,
        pinnedBy: string
    ): Promise<IMessage | null> {
        const Message = await getMessageModel();
        const message = await Message.findOne({ messageId, isDeleted: false });
        if (!message) return null;

        message.isPinned = !message.isPinned;
        message.pinnedAt = message.isPinned ? new Date() : undefined;
        message.pinnedBy = message.isPinned ? pinnedBy : undefined;

        return message.save();
    }
}

// ==================== SINGLETON EXPORTS ====================

export const conversationRepo = new ConversationRepository();
export const messageRepo = new MessageRepository();