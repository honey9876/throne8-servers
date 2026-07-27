// services/redis.service.ts
import Redis, { Cluster } from 'ioredis';
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

// ==================== REDIS SERVICE (PRODUCTION-GRADE) ====================
class RedisService {
    [x: string]: any;
    private cluster: Cluster | null = null;
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
     * Γ£à NEW: Test Redis connection before full initialization
     */
    async testConnection(): Promise<boolean> {
        try {
            const { nodes } = redisConfig.getConfig();
            const testNode = Array.isArray(nodes) && nodes.length > 0 ? nodes[0] : null;

            if (!testNode || typeof testNode === 'string' || typeof testNode === 'number') {
                logger.warn('ΓÜá∩╕Å [REDIS TEST] Invalid node configuration');
                return false;
            }

            logger.info('≡ƒº¬ [REDIS TEST] Testing connection...', {
                host: testNode.host,
                port: testNode.port,
                timeout: 5000,
            });

            const testClient = new Redis({
                host: testNode.host,
                port: testNode.port,
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

            logger.info(isSuccess ? 'Γ£à [REDIS TEST] Connection successful' : 'Γ¥î [REDIS TEST] Connection failed', {
                result,
                expected: 'PONG',
            });

            return isSuccess;
        } catch (error: any) {
            logger.warn('ΓÜá∩╕Å [REDIS TEST] Connection test failed', {
                error: error.message,
            });
            return false;
        }
    }

    /**
     * Initialize Redis Cluster connection
     */
    async connect(): Promise<void> {
        if (this.isConnecting) {
            logger.warn('ΓÜá∩╕Å [REDIS] Connection already in progress');
            // Γ£à NEW: Wait for existing connection attempt
            if (this.connectionPromise) {
                await this.connectionPromise;
            }
            return;
        }

        if (this.connected && this.cluster) {
            logger.info('Γ£à [REDIS] Already connected');
            return;
        }

        // Γ£à NEW: Create connection promise
        this.connectionPromise = this.performConnect();

        try {
            await this.connectionPromise;
        } finally {
            this.connectionPromise = null;
        }
    }

    /**
     * Γ£à NEW: Separate method for actual connection logic
     */
    private async performConnect(): Promise<void> {
        this.isConnecting = true;

        try {
            const { nodes, options } = redisConfig.getConfig();

            logger.info('≡ƒö┤ [REDIS] Initializing cluster connection', {
                nodes: nodes.map(n => typeof n === 'string' ? n : typeof n === 'object' ? `${n.host}:${n.port}` : n),
                environment: process.env.NODE_ENV,
                pid: process.pid,
                targetCapacity: '500K+ users',
                timestamp: new Date().toISOString()
            });

            this.cluster = new Redis.Cluster(nodes, options);

            // ==================== EVENT HANDLERS ====================

            this.cluster.on('ready', () => {
                this.connected = true;
                this.reconnectAttempts = 0;

                const masterNodes = this.cluster!.nodes('master');
                const slaveNodes = this.cluster!.nodes('slave');

                logger.info('Γ£à [REDIS] Cluster ready and operational', {
                    status: 'CONNECTED',
                    masterNodes: masterNodes.length,
                    slaveNodes: slaveNodes.length,
                    totalNodes: masterNodes.length + slaveNodes.length,
                    autoPipelining: 'enabled',
                    scaleReads: 'all nodes',
                    timestamp: new Date().toISOString()
                });

                // Log node details
                masterNodes.forEach((node, index) => {
                    logger.info(`   ≡ƒôì Master Node ${index + 1}: ${node.options.host}:${node.options.port}`);
                });
            });

            this.cluster.on('connect', () => {
                logger.info('≡ƒöù [REDIS] Cluster connection established');
            });

            this.cluster.on('error', (err: Error) => {
                logger.error('Γ¥î [REDIS] Cluster error', {
                    error: err.message,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                });
            });

            this.cluster.on('close', () => {
                this.connected = false;
                logger.warn('ΓÜá∩╕Å [REDIS] Cluster connection closed', {
                    timestamp: new Date().toISOString()
                });
            });

            this.cluster.on('node error', (err: Error, address: string) => {
                logger.error('Γ¥î [REDIS] Node error', {
                    node: address,
                    error: err.message,
                    timestamp: new Date().toISOString()
                });
            });

            this.cluster.on('reconnecting', (delay: number) => {
                this.reconnectAttempts++;
                logger.warn('≡ƒöä [REDIS] Attempting reconnection', {
                    attempt: this.reconnectAttempts,
                    maxAttempts: this.MAX_RECONNECT_ATTEMPTS,
                    delay: `${delay}ms`,
                    timestamp: new Date().toISOString()
                });

                if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
                    logger.error('Γ¥î [REDIS] Max reconnection attempts reached');
                }
            });

            this.cluster.on('+node', (node: any) => {
                logger.info('Γ₧ò [REDIS] Node added to cluster', {
                    node: `${node.options.host}:${node.options.port}`,
                    timestamp: new Date().toISOString()
                });
            });

            this.cluster.on('-node', (node: any) => {
                logger.warn('Γ₧û [REDIS] Node removed from cluster', {
                    node: `${node.options.host}:${node.options.port}`,
                    timestamp: new Date().toISOString()
                });
            });

            // Wait for connection to be ready
            await this.waitForConnection();

            // Test connection with PING
            await this.cluster.ping();
            logger.info('≡ƒÅô [REDIS] PING successful - cluster is responsive');

            // Log cluster info
            await this.logClusterInfo();

        } catch (error: any) {
            this.connected = false;
            logger.error('Γ¥î [REDIS] Connection failed', {
                error: error.message,
                stack: error.stack,
                reconnectAttempts: this.reconnectAttempts,
                timestamp: new Date().toISOString()
            });

            // Γ£à ADD THESE LINES (cleanup on failure)
            if (this.cluster) {
                try {
                    await this.cluster.disconnect();
                } catch (disconnectError) {
                    // Ignore disconnect errors
                }
                this.cluster = null;
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
                    logger.info('Γ£à [REDIS] Connection wait completed', {
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

    /**
     * Log cluster information
     */
    private async logClusterInfo(): Promise<void> {
        try {
            const info = await this.cluster!.cluster('INFO');
            logger.info('≡ƒôè [REDIS] Cluster information', {
                info: info.split('\r\n').filter(line => line.includes('cluster_')),
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            logger.warn('ΓÜá∩╕Å [REDIS] Could not retrieve cluster info', {
                error: error.message
            });
        }
    }

    async getRedisClient(): Promise<Cluster> {
        if (!this.connected && this.connectionPromise) {
            await this.connectionPromise;
        }

        if (!this.connected) {
            await this.connect();
        }

        return this.getCluster();
    }


    // ==================== CACHE OPERATIONS ====================

    /**
     * Get value from cache
     */
    async get(key: string): Promise<string | null> {
        const startTime = Date.now();
        this.metrics.totalOperations++;

        try {
            if (!this.cluster || !this.connected) {
                logger.warn('ΓÜá∩╕Å [REDIS GET] Cluster not connected', { key });
                this.metrics.cacheMisses++;
                return null;
            }

            const value = await this.cluster.get(key);
            const duration = Date.now() - startTime;

            this.updateLatencyMetrics(duration);

            if (value === null) {
                this.metrics.cacheMisses++;
                logger.debug('Γ¥î [CACHE MISS]', {
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
                logger.debug('Γ£à [CACHE HIT] Decompressed', {
                    key,
                    duration: `${duration}ms`,
                    compressed: true,
                    timestamp: new Date().toISOString()
                });
                return decompressed;
            }

            logger.debug('Γ£à [CACHE HIT]', {
                key,
                duration: `${duration}ms`,
                size: `${value.length} bytes`,
                timestamp: new Date().toISOString()
            });

            return value;
        } catch (error: any) {
            const duration = Date.now() - startTime;
            this.metrics.cacheMisses++;

            logger.error('Γ¥î [REDIS GET] Error', {
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
            if (!this.cluster || !this.connected) {
                logger.warn('ΓÜá∩╕Å [REDIS SET] Cluster not connected', { key });
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
            await this.cluster.setex(key, ttl, finalValue);

            const duration = Date.now() - startTime;
            this.updateLatencyMetrics(duration);

            logger.debug('Γ£à [CACHE SET]', {
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
            logger.error('Γ¥î [REDIS SET] Error', {
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
            if (!this.cluster || !this.connected) {
                logger.warn('ΓÜá∩╕Å [REDIS DEL] Cluster not connected', { key });
                return;
            }

            const result = await this.cluster.del(key);
            const duration = Date.now() - startTime;

            logger.debug('≡ƒùæ∩╕Å [CACHE DELETE]', {
                key,
                deleted: result > 0,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString()
            });

        } catch (error: any) {
            logger.error('Γ¥î [REDIS DEL] Error', {
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
            if (!this.cluster || !this.connected) {
                logger.warn('ΓÜá∩╕Å [REDIS DEL PATTERN] Cluster not connected', { pattern });
                return 0;
            }

            logger.info('≡ƒöì [CACHE DELETE PATTERN] Scanning keys', {
                pattern,
                timestamp: new Date().toISOString()
            });

            let deletedCount = 0;
            const nodes = this.cluster.nodes('master');

            // Scan each master node
            for (const node of nodes) {
                let cursor = '0';
                do {
                    const [newCursor, keys] = await node.scan(
                        cursor,
                        'MATCH',
                        pattern,
                        'COUNT',
                        100
                    );
                    cursor = newCursor;

                    if (keys.length > 0) {
                        const result = await this.cluster.del(...keys);
                        deletedCount += result;
                    }
                } while (cursor !== '0');
            }

            const duration = Date.now() - startTime;

            logger.info('Γ£à [CACHE DELETE PATTERN] Completed', {
                pattern,
                deletedCount,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString()
            });

            return deletedCount;

        } catch (error: any) {
            logger.error('Γ¥î [REDIS DEL PATTERN] Error', {
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
            if (!this.cluster || !this.connected) {
                logger.warn('ΓÜá∩╕Å [REDIS BATCH SET] Cluster not connected');
                return;
            }

            logger.info('≡ƒôª [BATCH SET] Starting batch operation', {
                count: items.length,
                timestamp: new Date().toISOString()
            });

            const pipeline = this.cluster.pipeline();

            for (const { key, value, ttl } of items) {
                const finalTTL = ttl || redisConfig.getCacheTTL().default;
                pipeline.setex(key, finalTTL, value);
            }

            await pipeline.exec();

            const duration = Date.now() - startTime;

            logger.info('Γ£à [BATCH SET] Completed', {
                count: items.length,
                duration: `${duration}ms`,
                avgPerItem: `${(duration / items.length).toFixed(2)}ms`,
                timestamp: new Date().toISOString()
            });

        } catch (error: any) {
            logger.error('Γ¥î [REDIS BATCH SET] Error', {
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
            if (!this.cluster || !this.connected) {
                logger.warn('ΓÜá∩╕Å [REDIS BATCH GET] Cluster not connected');
                return keys.map(() => null);
            }

            logger.info('≡ƒôª [BATCH GET] Starting batch retrieval', {
                count: keys.length,
                timestamp: new Date().toISOString()
            });

            const pipeline = this.cluster.pipeline();
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

            logger.info('Γ£à [BATCH GET] Completed', {
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
            logger.error('Γ¥î [REDIS BATCH GET] Error', {
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
        if (!this.cluster || !this.connected) {
            logger.warn('ΓÜá∩╕Å [REDIS BATCH] Cluster not connected');
            return [];
        }

        const pipeline = this.cluster.pipeline();
        const startTime = Date.now();

        commands.forEach(({ method, args }) => {
            (pipeline as any)[method](...args);
        });

        try {
            const results = await pipeline.exec();
            const responseTime = Date.now() - startTime;

            logger.debug('ΓÜí [REDIS BATCH] Operation executed', {
                commandCount: commands.length,
                responseTimeMs: responseTime,
            });

            return results || [];
        } catch (error: any) {
            const responseTime = Date.now() - startTime;

            logger.error('Γ¥î [REDIS BATCH] Operation failed', {
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
        if (!this.cluster || !this.connected) {
            logger.warn('ΓÜá∩╕Å [REDIS SCAN] Cluster not connected');
            return;
        }

        const nodes = this.cluster.nodes('master');

        for (const node of nodes) {
            let cursor = 0;

            do {
                const startTime = Date.now();
                try {
                    const result = await node.scan(cursor, 'MATCH', pattern, 'COUNT', count);
                    cursor = parseInt(result[0]);
                    const keys = result[1];

                    if (keys.length > 0) {
                        const responseTime = Date.now() - startTime;
                        logger.debug('≡ƒöì [REDIS SCAN] Keys found', {
                            cursor,
                            keyCount: keys.length,
                            pattern,
                            responseTimeMs: responseTime,
                        });
                        yield keys;
                    }
                } catch (error: any) {
                    const responseTime = Date.now() - startTime;
                    logger.error('Γ¥î [REDIS SCAN] Scan failed', {
                        error: error.message,
                        pattern,
                        responseTimeMs: responseTime,
                    });
                    throw error;
                }
            } while (cursor !== 0);
        }
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
            if (!this.cluster || !this.connected) {
                return false;
            }

            await this.cluster.ping();
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
            if (!this.cluster) {
                return {
                    connected: false,
                    totalNodes: 0,
                    healthyNodes: 0,
                    clusterMode: true,
                    performance: {
                        avgResponseTime: 0,
                        successRate: 0,
                    },
                };
            }

            const nodes = this.cluster.nodes('all');
            const totalNodes = nodes.length;
            let healthyNodes = 0;
            let totalResponseTime = 0;

            const healthChecks = await Promise.allSettled(
                nodes.map(async (node) => {
                    const nodeStartTime = Date.now();
                    try {
                        const result = await node.ping();
                        const responseTime = Date.now() - nodeStartTime;
                        const isHealthy = result === 'PONG';

                        if (isHealthy) {
                            healthyNodes++;
                            totalResponseTime += responseTime;
                        }

                        return { healthy: isHealthy, responseTime };
                    } catch (error : any) {
                        return { healthy: false, responseTime: 0 };
                    }
                })
            );

            const avgResponseTime = healthyNodes > 0 ? totalResponseTime / healthyNodes : 0;
            const successRate = totalNodes > 0 ? (healthyNodes / totalNodes) * 100 : 0;
            const totalHealthCheckTime = Date.now() - startTime;

            const health: ExtendedRedisHealth = {
                connected: healthyNodes > 0,
                totalNodes,
                healthyNodes,
                clusterMode: true,
                performance: {
                    avgResponseTime: Math.round(avgResponseTime),
                    successRate: Math.round(successRate * 100) / 100,
                },
            };

            logger.debug('≡ƒôè [REDIS HEALTH] Health check completed', {
                ...health,
                totalCheckTimeMs: totalHealthCheckTime,
            });

            return health;
        } catch (error: any) {
            logger.error('Γ¥î [REDIS HEALTH] Health check failed', {
                error: error.message,
            });

            return {
                connected: false,
                totalNodes: 0,
                healthyNodes: 0,
                clusterMode: true,
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
        const masterNodes = this.cluster?.nodes('master') || [];
        const slaveNodes = this.cluster?.nodes('slave') || [];
        const hitRate = this.metrics.totalOperations > 0
            ? ((this.metrics.cacheHits / this.metrics.totalOperations) * 100).toFixed(2)
            : '0.00';
        const avgLatency = this.metrics.operationCount > 0
            ? (this.metrics.totalLatency / this.metrics.operationCount).toFixed(2)
            : 0;

        return {
            connected: this.connected,
            reconnectAttempts: this.reconnectAttempts,
            nodesCount: masterNodes.length + slaveNodes.length,
            masterNodes: masterNodes.length,
            slaveNodes: slaveNodes.length,
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
        logger.info('≡ƒôè [REDIS STATS] Current statistics', {
            ...stats,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get cluster instance (use with caution)
     */
    getCluster(): Cluster {
        if (!this.cluster) {
            throw new Error('Redis cluster not initialized');
        }
        return this.cluster;
    }

    /**
     * Disconnect from cluster
     */
    async disconnect(): Promise<void> {
        try {
            if (this.cluster) {
                logger.info('≡ƒö┤ [REDIS] Disconnecting from cluster');

                // Log final stats
                this.logStats();

                await this.cluster.quit();
                this.connected = false;
                this.cluster = null;

                logger.info('Γ£à [REDIS] Disconnected successfully', {
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error: any) {
            logger.error('Γ¥î [REDIS] Error during disconnect', {
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

export const getRedisClient = async (): Promise<Cluster> => {
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
