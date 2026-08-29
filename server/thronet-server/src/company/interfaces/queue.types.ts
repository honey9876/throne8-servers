// ============================================
// Queue Job Types & Payloads - ESLint Fixed
// ============================================

import { PostType } from './post.types';

// =====================================================
// EMAIL QUEUE TYPES
// =====================================================
export enum EmailJobType {
  WELCOME = 'welcome',
  VERIFICATION = 'verification',
  PASSWORD_RESET = 'password-reset',
  EVENT_CREATED = 'event-created',
  EVENT_REMINDER = 'event-reminder',
  REGISTRATION_CONFIRMATION = 'registration-confirmation',
  EVENT_CANCELLATION = 'event-cancellation',
  EVENT_FEEDBACK = 'event-feedback',
  COMPANY_VERIFIED = 'company-verified',
  POST_PUBLISHED = 'post-published',
  CUSTOM = 'custom',
}

export interface EmailJobData {
  type: EmailJobType;
  to: string | string[];
  subject: string;
  template: string;
  data: Record<string, unknown>;
  priority?: number;
  delay?: number;
  attempts?: number;
}

// =====================================================
// NOTIFICATION QUEUE TYPES
// =====================================================
export enum NotificationType {
  POST_LIKE = 'post-like',
  POST_COMMENT = 'post-comment',
  POST_SHARE = 'post-share',
  COMPANY_FOLLOW = 'company-follow',
  EVENT_REMINDER = 'event-reminder',
  JOB_APPLICATION = 'job-application',
  COMPANY_MENTION = 'company-mention',
  SYSTEM_ALERT = 'system-alert',
}

export interface NotificationJobData {
  type: NotificationType;
  userId: string;
  companyId?: string;
  postId?: string;
  eventId?: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  channels: ('push' | 'email' | 'sms')[];
  priority?: number;
}

// =====================================================
// ANALYTICS QUEUE TYPES
// =====================================================
export enum AnalyticsEventType {
  PAGE_VIEW = 'page-view',
  POST_VIEW = 'post-view',
  POST_ENGAGEMENT = 'post-engagement',
  COMPANY_PROFILE_VIEW = 'company-profile-view',
  SEARCH_QUERY = 'search-query',
  EVENT_REGISTRATION = 'event-registration',
  JOB_APPLICATION = 'job-application',
  CUSTOM_EVENT = 'custom-event',
}

export interface AnalyticsJobData {
  eventType: AnalyticsEventType;
  companyId?: string;
  postId?: string;
  userId?: string;
  eventId?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// =====================================================
// MEDIA QUEUE TYPES
// =====================================================
export enum MediaJobType {
  IMAGE_UPLOAD = 'image-upload',
  VIDEO_UPLOAD = 'video-upload',
  IMAGE_OPTIMIZATION = 'image-optimization',
  VIDEO_TRANSCODING = 'video-transcoding',
  THUMBNAIL_GENERATION = 'thumbnail-generation',
  MEDIA_DELETE = 'media-delete',
  WATERMARK = 'watermark',
}

export interface MediaJobData {
  type: MediaJobType;
  fileUrl?: string;
  fileBuffer?: string; // Base64 encoded
  filename: string;
  mimeType: string;
  size: number;
  companyId: string;
  postId?: string;
  options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
    watermark?: boolean;
  };
}

// =====================================================
// POST QUEUE TYPES
// =====================================================
export enum PostJobType {
  PUBLISH_POST = 'publish-post',
  SCHEDULE_POST = 'schedule-post',
  UPDATE_ENGAGEMENT = 'update-engagement',
  GENERATE_PREVIEW = 'generate-preview',
  SYNC_TO_SOCIAL = 'sync-to-social',
  INDEX_SEARCH = 'index-search',
}

export interface PostJobData {
  type: PostJobType;
  postId: string;
  companyId: string;
  action?: 'publish' | 'update' | 'delete';
  scheduledFor?: Date;
  metadata?: {
    postType: PostType;
    hasMedia: boolean;
    tagsCount: number;
  };
}

// =====================================================
// QUEUE JOB OPTIONS
// =====================================================
export interface QueueJobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  timeout?: number;
  jobId?: string;
}

// =====================================================
// QUEUE STATS
// =====================================================
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

// =====================================================
// JOB RESULT TYPES
// =====================================================
export interface EmailJobResult {
  success: boolean;
  messageId?: string;
  error?: string;
  sentAt?: Date;
}

export interface NotificationJobResult {
  success: boolean;
  notificationId?: string;
  channels: {
    push?: boolean;
    email?: boolean;
    sms?: boolean;
  };
  error?: string;
}

export interface AnalyticsJobResult {
  success: boolean;
  eventId?: string;
  processed: boolean;
  error?: string;
}

export interface MediaJobResult {
  success: boolean;
  url?: string;
  thumbnailUrl?: string;
  metadata?: {
    width?: number;
    height?: number;
    size: number;
    format: string;
  };
  error?: string;
}

export interface PostJobResult {
  success: boolean;
  postId?: string;
  action: 'published' | 'scheduled' | 'updated' | 'deleted';
  error?: string;
}