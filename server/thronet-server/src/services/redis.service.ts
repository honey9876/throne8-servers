// services/redis.service.ts
import Redis from 'ioredis';
import { redisConfig } from '@/config/cache/redis.config';
import { logger } from '@/shared/logger.util';
import { promisify } from 'util';
import zlib from 'zlib';

// ==================== COMPRESSION UTILITIES ====================
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ==================== INTERFACES ====================
interface RedisStats {
    connected: boolean;
    reconnectAttempts: number;
    nodesCount: number;
    masterNodes: number;
    slaveNodes: number;
    totalOperations: number;
    cacheHits: number;
    cacheMisses: number;
    hitRate: string;
    averageLatency: number;
    memoryUsage: string;
}

interface SetOptions {
    ttl?: number;
    compress?: boolean;
}

interface ExtendedRedisHealth {
    connected: boolean;
    totalNodes: number;
    healthyNodes: number;
    clusterMode: boolean;
    performance: {
        avgResponseTime: number;
        successRate: number;
    };
}

// ==================== REDIS SERVICE (SINGLE-NODE, PRODUCTION-GRADE) ====================
// NOTE: Converted from Redis Cluster to a single-node client because Railway
// (and most hosted Redis add-ons) provision one instance, not a 3-node
// cluster. Public API (connect/get/set/delete/batch*/healthCheck/etc.) is
// unchanged so callers elsewhere in the app don't need to change.
class RedisService {
    [x: string]: any;
    private client: Redis | null = null;
    private isConnecting = false;
    public connected = false;
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 10;
    private connectionPromise: Promise<void> | null = null;

    // ==================== METRICS ====================
    private metrics = {
        totalOperations: 0,
        cacheHits: 0,
        cacheMisses: 0,
        totalLatency: 0,
        operationCount: 0
    };

    // ==================== CONNECTION MANAGEMENT ====================

