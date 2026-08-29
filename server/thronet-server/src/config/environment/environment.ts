// src/config/environment.ts
import { config } from 'dotenv';
import rateLimit from 'express-rate-limit';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { ErrorResponse } from '@/shared/response.util';
import constants from '@/shared/constants.util';

const ERROR_CODES = constants.ERROR_CODES;

config();

const toBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
};

const toNumber = (value: string | undefined, defaultValue: number): number => {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
};

interface DatabaseConfig {
    mongodb: {
        uri: string;
        dbName: string;
        maxPoolSize: number;
        minPoolSize: number;
        connectTimeoutMS: number;
        serverSelectionTimeoutMS: number;
    };
    redis: {
        host: string;
        port: number;
        password?: string;
        db: number;
        clusterMode: boolean;
        clusterNodes?: string;
        maxRetries: number;
        retryDelayOnFailover: number;
        ttlSeconds: number;
    };
    neo4j: {
        uri: string;
        username: string;
        password: string;
        encrypted: boolean;
        maxConnectionPoolSize: number;
        connectTimeout: number;
        maxConnectionLifetime: number;
        connectionAcquisitionTimeout: number;
        loggingLevel: 'error' | 'warn' | 'info' | 'debug';
    };
}

interface KafkaConfig {
    enabled: boolean;
    brokers: string;
    clientId: string;
    groupId: string;
    connectionTimeout: number;
    requestTimeout: number;
    retryMax: number;
    retryInitialDelay: number;
    retryMultiplier: number;
    logLevel: string;
    producer: {
        enabled: boolean;
        batchSize: number;
        compression: string;
        timeout: number;
        idempotent: boolean;
        maxInFlight: number;
    };
    consumer: {
        enabled: boolean;
        sessionTimeout: number;
        heartbeatInterval: number;
        autoCommit: boolean;
        autoCommitInterval: number;
        maxBatchSize: number;
    };
    topics: {
        partitions: number;
        replicationFactor: number;
        prefix: string;
    };
    dlq: {
        enabled: boolean;
        topic: string;
        maxRetries: number;
    };
    healthCheck: {
        interval: number;
        timeout: number;
    };
}

