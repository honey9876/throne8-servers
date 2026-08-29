// src/middleware/error.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import logger, { LogCategory } from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';
/**
 * Error Handling Middleware
 * Centralized error handler for the Connection Service.
 * Catches errors, formats responses, logs details, and handles specific error types.
 * Optimized for 1M+ users with structured logging and graceful error responses.
 * 
 * Features:
 * - Handles custom ErrorResponse instances
 * - Logs errors with stack traces (dev only)
 * - Returns standardized JSON error responses
 * - Supports audit logging for critical errors
 * - Handles 404 Not Found automatically
 * - Production-ready: hides sensitive details in prod
 * 
 * Dependencies:
 * - express: For Request, Response, NextFunction, Error types
 * - response.ts: For ErrorResponse, HttpStatus
 * - logger.ts: For error logging (winston-based with auditLog)
 * - environment.ts: For NODE_ENV, AUDIT_LOG_ENABLED
 * 
 * Scalability Considerations:
 * - Non-blocking async logging
 * - Consistent response format for API consumers
 * - Stack trace only in dev for security
 * 
 * Integration:
 * - Used by app.ts/server.ts as last middleware: app.use(errorMiddleware)
 * - Handles errors from controllers (e.g., profileViewController.ts, connectionController.ts)
 * - Aligns with API_DOCS.md for error formats
 * - Supports .env (NODE_ENV, AUDIT_LOG_ENABLED), tsconfig.json
 */

/**
 * Centralized error handler
 * @param err Error object (Error or ErrorResponse)
 * @param req Request
 * @param res Response
 * @param next NextFunction (unused, but required)
 */
export const errorMiddleware = (err: Error | ErrorResponse, req: Request, res: Response, next: NextFunction): void => {
  // If response already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Determine status and message
  const status = err instanceof ErrorResponse ? err.statusCode : HttpStatus.INTERNAL_SERVER_ERROR;
  const message = err.message || 'Internal Server Error';
  const details = process.env.NODE_ENV === 'development' ? (err.stack || err.toString()) : undefined;

  // Log the error
  logger.error('Unhandled error', {
    path: req.path,
    method: req.method,
    userId: req.user?.id || 'anonymous',
    error: message,
    stack: err.stack,
    details: err instanceof ErrorResponse ? err.errorDetails : undefined,
    category: LogCategory.SYSTEM,
  });

  // Audit log for critical errors
  if (environmentConfig.AUDIT_LOG_ENABLED && status >= 500) {
    logger.auditLog('server_error', req.user?.id || 'unknown', {
      path: req.path,
      method: req.method,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }

  // Send response
  res.status(status).json({
    success: false,
    message,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
  });
};

/**
 * 404 Not Found handler (place before errorMiddleware in app)
 * @param req Request
 * @param res Response
 * @param next NextFunction
 */
export const notFoundMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const err = new ErrorResponse(`Not Found: ${req.method} ${req.originalUrl}`, HttpStatus.NOT_FOUND);
  next(err);
};

// Export for easy use
export default { errorMiddleware, notFoundMiddleware };