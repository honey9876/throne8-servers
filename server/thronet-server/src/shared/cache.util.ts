// server/thronet-server/src/shared/cache.util.ts

/**
 * Cache Utility - Production-Ready Redis Cache Manager
 * Supports 1M+ users with advanced caching strategies
 * 
 * Features:
 * - Redis Cluster connection management with timeout
 * - Fallback mode (in-memory) when Redis unavailable
 * - Key-value operations (get, set, del, incr)
 * - Pattern-based operations
 * - Batch operations (mget, mset)
 * - TTL management
 * - Cache statistics
 * - Health checks
 * - Graceful shutdown
 * - ✅ Per-command timeout guard — prevents a stale/half-open Redis
 *   connection from hanging a request forever. If a Redis command
 *   doesn't resolve within COMMAND_TIMEOUT_MS, we treat it as failed
 *   and fall through (set/get/etc. already have try/catch that
 *   degrades gracefully).
 * 
 * @module utils/cache.util
 * @version 3.3.0
 */

import { createClient, createCluster, RedisClientType, RedisClusterType } from 'redis';
import { LoggerUtil } from './logger.util';

// ==================== CONFIGURATION ====================

interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    keyPrefix: string;
    connectionTimeout: number;
    clusterMode: boolean;
    clusterNodes: string[];
}

const redisConfig: RedisConfig = {
    host: process.env['REDIS_HOST'] || 'redis',
    port: parseInt(process.env['REDIS_PORT'] || '6379'),
    password: process.env['REDIS_PASSWORD'] || undefined,
    keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'auth:',
    connectionTimeout: 15000,
    clusterMode: process.env['REDIS_CLUSTER_MODE'] === 'true',
    clusterNodes: process.env['REDIS_CLUSTER_NODES'] 
        ? process.env['REDIS_CLUSTER_NODES'].split(',') 
        : [],
};

// ✅ NEW: max time any single Redis command is allowed to take before
// we give up on it and fall through to the caller's error handling.
// This is separate from connectionTimeout (which only guards the
// initial handshake) — without this, a command sent on a connection
// that *looks* open but is actually stale/dead can hang forever.
const COMMAND_TIMEOUT_MS = parseInt(process.env['REDIS_COMMAND_TIMEOUT_MS'] || '4000');

// ==================== REDIS CLIENT ====================

let redisClient: RedisClientType | RedisClusterType | null = null;
let isConnected: boolean = false;
let useRedis: boolean = process.env['USE_REDIS'] !== 'false';
let connectionAttempted: boolean = false;

// In-memory cache fallback
interface CachedItem {
    value: string;
    expiresAt: number | null;
}
const memoryCache: Map<string, CachedItem> = new Map();

// ==================== TIMEOUT HELPER ====================

/**
 * ✅ NEW: Race any promise against a timeout. If the promise doesn't
 * settle within `ms`, this rejects with a timeout error instead of
 * waiting forever. Used to wrap every Redis command so a stale
 * connection can't hang a request indefinitely.
 */
