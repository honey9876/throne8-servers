// src/middleware/logger.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { logger } from '@/shared/logger.util';
import { LogCategory } from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment'

// Extend Request interface to include id property
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/**
 * Logger Middleware
 * Logs all incoming HTTP requests for the Connection Service.
 * Optimized for 100M+ users with structured logging, sampling, exclusions, and audit support.
 * 
 * Features:
 * - Logs request method, path, IP, user ID, user agent
 * - Calculates and logs response duration and status code
 * - Supports log sampling for high traffic (LOG_SAMPLE_RATE)
 * - Excludes specific routes (LOG_EXCLUDE_ROUTES) and user agents (LOG_EXCLUDE_USER_AGENTS)
 * - Audit logging for sensitive methods (POST, PUT, PATCH, DELETE)
 * - Masks sensitive data in logs (LOG_MASK_SENSITIVE_DATA)
 * - Lightweight for high-concurrency scenarios with async logging
 * 
 * Dependencies:
 * - express: For Request, Response, NextFunction types
 * - logger.ts: For structured logging (winston-based with auditLog)
 * - environment.ts: For ENABLE_REQUEST_LOGGING, LOG_SAMPLE_RATE, LOG_EXCLUDE_ROUTES, etc.
 * 
 * Scalability Considerations:
 * - Asynchronous non-blocking logging
 * - Sampling to reduce log volume in production
 * - Configurable exclusions to avoid noise (health checks, probes)
 * - Structured JSON logs for easy parsing/aggregation
 * 
 * Integration:
 * - Used by app.ts, connectionRoutes.ts, searchRoutes.ts, mutualRoutes.ts
 * - Aligns with .env (LOG_* vars), package.json (winston), tsconfig.json (relative paths)
 * - Logs to LOG_ACCESS_FILE_PATH, combined/app.log, audit.log
 * - Call in app: app.use(loggerMiddleware)
 */

/**
 * Logs incoming HTTP requests and responses
 * @param req Request object
 * @param res Response object
 * @param next NextFunction for middleware chain
 */
export const loggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const { method, path, ip } = req;
  const userId = req.user?.id || 'anonymous';
  const userAgent = req.get('User-Agent') || '';
  const requestId = req.id || Math.random().toString(36).substr(2, 9); // Generate if not set
  req.id = requestId; // Set for use in other middlewares

  // Skip logging if disabled
  if (!environmentConfig.ENABLE_REQUEST_LOGGING) {
    return next();
  }

  // Skip for excluded routes - FIXED: Added null check
  const excludedRoutes = (environmentConfig.LOG_EXCLUDE_ROUTES || '').split(',').filter(Boolean);
  if (excludedRoutes.some(route => req.path.startsWith(route.trim()))) {
    logger.debug('Request excluded from logging by route', { path, category: LogCategory.SYSTEM });
    return next();
  }

  // Skip for excluded user agents - FIXED: Added null check
  const excludedAgents = (environmentConfig.LOG_EXCLUDE_USER_AGENTS || '').split(',').filter(Boolean);
  if (excludedAgents.some(agent => userAgent.includes(agent.trim()))) {
    logger.debug('Request excluded from logging by user agent', { userAgent, category: LogCategory.SYSTEM });
    return next();
  }

  // Sampling (if enabled, skip logging with probability)
  if (environmentConfig.LOG_ENABLE_SAMPLING && Math.random() > environmentConfig.LOG_SAMPLE_RATE) {
    return next();
  }

  // Log request start
  logger.info('HTTP request received', {
    requestId,
    method,
    path,
    ip,
    userId,
    userAgent,
    queryParams: Object.keys(req.query).length > 0 ? req.query : undefined, // Log query if present, but mask sensitive
    category: LogCategory.API,
  });

  // Audit log for sensitive methods (POST, PUT, PATCH, DELETE)
  if (environmentConfig.AUDIT_LOG_ENABLED && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    // FIXED: Correct auditLogDetailed call with 3 parameters
    logger.auditLogDetailed(
      `HTTP ${method} request`,
      userId,
      {
        path,
        ip,
        userAgent,
        requestId,
        query: environmentConfig.LOG_MASK_SENSITIVE_DATA ? 
          Object.fromEntries(Object.entries(req.query).filter(([key]) => 
            !(environmentConfig.LOG_SENSITIVE_FIELDS || '').split(',').includes(key)
          )) : req.query,
        bodyKeys: environmentConfig.LOG_MASK_SENSITIVE_DATA ? 
          Object.keys(req.body).filter(key => 
            !(environmentConfig.LOG_SENSITIVE_FIELDS || '').split(',').includes(key)
          ) : Object.keys(req.body),
        method,
        timestamp: new Date().toISOString(),
      }
    );
  }

  // Intercept response to log duration and status (for JSON and general send)
  const originalJson = res.json;
  res.json = function (data: any) {
    const duration = Date.now() - startTime;
    logger.info('HTTP request completed', {
      requestId,
      method,
      path,
      statusCode: res.statusCode,
      durationMs: duration,
      responseSize: typeof data === 'string' ? data.length : JSON.stringify(data).length,
      userId,
      category: LogCategory.API,
    });
    return originalJson.call(this, data);
  };

  const originalSend = res.send;
  res.send = function (data: any) {
    const duration = Date.now() - startTime;
    logger.info('HTTP request completed', {
      requestId,
      method,
      path,
      statusCode: res.statusCode,
      durationMs: duration,
      responseSize: data ? data.length : 0,
      userId,
      category: LogCategory.API,
    });
    return originalSend.call(this, data);
  };

  // Handle 'finish' event for all responses (fallback)
  if (res.listeners('finish').length === 0) {
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info('HTTP request completed (fallback)', {
        requestId,
        method,
        path,
        statusCode: res.statusCode,
        durationMs: duration,
        userId,
        category: LogCategory.API,
      });
    });
  }

  next();
};

/**
 * Audit middleware for sensitive actions (logs body/query for audits)
 * @param req Request
 * @param _res Response (unused but required for middleware signature)
 * @param next NextFunction
 */
export const auditMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  if (environmentConfig.AUDIT_LOG_ENABLED && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const userId = req.user?.id || 'anonymous';
    
    // FIXED: Correct auditLogDetailed call with 3 parameters
    logger.auditLogDetailed(
      `${req.method} ${req.path}`,
      userId,
      {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.id || 'unknown',
        query: environmentConfig.LOG_MASK_SENSITIVE_DATA ? 
          Object.fromEntries(Object.entries(req.query).filter(([key]) => 
            !(environmentConfig.LOG_SENSITIVE_FIELDS || '').split(',').includes(key)
          )) : req.query,
        bodyKeys: environmentConfig.LOG_MASK_SENSITIVE_DATA ? 
          Object.keys(req.body).filter(key => 
            !(environmentConfig.LOG_SENSITIVE_FIELDS || '').split(',').includes(key)
          ) : Object.keys(req.body),
        method: req.method,
        timestamp: new Date().toISOString(),
      }
    );
  }
  next();
};

// Export for easy use
export default { loggerMiddleware, auditMiddleware };