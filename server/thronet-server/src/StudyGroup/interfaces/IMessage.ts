/**
 * ====================================
 * MESSAGE INTERFACE
 * ====================================
 * Interface for Message model
 */

import { Document, Types } from 'mongoose';

export interface IMessage extends Document {
  _id: Types.ObjectId;
  groupId: string;
  messageId: string;  // _id ke baad add karo
  sender: string;
  content: string;
  messageType: 'text' | 'image' | 'file' | 'voice' | 'video' | 'system';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  replyTo?: string;
  reactions: {
    emoji: string;
    users: string[];
  }[];
  isPinned: boolean;
  isEdited: boolean;
  editHistory: {
    content: string;
    editedAt: Date;
  }[];
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  readBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessagePopulated extends Omit<IMessage, 'sender' | 'groupId' | 'replyTo'> {
  sender: {
    _id: Types.ObjectId;
    fullName: string;
    username: string;
    avatar?: string;
  };
  groupId: {
    _id: string;
    title: string;
  };
  replyTo?: {
    _id: Types.ObjectId;
    content: string;
    sender: {
      _id: Types.ObjectId;
      fullName: string;
      username: string;
    };
  };
}