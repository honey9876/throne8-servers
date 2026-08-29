/**
 * src/database/connection.ts
 * MongoDB connection with retry + health utilities
 * @version 2.1.0
 *
 * CHANGES:
 * - REMOVED duplicate SIGINT/SIGTERM handlers — app.ts owns process lifecycle.
 *   Having them here caused double-shutdown: app.ts calls gracefulShutdown()
 *   which calls mongoose.disconnect(), then this file's handler fires again.
 * - Auto-reconnect in production now uses exponential backoff (was fixed 5s)
 * - connectDB() no longer calls process.exit() in production on final failure —
 *   lets app.ts decide whether to exit (it does, in initializeApp catch block)
 * - getDatabaseStats() now returns raw numbers alongside formatted strings
 *   so callers can do math without parsing "X.XX MB" back to a number
 * - Removed emoji from log messages (structured log fields carry context)
 */

import mongoose from 'mongoose';
import { databaseConfig } from '@/config/env/database';
import { LoggerUtil as logger } from '@/shared/logger.util';

// ==================== STATE ====================
let isConnected         = false;
let connectionAttempts  = 0;
let listenersRegistered = false;

const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY   = 2_000; // ms

mongoose.set('debug', false); // Never enable in production — log spam

// ==================== HELPERS ====================

/** Exponential backoff: 2s, 4s, 8s, 16s, 32s */
function getRetryDelay(attempt: number): number {
    return BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
}

function maskUri(uri: string): string {
    return uri.replace(/mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/, 'mongodb$1://***:***@');
}

// ==================== CONNECT ====================

export async function connectDB(retryCount = 0): Promise<void> {
    if (isConnected && mongoose.connection.readyState === 1) {
        logger.info('Already connected to MongoDB');
        return;
    }

    connectionAttempts = retryCount + 1;

        // Register listeners exactly once for the lifetime of the process —
    // guarded by a flag, not retryCount, since scheduleReconnect() always
    // calls connectDB() with retryCount=0 again on every reconnect cycle.
    if (!listenersRegistered) {
        setupConnectionListeners();
        listenersRegistered = true;
    }
    logger.info('Connecting to MongoDB', {
        attempt:  connectionAttempts,
        maxAttempts: MAX_RETRY_ATTEMPTS,
        database: databaseConfig.mongodb.dbName,
    });

    try {
        await mongoose.connect(databaseConfig.mongodb.uri, {
            dbName:                   databaseConfig.mongodb.dbName,
            maxPoolSize:              databaseConfig.mongodb.options.maxPoolSize ?? 10,
            minPoolSize:              databaseConfig.mongodb.options.minPoolSize ?? 5,
            serverSelectionTimeoutMS: 5_000,
            socketTimeoutMS:          45_000,
            connectTimeoutMS:         10_000,
            retryWrites:              true,
            retryReads:               true,
            w:                        'majority',
            wtimeoutMS:               5_000,
            heartbeatFrequencyMS:     10_000,
            appName:                  'Thronet',
            compressors:              ['snappy', 'zlib'],
            // Only build indexes automatically outside production
            autoIndex:                process.env['NODE_ENV'] !== 'production',
        });

        isConnected      = true;
        connectionAttempts = 0;

        logger.info('Connected to MongoDB', {
            host:     mongoose.connection.host,
            database: databaseConfig.mongodb.dbName,
            pool:     `${databaseConfig.mongodb.options.minPoolSize ?? 5}–${databaseConfig.mongodb.options.maxPoolSize ?? 10}`,
        });

               // Sanitize existing company documents with incomplete/invalid GeoJSON Point coordinates
        try {
            if (mongoose.connection.db) {
                await mongoose.connection.db.collection('companies').updateMany(
                    {
                        $or: [
                            { 'headquarters.coordinates.coordinates': { $exists: false } },
                            { 'headquarters.coordinates.coordinates': null },
                            { 'headquarters.coordinates.coordinates': { $size: 0 } },
                        ],
                        'headquarters.coordinates': { $exists: true, $ne: null }
                    },
                    {
                        $unset: { 'headquarters.coordinates': '' }
                    }
                );
                logger.info('Sanitized existing company GeoJSON coordinates in MongoDB');
            }
        } catch (repairErr: any) {
            logger.warn('Company coordinates repair note:', { error: repairErr?.message });
        }

    } catch (error: unknown) {
        const err = error as Error;

        logger.error('MongoDB connection attempt failed', {
            attempt: connectionAttempts,
            error:   err.message,
        });

        if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
            const delay = getRetryDelay(retryCount + 1);

            logger.warn('Retrying MongoDB connection', {
                retryIn:    `${delay / 1_000}s`,
                nextAttempt: retryCount + 2,
                maxAttempts: MAX_RETRY_ATTEMPTS,
            });

            await new Promise((resolve) => setTimeout(resolve, delay));
            return connectDB(retryCount + 1);
        }

                // All retries exhausted
                logger.error('Failed to connect to MongoDB after all retries', {
                    attempts: MAX_RETRY_ATTEMPTS,
                    hints: [
                        'Verify MongoDB Atlas cluster is running',
                        'Check MONGODB_URI in .env',
                        'Ensure IP is whitelisted in Atlas',
                        'Confirm database user permissions',
                    ],
                });
        
                // In development: hard-exit immediately so the developer knows right away.
                // In production: let the caller decide whether to exit — but ALSO keep
                // trying in the background, in case the caller swallows this error
                // instead of exiting. Without this, a permanently failed first
                // connection means the app never tries again for its whole lifetime.
                if (process.env['NODE_ENV'] !== 'production') {
                    process.exit(1);
                }
        
                scheduleReconnect(0);
        
                throw err; // re-throw so the caller can still choose to exit
    }
}

