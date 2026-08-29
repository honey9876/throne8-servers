/**
 * logger.config.ts
 * Winston Logger Configuration
 * Production-grade logging with file rotation and formatting
 * 
 * @version 3.1.0 - Added transport error listeners to prevent process crash
 * on file-stream I/O errors (e.g. Windows bind-mount EIO issues).
 */

import winston from 'winston';
import path from 'path';
import * as fs from 'fs';

// ==================== CONFIGURATION ====================

const logLevel: string = process.env['LOG_LEVEL'] || 'info';
const logFileEnabled: boolean = process.env['LOG_FILE_ENABLED'] === 'true';
const logDir: string = process.env['LOG_DIR'] || path.join(__dirname, '../../../logs');
const environment: string = process.env['NODE_ENV'] || 'development';

// ==================== ENSURE LOG DIRECTORY EXISTS ====================

if (logFileEnabled && !fs.existsSync(logDir)) {
    try {
        fs.mkdirSync(logDir, { recursive: true });
        console.log(`✅ Log directory created: ${logDir}`);
    } catch (error: any) {
        console.error(`❌ Failed to create log directory: ${logDir}`, error);
    }
}

// ==================== LOG FORMATS ====================

const developmentFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
            log += `\n${JSON.stringify(metadata, null, 2)}`;
        }
        return log;
    })
);

const productionFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
            log += ` | ${JSON.stringify(metadata)}`;
        }
        return log;
    })
);

// ==================== HELPER: SAFE TRANSPORT WRAPPER ====================
/**
 * Attaches a non-fatal error listener to a transport.
 * Without this, a raw stream 'error' event (e.g. EIO on a Windows
 * bind-mounted volume) has no listener and crashes the whole process
 * with "Unhandled 'error' event".
 */
function withErrorGuard<T extends winston.transport>(transport: T, label: string): T {
    transport.on('error', (err: Error) => {
        // eslint-disable-next-line no-console
        console.error(`⚠️ [Logger] Transport error ignored (${label}):`, err.message);
    });
    return transport;
}

// ==================== TRANSPORTS ====================

const transports: winston.transport[] = [
    withErrorGuard(
        new winston.transports.Console({
            format: environment === 'production' ? productionFormat : developmentFormat,
        }),
        'console'
    ),
];

if (logFileEnabled) {
    transports.push(
        withErrorGuard(
            new winston.transports.File({
                filename: path.join(logDir, 'app.log'),
                maxsize: 10 * 1024 * 1024, // 10MB
                maxFiles: 3,
                format: fileFormat,
            }),
            'app.log'
        )
    );

    transports.push(
        withErrorGuard(
            new winston.transports.File({
                filename: path.join(logDir, 'error.log'),
                level: 'error',
                maxsize: 10 * 1024 * 1024, // 10MB
                maxFiles: 5,
                format: fileFormat,
            }),
            'error.log'
        )
    );

    transports.push(
        withErrorGuard(
            new winston.transports.File({
                filename: path.join(logDir, 'warn.log'),
                level: 'warn',
                maxsize: 5 * 1024 * 1024, // 5MB
                maxFiles: 3,
                format: fileFormat,
            }),
            'warn.log'
        )
    );
}

// ==================== EXCEPTION / REJECTION HANDLERS ====================

const exceptionHandlers: winston.transport[] = logFileEnabled
    ? [
        withErrorGuard(
            new winston.transports.File({
                filename: path.join(logDir, 'exceptions.log'),
                maxsize: 5 * 1024 * 1024,
                maxFiles: 3,
            }),
            'exceptions.log'
        ),
    ]
    : [];

const rejectionHandlers: winston.transport[] = logFileEnabled
    ? [
        withErrorGuard(
            new winston.transports.File({
                filename: path.join(logDir, 'rejections.log'),
                maxsize: 5 * 1024 * 1024,
                maxFiles: 3,
            }),
            'rejections.log'
        ),
    ]
    : [];

// ==================== LOGGER INSTANCE ====================

const logger: winston.Logger = winston.createLogger({
    level: logLevel,
    transports,
    exceptionHandlers,
    rejectionHandlers,
    exitOnError: false,
});

// ==================== LOG LEVEL HELPERS ====================

export const LogLevels = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    HTTP: 'http',
    VERBOSE: 'verbose',
    DEBUG: 'debug',
    SILLY: 'silly',
} as const;

// ==================== LOGGER INFO ====================

logger.info('✅ Logger initialized', {
    level: logLevel,
    fileLogging: logFileEnabled,
    logDirectory: logFileEnabled ? logDir : 'N/A',
    environment,
});

// ==================== EXPORTS ====================

export default logger;

export {
    logLevel,
    logFileEnabled,
    logDir,
};