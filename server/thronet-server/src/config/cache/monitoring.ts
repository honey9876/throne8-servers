import 'dotenv/config';
import { Registry, collectDefaultMetrics } from 'prom-client';

export const monitoringConfig = {
  // Prometheus settings
  enabled: process.env.METRICS_ENABLED !== 'false', // Enabled by default
  port: parseInt(process.env.PROMETHEUS_PORT || '9090', 10),
  endpoint: '/metrics',
  
  // Default metrics collection
  defaultMetrics: {
    enabled: true,
    timeout: 10000, // 10 seconds
    prefix: 'company_service_',
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  },

  // Custom metrics configuration
  customMetrics: {
    // HTTP request metrics
    httpRequests: {
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    },
    httpRequestDuration: {
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    },

    // Database metrics
    dbQueries: {
      name: 'db_queries_total',
      help: 'Total number of database queries',
      labelNames: ['operation', 'collection', 'status'],
    },
    dbQueryDuration: {
      name: 'db_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'collection'],
      buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2],
    },
    dbConnections: {
      name: 'db_connections_active',
      help: 'Number of active database connections',
    },

    // Cache metrics
    cacheHits: {
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_type'],
    },
    cacheMisses: {
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_type'],
    },
    cacheOperationDuration: {
      name: 'cache_operation_duration_seconds',
      help: 'Duration of cache operations in seconds',
      labelNames: ['operation', 'cache_type'],
      buckets: [0.001, 0.01, 0.05, 0.1, 0.5],
    },

    // Queue metrics
    queueJobs: {
      name: 'queue_jobs_total',
      help: 'Total number of queue jobs',
      labelNames: ['queue_name', 'status'],
    },
    queueJobDuration: {
      name: 'queue_job_duration_seconds',
      help: 'Duration of queue jobs in seconds',
      labelNames: ['queue_name', 'job_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    },
    queueSize: {
      name: 'queue_size',
      help: 'Current size of the queue',
      labelNames: ['queue_name'],
    },
    queueJobsActive: {
      name: 'queue_jobs_active',
      help: 'Number of jobs currently being processed',
      labelNames: ['queue_name'],
    },

    // Circuit breaker metrics
    circuitBreakerState: {
      name: 'circuit_breaker_state',
      help: 'State of circuit breaker (0=closed, 1=open, 2=half-open)',
      labelNames: ['breaker_name'],
    },
    circuitBreakerFailures: {
      name: 'circuit_breaker_failures_total',
      help: 'Total number of circuit breaker failures',
      labelNames: ['breaker_name'],
    },

    // Business metrics
    companyRegistrations: {
      name: 'company_registrations_total',
      help: 'Total number of company registrations',
      labelNames: ['status'],
    },
    postsCreated: {
      name: 'posts_created_total',
      help: 'Total number of posts created',
      labelNames: ['post_type', 'status'],
    },
    jobsPosted: {
      name: 'jobs_posted_total',
      help: 'Total number of jobs posted',
      labelNames: ['job_type'],
    },
    eventsCreated: {
      name: 'events_created_total',
      help: 'Total number of events created',
      labelNames: ['event_type'],
    },

    // Error metrics
    errors: {
      name: 'errors_total',
      help: 'Total number of errors',
      labelNames: ['error_type', 'severity'],
    },

    // External API metrics
    externalApiCalls: {
      name: 'external_api_calls_total',
      help: 'Total number of external API calls',
      labelNames: ['service_name', 'status'],
    },
    externalApiDuration: {
      name: 'external_api_duration_seconds',
      help: 'Duration of external API calls',
      labelNames: ['service_name'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
    },
  },

  // Health check configuration
  healthCheck: {
    enabled: true,
    endpoint: '/health/metrics',
    interval: 30000, // Check every 30 seconds
  },

  // Metric retention
  retention: {
    duration: '15d', // Keep metrics for 15 days
    scrapeInterval: '15s',
  },

  // Labels
  defaultLabels: {
    app: 'company-microservice',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.API_VERSION || 'v1',
  },
};

// Create and configure Prometheus registry
export const createMetricsRegistry = (): Registry => {
  const register = new Registry();

  // Set default labels
  register.setDefaultLabels(monitoringConfig.defaultLabels);

  // Collect default metrics if enabled
  if (monitoringConfig.defaultMetrics.enabled) {
    collectDefaultMetrics({
      register,
      prefix: monitoringConfig.defaultMetrics.prefix,
      gcDurationBuckets: monitoringConfig.defaultMetrics.gcDurationBuckets,
    });
  }

  return register;
};

export default monitoringConfig;