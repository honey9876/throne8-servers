// src/types/common.types.ts

/**
 * COMMON TYPES - SHARED ACROSS CONNECTION SERVICE
 * ================================================
 * Reusable type definitions for common patterns
 */

import { ObjectId } from 'mongodb';


// ===========================================================================
// BASIC TYPES
// ===========================================================================


export type ID = string | ObjectId;
export type Timestamp = Date | string | number;
export type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];


// ============================================================================
// STATUS ENUMS
// ============================================================================

export enum Status { 
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
  BLOCKED = 'blocked',

}

export enum RequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum PrivacyLevel {
  PUBLIC = 'public',
  CONNECTIONS = 'connections',
  PRIVATE = 'private',
  CUSTOM = 'custom',
}

// ============================================================================
// PAGINATION
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor?: string;
  prevCursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
  meta?: Record<string, any>;
}

// ============================================================================
// SORTING & FILTERING
// ============================================================================

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
  ASCENDING = 'ascending',
  DESCENDING = 'descending',
}

export interface SortParams {
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface FilterParams {
  [key: string]: any;
  search?: string;
  status?: Status[];
  dateFrom?: Date;
  dateTo?: Date;
}

export interface QueryParams extends PaginationParams, SortParams, FilterParams {}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
  statusCode?: number;
}

export interface ResponseMeta {
  timestamp: Date;
  requestId?: string;
  version?: string;
  processingTime?: number;
  cached?: boolean;
  [key: string]: any;
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
  meta?: ResponseMeta;
}

export interface ErrorResponse {
  success: false;
  error: ApiError;
  message: string;
  meta?: ResponseMeta;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

// ============================================================================
// DATE & TIME
// ============================================================================

export interface DateRange {
  start: Date;
  end: Date;
}

export interface TimeFrame {
  from: Date;
  to: Date;
  duration?: number;
}

export enum TimePeriod {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}

// ============================================================================
// LOCATION & GEOGRAPHY
// ============================================================================

export interface Location {
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  timezone?: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// ============================================================================
// METADATA & TRACKING
// ============================================================================

export interface BaseMetadata {
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
  version?: number;
}

export interface AuditMetadata extends BaseMetadata {
  deletedAt?: Date;
  deletedBy?: string;
  isDeleted?: boolean;
}

export interface TrackingInfo {
  ipAddress?: string;
  userAgent?: string;
  device?: string;
  platform?: string;
  browser?: string;
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

export interface BulkOperationResult<T = any> {
  success: boolean;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  results: T[];
  errors: BulkOperationError[];
  processingTime?: number;
}

export interface BulkOperationError {
  index: number;
  item: any;
  error: string;
  code?: string;
}

// ============================================================================
// FILE & MEDIA
// ============================================================================

export interface FileInfo {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path?: string;
  url?: string;
}

export interface MediaAsset extends FileInfo {
  type: 'image' | 'video' | 'audio' | 'document';
  thumbnail?: string;
  duration?: number;
  dimensions?: {
    width: number;
    height: number;
  };
}

// ============================================================================
// NOTIFICATION & ALERTS
// ============================================================================

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  data?: Record<string, any>;
}

export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

// ============================================================================
// SEARCH & DISCOVERY
// ============================================================================

export interface SearchParams {
  query: string;
  filters?: FilterParams;
  pagination?: PaginationParams;
  sort?: SortParams;
}

export interface SearchResult<T = any> {
  items: T[];
  total: number;
  query: string;
  took?: number;
  aggregations?: Record<string, any>;
}

// ============================================================================
// ACTIVITY & ENGAGEMENT
// ============================================================================

export interface Activity {
  id: string;
  userId: string;
  type: string;
  action: string;
  target?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface EngagementMetrics {
  views: number;
  clicks: number;
  likes?: number;
  shares?: number;
  comments?: number;
  engagementRate?: number;
}

// ============================================================================
// STATISTICS & ANALYTICS
// ============================================================================

export interface Statistics {
  count: number;
  average?: number;
  median?: number;
  min?: number;
  max?: number;
  sum?: number;
}

export interface TrendData {
  period: string;
  value: number;
  change?: number;
  changePercentage?: number;
}

// ============================================================================
// CACHE & PERFORMANCE
// ============================================================================

export interface CacheMetadata {
  key: string;
  ttl: number;
  createdAt: Date;
  expiresAt: Date;
  hitCount?: number;
}

export interface PerformanceMetrics {
  executionTime: number;
  memoryUsage?: number;
  cacheHit?: boolean;
  queriesExecuted?: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

export type AsyncResult<T> = Promise<T>;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isObjectId(value: any): value is ObjectId {
  return value && value instanceof ObjectId;
}

export function isValidDate(value: any): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

export function isPaginationParams(obj: any): obj is PaginationParams {
  return obj && (
    typeof obj.page === 'number' || 
    typeof obj.limit === 'number' || 
    typeof obj.offset === 'number'
  );
}