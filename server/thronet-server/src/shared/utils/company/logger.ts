import winston from 'winston';
import path from 'path';
import fs from 'fs';
import 'dotenv/config'; // Load env variables directly

// Read directly from process.env to avoid circular dependencies
const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';

// Create logs directory if it doesn't exist
const logsPath = path.resolve(LOG_DIR);
if (!fs.existsSync(logsPath)) {
  fs.mkdirSync(logsPath, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${
      Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
    }`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.printf((info) => {
          const { timestamp, level, message } = info;
          return `${timestamp} [${level}]: ${message}`;
        })
      ),
    }),

    // File transport - all logs
    new winston.transports.File({
      filename: path.join(logsPath, 'app.log'),
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // File transport - errors only
    new winston.transports.File({
      filename: path.join(logsPath, 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 5242880,
      maxFiles: 5,
    }),

    // File transport - combined
    new winston.transports.File({
      filename: path.join(logsPath, 'combined.log'),
      format: logFormat,
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// Log initialization
logger.info('Logger initialized', { logDir: logsPath, logLevel: LOG_LEVEL });

export default logger;