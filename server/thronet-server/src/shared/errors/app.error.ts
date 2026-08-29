// errors/app.error.ts
import { logger } from "@/shared/logger.util";

/**
 * Custom Application Error Class
 * Production-ready error handling with logging and metrics
 */
export class AppError extends Error {
    [x: string]: any;
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly errors: any[];
    public readonly timestamp: Date;
    public readonly errorCode?: string;
    public readonly metadata?: any;

    constructor(
        message: string,
        statusCode: number = 500,
        isOperational: boolean = true,
        errors: any[] = [],
        errorCode?: string,
        metadata?: any
    ) {
        super(message);

        Object.setPrototypeOf(this, new.target.prototype);

        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.errors = errors;
        this.timestamp = new Date();
        this.errorCode = errorCode;
        this.metadata = metadata;

        Error.captureStackTrace(this, this.constructor);

        // Log error for monitoring
        if (!isOperational) {
            logger.error('Non-operational error occurred', {
                message: this.message,
                statusCode: this.statusCode,
                stack: this.stack,
                errorCode: this.errorCode,
                metadata: this.metadata
            });
        }
    }
}

/**
 * Validation Error
 */
export class ValidationError extends AppError {
    constructor(message: string, errors: any[] = []) {
        super(message, 400, true, errors, 'VALIDATION_ERROR');
    }
}

/**
 * Authentication Error
 */
export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication failed', errors: any[] = []) {
        super(message, 401, true, errors, 'AUTH_ERROR');
    }
}

/**
 * Authorization Error
 */
export class AuthorizationError extends AppError {
    constructor(message: string = 'Access denied', errors: any[] = []) {
        super(message, 403, true, errors, 'AUTHORIZATION_ERROR');
    }
}

/**
 * Not Found Error
 */
export class NotFoundError extends AppError {
    constructor(resource: string = 'Resource', errors: any[] = []) {
        super(`${resource} not found`, 404, true, errors, 'NOT_FOUND');
    }
}

/**
 * Forbidden Error (Alias for AuthorizationError)
 */
export class ForbiddenError extends AppError {
    constructor(resource: string = 'Access denied', errors: any[] = []) {
        super(`${resource} forbidden`, 403, true, errors, 'FORBIDDEN');
    }
}

/**
 * TooManyRequests Error (Alias for AuthorizationError)
 */
export class TooManyRequestsError extends AppError {
    constructor(resource: string = 'Access denied', errors: any[] = []) {
        super(`${resource} Too Many Requests`, 429, true, errors, 'TOO MANY REQUESTS');
    }
}

export class BadRequestError extends AppError {
    constructor(resource: string = 'Bad request', errors: any[] = []) {
        super(`${resource} Too Many Requests`, 400, true, errors, 'BAD_REQUEST');
    }
}

/**
 * Conflict Error
 */
export class ConflictError extends AppError {
    constructor(message: string, errors: any[] = []) {
        super(message, 409, true, errors, 'CONFLICT_ERROR');
    }
}

/**
 * Rate Limit Error
 */
export class RateLimitError extends AppError {
    constructor(retryAfter: number = 60) {
        super(
            `Too many requests. Please try again after ${retryAfter} seconds.`,
            429,
            true,
            [],
            'RATE_LIMIT_EXCEEDED',
            { retryAfter }
        );
    }
}

/**
 * Service Unavailable Error
 */
export class ServiceUnavailableError extends AppError {
    constructor(service: string = 'Service') {
        super(
            `${service} is temporarily unavailable`,
            503,
            true,
            [],
            'SERVICE_UNAVAILABLE'
        );
    }
}

/**
 * Database Error
 */
export class DatabaseError extends AppError {
    constructor(message: string = 'Database operation failed', metadata?: any) {
        super(message, 500, false, [], 'DATABASE_ERROR', metadata);
    }
}

/**
 * External Service Error
 */
export class ExternalServiceError extends AppError {
    constructor(service: string, message: string = 'External service error') {
        super(
            message,
            502,
            true,
            [],
            'EXTERNAL_SERVICE_ERROR',
            { service }
        );
    }
}

/**
 * File Upload Error
 */
export class FileUploadError extends AppError {
    constructor(message: string, metadata?: any) {
        super(message, 400, true, [], 'FILE_UPLOAD_ERROR', metadata);
    }
}

/**
 * Handle async errors in Express routes
 */
export const asyncHandler = (fn: Function) => {
    return (req: any, res: any, next: any) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Global Error Handler Middleware
 */
export const errorHandler = (err: any, req: any, res: any, next: any) => {
    let error = err;

    // Convert non-AppError errors
    if (!(error instanceof AppError)) {
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Internal Server Error';
        error = new AppError(message, statusCode, false);
    }

    // Log error
    logger.error('Error occurred', {
        errorCode: error.errorCode,
        message: error.message,
        statusCode: error.statusCode,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: req.user?.userId,
        stack: error.stack,
        timestamp: error.timestamp
    });

    // Send error response
    const response: any = {
        success: false,
        error: {
            message: error.message,
            code: error.errorCode,
            statusCode: error.statusCode,
            timestamp: error.timestamp
        }
    };

    // Add errors array if present
    if (error.errors && error.errors.length > 0) {
        response.error.errors = error.errors;
    }

    // Add stack trace in development
    if (process.env.NODE_ENV === 'development') {
        response.error.stack = error.stack;
        response.error.metadata = error.metadata;
    }

    res.status(error.statusCode).json(response);
};

/**
 * Handle unhandled promise rejections
 */
export const handleUnhandledRejection = () => {
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
        logger.error('Unhandled Rejection', {
            reason: reason?.message || reason,
            stack: reason?.stack,
            promise
        });

        // In production, you might want to gracefully shutdown
        if (process.env.NODE_ENV === 'production') {
            // Graceful shutdown logic here
            process.exit(1);
        }
    });
};

/**
 * Handle uncaught exceptions
 */
export const handleUncaughtException = () => {
    process.on('uncaughtException', (error: Error) => {
        logger.error('Uncaught Exception in app error', {
            message: error.message,
            stack: error.stack
        });

        // Always exit on uncaught exception
        process.exit(1);
    });
};