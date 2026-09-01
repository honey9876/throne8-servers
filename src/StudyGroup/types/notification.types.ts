/**
 * ====================================
 * NOTIFICATION TYPES
 * ====================================
 */

import { Types } from 'mongoose';
import { NotificationType } from '../enums/NotificationType.enum';

/**
 * Create Notification DTO
 */
export interface CreateNotificationDTO {
  type: NotificationType;
  recipient: string;
  sender?: string | null;
  title: string;
  message: string;
  data?: Record<string, any>;
  link?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  expiresAt?: Date | null;
  metadata?: {
    groupId?: string | null;
    taskId?: string | null;
    doubtId?: string | null;
    messageId?: string | null;
  };
}

/**
 * Bulk Notification DTO
 */
export interface BulkNotificationDTO {
  type: NotificationType;
  recipients: (string)[];
  sender?: string | null;
  title: string;
  message: string;
  data?: Record<string, any>;
  link?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

/**
 * Notification Preferences
 */
export interface NotificationPreferences {
  push: boolean;
  email: boolean;
  sms: boolean;
  types: {
    groupInvite: boolean;
    memberJoined: boolean;
    memberLeft: boolean;
    newMessage: boolean;
    messageMention: boolean;
    taskReminder: boolean;
    taskDeadline: boolean;
    goalReminder: boolean;
    goalAchieved: boolean;
    streakReminder: boolean;
    streakMilestone: boolean;
    doubtAnswered: boolean;
    answerUpvoted: boolean;
    systemUpdate: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string; // "08:00"
  };
}

/**
 * Notification Response
 */
export interface NotificationResponse {
  _id: string;
  type: NotificationType;
  recipient: string;
  sender: {
    _id: string;
    name: string;
    avatar: string | null;
    username: string;
  } | null;
  title: string;
  message: string;
  data: Record<string, any>;
  link: string | null;
  isRead: boolean;
  readAt: Date | null;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Notification List Response
 */
export interface NotificationListResponse {
  notifications: NotificationResponse[];
  unreadCount: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Notification Count Response
 */
export interface NotificationCountResponse {
  unreadCount: number;
  totalCount: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
}

/**
 * Update Preferences Request
 */
export interface UpdatePreferencesRequest {
  push?: boolean;
  email?: boolean;
  sms?: boolean;
  types?: Partial<NotificationPreferences['types']>;
  quietHours?: Partial<NotificationPreferences['quietHours']>;
}

/**
 * Email Notification Payload
 */
export interface EmailNotificationPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Push Notification Payload
 */
export interface PushNotificationPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  link?: string;
}