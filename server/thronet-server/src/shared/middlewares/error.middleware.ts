/**
 * error.middleware.ts
 * Professional-level error handling middleware for auth-service-phase3-kafka
 * Handles uncaught errors and formats responses
 * Compliant with NIST 800-63B and OWASP guidelines
 */

import type { Request, Response, NextFunction } from 'express';
import LoggerUtil from '../logger.util.js';
import ResponseUtil from '../response.util.js';
import { AuditLog } from '@/shared/models/index.models';

interface CustomError extends Error {
    statusCode?: number;
}

const errorMiddleware = (error: CustomError, req: Request, res: Response, _next: NextFunction): void => {
    const ipAddress = req.ip;
    const userId = (req as any).user?.userId || null;

    // Log error
    LoggerUtil.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        userId,
        ipAddress,
        path: req.path,
    });

    // Audit log
    AuditLog.logAction({
        userId,
        action: 'UNHANDLED_ERROR',
        ipAddress,
        status: 'FAILED',
        severity: 'CRITICAL',
        metadata: { error: error.message, path: req.path },
    }).catch((auditError: unknown) =>
        LoggerUtil.error('Audit log failed', { error: (auditError as Error).message })
    );

    // Format response
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';
    // res.status(statusCode).json(
        ResponseUtil.error(res, message.toString(), statusCode)
    // );
};

export default errorMiddleware;