    /**
     * Test Redis connection before full initialization
     */
    async testConnection(): Promise<boolean> {
        try {
            const { options } = redisConfig.getConfig();

            if (!options.host) {
                logger.warn('⚠️ [REDIS TEST] Invalid node configuration');
                return false;
            }

            logger.info('🧪 [REDIS TEST] Testing connection...', {
                host: options.host,
                port: options.port,
                timeout: 5000,
            });

            const testClient = new Redis({
                host: options.host,
                port: options.port,
                password: options.password,
                connectTimeout: 5000,
                commandTimeout: 5000,
                maxRetriesPerRequest: 2,
                retryStrategy: (times: number) => {
                    if (times > 2) return null;
                    return Math.min(times * 100, 1000);
                },
                lazyConnect: true,
                keepAlive: 30000,
                family: 4,
                enableAutoPipelining: false,
            });

            await testClient.connect();

            const pingPromise = testClient.ping();
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Connection test timeout')), 5000)
            );

            const result = await Promise.race([pingPromise, timeoutPromise]);
            await testClient.disconnect();

            const isSuccess = result === 'PONG';

            logger.info(isSuccess ? '✅ [REDIS TEST] Connection successful' : '❌ [REDIS TEST] Connection failed', {
                result,
                expected: 'PONG',
            });

            return isSuccess;
        } catch (error: any) {
            logger.warn('⚠️ [REDIS TEST] Connection test failed', {
                error: error.message,
            });
            return false;
        }
    }

    /**
     * Initialize Redis connection
     */
    async connect(): Promise<void> {
        if (this.isConnecting) {
            logger.warn('⚠️ [REDIS] Connection already in progress');
            if (this.connectionPromise) {
                await this.connectionPromise;
            }
            return;
        }

        if (this.connected && this.client) {
            logger.info('✅ [REDIS] Already connected');
            return;
        }

        this.connectionPromise = this.performConnect();

        try {
            await this.connectionPromise;
        } finally {
            this.connectionPromise = null;
        }
    }

    /**
     * Separate method for actual connection logic
     */
    private async performConnect(): Promise<void> {
        this.isConnecting = true;

        try {
            const { options } = redisConfig.getConfig();

            logger.info('🔴 [REDIS] Initializing single-node connection', {
                host: options.host,
                port: options.port,
                environment: process.env.NODE_ENV,
                pid: process.pid,
                timestamp: new Date().toISOString()
            });

            this.client = new Redis(options);

            // ==================== EVENT HANDLERS ====================

            this.client.on('ready', () => {
                this.connected = true;
                this.reconnectAttempts = 0;

                logger.info('✅ [REDIS] Client ready and operational', {
                    status: 'CONNECTED',
                    host: options.host,
                    port: options.port,
                    autoPipelining: 'enabled',
                    timestamp: new Date().toISOString()
                });
            });

            this.client.on('connect', () => {
                logger.info('🔗 [REDIS] Connection established');
            });

            this.client.on('error', (err: Error) => {
                logger.error('❌ [REDIS] Client error', {
                    error: err.message,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                });
            });

            this.client.on('close', () => {
                this.connected = false;
                logger.warn('⚠️ [REDIS] Connection closed', {
                    timestamp: new Date().toISOString()
                });
            });

            this.client.on('reconnecting', (delay: number) => {
                this.reconnectAttempts++;
                logger.warn('🔄 [REDIS] Attempting reconnection', {
                    attempt: this.reconnectAttempts,
                    maxAttempts: this.MAX_RECONNECT_ATTEMPTS,
                    delay: `${delay}ms`,
                    timestamp: new Date().toISOString()
                });

                if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
                    logger.error('❌ [REDIS] Max reconnection attempts reached');
                }
            });

            // Wait for connection to be ready
            await this.waitForConnection();

            // Test connection with PING
            await this.client.ping();
            logger.info('🏓 [REDIS] PING successful - client is responsive');

        } catch (error: any) {
            this.connected = false;
            logger.error('❌ [REDIS] Connection failed', {
                error: error.message,
                stack: error.stack,
                reconnectAttempts: this.reconnectAttempts,
                timestamp: new Date().toISOString()
            });

            if (this.client) {
                try {
                    this.client.disconnect();
                } catch (disconnectError) {
                    // Ignore disconnect errors
                }
                this.client = null;
            }

            throw error;
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * Wait for Redis connection with timeout
     */
    private async waitForConnection(timeout = 60000): Promise<void> {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const checkConnection = () => {
                if (this.connected) {
                    const duration = Date.now() - startTime;
                    logger.info('✅ [REDIS] Connection wait completed', {
                        duration: `${duration}ms`
                    });
                    resolve();
                    return;
                }

                if (Date.now() - startTime > timeout) {
                    reject(new Error(`Redis connection timeout after ${timeout}ms`));
                    return;
                }

                setTimeout(checkConnection, 500);
            };

            checkConnection();
        });
    }

    async getRedisClient(): Promise<Redis> {
        if (!this.connected && this.connectionPromise) {
            await this.connectionPromise;
        }

        if (!this.connected) {
            await this.connect();
        }

        return this.getClient();
    }

    // ==================== CACHE OPERATIONS ====================

    /**
     * Get value from cache
     */
    async get(key: string): Promise<string | null> {
        const startTime = Date.now();
        this.metrics.totalOperations++;

        try {
            if (!this.client || !this.connected) {
                logger.warn('⚠️ [REDIS GET] Client not connected', { key });
                this.metrics.cacheMisses++;
                return null;
            }

            const value = await this.client.get(key);
            const duration = Date.now() - startTime;

            this.updateLatencyMetrics(duration);

            if (value === null) {
                this.metrics.cacheMisses++;
                logger.debug('❌ [CACHE MISS]', {
                    key,
                    duration: `${duration}ms`,
                    timestamp: new Date().toISOString()
                });
                return null;
            }

            this.metrics.cacheHits++;

            // Check if compressed
            const memorySettings = redisConfig.getMemorySettings();
            if (memorySettings.enableCompression && value.startsWith('GZIP:')) {
                const decompressed = await this.decompress(value.substring(5));
                logger.debug('✅ [CACHE HIT] Decompressed', {
                    key,
                    duration: `${duration}ms`,
                    compressed: true,
                    timestamp: new Date().toISOString()
                });
                return decompressed;
            }

            logger.debug('✅ [CACHE HIT]', {
                key,
                duration: `${duration}ms`,
                size: `${value.length} bytes`,
                timestamp: new Date().toISOString()
            });

            return value;
        } catch (error: any) {
            const duration = Date.now() - startTime;
            this.metrics.cacheMisses++;

            logger.error('❌ [REDIS GET] Error', {
                key,
                error: error.message,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString()
            });
            return null;
        }
    }

    /**
     * Set value in cache
     */
    async set(key: string, value: string, options: SetOptions = {}): Promise<void> {
        const startTime = Date.now();
        this.metrics.totalOperations++;

        try {
            if (!this.client || !this.connected) {
                logger.warn('⚠️ [REDIS SET] Client not connected', { key });
                return;
            }

            const memorySettings = redisConfig.getMemorySettings();
            let finalValue = value;
            let compressed = false;

            // Auto-compress large values
            if (
                memorySettings.enableCompression &&
                value.length > memorySettings.compressionThreshold
            ) {
                finalValue = 'GZIP:' + await this.compress(value);
                compressed = true;
            }

            // Set with TTL
            const ttl = options.ttl || redisConfig.getCacheTTL().default;
            await this.client.setex(key, ttl, finalValue);

            const duration = Date.now() - startTime;
            this.updateLatencyMetrics(duration);

            logger.debug('✅ [CACHE SET]', {
                key,
                ttl: `${ttl}s`,
                duration: `${duration}ms`,
                originalSize: `${value.length} bytes`,
                finalSize: `${finalValue.length} bytes`,
                compressed,
                compressionRatio: compressed
                    ? `${((1 - finalValue.length / value.length) * 100).toFixed(2)}%`
                    : 'N/A',
                timestamp: new Date().toISOString()
            });

        } catch (error: any) {
            const duration = Date.now() - startTime;
            logger.error('❌ [REDIS SET] Error', {
                key,
                error: error.message,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Delete key
     */
    async delete(key: string): Promise<void> {
        const startTime = Date.now();
        this.metrics.totalOperations++;

        try {
            if (!this.client || !this.connected) {
                logger.warn('⚠️ [REDIS DEL] Client not connected', { key });
                return;
            }

            const result = await this.client.del(key);
            const duration = Date.now() - startTime;

            logger.debug('🗑️ [CACHE DELETE]', {
                key,
                deleted: result > 0,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString()
            });

        } catch (error: any) {
            logger.error('❌ [REDIS DEL] Error', {
                key,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
    * Delete key (alias for delete)
    */
    async del(key: string): Promise<void> {
        return this.delete(key);
    }

    /**
     * Delete by pattern (use carefully in production)
     */
    async deleteByPattern(pattern: string): Promise<number> {
        const startTime = Date.now();

        try {
            if (!this.client || !this.connected) {
                logger.warn('⚠️ [REDIS DEL PATTERN] Client not connected', { pattern });
                return 0;
            }

            logger.info('🔍 [CACHE DELETE PATTERN] Scanning keys', {
                pattern,
                timestamp: new Date().toISOString()
            });

            let deletedCount = 0;
            let cursor = '0';

            do {
                const [newCursor, keys] = await this.client.scan(
                    cursor,
                    'MATCH',
                    pattern,
                    'COUNT',
                    100
                );
                cursor = newCursor;

                if (keys.length > 0) {
                    // NOTE: single-node client hai (cluster nahi), isliye
                    // CROSSSLOT ka risk yahan applicable nahi — sab keys
                    // isi ek instance pe hoti hain. Plain multi-key DEL safe hai.
                    const result = await this.client.del(...keys);
                    deletedCount += result;
                }
            } while (cursor !== '0');
            const duration = Date.now() - startTime;

            logger.info('✅ [CACHE DELETE PATTERN] Completed', {
                pattern,
                deletedCount,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString()
            });

            return deletedCount;

        } catch (error: any) {
            logger.error('❌ [REDIS DEL PATTERN] Error', {
                pattern,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            return 0;
        }
    }

    // ==================== BATCH OPERATIONS ====================

    /**
     * Batch set (pipeline for performance)
     */
    async batchSet(items: Array<{ key: string; value: string; ttl?: number }>): Promise<void> {
        const startTime = Date.now();

        try {
            if (!this.client || !this.connected) {
                logger.warn('⚠️ [REDIS BATCH SET] Client not connected');
                return;
            }

            logger.info('📦 [BATCH SET] Starting batch operation', {
                count: items.length,
                timestamp: new Date().toISOString()
            });

            const pipeline = this.client.pipeline();

            for (const { key, value, ttl } of items) {
                const finalTTL = ttl || redisConfig.getCacheTTL().default;
                pipeline.setex(key, finalTTL, value);
            }

            await pipeline.exec();

            const duration = Date.now() - startTime;

            logger.info('✅ [BATCH SET] Completed', {
                count: items.length,
                duration: `${duration}ms`,
                avgPerItem: `${(duration / items.length).toFixed(2)}ms`,
                timestamp: new Date().toISOString()
            });

        } catch (error: any) {
            logger.error('❌ [REDIS BATCH SET] Error', {
                error: error.message,
                count: items.length,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Batch get (pipeline for performance)
     */
    async batchGet(keys: string[]): Promise<Array<string | null>> {
        const startTime = Date.now();

        try {
            if (!this.client || !this.connected) {
                logger.warn('⚠️ [REDIS BATCH GET] Client not connected');
                return keys.map(() => null);
            }

            logger.info('📦 [BATCH GET] Starting batch retrieval', {
                count: keys.length,
                timestamp: new Date().toISOString()
            });

            const pipeline = this.client.pipeline();
            keys.forEach(key => pipeline.get(key));

            const results = await pipeline.exec();
            const values = results?.map(([err, value]) => {
                if (err || value === null) {
                    this.metrics.cacheMisses++;
                    return null;
                }
                this.metrics.cacheHits++;
                return value as string;
            }) || [];

            const duration = Date.now() - startTime;
            const hitCount = values.filter(v => v !== null).length;
            const missCount = values.filter(v => v === null).length;

            logger.info('✅ [BATCH GET] Completed', {
                count: keys.length,
                hits: hitCount,
                misses: missCount,
                hitRate: `${((hitCount / keys.length) * 100).toFixed(2)}%`,
                duration: `${duration}ms`,
                avgPerItem: `${(duration / keys.length).toFixed(2)}ms`,
                timestamp: new Date().toISOString()
            });

            return values;

        } catch (error: any) {
            logger.error('❌ [REDIS BATCH GET] Error', {
                error: error.message,
                count: keys.length,
                timestamp: new Date().toISOString()
            });
            return keys.map(() => null);
        }
    }

    /**
     * Execute batch operations using pipeline
     */
    async executeBatch(commands: Array<{ method: string; args: any[] }>): Promise<any[]> {
        if (!this.client || !this.connected) {
            logger.warn('⚠️ [REDIS BATCH] Client not connected');
            return [];
        }

        const pipeline = this.client.pipeline();
        const startTime = Date.now();

        commands.forEach(({ method, args }) => {
            (pipeline as any)[method](...args);
        });

        try {
            const results = await pipeline.exec();
            const responseTime = Date.now() - startTime;

            logger.debug('⚡ [REDIS BATCH] Operation executed', {
                commandCount: commands.length,
                responseTimeMs: responseTime,
            });

            return results || [];
        } catch (error: any) {
            const responseTime = Date.now() - startTime;

            logger.error('❌ [REDIS BATCH] Operation failed', {
                error: error.message,
                commandCount: commands.length,
                responseTimeMs: responseTime,
            });

            throw error;
        }
    }

    /**
     * Scan keys with pattern matching (async generator)
     */
    async *scanKeys(pattern: string = '*', count: number = 1000): AsyncGenerator<string[], void, unknown> {
        if (!this.client || !this.connected) {
            logger.warn('⚠️ [REDIS SCAN] Client not connected');
            return;
        }

        let cursor = '0';

        do {
            const startTime = Date.now();
            try {
                const result = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
                cursor = result[0];
                const keys = result[1];

                if (keys.length > 0) {
                    const responseTime = Date.now() - startTime;
                    logger.debug('🔍 [REDIS SCAN] Keys found', {
                        cursor,
                        keyCount: keys.length,
                        pattern,
                        responseTimeMs: responseTime,
                    });
                    yield keys;
                }
            } catch (error: any) {
                const responseTime = Date.now() - startTime;
                logger.error('❌ [REDIS SCAN] Scan failed', {
                    error: error.message,
                    pattern,
                    responseTimeMs: responseTime,
                });
                throw error;
            }
        } while (cursor !== '0');
    }

    // ==================== COMPRESSION UTILITIES ====================

    private async compress(data: string): Promise<string> {
        const buffer = await gzip(Buffer.from(data, 'utf-8'));
        return buffer.toString('base64');
    }

    private async decompress(data: string): Promise<string> {
        const buffer = await gunzip(Buffer.from(data, 'base64'));
        return buffer.toString('utf-8');
    }

    // ==================== METRICS & MONITORING ====================

    private updateLatencyMetrics(latency: number): void {
        this.metrics.totalLatency += latency;
        this.metrics.operationCount++;
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            if (!this.client || !this.connected) {
                return false;
            }

            await this.client.ping();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Extended health check with detailed metrics
     */
    async checkHealth(): Promise<ExtendedRedisHealth> {
        const startTime = Date.now();

        try {
            if (!this.client) {
                return {
                    connected: false,
                    totalNodes: 0,
                    healthyNodes: 0,
                    clusterMode: false,
                    performance: {
                        avgResponseTime: 0,
                        successRate: 0,
                    },
                };
            }

            const nodeStartTime = Date.now();
            let healthy = false;
            try {
                const result = await this.client.ping();
                healthy = result === 'PONG';
            } catch {
                healthy = false;
            }
            const responseTime = Date.now() - nodeStartTime;

            const health: ExtendedRedisHealth = {
                connected: healthy,
                totalNodes: 1,
                healthyNodes: healthy ? 1 : 0,
                clusterMode: false,
                performance: {
                    avgResponseTime: healthy ? responseTime : 0,
                    successRate: healthy ? 100 : 0,
                },
            };

            const totalHealthCheckTime = Date.now() - startTime;

            logger.debug('📊 [REDIS HEALTH] Health check completed', {
                ...health,
                totalCheckTimeMs: totalHealthCheckTime,
            });

            return health;
        } catch (error: any) {
            logger.error('❌ [REDIS HEALTH] Health check failed', {
                error: error.message,
            });

            return {
                connected: false,
                totalNodes: 0,
                healthyNodes: 0,
                clusterMode: false,
                performance: {
                    avgResponseTime: 0,
                    successRate: 0,
                },
            };
        }
    }

    /**
     * Get comprehensive statistics
     */
    getStats(): RedisStats {
        const hitRate = this.metrics.totalOperations > 0
            ? ((this.metrics.cacheHits / this.metrics.totalOperations) * 100).toFixed(2)
            : '0.00';
        const avgLatency = this.metrics.operationCount > 0
            ? (this.metrics.totalLatency / this.metrics.operationCount).toFixed(2)
            : 0;

        return {
            connected: this.connected,
            reconnectAttempts: this.reconnectAttempts,
            nodesCount: this.connected ? 1 : 0,
            masterNodes: this.connected ? 1 : 0,
            slaveNodes: 0,
            totalOperations: this.metrics.totalOperations,
            cacheHits: this.metrics.cacheHits,
            cacheMisses: this.metrics.cacheMisses,
            hitRate: `${hitRate}%`,
            averageLatency: Number(avgLatency),
            memoryUsage: 'N/A' // Can be fetched from Redis INFO
        };
    }

    /**
     * Log statistics
     */
    logStats(): void {
        const stats = this.getStats();
        logger.info('📊 [REDIS STATS] Current statistics', {
            ...stats,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get client instance (use with caution)
     */
    getClient(): Redis {
        if (!this.client) {
            throw new Error('Redis client not initialized');
        }
        return this.client;
    }

    /**
     * @deprecated use getClient() — kept for backward compatibility with
     * any code still calling getCluster().
     */
    getCluster(): Redis {
        return this.getClient();
    }

    /**
     * Disconnect from Redis
     */
    async disconnect(): Promise<void> {
        try {
            if (this.client) {
                logger.info('🔴 [REDIS] Disconnecting');

                // Log final stats
                this.logStats();

                await this.client.quit();
                this.connected = false;
                this.client = null;

                logger.info('✅ [REDIS] Disconnected successfully', {
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error: any) {
            logger.error('❌ [REDIS] Error during disconnect', {
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

const redisServiceInstance = new RedisService();

export const connectRedis = async (): Promise<void> => {
    await redisServiceInstance.connect();
};

export const getRedisClient = async (): Promise<Redis> => {
    return await redisServiceInstance.getRedisClient();
};

export const disconnectRedis = async (): Promise<void> => {
    await redisServiceInstance.disconnect();
};

export const checkRedisHealth = async () => {
    return await redisServiceInstance.checkHealth();
};

export const executeBatch = async (commands: Array<{ method: string; args: any[] }>): Promise<any[]> => {
    return await redisServiceInstance.executeBatch(commands);
};

export const scanAllKeys = async (pattern?: string): Promise<string[]> => {
    const allKeys: string[] = [];
    for await (const keys of redisServiceInstance.scanKeys(pattern)) {
        allKeys.push(...keys);
    }
    return allKeys;
};

export const getRedisStats = async () => {
    const health = await redisServiceInstance.checkHealth();
    const stats = redisServiceInstance.getStats();

    return {
        health,
        stats,
    };
};

export default redisServiceInstance;