// src/types/shared.types.ts

/**
 * Shared Types for Services
 * Common type definitions used across shared services like cache, queue, and validation.
 * These types ensure consistency and type safety across the connection service.
 */

// ============================================================================
// CACHE SERVICE TYPES
// ============================================================================

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  serialize?: boolean; // Whether to JSON stringify/parse
  compression?: boolean; // Whether to compress large values
  prefix?: string; // Key prefix for namespacing
}

export interface CacheResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  fromCache?: boolean;
  cacheKey?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  memory: number;
  uptime: number;
}

export type CacheKey = string;
export type CacheValue = string | number | boolean | object | null;

// ============================================================================
// QUEUE SERVICE TYPES
// ============================================================================

export type JobPriority = 'HIGH' | 'NORMAL' | 'LOW';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'retry' | 'delayed';

export interface QueueJob {
  id: string;
  type: string;
  data: any;
  priority: JobPriority;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  delay?: number;
  retryDelay?: number;
  queueName?: string;
  metadata?: Record<string, any>;
}

export interface QueueOptions {
  priority?: JobPriority;
  delay?: number; // Delay in milliseconds
  maxAttempts?: number;
  retryDelay?: number; // Base retry delay in milliseconds
  timeout?: number; // Job timeout in milliseconds
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
  metadata?: Record<string, any>;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  processingTime?: number;
  metadata?: Record<string, any>;
}

export interface QueueStats {
  high: number;
  normal: number;
  low: number;
  delayed: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
  throughput?: number; // Jobs per minute
  avgProcessingTime?: number; // Average processing time in ms
}

export interface WorkerOptions {
  concurrency?: number;
  stalledInterval?: number;
  maxStalledCount?: number;
  retryProcessDelay?: number;
}

// Queue Job Types for different operations
export interface ConnectionNotificationJob {
  type: 'CONNECTION_NOTIFICATION';
  data: {
    userId: string;
    connectionId: string;
    notificationType: 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'CONNECTION_ACCEPTED' | 'CONNECTION_DECLINED';
    metadata?: Record<string, any>;
  };
}

export interface NetworkAnalysisJob {
  type: 'NETWORK_ANALYSIS';
  data: {
    userId: string;
    analysisType: 'DEGREE_CALCULATION' | 'MUTUAL_CONNECTIONS' | 'RECOMMENDATIONS';
    parameters?: Record<string, any>;
  };
}

export interface DataExportJob {
  type: 'DATA_EXPORT';
  data: {
    userId: string;
    exportType: 'CONNECTIONS' | 'NETWORK' | 'ANALYTICS';
    format: 'JSON' | 'CSV' | 'PDF';
    filters?: Record<string, any>;
  };
}

export interface BatchProcessingJob {
  type: 'BATCH_PROCESSING';
  data: {
    batchId: string;
    operation: string;
    items: any[];
    options?: Record<string, any>;
  };
}

export type SpecificJobTypes = 
  | ConnectionNotificationJob 
  | NetworkAnalysisJob 
  | DataExportJob 
  | BatchProcessingJob;

// ============================================================================
// VALIDATION SERVICE TYPES
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
  sanitizedData?: any;
}

export interface ValidationError {
  field: string;
  message: string;
  code: ValidationErrorCode;
  value?: any;
  context?: Record<string, any>;
}

export type ValidationErrorCode = 
  | 'REQUIRED_FIELD_MISSING'
  | 'INVALID_TYPE'
  | 'INVALID_FORMAT'
  | 'INVALID_VALUE'
  | 'VALUE_TOO_SMALL'
  | 'VALUE_TOO_LARGE'
  | 'VALUE_TOO_SHORT'
  | 'VALUE_TOO_LONG'
  | 'ARRAY_TOO_SHORT'
  | 'ARRAY_TOO_LONG'
  | 'INVALID_DATE'
  | 'INVALID_DATE_RANGE'
  | 'WEAK_PASSWORD'
  | 'DUPLICATE_VALUES'
  | 'EMPTY_ARRAY'
  | 'EMPTY_STRING'
  | 'INVALID_REGEX'
  | 'CUSTOM_VALIDATION_FAILED'
  | 'CUSTOM_VALIDATOR_ERROR'
  | 'VALIDATION_SERVICE_ERROR'
  | 'ASYNC_VALIDATION_SERVICE_ERROR';

