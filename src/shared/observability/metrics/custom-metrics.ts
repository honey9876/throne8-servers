/**
 * custom-metrics.ts
 * Prometheus metrics for auth-service-phase3-kafka
 * Provides metrics for HTTP, Kafka, Redis, authentication, and database
 * Compliant with NIST 800-63B and OWASP guidelines
 * server/thronet-server/src/shared/observability/metrics/custom-metrics.ts
 */

import { v4 as uuidv4 } from 'uuid';
import promClient from 'prom-client';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';

// Enable default metrics collection
promClient.collectDefaultMetrics({ prefix: 'auth_service_' });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
    name: 'auth_service_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

const authFailures = new promClient.Counter({
    name: 'auth_service_auth_failures_total',
    help: 'Total number of authentication failures',
    labelNames: ['reason'],
});

const kafkaMessageLatency = new promClient.Histogram({
    name: 'auth_service_kafka_message_latency_seconds',
    help: 'Latency of Kafka message processing in seconds',
    labelNames: ['topic'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

const redisCacheHitRatio = new promClient.Gauge({
    name: 'auth_service_redis_cache_hit_ratio',
    help: 'Ratio of Redis cache hits to total requests',
});

const activeUserSessions = new promClient.Gauge({
    name: 'auth_service_active_user_sessions',
    help: 'Number of active user sessions',
});

const tokenGenerationCounter = new promClient.Counter({
    name: 'auth_service_tokens_generated_total',
    help: 'Total number of tokens generated',
    labelNames: ['token_type'], // access, refresh, mfa
});

const mfaAttempts = new promClient.Counter({
    name: 'auth_service_mfa_attempts_total',
    help: 'Total number of MFA attempts',
    labelNames: ['method', 'status'], // method: sms, email, totp; status: success, failure
});

const passwordResetRequests = new promClient.Counter({
    name: 'auth_service_password_reset_requests_total',
    help: 'Total number of password reset requests',
    labelNames: ['status'], // initiated, completed, failed
});

const oauthLoginAttempts = new promClient.Counter({
    name: 'auth_service_oauth_login_attempts_total',
    help: 'Total number of OAuth login attempts',
    labelNames: ['provider', 'status'], // provider: google, facebook, github; status: success, failure
});

const databaseConnectionPool = new promClient.Gauge({
    name: 'auth_service_database_connection_pool_size',
    help: 'Current size of database connection pool',
    labelNames: ['status'], // active, idle, total
});

const kafkaProducerErrors = new promClient.Counter({
    name: 'auth_service_kafka_producer_errors_total',
    help: 'Total number of Kafka producer errors',
    labelNames: ['topic', 'error_type'],
});

const kafkaConsumerLag = new promClient.Gauge({
    name: 'auth_service_kafka_consumer_lag',
    help: 'Kafka consumer lag by topic and partition',
    labelNames: ['topic', 'partition', 'consumer_group'],
});

async function initializeMetrics(): Promise<void> {
    try {
        LoggerUtil.info('Custom Prometheus metrics initialized');

        // Log metrics initialization audit event
        await AuditProducer.connect();
        await AuditProducer.sendAuditEvent({
            eventId: uuidv4(),
            userId: null,
            action: 'METRICS_INITIALIZED',
            ipAddress: 'system',
            status: 'SUCCESS',
            severity: 'LOW',
            timestamp: new Date().toISOString(),
            metadata: {
                metrics: [
                    'http_request_duration',
                    'auth_failures',
                    'kafka_message_latency',
                    'redis_cache_hit_ratio',
                    'active_user_sessions',
                    'tokens_generated',
                    'mfa_attempts',
                    'password_reset_requests',
                    'oauth_login_attempts',
                    'database_connection_pool',
                    'kafka_producer_errors',
                    'kafka_consumer_lag'
                ]
            },
        });

        LoggerUtil.info('Metrics initialization audit event sent');

    } catch (error: unknown) {
        LoggerUtil.error('Metrics initialization failed', { error: (error as Error).message });

        try {
            await AuditProducer.connect();
            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(),
                userId: null,
                action: 'METRICS_INIT_FAILED',
                ipAddress: 'system',
                status: 'ERROR',
                severity: 'HIGH',
                timestamp: new Date().toISOString(),
                metadata: { error: (error as Error).message },
            });
        } catch (auditError: unknown) {
            LoggerUtil.error('Failed to send audit event for metrics initialization failure', {
                error: (auditError as Error).message
            });
        }

        throw error;
    } finally {
        await AuditProducer.disconnect().catch((err: unknown) =>
            LoggerUtil.error('Producer disconnect failed', { error: (err as Error).message })
        );
    }
}

// Helper functions for metric updates
function recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    httpRequestDuration.observe(
        { method, route, status_code: statusCode.toString() },
        duration
    );
}

function incrementAuthFailure(reason: string): void {
    authFailures.inc({ reason });
}

function recordKafkaLatency(topic: string, latency: number): void {
    kafkaMessageLatency.observe({ topic }, latency);
}

function updateCacheHitRatio(ratio: number): void {
    redisCacheHitRatio.set(ratio);
}

function updateActiveSessions(count: number): void {
    activeUserSessions.set(count);
}

function incrementTokenGeneration(tokenType: string): void {
    tokenGenerationCounter.inc({ token_type: tokenType });
}

function recordMfaAttempt(method: string, status: string): void {
    mfaAttempts.inc({ method, status });
}

function recordPasswordReset(status: string): void {
    passwordResetRequests.inc({ status });
}

function recordOAuthLogin(provider: string, status: string): void {
    oauthLoginAttempts.inc({ provider, status });
}

function updateDbConnectionPool(active: number, idle: number): void {
    databaseConnectionPool.set({ status: 'active' }, active);
    databaseConnectionPool.set({ status: 'idle' }, idle);
    databaseConnectionPool.set({ status: 'total' }, active + idle);
}

function incrementKafkaProducerError(topic: string, errorType: string): void {
    kafkaProducerErrors.inc({ topic, error_type: errorType });
}

function updateKafkaConsumerLag(topic: string, partition: string, consumerGroup: string, lag: number): void {
    kafkaConsumerLag.set({ topic, partition, consumer_group: consumerGroup }, lag);
}

export {
    // Metrics
    httpRequestDuration,
    authFailures,
    kafkaMessageLatency,
    redisCacheHitRatio,
    activeUserSessions,
    tokenGenerationCounter,
    mfaAttempts,
    passwordResetRequests,
    oauthLoginAttempts,
    databaseConnectionPool,
    kafkaProducerErrors,
    kafkaConsumerLag,

    // Initialize function
    initializeMetrics,

    // Helper functions
    recordHttpRequest,
    incrementAuthFailure,
    recordKafkaLatency,
    updateCacheHitRatio,
    updateActiveSessions,
    incrementTokenGeneration,
    recordMfaAttempt,
    recordPasswordReset,
    recordOAuthLogin,
    updateDbConnectionPool,
    incrementKafkaProducerError,
    updateKafkaConsumerLag,

    // Prometheus client for custom use
    promClient
};