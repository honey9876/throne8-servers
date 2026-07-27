// src/types/request.types.ts

/**
 * REQUEST TYPES - CONNECTION REQUEST MANAGEMENT
 * ==============================================
 * Type definitions for connection request operations
 */

import { Document, Types } from 'mongoose';
import { PaginationParams } from './common.types';

// ============================================================================
// REQUEST ENUMS
// ============================================================================


export enum RequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  WITHDRAWN = 'withdrawn',
}


export enum RequestType {
  DIRECT = 'direct',
  MUTUAL_INTRODUCTION = 'mutual_introduction',
  EVENT_BASED = 'event_based',
  RECOMMENDATION = 'recommendation',
  FOLLOW_UP = 'follow_up',
}

export enum RequestPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum RequestSource {
  SEARCH = 'search',
  PROFILE_VIEW = 'profile_view',
  RECOMMENDATION = 'recommendation',
  MUTUAL_CONNECTION = 'mutual_connection',
  EVENT = 'event',
  IMPORT = 'import',
  API = 'api',
}

// ============================================================================
// CORE REQUEST INTERFACE
// ============================================================================

export interface IConnectionRequest extends Document {
  _id: Types.ObjectId;
  senderId: string;
  receiverId: string;
  status: RequestStatus;
  type: RequestType;
  priority: RequestPriority;
  source: RequestSource;
  message?: string;
  tags: string[];
  metadata: {
    mutualConnections: number;
    profileViews: number;
    previousRequests: number;
    referredBy?: string;
    eventId?: string;
    campaignId?: string;
  };
  expiresAt?: Date;
  respondedAt?: Date;
  declineReason?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;

  // Instance methods
  accept(): Promise<void>;
  decline(reason?: string): Promise<void>;
  cancel(): Promise<void>;
  withdraw(): Promise<void>;
  isExpired(): boolean;
}

// ============================================================================
// REQUEST DATA TRANSFER OBJECTS
// ============================================================================

