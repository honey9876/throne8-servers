/**
 * src/StudyGroup/models/Message.model.ts
 * ====================================
 * MESSAGE MODEL (PRODUCTION READY)
 * ====================================
 */

import mongoose, { Schema } from 'mongoose';
import { IMessage } from '../interfaces/IMessage';
import { MessageType } from '../enums/MessageType.enum';
import { string } from 'node_modules/zod/v4/core/regexes.cjs';

const messageSchema = new Schema<IMessage>(
  {
    groupId: {
      type: String,
      ref: 'StudyGroup_Group',
      required: [true, 'Group ID is required'],
      // ✅ REMOVED: 
    },
    // groupId ke baad add karo
    messageId: {
      type: String,
      required: true,
      unique: true,
    },
    sender: {
      type: String,
      ref: 'User',
      required: [true, 'Sender is required'],
      // ✅ REMOVED: 
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
      trim: true,
    },
    messageType: {
      type: String,
      enum: Object.values(MessageType),
      default: MessageType.TEXT,
    },
    fileUrl: {
      type: String,
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number,
      default: null,
    },
    replyTo: {
      type: String,
      ref: 'StudyGroup_Message',
      default: null,
    },
    reactions: [
      {
        emoji: {
          type: String,
          required: true,
        },
        users: [
          {
            type: String,
            ref: 'User',
          },
        ],
      },
    ],
    isPinned: {
      type: Boolean,
      default: false,
      // ✅ REMOVED: 
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editHistory: [
      {
        content: {
          type: String,
          required: true,
        },
        editedAt: {
          type: Date,
          required: true,
        },
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
      // ✅ REMOVED: 
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: String,
      ref: 'User',
      default: null,
    },
    readBy: [
      {
        type: String,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * ============================================
 * INDEXES (Optimized for chat performance)
 * ============================================
 */
// ✅ Primary indexes
messageSchema.index({ groupId: 1, createdAt: -1 }); // Get recent messages
messageSchema.index({ sender: 1 });
messageSchema.index({ isDeleted: 1 });
messageSchema.index({ isPinned: 1 });

// ✅ Compound indexes for common queries
messageSchema.index({ groupId: 1, isDeleted: 1, createdAt: -1 }); // Active messages
messageSchema.index({ groupId: 1, isPinned: 1 }); // Pinned messages

/**
 * Virtual: Check if message can be edited (within 15 minutes)
 */
messageSchema.virtual('canEdit').get(function () {
  const fifteenMinutes = 15 * 60 * 1000;
  const timeSinceCreation = Date.now() - this.createdAt.getTime();
  return timeSinceCreation < fifteenMinutes && !this.isDeleted;
});

/**
 * Virtual: Get read count
 */
messageSchema.virtual('readCount').get(function () {
  return this.readBy.length;
});

const Message = mongoose.model<IMessage>('StudyGroup_Message', messageSchema);  

export default Message;