// src/types/api.types.ts

/**
 * API TYPES - REQUEST & RESPONSE DEFINITIONS
 * ===========================================
 * All API endpoint type definitions
 */

import { PaginationParams, SortOrder } from './common.types';

// ============================================================================
// HTTP METHOD TYPES
// ============================================================================

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ContentType = 
  | 'application/json' 
  | 'application/x-www-form-urlencoded' 
  | 'multipart/form-data'
  | 'text/plain';

// ============================================================================
// REQUEST BASE TYPES
// ============================================================================

export interface BaseRequest {
  headers?: Record<string, string>;
  query?: Record<string, any>;
  params?: Record<string, string>;
  body?: any;
}

export interface AuthenticatedRequest extends BaseRequest {
  userId: string;
  userRole?: string;
  token?: string;
}

// ============================================================================
// RESPONSE BASE TYPES
// ============================================================================


export interface BaseResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface PaginatedApiResponse<T = any> extends BaseResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================================================
// CONNECTION API TYPES
// ============================================================================

export interface CreateConnectionRequest {
  targetUserId: string;
  message?: string;
  tags?: string[];
}

export interface UpdateConnectionRequest {
  status?: 'active' | 'inactive' | 'blocked';
  tags?: string[];
  note?: string;
}

export interface RemoveConnectionRequest {
  reason?: string;
  blockUser?: boolean;
}

export interface ConnectionQueryParams extends PaginationParams {
  status?: string;
  tags?: string[];
  sortBy?: 'createdAt' | 'name' | 'company';
  sortOrder?: SortOrder;
  search?: string;
}

// ============================================================================
// REQUEST API TYPES
// ============================================================================

export interface SendConnectionRequestBody {
  receiverId: string;
  message?: string;
  tags?: string[];
}

export interface RespondToRequestBody {
  action: 'accept' | 'decline';
  message?: string;
}

export interface CancelRequestBody {
  reason?: string;
}

export interface RequestQueryParams extends PaginationParams {
  status?: 'pending' | 'accepted' | 'declined';
  type?: 'sent' | 'received';
  sortBy?: 'createdAt' | 'updatedAt';
  sortOrder?: SortOrder;
}

// ============================================================================
// SEARCH API TYPES
// ============================================================================

export interface SearchUsersRequest {
  query: string;
  filters?: {
    location?: string;
    industry?: string;
    company?: string;
    skills?: string[];
    degree?: number;
  };
  pagination?: PaginationParams;
  sortBy?: 'relevance' | 'connections' | 'recent';
}

export interface SearchConnectionsRequest {
  query: string;
  filters?: {
    tags?: string[];
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
  };
  pagination?: PaginationParams;
}

export interface SaveSearchRequest {
  name: string;
  query: string;
  filters?: Record<string, any>;
  notificationEnabled?: boolean;
}

// ============================================================================
// FOLLOW API TYPES
// ============================================================================

export interface FollowUserRequest {
  followingId: string;
  notificationEnabled?: boolean;
}

export interface UnfollowUserRequest {
  followingId: string;
}

export interface BulkFollowRequest {
  userIds: string[];
}

export interface FollowQueryParams extends PaginationParams {
  status?: 'active' | 'pending';
  sortBy?: 'createdAt' | 'name';
  sortOrder?: SortOrder;
}

// ============================================================================
// PROFILE VIEW API TYPES
// ============================================================================

export interface RecordProfileViewRequest {
  viewedUserId: string;
  source?: 'search' | 'recommendations' | 'profile' | 'post';
  duration?: number;
}

export interface ProfileViewQueryParams extends PaginationParams {
  period?: 'day' | 'week' | 'month' | 'year';
  unique?: boolean;
}

export interface ProfileViewersQueryParams extends PaginationParams {
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'recent' | 'frequency';
}

// ============================================================================
// BLOCK API TYPES
// ============================================================================

export interface BlockUserRequest {
  blockedUserId: string;
  reason?: string;
}

export interface UnblockUserRequest {
  blockedUserId: string;
}

export interface BlockQueryParams extends PaginationParams {
  sortBy?: 'createdAt' | 'name';
  sortOrder?: SortOrder;
}

// ============================================================================
// PRIVACY API TYPES
// ============================================================================

export interface UpdatePrivacySettingsRequest {
  profileVisibility?: 'public' | 'connections' | 'private';
  showEmail?: boolean;
  showPhone?: boolean;
  allowConnectionRequests?: boolean;
  allowFollows?: boolean;
  showConnections?: boolean;
  allowProfileViews?: boolean;
  showNetworkSize?: boolean;
}

