// src/middleware/async.middleware.ts
/**
 * Async Middleware Utility - Production-Ready for 100M+ Users
 * 
 * Features:
 * - Wraps async route handlers to catch errors automatically
 * - Integrates with ErrorResponse for standardized error responses
 * - Performance metrics tracking with MetricsCollector
 * - Comprehensive logging with correlation IDs
 * - Supports audit logging for critical errors
 * - Separate handlers for routes and middleware
 * - Lightweight and performant for high-concurrency scenarios
 * 
 * @module middleware/async.middleware
 * @version 2.0.0
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.util';
import { metricsCollector } from '../metrics';
import { ErrorResponse, HttpStatus } from '../response.util';
import environmentConfig from '@/config/environment/environment';

// ==================== TYPE DEFINITIONS ====================

type AsyncHandlerFunction = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<void> | Promise<any> | void;

type AsyncMiddlewareFunction = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<void> | Promise<any> | void;

// ==================== MAIN ASYNC HANDLER ====================

/**
 * Primary async handler for route controllers
 * - Catches async errors
 * - Records performance metrics
 * - Logs request completion
 * - Handles both sync and async functions
 * 
 * @param fn Async route handler function
 * @returns Wrapped function with error handling and metrics
 * 
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await getUsersFromDB();
 *   res.json(users);
 * }));
 */
export function asyncHandler(fn: AsyncHandlerFunction) {
    return (req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || (req as any).id;

        // Execute the handler function
        const result = fn(req, res, next);

        // If function returns a promise, handle it
        if (result && typeof result.then === 'function') {
            Promise.resolve(result)
                .then(() => {
                    const duration = Date.now() - startTime;

                    // Record successful request metrics
                    if (metricsCollector) {
                        metricsCollector.recordRequest(
                            req.method,
                            req.path,
                            res.statusCode,
                            duration
                        );
                    }

                    // Log successful completion
                    logger.debug('Request completed successfully', {
                        method: req.method,
                        path: req.path,
                        statusCode: res.statusCode,
                        duration,
                        correlationId,
                        userId: (req as any).user?.id || 'anonymous',
                    });
                })
                .catch((error: Error) => {
                    handleAsyncError(error, req, next, startTime);
                });
        }
        // Handle sync errors
        else {
            try {
                return result;
            } catch (error : any) {
                handleAsyncError(error as Error, req, next, startTime);
            }
        }
    };
}

// ==================== MIDDLEWARE-SPECIFIC HANDLER ====================

/**
 * Async handler specifically for middleware functions
 * - Lighter weight than asyncHandler
 * - No metrics recording
 * - Focused on error catching only
 * 
 * @param fn Async middleware function
 * @returns Wrapped middleware with error handling
 * 
 * @example
 * app.use(catchAsyncMiddleware(async (req, res, next) => {
 *   await validateToken(req);
 *   next();
 * }));
 */
export function catchAsyncMiddleware(fn: AsyncMiddlewareFunction) {
    return (req: Request, res: Response, next: NextFunction) => {
        const correlationId = (req as any).correlationId || (req as any).id;

        Promise.resolve(fn(req, res, next))
            .catch((error: Error) => {
                logger.error('Async middleware error', {
                    error: error.message,
                    path: req.path,
                    method: req.method,
                    correlationId,
                    stack: error.stack,
                    userId: (req as any).user?.id || 'anonymous',
                });
                next(error);
            });
    };
}

// ==================== ERROR HANDLING LOGIC ====================

/**
 * Centralized error handling logic for async operations
 * @param error The error that occurred
 * @param req Express request object
 * @param next Express next function
 * @param startTime Request start timestamp for duration calculation
 */
function handleAsyncError(
    error: Error,
    req: Request,
    next: NextFunction,
    startTime: number
) {
    const duration = Date.now() - startTime;
    const correlationId = (req as any).correlationId || (req as any).id;

    // Convert to ErrorResponse if not already
    const errorResponse = error instanceof ErrorResponse
        ? error
        : new ErrorResponse(
            error.message || 'Internal server error',
            HttpStatus.INTERNAL_SERVER_ERROR,
            error.stack ?? ''
        );

    // Record failed request metrics
    if (metricsCollector) {
        metricsCollector.recordRequest(
            req.method,
            req.path,
            errorResponse.statusCode,
            duration
        );
    }

    // Log error with comprehensive details
    logger.error('Async handler caught error', {
        path: req.path,
        method: req.method,
        userId: (req as any).user?.id || 'anonymous',
        error: errorResponse.message,
        statusCode: errorResponse.statusCode,
        details: errorResponse.errorDetails,
        stack: error.stack,
        duration,
        correlationId,
        body: sanitizeRequestBody(req.body),
        query: req.query,
        params: req.params,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
    });

    // Audit log for critical errors (5xx)
    if (environmentConfig.AUDIT_LOG_ENABLED && errorResponse.statusCode >= 500) {
        logger.error('async_handler_critical_error', {
            userId: (req as any).user?.id || 'unknown',
            method: req.method,
            path: req.path,
            error: errorResponse.message,
            statusCode: errorResponse.statusCode,
            duration,
            correlationId,
            timestamp: new Date().toISOString(),
        });
    }

    // Pass error to error handling middleware
    next(errorResponse);
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Sanitize request body to remove sensitive data before logging
 * @param body Request body object
 * @returns Sanitized body with sensitive fields redacted
 */
function sanitizeRequestBody(body: any): any {
    if (!body || typeof body !== 'object') return body;

    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
    const sanitized = { ...body };

    sensitiveFields.forEach((field) => {
        if (sanitized[field]) {
            sanitized[field] = '***REDACTED***';
        }
    });

    return sanitized;
}

// ==================== BACKWARDS COMPATIBILITY ====================

/**
 * Alias for asyncHandler for backwards compatibility
 * @deprecated Use asyncHandler instead
 */
export const catchAsync = asyncHandler;

// ==================== EXPORTS ====================

export default asyncHandler;