// ==================== EVENT LISTENERS ====================

function setupConnectionListeners(): void {
    const conn = mongoose.connection;

    conn.on('connected',    () => { isConnected = true; });
    conn.on('reconnected',  () => { isConnected = true;  logger.info('Reconnected to MongoDB'); });
    conn.on('close',        () => { isConnected = false; logger.info('MongoDB connection closed'); });

    conn.on('error', (error: Error) => {
        isConnected = false;
        logger.error('MongoDB connection error', { error: error.message });
    });

    conn.on('disconnected', () => {
        isConnected = false;
        logger.warn('MongoDB disconnected');

        if (process.env['NODE_ENV'] === 'production') {
            // Exponential backoff reconnect — starts at 5s
            scheduleReconnect(0);
        }
    });
}

let reconnectAttempt = 0;
let reconnectScheduled = false;

function scheduleReconnect(attempt: number): void {
    // Prevent overlapping reconnect loops — mongoose can emit 'disconnected'
    // even during connectDB()'s own manual retry sequence, which would
    // otherwise trigger a second, parallel reconnect timer.
    if (reconnectScheduled) return;
    reconnectScheduled = true;

    const delay = Math.min(5_000 * Math.pow(2, attempt), 60_000); // cap at 60s

    logger.info('Scheduling MongoDB reconnect', { delay: `${delay / 1_000}s`, attempt });

    setTimeout(() => {
        reconnectScheduled = false;
        reconnectAttempt = attempt + 1;
        connectDB().catch((err: Error) => {
            logger.error('Auto-reconnect failed', { error: err.message });
            scheduleReconnect(reconnectAttempt);
        });
    }, delay);
}
// ==================== DISCONNECT ====================

export async function disconnectDB(): Promise<void> {
    if (!isConnected) return;

    try {
        await mongoose.disconnect();
        isConnected = false;
        logger.info('Disconnected from MongoDB');
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Error disconnecting from MongoDB', { error: err.message });
        throw err;
    }
}

// ==================== STATUS / HEALTH ====================

export function getConnectionStatus() {
    const readyState = mongoose.connection.readyState;

    const stateNames: Record<number, string> = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting',
    };

    return {
        isConnected:    isConnected && readyState === 1,
        readyState,
        readyStateName: stateNames[readyState] ?? 'unknown',
        dbName:         databaseConfig.mongodb.dbName,
        host:           mongoose.connection.host,
    };
}

export function getConnectionDetails() {
    return {
        status:           getConnectionStatus(),
        database:         databaseConfig.mongodb.dbName,
        host:             mongoose.connection.host ?? 'not connected',
        connectionString: maskUri(databaseConfig.mongodb.uri),
        pool: {
            min:     databaseConfig.mongodb.options.minPoolSize ?? 5,
            max:     databaseConfig.mongodb.options.maxPoolSize ?? 10,
            current: mongoose.connection.readyState === 1 ? 'active' : 'inactive',
        },
    };
}

export async function healthCheck(): Promise<boolean> {
    try {
        if (!isConnected || mongoose.connection.readyState !== 1) return false;
        await mongoose.connection.db?.admin().ping();
        return true;
    } catch {
        return false;
    }
}

// ==================== STATS ====================

export async function getDatabaseStats() {
    if (!isConnected || mongoose.connection.readyState !== 1) {
        throw new Error('Database not connected');
    }

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database instance not available');

    const s = await db.stats();

    const toMB = (bytes: number) => parseFloat((bytes / (1024 * 1024)).toFixed(2));

    return {
        database:        db.databaseName,
        collections:     s.collections  as number,
        views:           (s.views as number)       ?? 0,
        documents:       s.objects      as number,
        dataSizeMB:      toMB(s.dataSize    as number),
        storageSizeMB:   toMB(s.storageSize as number),
        indexes:         s.indexes      as number,
        indexSizeMB:     toMB(s.indexSize   as number),
    };
}

// ==================== RECONNECT ====================

export async function reconnectDB(): Promise<void> {
    logger.warn('Forcing database reconnection');
    await disconnectDB();
    connectionAttempts = 0;
    await connectDB();
}

// ==================== DEFAULT EXPORT ====================

export default {
    connectDB,
    disconnectDB,
    getConnectionStatus,
    getConnectionDetails,
    healthCheck,
    reconnectDB,
    getDatabaseStats,
};