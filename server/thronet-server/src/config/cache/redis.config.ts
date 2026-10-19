// src/config/cache/redis.config.ts
import Redis, { Cluster, ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';
import { logger } from "@/shared/logger.util";

interface RedisStandaloneConfig {
    clusterMode: false;
    options: RedisOptions;
}

interface RedisClusterConfig {
    clusterMode: true;
    nodes: ClusterNode[];
    options: ClusterOptions;
}

export type RedisConfig = RedisStandaloneConfig | RedisClusterConfig;

class RedisConfigManager {
    private static instance: RedisConfigManager;
    private redisConfig: RedisConfig;

    // ✅ NAYA — singleton ioredis client instance (lazy-created)
    private client: Redis | Cluster | null = null;
    private connectingPromise: Promise<Redis | Cluster> | null = null;

    private constructor() {
        this.redisConfig = this.initializeConfig();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): RedisConfigManager {
        if (!RedisConfigManager.instance) {
            RedisConfigManager.instance = new RedisConfigManager();
        }
        return RedisConfigManager.instance;
    }

    /**
     * Initialize Redis cluster configuration
     */
    private initializeConfig(): RedisConfig {
        const isProduction = process.env.NODE_ENV === 'production';
        const clusterMode = process.env.REDIS_CLUSTER_MODE === 'true';
        const nodes = (process.env.REDIS_CLUSTER_NODES || 'redis-node-1:7001,redis-node-2:7002,redis-node-3:7003')
            .split(',')
            .map((node) => {
                const [host, port] = node.trim().split(':');
                return { host, port: parseInt(port || '6379') };
            });

        let host = process.env.REDIS_HOST || 'localhost';
        let port = parseInt(process.env.REDIS_PORT || '6379');
        let username = process.env.REDIS_USERNAME || process.env.REDIS_USER || undefined;
        let password = process.env.REDIS_PASSWORD || undefined;
        let db = parseInt(process.env.REDIS_DB || '0');
        let tls: Record<string, any> | undefined = undefined;

        const rawUrl = process.env.REDIS_URL;
        if (rawUrl && !rawUrl.includes('${')) {
            try {
                const parsed = new URL(rawUrl);
                if (parsed.protocol === 'rediss:') tls = {};
                if (parsed.hostname) host = parsed.hostname;
                if (parsed.port) port = parseInt(parsed.port, 10);
                if (parsed.username) username = decodeURIComponent(parsed.username);
                if (parsed.password) password = decodeURIComponent(parsed.password);
                if (parsed.pathname && parsed.pathname.length > 1) {
                    const parsedDb = parseInt(parsed.pathname.slice(1), 10);
                    if (!isNaN(parsedDb)) db = parsedDb;
                }
            } catch {}
        }

        if (process.env.REDIS_TLS === 'true') {
            tls = {};
        }

        const family = process.env.REDIS_FAMILY !== undefined ? parseInt(process.env.REDIS_FAMILY, 10) : 0;

        const redisOptions: RedisOptions = {
            host,
            port,
            ...(username ? { username } : {}),
            password,
            db,
            family,
            ...(tls ? { tls } : {}),
            // ==================== CONNECTION SETTINGS ====================
            enableReadyCheck: true,
            enableOfflineQueue: true,
            lazyConnect: false,

            // Timeouts
            connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT || process.env.REDIS_CONNECT_TIMEOUT_MS || '60000'),
            commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || process.env.REDIS_COMMAND_TIMEOUT_MS || '30000'),
            keepAlive: 30000,

            maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3'),

            // ==================== RETRY STRATEGY ====================
            retryStrategy: (times: number) => {
                const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES || '10');
                if (times > maxRetries) {
                    logger.error('❌ [REDIS] Max retry attempts reached', { attempts: times });
                    return null; // Stop retrying
                }
                const delay = Math.min(times * 200, 3000);
                logger.warn('🔄 [REDIS] Retrying connection', {
                    attempt: times,
                    delay: `${delay}ms`,
                    timestamp: new Date().toISOString()
                });
                return delay;
            },

            reconnectOnError: (err: Error) => {
                const targetError = 'READONLY';
                return err.message.includes(targetError);
            },

            // Network settings
            // family: 4, // Commented out to support both IPv4 (local) and IPv6 (Railway internal network)
            noDelay: true,
            enableAutoPipelining: true,

            // Connection name for monitoring
            connectionName: `profile-service-${process.env.NODE_ENV || 'dev'}-${process.pid}`,

            // Auto-reconnect
            autoResubscribe: true,
            autoResendUnfulfilledCommands: true,

            // Debugging
            showFriendlyErrorStack: !isProduction,
        };

        const clusterOptions: ClusterOptions = {
            redisOptions,
            clusterRetryStrategy: (times: number) => {
                const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES || '10');
                if (times > maxRetries) {
                    logger.error('❌ [REDIS] Max cluster retry attempts reached', { attempts: times });
                    return null;
                }
                return Math.min(times * 200, 3000);
            },
        };

        const standaloneOptions: RedisOptions = {
            ...redisOptions,
            host: redisOptions.host,
            port: redisOptions.port,
        };

        logger.info(`⚙️ [REDIS CONFIG] ${clusterMode ? 'Cluster' : 'standalone'} configuration initialized`, {
            nodes: clusterMode ? nodes : undefined,
            host: clusterMode ? undefined : standaloneOptions.host,
            port: clusterMode ? undefined : standaloneOptions.port,
            environment: process.env.NODE_ENV,
            autoPipelining: true,
            timestamp: new Date().toISOString()
        });

        return clusterMode
            ? { clusterMode: true, nodes, options: clusterOptions }
            : { clusterMode: false, options: standaloneOptions };
    }

    /**
    * Get (or lazily create) the singleton ioredis cluster client.
     * Concurrent calls ke dauraan multiple clients ban jaane se bachne ke
     * liye `connectingPromise` use kiya hai — jab tak connect ho raha hai,
     * baaki callers usi promise ko await karenge instead of spawning a new one.
     */
    public async getRedisClient(): Promise<Redis | Cluster> {
        // Already connected/ready client hai to seedha return karo
        if (this.client && (this.client.status === 'ready' || this.client.status === 'connect')) {
            return this.client;
        }

        // Connection already in-progress hai to usi promise ko await karo
        if (this.connectingPromise) {
            return this.connectingPromise;
        }

        this.connectingPromise = new Promise<Redis | Cluster>((resolve, reject) => {
            try {
                const client = this.redisConfig.clusterMode
                    ? new Redis.Cluster(this.redisConfig.nodes, this.redisConfig.options)
                    : new Redis(this.redisConfig.options);

                client.on('connect', () => {
                    logger.info('✅ [REDIS] Client connecting...', {
                        nodes: this.redisConfig.clusterMode ? this.redisConfig.nodes : undefined,
                    });
                });

                client.on('ready', () => {
                    logger.info('✅ [REDIS] Client ready');
                    this.connectingPromise = null;
                    resolve(client);
                });

                client.on('error', (err: Error) => {
                    logger.error('❌ [REDIS] Client error', { error: err.message });
                    // Pehli baar ready hone se pehle error aaye to promise reject karo,
                    // uske baad ke errors sirf log honge (retryStrategy sambhal lega)
                    if (this.connectingPromise) {
                        this.connectingPromise = null;
                        reject(err);
                    }
                });

                client.on('close', () => {
                    logger.warn('⚠️ [REDIS] Connection closed');
                });

                client.on('reconnecting', (delay: number) => {
                    logger.warn('🔄 [REDIS] Reconnecting', { delay });
                });

                this.client = client;
            } catch (error: any) {
                logger.error('❌ [REDIS] Failed to initialize client', { error: error.message });
                this.connectingPromise = null;
                reject(error);
            }
        });

        return this.connectingPromise;
    }

    /**
     * ✅ NAYA — Graceful shutdown ke liye (app.ts / worker.ts se call karo)
     */
    public async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.quit();
            this.client = null;
            logger.info('✅ [REDIS] Client disconnected gracefully');
        }
    }

    /**
     * Check Redis connection health
     */
    public async checkHealth(): Promise<{ status: string; latency?: number; connected: boolean; healthyConnections: number }> {
        try {
            const client = await this.getRedisClient();
            const start = Date.now();
            await client.ping();
            return { status: 'healthy', latency: Date.now() - start, connected: true, healthyConnections: 1 };
        } catch {
            return { status: 'unhealthy', connected: false, healthyConnections: 0 };
        }
    }

    /**
     * Get connection configuration
     */
    public getConfig(): RedisConfig {
        return this.redisConfig;
    }

    /**
     * Get cache TTL settings
     */
    public getCacheTTL() {
        return {
            default: parseInt(process.env.REDIS_DEFAULT_TTL || '3600'),
            short: parseInt(process.env.REDIS_SHORT_TTL || '300'),
            medium: parseInt(process.env.REDIS_MEDIUM_TTL || '1800'),
            long: parseInt(process.env.REDIS_LONG_TTL || '7200'),
            veryLong: parseInt(process.env.REDIS_VERY_LONG_TTL || '86400'),

            userProfile: parseInt(process.env.REDIS_USER_PROFILE_TTL || '7200'),
            userPhoto: parseInt(process.env.REDIS_USER_PHOTO_TTL || '3600'),
            photoMetadata: parseInt(process.env.REDIS_PHOTO_METADATA_TTL || '1800'),

            analytics: parseInt(process.env.REDIS_ANALYTICS_TTL || '300'),
            userStats: parseInt(process.env.REDIS_USER_STATS_TTL || '600'),

            rateLimit: parseInt(process.env.REDIS_RATE_LIMIT_TTL || '60'),
            session: parseInt(process.env.REDIS_SESSION_TTL || '86400'),
            authToken: parseInt(process.env.REDIS_AUTH_TOKEN_TTL || '3600'),

            queryCache: parseInt(process.env.REDIS_QUERY_CACHE_TTL || '600'),
            listCache: parseInt(process.env.REDIS_LIST_CACHE_TTL || '300'),

            leaderboard: parseInt(process.env.REDIS_LEADERBOARD_TTL || '1800'),
            leaderboardGroup: parseInt(process.env.REDIS_LEADERBOARD_GROUP_TTL || '300'),
            userRank: parseInt(process.env.REDIS_USER_RANK_TTL || '300'),
            groupDetails: parseInt(process.env.REDIS_GROUP_DETAILS_TTL || '300'),
            groupList: parseInt(process.env.REDIS_GROUP_LIST_TTL || '60'),
            groupMembers: parseInt(process.env.REDIS_GROUP_MEMBERS_TTL || '60'),
            analyticsDaily: parseInt(process.env.REDIS_ANALYTICS_DAILY_TTL || '86400'),
            analyticsWeekly: parseInt(process.env.REDIS_ANALYTICS_WEEKLY_TTL || '86400'),
            userDashboard: parseInt(process.env.REDIS_USER_DASHBOARD_TTL || '60'),
        };
    }

    /**
     * Get cache key prefixes (versioned for invalidation)
     */
    public getKeyPrefixes() {
        const version = process.env.CACHE_VERSION || 'v1';
        return {
            user: `user:${version}`,
            userProfile: `user-profile:${version}`,
            userPhoto: `user-photo:${version}`,

            photo: `photo:${version}`,
            photoMetadata: `photo-meta:${version}`,
            photoList: `photo-list:${version}`,

            analytics: `analytics:${version}`,
            userStats: `user-stats:${version}`,

            rateLimit: `ratelimit:${version}`,
            session: `session:${version}`,
            authToken: `auth:${version}`,

            cache: `cache:${version}`,
            query: `query:${version}`,

            jobStats: `job:stats:${version}`,
            companyStats: `company:stats:${version}`,
            appStats: `application:stats:${version}`,

            flushLock: `flush:lock:${version}`,
            flushProgress: `flush:progress:${version}`,

            leaderboardGlobal: `leaderboard:global:${version}`,
            leaderboardCategory: `leaderboard:category:${version}`,
            leaderboardGroup: `leaderboard:group:${version}`,
            leaderboardWeekly: `leaderboard:weekly:${version}`,
            leaderboardMonthly: `leaderboard:monthly:${version}`,
            userRank: `rank:user:${version}`,
            groupRank: `rank:group:${version}`,
            groupList: `groups:list:${version}`,
            groupDetails: `group:details:${version}`,
            groupMembers: `group:members:${version}`,
            groupSearch: `groups:search:${version}`,
            userDashboard: `user:dashboard:${version}`,
            analyticsDaily: `analytics:daily:${version}`,
            analyticsWeekly: `analytics:weekly:${version}`,
            analyticsMonthly: `analytics:monthly:${version}`,
            trendingGroups: `groups:trending:${version}`,
            activeUsers: `users:active:count:${version}`,
            totalStudyHours: `stats:total:hours:${version}`,
        };
    }

    /**
     * Get connection pool settings
     */
    public getConnectionPoolSettings() {
        return {
            minConnections: parseInt(process.env.REDIS_MIN_CONNECTIONS || '10'),
            maxConnections: parseInt(process.env.REDIS_MAX_CONNECTIONS || '500'),
            idleTimeoutMillis: parseInt(process.env.REDIS_IDLE_TIMEOUT || '30000'),
            acquireTimeoutMillis: parseInt(process.env.REDIS_ACQUIRE_TIMEOUT || '10000')
        };
    }

    /**
     * Get memory management settings
     */
    public getMemorySettings() {
        return {
            enableCompression: process.env.REDIS_ENABLE_COMPRESSION === 'true',
            compressionThreshold: parseInt(process.env.REDIS_COMPRESSION_THRESHOLD || '1024'),
            maxValueSize: parseInt(process.env.REDIS_MAX_VALUE_SIZE || '10485760')
        };
    }

    /**
     * Get stats-specific settings
     */
    public getStatsSettings() {
        return {
            statsBufferTTL: parseInt(process.env.REDIS_STATS_TTL || '2592000'),
            flushBatchSize: parseInt(process.env.STATS_FLUSH_BATCH || '1000'),
            flushInterval: process.env.STATS_FLUSH_CRON || '0 */4 * * *',
            maxIncrementsPerMinute: parseInt(process.env.MAX_STATS_INCREMENT || '100'),
            patterns: {
                jobStats: 'job:stats:*:*',
                companyStats: 'company:stats:*:*',
                applicationStats: 'application:stats:*:*',
                leaderboardStats: 'leaderboard:*:*',
                groupStats: 'group:*:*',
                rankStats: 'rank:*:*',
            }
        };
    }

    /**
     * Get health check settings
     */
    public getHealthCheckSettings() {
        return {
            pingInterval: parseInt(process.env.REDIS_PING_INTERVAL || '30000'),
            failureThreshold: parseInt(process.env.REDIS_FAILURE_THRESHOLD || '3'),
            circuitBreakerTimeout: parseInt(process.env.REDIS_CIRCUIT_TIMEOUT || '60000')
        };
    }

    /**
     * Get retry strategy configuration
     */
    public getRetryStrategy() {
        return {
            maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
            retryDelayMs: parseInt(process.env.REDIS_RETRY_DELAY || '200'),
            maxReconnectTime: parseInt(process.env.REDIS_MAX_RECONNECT_TIME || '5000'),
            enableBackoff: process.env.REDIS_ENABLE_BACKOFF !== 'false',
        };
    }

    /**
     * Get connection test settings
     */
    public getConnectionTestSettings() {
        return {
            testOnStartup: process.env.REDIS_TEST_ON_STARTUP !== 'false',
            testTimeout: parseInt(process.env.REDIS_TEST_TIMEOUT || '5000'),
            pingCommand: 'PING',
            expectedResponse: 'PONG',
        };
    }

    /**
     * Get lazy connection settings
     */
    public getLazyConnectionSettings() {
        return {
            enabled: process.env.REDIS_LAZY_CONNECT === 'true',
            autoConnect: process.env.REDIS_AUTO_CONNECT !== 'false',
            connectOnFirstOperation: true,
        };
    }
}

// Export singleton instance
export const redisConfig = RedisConfigManager.getInstance();
export default redisConfig;