interface EnvironmentConfig {
    PORT: number;
    NODE_ENV: 'development' | 'production' | 'test';
    SERVICE_NAME: string;
    API_VERSION: string;
    BUILD_ID: string;
    GRACEFUL_SHUTDOWN_TIMEOUT_MS: number;
    SSL_ENABLED: boolean;
    SSL_KEY_PATH: string;
    SSL_CERT_PATH: string;
    API_KEY_HEADER: string;
    INTERNAL_API_KEY: string;
    REQUEST_TIMEOUT_MS: number;
    CONNECTION_EXPIRY_DAYS: number;
    DATA_RETENTION_DAYS: number;
    BULK_OPERATION_BATCH_SIZE: number;
    JWT_SECRET: string;
    JWT_EXPIRES_IN: string;
    JWT_REFRESH_EXPIRES_IN: string;
    JWT_ALGORITHM: string;
    ENCRYPTION_KEY: string;
    SALT_ROUNDS: number;
    ENABLE_JWT_AUTH: boolean;
    ENABLE_API_DOCS: boolean;
    ENABLE_CORS: boolean;
    CORS_ALLOWED_ORIGINS: string;
    CORS_METHODS: string;
    CORS_ORIGIN: string;
    CORS_ALLOWED_HEADERS: string;
    CORS_CREDENTIALS: boolean;
    ENABLE_HELMET: boolean;
    ENABLE_COMPRESSION: boolean;
    ENABLE_RATE_LIMITING: boolean;
    RATE_LIMIT_WINDOW_MS: number;
    RATE_LIMIT_MAX_REQUESTS: number;
    RATE_LIMIT_SKIP_SUCCESS_REQUESTS: boolean;
    BODY_PARSER_LIMIT: string;
    ENABLE_REQUEST_LOGGING: boolean;
    PAGINATION_DEFAULT_LIMIT: number;
    PAGINATION_MAX_LIMIT: number;
    CSP_SCRIPT_SRC: string;
    CSP_STYLE_SRC: string;
    CSP_IMG_SRC: string;
    CSP_CONNECT_SRC: string;
    CSP_FONT_SRC: string;
    CSP_REPORT_ONLY: boolean;
    HSTS_MAX_AGE: number;
    MONGODB_URI: string;
    MONGODB_DBNAME: string;
    MONGODB_MAX_POOL_SIZE: number;
    MONGODB_MIN_POOL_SIZE: number;
    MONGODB_CONNECT_TIMEOUT_MS: number;
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: number;
    REDIS_HOST: string;
    REDIS_PORT: number;
    REDIS_PASSWORD?: string;
    REDIS_DB: number;
    REDIS_CLUSTER_MODE: boolean;
    REDIS_POOL_SIZE: number;
    REDIS_CLUSTER_NODES?: string;
    REDIS_MAX_RETRIES: number;
    REDIS_ENABLED: boolean;
    REDIS_RETRY_DELAY_ON_FAILOVER: number;
    REDIS_TTL_SECONDS: number;
    REDIS_QUEUE_DB?: number;
    NEO4J_ENCRYPTED: boolean;
    NEO4J_LOGGING_LEVEL: 'error' | 'warn' | 'info' | 'debug';
    NEO4J_URI: string;
    NEO4J_USERNAME: string;
    NEO4J_PASSWORD: string;
    NEO4J_DATABASE: string;
    NEO4J_CONNECT_TIMEOUT: number;
    NEO4J_MAX_CONNECTION_LIFETIME: number;
    NEO4J_CONNECTION_ACQUISITION_TIMEOUT: number;
    NEO4J_MAX_CONNECTION_POOL_SIZE: number;
    NEO4J_RETRY_DELAY_MS: number;
    NEO4J_HEALTH_CHECK_INTERVAL_MS: number;
    NEO4J_MAX_RETRIES: number;
    NEO4J_MAX_TRANSACTION_RETRY_TIME: number;
    NEO4J_TRUST_STRATEGY: string;
    USER_SERVICE_URL: string;
    USER_SERVICE_API_KEY: string;
    USER_SERVICE_TIMEOUT: number;
    NOTIFICATION_SERVICE_URL: string;
    NOTIFICATION_SERVICE_API_KEY: string;
    NOTIFICATION_SERVICE_TIMEOUT: number;
    ANALYTICS_SERVICE_URL: string;
    ANALYTICS_SERVICE_API_KEY: string;
    ANALYTICS_SERVICE_TIMEOUT: number;
    ENABLE_EXTERNAL_HEALTH_CHECKS: boolean;
    LOG_LEVEL: string;
    AUDIT_LOG_ENABLED: boolean;
    LOG_DIR: string;
    LOG_ENABLE_CONSOLE: boolean;
    LOG_ENABLE_FILE: boolean;
    LOG_ENABLE_ROTATION: boolean;
    LOG_MAX_SIZE: string;
    LOG_MAX_FILES: string;
    LOG_DATE_PATTERN: string;
    LOG_FORMAT: string;
    LOG_FILE_PATH: string;
    LOG_ERROR_FILE_PATH: string;
    LOG_ACCESS_FILE_PATH: string;
    LOG_KAFKA_FILE_PATH: string;
    LOG_ENABLE_SYSLOG: boolean;
    SYSLOG_HOST: string;
    SYSLOG_PORT: number;
    SYSLOG_PROTOCOL: string;
    SYSLOG_FACILITY: string;
    LOG_ENABLE_SLACK: boolean;
    SLACK_WEBHOOK_URL?: string;
    SLACK_CHANNEL: string;
    SLACK_USERNAME: string;
    SLACK_ALERT_LEVEL: string;
    SLACK_RATE_LIMIT_MINUTES: number;
    LOG_EMAIL_ENABLED: boolean;
    LOG_EMAIL_HOST?: string;
    LOG_EMAIL_PORT: number;
    LOG_EMAIL_SECURE: boolean;
    LOG_EMAIL_USER?: string;
    LOG_EMAIL_PASS?: string;
    LOG_EMAIL_TO?: string;
    LOG_EMAIL_FROM?: string;
    EMAIL_ALERT_LEVEL: string;
    EMAIL_RATE_LIMIT_MINUTES: number;
    EMAIL_TEMPLATE: string;
    LOG_ENABLE_AUDIT: boolean;
    LOG_ENABLE_PERFORMANCE: boolean;
    LOG_ENABLE_SECURITY: boolean;
    LOG_BUFFER_SIZE: number;
    LOG_FLUSH_INTERVAL_MS: number;
    LOG_COMPRESS_ROTATED: boolean;
    LOG_RETENTION_DAYS: number;
    LOG_ENABLE_SAMPLING: boolean;
    LOG_SAMPLE_RATE: number;
    LOG_SAMPLE_EXCLUDE_LEVELS: string;
    LOG_EXCLUDE_ROUTES: string;
    LOG_EXCLUDE_USER_AGENTS: string;
    LOG_MASK_SENSITIVE_DATA: boolean;
    LOG_SENSITIVE_FIELDS: string;
    ALERT_RATE_LIMIT_WINDOW: number;
    ALERT_RATE_LIMIT_MAX: number;
    METRICS_ENABLED: boolean;
    METRICS_PORT: number;
    METRICS_PROMETHEUS_ENABLED: boolean;
    METRICS_PROMETHEUS_PATH: string;
    ENABLE_PERIODIC_HEALTH_CHECKS: boolean;
    HEALTH_CHECK_INTERVAL_MS: number;
    CIRCUIT_BREAKER_ENABLED: boolean;
    CACHE_TTL_SECONDS: number;
    CIRCUIT_BREAKER_THRESHOLD: number;
    CIRCUIT_BREAKER_TIMEOUT_MS: number;
    CIRCUIT_BREAKER_RESET_TIMEOUT_MS: number;
    CLUSTER_MODE: boolean;
    WORKER_COUNT?: number;
    CACHE_MAX_ENTRIES: number;
    CACHE_PREFIX: string;
    CACHE_COMPRESS: boolean;
    CACHE_VERSION: number;
    USER_PROFILE_CACHE_TTL: number;
    CONNECTION_LIST_CACHE_TTL: number;
    SEARCH_RESULTS_CACHE_TTL: number;
    MUTUAL_CONNECTIONS_CACHE_TTL: number;
    PROFILE_VIEWS_CACHE_TTL: number;
    DEGREE_CACHE_TTL: number;
    CENTRALITY_CACHE_TTL: number;
    SHORTEST_PATHS_CACHE_TTL: number;
    COMMUNITIES_CACHE_TTL: number;
    VISUALIZATION_CACHE_TTL: number;
    ANALYTICS_CACHE_TTL: number;
    MAX_METADATA_KEYS: number;
    MAX_RETRY_ATTEMPTS: number;
    RETRY_DELAY_MS: number;
    CONNECTION_TIMEOUT_MS: number;
    MAX_CONNECTION_REQUESTS_PER_DAY: number;
    MAX_CONNECTIONS_PER_USER: number;
    DEFAULT_PROFILE_VISIBILITY: string;
    CONNECTION_REQUEST_RATE_LIMIT: number;
    PROFILE_VIEWS_RATE_LIMIT: number;
    ENFORCE_PROFILE_VISIBILITY: boolean;
    ENABLE_PROFILE_VIEW_NOTIFICATIONS: boolean;
    PROFILE_VIEW_NOTIFICATION_TEMPLATE: string;
    ENABLE_PROFILE_VIEW_ANALYTICS: boolean;
    AUTO_ACCEPT_CONNECTIONS: boolean;
    RATE_LIMIT_HEALTH: number;
    RATE_LIMIT_RECORD_VIEW: number;
    RATE_LIMIT_GET_VIEWERS: number;
    RATE_LIMIT_GET_COUNT: number;
    RATE_LIMIT_GET_ANALYTICS: number;
    RATE_LIMIT_SET_PRIVACY: number;
    RATE_LIMIT_DELETE_HISTORY: number;
    RATE_LIMIT_GET_INSIGHTS: number;
    RATE_LIMIT_EXPORT_DATA: number;
    RATE_LIMIT_BATCH_OPS: number;
    RATE_LIMIT_MAX: number;
    AUTH_SERVICE_URL: string;
    AUTH_SERVICE_TIMEOUT?: number;
    AUTH_SERVICE_API_KEY?: string;
    KAFKA_ENABLED: boolean;
    KAFKA_BROKERS: string;
    KAFKA_CLIENT_ID: string;
    KAFKA_GROUP_ID: string;


