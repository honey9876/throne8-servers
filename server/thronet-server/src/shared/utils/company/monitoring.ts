import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import logger from './logger';
import { createMetricsRegistry } from '@/config/cache/monitoring';
// import createMetrics

/**
 * Global metrics registry
 */
export const metricsRegistry: Registry = createMetricsRegistry();

/**
 * HTTP request metrics
 */
export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [metricsRegistry],
});

/**
 * Database metrics
 */
export const databaseQueryCounter = new Counter({
  name: 'database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'collection', 'status'],
  registers: [metricsRegistry],
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [metricsRegistry],
});

/**
 * Queue metrics
 */
export const queueJobCounter = new Counter({
  name: 'queue_jobs_total',
  help: 'Total number of queue jobs',
  labelNames: ['queue', 'status'],
  registers: [metricsRegistry],
});

export const queueJobDuration = new Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Duration of queue jobs in seconds',
  labelNames: ['queue', 'job_type'],
  buckets: [1, 5, 10, 30, 60, 120],
  registers: [metricsRegistry],
});

export const queueSize = new Gauge({
  name: 'queue_size',
  help: 'Current size of queues',
  labelNames: ['queue'],
  registers: [metricsRegistry],
});

/**
 * Cache metrics
 */
export const cacheHitCounter = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_name'],
  registers: [metricsRegistry],
});

export const cacheMissCounter = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_name'],
  registers: [metricsRegistry],
});

/**
 * Circuit breaker metrics
 */
export const circuitBreakerStateGauge = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['breaker_name'],
  registers: [metricsRegistry],
});

export const circuitBreakerFailureCounter = new Counter({
  name: 'circuit_breaker_failures_total',
  help: 'Total number of circuit breaker failures',
  labelNames: ['breaker_name'],
  registers: [metricsRegistry],
});

/**
 * Business metrics
 */
export const businessEventCounter = new Counter({
  name: 'business_events_total',
  help: 'Total number of business events',
  labelNames: ['event_type', 'status'],
  registers: [metricsRegistry],
});

/**
 * Track HTTP request
 */
export function trackHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  duration: number
): void {
  try {
    httpRequestCounter.inc({
      method,
      route,
      status_code: statusCode,
    });

    httpRequestDuration.observe(
      {
        method,
        route,
        status_code: statusCode,
      },
      duration / 1000
    );
  } catch (error : any) {
    logger.error('Failed to track HTTP request metrics', {
      error: (error as Error).message,
    });
  }
}

/**
 * Track database query
 */
export function trackDatabaseQuery(
  operation: string,
  collection: string,
  status: 'success' | 'error',
  duration: number
): void {
  try {
    databaseQueryCounter.inc({
      operation,
      collection,
      status,
    });

    databaseQueryDuration.observe(
      {
        operation,
        collection,
      },
      duration / 1000
    );
  } catch (error : any) {
    logger.error('Failed to track database query metrics', {
      error: (error as Error).message,
    });
  }
}

/**
 * Track queue job
 */
export function trackQueueJob(
  queue: string,
  jobType: string,
  status: 'completed' | 'failed' | 'started',
  duration?: number
): void {
  try {
    queueJobCounter.inc({
      queue,
      status,
    });

    if (duration !== undefined) {
      queueJobDuration.observe(
        {
          queue,
          job_type: jobType,
        },
        duration / 1000
      );
    }
  } catch (error : any) {
    logger.error('Failed to track queue job metrics', {
      error: (error as Error).message,
    });
  }
}

/**
 * Update queue size
 */
export function updateQueueSize(queue: string, size: number): void {
  try {
    queueSize.set({ queue }, size);
  } catch (error : any) {
    logger.error('Failed to update queue size metric', {
      error: (error as Error).message,
    });
  }
}

/**
 * Track cache hit/miss
 */
export function trackCache(cacheName: string, isHit: boolean): void {
  try {
    if (isHit) {
      cacheHitCounter.inc({ cache_name: cacheName });
    } else {
      cacheMissCounter.inc({ cache_name: cacheName });
    }
  } catch (error : any) {
    logger.error('Failed to track cache metrics', {
      error: (error as Error).message,
    });
  }
}

/**
 * Track circuit breaker state
 */
export function trackCircuitBreakerState(
  breakerName: string,
  state: 'closed' | 'half-open' | 'open'
): void {
  try {
    const stateValue = state === 'closed' ? 0 : state === 'half-open' ? 1 : 2;
    circuitBreakerStateGauge.set({ breaker_name: breakerName }, stateValue);
  } catch (error : any) {
    logger.error('Failed to track circuit breaker state', {
      error: (error as Error).message,
    });
  }
}

/**
 * Track circuit breaker failure
 */
export function trackCircuitBreakerFailure(breakerName: string): void {
  try {
    circuitBreakerFailureCounter.inc({ breaker_name: breakerName });
  } catch (error : any) {
    logger.error('Failed to track circuit breaker failure', {
      error: (error as Error).message,
    });
  }
}

/**
 * Track business event
 */
export function trackBusinessEvent(eventType: string, status: 'success' | 'error'): void {
  try {
    businessEventCounter.inc({
      event_type: eventType,
      status,
    });
  } catch (error : any) {
    logger.error('Failed to track business event', {
      error: (error as Error).message,
    });
  }
}

/**
 * Get all metrics
 */
export async function getMetrics(): Promise<string> {
  try {
    return await metricsRegistry.metrics();
  } catch (error : any) {
    logger.error('Failed to get metrics', {
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Reset all metrics
 */
export function resetMetrics(): void {
  try {
    metricsRegistry.resetMetrics();
    logger.info('All metrics reset successfully');
  } catch (error : any) {
    logger.error('Failed to reset metrics', {
      error: (error as Error).message,
    });
  }
}

export default {
  metricsRegistry,
  trackHttpRequest,
  trackDatabaseQuery,
  trackQueueJob,
  updateQueueSize,
  trackCache,
  trackCircuitBreakerState,
  trackCircuitBreakerFailure,
  trackBusinessEvent,
  getMetrics,
  resetMetrics,
};