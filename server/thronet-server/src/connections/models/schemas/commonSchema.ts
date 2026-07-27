// src/models/schemas/commonSchema.ts

import { z } from 'zod';
import { Types } from 'mongoose';

/**
 * Common validation schemas used across the application
 * Using Zod for modern TypeScript-first validation
 */

/**
 * Custom validators
 */
const objectIdValidator = z.string().refine(
  (val) => Types.ObjectId.isValid(val),
  { message: 'Invalid ObjectId format' }
);

const uuidValidator = z.string().uuid({ message: 'Invalid UUID format' });

const dateStringValidator = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid date format' }
);

/**
 * Common field schemas
 */
export const CommonSchemas = {
  // ID validators
  objectId: objectIdValidator,
  uuid: uuidValidator,
  
  // Pagination
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(10),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  }),

  // Query pagination
  queryPagination: z.object({
    page: z.string().transform(val => parseInt(val) || 1).pipe(z.number().int().min(1)),
    limit: z.string().transform(val => parseInt(val) || 10).pipe(z.number().int().min(1).max(100)),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  }),

  // Date range
  dateRange: z.object({
    startDate: dateStringValidator.optional(),
    endDate: dateStringValidator.optional()
  }).refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    { message: 'Start date must be before end date' }
  ),

  // Status
  status: z.enum(['active', 'pending', 'removed', 'blocked']),
  
  // Visibility
  visibility: z.enum(['public', 'connections', 'private']),

  // Priority
  priority: z.enum(['low', 'medium', 'high']),

  // Tags
  tags: z.array(
    z.string().min(1).max(50)
  ).max(20),

  // Search query
  searchQuery: z.object({
    q: z.string().min(1).max(200),
    filters: z.record(z.string(), z.any()).optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(50).default(10)
  }),

  // Bulk operation
  bulkIds: z.object({
    ids: z.array(objectIdValidator).min(1).max(100)
  }),

  // User reference
  userRef: z.object({
    userId: objectIdValidator
  }),

  // Connection reference
  connectionRef: z.object({
    connectionId: objectIdValidator
  }),

  // Metadata
  metadata: z.record(z.string(), z.any()).optional(),

  // Location
  location: z.object({
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    coordinates: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180)
    }).optional()
  }).optional(),

  // Contact info
  contactInfo: z.object({
    email: z.string().email().optional(),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
    linkedin: z.string().url().optional(),
    twitter: z.string().optional(),
    website: z.string().url().optional()
  }).optional(),

  // Filter options
  filterOptions: z.object({
    status: z.array(z.enum(['active', 'pending', 'removed', 'blocked'])).optional(),
    visibility: z.array(z.enum(['public', 'connections', 'private'])).optional(),
    priority: z.array(z.enum(['low', 'medium', 'high'])).optional(),
    tags: z.array(z.string()).optional(),
    dateRange: z.object({
      startDate: dateStringValidator.optional(),
      endDate: dateStringValidator.optional()
    }).optional()
  }),

  // Sort options
  sortOptions: z.object({
    field: z.string(),
    order: z.enum(['asc', 'desc']).default('desc')
  })
};

/**
 * Request validation schemas
 */
export const RequestSchemas = {
  // Params with ID
  paramsWithId: z.object({
    id: objectIdValidator
  }),

  // Params with user ID
  paramsWithUserId: z.object({
    userId: objectIdValidator
  }),

  // Query with pagination
  queryWithPagination: z.object({
    page: z.string().transform(Number).pipe(z.number().int().min(1)).default(1),
    limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default(10)
  }),

  // Query with search
  queryWithSearch: z.object({
    q: z.string().optional(),
    page: z.string().transform(Number).pipe(z.number().int().min(1)).default(1),
    limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default(10)
  }),

  // Query with filters
  queryWithFilters: z.object({
    status: z.string().optional(),
    visibility: z.string().optional(),
    tags: z.string().optional(), // comma-separated
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })
};

/**
 * Response schemas
 */
export const ResponseSchemas = {
  // Success response
  success: z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.any().optional()
  }),

  // Error response
  error: z.object({
    success: z.literal(false),
    message: z.string(),
    error: z.any().optional()
  }),

  // Paginated response
  paginated: z.object({
    success: z.literal(true),
    data: z.array(z.any()),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
      hasNextPage: z.boolean(),
      hasPrevPage: z.boolean()
    })
  })
};

/**
 * Utility functions
 */
export const SchemaUtils = {
  /**
   * Parse query string to array
   */
  parseQueryArray: (value: string | undefined): string[] => {
    if (!value) return [];
    return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
  },

  /**
   * Parse query string to date
   */
  parseQueryDate: (value: string | undefined): Date | undefined => {
    if (!value) return undefined;
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  },

  /**
   * Validate ObjectId
   */
  isValidObjectId: (id: string): boolean => {
    return Types.ObjectId.isValid(id);
  },

  /**
   * Validate UUID
   */
  isValidUUID: (id: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  },

  /**
   * Sanitize query string
   */
  sanitizeQuery: (query: string): string => {
    return query.trim().replace(/[<>]/g, '');
  }
};

/**
 * Export all schemas
 */
export default {
  Common: CommonSchemas,
  Request: RequestSchemas,
  Response: ResponseSchemas,
  Utils: SchemaUtils
};