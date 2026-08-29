/**
 * audit.middleware.ts
 * Audit Middleware for Request Tracking
 * Logs all API requests with complete audit trail
 * 
 * @version 3.0.0
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';
import Constants from '@/shared/constants.util';
import AuditProducer, { AuditEvent } from '../kafka/producers/audit.producer';

// ==================== INTERFACES ====================

interface AuditData {
    eventId: string;
    userId: string | null;
    action: string;
    ipAddress: string;
    userAgent: string;
    method: string;
    path: string;
    statusCode: number;
    duration: number;
    timestamp: string;
    metadata?: Record<string, any>;
}

export interface AuthUser {
    userId: string;
    id: string;
    email: string;
    role: string;
    deviceId: string | null;
    sessionId: string | null;
}

interface AuthenticatedRequest extends Request {
    user?: AuthUser;
    correlationId?: string;
}

// ==================== AUDIT MIDDLEWARE ====================

/**
 * Main audit middleware
 * Captures request/response data and sends to Kafka
 */
const auditMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const correlationId = req.correlationId || uuidv4();
    req.correlationId = correlationId;

    // Store original end function
    const originalEnd = res.end;

    // Override res.end to capture response
    res.end = function (chunk?: any, encoding?: any, callback?: any): any {
        // Restore original end function
        res.end = originalEnd;

        // Calculate duration
        const duration = Date.now() - startTime;

        // Prepare audit data
        const auditData: AuditData = {
            eventId: uuidv4(),
            userId: req.user?.userId || null,
            action: determineAction(req.method, req.path),
            ipAddress: req.ip || req.socket.remoteAddress || '0.0.0.0',
            userAgent: req.headers['user-agent'] || 'Unknown',
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            timestamp: new Date().toISOString(),
            metadata: {
                correlationId,
                role: req.user?.role,
                sessionId: req.user?.sessionId,
                queryParams: req.query,
                routeParams: req.params,
            },
        };

        // ✅ Send audit event asynchronously (non-blocking)
        setImmediate(async () => {
            try {
                // Convert AuditData to AuditEvent format
                const auditEvent: AuditEvent = {
                    eventId: auditData.eventId,
                    userId: auditData.userId,
                    action: auditData.action,
                    ipAddress: auditData.ipAddress,
                    status: determineStatus(auditData.statusCode),
                    severity: determineSeverity(auditData.statusCode, auditData.path),
                    timestamp: auditData.timestamp,
                    metadata: {
                        ...auditData.metadata,
                        method: auditData.method,
                        path: auditData.path,
                        statusCode: auditData.statusCode,
                        duration: auditData.duration,
                        userAgent: auditData.userAgent,
                    },
                };

                // Send to Kafka
                await AuditProducer.connect();
                await AuditProducer.sendAuditEvent(auditEvent);

                LoggerUtil.debug('Audit event sent', {
                    eventId: auditEvent.eventId,
                    action: auditEvent.action,
                    statusCode: auditData.statusCode,
                    duration,
                });
            } catch (kafkaError: any) {
                LoggerUtil.warn('Kafka audit log failed (non-critical)', {
                    error: kafkaError.message,
                    action: auditData.action,
                    correlationId,
                });

                // ✅ Optional: Log to MongoDB as fallback (if you have AuditLog model)
                try {
                    // Uncomment if you have MongoDB AuditLog model
                    // const AuditLog = (await import('@/models/auditLog.model')).default;
                    // await AuditLog.logAction({
                    //     eventId: auditData.eventId,
                    //     userId: auditData.userId || undefined, // ✅ Convert null to undefined
                    //     action: auditData.action,
                    //     ipAddress: auditData.ipAddress,
                    //     status: determineStatus(auditData.statusCode),
                    //     severity: determineSeverity(auditData.statusCode, auditData.path),
                    //     timestamp: new Date(auditData.timestamp),
                    //     metadata: auditData.metadata,
                    // });
                } catch (dbError: any) {
                    LoggerUtil.error('MongoDB audit log failed', {
                        error: dbError.message,
                        action: auditData.action,
                    });
                }
            } finally {
                await AuditProducer.disconnect();
            }
        });

        // Log the request
        LoggerUtil.info('API Request', {
            method: auditData.method,
            path: auditData.path,
            statusCode: auditData.statusCode,
            duration,
            userId: auditData.userId,
            correlationId,
        });

        // Call original end function
        return originalEnd.call(this, chunk, encoding, callback);
    };

    next();
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Determine action from method and path
 */
function determineAction(method: string, path: string): string {
    // Map common routes to actions
    const actionMap: Record<string, string> = {
        'POST:/api/v1/auth/register': Constants.AUDIT_ACTIONS.USER_REGISTERED,
        'POST:/api/v1/auth/login': Constants.AUDIT_ACTIONS.USER_LOGIN,
        'POST:/api/v1/auth/logout': Constants.AUDIT_ACTIONS.USER_LOGOUT,
        'POST:/api/v1/password/change': Constants.AUDIT_ACTIONS.PASSWORD_CHANGED,
        'POST:/api/v1/verify/email/otp/verify': Constants.AUDIT_ACTIONS.EMAIL_VERIFIED,
    };

    const key = `${method}:${path}`;
    return actionMap[key] || `${method}_${path.replace(/\//g, '_').toUpperCase()}`;
}

/**
 * Determine status from HTTP status code
 */
function determineStatus(statusCode: number): 'SUCCESS' | 'ERROR' | 'WARNING' | 'FAILURE' {
    if (statusCode >= 200 && statusCode < 300) return 'SUCCESS';
    if (statusCode >= 400 && statusCode < 500) return 'FAILURE';
    if (statusCode >= 500) return 'ERROR';
    return 'WARNING';
}

/**
 * Determine severity from status code and path
 */
function determineSeverity(statusCode: number, path: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    // Critical paths
    const criticalPaths = ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/password'];
    const isCriticalPath = criticalPaths.some(cp => path.startsWith(cp));

    if (statusCode >= 500) return 'CRITICAL';
    if (statusCode >= 400 && statusCode < 500 && isCriticalPath) return 'HIGH';
    if (statusCode >= 400 && statusCode < 500) return 'MEDIUM';
    return 'LOW';
}

// ==================== EXPORT ====================

export default auditMiddleware;

/**
 * Skip audit for specific routes
 */
export function skipAudit(paths: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (paths.includes(req.path)) {
            return next();
        }
        auditMiddleware(req as AuthenticatedRequest, res, next);
    };
}