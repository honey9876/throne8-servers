/**
 * ====================================
 * COMMON TYPES
 * ====================================
 * Shared types used across the application
 */

/**
 * MongoDB ObjectId as string
 */
export type ObjectId = string;

/**
 * Timestamp fields
 */
export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Soft delete fields
 */
export interface SoftDelete {
  isDeleted: boolean;
  deletedAt?: Date;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  skip?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Search parameters
 */
export interface SearchParams {
  query: string;
  filters?: Record<string, any>;
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Generic API response structure
 */
export interface ApiResponseStructure<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: PaginationMeta;
  timestamp?: string;
}

/**
 * Error structure
 */
export interface ErrorStructure {
  field?: string;
  message: string;
  value?: any;
}

/**
 * File upload info
 */
export interface FileInfo {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  path?: string;
}

/**
 * Query options
 */
export interface QueryOptions {
  select?: string;
  populate?: string | string[];
  sort?: string;
  lean?: boolean;
}

/**
 * Update result
 */
export interface UpdateResult {
  acknowledged: boolean;
  modifiedCount: number;
  matchedCount: number;
}

/**
 * Delete result
 */
export interface DeleteResult {
  acknowledged: boolean;
  deletedCount: number;
}