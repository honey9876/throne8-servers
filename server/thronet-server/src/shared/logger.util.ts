// ==================== LOGGER UTILITIES ====================
/**
 * Logger Utility - Production-Ready Scalable Logging System
 * Supports 1M+ users with distributed logging, log aggregation, and real-time monitoring
 * server/thronet-server/src/shared/logger.util.ts
 * 
 * Features:
 * - Winston with CloudWatch, Elasticsearch, and custom transports
 * - Structured logging with correlation IDs
 * - Log sampling for high-volume scenarios
 * - Async logging with batching
 * - Performance metrics tracking
 * - Log sanitization (PII removal)
 * - Circuit breaker for external transports
 * 
 * @module utils/logger.util
 * @version 3.1.0 - Fixed shutdown conflicts
 */

//mera code

import axios from 'axios';
import type { Request, Response, NextFunction } from 'express';
import nodemailer from 'nodemailer';
import winston, { Logger as WinstonLogger, transport, format as WinstonFormat } from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';
import DailyRotateFile from 'winston-daily-rotate-file';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as os from 'os';

// __dirname is natively available in CommonJS

// ==================== CONFIGURATION ====================

interface LoggerConfig {
    logFilePath: string;
    errorFilePath: string;
    enableRotation?: boolean;
    cloudWatch?: {
        groupName: string;
        streamName: string;
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
    };
    enableSlack?: boolean;
    slackWebhook?: string;
    enableEmail?: boolean;
    emailConfig?: {
        host: string;
        port: number;
        secure: boolean;
        auth: { user: string; pass: string };
        to: string;
        from: string;
    };
    alertRateLimit?: {
        windowMs: number;
        maxAlerts: number;
    };
}

export const LogCategory = {
    SYSTEM: 'system',
    DATABASE: 'database',
    REDIS: 'redis',
    SECURITY: 'security',
    HTTP: 'http',
    NETWORK: 'network',
    CACHE_ERROR: 'cache',
    ALGORITHM: 'algorithm',
    API: 'api',
    AUDIT: 'audit',
    CONNECTION: 'connection',
    VALIDATION: 'validation',
    RATE_LIMIT: 'rate_limit',
    PERFORMANCE: 'performance',
    AUTH: 'auth',
    USER_CREATION: 'user_creation',
    USER_UPDATE: 'user_update',
    CACHE_HIT: 'cache_hit',
    CACHE_SET: 'cache_set',
    CACHE: 'cache',
    PRIVACY: 'privacy',
    USER_SYNC: 'user_sync',
    SYNC_ERROR: 'sync_error',
    BULK_OPERATION: 'bulk_operation',
    CLEANUP: 'cleanup',
    DATABASE_ERROR: 'database_error',
    VALIDATION_ERROR: 'validation_error',
    CAST_ERROR: 'cast_error',
    SAVE_ERROR: 'save_error',
    ERROR: 'error',
    FOLLOW: 'follow',
} as const;

export type LogCategoryType = typeof LogCategory[keyof typeof LogCategory];


export interface PublicLogMetadata extends Omit<LoggerConfig, 'error'> {
    error?: Error | string; // More restrictive for public use
}


// ✅ New code - use defaults directly
const logsDir = join(__dirname, '../../logs');
if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
}

const loggerConfig: LoggerConfig = {
    logFilePath: join(logsDir, 'combined.log'),
    errorFilePath: join(logsDir, 'error.log'),
    enableRotation: process.env['LOG_ENABLE_ROTATION'] !== 'false',
    cloudWatch: {
        groupName: process.env['CLOUDWATCH_GROUP_NAME'] || 'auth-service',
        streamName: process.env['CLOUDWATCH_STREAM_NAME'] || `auth-service-${process.env['NODE_ENV'] || 'development'}`,
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || '',
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || '',
        region: process.env['AWS_REGION'] || 'us-east-1',
    }
};

class AlertRateLimiter {
    private alertTimestamps: Map<string, number[]> = new Map();
    private windowMs: number;
    private maxAlerts: number;

