// src/models/schemas/searchSchema.ts

import { z } from 'zod';

/**
 * Search validation schemas for connections, users, and content
 * Covers basic search, advanced filters, and saved searches
 */

/**
 * Basic search schemas
 */
export const SearchSchemas = {
  /**
   * Basic search query
   */
  basicSearch: z.object({
    q: z.string().min(1).max(200),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(50).default(10)
  }),

  /**
   * Query string search
   */
  querySearch: z.object({
    q: z.string().min(1).max(200),
    page: z.string().transform(val => parseInt(val) || 1).pipe(z.number().int().min(1)),
    limit: z.string().transform(val => parseInt(val) || 10).pipe(z.number().int().min(1).max(50)),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  }),

  /**
   * Connection search
   */
  connectionSearch: z.object({
    q: z.string().min(1).max(200),
    status: z.enum(['active', 'pending', 'removed', 'blocked']).optional(),
    connectionType: z.enum(['professional', 'personal', 'other']).optional(),
    tags: z.array(z.string()).optional(),
    strengthMin: z.number().min(0).max(100).optional(),
    strengthMax: z.number().min(0).max(100).optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(50).default(10)
  }).refine(
    (data) => {
      if (data.strengthMin && data.strengthMax) {
        return data.strengthMin <= data.strengthMax;
      }
      return true;
    },
    { message: 'strengthMin must be less than or equal to strengthMax' }
  ),

  /**
   * User search
   */
  userSearch: z.object({
    q: z.string().min(1).max(200),
    location: z.object({
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional()
    }).optional(),
    industry: z.string().optional(),
    company: z.string().optional(),
    position: z.string().optional(),
    skills: z.array(z.string()).optional(),
    connectionDegree: z.enum(['1', '2', '3']).optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(50).default(10)
  }),

  /**
   * Advanced search with filters
   */
  advancedSearch: z.object({
    query: z.string().min(1).max(200),
    filters: z.object({
      status: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      dateRange: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }).optional(),
      location: z.object({
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        radius: z.number().optional() // in km
      }).optional(),
      connectionStrength: z.object({
        min: z.number().min(0).max(100).optional(),
        max: z.number().min(0).max(100).optional()
      }).optional(),
      industry: z.array(z.string()).optional(),
      company: z.array(z.string()).optional(),
      skills: z.array(z.string()).optional()
    }).optional(),
    sort: z.object({
      field: z.enum([
        'relevance',
        'name',
        'date',
        'strength',
        'mutualConnections'
      ]).default('relevance'),
      order: z.enum(['asc', 'desc']).default('desc')
    }).optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(50).default(10)
  }),

  /**
   * Autocomplete search
   */
  autocomplete: z.object({
    q: z.string().min(1).max(100),
    type: z.enum(['users', 'connections', 'companies', 'skills', 'all']).default('all'),
    limit: z.number().int().min(1).max(20).default(10)
  }),

  /**
   * Suggestion search
   */
  suggestions: z.object({
    type: z.enum(['connections', 'users', 'groups', 'jobs']),
    basedOn: z.enum(['profile', 'connections', 'activity', 'location']).default('profile'),
    limit: z.number().int().min(1).max(50).default(10)
  })
};

/**
 * Saved search schemas
 */
export const SavedSearchSchemas = {
  /**
   * Create saved search
   */
  createSavedSearch: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    searchQuery: z.string().min(1).max(200),
    filters: z.record(z.string(), z.any()).optional(),
    notifications: z.boolean().default(false),
    frequency: z.enum(['immediate', 'daily', 'weekly', 'never']).default('never')
  }),

  /**
   * Update saved search
   */
  updateSavedSearch: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    searchQuery: z.string().min(1).max(200).optional(),
    filters: z.record(z.string(), z.any()).optional(),
    notifications: z.boolean().optional(),
    frequency: z.enum(['immediate', 'daily', 'weekly', 'never']).optional(),
    isActive: z.boolean().optional()
  }).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' }
  ),

  /**
   * Execute saved search
   */
  executeSavedSearch: z.object({
    searchId: z.string().min(1),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(50).default(10)
  })
};

