/**
 * ====================================
 * CHAT SERVICE
 * ====================================
 * Business logic for chat operations
 * Fixed:
 *   1. pinMessage — double save bug removed
 *   2. editMessage — sender toString() comparison
 *   3. sendMessage — lastActivityAt fire-and-forget with catch
 */

import messageRepository from '../repositories/message.repository';
import groupRepository from '../repositories/group.repository';
import groupMemberRepository from '../repositories/groupMember.repository';
import { LoggerUtil } from '@/shared/logger.util';
import { MessageType } from '../enums/MessageType.enum';
import { AuthorizationError, BadRequestError, NotFoundError } from '@/shared/errors/app.error';
import { generateSecureId } from '@/shared/security';

/**
 * Send a message in a group
 * FIX: lastActivityAt fire-and-forget — non-blocking
 */
export const sendMessage = async (
  groupId: string,
  senderId: string,
  content: string,
  messageType: MessageType = MessageType.TEXT,
  fileUrl?: string,
  fileName?: string,
  fileSize?: number,
  replyToId?: string
): Promise<any> => {
  try {
    const group = await groupRepository.findByGroupId(groupId);
    if (!group) throw new NotFoundError('Group not found');

    const isMember = await groupMemberRepository.findActiveOne(groupId, senderId);
    if (!isMember) throw new AuthorizationError('You are not a member of this group');

    if (replyToId) {
      const replyToMessage = await messageRepository.findById(replyToId);
      if (!replyToMessage) throw new NotFoundError('Reply-to message not found');
      if (replyToMessage.groupId !== groupId) throw new BadRequestError('Cannot reply to message from different group');
    }

    const messageData: any = {
      messageId: generateSecureId(),
      groupId,
      sender: senderId,
      content,
      messageType,
      isDeleted: false,
      isEdited: false,
      readBy: [senderId],
    };

    if (fileUrl) {
      messageData.fileUrl = fileUrl;
      messageData.fileName = fileName;
      messageData.fileSize = fileSize;
    }

    if (replyToId) {
      messageData.replyTo = replyToId;
    }

    const message = await messageRepository.create(messageData);

    // FIX: fire-and-forget — message send block nahi hoga agar lastActivityAt fail ho
    groupRepository
      .updateById(groupId, { lastActivityAt: new Date() })
      .catch((err) => LoggerUtil.error('Failed to update group lastActivityAt:', err));

    const populatedMessage = await messageRepository.findRawById(message._id.toString());
    await populatedMessage?.populate('sender', 'fullName username avatar');

    LoggerUtil.info(`✅ Message sent in group ${groupId} by user ${senderId}`);
    return populatedMessage;
  } catch (error: any) {
    LoggerUtil.error('❌ Send message error:', error.message);
    throw error;
  }
};

/**
 * Get messages for a group (with pagination)
 */
export const getGroupMessages = async (
  groupId: string,
  userId: string,
  page: number = 1,
  limit: number = 50
): Promise<{
  messages: any[];
  currentPage: number;
  totalPages: number;
  totalMessages: number;
  hasMore: boolean;
}> => {
  try {
    const group = await groupRepository.findByGroupId(groupId);
    if (!group) throw new NotFoundError('Group not found');

    const isMember = await groupMemberRepository.findActiveOne(groupId, userId);
    if (!isMember) throw new AuthorizationError('You are not a member of this group');

    const dbQuery = { groupId, isDeleted: false };
    const [result, totalMessages] = await Promise.all([
      messageRepository.findMessages(dbQuery, page, limit),
      messageRepository.countMessages(dbQuery),
    ]);

    const totalPages = Math.ceil(totalMessages / limit);

    LoggerUtil.info(`✅ Retrieved ${result.length} messages for group ${groupId}`);

    return {
      messages: result.reverse(),
      currentPage: page,
      totalPages,
      totalMessages,
      hasMore: page < totalPages,
    };
  } catch (error: any) {
    LoggerUtil.error('❌ Get group messages error:', error.message);
    throw error;
  }
};

/**
 * Edit a message
 * FIX: sender.toString() comparison — ObjectId vs string mismatch removed
 */