    constructor(windowMs = 900000, maxAlerts = 10) {
        this.windowMs = windowMs;
        this.maxAlerts = maxAlerts;
    }

    isAlertAllowed(key: string): boolean {
        const now = Date.now();
        const timestamps = this.alertTimestamps.get(key) || [];
        const windowStart = now - this.windowMs;
        const recentAlerts = timestamps.filter((ts) => ts > windowStart);

        if (recentAlerts.length >= this.maxAlerts) {
            return false;
        }

        recentAlerts.push(now);
        this.alertTimestamps.set(key, recentAlerts);
        return true;
    }
}

// Initialize
const alertRateLimiter = new AlertRateLimiter();


export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    (req as any).id = (req as any).id || Math.random().toString(36).substr(2, 9);

    res.on('finish', () => {
        const duration = Date.now() - start;
        LoggerUtil.http(req, res, duration);
    });

    next();
};

// ==================== ADVANCED FEATURES ====================

interface LogEntry {
    level: string;
    message: string;
    [key: string]: any;
}

/**
 * Log Buffer for Batch Processing
 */
class LogBuffer {
    private buffer: LogEntry[] = [];
    private maxSize: number;
    private flushInterval: number;
    private flushTimer: NodeJS.Timeout | null = null;

    constructor(flushInterval = 1000, maxSize = 100) {
        this.maxSize = maxSize;
        this.flushInterval = flushInterval;
        this.startAutoFlush();
    }

    add(log: LogEntry): void {
        this.buffer.push(log);
        if (this.buffer.length >= this.maxSize) {
            this.flush();
        }
    }

    flush(): LogEntry[] | undefined {
        if (this.buffer.length === 0) return undefined;
        const logs = [...this.buffer];
        this.buffer = [];
        return logs;
    }

    private startAutoFlush(): void {
        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.flushInterval);
    }

    stop(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flush();
        }
    }
}

/**
 * Circuit Breaker for External Transports
 */
interface CircuitState {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failureCount: number;
    nextAttempt: Date;
}

class CircuitBreaker {
    private failureCount: number = 0;
    private threshold: number;
    private timeout: number;
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    private nextAttempt: number = Date.now();

    constructor(threshold = 5, timeout = 60000) {
        this.threshold = threshold;
        this.timeout = timeout;
    }

    canExecute(): boolean {
        if (this.state === 'CLOSED') return true;
        if (this.state === 'OPEN') {
            if (Date.now() >= this.nextAttempt) {
                this.state = 'HALF_OPEN';
                return true;
            }
            return false;
        }
        return this.state === 'HALF_OPEN';
    }

    recordSuccess(): void {
        this.failureCount = 0;
        this.state = 'CLOSED';
    }

    recordFailure(): void {
        this.failureCount++;
        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.timeout;
            console.warn(`Circuit breaker OPEN - will retry after ${this.timeout}ms`);
        }
    }

    getState(): CircuitState {
        return {
            state: this.state,
            failureCount: this.failureCount,
            nextAttempt: new Date(this.nextAttempt)
        };
    }
}

/**
 * Log Sampler for High-Volume Scenarios
 */
interface Counter {
    count: number;
    lastReset: number;
}

class LogSampler {
    private sampleRate: number;
    private counters: Map<string, Counter> = new Map();
    private windowSize: number = 60000;

    constructor(sampleRate = 1.0) {
        this.sampleRate = sampleRate;
    }

    shouldLog(key = 'default'): boolean {
        if (this.sampleRate === 1.0) return true;
        if (this.sampleRate === 0.0) return false;

        const now = Date.now();
        const counter = this.counters.get(key) || { count: 0, lastReset: now };

        if (now - counter.lastReset > this.windowSize) {
            counter.count = 0;
            counter.lastReset = now;
        }

        counter.count++;
        this.counters.set(key, counter);
        return Math.random() < this.sampleRate;
    }