export interface ValidationRule {
  field: string;
  rules: string[];
  message?: string;
  customValidator?: (value: any) => boolean | Promise<boolean>;
  context?: Record<string, any>;
}

export interface ValidationOptions {
  strict?: boolean;
  sanitize?: boolean;
  allowUnknownFields?: boolean;
  stopOnFirstError?: boolean;
  context?: Record<string, any>;
}

export interface BatchValidationResult {
  results: ValidationResult[];
  overallValid: boolean;
  totalErrors: number;
  totalWarnings: number;
}

// Built-in validation rule types
export type BuiltInValidationRules =
  | 'required'
  | 'optional'
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'array'
  | 'object'
  | 'email'
  | 'phone'
  | 'uuid'
  | 'objectId'
  | 'url'
  | 'username'
  | 'date'
  | 'future_date'
  | 'past_date'
  | 'strong_password'
  | 'alphanumeric'
  | 'no_special_chars'
  | 'ip_address'
  | 'positive'
  | 'negative'
  | 'not_empty'
  | 'unique_array'
  | 'trim'
  | 'lowercase'
  | 'uppercase'
  | 'normalize_email'
  | 'normalize_phone'
  | 'escape_html'
  | `min:${number}`
  | `max:${number}`
  | `in:${string}`
  | `regex:${string}`;

// ============================================================================
// COMMON SHARED TYPES
// ============================================================================

export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: ValidationError[];
  warnings?: string[];
  metadata?: {
    timestamp: Date;
    requestId?: string;
    processingTime?: number;
    cached?: boolean;
    queueId?: string;
    [key: string]: any;
  };
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface FilterOptions {
  [key: string]: any;
  dateRange?: {
    start: Date;
    end: Date;
  };
  status?: string[];
  tags?: string[];
  search?: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface ServiceError extends Error {
  code: string;
  statusCode?: number;
  context?: Record<string, any>;
  originalError?: Error;
}

export type ServiceErrorCode =
  | 'CACHE_ERROR'
  | 'QUEUE_ERROR'
  | 'VALIDATION_ERROR'
  | 'CONNECTION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND_ERROR'
  | 'CONFLICT_ERROR'
  | 'INTERNAL_ERROR';

// ============================================================================
// MONITORING & METRICS TYPES
// ============================================================================

export interface MetricsData {
  timestamp: Date;
  service: string;
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  responseTime?: number;
  error?: string;
  dependencies?: HealthCheckResult[];
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface CacheConfig {
  host: string;
  port: number;
  db: number;
  password?: string;
  ttl: number;
  maxMemory?: string;
  evictionPolicy?: string;
}

export interface QueueConfig {
  host: string;
  port: number;
  db: number;
  password?: string;
  defaultJobOptions: QueueOptions;
  workerOptions: WorkerOptions;
  cleanupInterval?: number;
}

export interface ValidationConfig {
  strict: boolean;
  sanitizeByDefault: boolean;
  customValidators?: Record<string, (value: any) => boolean | Promise<boolean>>;
  errorMessages?: Record<string, string>;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

// ============================================================================
// EVENT TYPES (for potential event-driven architecture)
// ============================================================================

export interface ServiceEvent {
  id: string;
  type: string;
  source: string;
  data: any;
  timestamp: Date;
  version?: string;
  correlationId?: string;
}

export interface CacheEvent extends ServiceEvent {
  type: 'CACHE_HIT' | 'CACHE_MISS' | 'CACHE_SET' | 'CACHE_DELETE' | 'CACHE_EXPIRE';
  data: {
    key: string;
    operation: string;
    success: boolean;
    error?: string;
  };
}

export interface QueueEvent extends ServiceEvent {
  type: 'JOB_ADDED' | 'JOB_STARTED' | 'JOB_COMPLETED' | 'JOB_FAILED' | 'JOB_RETRY';
  data: {
    jobId: string;
    jobType: string;
    queueName: string;
    success?: boolean;
    error?: string;
    duration?: number;
  };
}

export interface ValidationEvent extends ServiceEvent {
  type: 'VALIDATION_SUCCESS' | 'VALIDATION_FAILURE';
  data: {
    fields: string[];
    rules: string[];
    success: boolean;
    errors?: ValidationError[];
  };
}

// ============================================================================
// EXPORT ALL TYPES
// ============================================================================

export type SharedServiceEvent = CacheEvent | QueueEvent | ValidationEvent;