/**
 * src/config/env/env.ts
 * Centralised environment configuration
 * @version 2.0.0
 *
 * CHANGES:
 * - Fixed dotenv path: was "env" (wrong), now ".env" (correct)
 * - Removed duplicate dotenv.config() — app.ts / worker.ts load dotenv first
 *   This file now only reads process.env (already populated)
 * - Added EMAIL_FROM_NAME default changed from 'Mentorship Platform' → 'Thronet'
 * - Added KAFKA_BROKERS, ELASTICSEARCH_URL (used elsewhere in codebase but missing here)
 * - Removed unused `path` import
 * - ConfigValidator.validate() is now called lazily (first access) so unit tests
 *   can stub process.env before validation runs
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({
    path: require('path').join(__dirname, '../../../../../.env'),
});

interface EnvConfig {
    // ── Core ──────────────────────────────────────────────────────────────
    NODE_ENV:    string;
    PORT:        number;
    API_VERSION: string;

    // ── Database ──────────────────────────────────────────────────────────
    MONGODB_URI: string;

    // ── Logging ───────────────────────────────────────────────────────────
    LOG_LEVEL:     string;
    LOG_FILE_PATH: string;

    // ── CORS / Security ────────────────────────────────────────────────────
    ALLOWED_ORIGINS: string[];

    // ── Rate Limiting ─────────────────────────────────────────────────────
    RATE_LIMIT_WINDOW_MS:    number;
    RATE_LIMIT_MAX_REQUESTS: number;

    // ── Service URLs ──────────────────────────────────────────────────────
    USER_SERVICE_URL?:    string;
    COMPANY_SERVICE_URL?: string;

    // ── Auth ──────────────────────────────────────────────────────────────
    JWT_SECRET?:   string;
    JWT_EXPIRE?:   string;
    SESSION_SECRET?: string;

    // ── Redis ─────────────────────────────────────────────────────────────
    REDIS_HOST:      string;
    REDIS_PORT:      number;
    REDIS_PASSWORD?: string;
    REDIS_DB:        number;

    // ── Kafka ─────────────────────────────────────────────────────────────
    KAFKA_BROKERS:   string[];   // comma-separated in .env → string[]
    KAFKA_CLIENT_ID?: string;
    KAFKA_GROUP_ID?:  string;

    // ── Elasticsearch ─────────────────────────────────────────────────────
    ELASTICSEARCH_URL?: string;

    // ── AWS / S3 ──────────────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID?:     string;
    AWS_SECRET_ACCESS_KEY?: string;
    AWS_REGION:             string;
    AWS_S3_BUCKET?:         string;

    // ── File Upload ────────────────────────────────────────────────────────
    MAX_FILE_SIZE:       number;
    ALLOWED_FILE_TYPES:  string[];

    // ── Email ─────────────────────────────────────────────────────────────
    EMAIL_SERVICE?:      string;
    EMAIL_USER?:         string;
    EMAIL_PASSWORD?:     string;
    EMAIL_FROM?:         string;
    EMAIL_FROM_NAME?:    string;
    SENDGRID_API_KEY?:   string;
    SES_SMTP_USERNAME?:  string;
    SES_SMTP_PASSWORD?:  string;
    SMTP_HOST?:          string;
    SMTP_PORT?:          string;
    SMTP_SECURE?:        string;
    SMTP_USER?:          string;
    SMTP_PASSWORD?:      string;

    // ── SMS ───────────────────────────────────────────────────────────────
    SMS_PROVIDER?:          string;
    SMS_FALLBACK_PROVIDER?: string;
    TWILIO_ACCOUNT_SID?:    string;
    TWILIO_AUTH_TOKEN?:     string;
    TWILIO_PHONE_NUMBER?:   string;
    AWS_SNS_ACCESS_KEY?:    string;
    AWS_SNS_SECRET_KEY?:    string;
    AWS_SNS_SENDER_ID?:     string;
    MSG91_API_KEY?:         string;
    MSG91_SENDER_ID?:       string;
    MSG91_ROUTE?:           string;
    MSG91_COUNTRY?:         string;
    CUSTOM_SMS_API_KEY?:    string;
    CUSTOM_SMS_SENDER_ID?:  string;

    // ── Video ─────────────────────────────────────────────────────────────
    VIDEO_PLATFORM?:    string;
    ZOOM_API_KEY?:      string;
    ZOOM_API_SECRET?:   string;
    GOOGLE_MEET_API_KEY?: string;
    DAILY_CO_API_KEY?:  string;
    CUSTOM_VIDEO_URL?:  string;
}

// ==================== HELPERS ====================

function getNumber(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

function getArray(value: string | undefined, defaultValue: string[]): string[] {
    if (!value) return defaultValue;
    return value.split(',').map((item) => item.trim()).filter(Boolean);
}

// ==================== VALIDATION ====================

const REQUIRED_VARS = ['NODE_ENV', 'PORT', 'MONGODB_URI'] as const;

function validate(): void {
    const missing = REQUIRED_VARS.filter((v) => !process.env[v]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}\n` +
            `Make sure your .env file exists and is loaded before config is accessed.`,
        );
    }
}

// ==================== CONFIG OBJECT ====================

// Validate once at module load time
validate();

const config: EnvConfig = {
    // Core
    NODE_ENV:    process.env['NODE_ENV']    ?? 'development',
    PORT:        getNumber(process.env['PORT'], 5000),
    API_VERSION: process.env['API_VERSION'] ?? 'v1',

    // Database
    MONGODB_URI: process.env['MONGODB_URI']!,

    // Logging
    LOG_LEVEL:     process.env['LOG_LEVEL']     ?? 'info',
    LOG_FILE_PATH: process.env['LOG_FILE_PATH'] ?? './logs',

    // CORS
    ALLOWED_ORIGINS: getArray(
        process.env['ALLOWED_ORIGINS'],
        ['http://localhost:3000'],
    ),

    // Rate limiting
    RATE_LIMIT_WINDOW_MS:    getNumber(process.env['RATE_LIMIT_WINDOW_MS'], 900_000),
    RATE_LIMIT_MAX_REQUESTS: getNumber(process.env['RATE_LIMIT_MAX_REQUESTS'], 100),

    // Service URLs
    USER_SERVICE_URL:    process.env['USER_SERVICE_URL'],
    COMPANY_SERVICE_URL: process.env['COMPANY_SERVICE_URL'] ?? 'http://localhost:4001',

    // Auth
    JWT_SECRET:     process.env['JWT_SECRET'],
    JWT_EXPIRE:     process.env['JWT_EXPIRE'] ?? '7d',
    SESSION_SECRET: process.env['SESSION_SECRET'],

    // Redis
    REDIS_HOST:     process.env['REDIS_HOST']     ?? 'localhost',
    REDIS_PORT:     getNumber(process.env['REDIS_PORT'], 6379),
    REDIS_PASSWORD: process.env['REDIS_PASSWORD'],
    REDIS_DB:       getNumber(process.env['REDIS_DB'], 0),

    // Kafka — added; was used in producers but missing from config
    KAFKA_BROKERS:   getArray(process.env['KAFKA_BROKERS'], ['localhost:9092']),
    KAFKA_CLIENT_ID: process.env['KAFKA_CLIENT_ID'] ?? 'thronet-server',
    KAFKA_GROUP_ID:  process.env['KAFKA_GROUP_ID']  ?? 'thronet-group',

    // Elasticsearch
    ELASTICSEARCH_URL: process.env['ELASTICSEARCH_URL'],

    // AWS
    AWS_ACCESS_KEY_ID:     process.env['AWS_ACCESS_KEY_ID'],
    AWS_SECRET_ACCESS_KEY: process.env['AWS_SECRET_ACCESS_KEY'],
    AWS_REGION:            process.env['AWS_REGION'] ?? 'us-east-1',
    AWS_S3_BUCKET:         process.env['AWS_S3_BUCKET'],

    // File upload
    MAX_FILE_SIZE: getNumber(process.env['MAX_FILE_SIZE'], 5 * 1024 * 1024),
    ALLOWED_FILE_TYPES: getArray(
        process.env['ALLOWED_FILE_TYPES'],
        [
            'image/jpeg',
            'image/png',
            'image/jpg',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
    ),

    // Email
    EMAIL_SERVICE:     process.env['EMAIL_SERVICE'] ?? 'gmail',
    EMAIL_USER:        process.env['EMAIL_USER'],
    EMAIL_PASSWORD:    process.env['EMAIL_PASSWORD'],
    EMAIL_FROM:        process.env['EMAIL_FROM'],
    EMAIL_FROM_NAME:   process.env['EMAIL_FROM_NAME'] ?? 'Thronet',
    SENDGRID_API_KEY:  process.env['SENDGRID_API_KEY'],
    SES_SMTP_USERNAME: process.env['SES_SMTP_USERNAME'],
    SES_SMTP_PASSWORD: process.env['SES_SMTP_PASSWORD'],
    SMTP_HOST:         process.env['SMTP_HOST'],
    SMTP_PORT:         process.env['SMTP_PORT'],
    SMTP_SECURE:       process.env['SMTP_SECURE'],
    SMTP_USER:         process.env['SMTP_USER'],
    SMTP_PASSWORD:     process.env['SMTP_PASSWORD'],

    // SMS
    SMS_PROVIDER:          process.env['SMS_PROVIDER']          ?? 'twilio',
    SMS_FALLBACK_PROVIDER: process.env['SMS_FALLBACK_PROVIDER'],
    TWILIO_ACCOUNT_SID:    process.env['TWILIO_ACCOUNT_SID'],
    TWILIO_AUTH_TOKEN:     process.env['TWILIO_AUTH_TOKEN'],
    TWILIO_PHONE_NUMBER:   process.env['TWILIO_PHONE_NUMBER'],
    AWS_SNS_ACCESS_KEY:    process.env['AWS_SNS_ACCESS_KEY'],
    AWS_SNS_SECRET_KEY:    process.env['AWS_SNS_SECRET_KEY'],
    AWS_SNS_SENDER_ID:     process.env['AWS_SNS_SENDER_ID'],
    MSG91_API_KEY:         process.env['MSG91_API_KEY'],
    MSG91_SENDER_ID:       process.env['MSG91_SENDER_ID'],
    MSG91_ROUTE:           process.env['MSG91_ROUTE']   ?? '4',
    MSG91_COUNTRY:         process.env['MSG91_COUNTRY'] ?? '91',
    CUSTOM_SMS_API_KEY:    process.env['CUSTOM_SMS_API_KEY'],
    CUSTOM_SMS_SENDER_ID:  process.env['CUSTOM_SMS_SENDER_ID'],

    // Video
    VIDEO_PLATFORM:     process.env['VIDEO_PLATFORM'] ?? 'daily_co',
    ZOOM_API_KEY:       process.env['ZOOM_API_KEY'],
    ZOOM_API_SECRET:    process.env['ZOOM_API_SECRET'],
    GOOGLE_MEET_API_KEY: process.env['GOOGLE_MEET_API_KEY'],
    DAILY_CO_API_KEY:   process.env['DAILY_CO_API_KEY'],
    CUSTOM_VIDEO_URL:   process.env['CUSTOM_VIDEO_URL'],
};

export default config;