export const editMessage = async (
  messageId: string,
  userId: string,
  newContent: string
): Promise<any> => {
  try {
    const message = await messageRepository.findRawById(messageId);
    if (!message) throw new NotFoundError('Message not found');
    if (message.isDeleted) throw new BadRequestError('Cannot edit a deleted message');

    // FIX: explicit toString on both sides
    if (message.sender.toString() !== userId.toString()) {
      throw new AuthorizationError('You can only edit your own messages');
    }

    const messageAge = Date.now() - message.createdAt.getTime();
    const fifteenMinutes = 15 * 60 * 1000;
    if (messageAge > fifteenMinutes) {
      throw new BadRequestError('Cannot edit messages older than 15 minutes');
    }

    if (message.messageType !== MessageType.TEXT) {
      throw new BadRequestError('Only text messages can be edited');
    }

    message.content = newContent;
    message.isEdited = true;
    await message.save();

    LoggerUtil.info(`✅ Message ${messageId} edited by user ${userId}`);
    return message;
  } catch (error: any) {
    LoggerUtil.error('❌ Edit message error:', error.message);
    throw error;
  }
};

/**
 * Delete a message (soft delete)
 */
export const deleteMessage = async (
  messageId: string,
  userId: string,
  isLeader: boolean = false
): Promise<void> => {
  try {
    const message = await messageRepository.findRawById(messageId);
    if (!message) throw new NotFoundError('Message not found');
    if (message.isDeleted) throw new BadRequestError('Message already deleted');

    const isOwner = message.sender.toString() === userId.toString();
    if (!isOwner && !isLeader) throw new AuthorizationError('You can only delete your own messages');

    await messageRepository.softDelete(messageId, userId);

    LoggerUtil.info(`✅ Message ${messageId} deleted by user ${userId}`);
  } catch (error: any) {
    LoggerUtil.error('❌ Delete message error:', error.message);
    throw error;
  }
};

/**
 * Mark message as read
 */
export const markMessageAsRead = async (
  messageId: string,
  userId: string
): Promise<void> => {
  try {
    const message = await messageRepository.findRawById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    await messageRepository.markAsRead(messageId, userId);
    LoggerUtil.debug(`✅ Message ${messageId} marked as read by user ${userId}`);
  } catch (error: any) {
    LoggerUtil.error('❌ Mark message as read error:', error.message);
    throw error;
  }
};

/**
 * Mark all messages in group as read
 */
export const markAllMessagesAsRead = async (
  groupId: string,
  userId: string
): Promise<number> => {
  try {
    const count = await messageRepository.markAllAsRead(groupId, userId);
    LoggerUtil.info(`✅ Marked ${count} messages as read in group ${groupId}`);
    return count;
  } catch (error: any) {
    LoggerUtil.error('❌ Mark all messages as read error:', error.message);
    throw error;
  }
};

/**
 * Get unread message count for a group
 */
export const getUnreadCount = async (
  groupId: string,
  userId: string
): Promise<number> => {
  try {
    return await messageRepository.countUnread(groupId, userId);
  } catch (error: any) {
    LoggerUtil.error('❌ Get unread count error:', error.message);
    throw error;
  }
};

/**
 * React to a message (toggle)
 */
export const reactToMessage = async (
  messageId: string,
  userId: string,
  emoji: string
): Promise<any> => {
  try {
    const message = await messageRepository.findRawById(messageId);
    if (!message) throw new NotFoundError('Message not found');
    if (message.isDeleted) throw new BadRequestError('Cannot react to a deleted message');

    const existingReaction = message.reactions.find((r: any) => r.emoji === emoji);
    const userAlreadyReacted = existingReaction?.users.some(
      (u: any) => u.toString() === userId.toString()
    );

    let updatedMessage;
    if (userAlreadyReacted) {
      updatedMessage = await messageRepository.removeReaction(messageId, userId, emoji);
    } else {
      updatedMessage = await messageRepository.addReaction(messageId, userId, emoji);
    }

    LoggerUtil.info(`🔄 Reaction ${emoji} toggled on message ${messageId} by user ${userId}`);
    return updatedMessage;
  } catch (error: any) {
    LoggerUtil.error('❌ React to message error:', error.message);
    throw error;
  }
};