/**
 * Search history schemas
 */
export const SearchHistorySchemas = {
  /**
   * Track search
   */
  trackSearch: z.object({
    query: z.string().min(1).max(200),
    type: z.enum(['users', 'connections', 'companies', 'skills', 'general']),
    filters: z.record(z.string(), z.any()).optional(),
    resultsCount: z.number().int().min(0)
  }),

  /**
   * Get search history
   */
  getSearchHistory: z.object({
    type: z.enum(['users', 'connections', 'companies', 'skills', 'all']).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    page: z.number().int().min(1).default(1)
  }),

  /**
   * Clear search history
   */
  clearSearchHistory: z.object({
    type: z.enum(['users', 'connections', 'companies', 'skills', 'all']).default('all'),
    olderThan: z.string().optional() // ISO date string
  })
};

/**
 * Search analytics schemas
 */
export const SearchAnalyticsSchemas = {
  /**
   * Get popular searches
   */
  popularSearches: z.object({
    type: z.enum(['users', 'connections', 'companies', 'skills', 'all']).default('all'),
    timeframe: z.enum(['today', 'week', 'month', 'year', 'all']).default('week'),
    limit: z.number().int().min(1).max(100).default(10)
  }),

  /**
   * Get trending searches
   */
  trendingSearches: z.object({
    type: z.enum(['users', 'connections', 'companies', 'skills', 'all']).default('all'),
    limit: z.number().int().min(1).max(50).default(10)
  }),

  /**
   * Search statistics
   */
  searchStats: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    groupBy: z.enum(['day', 'week', 'month']).default('day')
  })
};

/**
 * Filter builder schemas
 */
export const FilterSchemas = {
  /**
   * Location filter
   */
  locationFilter: z.object({
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    radius: z.number().int().min(1).max(1000).optional(), // km
    coordinates: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180)
    }).optional()
  }),

  /**
   * Date range filter
   */
  dateRangeFilter: z.object({
    startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid start date format'
    }),
    endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid end date format'
    })
  }).refine(
    (data) => new Date(data.startDate) <= new Date(data.endDate),
    { message: 'Start date must be before or equal to end date' }
  ),

  /**
   * Numeric range filter
   */
  numericRangeFilter: z.object({
    min: z.number().optional(),
    max: z.number().optional()
  }).refine(
    (data) => {
      if (data.min !== undefined && data.max !== undefined) {
        return data.min <= data.max;
      }
      return true;
    },
    { message: 'Min must be less than or equal to max' }
  ),

  /**
   * Multi-select filter
   */
  multiSelectFilter: z.object({
    values: z.array(z.string()).min(1),
    operator: z.enum(['OR', 'AND']).default('OR')
  }),

  /**
   * Text filter
   */
  textFilter: z.object({
    value: z.string().min(1),
    matchType: z.enum(['exact', 'partial', 'fuzzy']).default('partial'),
    caseSensitive: z.boolean().default(false)
  })
};

/**
 * Search result schemas
 */
export const SearchResultSchemas = {
  /**
   * User search result
   */
  userResult: z.object({
    userId: z.string(),
    name: z.string(),
    headline: z.string().optional(),
    location: z.string().optional(),
    profileImage: z.string().optional(),
    connectionDegree: z.number().int().min(0).max(3).optional(),
    mutualConnections: z.number().int().min(0).optional(),
    relevanceScore: z.number().min(0).max(1).optional()
  }),

  /**
   * Connection search result
   */
  connectionResult: z.object({
    connectionId: z.string(),
    userId: z.string(),
    name: z.string(),
    connectionType: z.string(),
    status: z.string(),
    strength: z.number(),
    tags: z.array(z.string()),
    createdAt: z.string()
  })
};

/**
 * Export all schemas
 */
export default {
  Search: SearchSchemas,
  SavedSearch: SavedSearchSchemas,
  SearchHistory: SearchHistorySchemas,
  Analytics: SearchAnalyticsSchemas,
  Filters: FilterSchemas,
  Results: SearchResultSchemas
};