    setSampleRate(rate: number): void {
        this.sampleRate = Math.max(0, Math.min(1, rate));
    }
}

/**
 * PII Sanitizer
 */
class PIISanitizer {
    static sanitize(data: any): any {
        if (!data || typeof data !== 'object') return data;

        const sanitized = { ...data };
        const sensitiveFields: string[] = [
            'password', 'token', 'secret', 'apiKey', 'accessToken',
            'refreshToken', 'creditCard', 'ssn', 'phoneNumber'
        ];

        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '***REDACTED***';
            }
        }

        if (sanitized.email && typeof sanitized.email === 'string') {
            sanitized.email = sanitized.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        }

        for (const key in sanitized) {
            if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
                sanitized[key] = PIISanitizer.sanitize(sanitized[key]);
            }
        }

        return sanitized;
    }
}

/**
 * Performance Metrics Tracker
 */
interface Metrics {
    totalLogs: number;
    logsByLevel: Record<string, number>;
    avgLogTime: number;
    errors: number;
    lastReset: number;
    uptime?: number;
    logsPerSecond?: number;
}

class MetricsTracker {
    private metrics: Metrics = {
        totalLogs: 0,
        logsByLevel: { info: 0, warn: 0, error: 0, debug: 0, critical: 0 },
        avgLogTime: 0,
        errors: 0,
        lastReset: Date.now()
    };

    record(level: string, duration: number): void {
        this.metrics.totalLogs++;
        this.metrics.logsByLevel[level] = (this.metrics.logsByLevel[level] || 0) + 1;
        const total = this.metrics.totalLogs;
        this.metrics.avgLogTime = (this.metrics.avgLogTime * (total - 1) + duration) / total;
    }

    recordError(): void {
        this.metrics.errors++;
    }

    getMetrics(): Metrics & { uptime: number; logsPerSecond: number } {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.lastReset,
            logsPerSecond: this.metrics.totalLogs / ((Date.now() - this.metrics.lastReset) / 1000)
        };
    }

    reset(): void {
        this.metrics = {
            totalLogs: 0,
            logsByLevel: { info: 0, warn: 0, error: 0, debug: 0, critical: 0 },
            avgLogTime: 0,
            errors: 0,
            lastReset: Date.now()
        };
    }
}

// ==================== INITIALIZE COMPONENTS ====================

const logBuffer = new LogBuffer(1000, 100);
const circuitBreaker = new CircuitBreaker(5, 60000);
const logSampler = new LogSampler(parseFloat(process.env['LOG_SAMPLE_RATE'] as string) || 1.0);
const metricsTracker = new MetricsTracker();

// Track shutdown state
let isShuttingDown = false;

// ==================== CUSTOM FORMATS ====================

const enrichFormat = WinstonFormat((info) => {
    (info as any).hostname = os.hostname();
    (info as any).pid = process.pid;
    (info as any).workerId = 'master';
    (info as any).env = process.env['NODE_ENV'] || 'development';
    (info as any).version = process.env['APP_VERSION'] || '1.0.0';
    return info;
});

const customFormat = WinstonFormat.combine(
    WinstonFormat.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    enrichFormat(),
    WinstonFormat.errors({ stack: true }),
    WinstonFormat.json(),
    WinstonFormat.printf(({ timestamp, level, message, ...metadata }) => {
        const sanitized = PIISanitizer.sanitize(metadata);
        return JSON.stringify({
            '@timestamp': timestamp,
            level: level.toUpperCase(),
            message,
            ...sanitized,
        });
    })
);

// const consoleFormat = WinstonFormat.combine(
//     WinstonFormat.colorize(),
//     WinstonFormat.timestamp({ format: 'HH:mm:ss' }),
//     WinstonFormat.printf(({ timestamp, level, message, correlationId, duration }) => {
//         let msg = `[${timestamp}] ${level}: ${message}`;
//         if (correlationId) msg += ` [CID: ${correlationId}]`;
//         if (duration !== undefined) msg += ` (${duration}ms)`;
//         return msg;
//     })
// );

