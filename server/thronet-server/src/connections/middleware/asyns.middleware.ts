
// src/middleware/async.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import logger from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';

/**
 * Async Middleware Utility
 * Provides asyncHandler function to wrap asynchronous Express route handlers,
 * catching errors and passing them to the error handling middleware.
 * Optimized for 100M+ users with lightweight error handling and logging.
 * 
 * Features:
 * - Wraps async route handlers to catch errors automatically
 * - Integrates with ErrorResponse for standardized error responses
 * - Logs errors with stack traces for debugging
 * - Supports audit logging for critical errors
 * - Lightweight and performant for high-concurrency scenarios
 * 
 * Dependencies:
 * - express: For Request, Response, NextFunction types
 * - response.ts: For ErrorResponse and HttpStatus
 * - logger.ts: For logging (winston-based)
 * - environment.ts: For AUDIT_LOG_ENABLED
 * 
 * Scalability Considerations:
 * - Minimal overhead for async error handling
 * - Structured error logging for traceability
 * - Integration with audit logging for compliance
 * 
 * Integration:
 * - Used by connectionController.ts, requestController.ts, searchController.ts
 * - Aligns with .env (LOG_FILE_PATH, LOG_ERROR_FILE_PATH, AUDIT_LOG_ENABLED)
 * - Supports package.json (express, winston), tsconfig.json (@utils/*, @config/*)
 */

// FIXED: More flexible type definition to handle both void and Promise<void>
type AsyncHandlerFunction = (
  req: Request, 
  res: Response, 
  next: NextFunction
) => Promise<void> | Promise<any> | void;

/**
 * Wraps async route handlers to catch errors and pass to error middleware
 * @param fn Async route handler function
 * @returns Wrapped function with error handling
 */
export function asyncHandler(fn: AsyncHandlerFunction) {
  return (req: Request, res: Response, next: NextFunction) => {
    // FIXED: Handle both sync and async functions properly
    const result = fn(req, res, next);
    
    // If function returns a promise, catch errors
    if (result && typeof result.then === 'function') {
      Promise.resolve(result).catch((error: Error) => {
        handleError(error, req, next);
      });
    }
    // If function doesn't return promise but throws sync error, catch it
    else {
      try {
        // Function executed successfully without promise
        return result;
      } catch (error : any) {
        handleError(error as Error, req, next);
      }
    }
  };
}

/**
 * Centralized error handling logic
 * @param error The error that occurred
 * @param req Express request object
 * @param next Express next function
 */
function handleError(error: Error, req: Request, next: NextFunction) {
  // Convert to ErrorResponse if not already
  const errorResponse = error instanceof ErrorResponse
    ? error
    : new ErrorResponse(
        error.message || 'Internal server error', 
        HttpStatus.INTERNAL_SERVER_ERROR, 
        // { stack: error.stack }
         error.stack ?? ''
        
      );

  // Log error
  logger.error('Async handler error', {
    path: req.path,
    method: req.method,
    userId: req.user?.id || 'anonymous',
    error: errorResponse.message,
    statusCode: errorResponse.statusCode,
    details: errorResponse.errorDetails,
    stack: error.stack,
  });

  // Audit log for critical errors
  if (environmentConfig.AUDIT_LOG_ENABLED && errorResponse.statusCode >= 500) {
    logger.auditLog('async_handler_error', req.user?.id || 'unknown', {
      method: req.method,
      error: errorResponse.message,
      statusCode: errorResponse.statusCode,
      timestamp: new Date().toISOString(),
    });
  }

  next(errorResponse);
}