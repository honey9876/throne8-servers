// utils/metrics.ts
import { EventEmitter } from 'events';
import { logger } from '@/shared/logger.util';
import promClient from "prom-client";
import * as prometheus from 'prom-client';

// Prometheus metrics

export const serviceLatency = new promClient.Histogram({
  name: "quality_trust_service_latency_seconds",
  help: "Quality Trust service operation latency in seconds",
  labelNames: ["operation"],
});

export const serviceErrors = new promClient.Counter({
  name: "quality_trust_service_errors_total",
  help: "Total Quality Trust service errors",
  labelNames: ["operation"],
});

export const aiOperationLatency = new promClient.Histogram({
  name: "ai_service_operation_latency_seconds",
  help: "AI service operation latency in seconds",
  labelNames: ["operation"],
});

export const aiOperationErrors = new promClient.Counter({
  name: "ai_service_operation_errors_total",
  help: "Total AI service operation errors",
  labelNames: ["operation"],
});

export const requestCounter = new promClient.Counter({
  name: "quality_trust_controller_requests_total",
  help: "Total Quality Trust controller requests",
  labelNames: ["endpoint", "status"],
});

export const requestLatency = new promClient.Histogram({
  name: "quality_trust_controller_latency_seconds",
  help: "Quality Trust controller request latency in seconds",
  labelNames: ["endpoint"],
});

// Prometheus metrics
export const ai_requestCounter = new promClient.Counter({
  name: "ai_controller_requests_total",
  help: "Total AI controller requests",
  labelNames: ["endpoint", "status"],
});

export const ai_requestLatency = new promClient.Histogram({
  name: "ai_controller_request_latency_seconds",
  help: "AI controller request latency in seconds",
  labelNames: ["endpoint"],
});

// Prometheus metrics
export const schemaOperationLatency = new promClient.Histogram({
  name: "quality_trust_schema_operation_latency_seconds",
  help: "Latency of QualityTrust schema operations in seconds",
  labelNames: ["operation"],
});

export const schemaOperationErrors = new promClient.Counter({
  name: "quality_trust_schema_operation_errors_total",
  help: "Total errors in QualityTrust schema operations",
  labelNames: ["operation"],
});