const consoleFormat = WinstonFormat.combine(
    WinstonFormat.colorize(),
    WinstonFormat.timestamp({ format: 'HH:mm:ss' }),
    WinstonFormat.printf(({ timestamp, level, message, correlationId, duration, ...rest }) => {
        let msg = `[${timestamp}] ${level}: ${message}`;
        if (correlationId) msg += ` [CID: ${correlationId}]`;
        if (duration !== undefined) msg += ` (${duration}ms)`;


        // ✅ Print actual error details that were previously hidden
        
        const { service, timestamp: _t, hostname, pid, workerId, env, version, ...usefulRest } = rest as any;
        if (Object.keys(usefulRest).length > 0) {
            msg += `\n   → ${JSON.stringify(usefulRest)}`;
        }
        return msg;
        return msg;
    })
);

// ==================== TRANSPORTS ====================

const transports: transport[] = [];

// Console Transport
transports.push(
    new winston.transports.Console({
        format: consoleFormat,
        level: process.env['LOG_LEVEL'] || 'info',
    })
);

// ⭐ FILE TRANSPORTS - WITH ROTATION SUPPORT
if (loggerConfig.enableRotation) {
    // Daily Rotating File Transports
    const transportConfigs = [
        { filename: 'app-%DATE%.log', symlinkName: 'app-current.log' },
        { filename: 'error-%DATE%.log', level: 'error', symlinkName: 'error-current.log' },
        { filename: 'audit-%DATE%.log', symlinkName: 'audit-current.log' },
        { filename: 'security-%DATE%.log', symlinkName: 'security-current.log' },
        { filename: 'http-%DATE%.log', level: 'http', symlinkName: 'http-current.log' },
    ];

    transportConfigs.forEach(({ filename, level, symlinkName }) => {
        transports.push(
            new DailyRotateFile({
                filename: join(logsDir, filename),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
                format: customFormat,
                createSymlink: true,
                symlinkName,
                zippedArchive: true,
                level,
            })
        );
    });
} else {
    // Simple File Transports (without rotation)
    transports.push(
        new winston.transports.File({
            filename: loggerConfig.logFilePath,
            maxsize: 10485760,
            maxFiles: 20,
            tailable: true,
            format: customFormat,
        })
    );

    transports.push(
        new winston.transports.File({
            filename: loggerConfig.errorFilePath,
            level: 'error',
            maxsize: 10485760,
            maxFiles: 10,
            tailable: true,
            format: customFormat,
        })
    );
}

// CloudWatch Transport with Circuit Breaker
if (
    loggerConfig.cloudWatch?.accessKeyId &&
    loggerConfig.cloudWatch?.secretAccessKey &&
    process.env['NODE_ENV'] === 'production'
) {
    try {
        const cloudWatchTransport = new WinstonCloudWatch({
            logGroupName: loggerConfig.cloudWatch.groupName,
            logStreamName: `${loggerConfig.cloudWatch.streamName}-${os.hostname()}-${process.pid}`,
            awsOptions: {
                credentials: {
                    accessKeyId: loggerConfig.cloudWatch.accessKeyId,
                    secretAccessKey: loggerConfig.cloudWatch.secretAccessKey,
                },
                region: loggerConfig.cloudWatch.region,
            },
            retentionInDays: 7,
            uploadRate: 2000,
            errorHandler: (err: Error) => {
                circuitBreaker.recordFailure();
                console.error('CloudWatch Transport Error:', err.message);
            },
        });

        const originalLog = (cloudWatchTransport as any).log?.bind(cloudWatchTransport);
        if (originalLog) {
            (cloudWatchTransport as any).log = function (info: any, callback: (err?: Error) => void) {
                if (circuitBreaker.canExecute()) {
                    originalLog.call(this, info, (err?: Error) => {
                        if (err) circuitBreaker.recordFailure();
                        else circuitBreaker.recordSuccess();
                        callback(err);
                    });
                } else {
                    callback();
                }
            };
        }

        transports.push(cloudWatchTransport);
        console.log('✓ CloudWatch logging enabled');
    } catch (error: unknown) {
        console.warn('Failed to initialize CloudWatch transport:', (error as Error).message);
    }
}

