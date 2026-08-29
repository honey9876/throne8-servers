// services/apierrors.service.ts
import { AppError } from '../shared/errors/app.error';

/**
 * API Error Class for HTTP errors
 * Compatible with existing codebase
 */
export class ApiError extends AppError {
    constructor(
        message: string,
        statusCode: number = 500,
        errors: any[] = [],
        errorCode?: string
    ) {
        super(message, statusCode, true, errors, errorCode);
        this.name = 'ApiError';
    }

    /**
     * Create a Bad Request error (400)
     */
    static badRequest(message: string = 'Bad Request', errors: any[] = []): ApiError {
        return new ApiError(message, 400, errors, 'BAD_REQUEST');
    }

    /**
     * Create an Unauthorized error (401)
     */
    static unauthorized(message: string = 'Unauthorized'): ApiError {
        return new ApiError(message, 401, [], 'UNAUTHORIZED');
    }

    /**
     * Create a Forbidden error (403)
     */
    static forbidden(message: string = 'Forbidden'): ApiError {
        return new ApiError(message, 403, [], 'FORBIDDEN');
    }

    /**
     * Create a Not Found error (404)
     */
    static notFound(resource: string = 'Resource'): ApiError {
        return new ApiError(`${resource} not found`, 404, [], 'NOT_FOUND');
    }

    /**
     * Create a Conflict error (409)
     */
    static conflict(message: string = 'Conflict'): ApiError {
        return new ApiError(message, 409, [], 'CONFLICT');
    }

    /**
     * Create a Validation error (422)
     */
    static validation(message: string = 'Validation failed', errors: any[] = []): ApiError {
        return new ApiError(message, 422, errors, 'VALIDATION_ERROR');
    }

    /**
     * Create a Rate Limit error (429)
     */
    static rateLimit(retryAfter: number = 60): ApiError {
        return new ApiError(
            `Too many requests. Please try again after ${retryAfter} seconds.`,
            429,
            [],
            'RATE_LIMIT_EXCEEDED'
        );
    }

    /**
     * Create an Internal Server error (500)
     */
    static internal(message: string = 'Internal Server Error'): ApiError {
        return new ApiError(message, 500, [], 'INTERNAL_ERROR');
    }

    /**
     * Create a Service Unavailable error (503)
     */
    static serviceUnavailable(service: string = 'Service'): ApiError {
        return new ApiError(
            `${service} is temporarily unavailable`,
            503,
            [],
            'SERVICE_UNAVAILABLE'
        );
    }
}

export default ApiError;