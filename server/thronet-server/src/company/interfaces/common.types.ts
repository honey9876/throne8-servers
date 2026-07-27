/**
 * Common types used across the application
 */

// Pagination
export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  skip?: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

// API Response
export interface ApiSuccessResponse<T> {
  status: 'success';
  message: string;
  data: T;
  meta?: PaginationMeta;
  timestamp: string;
}

export interface ApiErrorResponse {
  status: 'error';
  message: string;
  statusCode: number;
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Sort Options
export interface SortOptions {
  [key: string]: 'asc' | 'desc' | 1 | -1;
}

// Filter Options
export interface FilterOptions {
  [key: string]: unknown;
}

// Query Parameters
export interface QueryParams extends PaginationQuery {
  sort?: SortOptions;
  search?: string;
  filter?: FilterOptions;
}

// ID Types
export type ObjectId = string;

// Status Enums
export enum CompanyStatus {
  ACTIVE = 'Active',
  INACTIVE = 'Inactive',
  SUSPENDED = 'Suspended',
}

export enum PostStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
  ARCHIVED = 'Archived',
  SCHEDULED = 'Scheduled',
}

// ✅ ADDED POST TYPE ENUM
export enum PostType {
  TEXT = 'Text',
  IMAGE = 'Image',
  VIDEO = 'Video',
  ARTICLE = 'Article',
  EVENT = 'Event',
  JOB = 'Job',
  POLL = 'Poll',
}

// ✅ ADDED POST VISIBILITY ENUM
export enum PostVisibility {
  PUBLIC = 'Public',
  PRIVATE = 'Private',
  FOLLOWERS = 'Followers',
}

export enum EventStatus {
  UPCOMING = 'Upcoming',
  ONGOING = 'Ongoing',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled',
  SCHEDULED = 'Scheduled',
}

export enum JobStatus {
  OPEN = 'Open',
  CLOSED = 'Closed',
  ON_HOLD = 'On Hold',
}

export enum ApplicationStatus {
  APPLIED = 'Applied',
  SHORTLISTED = 'Shortlisted',
  REJECTED = 'Rejected',
  ACCEPTED = 'Accepted',
  PENDING = 'PENDING',
}

export enum AdminRole {
  SUPER_ADMIN = 'SuperAdmin',
  ADMIN = 'Admin',
  MODERATOR = 'Moderator',
}

// Request/Response Wrappers
export interface CreateRequest<T> {
  data: T;
}

export interface UpdateRequest<T> {
  data: Partial<T>;
}

export interface BulkRequest<T> {
  items: T[];
}

// Error Details
export interface ErrorDetail {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationError {
  errors: ErrorDetail[];
}