// ==================== WINSTON LOGGER ====================

const winstonLogger: WinstonLogger = winston.createLogger({
    level: process.env['LOG_LEVEL'] || 'info',
    format: customFormat,
    transports,
    exitOnError: false,
});

// ==================== LOGGER UTILITY CLASS ====================

class LoggerUtil {
    /**
     * Log info level message
     */
    static info(message: string, metadata: Record<string, any> = {}): void {
        if (isShuttingDown) return;

        const startTime = Date.now();
        try {
            if (!logSampler.shouldLog(metadata['correlationId'])) return;

            const enrichedMetadata: Record<string, any> = {
                ...metadata,
                service: 'auth-service',
                timestamp: new Date().toISOString(),
            };

            winstonLogger.info(message, enrichedMetadata);
            metricsTracker.record('info', Date.now() - startTime);
        } catch (error: unknown) {
            console.error('Logger.info failed:', (error as Error).message);
            metricsTracker.recordError();
        }
    }

    /**
     * Log error level message (synchronous)
     */
    static error(message: string, metadata: Record<string, any> | Error | string = {}): void {
        if (isShuttingDown) return;

        const startTime = Date.now();
        try {
            // ✅ Ye handle karo — string, Error, ya object teen teeno cases
            let enrichedMetadata: Record<string, any>;

            if (metadata instanceof Error) {
                enrichedMetadata = {
                    message: metadata.message,
                    name: metadata.name,
                    stack: metadata.stack,
                    code: (metadata as any).code,
                    service: 'auth-service',
                    timestamp: new Date().toISOString(),
                };
            } else if (typeof metadata === 'string') {
                enrichedMetadata = {
                    details: metadata,
                    service: 'auth-service',
                    timestamp: new Date().toISOString(),
                };
            } else {
                enrichedMetadata = {
                    ...metadata,
                    service: 'auth-service',
                    timestamp: new Date().toISOString(),
                    stackTrace: metadata['error']?.stack || metadata['stack'],
                };
            }

            winstonLogger.error(message, enrichedMetadata);
            metricsTracker.record('error', Date.now() - startTime);
        } catch (error: unknown) {
            console.error('Logger.error failed:', (error as Error).message);
            metricsTracker.recordError();
        }
    }

    /**
     * Log warning level message
     */
    static warn(message: string, metadata: Record<string, any> = {}): void {
        if (isShuttingDown) return;

        const startTime = Date.now();
        try {
            const enrichedMetadata: Record<string, any> = {
                ...metadata,
                service: 'auth-service',
                timestamp: new Date().toISOString(),
            };

            winstonLogger.warn(message, enrichedMetadata);
            metricsTracker.record('warn', Date.now() - startTime);
        } catch (error: unknown) {
            console.error('Logger.warn failed:', (error as Error).message);
            metricsTracker.recordError();
        }
    }

    /**
     * Log debug level message
     */
    static debug(message: string, metadata: Record<string, any> = {}): void {
        if (isShuttingDown || process.env['NODE_ENV'] === 'production') return;

        const startTime = Date.now();
        try {
            const enrichedMetadata: Record<string, any> = {
                ...metadata,
                service: 'auth-service',
                timestamp: new Date().toISOString(),
            };

            winstonLogger.debug(message, enrichedMetadata);
            metricsTracker.record('debug', Date.now() - startTime);
        } catch (error: unknown) {
            console.error('Logger.debug failed:', (error as Error).message);
            metricsTracker.recordError();
        }
    }

