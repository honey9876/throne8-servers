/**
 * kafka.config.ts
 * Kafka Configuration for Auth Service
 * Production-grade settings with security and monitoring
 * 
 * @version 3.0.0
 */

import { KafkaConfig, logLevel } from 'kafkajs';
import * as fs from 'fs';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== ENVIRONMENT VARIABLES ====================

const KAFKA_BROKERS = (process.env['KAFKA_BROKERS'] || 'localhost:9092').split(',');
const KAFKA_CLIENT_ID = process.env['KAFKA_CLIENT_ID'] || 'auth-service-producer';
const KAFKA_SSL_ENABLED = process.env['KAFKA_SSL_ENABLED'] === 'true';
const KAFKA_SASL_ENABLED = process.env['KAFKA_SASL_ENABLED'] === 'true';
const KAFKA_SASL_MECHANISM = process.env['KAFKA_SASL_MECHANISM'] || 'plain';
const KAFKA_SASL_USERNAME = process.env['KAFKA_SASL_USERNAME'] || '';
const KAFKA_SASL_PASSWORD = process.env['KAFKA_SASL_PASSWORD'] || '';
const KAFKA_CONNECTION_TIMEOUT = Number(process.env['KAFKA_CONNECTION_TIMEOUT']) || 30000;
const KAFKA_REQUEST_TIMEOUT = Number(process.env['KAFKA_REQUEST_TIMEOUT']) || 30000;

// ==================== SSL CONFIGURATION ====================

interface SSLConfig {
    rejectUnauthorized: boolean;
    ca?: Buffer[];
    cert?: Buffer;
    key?: Buffer;
}

/**
 * Load SSL certificates if enabled
 */
function loadSSLConfig(): SSLConfig | undefined {
    if (!KAFKA_SSL_ENABLED) {
        return undefined;
    }

    try {
        const sslConfig: SSLConfig = {
            rejectUnauthorized: process.env['NODE_ENV'] === 'production',
        };

        // Load CA certificate
        const caPath = process.env['KAFKA_SSL_CA_PATH'];
        if (caPath && fs.existsSync(caPath)) {
            sslConfig.ca = [fs.readFileSync(caPath)];
        }

        // Load client certificate
        const certPath = process.env['KAFKA_SSL_CERT_PATH'];
        if (certPath && fs.existsSync(certPath)) {
            sslConfig.cert = fs.readFileSync(certPath);
        }

        // Load client key
        const keyPath = process.env['KAFKA_SSL_KEY_PATH'];
        if (keyPath && fs.existsSync(keyPath)) {
            sslConfig.key = fs.readFileSync(keyPath);
        }

        LoggerUtil.info('✅ Kafka SSL configuration loaded');
        return sslConfig;
    } catch(error : any) {
        LoggerUtil.error('❌ Failed to load Kafka SSL configuration', {
            error: (error as Error).message,
        });
        throw error;
    }
}

// ==================== SASL CONFIGURATION ====================

/**
 * Get SASL configuration if enabled
 */
function getSASLConfig() {
    if (!KAFKA_SASL_ENABLED) {
        return undefined;
    }

    const mechanism = KAFKA_SASL_MECHANISM.toLowerCase();

    if (mechanism === 'plain') {
        return {
            mechanism: 'plain' as const,
            username: KAFKA_SASL_USERNAME,
            password: KAFKA_SASL_PASSWORD,
        };
    }

    if (mechanism === 'scram-sha-256') {
        return {
            mechanism: 'scram-sha-256' as const,
            username: KAFKA_SASL_USERNAME,
            password: KAFKA_SASL_PASSWORD,
        };
    }

    if (mechanism === 'scram-sha-512') {
        return {
            mechanism: 'scram-sha-512' as const,
            username: KAFKA_SASL_USERNAME,
            password: KAFKA_SASL_PASSWORD,
        };
    }

    LoggerUtil.warn('⚠️ Unknown SASL mechanism, falling back to PLAIN', {
        mechanism: KAFKA_SASL_MECHANISM,
    });

    return {
        mechanism: 'plain' as const,
        username: KAFKA_SASL_USERNAME,
        password: KAFKA_SASL_PASSWORD,
    };
}

