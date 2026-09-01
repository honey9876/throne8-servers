// src/models/schemas/index.ts

/**
 * Validation Schemas - Centralized Export
 * 
 * All Zod and Joi validation schemas for the application
 * Import from this file for consistent validation
 */

// Connection schemas
export { default as connectionSchema } from './connectionSchema';

// Follow schemas  
export * as followSchema from './followSchema';

// Common schemas (Zod)
import commonSchemasDefault, {
  CommonSchemas,
  RequestSchemas,
  ResponseSchemas,
  SchemaUtils
} from './commonSchema';

export { commonSchemasDefault as commonSchemas, CommonSchemas, RequestSchemas, ResponseSchemas, SchemaUtils };

// Privacy schemas (Zod)
import privacySchemasDefault, {
  PrivacySchemas,
  CompletePrivacySettings,
  BulkPrivacyUpdate,
  PrivacyPreset,
  PrivacyPresets
} from './privacySchema';

export { privacySchemasDefault as privacySchemas, PrivacySchemas, CompletePrivacySettings, BulkPrivacyUpdate, PrivacyPreset, PrivacyPresets };

// Search schemas (Zod)
import searchSchemasDefault, {
  SearchSchemas,
  SavedSearchSchemas,
  SearchHistorySchemas,
  SearchAnalyticsSchemas,
  FilterSchemas,
  SearchResultSchemas
} from './searchSchema';

export { searchSchemasDefault as searchSchemas, SearchSchemas, SavedSearchSchemas, SearchHistorySchemas, SearchAnalyticsSchemas, FilterSchemas, SearchResultSchemas };

/**
 * Re-export commonly used validators
 */
export const Validators = {
  // Common validators
  objectId: CommonSchemas.objectId,
  uuid: CommonSchemas.uuid,
  pagination: CommonSchemas.pagination,
  queryPagination: CommonSchemas.queryPagination,
  dateRange: CommonSchemas.dateRange,
  
  // Privacy validators
  profileVisibility: PrivacySchemas.profileVisibility,
  connectionPrivacy: PrivacySchemas.connectionPrivacy,
  
  // Search validators
  basicSearch: SearchSchemas.basicSearch,
  advancedSearch: SearchSchemas.advancedSearch,
  autocomplete: SearchSchemas.autocomplete
};

/**
 * Schema validation utilities
 */
export const Utils = SchemaUtils;