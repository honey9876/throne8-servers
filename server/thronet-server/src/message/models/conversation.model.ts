/**
 * conversation.model.ts
 * MongoDB schema for conversations (direct + group)
 * unreadCounts stored as Map<userId(UUID), count>
 */

import mongoose, { Schema, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { IConversation, ConversationType, MessageType } from '../types/message.types';

// ==================== SCHEMA ====================

console.log('🔍 conversation.model.ts TOP =>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');

        
const LastMessageSchema = new Schema(
    {
        messageId: { type: String, required: true },   // UUID
        text: { type: String, default: '' },
        type: {
            type: String,
            enum: Object.values(MessageType),
            default: MessageType.TEXT,
        },
        senderId: { type: String, required: true },    // UUID
        sentAt: { type: Date, required: true },
    },
    { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
    {
        // External UUID — exposed in all API responses
        conversationId: {
            type: String,
            required: true,
            unique: true,
            default: uuidv4,
            immutable: true,
        },

        type: {
            type: String,
            enum: Object.values(ConversationType),
            required: true,
            default: ConversationType.DIRECT,
            // 
        },

        // Array of User.userId (UUID strings) — max 2 for direct, unlimited for group
        members: {
            type: [String],
            required: true,
            validate: {
                validator: (arr: string[]) => arr.length >= 2,
                message: 'A conversation must have at least 2 members',
            },
            // 
        },

        lastMessage: {
            type: LastMessageSchema,
            default: null,
        },

        // Map: UUID → unread count for that user
        unreadCounts: {
            type: Map,
            of: Number,
            default: {},
        },

        // Group fields (null for direct)
        groupName: {
            type: String,
            trim: true,
            maxlength: [100, 'Group name cannot exceed 100 characters'],
        },
        groupAvatar: { type: String, trim: true },
        groupDescription: {
            type: String,
            trim: true,
            maxlength: [500, 'Group description cannot exceed 500 characters'],
        },
        adminIds: {
            type: [String],   // UUIDs
            default: [],
        },

        isActive: {
            type: Boolean,
            default: true,
            // 
        },
    },
    {
        timestamps: true,
        collection: 'conversations-message-service',
        shardKey: { conversationId: 'hashed' },
    }
);

// ==================== INDEXES ====================

// Primary: all conversations a user is part of, sorted by latest activity
ConversationSchema.index({ members: 1, updatedAt: -1 });

// Fast lookup: find direct conversation between two specific users
ConversationSchema.index({ members: 1, type: 1 });

// Active conversations only
ConversationSchema.index({ members: 1, isActive: 1, updatedAt: -1 });

// ==================== STATIC METHODS ====================

/**
 * findDirectConversation
 * Returns the existing direct conversation between exactly two users
 * Uses sorted members array to ensure consistent lookup regardless of order
 */
ConversationSchema.statics.findDirectConversation = async function (
    userIdA: string,
    userIdB: string
): Promise<IConversation | null> {
    const sorted = [userIdA, userIdB].sort();
    return this.findOne({
        type: ConversationType.DIRECT,
        members: { $all: sorted, $size: 2 },
        isActive: true,
    });
};

/**
 * getOrCreateDirect
 * Finds or creates a direct conversation between two users atomically
 */
ConversationSchema.statics.getOrCreateDirect = async function (
    userIdA: string,
    userIdB: string
): Promise<IConversation> {
    const sorted = [userIdA, userIdB].sort();

    const existing = await this.findOne({
        type: ConversationType.DIRECT,
        members: { $all: sorted, $size: 2 },
        isActive: true,
    });

    if (existing) return existing;

    return this.create({
        conversationId: uuidv4(),
        type: ConversationType.DIRECT,
        members: sorted,
        unreadCounts: new Map(),
    });
};

// ==================== EXPORT ====================

const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);
console.log('🔍 conversation.model.ts BOTTOM =>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
export default Conversation;