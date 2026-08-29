// src/connections/middleware/metrics.middleware.ts

import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';
import logger, { LogCategory } from '../../shared/logger.util';
import environmentConfig from '../../config/environment/environment';

// Initialize Prometheus registry
const register = new client.Registry();

// Metrics
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'],
  buckets: [50, 100, 200, 300, 500, 1000, 2000, 5000],
});

const httpRequestCount = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'code'],
});

const httpRequestSizeBytes = new client.Summary({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP requests in bytes',
  labelNames: ['method', 'route'],
});

const httpResponseSizeBytes = new client.Summary({
  name: 'http_response_size_bytes',
  help: 'Size of HTTP responses in bytes',
  labelNames: ['method', 'route', 'code'],
});

// Register metrics
register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(httpRequestCount);
register.registerMetric(httpRequestSizeBytes);
register.registerMetric(httpResponseSizeBytes);

// Collect default metrics
client.collectDefaultMetrics({ register });

/**
 * Metrics Middleware
 * Collects Prometheus metrics for API performance in the Connection Service.
 * Optimized for monitoring with Grafana/Prometheus.
 * 
 * Features:
 * - Request duration histogram
 * - Request/response size summaries
 * - Total request counter
 * - Default Node.js metrics
 * - Exposed at /metrics endpoint
 * - Logging for metric collection errors
 * 
 * Dependencies:
 * - prom-client: For Prometheus metrics
 * - express: For types
 * - logger.ts: For error logging
 * - environment.ts: For ENABLE_METRICS
 * 
 * Scalability Considerations:
 * - Low-overhead metric collection
 * - Buckets optimized for API latencies
 * 
 * Integration:
 * - Used by app.ts: app.use(metricsMiddleware)
 * - Expose /metrics: app.get('/metrics', metricsEndpoint)
 * - Aligns with prometheus.yml, grafana-dashboard.json
 * - Supports Docker/Kubernetes monitoring
 */

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // if (!environmentConfig.ENABLE_METRICS) {
  if (!(environmentConfig as any).ENABLE_METRICS) {
    return next();
  }

  const start = Date.now();
  const route = req.route?.path || req.path;

  // Measure request size
  let reqSize = 0;
  if (req.body) {
    reqSize = Buffer.byteLength(JSON.stringify(req.body));
  }
  httpRequestSizeBytes.labels(req.method, route).observe(reqSize);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode.toString();

    try {
      // Response size (approximate)
      let resSize = 0;
      if (res.locals.body) {
        resSize = Buffer.byteLength(JSON.stringify(res.locals.body));
      }

      // Record metrics
      httpRequestDurationMicroseconds.labels(req.method, route, status).observe(duration);
      httpRequestCount.labels(req.method, route, status).inc();
      httpResponseSizeBytes.labels(req.method, route, status).observe(resSize);

      logger.debug('Metrics recorded', {
        method: req.method,
        route,
        statusCode: res.statusCode,
        duration,
        category: LogCategory.PERFORMANCE,
      });
    } catch (error : any) {
      logger.error('Error recording metrics', {
        error: error instanceof Error ? error.message : String(error),
        category: LogCategory.SYSTEM,
      });
    }
  });

  next();
};

/**
 * Metrics endpoint handler
 * @param _req Request (unused)
 * @param res Response
 */
export const metricsEndpoint = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error : any) {
    logger.error('Failed to serve metrics', {
      error: error instanceof Error ? error.message : String(error),
      category: LogCategory.SYSTEM,
    });
    res.status(500).end();
  }
};

// Export for easy use
export default { metricsMiddleware, metricsEndpoint };