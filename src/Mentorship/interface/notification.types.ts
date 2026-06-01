// src/types/notification.types.ts

export enum NotificationType {
  SESSION_BOOKED = 'session_booked',
  SESSION_CONFIRMED = 'session_confirmed',
  SESSION_CANCELLED = 'session_cancelled',
  SESSION_RESCHEDULED = 'session_rescheduled',
  SESSION_REMINDER = 'session_reminder',
  SESSION_COMPLETED = 'session_completed',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  REFUND_PROCESSED = 'refund_processed',
  REVIEW_RECEIVED = 'review_received',
  PACKAGE_PURCHASED = 'package_purchased',
  PACKAGE_EXPIRING = 'package_expiring',
  WAITLIST_AVAILABLE = 'waitlist_available',
  MENTOR_APPROVED = 'mentor_approved',
  MENTOR_REJECTED = 'mentor_rejected',
  SYSTEM_UPDATE = 'system_update',
}

export enum NotificationCategory {
  BOOKING = 'booking',
  PAYMENT = 'payment',
  REVIEW = 'review',
  PACKAGE = 'package',
  WAITLIST = 'waitlist',
  SYSTEM = 'system',
  REMINDER = 'reminder',
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export interface NotificationChannels {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
}

export interface NotificationData {
  userId: string;
  type: string;
  category: string;
  title: string;
  message: string;
  priority: string;
  channels: NotificationChannels;
  data?: Record<string, any>;
  actionUrl?: string;
  expiresAt?: Date;
}

export interface NotificationPreferences {
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  sessionReminders: boolean;
  paymentUpdates: boolean;
  reviewNotifications: boolean;
  packageUpdates: boolean;
  systemUpdates: boolean;
}