    // Kafka Configuration
    KAFKA: KafkaConfig;

    getDatabaseConfig: () => DatabaseConfig;
    createRateLimiter: () => RateLimitRequestHandler;
}

const environmentConfig: EnvironmentConfig = {
    PORT: toNumber(process.env.PORT, 3000),
    NODE_ENV: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
    SERVICE_NAME: process.env.SERVICE_NAME || 'connection-service',
    API_VERSION: process.env.API_VERSION || 'v1',
    BUILD_ID: process.env.BUILD_ID || '1.0.0',
    GRACEFUL_SHUTDOWN_TIMEOUT_MS: toNumber(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS, 30000),
    SSL_ENABLED: toBoolean(process.env.SSL_ENABLED, false),
    SSL_KEY_PATH: process.env.SSL_KEY_PATH || '',
    SSL_CERT_PATH: process.env.SSL_CERT_PATH || '',
    API_KEY_HEADER: process.env.API_KEY_HEADER || 'X-API-Key',
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || 'your-secret-api-key',
    REQUEST_TIMEOUT_MS: toNumber(process.env.REQUEST_TIMEOUT_MS, 30000),
    CONNECTION_EXPIRY_DAYS: toNumber(process.env.CONNECTION_EXPIRY_DAYS, 30),
    DATA_RETENTION_DAYS: toNumber(process.env.DATA_RETENTION_DAYS, 365),
    BULK_OPERATION_BATCH_SIZE: toNumber(process.env.BULK_OPERATION_BATCH_SIZE, 1000),
    JWT_SECRET: process.env.JWT_SECRET || '',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    JWT_ALGORITHM: process.env.JWT_ALGORITHM || 'HS256',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'your-encryption-key',
    SALT_ROUNDS: toNumber(process.env.SALT_ROUNDS, 12),
    ENABLE_JWT_AUTH: toBoolean(process.env.ENABLE_JWT_AUTH, true),
    ENABLE_CORS: toBoolean(process.env.ENABLE_CORS, true),
    CORS_ALLOWED_ORIGINS: process.env.CORS_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || '*',
    CORS_METHODS: process.env.CORS_METHODS || 'GET,POST,PUT,DELETE',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://example.com',
    CORS_ALLOWED_HEADERS: process.env.CORS_ALLOWED_HEADERS || 'Content-Type,Authorization,X-API-Key',
    CORS_CREDENTIALS: toBoolean(process.env.CORS_CREDENTIALS, true),
    ENABLE_HELMET: toBoolean(process.env.ENABLE_HELMET, true),
    ENABLE_COMPRESSION: toBoolean(process.env.ENABLE_COMPRESSION, true),
    ENABLE_API_DOCS: toBoolean(process.env.ENABLE_API_DOCS, false),
    ENABLE_RATE_LIMITING: toBoolean(process.env.ENABLE_RATE_LIMITING, true),
    RATE_LIMIT_WINDOW_MS: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 900000),
    RATE_LIMIT_MAX_REQUESTS: toNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 1000),
    RATE_LIMIT_SKIP_SUCCESS_REQUESTS: toBoolean(process.env.RATE_LIMIT_SKIP_SUCCESS_REQUESTS, false),
    BODY_PARSER_LIMIT: process.env.BODY_PARSER_LIMIT || '10mb',
    ENABLE_REQUEST_LOGGING: toBoolean(process.env.ENABLE_REQUEST_LOGGING, true),
    PAGINATION_DEFAULT_LIMIT: toNumber(process.env.PAGINATION_DEFAULT_LIMIT, 10),
    PAGINATION_MAX_LIMIT: toNumber(process.env.PAGINATION_MAX_LIMIT, 100),
    CSP_SCRIPT_SRC: process.env.CSP_SCRIPT_SRC || "'self'",
    CSP_STYLE_SRC: process.env.CSP_STYLE_SRC || "'self'",
    CSP_IMG_SRC: process.env.CSP_IMG_SRC || "'self'",
    CSP_CONNECT_SRC: process.env.CSP_CONNECT_SRC || "'self'",
    CSP_FONT_SRC: process.env.CSP_FONT_SRC || "'self'",
    CSP_REPORT_ONLY: toBoolean(process.env.CSP_REPORT_ONLY, false),
    HSTS_MAX_AGE: toNumber(process.env.HSTS_MAX_AGE, 31536000),
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://mongo:27017',
    MONGODB_DBNAME: process.env.MONGODB_DBNAME || 'connection_db',
    MONGODB_MAX_POOL_SIZE: toNumber(process.env.MONGODB_MAX_POOL_SIZE, 10),
    MONGODB_MIN_POOL_SIZE: toNumber(process.env.MONGODB_MIN_POOL_SIZE, 5),
    MONGODB_CONNECT_TIMEOUT_MS: toNumber(process.env.MONGODB_CONNECT_TIMEOUT_MS, 10000),
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: toNumber(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 5000),
    REDIS_HOST: process.env.REDIS_HOST || 'redis',
    REDIS_ENABLED: toBoolean(process.env.REDIS_ENABLED, true),
    REDIS_PORT: toNumber(process.env.REDIS_PORT, 6379),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_DB: toNumber(process.env.REDIS_DB, 0),
    REDIS_CLUSTER_MODE: toBoolean(process.env.REDIS_CLUSTER_MODE, false),
    REDIS_POOL_SIZE: toNumber(process.env.REDIS_POOL_SIZE, 2),
    REDIS_CLUSTER_NODES: process.env.REDIS_CLUSTER_NODES,
    REDIS_MAX_RETRIES: toNumber(process.env.REDIS_MAX_RETRIES, 3),
    REDIS_RETRY_DELAY_ON_FAILOVER: toNumber(process.env.REDIS_RETRY_DELAY_ON_FAILOVER, 100),
    REDIS_TTL_SECONDS: toNumber(process.env.REDIS_TTL || process.env.REDIS_TTL_SECONDS, 86400),
    NEO4J_URI: process.env.NEO4J_URI || 'neo4j://neo4j:7687',
    NEO4J_USERNAME: process.env.NEO4J_USERNAME || 'neo4j',
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || 'neo4j_default',
    NEO4J_ENCRYPTED: toBoolean(process.env.NEO4J_ENCRYPTED, false),
    NEO4J_MAX_CONNECTION_POOL_SIZE: toNumber(process.env.NEO4J_MAX_CONNECTION_POOL_SIZE, 50),
    NEO4J_CONNECT_TIMEOUT: toNumber(process.env.NEO4J_CONNECT_TIMEOUT, 60000),
    NEO4J_MAX_CONNECTION_LIFETIME: toNumber(process.env.NEO4J_MAX_CONNECTION_LIFETIME, 3600000),
    NEO4J_CONNECTION_ACQUISITION_TIMEOUT: toNumber(process.env.NEO4J_CONNECTION_ACQUISITION_TIMEOUT, 90000),
    NEO4J_LOGGING_LEVEL: (process.env.NEO4J_LOGGING_LEVEL || 'warn') as 'error' | 'warn' | 'info' | 'debug',
    NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'neo4j',
    NEO4J_RETRY_DELAY_MS: toNumber(process.env.NEO4J_RETRY_DELAY_MS, 3000),
    NEO4J_HEALTH_CHECK_INTERVAL_MS: toNumber(process.env.NEO4J_HEALTH_CHECK_INTERVAL_MS, 60000),
    NEO4J_MAX_RETRIES: toNumber(process.env.NEO4J_MAX_RETRIES, 5),
    NEO4J_MAX_TRANSACTION_RETRY_TIME: toNumber(process.env.NEO4J_MAX_TRANSACTION_RETRY_TIME, 30000),
    NEO4J_TRUST_STRATEGY: process.env.NEO4J_TRUST_STRATEGY || 'TRUST_ALL_CERTIFICATES',
    USER_SERVICE_URL: process.env.USER_SERVICE_URL || '',
    USER_SERVICE_API_KEY: process.env.USER_SERVICE_API_KEY || '',
    USER_SERVICE_TIMEOUT: toNumber(process.env.USER_SERVICE_TIMEOUT, 5000),
    NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || '',
    NOTIFICATION_SERVICE_API_KEY: process.env.NOTIFICATION_SERVICE_API_KEY || '',
    NOTIFICATION_SERVICE_TIMEOUT: toNumber(process.env.NOTIFICATION_SERVICE_TIMEOUT, 5000),
    ANALYTICS_SERVICE_URL: process.env.ANALYTICS_SERVICE_URL || '',
    ANALYTICS_SERVICE_API_KEY: process.env.ANALYTICS_SERVICE_API_KEY || '',
    ANALYTICS_SERVICE_TIMEOUT: toNumber(process.env.ANALYTICS_SERVICE_TIMEOUT, 5000),
    ENABLE_EXTERNAL_HEALTH_CHECKS: toBoolean(process.env.ENABLE_EXTERNAL_HEALTH_CHECKS, false),
    LOG_LEVEL: process.env.LOG_LEVEL || 'warn',
    AUDIT_LOG_ENABLED: toBoolean(process.env.AUDIT_LOG_ENABLED, true),
    LOG_DIR: process.env.LOG_DIR || './logs',
    LOG_ENABLE_CONSOLE: toBoolean(process.env.LOG_ENABLE_CONSOLE, true),
    LOG_ENABLE_FILE: toBoolean(process.env.LOG_ENABLE_FILE, true),
    LOG_ENABLE_ROTATION: toBoolean(process.env.LOG_ENABLE_ROTATION, true),
    LOG_MAX_SIZE: process.env.LOG_MAX_SIZE || '2m',
    LOG_MAX_FILES: process.env.LOG_MAX_FILES || '14d',
    LOG_DATE_PATTERN: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD',
    LOG_FORMAT: process.env.LOG_FORMAT || 'json',
    LOG_FILE_PATH: process.env.LOG_FILE_PATH || './logs/app.log',
    LOG_ERROR_FILE_PATH: process.env.LOG_ERROR_FILE_PATH || './logs/error.log',
    LOG_ACCESS_FILE_PATH: process.env.LOG_ACCESS_FILE_PATH || './logs/access.log',
    LOG_KAFKA_FILE_PATH: process.env.LOG_KAFKA_FILE_PATH || './logs/kafka.log',
    LOG_ENABLE_SYSLOG: toBoolean(process.env.LOG_ENABLE_SYSLOG, false),
    SYSLOG_HOST: process.env.SYSLOG_HOST || 'localhost',
    SYSLOG_PORT: toNumber(process.env.SYSLOG_PORT, 514),
    SYSLOG_PROTOCOL: process.env.SYSLOG_PROTOCOL || 'udp',
    SYSLOG_FACILITY: process.env.SYSLOG_FACILITY || 'local0',
    LOG_ENABLE_SLACK: toBoolean(process.env.LOG_ENABLE_SLACK, false),
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
    SLACK_CHANNEL: process.env.SLACK_CHANNEL || '#alerts',
    SLACK_USERNAME: process.env.SLACK_USERNAME || 'Connection-Service-Bot',
    SLACK_ALERT_LEVEL: process.env.SLACK_ALERT_LEVEL || 'error',
    SLACK_RATE_LIMIT_MINUTES: toNumber(process.env.SLACK_RATE_LIMIT_MINUTES, 5),
    LOG_EMAIL_ENABLED: toBoolean(process.env.LOG_EMAIL_ENABLED, false),
    LOG_EMAIL_HOST: process.env.EMAIL_HOST || process.env.LOG_EMAIL_HOST,
    LOG_EMAIL_PORT: toNumber(process.env.EMAIL_PORT || process.env.LOG_EMAIL_PORT, 587),
    LOG_EMAIL_SECURE: toBoolean(process.env.EMAIL_SECURE || process.env.LOG_EMAIL_SECURE, false),
    LOG_EMAIL_USER: process.env.EMAIL_USER || process.env.LOG_EMAIL_USER,
    LOG_EMAIL_PASS: process.env.EMAIL_PASS || process.env.LOG_EMAIL_PASS,
    LOG_EMAIL_TO: process.env.LOG_EMAIL_TO,
    LOG_EMAIL_FROM: process.env.LOG_EMAIL_FROM,
    EMAIL_ALERT_LEVEL: process.env.EMAIL_ALERT_LEVEL || 'error',
    EMAIL_RATE_LIMIT_MINUTES: toNumber(process.env.EMAIL_RATE_LIMIT_MINUTES, 10),
    EMAIL_TEMPLATE: process.env.EMAIL_TEMPLATE || 'text',
    LOG_ENABLE_AUDIT: toBoolean(process.env.LOG_ENABLE_AUDIT, true),
    LOG_ENABLE_PERFORMANCE: toBoolean(process.env.LOG_ENABLE_PERFORMANCE, true),
    LOG_ENABLE_SECURITY: toBoolean(process.env.LOG_ENABLE_SECURITY, true),
    LOG_BUFFER_SIZE: toNumber(process.env.LOG_BUFFER_SIZE, 1000),
    LOG_FLUSH_INTERVAL_MS: toNumber(process.env.LOG_FLUSH_INTERVAL_MS, 5000),
    LOG_COMPRESS_ROTATED: toBoolean(process.env.LOG_COMPRESS_ROTATED, true),
    LOG_RETENTION_DAYS: toNumber(process.env.LOG_RETENTION_DAYS, 90),
    LOG_ENABLE_SAMPLING: toBoolean(process.env.LOG_ENABLE_SAMPLING, false),
    LOG_SAMPLE_RATE: parseFloat(process.env.LOG_SAMPLE_RATE || '0.1'),
    LOG_SAMPLE_EXCLUDE_LEVELS: process.env.LOG_SAMPLE_EXCLUDE_LEVELS || 'error,warn',
    LOG_EXCLUDE_ROUTES: process.env.LOG_EXCLUDE_ROUTES || '/health,/metrics,/favicon.ico',
    LOG_EXCLUDE_USER_AGENTS: process.env.LOG_EXCLUDE_USER_AGENTS || 'ELB-HealthChecker,kube-probe',
    LOG_MASK_SENSITIVE_DATA: toBoolean(process.env.LOG_MASK_SENSITIVE_DATA, true),
    LOG_SENSITIVE_FIELDS: process.env.LOG_SENSITIVE_FIELDS || 'password,token,secret,authorization,cookie',
    ALERT_RATE_LIMIT_WINDOW: toNumber(process.env.ALERT_RATE_LIMIT_WINDOW, 900000),
    ALERT_RATE_LIMIT_MAX: toNumber(process.env.ALERT_RATE_LIMIT_MAX, 10),
    METRICS_ENABLED: toBoolean(process.env.METRICS_ENABLED, true),
    METRICS_PORT: toNumber(process.env.METRICS_PORT, 9090),
    METRICS_PROMETHEUS_ENABLED: toBoolean(process.env.METRICS_PROMETHEUS_ENABLED, true),
    METRICS_PROMETHEUS_PATH: process.env.METRICS_PROMETHEUS_PATH || '/metrics',
    ENABLE_PERIODIC_HEALTH_CHECKS: toBoolean(process.env.ENABLE_PERIODIC_HEALTH_CHECKS, true),
    HEALTH_CHECK_INTERVAL_MS: toNumber(process.env.HEALTH_CHECK_INTERVAL_MS, 60000),
    CIRCUIT_BREAKER_ENABLED: toBoolean(process.env.CIRCUIT_BREAKER_ENABLED, true),
    CACHE_TTL_SECONDS: toNumber(process.env.CACHE_TTL_SECONDS, 3600),
    CIRCUIT_BREAKER_THRESHOLD: toNumber(process.env.CIRCUIT_BREAKER_THRESHOLD, 5),
    CIRCUIT_BREAKER_TIMEOUT_MS: toNumber(process.env.CIRCUIT_BREAKER_TIMEOUT_MS, 10000),
    CIRCUIT_BREAKER_RESET_TIMEOUT_MS: toNumber(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS, 30000),
    CLUSTER_MODE: toBoolean(process.env.CLUSTER_MODE, false),
    WORKER_COUNT: process.env.WORKER_COUNT ? toNumber(process.env.WORKER_COUNT, 0) : undefined,
    CACHE_MAX_ENTRIES: toNumber(process.env.CACHE_MAX_ENTRIES, 10000),
    CACHE_PREFIX: process.env.CACHE_PREFIX || 'conn_service',
    CACHE_COMPRESS: toBoolean(process.env.CACHE_COMPRESS, true),
    CACHE_VERSION: toNumber(process.env.CACHE_VERSION, 1),
    USER_PROFILE_CACHE_TTL: toNumber(process.env.USER_PROFILE_CACHE_TTL, 1800),
    CONNECTION_LIST_CACHE_TTL: toNumber(process.env.CONNECTION_LIST_CACHE_TTL, 600),
    SEARCH_RESULTS_CACHE_TTL: toNumber(process.env.SEARCH_RESULTS_CACHE_TTL, 300),
    MUTUAL_CONNECTIONS_CACHE_TTL: toNumber(process.env.MUTUAL_CONNECTIONS_CACHE_TTL, 3600),
    PROFILE_VIEWS_CACHE_TTL: toNumber(process.env.PROFILE_VIEWS_CACHE_TTL, 1800),
    DEGREE_CACHE_TTL: toNumber(process.env.DEGREE_CACHE_TTL, 3600),
    CENTRALITY_CACHE_TTL: toNumber(process.env.CENTRALITY_CACHE_TTL, 7200),
    SHORTEST_PATHS_CACHE_TTL: toNumber(process.env.SHORTEST_PATHS_CACHE_TTL, 3600),
    COMMUNITIES_CACHE_TTL: toNumber(process.env.COMMUNITIES_CACHE_TTL, 86400),
    VISUALIZATION_CACHE_TTL: toNumber(process.env.VISUALIZATION_CACHE_TTL, 1800),
    ANALYTICS_CACHE_TTL: toNumber(process.env.ANALYTICS_CACHE_TTL, 7200),
    MAX_METADATA_KEYS: toNumber(process.env.MAX_METADATA_KEYS, 10),
    MAX_RETRY_ATTEMPTS: toNumber(process.env.MAX_RETRY_ATTEMPTS, 3),
    RETRY_DELAY_MS: toNumber(process.env.RETRY_DELAY_MS, 1000),
    CONNECTION_TIMEOUT_MS: toNumber(process.env.CONNECTION_TIMEOUT_MS, 30000),
    MAX_CONNECTION_REQUESTS_PER_DAY: toNumber(process.env.MAX_CONNECTION_REQUESTS_PER_DAY, 50),
    MAX_CONNECTIONS_PER_USER: toNumber(process.env.MAX_CONNECTIONS_PER_USER, 1000),
    DEFAULT_PROFILE_VISIBILITY: process.env.DEFAULT_PROFILE_VISIBILITY || 'public',
    CONNECTION_REQUEST_RATE_LIMIT: toNumber(process.env.CONNECTION_REQUEST_RATE_LIMIT, 10),
    PROFILE_VIEWS_RATE_LIMIT: toNumber(process.env.PROFILE_VIEWS_RATE_LIMIT, 50),
    ENFORCE_PROFILE_VISIBILITY: toBoolean(process.env.ENFORCE_PROFILE_VISIBILITY, true),
    ENABLE_PROFILE_VIEW_NOTIFICATIONS: toBoolean(process.env.ENABLE_PROFILE_VIEW_NOTIFICATIONS, true),
    PROFILE_VIEW_NOTIFICATION_TEMPLATE: process.env.PROFILE_VIEW_NOTIFICATION_TEMPLATE || 'profile_view',
    ENABLE_PROFILE_VIEW_ANALYTICS: toBoolean(process.env.ENABLE_PROFILE_VIEW_ANALYTICS, true),
    AUTO_ACCEPT_CONNECTIONS: toBoolean(process.env.AUTO_ACCEPT_CONNECTIONS, false),
    RATE_LIMIT_HEALTH: toNumber(process.env.RATE_LIMIT_HEALTH, 100),
    RATE_LIMIT_RECORD_VIEW: toNumber(process.env.RATE_LIMIT_RECORD_VIEW, 50),
    RATE_LIMIT_GET_VIEWERS: toNumber(process.env.RATE_LIMIT_GET_VIEWERS, 50),
    RATE_LIMIT_GET_COUNT: toNumber(process.env.RATE_LIMIT_GET_COUNT, 50),
    RATE_LIMIT_GET_ANALYTICS: toNumber(process.env.RATE_LIMIT_GET_ANALYTICS, 20),
    RATE_LIMIT_SET_PRIVACY: toNumber(process.env.RATE_LIMIT_SET_PRIVACY, 10),
    RATE_LIMIT_DELETE_HISTORY: toNumber(process.env.RATE_LIMIT_DELETE_HISTORY, 5),
    RATE_LIMIT_GET_INSIGHTS: toNumber(process.env.RATE_LIMIT_GET_INSIGHTS, 20),
    RATE_LIMIT_EXPORT_DATA: toNumber(process.env.RATE_LIMIT_EXPORT_DATA, 5),
    RATE_LIMIT_BATCH_OPS: toNumber(process.env.RATE_LIMIT_BATCH_OPS, 10),
    RATE_LIMIT_MAX: toNumber(process.env.RATE_LIMIT_MAX, 100),
    AUTH_SERVICE_URL: 'https://example.com/auth-service',
    KAFKA_ENABLED: process.env.KAFKA_ENABLED === 'true',
    KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'localhost:9092',
    KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'thronet-connection-service',
    KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'thronet-connection-consumer-group',

    // Kafka Configuration
    KAFKA: {

        enabled: toBoolean(process.env.KAFKA_ENABLED, true),
        brokers: process.env.KAFKA_BROKERS || 'localhost:9092',
        clientId: process.env.KAFKA_CLIENT_ID || 'connection-service',
        groupId: process.env.KAFKA_GROUP_ID || 'connection-service-group',
        connectionTimeout: toNumber(process.env.KAFKA_CONNECTION_TIMEOUT, 10000),
        requestTimeout: toNumber(process.env.KAFKA_REQUEST_TIMEOUT, 30000),
        retryMax: toNumber(process.env.KAFKA_RETRY_MAX, 5),
        retryInitialDelay: toNumber(process.env.KAFKA_RETRY_INITIAL_DELAY, 300),
        retryMultiplier: toNumber(process.env.KAFKA_RETRY_MULTIPLIER, 2),
        logLevel: process.env.KAFKA_LOG_LEVEL || 'info',
        producer: {
            enabled: toBoolean(process.env.KAFKA_PRODUCER_ENABLED, true),
            batchSize: toNumber(process.env.KAFKA_PRODUCER_BATCH_SIZE, 16384),
            compression: process.env.KAFKA_PRODUCER_COMPRESSION || 'gzip',
            timeout: toNumber(process.env.KAFKA_PRODUCER_TIMEOUT, 30000),
            idempotent: toBoolean(process.env.KAFKA_PRODUCER_IDEMPOTENT, true),
            maxInFlight: toNumber(process.env.KAFKA_PRODUCER_MAX_IN_FLIGHT, 5),
        },
        consumer: {
            enabled: toBoolean(process.env.KAFKA_CONSUMER_ENABLED, true),
            sessionTimeout: toNumber(process.env.KAFKA_CONSUMER_SESSION_TIMEOUT, 30000),
            heartbeatInterval: toNumber(process.env.KAFKA_CONSUMER_HEARTBEAT_INTERVAL, 3000),
            autoCommit: toBoolean(process.env.KAFKA_CONSUMER_AUTO_COMMIT, true),
            autoCommitInterval: toNumber(process.env.KAFKA_CONSUMER_AUTO_COMMIT_INTERVAL, 5000),
            maxBatchSize: toNumber(process.env.KAFKA_CONSUMER_MAX_BATCH_SIZE, 100),
        },
        topics: {
            partitions: toNumber(process.env.KAFKA_TOPIC_PARTITIONS, 3),
            replicationFactor: toNumber(process.env.KAFKA_TOPIC_REPLICATION_FACTOR, 1),
            prefix: process.env.KAFKA_TOPIC_PREFIX || 'connection-service',
        },
        dlq: {
            enabled: toBoolean(process.env.KAFKA_DLQ_ENABLED, true),
            topic: process.env.KAFKA_DLQ_TOPIC || 'connection-service.dlq',
            maxRetries: toNumber(process.env.KAFKA_DLQ_MAX_RETRIES, 3),
        },
        healthCheck: {
            interval: toNumber(process.env.KAFKA_HEALTH_CHECK_INTERVAL, 60000),
            timeout: toNumber(process.env.KAFKA_HEALTH_CHECK_TIMEOUT, 5000),
        },
    },

    getDatabaseConfig: () => ({
        mongodb: {
            uri: environmentConfig.MONGODB_URI,
            dbName: environmentConfig.MONGODB_DBNAME,
            maxPoolSize: environmentConfig.MONGODB_MAX_POOL_SIZE,
            minPoolSize: environmentConfig.MONGODB_MIN_POOL_SIZE,
            connectTimeoutMS: environmentConfig.MONGODB_CONNECT_TIMEOUT_MS,
            serverSelectionTimeoutMS: environmentConfig.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
        },
        redis: {
            host: environmentConfig.REDIS_HOST,
            port: environmentConfig.REDIS_PORT,
            password: environmentConfig.REDIS_PASSWORD,
            db: environmentConfig.REDIS_DB,
            clusterMode: environmentConfig.REDIS_CLUSTER_MODE,
            clusterNodes: environmentConfig.REDIS_CLUSTER_NODES,
            maxRetries: environmentConfig.REDIS_MAX_RETRIES,
            retryDelayOnFailover: environmentConfig.REDIS_RETRY_DELAY_ON_FAILOVER,
            ttlSeconds: environmentConfig.REDIS_TTL_SECONDS,
        },
        neo4j: {
            uri: environmentConfig.NEO4J_URI,
            username: environmentConfig.NEO4J_USERNAME,
            password: environmentConfig.NEO4J_PASSWORD,
            encrypted: environmentConfig.NEO4J_ENCRYPTED,
            maxConnectionPoolSize: environmentConfig.NEO4J_MAX_CONNECTION_POOL_SIZE,
            connectTimeout: environmentConfig.NEO4J_CONNECT_TIMEOUT,
            maxConnectionLifetime: environmentConfig.NEO4J_MAX_CONNECTION_LIFETIME,
            connectionAcquisitionTimeout: environmentConfig.NEO4J_CONNECTION_ACQUISITION_TIMEOUT,
            loggingLevel: environmentConfig.NEO4J_LOGGING_LEVEL,
        },
    }),

    createRateLimiter: () =>
        rateLimit({
            windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS,
            max: environmentConfig.RATE_LIMIT_MAX_REQUESTS,
            handler: (_req: Request, res: Response) => {
                res.status(429).json(
                    new ErrorResponse('Too many requests', 429, ERROR_CODES.RATE_LIMIT_EXCEEDED)
                );
            },
            standardHeaders: true,
            legacyHeaders: false,
        }),
};