export interface PrivacySettingsResponse {
  profileVisibility: string;
  showEmail: boolean;
  showPhone: boolean;
  allowConnectionRequests: boolean;
  allowFollows: boolean;
  showConnections: boolean;
  allowProfileViews: boolean;
  showNetworkSize: boolean;
  updatedAt: Date;
}

// ============================================================================
// NETWORK API TYPES
// ============================================================================

export interface NetworkOverviewRequest {
  includeMetrics?: boolean;
  includeRecommendations?: boolean;
}

export interface NetworkGrowthRequest {
  period: 'day' | 'week' | 'month' | 'quarter' | 'year';
  startDate?: Date;
  endDate?: Date;
}

export interface NetworkCompositionRequest {
  type?: 'industry' | 'location' | 'company' | 'all';
}

export interface NetworkHealthRequest {
  includeDetails?: boolean;
}

export interface NetworkGapsRequest {
  analysisType?: 'industry' | 'location' | 'skills';
  limit?: number;
}

// ============================================================================
// DEGREE API TYPES
// ============================================================================

export interface CalculateDegreeRequest {
  targetUserId: string;
  maxDepth?: number;
  includeDetails?: boolean;
}

export interface FindPathRequest {
  targetUserId: string;
  algorithm?: 'shortest' | 'strongest' | 'multiple';
  maxPaths?: number;
}

export interface DegreeSeparationQueryParams {
  degree: 1 | 2 | 3 | 4;
  filters?: {
    location?: string;
    industry?: string;
    company?: string;
  };
  pagination?: PaginationParams;
}

// ============================================================================
// MUTUAL API TYPES
// ============================================================================

export interface MutualConnectionsRequest {
  userId: string;
  limit?: number;
  offset?: number;
  sortBy?: 'strength' | 'mutualCount' | 'recent';
}

export interface MutualFollowersRequest {
  userId: string;
  limit?: number;
}

export interface MutualNetworkRequest {
  userId: string;
  includeMetrics?: boolean;
}

// ============================================================================
// NOTE API TYPES
// ============================================================================

export interface CreateNoteRequest {
  connectionId: string;
  content: string;
  tags?: string[];
  isPinned?: boolean;
}

export interface UpdateNoteRequest {
  content?: string;
  tags?: string[];
  isPinned?: boolean;
}

export interface NoteQueryParams extends PaginationParams {
  connectionId?: string;
  tags?: string[];
  isPinned?: boolean;
  sortBy?: 'createdAt' | 'updatedAt';
  sortOrder?: SortOrder;
}

// ============================================================================
// ANALYTICS API TYPES
// ============================================================================

export interface AnalyticsRequest {
  period: 'day' | 'week' | 'month' | 'quarter' | 'year';
  startDate?: Date;
  endDate?: Date;
  metrics?: string[];
}

export interface ExportDataRequest {
  type: 'connections' | 'requests' | 'network' | 'all';
  format: 'json' | 'csv' | 'excel';
  dateFrom?: Date;
  dateTo?: Date;
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

export interface BatchOperationRequest<T = any> {
  operations: T[];
  continueOnError?: boolean;
}

export interface BatchOperationResponse<T = any> {
  successful: T[];
  failed: Array<{
    item: T;
    error: string;
    index: number;
  }>;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
}

// ============================================================================
// HEALTH & STATUS
// ============================================================================

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  uptime: number;
  services: {
    mongodb: boolean;
    redis: boolean;
    neo4j: boolean;
  };
  metrics?: {
    cpu: number;
    memory: number;
    connections: number;
  };
}

// ============================================================================
// ERROR RESPONSES
// ============================================================================

export interface ValidationErrorResponse {
  success: false;
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: Array<{
      field: string;
      message: string;
      value?: any;
    }>;
  };
}

export interface AuthErrorResponse {
  success: false;
  error: {
    code: 'AUTHENTICATION_ERROR' | 'AUTHORIZATION_ERROR';
    message: string;
  };
}

export interface RateLimitErrorResponse {
  success: false;
  error: {
    code: 'RATE_LIMIT_EXCEEDED';
    message: string;
    retryAfter: number;
  };
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ApiRequest = 
  | CreateConnectionRequest
  | UpdateConnectionRequest
  | SendConnectionRequestBody
  | SearchUsersRequest
  | FollowUserRequest
  | RecordProfileViewRequest
  | BlockUserRequest
  | UpdatePrivacySettingsRequest
  | NetworkOverviewRequest
  | CalculateDegreeRequest
  | MutualConnectionsRequest
  | CreateNoteRequest
  | AnalyticsRequest;

export type ApiErrorResponse = 
  | ValidationErrorResponse
  | AuthErrorResponse
  | RateLimitErrorResponse;