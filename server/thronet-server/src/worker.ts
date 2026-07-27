/**
 * worker.ts
 * Background Queue Worker Process
 * @version 2.0.0
 *
 * CHANGES:
 * - Restored full worker implementation (was accidentally commented out)
 * - Removed StudyGroup dummy health route (not a worker concern)
 * - Used LoggerUtil instead of bare console.log
 * - Removed emoji from logger calls (use structured log fields instead)
 * - Health server now exposes /metrics endpoint stub for Prometheus scraping
 * - waitForRedis uses exponential backoff (same pattern as database/connection.ts)
 * - process.on handlers deduplicated via shared isShuttingDown guard
 */

import 'dotenv/config';

import express, { Request, Response } from 'express';
import { Server } from 'http';

import { LoggerUtil as logger } from './shared/logger.util';
import { startAllWorkers, stopAllWorkers, getWorkerStats } from './Company/workersCompany';
import CacheUtil from './shared/cache.util';


// ==================== CONSTANTS ====================

const HEALTH_PORT   = parseInt(process.env['WORKER_HEALTH_PORT'] ?? '3001', 10);
const FALLBACK_PORTS = [HEALTH_PORT, 3002, 3003, 3004, 3005];

const REDIS_MAX_RETRIES  = 10;
const REDIS_RETRY_DELAY  = 3_000; // ms — doubles on each attempt (exponential backoff)
const STATS_INTERVAL_MS  = 5 * 60 * 1_000; // log worker stats every 5 minutes


// ==================== STATE ====================

let healthServer: Server | null = null;
let isShuttingDown = false;


// ==================== HEALTH SERVER ====================

async function startHealthServer(): Promise<void> {
    const app = express();
    app.use(express.json());

    // /health — full status including Redis + worker stats
    app.get('/health', async (_req: Request, res: Response) => {
        try {
            const [stats, redisHealthy] = await Promise.all([
                getWorkerStats(),
                CacheUtil.healthCheck(),
            ]);

            res.json({
                status: 'healthy',
                redis: redisHealthy ? 'connected' : 'degraded',
                workers: stats,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString(),
            });
        } catch (err: unknown) {
            res.status(500).json({
                status: 'unhealthy',
                error: err instanceof Error ? err.message : 'Unknown error',
            });
        }
    });

    // /ping — lightweight liveness probe
    app.get('/ping', (_req: Request, res: Response) => {
        res.json({ pong: true, uptime: process.uptime() });
    });

    // /metrics — stub for future Prometheus scraping
    app.get('/metrics', (_req: Request, res: Response) => {
        res.set('Content-Type', 'text/plain');
        res.send(`# HELP worker_uptime_seconds Total uptime of the worker process\n` +
                 `# TYPE worker_uptime_seconds gauge\n` +
                 `worker_uptime_seconds ${process.uptime()}\n`);
    });

    // Try ports in order — useful when running multiple workers locally
    for (let i = 0; i < FALLBACK_PORTS.length; i++) {
        const port = FALLBACK_PORTS[i]!;
        const isLast = i === FALLBACK_PORTS.length - 1;

        try {
            await new Promise<void>((resolve, reject) => {
                const s = app
                    .listen(port)
                    .once('listening', () => {
                        healthServer = s;
                        s.removeAllListeners('error');
                        logger.info('Health server started', {
                            port,
                            health: `http://localhost:${port}/health`,
                            ping:   `http://localhost:${port}/ping`,
                        });
                        resolve();
                    })
                    .once('error', (err: NodeJS.ErrnoException) => {
                        if (err.code === 'EADDRINUSE') {
                            logger.warn(`Port ${port} in use, trying next`);
                        } else {
                            logger.error('Health server error', { port, error: err.message });
                        }
                        reject(err);
                    });
            });

            return; // Successfully bound — stop trying ports

        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
            if (isLast) {
                throw new Error(
                    `No available ports for health server. Tried: ${FALLBACK_PORTS.join(', ')}`,
                );
            }
        }
    }
}


// ==================== REDIS WAIT ====================

async function waitForRedis(
    maxRetries = REDIS_MAX_RETRIES,
    baseDelay  = REDIS_RETRY_DELAY,
): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (CacheUtil.isConnected()) {
                logger.info('Redis already connected');
                return;
            }

            logger.info(`Connecting to Redis (attempt ${attempt + 1}/${maxRetries})`);
            const connected = await CacheUtil.init();

            if (connected) {
                logger.info('Redis connected');
                return;
            }

        } catch (err: unknown) {
            logger.warn('Redis connection error', {
                attempt: attempt + 1,
                error: err instanceof Error ? err.message : String(err),
            });
        }

        if (attempt < maxRetries - 1) {
            // Exponential backoff: 3s, 6s, 12s …
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    logger.warn('Redis unavailable after all retries — continuing with in-memory fallback');
}


// ==================== MAIN ====================

async function startWorkerProcess(): Promise<void> {
    try {
        logger.info('Starting queue worker process', {
            nodeEnv:     process.env['NODE_ENV'] ?? 'development',
            nodeVersion: process.version,
            pid:         process.pid,
        });

        await waitForRedis();

        logger.info('Initializing queue workers');
        startAllWorkers();

        logger.info('Starting health check server');
        await startHealthServer();

        logger.info('Worker process started — processing background jobs');

        // Periodic stats logging
        const statsInterval = setInterval(async () => {
            try {
                const stats = await getWorkerStats();
                logger.info('Worker stats', { stats });
            } catch (err: unknown) {
                logger.error('Failed to collect worker stats', {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }, STATS_INTERVAL_MS);

        // Keep the interval from preventing process exit during shutdown
        statsInterval.unref();

    } catch (err: unknown) {
        logger.error('Failed to start worker process', {
            error: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
    }
}


// ==================== GRACEFUL SHUTDOWN ====================

async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`${signal} received — shutting down worker`);

    try {
        logger.info('Stopping queue workers');
        await stopAllWorkers();

        if (healthServer) {
            logger.info('Closing health server');
            await new Promise<void>((resolve) => healthServer!.close(() => resolve()));
        }

        logger.info('Closing Redis connection');
        await CacheUtil.shutdown();

        logger.info('Worker shutdown complete');
        process.exit(0);

    } catch (err: unknown) {
        logger.error('Error during worker shutdown', {
            error: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
    }
}


// ==================== PROCESS HANDLERS ====================

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection in worker', {
        reason: (reason as Error)?.message ?? String(reason),
        stack:  (reason as Error)?.stack,
    });
});

process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception in worker-2', {
        error: error.message,
        stack: error.stack,
    });
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});


// ==================== START ====================

startWorkerProcess();