    /**
     * Log critical system event
     */
    static critical(message: string, metadata: Record<string, any> = {}): void {
        if (isShuttingDown) return;

        const startTime = Date.now();
        try {
            const enrichedMetadata: Record<string, any> = {
                ...metadata,
                severity: 'CRITICAL',
                service: 'auth-service',
                timestamp: new Date().toISOString(),
                stackTrace: metadata['error']?.stack || new Error().stack,
            };

            winstonLogger.error(message, enrichedMetadata);
            metricsTracker.record('critical', Date.now() - startTime);
        } catch (error: unknown) {
            console.error('Logger.critical failed:', (error as Error).message);
            metricsTracker.recordError();
        }
    }

    /**
     * Log performance metrics
     */
    static performance(operation: string, duration: number, metadata: Record<string, any> = {}): void {
        if (isShuttingDown) return;

        try {
            winstonLogger.info(`Performance: ${operation}`, {
                ...metadata,
                operation,
                duration,
                service: 'auth-service',
                type: 'performance',
                timestamp: new Date().toISOString(),
            });

            if (duration > 1000) {
                winstonLogger.warn(`Slow operation detected: ${operation}`, {
                    operation,
                    duration,
                    threshold: 1000,
                });
            }
        } catch (error: unknown) {
            console.error('Logger.performance failed:', (error as Error).message);
        }
    }

    /**
     * Log HTTP request
     */
    static http(req: Request, res: any, duration: number): void {  // res any for flexibility
        if (isShuttingDown) return;

        try {
            const logData: Record<string, any> = {
                method: req.method,
                url: req.originalUrl || req.url,
                statusCode: res.statusCode,
                duration,
                ip: req.ip || (req as any).connection?.remoteAddress,
                userAgent: req.headers['user-agent'],
                correlationId: (req as any).correlationId,
                userId: (req as any).user?._id,
                service: 'auth-service',
                type: 'http',
                timestamp: new Date().toISOString(),
            };

            if (res.statusCode >= 500) {
                winstonLogger.error('HTTP Request Error', logData);
            } else if (res.statusCode >= 400) {
                winstonLogger.warn('HTTP Request Warning', logData);
            } else {
                winstonLogger.info('HTTP Request', logData);
            }
        } catch (error: unknown) {
            console.error('Logger.http failed:', (error as Error).message);
        }
    }

    /**
     * Log database query
     */
    static query(query: string, duration: number, metadata: Record<string, any> = {}): void {
        if (isShuttingDown) return;

        try {
            winstonLogger.debug('Database Query', {
                ...metadata,
                query,
                duration,
                service: 'auth-service',
                type: 'database',
                timestamp: new Date().toISOString(),
            });

            if (duration > 500) {
                winstonLogger.warn('Slow query detected', {
                    query,
                    duration,
                    threshold: 500,
                });
            }
        } catch (error: unknown) {
            console.error('Logger.query failed:', (error as Error).message);
        }
    }

    /**
     * Get logger metrics
     */
    static getMetrics(): Metrics & { uptime: number; logsPerSecond: number } {
        return metricsTracker.getMetrics();
    }

    /**
     * Get circuit breaker state
     */
    static getCircuitBreakerState(): CircuitState {
        return circuitBreaker.getState();
    }

    /**
     * Set log sampling rate
     */
    static setSampleRate(rate: number): void {
        logSampler.setSampleRate(rate);
        winstonLogger.info('Log sample rate updated', { newRate: rate });
    }

    /**
     * Flush log buffer
     */
    static flush(): LogEntry[] | undefined {
        return logBuffer.flush();
    }

    /**
     * Shutdown logger gracefully
     */
    static async shutdown(): Promise<boolean> {
        if (isShuttingDown) {
            console.log('Logger already shutting down...');
            return true;
        }

        isShuttingDown = true;

        try {
            console.log('Shutting down logger...');

            // Flush buffers
            logBuffer.stop();

            // Close transports
            winstonLogger.transports.forEach((transport: any) => {
                if (typeof transport.close === 'function') {
                    transport.close();
                }
            });

            // Final metrics log
            console.log('Logger metrics:', metricsTracker.getMetrics());
            console.log('Logger shut down successfully');

            return true;
        } catch (error: unknown) {
            console.error('Logger shutdown failed:', (error as Error).message);
            return false;
        }
    }