export const searchDuration = new prometheus.Histogram({
  name: 'search_duration_seconds',
  help: 'Search request duration in seconds',
  labelNames: ['search_type', 'status', 'user_type'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

export const searchRequests = new prometheus.Counter({
  name: 'search_requests_total',
  help: 'Total number of search requests',
  labelNames: ['search_type', 'status']
});

export const activeSearches = new prometheus.Gauge({
  name: 'active_searches_total',
  help: 'Number of currently active search requests'
});

export const cacheHits = new prometheus.Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_type']
});


/**
 * Metrics Collector for Production Monitoring
 * Supports 500K+ users with efficient in-memory aggregation
 */
class MetricsCollector extends EventEmitter {
    private metrics: Map<string, any>;
    private counters: Map<string, number>;
    private gauges: Map<string, number>;
    private histograms: Map<string, number[]>;
    private timers: Map<string, number>;
    private flushInterval: NodeJS.Timeout | null;
    private readonly flushIntervalMs: number;
    private readonly maxHistogramSize: number;

    constructor() {
        super();
        this.metrics = new Map();
        this.counters = new Map();
        this.gauges = new Map();
        this.histograms = new Map();
        this.timers = new Map();
        this.flushInterval = null;
        this.flushIntervalMs = 60000; // Flush every 60 seconds
        this.maxHistogramSize = 1000; // Prevent memory bloat

        this.startAutoFlush();
    }

    /**
     * Increment a counter
     */
    increment(metric: string, tags: Record<string, any> = {}, value: number = 1): void {
        try {
            const key = this.generateKey(metric, tags);
            const current = this.counters.get(key) || 0;
            this.counters.set(key, current + value);

            this.emit('metric', {
                type: 'counter',
                metric,
                value: current + value,
                tags,
                timestamp: Date.now()
            });
        } catch (error: any) {
            logger.error('Failed to increment counter', { metric, error: error.message });
        }
    }

    /**
     * Decrement a counter
     */
    decrement(metric: string, tags: Record<string, any> = {}, value: number = 1): void {
        this.increment(metric, tags, -value);
    }

    /**
     * Set a gauge value
     */
    gauge(metric: string, value: number, tags: Record<string, any> = {}): void {
        try {
            const key = this.generateKey(metric, tags);
            this.gauges.set(key, value);

            this.emit('metric', {
                type: 'gauge',
                metric,
                value,
                tags,
                timestamp: Date.now()
            });
        } catch (error: any) {
            logger.error('Failed to set gauge', { metric, error: error.message });
        }
    }

    /**
     * Record a histogram value
     */
    histogram(metric: string, value: number, tags: Record<string, any> = {}): void {
        try {
            const key = this.generateKey(metric, tags);
            let values = this.histograms.get(key) || [];

            // Prevent memory bloat
            if (values.length >= this.maxHistogramSize) {
                values = values.slice(-Math.floor(this.maxHistogramSize / 2));
            }

            values.push(value);
            this.histograms.set(key, values);

            this.emit('metric', {
                type: 'histogram',
                metric,
                value,
                tags,
                timestamp: Date.now()
            });
        } catch (error: any) {
            logger.error('Failed to record histogram', { metric, error: error.message });
        }
    }

    /**
     * Start a timer
     */
    startTimer(metric: string, tags: Record<string, any> = {}): () => void {
        const key = this.generateKey(metric, tags);
        const startTime = Date.now();
        this.timers.set(key, startTime);

        return () => {
            const duration = Date.now() - startTime;
            this.histogram(`${metric}.duration`, duration, tags);
            this.timers.delete(key);
            return duration;
        };
    }

    /**
     * Time an async function
     */
    async timeAsync<T>(
        metric: string,
        fn: () => Promise<T>,
        tags: Record<string, any> = {}
    ): Promise<T> {
        const stopTimer = this.startTimer(metric, tags);
        try {
            const result = await fn();
            stopTimer();
            this.increment(`${metric}.success`, tags);
            return result;
        } catch(error : any) {
            stopTimer();
            this.increment(`${metric}.error`, tags);
            throw error;
        }
    }

    /**
     * Get current metrics summary
     */
    getSummary(): any {
        const summary: any = {
            counters: {},
            gauges: {},
            histograms: {},
            timestamp: Date.now()
        };

        // Counters
        this.counters.forEach((value, key) => {
            summary.counters[key] = value;
        });

        // Gauges
        this.gauges.forEach((value, key) => {
            summary.gauges[key] = value;
        });

        // Histograms with statistics
        this.histograms.forEach((values, key) => {
            if (values.length > 0) {
                const sorted = [...values].sort((a, b) => a - b);
                summary.histograms[key] = {
                    count: values.length,
                    min: sorted[0],
                    max: sorted[sorted.length - 1],
                    mean: values.reduce((a, b) => a + b, 0) / values.length,
                    median: sorted[Math.floor(sorted.length / 2)],
                    p95: sorted[Math.floor(sorted.length * 0.95)],
                    p99: sorted[Math.floor(sorted.length * 0.99)]
                };
            }
        });

        return summary;
    }

    /**
     * Flush metrics to external system (e.g., Prometheus, DataDog)
     */
    async flush(): Promise<void> {
        try {
            const summary = this.getSummary();

            // Log summary
            logger.info('Metrics Summary', summary);

            // Emit flush event for external handlers
            this.emit('flush', summary);

            // Reset histograms after flush
            this.histograms.clear();

        } catch (error: any) {
            logger.error('Failed to flush metrics', { error: error.message });
        }
    }

    /**
     * Start auto-flush interval
     */
    private startAutoFlush(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }

        this.flushInterval = setInterval(() => {
            this.flush();
        }, this.flushIntervalMs);

        // Ensure cleanup on process exit
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
    }

    /**
     * Stop metrics collector
     */
    stop(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        this.flush(); // Final flush
    }

    /**
     * Generate metric key with tags
     */
    private generateKey(metric: string, tags: Record<string, any>): string {
        const tagStr = Object.entries(tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${v}`)
            .join(',');
        return tagStr ? `${metric}{${tagStr}}` : metric;
    }

    /**
     * Record request metrics
     */
    recordRequest(
        method: string,
        path: string,
        statusCode: number,
        duration: number
    ): void {
        const tags = { method, path, status: Math.floor(statusCode / 100) + 'xx' };

        this.increment('http.requests.total', tags);
        this.histogram('http.request.duration', duration, tags);

        if (statusCode >= 400) {
            this.increment('http.requests.errors', tags);
        }
    }

    /**
     * Record database query metrics
     */
    recordDbQuery(operation: string, collection: string, duration: number, success: boolean): void {
        const tags = { operation, collection, success: success.toString() };

        this.increment('db.queries.total', tags);
        this.histogram('db.query.duration', duration, tags);

        if (!success) {
            this.increment('db.queries.errors', tags);
        }
    }

    /**
     * Record cache metrics
     */
    recordCache(operation: string, hit: boolean): void {
        const tags = { operation, result: hit ? 'hit' : 'miss' };

        this.increment('cache.operations', tags);

        if (hit) {
            this.increment('cache.hits', { operation });
        } else {
            this.increment('cache.misses', { operation });
        }
    }

    /**
     * Record upload metrics
     */
    recordUpload(fileType: string, size: number, duration: number, success: boolean): void {
        const tags = { fileType, success: success.toString() };

        this.increment('uploads.total', tags);
        this.histogram('uploads.size', size, tags);
        this.histogram('uploads.duration', duration, tags);

        if (!success) {
            this.increment('uploads.errors', tags);
        }
    }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();

// Export for testing
export { MetricsCollector };