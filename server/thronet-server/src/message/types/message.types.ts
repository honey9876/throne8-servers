/**
 * message.types.ts
 * All TypeScript interfaces, enums, and DTOs for Messaging Core
 * External IDs = UUID (exposed in routes/responses)
 * Internal IDs = MongoDB ObjectId (never exposed)
 */

import { Document, Types } from 'mongoose';

console.log('🔍 message.types.ts LOADING START');

// ==================== ENUMS ====================

export enum MessageType {
    TEXT = 'text',
    VOICE = 'voice',
    IMAGE = 'image',
    REMINDER = 'system_reminder',
    SYSTEM = 'system',
}

export enum MessageStatus {
    SENDING = 'sending',   // optimistic UI only
    SENT = 'sent',         // saved to DB
    DELIVERED = 'delivered', // recipient device received
    SEEN = 'seen',         // recipient opened conversation
    FAILED = 'failed',
}

export enum ConversationType {
    DIRECT = 'direct',
    GROUP = 'group',
}

// ==================== CORE DOCUMENT INTERFACES ====================

/**
 * Reaction: emoji key → count
 * e.g. { "❤️": 3, "👍": 1 }
 */
export interface IReaction {
    emoji: string;
    userIds: string[]; // UUID list of who reacted
}

/**
 * Lightweight snapshot of the message being replied to.
 * Stored directly on the reply message so we never need a join to render it.
 */
export interface IReplySnapshot {
    messageId: string;   // UUID of the original message
    text?: string;
    senderId: string;    // UUID
    type: MessageType;
}

/**
 * Message Mongoose Document Interface
 * _id        = ObjectId (internal only)
 * messageId  = UUID     (external, used in API responses/routes)
 */
export interface IMessage extends Document {
    // ── External ID ──
    messageId: string;        // UUID — exposed to clients

    // ── Internal References (ObjectId) ──
    conversationId: Types.ObjectId;  // ref: Conversation._id
    senderId: string;                // UUID — ref: User.userId

    // ── Content ──
    type: MessageType;
    text?: string;
    mediaUrl?: string;        // S3/CDN URL for voice/image
    mediaDuration?: number;   // seconds (voice messages)
    mediaSize?: number;       // bytes

    // ── Status ──
    status: MessageStatus;
    deliveredAt?: Date;
    seenAt?: Date;

    // ── Features ──
    reactions: IReaction[];
    isPinned: boolean;
    pinnedAt?: Date;
    pinnedBy?: string;        // UUID of pinner

    // ── Reply ──
    replyTo?: IReplySnapshot | null;

    // ── Edit ──
    isEdited: boolean;
    editedAt?: Date;

    // ── Soft Delete ──
    isDeleted: boolean;
    deletedAt?: Date;
    deletedBy?: string;       // UUID

    // ── System/Reminder metadata ──
    metadata?: Record<string, unknown>;

    // ── Timestamps ──
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Conversation Mongoose Document Interface
 * _id            = ObjectId (internal only)
 * conversationId = UUID     (external)
 */
export interface IConversation extends Document {
    conversationId: string;   // UUID — exposed to clients

    type: ConversationType;

    // Members store UUIDs (User.userId)
    members: string[];

    // Last message snapshot — avoids extra query on list view
    lastMessage?: {
        messageId: string;      // UUID
        text: string;
        type: MessageType;
        senderId: string;       // UUID
        sentAt: Date;
    };

    // Per-member unread count: { "uuid-of-user": 5 }
    unreadCounts: Map<string, number>;

    // Group-specific (null for direct)
    groupName?: string;
    groupAvatar?: string;
    groupDescription?: string;
    adminIds?: string[];      // UUIDs

    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// ==================== REQUEST DTOs ====================

export interface SendMessageDTO {
    conversationId: string;   // UUID
    text?: string;
    type?: MessageType;
    mediaUrl?: string;
    mediaDuration?: number;
    metadata?: Record<string, unknown>;
    replyToMessageId?: string; // UUID of the message being replied to
}

export interface EditMessageDTO {
    messageId: string;  // UUID
    text: string;
}

export interface GetHistoryDTO {
    conversationId: string;   // UUID
    // Cursor-based pagination
    cursor?: string;          // ISO timestamp of oldest loaded message
    limit?: number;           // default 30, max 50
}

export interface SearchMessagesDTO {
    conversationId: string;   // UUID
    keyword: string;
    limit?: number;
    page?: number;
}

export interface UpdateStatusDTO {
    messageId: string;        // UUID
    status: MessageStatus.DELIVERED | MessageStatus.SEEN;
}

export interface AddReactionDTO {
    messageId: string;        // UUID
    emoji: string;
}

// ==================== RESPONSE DTOs ====================

export interface MessageResponse {
    messageId: string;
    conversationId: string;
    senderId: string;
    type: MessageType;
    text?: string;
    mediaUrl?: string;
    mediaDuration?: number;
    status: MessageStatus;
    reactions: { emoji: string; count: number; reactedByMe: boolean }[];
    isPinned: boolean;
    replyTo?: IReplySnapshot | null;
    isEdited?: boolean;
    editedAt?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;        // ISO string
    deliveredAt?: string;
    seenAt?: string;
}

export interface ConversationResponse {
    conversationId: string;
    type: ConversationType;
    members: string[];
    lastMessage?: {
        messageId: string;
        text: string;
        type: MessageType;
        senderId: string;
        sentAt: string;
    };
    unreadCount: number;      // for current user only
    groupName?: string;
    groupAvatar?: string;
    isActive: boolean;
    createdAt: string;
}

export interface PaginatedMessages {
    messages: MessageResponse[];
    nextCursor: string | null;  // ISO timestamp for next page
    hasMore: boolean;
    total?: number;
}

// ==================== SOCKET EVENT PAYLOADS ====================

export interface SocketNewMessage {
    messageId: string;
    conversationId: string;
    senderId: string;
    type: MessageType;
    text?: string;
    mediaUrl?: string;
    status: MessageStatus;
    replyTo?: IReplySnapshot | null;
    metadata?: Record<string, unknown>;
    createdAt: string;
}

export interface SocketStatusUpdate {
    messageId: string;
    conversationId: string;
    status: MessageStatus;
    updatedAt: string;
}

export interface SocketEditedMessage {
    messageId: string;
    conversationId: string;
    text: string;
    editedAt: string;
}

export interface SocketTypingEvent {
    conversationId: string;
    userId: string;
    isTyping: boolean;
}

// ==================== INTERNAL SERVICE TYPES ====================

export interface CreateMessageInput {
    conversationId: Types.ObjectId; // resolved internal ObjectId
    conversationUUID: string;       // UUID kept for socket emit
    senderId: string;               // UUID
    type: MessageType;
    text?: string;
    mediaUrl?: string;
    mediaDuration?: number;
    mediaSize?: number;
    metadata?: Record<string, unknown>;
}

export interface PaginationCursor {
    before: Date;   // fetch messages older than this timestamp
    limit: number;
}

console.log('🔍 message.types.ts LOADING END');