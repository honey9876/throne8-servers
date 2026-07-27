/**
 * /server/thronet-server/server.ts
 * server.ts
 * thronet-server/server.ts
 * Main Entry Point — HTTP server bootstrap
 * ./version 4.0.0
 */

import dotenv from 'dotenv';

if (process.env['NODE_ENV'] !== 'production') {
    dotenv.config();
}

import { Server } from 'http';
import mongoose from 'mongoose';

// App
import { app, NotificationService } from './src/app';

// Database
import MongoConnection from './src/database/sharding/connection';

// Utils
import CacheUtil from './src/shared/cache.util';
import { LoggerUtil } from './src/shared/logger.util';
import { initializeSocketIO } from './src/socket';

// Audit Logs
// NOTE: AuditConsumer temporarily disabled — not cluster-aware, causes
// repeated "MOVED <slot> <host>:<port>" errors when running against
// Redis Cluster (redis-node-1/2/3). Re-enable once it uses a cluster-aware
// client (e.g. node-redis createCluster / ioredis Cluster mode).
// import AuditConsumer from './src/shared/kafka/producers/audit.consumer';

const logger = LoggerUtil;

interface AppLocals {
    server?: Server;
}

// ==================== INITIALIZE ====================

async function initializeApp(): Promise<void> {
    try {
        logger.info('Starting application initialization', {
            nodeEnv: process.env['NODE_ENV'],
            nodeVersion: process.version,
        });

        // MongoDB
        await MongoConnection.connect();
        logger.info('MongoDB connected');

        // Cache (non-blocking)
        CacheUtil.init().catch((err) => {
            logger.warn('Cache initialization failed, using in-memory fallback', {
                error: err.message,
            });
        });

        // Notification Service
        try {
            const notificationInitialized = await NotificationService.initialize();
            if (notificationInitialized) {
                logger.info('Notification service initialized');
            } else {
                logger.warn('Notification service initialization failed (non-critical)');
            }
        } catch (error) {
            logger.warn('Notification service initialization failed (non-critical)', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }

        // HTTP Server
        const port: number = Number(process.env['PORT']) || 4000;
        const server = app.listen(port, () => {
            logger.info('Server started successfully', {
                port,
                environment: process.env['NODE_ENV'],
                version: process.env['APP_VERSION'] || '1.0.0',
            });

            try {
                initializeSocketIO(server);
                logger.info('Socket.IO initialized');
            } catch (error: any) {
                logger.error('Socket.IO initialization failed', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }

            // TODO: Re-enable once AuditConsumer is made cluster-aware
            // (MOVED errors on Redis Cluster mode).
            // AuditConsumer.startConsuming();
        });

        (app.locals as AppLocals)['server'] = server;
        logger.info('Application initialization complete');

    } catch (error: any) {
        logger.error('Application initialization failed', {
            error: (error as Error).message,
            stack: (error as Error).stack,
        });
        process.exit(1);
    }
}

// ==================== GRACEFUL SHUTDOWN ====================

async function gracefulShutdown(signal: string): Promise<void> {
    logger.info(`${signal} received, starting graceful shutdown...`);

    try {
        const locals = app.locals as AppLocals;
        if (locals['server']) {
            await new Promise<void>((resolve) => {
                locals['server']!.close(() => resolve());
            });
            logger.info('HTTP server closed');
        }

        // AuditConsumer.stopConsuming();

        await mongoose.connection.close();
        logger.info('MongoDB disconnected');

        try {
            await CacheUtil.shutdown();
            logger.info('Cache shutdown complete');
        } catch (err) {
            logger.warn('Cache shutdown failed');
        }

        logger.info('Graceful shutdown complete');
        process.exit(0);
    } catch (error: any) {
        logger.error('Error during graceful shutdown', {
            error: (error as Error).message,
            stack: (error as Error).stack,
        });
        process.exit(1);
    }
}

// ==================== PROCESS HANDLERS ====================

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    if ((reason as any)?.message?.includes('schemas/ids')) {
        logger.warn('Schema validation error ignored (OpenTelemetry)');
        return;
    }
    logger.error('Unhandled promise rejection', {
        reason: (reason as Error)?.message || reason,
        stack: (reason as Error)?.stack,
    });
});

process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception in server file', {
        error: error.message,
        stack: error.stack,
    });
    // Sirf critical errors pe shutdown karo
    const criticalErrors = ['EADDRINUSE', 'MODULE_NOT_FOUND'];
    if (criticalErrors.some(e => error.message.includes(e))) {
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    }
});

// ==================== START ====================
initializeApp();