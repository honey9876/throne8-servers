/**
 * ====================================
 * GENERIC REPOSITORY INTERFACE
 * ====================================
 * Base interface for all repository implementations
 * Provides standard CRUD operations
 */

import { Document, FilterQuery, UpdateQuery, QueryOptions } from 'mongoose';

/**
 * Generic Repository Interface
 * T = Document type (e.g., IUser, IGroup)
 */
export interface IRepository<T extends Document> {
  /**
   * Create a new document
   */
  create(data: Partial<T>): Promise<T>;

  /**
   * Find document by ID
   */
  findById(id: string, options?: QueryOptions): Promise<T | null>;

  /**
   * Find one document by filter
   */
  findOne(filter: FilterQuery<T>, options?: QueryOptions): Promise<T | null>;

  /**
   * Find all documents matching filter
   */
  find(filter: FilterQuery<T>, options?: QueryOptions): Promise<T[]>;

  /**
   * Find all documents with pagination
   */
  findWithPagination(
    filter: FilterQuery<T>,
    page: number,
    limit: number,
    sort?: any
  ): Promise<{
    data: T[];
    total: number;
    page: number;
    pages: number;
  }>;

  /**
   * Update document by ID
   */
  updateById(
    id: string,
    update: UpdateQuery<T>,
    options?: QueryOptions
  ): Promise<T | null>;

  /**
   * Update one document by filter
   */
  updateOne(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: QueryOptions
  ): Promise<T | null>;

  /**
   * Update multiple documents
   */
  updateMany(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: QueryOptions
  ): Promise<number>;

  /**
   * Delete document by ID (hard delete)
   */
  deleteById(id: string): Promise<boolean>;

  /**
   * Delete one document by filter (hard delete)
   */
  deleteOne(filter: FilterQuery<T>): Promise<boolean>;

  /**
   * Delete multiple documents (hard delete)
   */
  deleteMany(filter: FilterQuery<T>): Promise<number>;

  /**
   * Soft delete document by ID
   */
  softDeleteById(id: string, deletedBy?: string): Promise<T | null>;

  /**
   * Soft delete one document by filter
   */
  softDeleteOne(
    filter: FilterQuery<T>,
    deletedBy?: string
  ): Promise<T | null>;

  /**
   * Count documents matching filter
   */
  count(filter: FilterQuery<T>): Promise<number>;

  /**
   * Check if document exists
   */
  exists(filter: FilterQuery<T>): Promise<boolean>;

  /**
   * Aggregate query
   */
  aggregate(pipeline: any[]): Promise<any[]>;

  /**
   * Find documents and populate references
   */
  findWithPopulate(
    filter: FilterQuery<T>,
    populateFields: string | string[],
    options?: QueryOptions
  ): Promise<T[]>;

  /**
   * Bulk insert documents
   */
  bulkCreate(data: Partial<T>[]): Promise<T[]>;

  /**
   * Find or create document
   */
  findOrCreate(
    filter: FilterQuery<T>,
    data: Partial<T>
  ): Promise<{ doc: T; created: boolean }>;

  /**
   * Increment field value
   */
  increment(
    id: string,
    field: string,
    value: number
  ): Promise<T | null>;

  /**
   * Decrement field value
   */
  decrement(
    id: string,
    field: string,
    value: number
  ): Promise<T | null>;

  /**
   * Get distinct values for a field
   */
  distinct(field: string, filter?: FilterQuery<T>): Promise<any[]>;

  /**
   * Find latest documents
   */
  findLatest(limit: number, filter?: FilterQuery<T>): Promise<T[]>;

  /**
   * Search documents by text
   */
  search(
    searchText: string,
    fields: string[],
    options?: QueryOptions
  ): Promise<T[]>;
}

/**
 * Pagination Options Interface
 */
export interface IPaginationOptions {
  page?: number;
  limit?: number;
  sort?: any;
  select?: string;
  populate?: string | string[];
}

/**
 * Pagination Result Interface
 */
export interface IPaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Query Options Interface
 */
export interface IQueryOptions extends QueryOptions {
  select?: string;
  populate?: string | string[];
  sort?: any;
  lean?: boolean;
}

export default IRepository; 