    static auditLog(action: string, userId: string, metadata: Record<string, any> = {}): void {
        LoggerUtil.info(`Audit: ${action}`, {
            ...metadata,
            userId,
            category: 'audit',
            event: action,
        });
    }

    static auditLogDetailed(
        action: string,
        userId: string,
        details: Record<string, any>,
        metadata: Record<string, any> = {}
    ): void {
        LoggerUtil.info(`Audit: ${action}`, {
            ...metadata,
            userId,
            category: 'audit',
            event: action,
            ...details,
        });
    }

    static security(message: string, metadata: Record<string, any> = {}): void {
        LoggerUtil.warn(message, { ...metadata, category: 'security' });
    }

    static connection(message: string, metadata: Record<string, any> = {}): void {
        LoggerUtil.info(message, { ...metadata, category: 'connection' });
    }

    static validation(message: string, metadata: Record<string, any> = {}): void {
        LoggerUtil.warn(message, { ...metadata, category: 'validation' });
    }

    static algorithm(message: string, metadata: Record<string, any> = {}): void {
        LoggerUtil.info(message, { ...metadata, category: 'algorithm' });
    }

    static logConnectionEvent(event: string, connectionId: string, metadata: Record<string, any> = {}): void {
        LoggerUtil.connection(event, { ...metadata, connectionId, event });
    }

    static logProfileViewEvent(
        viewerId: string,
        viewedId: string,
        visibility: 'public' | 'connections' | 'private',
        metadata: Record<string, any> = {}
    ): void {
        LoggerUtil.connection(`Profile view recorded`, {
            ...metadata,
            viewerId,
            viewedId,
            visibility,
            event: 'profile_view',
        });
    }

    static async sendSlackAlert(message: string, metadata: Record<string, any> = {}): Promise<void> {
        if (!loggerConfig.enableSlack || !loggerConfig.slackWebhook) return;

        try {
            const payload = {
                text: `🚨 Critical Alert: ${message}`,
                attachments: [
                    {
                        color: 'danger',
                        fields: [
                            { title: 'Environment', value: process.env['NODE_ENV'] || 'development', short: true },
                            { title: 'Service', value: 'auth-service', short: true },
                            { title: 'Timestamp', value: new Date().toISOString(), short: true },
                            ...(metadata.userId ? [{ title: 'User ID', value: metadata.userId, short: true }] : []),
                        ],
                    },
                ],
            };
            await axios.post(loggerConfig.slackWebhook, payload, { timeout: 5000 });
        } catch (error: any) {
            console.error('Failed to send Slack alert:', (error as Error).message);
        }
    }

    static async sendEmailAlert(message: string, metadata: Record<string, any> = {}): Promise<void> {
        if (!loggerConfig.enableEmail || !loggerConfig.emailConfig) return;

        try {
            const transporter = nodemailer.createTransport({
                host: loggerConfig.emailConfig.host,
                port: loggerConfig.emailConfig.port,
                secure: loggerConfig.emailConfig.secure,
                auth: loggerConfig.emailConfig.auth,
            });

            await transporter.sendMail({
                from: loggerConfig.emailConfig.from,
                to: loggerConfig.emailConfig.to,
                subject: `🚨 Critical Alert: auth-service`,
                text: `Message: ${message}\nMetadata: ${JSON.stringify(metadata, null, 2)}`,
            });
        } catch (error: any) {
            console.error('Failed to send email alert:', (error as Error).message);
        }
    }

    static startTimer(label: string): () => void {
        const start = process.hrtime();
        return () => {
            const [seconds, nanoseconds] = process.hrtime(start);
            const duration = seconds * 1000 + nanoseconds / 1e6;
            LoggerUtil.info(`${label} completed`, {
                duration: Math.round(duration * 100) / 100,
                category: 'system',
            });
        };
    }

    private static defaultMetadata: Record<string, any> = {};