/**
 * Pin/unpin a message
 * FIX: double save removed — only repository togglePin call
 */
export const pinMessage = async (
  messageId: string,
  groupId: string,
  userId: string
): Promise<any> => {
  try {
    const group = await groupRepository.findByGroupId(groupId);
    if (!group) throw new NotFoundError('Group not found');

    if (group.leaderId !== userId) {
      throw new AuthorizationError('Only group leader can pin messages');
    }

    const message = await messageRepository.findRawById(messageId);
    if (!message) throw new NotFoundError('Message not found');

    if (message.groupId.toString() !== groupId) {
      throw new BadRequestError('Message does not belong to this group');
    }

    if (message.isDeleted) throw new BadRequestError('Cannot pin a deleted message');

    // Max 5 pinned messages per group
    const pinnedCount = await messageRepository.countPinnedMessages(groupId);
    if (pinnedCount >= 5 && !message.isPinned) {
      throw new BadRequestError('Maximum 5 messages can be pinned per group');
    }

    // FIX: single repository call — no manual message.save() before this
    const updatedMessage = await messageRepository.togglePin(messageId);

    LoggerUtil.info(`📌 Pin toggled on message ${messageId} in group ${groupId}`);
    return updatedMessage;
  } catch (error: any) {
    LoggerUtil.error('❌ Pin message error:', error.message);
    throw error;
  }
};

/**
 * Get pinned messages for a group
 */
export const getPinnedMessages = async (
  groupId: string,
  userId: string
): Promise<any[]> => {
  try {
    const isMember = await groupMemberRepository.findActiveOne(groupId, userId);
    if (!isMember) throw new AuthorizationError('You are not a member of this group');

    const pinnedMessages = await messageRepository.findPinnedMessages(groupId);
    LoggerUtil.info(`✅ Retrieved ${pinnedMessages.length} pinned messages for group ${groupId}`);
    return pinnedMessages;
  } catch (error: any) {
    LoggerUtil.error('❌ Get pinned messages error:', error.message);
    throw error;
  }
};

/**
 * Search messages in a group
 */
export const searchMessages = async (
  groupId: string,
  userId: string,
  searchTerm: string,
  page: number = 1,
  limit: number = 20
): Promise<{
  messages: any[];
  currentPage: number;
  totalPages: number;
  totalResults: number;
}> => {
  try {
    const isMember = await groupMemberRepository.findActiveOne(groupId, userId);
    if (!isMember) throw new AuthorizationError('You are not a member of this group');

    const searchQuery: any = {
      groupId,
      isDeleted: false,
      content: { $regex: searchTerm, $options: 'i' },
    };

    const [messages, totalResults] = await Promise.all([
      messageRepository.searchMessages(groupId, searchQuery, page, limit),
      messageRepository.countMessages(searchQuery),
    ]);

    const totalPages = Math.ceil(totalResults / limit);

    LoggerUtil.info(`✅ Found ${messages.length} messages matching "${searchTerm}" in group ${groupId}`);

    return { messages, currentPage: page, totalPages, totalResults };
  } catch (error: any) {
    LoggerUtil.error('❌ Search messages error:', error.message);
    throw error;
  }
};

/**
 * Get message statistics for a group
 */
export const getMessageStats = async (
  groupId: string
): Promise<{
  totalMessages: number;
  textMessages: number;
  imageMessages: number;
  fileMessages: number;
  deletedMessages: number;
  pinnedMessages: number;
  todayMessages: number;
}> => {
  try {
    return await messageRepository.getGroupMessageStats(groupId);
  } catch (error: any) {
    LoggerUtil.error('❌ Get message stats error:', error.message);
    throw error;
  }
};

/**
 * Get group info for message context
 */
export const getGroupForMessage = async (groupId: string) => {
  return await groupRepository.findByGroupId(groupId);
};

export default {
  sendMessage,
  getGroupMessages,
  editMessage,
  deleteMessage,
  markMessageAsRead,
  markAllMessagesAsRead,
  getUnreadCount,
  reactToMessage,
  pinMessage,
  getPinnedMessages,
  searchMessages,
  getMessageStats,
  getGroupForMessage,
};