// Production validation
if (environmentConfig.NODE_ENV === 'production' && process.env.SKIP_ENV_VALIDATION !== 'true') {
    const criticalVars = [
        { name: 'MONGODB_URI', value: environmentConfig.MONGODB_URI },
        // { name: 'MONGODB_DBNAME', value: environmentConfig.MONGODB_DBNAME },
        // { name: 'REDIS_HOST', value: environmentConfig.REDIS_HOST },
        // { name: 'NEO4J_URI', value: environmentConfig.NEO4J_URI },
        // { name: 'NEO4J_USERNAME', value: environmentConfig.NEO4J_USERNAME },
        // { name: 'NEO4J_PASSWORD', value: environmentConfig.NEO4J_PASSWORD },
        // { name: 'INTERNAL_API_KEY', value: environmentConfig.INTERNAL_API_KEY },
        { name: 'JWT_SECRET', value: environmentConfig.JWT_SECRET },
        // { name: 'ENCRYPTION_KEY', value: environmentConfig.ENCRYPTION_KEY },
    ];

    criticalVars.forEach(({ name, value }) => {
        if (!value || value.includes('your-') || value === 'password') {
            throw new Error(`Critical environment variable ${name} is missing or invalid in production`);
        }
    });

    // Kafka production validation
    // if (environmentConfig.KAFKA.enabled) {
    //     if (!environmentConfig.KAFKA.brokers || environmentConfig.KAFKA.brokers === 'localhost:9092') {
    //         console.warn('⚠️  Warning: Using localhost Kafka broker in production');
    //     }
    // }
}

export default environmentConfig;