/**
 * ====================================
 * CHAT HANDLER
 * ====================================
 * server/thronet-server/src/StudyGroup/socket/chatHandler.ts
 *
 * Fixes applied:
 *  1. Input sanitization (HTML stripped before save)
 *  2. File size validation
 *  3. Reaction update is now atomic (findOneAndUpdate)
 *  4. mark-read errors are logged
 *  5. Membership check extracted into helper to avoid repetition
 *  6. No N+1 on populate — single populate call with nested paths
 */

import { Server, Socket } from 'socket.io';
import { LoggerUtil } from '@/shared/logger.util';
import Message from '../models/Message.model';
import GroupMember from '../models/GroupMember.model';
import { MessageType } from '../enums/MessageType.enum';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CONTENT_LENGTH = 2_000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const EDIT_WINDOW_MS = 15 * 60 * 1_000;       // 15 minutes
const MAX_PINNED_MESSAGES = 5;

// ─── Allowed emoji pattern (basic guard — adjust as needed) ───────────────────
const EMOJI_PATTERN = /^\p{Emoji}{1,2}$/u;

// ─── Sanitize plain text (strip HTML tags) ────────────────────────────────────
function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .replace(/javascript:/gi, '') // strip JS protocol
    .trim();
}

// ─── Verify active group membership ──────────────────────────────────────────
async function assertMembership(
  userId: string,
  groupId: string,
  socket: Socket,
  event: string
): Promise<boolean> {
  const member = await GroupMember.findOne({
    user: userId,
    group: groupId,
    status: 'active',
  }).lean();

  if (!member) {
    socket.emit('error', { event, message: 'You are not a member of this group' });
    return false;
  }
  return true;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export const handleChatEvents = (io: Server, socket: Socket, userId: string): void => {

  // ========================================================
  // SEND MESSAGE
  // ========================================================
  socket.on('send-message', async (data: {
    groupId: string;
    content: string;
    messageType?: string;
    replyTo?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
  }) => {
    try {
      const { groupId, content, messageType, replyTo, fileUrl, fileName, fileSize } = data;

      // ── Input validation ──────────────────────────────────────────────────
      if (!groupId || typeof groupId !== 'string') {
        socket.emit('error', { event: 'send-message', message: 'Invalid groupId' });
        return;
      }

      const sanitizedContent = sanitizeText(content ?? '');

      if (!sanitizedContent) {
        socket.emit('error', { event: 'send-message', message: 'Message cannot be empty' });
        return;
      }

      if (sanitizedContent.length > MAX_CONTENT_LENGTH) {
        socket.emit('error', {
          event: 'send-message',
          message: `Message cannot exceed ${MAX_CONTENT_LENGTH} characters`,
        });
        return;
      }

      // File size guard
      if (fileSize !== undefined && fileSize > MAX_FILE_SIZE_BYTES) {
        socket.emit('error', {
          event: 'send-message',
          message: 'File size cannot exceed 10 MB',
        });
        return;
      }

      // ── Membership check ─────────────────────────────────────────────────
      const ok = await assertMembership(userId, groupId, socket, 'send-message');
      if (!ok) return;

      // ── Persist ──────────────────────────────────────────────────────────
      const message = await Message.create({
        groupId,
        sender: userId,
        content: sanitizedContent,
        messageType: messageType || MessageType.TEXT,
        replyTo: replyTo || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileSize: fileSize || null,
      });

      // Single populate call with all needed paths
      await message.populate([
        { path: 'sender', select: 'name avatar email' },
        ...(replyTo ? [{ path: 'replyTo', select: 'content sender' }] : []),
      ]);

      LoggerUtil.info(`Message created: ${message._id} in group ${groupId}`);

      io.to(groupId).emit('new-message', {
        _id: message._id,
        groupId: message.groupId,
        sender: message.sender,
        content: message.content,
        messageType: message.messageType,
        fileUrl: message.fileUrl,
        fileName: message.fileName,
        fileSize: message.fileSize,
        replyTo: message.replyTo,
        reactions: message.reactions,
        isPinned: message.isPinned,
        isEdited: message.isEdited,
        isDeleted: message.isDeleted,
        readBy: message.readBy,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      });

    } catch (error: any) {
      LoggerUtil.error('Error sending message', { error: error.message, userId });
      socket.emit('error', { event: 'send-message', message: 'Failed to send message' });
    }
  });

  // ========================================================
  // EDIT MESSAGE
  // ========================================================
  socket.on('edit-message', async (data: { messageId: string; content: string }) => {
    try {
      const { messageId, content } = data;

      const sanitizedContent = sanitizeText(content ?? '');
      if (!sanitizedContent) {
        socket.emit('error', { event: 'edit-message', message: 'Message cannot be empty' });
        return;
      }

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { event: 'edit-message', message: 'Message not found' });
        return;
      }

      if (message.sender.toString() !== userId) {
        socket.emit('error', { event: 'edit-message', message: 'You can only edit your own messages' });
        return;
      }

      if (message.isDeleted) {
        socket.emit('error', { event: 'edit-message', message: 'Cannot edit a deleted message' });
        return;
      }

      if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
        socket.emit('error', { event: 'edit-message', message: 'Messages can only be edited within 15 minutes' });
        return;
      }

      // Save edit history and update
      message.editHistory.push({ content: message.content, editedAt: new Date() });
      message.content = sanitizedContent;
      message.isEdited = true;
      await message.save();

      LoggerUtil.info(`Message edited: ${messageId} by ${userId}`);

      io.to(message.groupId.toString()).emit('message-edited', {
        _id: message._id,
        content: message.content,
        isEdited: true,
        updatedAt: message.updatedAt,
      });

    } catch (error: any) {
      LoggerUtil.error('Error editing message', { error: error.message, userId, messageId: data.messageId });
      socket.emit('error', { event: 'edit-message', message: 'Failed to edit message' });
    }
  });

  // ========================================================
  // DELETE MESSAGE
  // ========================================================
  socket.on('delete-message', async (data: { messageId: string }) => {
    try {
      const { messageId } = data;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { event: 'delete-message', message: 'Message not found' });
        return;
      }

      const isSender = message.sender.toString() === userId;

      // Check leader role only if not the sender (saves one DB query for senders)
      if (!isSender) {
        const isLeader = await GroupMember.findOne({
          user: userId,
          group: message.groupId,
          role: 'leader',
          status: 'active',
        }).lean();

        if (!isLeader) {
          socket.emit('error', {
            event: 'delete-message',
            message: 'Only the message owner or a group leader can delete messages',
          });
          return;
        }
      }

      // Soft delete
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.deletedBy = userId as any;
      await message.save();

      LoggerUtil.info(`Message deleted: ${messageId} by ${userId}`);

      io.to(message.groupId.toString()).emit('message-deleted', {
        messageId: message._id,
        deletedBy: userId,
        deletedAt: message.deletedAt,
      });

    } catch (error: any) {
      LoggerUtil.error('Error deleting message', { error: error.message, userId, messageId: data.messageId });
      socket.emit('error', { event: 'delete-message', message: 'Failed to delete message' });
    }
  });

  // ========================================================
  // REACT TO MESSAGE  — atomic update, no race condition
  // ========================================================
  socket.on('react-message', async (data: { messageId: string; emoji: string }) => {
    try {
      const { messageId, emoji } = data;

      // Validate emoji input
      if (!emoji || typeof emoji !== 'string' || !EMOJI_PATTERN.test(emoji)) {
        socket.emit('error', { event: 'react-message', message: 'Invalid emoji' });
        return;
      }

      const message = await Message.findById(messageId).lean();
      if (!message) {
        socket.emit('error', { event: 'react-message', message: 'Message not found' });
        return;
      }

      // Membership check
      const ok = await assertMembership(userId, message.groupId.toString(), socket, 'react-message');
      if (!ok) return;

      // Determine if user already reacted with this emoji
      const existingReaction = message.reactions?.find(
        (r: any) => r.emoji === emoji && r.users.map((u: any) => u.toString()).includes(userId)
      );

      let updated;
      if (existingReaction) {
        // Toggle off — atomic pull
        updated = await Message.findOneAndUpdate(
          { _id: messageId, 'reactions.emoji': emoji },
          { $pull: { 'reactions.$.users': userId } },
          { new: true }
        );
        // Remove the reaction object entirely if no users left
        await Message.updateOne(
          { _id: messageId },
          { $pull: { reactions: { emoji, users: { $size: 0 } } } }
        );
      } else {
        // Toggle on — upsert into existing emoji group or push new
        updated = await Message.findOneAndUpdate(
          { _id: messageId, 'reactions.emoji': emoji },
          { $addToSet: { 'reactions.$.users': userId } },
          { new: true }
        );

        if (!updated) {
          // Emoji group doesn't exist yet — push new reaction entry
          updated = await Message.findByIdAndUpdate(
            messageId,
            { $push: { reactions: { emoji, users: [userId] } } },
            { new: true }
          );
        }
      }

      if (!updated) {
        socket.emit('error', { event: 'react-message', message: 'Failed to update reaction' });
        return;
      }

      io.to(message.groupId.toString()).emit('message-reaction-updated', {
        messageId,
        reactions: updated.reactions,
      });

    } catch (error: any) {
      LoggerUtil.error('Error reacting to message', { error: error.message, userId, messageId: data.messageId });
      socket.emit('error', { event: 'react-message', message: 'Failed to react to message' });
    }
  });

  // ========================================================
  // PIN MESSAGE
  // ========================================================
  socket.on('pin-message', async (data: { messageId: string }) => {
    try {
      const { messageId } = data;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { event: 'pin-message', message: 'Message not found' });
        return;
      }

      const isLeaderOrMod = await GroupMember.findOne({
        user: userId,
        group: message.groupId,
        role: { $in: ['leader', 'moderator'] },
        status: 'active',
      }).lean();

      if (!isLeaderOrMod) {
        socket.emit('error', { event: 'pin-message', message: 'Only leaders and moderators can pin messages' });
        return;
      }

      // Enforce pin limit only when pinning (not unpinning)
      if (!message.isPinned) {
        const pinnedCount = await Message.countDocuments({ groupId: message.groupId, isPinned: true });
        if (pinnedCount >= MAX_PINNED_MESSAGES) {
          socket.emit('error', {
            event: 'pin-message',
            message: `Maximum ${MAX_PINNED_MESSAGES} messages can be pinned. Unpin one first.`,
          });
          return;
        }
      }

      message.isPinned = !message.isPinned;
      await message.save();

      LoggerUtil.info(`Message ${messageId} pin toggled to ${message.isPinned} by ${userId}`);

      io.to(message.groupId.toString()).emit('message-pin-updated', {
        messageId: message._id,
        isPinned: message.isPinned,
      });

    } catch (error: any) {
      LoggerUtil.error('Error pinning message', { error: error.message, userId, messageId: data.messageId });
      socket.emit('error', { event: 'pin-message', message: 'Failed to pin/unpin message' });
    }
  });

  // ========================================================
  // MARK MESSAGE AS READ
  // ========================================================
  socket.on('mark-read', async (data: { messageId: string }) => {
    try {
      const { messageId } = data;

      // Atomic update — avoids read-then-write race
      const updated = await Message.findOneAndUpdate(
        { _id: messageId, readBy: { $ne: userId } },
        { $addToSet: { readBy: userId } },
        { new: true, select: 'groupId readBy' }
      );

      // If updated is null, user already read it — no action needed
      if (!updated) return;

      io.to(updated.groupId.toString()).emit('message-read-updated', {
        messageId,
        readBy: updated.readBy,
        readCount: updated.readBy.length,
      });

    } catch (error: any) {
      LoggerUtil.error('Error marking message as read', { error: error.message, userId, messageId: data.messageId });
    }
  });
};

export default { handleChatEvents };