// ==================== LOGGING CONFIGURATION ====================

/**
 * Custom Kafka logger that integrates with LoggerUtil
 */
const kafkaLogger = (_level: logLevel) => {
    return ({ namespace, level: logLevel, label, log }: any) => {
        const { message, ...extra } = log;

        const logData = {
            namespace,
            label,
            ...extra,
        };

        switch (logLevel) {
            case logLevel.ERROR:
            case logLevel.NOTHING:
                LoggerUtil.error(`[Kafka] ${message}`, logData);
                break;
            case logLevel.WARN:
                LoggerUtil.warn(`[Kafka] ${message}`, logData);
                break;
            case logLevel.INFO:
                LoggerUtil.info(`[Kafka] ${message}`, logData);
                break;
            case logLevel.DEBUG:
                LoggerUtil.debug(`[Kafka] ${message}`, logData);
                break;
            default:
                LoggerUtil.debug(`[Kafka] ${message}`, logData);
        }
    };
};

// ==================== RETRY CONFIGURATION ====================

const retryConfig = {
    initialRetryTime: 300, // Start with 300ms
    retries: 8, // Max 8 retry attempts
    maxRetryTime: 30000, // Max 30 seconds between retries
    multiplier: 2, // Exponential backoff
    factor: 0.2, // Add jitter to prevent thundering herd
};

// ==================== MAIN KAFKA CONFIGURATION ====================

const kafkaConfig: KafkaConfig = {
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKERS,

    // Connection settings
    connectionTimeout: KAFKA_CONNECTION_TIMEOUT,
    requestTimeout: KAFKA_REQUEST_TIMEOUT,
    enforceRequestTimeout: true,

    // Retry configuration
    retry: retryConfig,

    // Security
    ssl: loadSSLConfig(),
    sasl: getSASLConfig(),

    // Logging
    logLevel: process.env['NODE_ENV'] === 'production' ? logLevel.INFO : logLevel.DEBUG,
    logCreator: kafkaLogger,
};

// ==================== VALIDATION ====================

/**
 * Validate Kafka configuration
 */
function validateKafkaConfig(): void {
    const errors: string[] = [];

    if (!KAFKA_BROKERS || KAFKA_BROKERS.length === 0) {
        errors.push('KAFKA_BROKERS is required');
    }

    if (KAFKA_SASL_ENABLED) {
        if (!KAFKA_SASL_USERNAME) {
            errors.push('KAFKA_SASL_USERNAME is required when SASL is enabled');
        }
        if (!KAFKA_SASL_PASSWORD) {
            errors.push('KAFKA_SASL_PASSWORD is required when SASL is enabled');
        }
    }

    if (errors.length > 0) {
        LoggerUtil.error('❌ Invalid Kafka configuration', { errors });
        throw new Error(`Kafka configuration validation failed: ${errors.join(', ')}`);
    }

    LoggerUtil.info('✅ Kafka configuration validated', {
        brokers: KAFKA_BROKERS.length,
        clientId: KAFKA_CLIENT_ID,
        sslEnabled: KAFKA_SSL_ENABLED,
        saslEnabled: KAFKA_SASL_ENABLED,
    });
}

// Validate on load
if (process.env['KAFKA_ENABLED'] === 'true') {
    validateKafkaConfig();
}

// ==================== EXPORTS ====================

export default kafkaConfig;

export {
    KAFKA_BROKERS,
    KAFKA_CLIENT_ID,
    KAFKA_SSL_ENABLED,
    KAFKA_SASL_ENABLED,
    retryConfig,
    kafkaLogger,
};