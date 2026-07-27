/**
 * ====================================
 * NOTIFICATION INTERFACE
 * ====================================
 */

import { Document, Types } from 'mongoose';
import { NotificationType } from '../enums/NotificationType.enum';

export interface INotification extends Document {
  _id: Types.ObjectId;
  notificationId: string;
  type: NotificationType;
  recipient: string;
  sender: string | null;
  title: string;
  message: string;
  data: Record<string, any>;
  link: string | null;
  isRead: boolean;
  readAt: Date | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  expiresAt: Date | null;
  metadata: {
    groupId?: string | null;
    taskId?: string | null;
    doubtId?: string | null;
    messageId?: string | null;
  };
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  markAsRead(): Promise<INotification>;
  isExpired(): boolean;
}

export default INotification;