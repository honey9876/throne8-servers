/**
 * /server/thronet-server/src/message/models/messaging.model.ts
 * message.model.ts
 * MongoDB schema for individual messages
 * Optimized for 5 lakh users with proper indexing
 */

import mongoose, { Schema, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { IMessage, MessageType, MessageStatus } from '../types/message.types';

// ==================== SCHEMA ====================

const ReactionSchema = new Schema(
    {
        emoji: { type: String, required: true, maxlength: 10 },
        userIds: { type: [String], default: [] },
    },
    { _id: false }
);

console.log('🔍 message.model.ts TOP =>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');

const MessageSchema = new Schema<IMessage>(
    {
        // External UUID — what the client always sees
        messageId: {
            type: String,
            required: true,
            unique: true,
            default: uuidv4,
            immutable: true,
        },

        // Internal ObjectId reference to Conversation
        conversationId: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
            // 
        },

        // Sender is a UUID string (matches User.userId)
        senderId: {
            type: String,
            required: true,
            // 
        },

        type: {
            type: String,
            enum: Object.values(MessageType),
            default: MessageType.TEXT,
            // 
        },

        // Text content — required only for text/system messages
        text: {
            type: String,
            trim: true,
            maxlength: [4000, 'Message cannot exceed 4000 characters'],
        },

        // Media
        mediaUrl: { type: String, trim: true },
        mediaDuration: { type: Number, min: 0 },  // seconds
        mediaSize: { type: Number, min: 0 },      // bytes

        // Delivery status
        status: {
            type: String,
            enum: Object.values(MessageStatus),
            default: MessageStatus.SENT,
            // 
        },
        deliveredAt: { type: Date },
        seenAt: { type: Date },

        // Reactions array
        reactions: {
            type: [ReactionSchema],
            default: [],
        },

        // Pin
        isPinned: {
            type: Boolean,
            default: false,
            //  
        },
        pinnedAt: { type: Date },
        pinnedBy: { type: String },

        // Soft delete
        isDeleted: {
            type: Boolean,
            default: false,
            //  
        },
        deletedAt: { type: Date },
        deletedBy: { type: String },

        // Flexible metadata for system/reminder messages
        metadata: {
            type: Schema.Types.Mixed,
            default: undefined,
        },
    },
    {
        timestamps: true,
        collection: 'messages-service',
        // Shard key matches User sharding strategy
        shardKey: { conversationId: 1, createdAt: -1 },
    }
);

// ==================== INDEXES ====================

// Primary query: all messages in a conversation, newest first
MessageSchema.index({ conversationId: 1, createdAt: -1 });

// Cursor-based pagination: fetch messages before a timestamp
MessageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });

// Status tracking queries
MessageSchema.index({ conversationId: 1, status: 1, senderId: 1 });

// Search — text index on message content
MessageSchema.index({ text: 'text' }, { weights: { text: 1 } });

// Pinned messages per conversation
MessageSchema.index({ conversationId: 1, isPinned: 1 });

// Sender's own messages (for "my messages" views)
MessageSchema.index({ senderId: 1, createdAt: -1 });

// ==================== METHODS ====================

MessageSchema.methods.toResponse = function (currentUserId: string) {
    return {
        messageId: this.messageId,
        conversationId: this.conversationId.toString(), // ObjectId → string (internal only used here)
        senderId: this.senderId,
        type: this.type,
        text: this.text,
        mediaUrl: this.mediaUrl,
        mediaDuration: this.mediaDuration,
        status: this.status,
        reactions: (this.reactions || []).map((r: any) => ({
            emoji: r.emoji,
            count: r.userIds.length,
            reactedByMe: r.userIds.includes(currentUserId),
        })),
        isPinned: this.isPinned,
        metadata: this.metadata,
        createdAt: this.createdAt.toISOString(),
        deliveredAt: this.deliveredAt?.toISOString(),
        seenAt: this.seenAt?.toISOString(),
    };
};

// ==================== EXPORT ====================

const Message = (mongoose.models['DirectMessage'] as mongoose.Model<IMessage>)
    ?? mongoose.model<IMessage>('DirectMessage', MessageSchema);

console.log('🔍 message.model.ts BOTTOM =>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
export default Message;