/**
 * server.ts
 * thronet-server/server.ts
 * Main Entry Point — HTTP server bootstrap
 * ./version 4.0.0
 */

import dotenv from 'dotenv';
dotenv.config();

import https from 'https';
import http from 'http';

// Override default globalAgent timeouts to prevent Node.js v24 5-second connection timeout on slow network/handshake connections
if ((https.globalAgent as any).options) {
    (https.globalAgent as any).options.timeout = 120000;
}
if ((http.globalAgent as any).options) {
    (http.globalAgent as any).options.timeout = 120000;
}

import { Server } from 'http';
import mongoose from 'mongoose';

// App
import { app, NotificationService } from './src/app';

// Database
import MongoConnection from './src/database/sharding/connection';
import { createAllIndexes } from './src/database/in/createIndexes';
import { enableUserSharding } from './src/database/sharding/userSharding';
import { enableSessionSharding } from './src/database/sharding/sessionSharding';

// Utils
import CacheUtil from './src/shared/cache.util';
import { LoggerUtil } from './src/shared/logger.util';
import { initializeSocketIO } from './src/socket';

// Audit Logs
import AuditConsumer from './src/shared/kafka/producers/audit.consumer';

const logger = LoggerUtil;

interface AppLocals {
    server?: Server;
}

// ==================== INITIALIZE ====================

async function initializeApp(): Promise<void> {
    try {
        console.log('🚀🚀 Starting Throne8 Application...');
        logger.info('🚀 Starting application initialization', {
            nodeEnv: process.env['NODE_ENV'],
            nodeVersion: process.version,
        });

        // MongoDB
        logger.info('📦 Connecting to MongoDB...');
        await MongoConnection.connect();
        logger.info('📦 Connected to MongoDB');

        await enableUserSharding();
        await enableSessionSharding();
        logger.info('🔧 Creating indexes...');
        // await createAllIndexes();
        logger.info('✅ MongoDB setup complete');

        // Cache (non-blocking)
        logger.info('💾 Initializing cache...');
        CacheUtil.init().catch((err) => {
            logger.warn('⚠️ Cache initialization failed, using in-memory fallback', {
                error: err.message,
            });
        });

        // Notification Service
        logger.info('📧 Initializing notification service...');
        try {
            const notificationInitialized = await NotificationService.initialize();
            if (notificationInitialized) {
                logger.info('✅ Notification service initialized');
            } else {
                logger.warn('⚠️ Notification service initialization failed (non-critical)');
            }
        } catch (error) {
            logger.warn('⚠️ Notification service initialization failed (non-critical)', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }

        // HTTP Server
        const port: number = Number(process.env['PORT']) || 4000;
        const server = app.listen(port, () => {
            logger.info('🎉 Server started successfully', {
                port,
                environment: process.env['NODE_ENV'],
                version: process.env['APP_VERSION'] || '1.0.0',
            });

            try {
                initializeSocketIO(server);
                logger.info('✅ Socket.IO initialized');
            } catch (error: any) {
                logger.error('❌ Socket.IO initialization failed', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }

            AuditConsumer.startConsuming();
            logger.info('✅ Audit consumer started (Redis Streams)');
        });

        (app.locals as AppLocals)['server'] = server;
        logger.info('✅ Application initialization complete');

    } catch (error: any) {
        logger.error('❌ Application initialization failed', {
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
            logger.info('✅ HTTP server closed');
        }

        AuditConsumer.stopConsuming();
        logger.info('✅ Audit consumer stopped');

        await mongoose.connection.close();
        logger.info('✅ MongoDB disconnected');

        await CacheUtil.shutdown();
        logger.info('✅ Cache shutdown complete');

        logger.info('✅ Graceful shutdown complete');
        process.exit(0);
    } catch (error: any) {
        logger.error('❌ Error during graceful shutdown', {
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
    if (process.env['NODE_ENV'] === 'production') {
        gracefulShutdown('UNHANDLED_REJECTION');
    }
});

process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
    });
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// ==================== START ====================
console.log('🔍 STEP a: before initializeApp call');
initializeApp();