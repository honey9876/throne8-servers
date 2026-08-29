/**
 * ====================================
 * MESSAGE TYPES
 * ====================================
 * Type definitions for messages
 */

import { Types } from 'mongoose';

export type MessageTypeEnum = 'text' | 'image' | 'file' | 'voice' | 'video' | 'system';

export interface SendMessageDTO {
  groupId: string;
  content: string;
  messageType?: MessageTypeEnum;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  replyTo?: string;
}

export interface EditMessageDTO {
  content: string;
}

export interface MessageQueryParams {
  page?: number;
  limit?: number;
  before?: string; // Message ID to fetch messages before
  after?: string; // Message ID to fetch messages after
}

export interface MessageReaction {
  emoji: string;
  users: Types.ObjectId[];
}

export interface MessageEditHistory {
  content: string;
  editedAt: Date;
}

export interface ReactToMessageDTO {
  emoji: string;
}

export interface PinMessageDTO {
  messageId: string;
}