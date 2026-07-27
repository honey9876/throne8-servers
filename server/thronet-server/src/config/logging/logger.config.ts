/**
 * logger.config.ts
 * Winston Logger Configuration
 * Production-grade logging with file rotation and formatting
 * 
 * @version 3.0.0
 */

import winston from 'winston';
import path from 'path';
import * as fs from 'fs';

// ==================== DIRECTORY SETUP ====================


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
    } catch(error : any) {
        console.error(`❌ Failed to create log directory: ${logDir}`, error);
    }
}

// ==================== LOG FORMATS ====================

/**
 * Development format - Colorized and human-readable
 */
const developmentFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        let log = `${timestamp} [${level}]: ${message}`;

        // Add metadata if present
        if (Object.keys(metadata).length > 0) {
            log += `\n${JSON.stringify(metadata, null, 2)}`;
        }

        return log;
    })
);

/**
 * Production format - JSON structured logging
 */
const productionFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // Include stack traces
    winston.format.json()
);

/**
 * File format - No colors, structured
 */
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

        // Add metadata if present
        if (Object.keys(metadata).length > 0) {
            log += ` | ${JSON.stringify(metadata)}`;
        }

        return log;
    })
);

// ==================== TRANSPORTS ====================

const transports: winston.transport[] = [
    // Console transport
    new winston.transports.Console({
        format: environment === 'production' ? productionFormat : developmentFormat,
    }),
];

// File transports (if enabled)
if (logFileEnabled) {
    // Combined logs (all levels)
    transports.push(
        new winston.transports.File({
            filename: path.join(logDir, 'app.log'),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 3,
            format: fileFormat,
        })
    );

    // Error logs (error level only)
    transports.push(
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            format: fileFormat,
        })
    );

    // Warn logs (warn level and above)
    transports.push(
        new winston.transports.File({
            filename: path.join(logDir, 'warn.log'),
            level: 'warn',
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 3,
            format: fileFormat,
        })
    );
}

// ==================== LOGGER INSTANCE ====================

const logger: winston.Logger = winston.createLogger({
    level: logLevel,
    transports,

    // Handle exceptions and rejections
    exceptionHandlers: logFileEnabled
        ? [
            new winston.transports.File({
                filename: path.join(logDir, 'exceptions.log'),
                maxsize: 5 * 1024 * 1024,
                maxFiles: 3,
            }),
        ]
        : [],

    rejectionHandlers: logFileEnabled
        ? [
            new winston.transports.File({
                filename: path.join(logDir, 'rejections.log'),
                maxsize: 5 * 1024 * 1024,
                maxFiles: 3,
            }),
        ]
        : [],

    // Exit on error
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