function withTimeout(promise: Promise<any>, ms: number, label: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Redis command timed out after ${ms}ms: ${label}`));
        }, ms);

        promise
            .then((result) => {
                clearTimeout(timer);
                resolve(result);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

// ==================== CACHE UTILITY CLASS ====================

class CacheUtil {
    static default: any;

    // ==================== STATUS / EVENTS ====================

    /**
     * Get connection status
     */
    static get status(): 'ready' | 'connecting' | 'disconnected' {
        if (this.isConnected()) return 'ready';
        if (connectionAttempted && !isConnected) return 'disconnected';
        return 'connecting';
    }

    /** Alias for shutdown */
    static async quit(): Promise<void> {
        await this.shutdown();
    }

    /** Add event listener */
    static on(event: string, handler: (...args: any[]) => void): void {
        if (redisClient) {
            redisClient.on(event as any, handler);
        }
    }

    /** Remove event listener */
    static off(event: string, handler: (...args: any[]) => void): void {
        if (redisClient) {
            redisClient.off(event as any, handler);
        }
    }

    /** Add one-time event listener */
    static once(event: string, handler: (...args: any[]) => void): void {
        if (redisClient) {
            redisClient.once(event as any, handler);
        }
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize Redis Cluster connection with timeout
     */
    static async init(): Promise<boolean> {
        if (!useRedis) {
            LoggerUtil.info('⚠️ Redis disabled - running in fallback mode (in-memory cache)');
            return false;
        }

        if (connectionAttempted) {
            LoggerUtil.warn('Redis connection already attempted');
            return isConnected;
        }

        connectionAttempted = true;

        return new Promise<boolean>((resolve) => {
            let timeoutId: NodeJS.Timeout;
            let connected = false;

            const handleTimeout = (): void => {
                if (!connected) {
                    LoggerUtil.warn('⏱️ Redis connection timeout - falling back to in-memory cache', {
                        timeout: redisConfig.connectionTimeout,
                        host: redisConfig.host,
                        port: redisConfig.port,
                    });

                    useRedis = false;
                    isConnected = false;

                    if (redisClient) {
                        redisClient.quit().catch(() => { });
                    }

                    resolve(false);
                }
            };

            timeoutId = setTimeout(handleTimeout, redisConfig.connectionTimeout);

            try {
                if (redisConfig.clusterMode) {
                    redisClient = createCluster({
                        rootNodes: redisConfig.clusterNodes.map(node => {
                            const [host, port] = node.split(':');
                            return {
                                url: `redis://${redisConfig.password ? `:${redisConfig.password}@` : ''}${host}:${port}`
                            };
                        }),
                        defaults: {
                            socket: {
                                connectTimeout: redisConfig.connectionTimeout,
                                keepAlive: 5000 as any,
                                reconnectStrategy: (retries: number): number | false => {
                                    if (retries > 3) {
                                        LoggerUtil.warn('Max Redis reconnection attempts reached');
                                        return false;
                                    }
                                    return Math.min(retries * 100, 3000);
                                },
                            }
                        }
                    });
                } else {
                    redisClient = createClient({
                        socket: {
                            host: redisConfig.host,
                            port: redisConfig.port,
                            connectTimeout: redisConfig.connectionTimeout,
                            keepAlive: 5000 as any,
                            reconnectStrategy: (retries: number): number | false => {
                                if (retries > 3) {
                                    LoggerUtil.warn('Max Redis reconnection attempts reached');
                                    return false;
                                }
                                return Math.min(retries * 100, 3000);
                            },
                        },
                        password: redisConfig.password,
                    });
                }

                redisClient.on('error', (error: Error) => {
                    LoggerUtil.error('Redis client error', {
                        error: error.message,
                        code: (error as any).code
                    });

                    if (!connected) {
                        clearTimeout(timeoutId);
                        useRedis = false;
                        isConnected = false;
                        resolve(false);
                    } else {
                        // ✅ NEW: on a post-connect error, don't just
                        // flip isConnected=false silently — every
                        // subsequent call already checks isConnected()
                        // and falls back to memory cache, but we also
                        // want commands already in-flight to be caught
                        // by withTimeout() rather than hang.
                        isConnected = false;
                    }
                });

                redisClient.on('connect', () => {
                    LoggerUtil.info('Redis connecting...', {
                        host: redisConfig.host,
                        port: redisConfig.port,
                    });
                });

                redisClient.on('ready', () => {
                    connected = true;
                    isConnected = true;
                    clearTimeout(timeoutId);

                    LoggerUtil.info('✅ Redis connected and ready', {
                        host: redisConfig.host,
                        port: redisConfig.port,
                    });

                    resolve(true);
                });

                redisClient.on('reconnecting', () => {
                    LoggerUtil.warn('Redis reconnecting...');
                    isConnected = false;
                });

                redisClient.on('end', () => {
                    LoggerUtil.warn('Redis connection closed');
                    isConnected = false;
                });

                redisClient.connect().then(() => {
                    if (!connected) {
                        connected = true;
                        isConnected = true;
                        clearTimeout(timeoutId);

                        LoggerUtil.info('✅ Redis cluster connected and ready', {
                            host: redisConfig.host,
                            port: redisConfig.port,
                        });

                        resolve(true);
                    }
                }).catch((error: Error) => {
                    if (!connected) {
                        clearTimeout(timeoutId);
                        LoggerUtil.error('Redis connection failed', {
                            error: error.message,
                            code: (error as any).code,
                        });

                        useRedis = false;
                        isConnected = false;
                        resolve(false);
                    }
                });

            } catch (error: unknown) {
                clearTimeout(timeoutId);
                LoggerUtil.error('Redis initialization failed', {
                    error: (error as Error).message,
                    stack: (error as Error).stack,
                });

                useRedis = false;
                isConnected = false;
                resolve(false);
            }
        });
    }

    /**
     * Check if Redis cluster is connected
     */
    static isConnected(): boolean {
        // @ts-ignore
        const isClientOpen = redisClient?.isOpen ?? (redisClient !== null);
        return useRedis && isConnected && isClientOpen;
    }

    // ==================== HEALTH / PING ====================

    /**
     * Ping Redis (health check)
     */
    static async ping(): Promise<string> {
        try {
            if (this.isConnected()) {
                await withTimeout(redisClient!.ping(), COMMAND_TIMEOUT_MS, 'ping');
                return 'PONG';
            } else {
                return 'PONG';
            }
        } catch (error: unknown) {
            LoggerUtil.error('Ping failed', { error: (error as Error).message });
            throw error;
        }
    }

    // ==================== KEY-VALUE OPERATIONS ====================

    /**
     * Set value in cache
     *
     * ✅ FIXED: every Redis write is now wrapped in withTimeout(). If
     * the connection is stale (looks open, doesn't respond), this
     * call now fails fast after COMMAND_TIMEOUT_MS instead of hanging
     * the caller (e.g. login) until the HTTP client's own timeout
     * kicks in.
     */
    static async set(key: string, value: any, ttl = 3600): Promise<boolean> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;
            const serializedValue = typeof value === 'string'
                ? value
                : JSON.stringify(value);

            if (this.isConnected()) {
                if (ttl > 0) {
                    await withTimeout(
                        redisClient!.setEx(fullKey, ttl, serializedValue),
                        COMMAND_TIMEOUT_MS,
                        `set:${key}`
                    );
                } else {
                    await withTimeout(
                        redisClient!.set(fullKey, serializedValue),
                        COMMAND_TIMEOUT_MS,
                        `set:${key}`
                    );
                }
                LoggerUtil.debug('Cache set (Redis)', { key, ttl });
                return true;
            } else {
                memoryCache.set(fullKey, {
                    value: serializedValue,
                    expiresAt: ttl > 0 ? Date.now() + (ttl * 1000) : null,
                });
                LoggerUtil.debug('Cache set (memory)', { key, ttl });
                return true;
            }
        } catch (error: unknown) {
            // ✅ On timeout (or any Redis error), mark the connection
            // as unhealthy so subsequent calls in this same request
            // (and future requests) skip straight to the memory
            // fallback instead of trying — and possibly hanging on —
            // the same stale connection again.
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
                LoggerUtil.warn('Cache set timed out — marking Redis unhealthy, falling back to memory', { key });
                const fullKey = `${redisConfig.keyPrefix}${key}`;
                const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
                memoryCache.set(fullKey, {
                    value: serializedValue,
                    expiresAt: ttl > 0 ? Date.now() + (ttl * 1000) : null,
                });
                return true;
            }
            LoggerUtil.error('Cache set failed', { error: (error as Error).message, key });
            return false;
        }
    }

    /**
     * Get value from cache
     *
     * ✅ FIXED: wrapped in withTimeout() — same reasoning as set().
     */
    static async get(key: string): Promise<any> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const value = await withTimeout(
                    redisClient!.get(fullKey),
                    COMMAND_TIMEOUT_MS,
                    `get:${key}`
                );
                if (value) {
                    LoggerUtil.debug('Cache hit (Redis)', { key });
                    try {
                        return JSON.parse(value);
                    } catch {
                        return value;
                    }
                }
                LoggerUtil.debug('Cache miss (Redis)', { key });
                return null;
            } else {
                const cached = memoryCache.get(fullKey);
                if (!cached) {
                    LoggerUtil.debug('Cache miss (memory)', { key });
                    return null;
                }
                if (cached.expiresAt && Date.now() > cached.expiresAt) {
                    memoryCache.delete(fullKey);
                    LoggerUtil.debug('Cache expired (memory)', { key });
                    return null;
                }
                LoggerUtil.debug('Cache hit (memory)', { key });
                try {
                    return JSON.parse(cached.value);
                } catch {
                    return cached.value;
                }
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
                LoggerUtil.warn('Cache get timed out — marking Redis unhealthy', { key });
                return null;
            }
            LoggerUtil.error('Cache get failed', { error: (error as Error).message, key });
            return null;
        }
    }

    // ==================== CACHE-ASIDE PATTERN ====================

    /**
     * Get or set cache (cache-aside pattern)
     */
    static async getOrSet<T = any>(
        key: string,
        fetchFn: () => Promise<T>,
        ttl = 3600
    ): Promise<T> {
        try {
            const cached = await this.get(key);
            if (cached !== null) {
                LoggerUtil.debug('Cache-aside hit', { key });
                return cached;
            }

            LoggerUtil.debug('Cache-aside miss - fetching from source', { key });
            const data = await fetchFn();
            await this.set(key, data, ttl);
            return data;
        } catch (error: unknown) {
            LoggerUtil.error('Cache getOrSet failed - falling back to source', {
                error: (error as Error).message,
                key
            });
            return await fetchFn();
        }
    }

    /**
     * Invalidate multiple cache patterns at once
     */
    static async invalidateMultiple(patterns: string[]): Promise<number> {
        let totalDeleted = 0;
        for (const pattern of patterns) {
            const deleted = await this.clearByPattern(pattern);
            totalDeleted += deleted;
        }
        LoggerUtil.info('Invalidated multiple cache patterns', { patterns, totalDeleted });
        return totalDeleted;
    }

    /**
     * Delete key from cache
     */
    static async del(key: string): Promise<boolean> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const result = await withTimeout(
                    redisClient!.del(fullKey),
                    COMMAND_TIMEOUT_MS,
                    `del:${key}`
                );
                LoggerUtil.debug('Cache deleted (Redis)', { key, deleted: result > 0 });
                return result > 0;
            } else {
                const deleted = memoryCache.delete(fullKey);
                LoggerUtil.debug('Cache deleted (memory)', { key, deleted });
                return deleted;
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Cache delete failed', { error: (error as Error).message, key });
            return false;
        }
    }

    /**
     * Check if key exists
     */
    static async exists(key: string): Promise<boolean> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const result = await withTimeout(
                    redisClient!.exists(fullKey),
                    COMMAND_TIMEOUT_MS,
                    `exists:${key}`
                );
                return result === 1;
            } else {
                const cached = memoryCache.get(fullKey);
                if (!cached) return false;
                if (cached.expiresAt && Date.now() > cached.expiresAt) {
                    memoryCache.delete(fullKey);
                    return false;
                }
                return true;
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Cache exists check failed', { error: (error as Error).message, key });
            return false;
        }
    }

    /**
     * Get TTL of key
     */
    static async ttl(key: string): Promise<number> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                return await withTimeout(
                    redisClient!.ttl(fullKey),
                    COMMAND_TIMEOUT_MS,
                    `ttl:${key}`
                );
            } else {
                const cached = memoryCache.get(fullKey);
                if (!cached) return -2;
                if (!cached.expiresAt) return -1;
                const ttlMs = cached.expiresAt - Date.now();
                return Math.floor(ttlMs / 1000);
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Cache TTL check failed', { error: (error as Error).message, key });
            return -2;
        }
    }

    // ==================== COUNTER OPERATIONS ====================

    /**
     * Increment counter
     */
    static async incr(key: string, ttl = 60): Promise<number> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const value = await withTimeout(
                    redisClient!.incr(fullKey),
                    COMMAND_TIMEOUT_MS,
                    `incr:${key}`
                );
                if (value === 1 && ttl > 0) {
                    await withTimeout(
                        redisClient!.expire(fullKey, ttl),
                        COMMAND_TIMEOUT_MS,
                        `expire:${key}`
                    );
                }
                LoggerUtil.debug('Cache incremented (Redis)', { key, value });
                return value;
            } else {
                const cached = memoryCache.get(fullKey);
                let value = 1;

                if (cached) {
                    if (cached.expiresAt && Date.now() > cached.expiresAt) {
                        value = 1;
                    } else {
                        value = parseInt(cached.value) + 1;
                    }
                }

                memoryCache.set(fullKey, {
                    value: String(value),
                    expiresAt: ttl > 0 ? Date.now() + (ttl * 1000) : null,
                });

                LoggerUtil.debug('Cache incremented (memory)', { key, value });
                return value;
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Cache increment failed', { error: (error as Error).message, key });
            return 0;
        }
    }

    /**
     * Decrement counter
     */
    static async decr(key: string): Promise<number> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const value = await withTimeout(
                    redisClient!.decr(fullKey),
                    COMMAND_TIMEOUT_MS,
                    `decr:${key}`
                );
                LoggerUtil.debug('Cache decremented (Redis)', { key, value });
                return value;
            } else {
                const cached = memoryCache.get(fullKey);
                let value = -1;

                if (cached && (!cached.expiresAt || Date.now() <= cached.expiresAt)) {
                    value = parseInt(cached.value) - 1;
                }

                memoryCache.set(fullKey, {
                    value: String(value),
                    expiresAt: cached?.expiresAt ?? null,
                });

                LoggerUtil.debug('Cache decremented (memory)', { key, value });
                return value;
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Cache decrement failed', { error: (error as Error).message, key });
            return 0;
        }
    }

    // ==================== BATCH OPERATIONS ====================

    /**
     * Get multiple keys
     */
    static async mget(keys: string[]): Promise<Record<string, any>> {
        try {
            const fullKeys = keys.map(key => `${redisConfig.keyPrefix}${key}`);
            const result: Record<string, any> = {};

            if (this.isConnected()) {
                const values = await withTimeout(
                    redisClient!.mGet(fullKeys),
                    COMMAND_TIMEOUT_MS,
                    'mget'
                );
                keys.forEach((key, index) => {
                    if (values[index]) {
                        try {
                            result[key] = JSON.parse(values[index] as string);
                        } catch {
                            result[key] = values[index];
                        }
                    } else {
                        result[key] = null;
                    }
                });
                LoggerUtil.debug('Cache mget (Redis)', { count: keys.length });
            } else {
                keys.forEach((key) => {
                    const cached = memoryCache.get(`${redisConfig.keyPrefix}${key}`);
                    if (cached && (!cached.expiresAt || Date.now() <= cached.expiresAt)) {
                        try {
                            result[key] = JSON.parse(cached.value);
                        } catch {
                            result[key] = cached.value;
                        }
                    } else {
                        result[key] = null;
                    }
                });
                LoggerUtil.debug('Cache mget (memory)', { count: keys.length });
            }

            return result;
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Cache mget failed', { error: (error as Error).message, count: keys.length });
            return {};
        }
    }

    /**
     * Set multiple keys
     */
    static async mset(keyValuePairs: Record<string, any>, ttl = 3600): Promise<boolean> {
        try {
            const keys = Object.keys(keyValuePairs);

            if (this.isConnected()) {
                const promises = keys.map(key => {
                    const fullKey = `${redisConfig.keyPrefix}${key}`;
                    const value = typeof keyValuePairs[key] === 'string'
                        ? keyValuePairs[key]
                        : JSON.stringify(keyValuePairs[key]);

                    if (ttl > 0) {
                        return (redisClient as RedisClientType).setEx(fullKey, ttl, value);
                    } else {
                        return (redisClient as RedisClientType).set(fullKey, value);
                    }
                });

                await withTimeout(Promise.all(promises), COMMAND_TIMEOUT_MS, 'mset');
                LoggerUtil.debug('Cache mset (Redis)', { count: keys.length, ttl });
                return true;
            } else {
                keys.forEach(key => {
                    const fullKey = `${redisConfig.keyPrefix}${key}`;
                    const value = typeof keyValuePairs[key] === 'string'
                        ? keyValuePairs[key]
                        : JSON.stringify(keyValuePairs[key]);

                    memoryCache.set(fullKey, {
                        value,
                        expiresAt: ttl > 0 ? Date.now() + (ttl * 1000) : null,
                    });
                });

                LoggerUtil.debug('Cache mset (memory)', { count: keys.length, ttl });
                return true;
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Cache mset failed', { error: (error as Error).message });
            return false;
        }
    }

    /**
     * Disconnect Redis client (alias for shutdown)
     */
    static async disconnect(): Promise<void> {
        await this.shutdown();
    }

    /**
     * Get Redis cluster client instance (use with caution)
     */
    static getClient(): RedisClientType {
        if (!this.isConnected() || !redisClient) {
            throw new Error('Redis client not available - use CacheUtil methods instead');
        }
        return redisClient as RedisClientType;
    }

    // ==================== PIPELINE ====================

    /**
     * Create a pipeline for batch operations
     */
    static pipeline(): {
        incr: (key: string) => void;
        get: (key: string) => void;
        del: (key: string) => void;
        set: (key: string, value: any, ttl?: number) => void;
        exec: () => Promise<any[]>;
        commands: Array<{ method: string; args: any[] }>;
    } {
        const commands: Array<{ method: string; args: any[] }> = [];

        return {
            incr: (key: string) => {
                commands.push({ method: 'incr', args: [key] });
            },
            get: (key: string) => {
                commands.push({ method: 'get', args: [key] });
            },
            del: (key: string) => {
                commands.push({ method: 'del', args: [key] });
            },
            set: (key: string, value: any, ttl?: number) => {
                commands.push({ method: 'set', args: [key, value, ttl] });
            },
            exec: async () => {
                if (CacheUtil.isConnected()) {
                    const promises = commands.map(cmd => {
                        const fullKey = `${redisConfig.keyPrefix}${cmd.args[0]}`;
                        const client = redisClient as RedisClientType;

                        switch (cmd.method) {
                            case 'incr':
                                return client.incr(fullKey);
                            case 'get':
                                return client.get(fullKey);
                            case 'del':
                                return client.del(fullKey);
                            case 'set': {
                                const value = typeof cmd.args[1] === 'string'
                                    ? cmd.args[1]
                                    : JSON.stringify(cmd.args[1]);
                                const ttl = cmd.args[2];
                                if (ttl && ttl > 0) {
                                    return client.setEx(fullKey, ttl, value);
                                } else {
                                    return client.set(fullKey, value);
                                }
                            }
                            default:
                                return Promise.resolve(null);
                        }
                    });

                    return await withTimeout(Promise.all(promises), COMMAND_TIMEOUT_MS, 'pipeline');
                } else {
                    const results = [];
                    for (const cmd of commands) {
                        const key = cmd.args[0];
                        switch (cmd.method) {
                            case 'incr':
                                results.push(await CacheUtil.incr(key));
                                break;
                            case 'get':
                                results.push(await CacheUtil.get(key));
                                break;
                            case 'del':
                                results.push(await CacheUtil.del(key));
                                break;
                            case 'set':
                                results.push(await CacheUtil.set(key, cmd.args[1], cmd.args[2]));
                                break;
                        }
                    }
                    return results;
                }
            },
            commands
        };
    }

    // ==================== PATTERN OPERATIONS ====================

    /**
     * Clear keys by pattern
     * NOTE: In Redis Cluster, SCAN runs per-node internally via the cluster client.
     */
    static async clearByPattern(pattern: string): Promise<number> {
        try {
            const fullPattern = `${redisConfig.keyPrefix}${pattern}`;

            if (this.isConnected()) {
                const keys = await this._scanKeys(fullPattern);
                if (keys.length === 0) {
                    LoggerUtil.debug('Cache clear: no keys found', { pattern });
                    return 0;
                }

                const batchSize = 100;
                let deleted = 0;

                for (let i = 0; i < keys.length; i += batchSize) {
                    const batch = keys.slice(i, i + batchSize);
                    for (const k of batch) {
                        const r = await withTimeout(redisClient!.del(k), COMMAND_TIMEOUT_MS, `del:${k}`);
                        deleted += r;
                    }
                }

                LoggerUtil.info('Cache cleared (Redis)', { pattern, deleted });
                return deleted;
            } else {
                const regex = new RegExp(
                    fullPattern.replace(/\*/g, '.*').replace(/\?/g, '.')
                );

                let deleted = 0;
                for (const key of memoryCache.keys()) {
                    if (regex.test(key)) {
                        memoryCache.delete(key);
                        deleted++;
                    }
                }

                LoggerUtil.info('Cache cleared (memory)', { pattern, deleted });
                return deleted;
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Cache clear failed', { error: (error as Error).message, pattern });
            return 0;
        }
    }

    /**
     * Scan Redis cluster keys by pattern
     * Uses cluster-aware scan (scans all master nodes)
     * @private
     */
    private static async _scanKeys(pattern: string): Promise<string[]> {
        const keys: string[] = [];

        try {
            let cursor: any = '0';
            do {
                const reply = await withTimeout(
                    redisClient!.scan(cursor, { MATCH: pattern, COUNT: 100 }),
                    COMMAND_TIMEOUT_MS,
                    'scan'
                );
                cursor = reply.cursor;
                keys.push(...reply.keys);
            } while (cursor !== '0' && cursor !== 0);
        } catch (error: unknown) {
            LoggerUtil.error('Scan failed', { error: (error as Error).message, pattern });
        }

        return keys;
    }

    // ==================== STATISTICS & MONITORING ====================

    /**
     * Get cache statistics
     */
    static async getStats(): Promise<any> {
        try {
            if (this.isConnected()) {
                return {
                    connected: true,
                    type: 'redis',
                    host: redisConfig.host,
                    port: redisConfig.port,
                    timestamp: new Date().toISOString(),
                };
            } else {
                return {
                    connected: false,
                    type: 'memory',
                    size: memoryCache.size,
                    timestamp: new Date().toISOString(),
                };
            }
        } catch (error: unknown) {
            LoggerUtil.error('Cache stats failed', { error: (error as Error).message });
            return {
                connected: false,
                error: (error as Error).message,
                timestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * Health check
     */
    static async healthCheck(): Promise<any> {
        try {
            if (this.isConnected()) {
                const start = Date.now();
                await withTimeout(redisClient!.ping(), COMMAND_TIMEOUT_MS, 'healthcheck-ping');
                const latency = Date.now() - start;

                return {
                    status: 'healthy',
                    connected: true,
                    type: 'redis',
                    host: redisConfig.host,
                    port: redisConfig.port,
                    latency,
                    timestamp: new Date().toISOString(),
                };
            } else {
                return {
                    status: useRedis ? 'unhealthy' : 'fallback',
                    connected: false,
                    type: 'memory',
                    message: useRedis
                        ? 'Redis not connected'
                        : 'Running in fallback mode',
                    timestamp: new Date().toISOString(),
                };
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Cache health check failed', { error: (error as Error).message });
            return {
                status: 'unhealthy',
                connected: false,
                error: (error as Error).message,
                timestamp: new Date().toISOString(),
            };
        }
    }

    // ==================== SHUTDOWN ====================

    /**
     * Graceful shutdown
     */
    static async shutdown(): Promise<void> {
        try {
            if (this.isConnected()) {
                LoggerUtil.info('Shutting down Redis client...');
                await redisClient!.quit();
                LoggerUtil.info('✅ Redis client disconnected');
            } else {
                LoggerUtil.info('Clearing in-memory cache...');
                memoryCache.clear();
                LoggerUtil.info('✅ In-memory cache cleared');
            }
        } catch (error: unknown) {
            LoggerUtil.error('Cache shutdown failed', { error: (error as Error).message });
        }
    }

    // ==================== TTL / EXPIRY ====================

    /**
     * Set expiration time for a key
     */
    static async expire(key: string, ttl: number): Promise<boolean> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const result = await withTimeout(
                    redisClient!.expire(fullKey, ttl),
                    COMMAND_TIMEOUT_MS,
                    `expire:${key}`
                );
                LoggerUtil.debug('Expiration set (Redis)', { key, ttl, success: result });
                return Boolean(result);
            } else {
                const cached = memoryCache.get(fullKey);
                if (!cached) {
                    LoggerUtil.debug('Key not found for expiration (memory)', { key });
                    return false;
                }

                memoryCache.set(fullKey, {
                    value: cached.value,
                    expiresAt: Date.now() + (ttl * 1000),
                });

                LoggerUtil.debug('Expiration set (memory)', { key, ttl });
                return true;
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Set expiration failed', { error: (error as Error).message, key, ttl });
            return false;
        }
    }

    // ==================== SET OPERATIONS ====================

    /**
     * Add item to a Redis Set
     */
    static async add(key: string, itemId: string, ttl?: number): Promise<boolean> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const added = await withTimeout(
                    redisClient!.sAdd(fullKey, itemId),
                    COMMAND_TIMEOUT_MS,
                    `sadd:${key}`
                );

                if (ttl && ttl > 0) {
                    const exists = await withTimeout(
                        redisClient!.exists(fullKey),
                        COMMAND_TIMEOUT_MS,
                        `exists:${key}`
                    );
                    if (exists === 1) {
                        await withTimeout(
                            redisClient!.expire(fullKey, ttl),
                            COMMAND_TIMEOUT_MS,
                            `expire:${key}`
                        );
                    }
                }

                LoggerUtil.debug('Item added to set (Redis)', { key, itemId, added: added > 0 });
                return added > 0;
            } else {
                const cached = memoryCache.get(fullKey);
                let items: string[] = [];

                if (cached && (!cached.expiresAt || Date.now() <= cached.expiresAt)) {
                    try {
                        items = JSON.parse(cached.value);
                        if (!Array.isArray(items)) items = [];
                    } catch {
                        items = [];
                    }
                }

                if (items.includes(itemId)) {
                    LoggerUtil.debug('Item already in set (memory)', { key, itemId });
                    return false;
                }

                items.push(itemId);
                memoryCache.set(fullKey, {
                    value: JSON.stringify(items),
                    expiresAt: ttl && ttl > 0 ? Date.now() + (ttl * 1000) : (cached?.expiresAt ?? null),
                });

                LoggerUtil.debug('Item added to set (memory)', { key, itemId });
                return true;
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Add to set failed', { error: (error as Error).message, key, itemId });
            return false;
        }
    }

    /**
     * Remove item from a Redis Set
     */
    static async remove(key: string, itemId: string): Promise<boolean> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const removed = await withTimeout(
                    redisClient!.sRem(fullKey, itemId),
                    COMMAND_TIMEOUT_MS,
                    `srem:${key}`
                );
                LoggerUtil.debug('Item removed from set (Redis)', { key, itemId, removed: removed > 0 });
                return removed > 0;
            } else {
                const cached = memoryCache.get(fullKey);
                if (!cached || (cached.expiresAt && Date.now() > cached.expiresAt)) {
                    return false;
                }

                try {
                    let items: string[] = JSON.parse(cached.value);
                    if (!Array.isArray(items)) return false;

                    const index = items.indexOf(itemId);
                    if (index === -1) return false;

                    items.splice(index, 1);
                    memoryCache.set(fullKey, { value: JSON.stringify(items), expiresAt: cached.expiresAt });
                    return true;
                } catch {
                    return false;
                }
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Remove from set failed', { error: (error as Error).message, key, itemId });
            return false;
        }
    }

    /**
     * Get all items from a Redis Set
     */
    static async getAll(key: string): Promise<string[]> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const items = await withTimeout(
                    redisClient!.sMembers(fullKey),
                    COMMAND_TIMEOUT_MS,
                    `smembers:${key}`
                );
                LoggerUtil.debug('Retrieved all items from set (Redis)', { key, count: items.length });
                return items;
            } else {
                const cached = memoryCache.get(fullKey);
                if (!cached || (cached.expiresAt && Date.now() > cached.expiresAt)) return [];

                try {
                    const items = JSON.parse(cached.value);
                    return Array.isArray(items) ? items : [];
                } catch {
                    return [];
                }
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Get all from set failed', { error: (error as Error).message, key });
            return [];
        }
    }

    /**
     * Scan keys by pattern
     */
    static async scan(
        cursor: string,
        pattern: string,
        count: number = 100
    ): Promise<[string, string[]]> {
        try {
            const fullPattern = `${redisConfig.keyPrefix}${pattern}`;

            if (this.isConnected()) {
                const keys: string[] = [];
                let fetched = 0;

                let scanCursor = '0';
                do {
                    const reply = await withTimeout(
                        redisClient!.scan(scanCursor, { MATCH: fullPattern, COUNT: count }),
                        COMMAND_TIMEOUT_MS,
                        'scan'
                    );
                    scanCursor = reply.cursor;
                    for (const key of reply.keys) {
                        keys.push(key.replace(redisConfig.keyPrefix, ''));
                        fetched++;
                        if (fetched >= count) break;
                    }
                } while (scanCursor !== '0' && fetched < count);

                LoggerUtil.debug('Scanned keys (Redis)', { pattern, found: keys.length });
                return [String(scanCursor), keys];
            } else {
                const regex = new RegExp(
                    fullPattern.replace(/\*/g, '.*').replace(/\?/g, '.')
                );

                const matchedKeys: string[] = [];
                for (const key of memoryCache.keys()) {
                    if (regex.test(key)) {
                        matchedKeys.push(key.replace(redisConfig.keyPrefix, ''));
                    }
                }

                const start = cursor === '0' ? 0 : parseInt(cursor);
                const end = Math.min(start + count, matchedKeys.length);
                const pageKeys = matchedKeys.slice(start, end);
                const nextCursor = end >= matchedKeys.length ? '0' : String(end);

                return [nextCursor, pageKeys];
            }
        } catch (error: any) {
            if (error.message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Scan keys failed', { error: error.message, cursor, pattern });
            return ['0', []];
        }
    }

    /**
     * Check if item exists in set
     */
    static async isMember(key: string, itemId: string): Promise<boolean> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const result = await withTimeout(
                    redisClient!.sIsMember(fullKey, itemId),
                    COMMAND_TIMEOUT_MS,
                    `sismember:${key}`
                );
                LoggerUtil.debug('Check set membership (Redis)', { key, itemId, isMember: result });
                return result as unknown as boolean;
            } else {
                const cached = memoryCache.get(fullKey);
                if (!cached || (cached.expiresAt && Date.now() > cached.expiresAt)) return false;

                try {
                    const items: string[] = JSON.parse(cached.value);
                    return Array.isArray(items) ? items.includes(itemId) : false;
                } catch {
                    return false;
                }
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Check set membership failed', { error: (error as Error).message, key, itemId });
            return false;
        }
    }

    /**
     * Get count of items in set
     */
    static async count(key: string): Promise<number> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const count = await withTimeout(
                    redisClient!.sCard(fullKey),
                    COMMAND_TIMEOUT_MS,
                    `scard:${key}`
                );
                LoggerUtil.debug('Get set count (Redis)', { key, count });
                return count;
            } else {
                const cached = memoryCache.get(fullKey);
                if (!cached || (cached.expiresAt && Date.now() > cached.expiresAt)) return 0;

                try {
                    const items: string[] = JSON.parse(cached.value);
                    return Array.isArray(items) ? items.length : 0;
                } catch {
                    return 0;
                }
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Get set count failed', { error: (error as Error).message, key });
            return 0;
        }
    }

    /**
     * Add multiple items to a set at once
     */
    static async addMultiple(key: string, itemIds: string[], ttl?: number): Promise<number> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const added = await withTimeout(
                    redisClient!.sAdd(fullKey, itemIds),
                    COMMAND_TIMEOUT_MS,
                    `sadd:${key}`
                );
                if (ttl && ttl > 0) {
                    await withTimeout(
                        redisClient!.expire(fullKey, ttl),
                        COMMAND_TIMEOUT_MS,
                        `expire:${key}`
                    );
                }
                LoggerUtil.debug('Multiple items added to set (Redis)', { key, count: itemIds.length, added });
                return added;
            } else {
                const cached = memoryCache.get(fullKey);
                let items: string[] = [];

                if (cached && (!cached.expiresAt || Date.now() <= cached.expiresAt)) {
                    try {
                        items = JSON.parse(cached.value);
                        if (!Array.isArray(items)) items = [];
                    } catch {
                        items = [];
                    }
                }

                let added = 0;
                for (const itemId of itemIds) {
                    if (!items.includes(itemId)) {
                        items.push(itemId);
                        added++;
                    }
                }

                memoryCache.set(fullKey, {
                    value: JSON.stringify(items),
                    expiresAt: ttl && ttl > 0 ? Date.now() + (ttl * 1000) : (cached?.expiresAt ?? null),
                });

                LoggerUtil.debug('Multiple items added to set (memory)', { key, count: itemIds.length, added });
                return added;
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Add multiple to set failed', { error: (error as Error).message, key });
            return 0;
        }
    }

    /**
     * Remove multiple items from a set at once
     */
    static async removeMultiple(key: string, itemIds: string[]): Promise<number> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const removed = await withTimeout(
                    redisClient!.sRem(fullKey, itemIds),
                    COMMAND_TIMEOUT_MS,
                    `srem:${key}`
                );
                LoggerUtil.debug('Multiple items removed from set (Redis)', { key, count: itemIds.length, removed });
                return removed;
            } else {
                const cached = memoryCache.get(fullKey);
                if (!cached || (cached.expiresAt && Date.now() > cached.expiresAt)) return 0;

                try {
                    let items: string[] = JSON.parse(cached.value);
                    if (!Array.isArray(items)) return 0;

                    const initialLength = items.length;
                    items = items.filter(item => !itemIds.includes(item));
                    const removed = initialLength - items.length;

                    memoryCache.set(fullKey, { value: JSON.stringify(items), expiresAt: cached.expiresAt });
                    return removed;
                } catch {
                    return 0;
                }
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('Remove multiple from set failed', { error: (error as Error).message, key });
            return 0;
        }
    }

    // ==================== LIST OPERATIONS ====================

    /**
     * Push item to the head of a list
     */
    static async lpush(key: string, value: any): Promise<number> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;
            const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

            if (this.isConnected()) {
                const length = await withTimeout(
                    redisClient!.lPush(fullKey, serializedValue),
                    COMMAND_TIMEOUT_MS,
                    `lpush:${key}`
                );
                LoggerUtil.debug('List push (Redis)', { key, length });
                return length;
            } else {
                const cached = memoryCache.get(fullKey);
                let list: string[] = [];

                if (cached && (!cached.expiresAt || Date.now() <= cached.expiresAt)) {
                    try {
                        list = JSON.parse(cached.value);
                        if (!Array.isArray(list)) list = [];
                    } catch {
                        list = [];
                    }
                }

                list.unshift(serializedValue);
                memoryCache.set(fullKey, { value: JSON.stringify(list), expiresAt: cached?.expiresAt ?? null });

                LoggerUtil.debug('List push (memory)', { key, length: list.length });
                return list.length;
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('List push failed', { error: (error as Error).message, key });
            return 0;
        }
    }

    /**
     * Trim list to specified range
     */
    static async ltrim(key: string, start: number, stop: number): Promise<boolean> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                await withTimeout(
                    redisClient!.lTrim(fullKey, start, stop),
                    COMMAND_TIMEOUT_MS,
                    `ltrim:${key}`
                );
                LoggerUtil.debug('List trimmed (Redis)', { key, start, stop });
                return true;
            } else {
                const cached = memoryCache.get(fullKey);
                if (!cached || (cached.expiresAt && Date.now() > cached.expiresAt)) return false;

                try {
                    let list: string[] = JSON.parse(cached.value);
                    if (!Array.isArray(list)) return false;

                    const end = stop === -1 ? list.length : stop + 1;
                    list = list.slice(start, end);
                    memoryCache.set(fullKey, { value: JSON.stringify(list), expiresAt: cached.expiresAt });

                    LoggerUtil.debug('List trimmed (memory)', { key, start, stop });
                    return true;
                } catch {
                    return false;
                }
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('List trim failed', { error: (error as Error).message, key });
            return false;
        }
    }

    /**
     * Get range of items from list
     */
    static async lRange(key: string, start: number, stop: number): Promise<any[]> {
        try {
            const fullKey = `${redisConfig.keyPrefix}${key}`;

            if (this.isConnected()) {
                const items = await withTimeout(
                    redisClient!.lRange(fullKey, start, stop),
                    COMMAND_TIMEOUT_MS,
                    `lrange:${key}`
                );
                const parsed = items.map((item: string) => {
                    try { return JSON.parse(item); } catch { return item; }
                });
                LoggerUtil.debug('List range retrieved (Redis)', { key, start, stop, count: parsed.length });
                return parsed;
            } else {
                const cached = memoryCache.get(fullKey);
                if (!cached || (cached.expiresAt && Date.now() > cached.expiresAt)) return [];

                try {
                    let list: string[] = JSON.parse(cached.value);
                    if (!Array.isArray(list)) return [];

                    const end = stop === -1 ? list.length : stop + 1;
                    const range = list.slice(start, end);

                    const parsed = range.map(item => {
                        try { return JSON.parse(item); } catch { return item; }
                    });

                    LoggerUtil.debug('List range retrieved (memory)', { key, start, stop, count: parsed.length });
                    return parsed;
                } catch {
                    return [];
                }
            }
        } catch (error: unknown) {
            if ((error as Error).message?.includes('timed out')) {
                isConnected = false;
            }
            LoggerUtil.error('List range failed', { error: (error as Error).message, key });
            return [];
        }
    }
}

// ==================== HELPER FUNCTIONS ====================

export const initializeRedisClient = async (): Promise<boolean> => {
    return await CacheUtil.init();
};

export const getRedisClient = (): RedisClientType => {
    return CacheUtil.getClient();
};

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGTERM', async () => {
    await CacheUtil.shutdown();
});

process.on('SIGINT', async () => {
    await CacheUtil.shutdown();
});

// ==================== EXPORT ====================

export default CacheUtil;