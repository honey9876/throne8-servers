// services/apiresponse.service.ts
import { Response } from 'express';
import { logger } from '../shared/logger.util';
import { metricsCollector } from '../shared/metrics';

/**
 * Standardized API Response Service
 * Production-ready response formatting with metrics
 */
export class ApiResponse {
    /**
     * Send success response
     */
    static success(
        res: Response,
        data: {
            message: string;
            data?: any;
            pagination?: {
                page: number;
                limit: number;
                total: number;
                pages: number;
            };
            meta?: any;
        },
        statusCode: number = 200
    ): Response {
        const response: any = {
            success: true,
            message: data.message,
            timestamp: new Date().toISOString(),
            statusCode
        };

        if (data.data !== undefined) {
            response.data = data.data;
        }

        if (data.pagination) {
            response.pagination = data.pagination;
        }

        if (data.meta) {
            response.meta = data.meta;
        }

        // Record success metric
        metricsCollector.increment('api.response.success', {
            statusCode: statusCode.toString()
        });

        return res.status(statusCode).json(response);
    }

    /**
     * Send error response
     */
    static error(
        res: Response,
        error: {
            message: string;
            errors?: any[];
            code?: string;
            meta?: any;
        },
        statusCode: number = 500
    ): Response {
        const response: any = {
            success: false,
            error: {
                message: error.message,
                statusCode,
                timestamp: new Date().toISOString()
            }
        };

        if (error.code) {
            response.error.code = error.code;
        }

        if (error.errors && error.errors.length > 0) {
            response.error.errors = error.errors;
        }

        if (error.meta) {
            response.error.meta = error.meta;
        }

        // Don't expose stack trace in production
        if (process.env.NODE_ENV === 'development' && (error as any).stack) {
            response.error.stack = (error as any).stack;
        }

        // Record error metric
        metricsCollector.increment('api.response.error', {
            statusCode: statusCode.toString(),
            code: error.code || 'UNKNOWN'
        });

        return res.status(statusCode).json(response);
    }

    /**
     * Send created response
     */
    static created(
        res: Response,
        data: {
            message: string;
            data?: any;
            meta?: any;
        }
    ): Response {
        return ApiResponse.success(res, data, 201);
    }

    /**
     * Send no content response
     */
    static noContent(res: Response): Response {
        metricsCollector.increment('api.response.no_content');
        return res.status(204).send();
    }

    /**
     * Send not found response
     */
    static notFound(
        res: Response,
        message: string = 'Resource not found'
    ): Response {
        return ApiResponse.error(
            res,
            { message, code: 'NOT_FOUND' },
            404
        );
    }

    /**
     * Send bad request response
     */
    static badRequest(
        res: Response,
        message: string = 'Bad request',
        errors?: any[]
    ): Response {
        return ApiResponse.error(
            res,
            { message, errors, code: 'BAD_REQUEST' },
            400
        );
    }

    /**
     * Send unauthorized response
     */
    static unauthorized(
        res: Response,
        message: string = 'Unauthorized access'
    ): Response {
        return ApiResponse.error(
            res,
            { message, code: 'UNAUTHORIZED' },
            401
        );
    }

    /**
     * Send forbidden response
     */
    static forbidden(
        res: Response,
        message: string = 'Access forbidden'
    ): Response {
        return ApiResponse.error(
            res,
            { message, code: 'FORBIDDEN' },
            403
        );
    }

    /**
     * Send rate limit response
     */
    static rateLimit(
        res: Response,
        retryAfter: number = 60
    ): Response {
        res.setHeader('Retry-After', retryAfter);

        return ApiResponse.error(
            res,
            {
                message: `Too many requests. Please try again after ${retryAfter} seconds.`,
                code: 'RATE_LIMIT_EXCEEDED',
                meta: { retryAfter }
            },
            429
        );
    }

    /**
     * Send service unavailable response
     */
    static serviceUnavailable(
        res: Response,
        message: string = 'Service temporarily unavailable'
    ): Response {
        return ApiResponse.error(
            res,
            { message, code: 'SERVICE_UNAVAILABLE' },
            503
        );
    }

    /**
     * Send validation error response
     */
    static validationError(
        res: Response,
        errors: any[],
        message: string = 'Validation failed'
    ): Response {
        return ApiResponse.error(
            res,
            { message, errors, code: 'VALIDATION_ERROR' },
            400
        );
    }
}

export default ApiResponse;