export interface RequestDTO {
  id: string;
  senderId: string;
  receiverId: string;
  status: RequestStatus;
  type: RequestType;
  message?: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface RequestDetailsDTO extends RequestDTO {
  priority: RequestPriority;
  source: RequestSource;
  tags: string[];
  metadata: IConnectionRequest['metadata'];
  respondedAt?: Date;
  senderDetails?: {
    name: string;
    avatar?: string;
    headline?: string;
    company?: string;
    location?: string;
    mutualConnections: number;
  };
  receiverDetails?: {
    name: string;
    avatar?: string;
    headline?: string;
  };
}

// ============================================================================
// REQUEST CREATION & UPDATES
// ============================================================================

export interface CreateRequestData {
  receiverId: string;
  message?: string;
  type?: RequestType;
  priority?: RequestPriority;
  source?: RequestSource;
  tags?: string[];
  expiresAt?: Date;
  metadata?: {
    referredBy?: string;
    eventId?: string;
    campaignId?: string;
  };

}

export interface UpdateRequestData {
  message?: string;
  priority?: RequestPriority;
  tags?: string[];
  expiresAt?: Date;
}


export interface RespondToRequestData {
  action: 'accept' | 'decline';
  message?: string;
  declineReason?: string;
}

// ============================================================================
// REQUEST QUERY PARAMETERS
// ============================================================================


export interface RequestQueryParams extends PaginationParams {
  status?: RequestStatus | RequestStatus[];
  type?: RequestType | RequestType[];
  direction?: 'sent' | 'received' | 'all';
  priority?: RequestPriority | RequestPriority[];
  source?: RequestSource | RequestSource[];
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'createdAt' | 'priority' | 'expiresAt';
  sortOrder?: 'asc' | 'desc';
  includeExpired?: boolean;
  includeSenderDetails?: boolean;
  includeReceiverDetails?: boolean;
}

// ============================================================================
// REQUEST STATISTICS
// ============================================================================

export interface RequestStats {
  totalRequests: number;
  pendingRequests: number;
  acceptedRequests: number;
  declinedRequests: number;
  cancelledRequests: number;
  expiredRequests: number;
  byType: Record<RequestType, number>;
  bySource: Record<RequestSource, number>;
  byPriority: Record<RequestPriority, number>;
  acceptanceRate: number;
  averageResponseTime: number;
  sentRequests: {
    total: number;
    pending: number;
    accepted: number;
    declined: number;
  };
  receivedRequests: {
    total: number;
    pending: number;
    accepted: number;
    declined: number;
  };
}

export interface RequestMetrics {
  userId: string;
  stats: RequestStats;
  trends: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  performance: {
    successRate: number;
    averageResponseTime: number;
    topSources: Array<{
      source: RequestSource;
      count: number;
      successRate: number;
    }>;
  };
  calculatedAt: Date;
}

// ============================================================================
// REQUEST BULK OPERATIONS
// ============================================================================

export interface BulkSendRequestData {
  receiverIds: string[];
  message?: string;
  type?: RequestType;
  priority?: RequestPriority;
  source?: RequestSource;
  tags?: string[];
}

export interface BulkRespondData {
  requestIds: string[];
  action: 'accept' | 'decline';
  reason?: string;
}

export interface BulkCancelData {
  requestIds: string[];
  reason?: string;
}

export interface BulkRequestResult {
  successful: string[];
  failed: Array<{
    requestId?: string;
    receiverId?: string;
    error: string;
  }>;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
}

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

export interface RequestValidationResult {
  canSendRequest: boolean;
  reasons: string[];
  warnings?: string[];
  suggestions?: string[];
  rateLimitInfo?: {
    limit: number;
    remaining: number;
    resetAt: Date;
  };
}

export interface RequestLimits {
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  pendingLimit: number;
  perUserLimit: number;
}

// ============================================================================
// REQUEST NOTIFICATIONS
// ============================================================================

export interface RequestNotification {
  type: 'request_received' | 'request_accepted' | 'request_declined' | 'request_expired' | 'request_reminder';
  requestId: string;
  userId: string;
  message: string;
  data?: Record<string, any>;
  createdAt: Date;
}

export interface RequestReminder {
  requestId: string;
  senderId: string;
  receiverId: string;
  reminderType: 'pending' | 'expiring_soon';
  scheduledFor: Date;
  sent: boolean;
}

// ============================================================================
// REQUEST ANALYTICS
// ============================================================================

export interface RequestAnalytics {
  userId: string;
  period: {
    start: Date;
    end: Date;
  };
  sent: {
    total: number;
    accepted: number;
    declined: number;
    pending: number;
    successRate: number;
  };
  received: {
    total: number;
    accepted: number;
    declined: number;
    pending: number;
    responseRate: number;
  };
  trends: Array<{
    date: Date;
    sent: number;
    received: number;
    accepted: number;
    declined: number;
  }>;
  insights: string[];
  recommendations: string[];
}

// ============================================================================
// REQUEST TEMPLATES
// ============================================================================

export interface RequestTemplate {
  id: string;
  userId: string;
  name: string;
  message: string;
  tags: string[];
  type?: RequestType;
  priority?: RequestPriority;
  useCount: number;
  successRate: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateData {
  name: string;
  message: string;
  tags?: string[];
  type?: RequestType;
  priority?: RequestPriority;
}

// ============================================================================
// REQUEST FILTERS & SEARCH
// ============================================================================

export interface RequestSearchParams {
  query: string;
  filters?: {
    status?: RequestStatus[];
    type?: RequestType[];
    direction?: 'sent' | 'received';
    priority?: RequestPriority[];
    source?: RequestSource[];
    tags?: string[];
    dateFrom?: Date;
    dateTo?: Date;
  };
  pagination?: PaginationParams;
  sortBy?: 'relevance' | 'recent' | 'priority';
}

export interface RequestSearchResult {
  requests: RequestDetailsDTO[];
  total: number;
  facets?: {
    statuses: Record<RequestStatus, number>;
    types: Record<RequestType, number>;
    sources: Record<RequestSource, number>;
    priorities: Record<RequestPriority, number>;
  };
}

// ============================================================================
// REQUEST HISTORY
// ============================================================================

export interface RequestHistory {
  requestId: string;
  events: Array<{
    type: 'created' | 'updated' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'reminder_sent';
    timestamp: Date;
    actor?: string;
    description: string;
    metadata?: Record<string, any>;
  }>;
}

// ============================================================================
// REQUEST RECOMMENDATIONS
// ============================================================================

export interface RequestRecommendation {
  userId: string;
  reason: 'mutual_connections' | 'profile_match' | 'similar_interests' | 'trending' | 'location_based';
  score: number;
  mutualConnections: number;
  userDetails: {
    name: string;
    headline?: string;
    avatar?: string;
    company?: string;
    location?: string;
  };
  suggestedMessage?: string;
}

// ============================================================================
// REQUEST SETTINGS
// ============================================================================

export interface RequestSettings {
  userId: string;
  autoAccept: {
    enabled: boolean;
    conditions?: {
      mutualConnectionsMin?: number;
      fromVerifiedUsers?: boolean;
      fromCompanies?: string[];
    };
  };
  autoDecline: {
    enabled: boolean;
    conditions?: {
      noMessage?: boolean;
      lowProfileComplete?: boolean;
      blockedDomains?: string[];
    };
  };
  notifications: {
    newRequest: boolean;
    requestAccepted: boolean;
    requestDeclined: boolean;
    requestExpiring: boolean;
  };
  privacy: {
    allowRequests: boolean;
    requireMutualConnections: boolean;
    restrictedUsers: string[];
  };
  limits: RequestLimits;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isConnectionRequest(obj: any): obj is IConnectionRequest {
  return obj && obj.senderId && obj.receiverId && obj.status;
}

export function isValidRequestStatus(status: any): status is RequestStatus {
  return Object.values(RequestStatus).includes(status);
}

export function isPendingRequest(request: IConnectionRequest): boolean {
  return request.status === RequestStatus.PENDING && !request.isExpired();
}

export function canRespond(request: IConnectionRequest, userId: string): boolean {
  return (
    request.receiverId === userId &&
    request.status === RequestStatus.PENDING &&
    !request.isExpired()
  );
}