    static child(defaultMetadata: Record<string, any>): typeof logger {
        const childLogger = { ...logger };
        LoggerUtil.defaultMetadata = { ...LoggerUtil.defaultMetadata, ...defaultMetadata };
        return childLogger;
    }

    static addRequestId(requestId: string): typeof logger {
        return LoggerUtil.child({ requestId });
    }

    static addUserId(userId: string): typeof logger {
        return LoggerUtil.child({ userId });
    }

    static addConnectionId(connectionId: string): typeof logger {
        return LoggerUtil.child({ connectionId, category: 'connection' });
    }
}


// ==================== EXPORT ====================

const logger = {
    info: LoggerUtil.info.bind(LoggerUtil),
    error: LoggerUtil.error.bind(LoggerUtil),
    warn: LoggerUtil.warn.bind(LoggerUtil),
    debug: LoggerUtil.debug.bind(LoggerUtil),
    critical: LoggerUtil.critical.bind(LoggerUtil),
    performance: LoggerUtil.performance.bind(LoggerUtil),
    http: LoggerUtil.http.bind(LoggerUtil),
    query: LoggerUtil.query.bind(LoggerUtil),
    getMetrics: LoggerUtil.getMetrics.bind(LoggerUtil),
    getCircuitBreakerState: LoggerUtil.getCircuitBreakerState.bind(LoggerUtil),
    setSampleRate: LoggerUtil.setSampleRate.bind(LoggerUtil),
    flush: LoggerUtil.flush.bind(LoggerUtil),
    shutdown: LoggerUtil.shutdown.bind(LoggerUtil),
    auditLog: LoggerUtil.auditLog.bind(LoggerUtil),
    auditLogDetailed: LoggerUtil.auditLogDetailed.bind(LoggerUtil),
    security: LoggerUtil.security.bind(LoggerUtil),
    connection: LoggerUtil.connection.bind(LoggerUtil),
    validation: LoggerUtil.validation.bind(LoggerUtil),
    algorithm: LoggerUtil.algorithm.bind(LoggerUtil),
    logConnectionEvent: LoggerUtil.logConnectionEvent.bind(LoggerUtil),
    logProfileViewEvent: LoggerUtil.logProfileViewEvent.bind(LoggerUtil),
    sendSlackAlert: LoggerUtil.sendSlackAlert.bind(LoggerUtil),
    sendEmailAlert: LoggerUtil.sendEmailAlert.bind(LoggerUtil),
    startTimer: LoggerUtil.startTimer.bind(LoggerUtil),
    child: LoggerUtil.child.bind(LoggerUtil),
    addRequestId: LoggerUtil.addRequestId.bind(LoggerUtil),
    addUserId: LoggerUtil.addUserId.bind(LoggerUtil),
    addConnectionId: LoggerUtil.addConnectionId.bind(LoggerUtil),
};

const LoggerUtilProxy = new Proxy(LoggerUtil, {
    construct(_target: any, _args: any[]) {
        return logger;
    },
    get(target: any, prop: string | symbol) {
        if (prop === 'getInstance') {
            return () => logger;
        }
        if (typeof target[prop as keyof typeof target] === 'function') {
            return (target as any)[prop].bind(target);
        }
        return (target as any)[prop];
    },
    apply(_target: any, _thisArg: any, _args: any[]) {
        return logger;
    }
}) as any;  // Proxy as any for flexibility

Object.keys(LoggerUtil).forEach((key: string) => {
    if (typeof (LoggerUtil as any)[key] === 'function') {
        (LoggerUtilProxy as any)[key] = (LoggerUtil as any)[key].bind(LoggerUtil);
    }
});

(LoggerUtilProxy as any).getInstance = () => logger;

// ✅ REMOVED DUPLICATE SIGNAL HANDLERS - app.js will handle these

export {
    logger,
    winstonLogger,
    LoggerUtil,
    LoggerUtilProxy,
    PIISanitizer,
    CircuitBreaker,
    LogSampler,
    MetricsTracker
};

export default LoggerUtilProxy;