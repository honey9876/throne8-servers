// src/types/search.types.ts

/**
 * SEARCH TYPES - CONNECTION SERVICE
 * ==================================
 * Complete type definitions for search functionality
 */

import { Types } from 'mongoose';
import { PaginationParams, SortOrder, Location } from './common.types';

// ============================================================================
// SEARCH QUERY TYPES
// ============================================================================

export interface SearchQuery {
  q: string;
  type?: SearchType;
  filters?: SearchFilters;
  pagination?: PaginationParams;
  sort?: SearchSortOptions;
}

export enum SearchType {
  USERS = 'users',
  CONNECTIONS = 'connections',
  COMPANIES = 'companies',
  SKILLS = 'skills',
  ALL = 'all',
  GENERAL = 'general',
}

export interface SearchFilters {
  status?: string[];
  tags?: string[];
  dateRange?: DateRangeFilter;
  location?: LocationFilter;
  connectionStrength?: RangeFilter;
  industry?: string[];
  company?: string[];
  skills?: string[];
  connectionDegree?: '1' | '2' | '3';
  connectionType?: 'professional' | 'personal' | 'other';
}

export interface DateRangeFilter {
  startDate?: string | Date;
  endDate?: string | Date;
}

export interface LocationFilter extends Location {
  radius?: number; // in kilometers
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface RangeFilter {
  min?: number;
  max?: number;
}

export interface SearchSortOptions {
  field: SearchSortField;
  order: SortOrder;
}

export enum SearchSortField {
  RELEVANCE = 'relevance',
  NAME = 'name',
  DATE = 'date',
  STRENGTH = 'strength',
  MUTUAL_CONNECTIONS = 'mutualConnections',
}

// ============================================================================
// SEARCH RESULT TYPES
// ============================================================================

export interface SearchResult<T = any> {
  items: T[];
  total: number;
  query: string;
  took?: number;
  page?: number;
  limit?: number;
  aggregations?: SearchAggregations;
  suggestions?: string[];
}

export interface SearchAggregations {
  topTags?: Array<{ tag: string; count: number }>;
  locationDistribution?: Record<string, number>;
  industryBreakdown?: Record<string, number>;
  strengthDistribution?: {
    weak: number;
    medium: number;
    strong: number;
  };
}

export interface UserSearchResult {
  userId: string;
  name: string;
  email?: string;
  username?: string;
  headline?: string;
  avatar?: string;
  profileImage?: string;
  bio?: string;
  location?: string;
  industry?: string;
  company?: string;
  position?: string;
  skills?: string[];
  isConnected?: boolean;
  connectionDegree?: number;
  mutualConnections?: number;
  mutualConnectionCount?: number;
  relevanceScore?: number;
  region?: string;
}

export interface ConnectionSearchResult {
  connectionId: string;
  userId: string;
  name: string;
  connectionType: string;
  status: string;
  strength: number;
  tags: string[];
  createdAt: string | Date;
  lastInteraction?: Date;
  notes?: string;
  priority?: string;
  relevanceScore?: number;
}

// ============================================================================
// AUTOCOMPLETE & SUGGESTIONS
// ============================================================================

export interface AutocompleteRequest {
  q: string;
  type?: SearchType;
  limit?: number;
}

export interface AutocompleteResult {
  suggestions: string[];
  type: SearchType;
  count: number;
}

export interface SearchSuggestion {
  text: string;
  type: SearchType;
  score: number;
  metadata?: Record<string, any>;
}

export interface SuggestionRequest {
  type: 'connections' | 'users' | 'groups' | 'jobs';
  basedOn?: 'profile' | 'connections' | 'activity' | 'location';
  limit?: number;
  userId?: string;
}

// ============================================================================
// SAVED SEARCH TYPES
// ============================================================================

export interface SavedSearch {
  _id?: Types.ObjectId;
  savedSearchId: string;
  userId: string | Types.ObjectId;
  name: string;
  description?: string;
  searchQuery: string;
  filters?: SearchFilters;
  notifications: boolean;
  frequency: NotificationFrequency;
  isActive: boolean;
  lastExecuted?: Date;
  resultsCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export enum NotificationFrequency {
  IMMEDIATE = 'immediate',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  NEVER = 'never',
}

export interface CreateSavedSearchDTO {
  name: string;
  description?: string;
  searchQuery: string;
  filters?: SearchFilters;
  notifications?: boolean;
  frequency?: NotificationFrequency;
}

export interface UpdateSavedSearchDTO {
  name?: string;
  description?: string;
  searchQuery?: string;
  filters?: SearchFilters;
  notifications?: boolean;
  frequency?: NotificationFrequency;
  isActive?: boolean;
}

export interface ExecuteSavedSearchRequest {
  searchId: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// SEARCH HISTORY TYPES
// ============================================================================

export interface SearchHistory {
  _id?: Types.ObjectId;
  historyId: string;
  userId: string | Types.ObjectId;
  query: string;
  type: SearchType;
  filters?: SearchFilters;
  resultsCount: number;
  timestamp: Date;
  clickedResults?: string[];
  sessionId?: string;
}

export interface TrackSearchDTO {
  query: string;
  type: SearchType;
  filters?: SearchFilters;
  resultsCount: number;
  sessionId?: string;
}

export interface SearchHistoryQuery {
  type?: SearchType;
  limit?: number;
  page?: number;
  userId?: string;
}

export interface ClearSearchHistoryDTO {
  type?: SearchType | 'all';
  olderThan?: string | Date;
  userId?: string;
}

// ============================================================================
// SEARCH ANALYTICS TYPES
// ============================================================================

export interface PopularSearchesQuery {
  type?: SearchType;
  timeframe?: Timeframe;
  limit?: number;
}

export enum Timeframe {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
  ALL = 'all',
}

export interface TrendingSearchesQuery {
  type?: SearchType;
  limit?: number;
}

export interface SearchStatsQuery {
  startDate?: string | Date;
  endDate?: string | Date;
  groupBy?: 'day' | 'week' | 'month';
}

export interface SearchAnalytics {
  totalSearches: number;
  uniqueUsers: number;
  avgResultsPerSearch: number;
  topQueries: Array<{ query: string; count: number }>;
  searchesByType: Record<SearchType, number>;
  searchesByTimeframe?: Array<{
    period: string;
    count: number;
  }>;
}

export interface TrendingSearch {
  query: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
  changePercentage?: number;
}

// ============================================================================
// ADVANCED SEARCH TYPES
// ============================================================================

export interface AdvancedSearchRequest {
  query: string;
  filters?: SearchFilters;
  sort?: SearchSortOptions;
  page?: number;
  limit?: number;
  facets?: string[];
  highlight?: boolean;
}

export interface SearchFacet {
  field: string;
  values: Array<{
    value: string;
    count: number;
    selected?: boolean;
  }>;
}

export interface HighlightedResult {
  field: string;
  highlights: string[];
}

// ============================================================================
// SEARCH VALIDATION TYPES
// ============================================================================

export interface SearchValidation {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  sanitizedQuery?: string;
}

// ============================================================================
// SEARCH METRICS TYPES
// ============================================================================

export interface SearchMetrics {
  queryTime: number;
  indexUsed?: string;
  documentsScanned: number;
  documentsReturned: number;
  cacheHit: boolean;
}

// ============================================================================
// FILTER BUILDER TYPES
// ============================================================================

export interface TextFilter {
  value: string;
  matchType: 'exact' | 'partial' | 'fuzzy';
  caseSensitive?: boolean;
}

export interface MultiSelectFilter {
  values: string[];
  operator: 'OR' | 'AND';
}

export interface NumericRangeFilter {
  min?: number;
  max?: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isSearchQuery(obj: any): obj is SearchQuery {
  return obj && typeof obj.q === 'string';
}

export function isSavedSearch(obj: any): obj is SavedSearch {
  return obj && obj.savedSearchId && obj.userId && obj.searchQuery;
}

export function isUserSearchResult(obj: any): obj is UserSearchResult {
  return obj && obj.userId && obj.name;
}

export function isConnectionSearchResult(obj: any): obj is ConnectionSearchResult {
  return obj && obj.connectionId && obj.userId;
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  isSearchQuery,
  isSavedSearch,
  isUserSearchResult,
  isConnectionSearchResult,
};