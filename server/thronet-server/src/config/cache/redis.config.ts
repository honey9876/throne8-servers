// src/config/cache/redis.config.ts
import { ClusterNode, ClusterOptions } from 'ioredis';
import { logger } from "@/shared/logger.util";

// ==================== REDIS CLUSTER CONFIGURATION     ====================
interface RedisClusterConfig {
    nodes: ClusterNode[];
    options: ClusterOptions;
}

class RedisConfigManager {
    private static instance: RedisConfigManager;
    private clusterConfig: RedisClusterConfig;

    private constructor() {
        this.clusterConfig = this.initializeConfig();
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
     * Initialize Redis Cluster configuration for 500K+ users
     */
    private initializeConfig(): RedisClusterConfig {
        const isProduction = process.env.NODE_ENV === 'production';

        // ==================== CLUSTER NODES ====================
        const nodes: ClusterNode[] = [
            {
                host: process.env.REDIS_HOST || 'redis',
                port: parseInt(process.env.REDIS_PORT || '6379')
            },
            // {
            //     host: process.env.REDIS_NODE_2_HOST || 'redis-node-2',
            //     port: parseInt(process.env.REDIS_NODE_2_PORT || '7002')
            // },
            // {
            //     host: process.env.REDIS_NODE_3_HOST || 'redis-node-3',
            //     port: parseInt(process.env.REDIS_NODE_3_PORT || '7003')
            // }
        ];

        // ==================== PRODUCTION-GRADE OPTIONS ====================
        const options: ClusterOptions = {
            // ==================== CONNECTION SETTINGS ====================
            enableReadyCheck: true,
            enableOfflineQueue: true,

            // ==================== CLUSTER RETRY STRATEGY ====================
            clusterRetryStrategy: (times: number) => {
                if (times > 10) {
                    logger.error('❌ [REDIS] Max retry attempts reached', { attempts: times });
                    return null; // Stop retrying
                }
                const delay = Math.min(times * 200, 3000);
                logger.warn('🔄 [REDIS CLUSTER] Retrying connection', {
                    attempt: times,
                    delay: `${delay}ms`,
                    timestamp: new Date().toISOString()
                });
                return delay;
            },

            // ==================== RECONNECT SETTINGS ====================
            retryDelayOnFailover: 100,
            retryDelayOnClusterDown: 500,
            retryDelayOnTryAgain: 200,
            retryDelayOnMoved: 100,
            maxRedirections: 16,

            // ==================== LOAD BALANCING ====================
            scaleReads: 'all', // Distribute reads across all nodes

            // ==================== CONNECTION POOL (500K USERS) ====================
            redisOptions: {
                // Timeouts (optimized for production)
                connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT || '60000'), // 60s
                commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '10000'), // 10s
                keepAlive: 30000,

                // Connection pool (handles 500K users)
                maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3'),

                // Network settings
                family: 4,
                noDelay: true, // Disable Nagle's algorithm for low latency
                enableAutoPipelining: true, // Auto-pipeline commands


                // autoPipelineIgnoredCommands: ['ping'], // Don't pipeline health checks

                // Authentication
                password: process.env.REDIS_PASSWORD || undefined,
                db: parseInt(process.env.REDIS_DB || '0'),

                // Connection name for monitoring
                connectionName: `profile-service-${process.env.NODE_ENV || 'dev'}-${process.pid}`,

                // ==================== PERFORMANCE TUNING ====================
                // Lazy connect for faster startup
                lazyConnect: false,

                // Enable TCP keepalive
                enableReadyCheck: true,

                // Auto-reconnect
                autoResubscribe: true,
                autoResendUnfulfilledCommands: true
            },

            // ==================== MONITORING & DEBUGGING ====================
            showFriendlyErrorStack: !isProduction,

            // ==================== DOCKER NETWORK (NO NAT MAPPING NEEDED) ====================
            // natMap removed - Docker handles service discovery

            // ==================== CUSTOM SLOT ALLOCATION ====================
            slotsRefreshTimeout: 5000,
            slotsRefreshInterval: 10000
        };

        logger.info('⚙️ [REDIS CONFIG] Production-grade configuration initialized', {
            nodes: nodes.map((n) => typeof n === 'object' && n !== null && 'host' in n ? `${n.host}:${n.port}` : String(n)),
            scaleReads: options.scaleReads,
            environment: process.env.NODE_ENV,
            maxConnections: 'Dynamic pool sizing',
            autoPipelining: true,
            expectedLoad: '500K+ users',
            timestamp: new Date().toISOString()
        });

        return { nodes, options };
    }

    /**
     * Get cluster configuration
     */
    public getConfig(): RedisClusterConfig {
        return this.clusterConfig;
    }

    /**
     * Get cache TTL settings (optimized for 500K users)
     */
    public getCacheTTL() {
        return {
            // ==================== GENERAL TTL ====================
            default: parseInt(process.env.REDIS_DEFAULT_TTL || '3600'), // 1 hour
            short: parseInt(process.env.REDIS_SHORT_TTL || '300'), // 5 minutes
            medium: parseInt(process.env.REDIS_MEDIUM_TTL || '1800'), // 30 minutes
            long: parseInt(process.env.REDIS_LONG_TTL || '7200'), // 2 hours
            veryLong: parseInt(process.env.REDIS_VERY_LONG_TTL || '86400'), // 24 hours

            // ==================== USER DATA TTL ====================
            userProfile: parseInt(process.env.REDIS_USER_PROFILE_TTL || '7200'), // 2 hours
            userPhoto: parseInt(process.env.REDIS_USER_PHOTO_TTL || '3600'), // 1 hour
            photoMetadata: parseInt(process.env.REDIS_PHOTO_METADATA_TTL || '1800'), // 30 min

            // ==================== ANALYTICS TTL ====================
            analytics: parseInt(process.env.REDIS_ANALYTICS_TTL || '300'), // 5 minutes
            userStats: parseInt(process.env.REDIS_USER_STATS_TTL || '600'), // 10 minutes

            // ==================== SECURITY TTL ====================
            rateLimit: parseInt(process.env.REDIS_RATE_LIMIT_TTL || '60'), // 1 minute
            session: parseInt(process.env.REDIS_SESSION_TTL || '86400'), // 24 hours
            authToken: parseInt(process.env.REDIS_AUTH_TOKEN_TTL || '3600'), // 1 hour

            // ==================== QUERY CACHE TTL ====================
            queryCache: parseInt(process.env.REDIS_QUERY_CACHE_TTL || '600'), // 10 minutes
            listCache: parseInt(process.env.REDIS_LIST_CACHE_TTL || '300'), // 5 minutes

            // ==================== STUDY GROUP TTL ====================
            leaderboard: parseInt(process.env.REDIS_LEADERBOARD_TTL || '1800'),   // 30 min
            leaderboardGroup: parseInt(process.env.REDIS_LEADERBOARD_GROUP_TTL || '300'), // 5 min
            userRank: parseInt(process.env.REDIS_USER_RANK_TTL || '300'),          // 5 min
            groupDetails: parseInt(process.env.REDIS_GROUP_DETAILS_TTL || '300'),  // 5 min
            groupList: parseInt(process.env.REDIS_GROUP_LIST_TTL || '60'),         // 1 min
            groupMembers: parseInt(process.env.REDIS_GROUP_MEMBERS_TTL || '60'),   // 1 min
            analyticsDaily: parseInt(process.env.REDIS_ANALYTICS_DAILY_TTL || '86400'),  // 24 hr
            analyticsWeekly: parseInt(process.env.REDIS_ANALYTICS_WEEKLY_TTL || '86400'),// 24 hr
            userDashboard: parseInt(process.env.REDIS_USER_DASHBOARD_TTL || '60'), // 1 min
        };
    }

    /**
     * Get cache key prefixes (versioned for invalidation)
     */
    public getKeyPrefixes() {
        const version = process.env.CACHE_VERSION || 'v1';
        return {
            // User data
            user: `user:${version}`,
            userProfile: `user-profile:${version}`,
            userPhoto: `user-photo:${version}`,

            // Photos
            photo: `photo:${version}`,
            photoMetadata: `photo-meta:${version}`,
            photoList: `photo-list:${version}`,

            // Analytics
            analytics: `analytics:${version}`,
            userStats: `user-stats:${version}`,

            // Security
            rateLimit: `ratelimit:${version}`,
            session: `session:${version}`,
            authToken: `auth:${version}`,

            // Cache
            cache: `cache:${version}`,
            query: `query:${version}`,

            //job service
            jobStats: `job:stats:${version}`,      // job:stats:jobId:views
            companyStats: `company:stats:${version}`,
            appStats: `application:stats:${version}`,

            // For flush tracking
            flushLock: `flush:lock:${version}`,
            flushProgress: `flush:progress:${version}`,

            // Study Group keys
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
     * Get connection pool settings for 500K users
     */
    public getConnectionPoolSettings() {
        return {
            // Minimum connections per node
            minConnections: parseInt(process.env.REDIS_MIN_CONNECTIONS || '10'),

            // Maximum connections per node
            maxConnections: parseInt(process.env.REDIS_MAX_CONNECTIONS || '500'),

            // Connection idle timeout
            idleTimeoutMillis: parseInt(process.env.REDIS_IDLE_TIMEOUT || '30000'),

            // Connection acquisition timeout
            acquireTimeoutMillis: parseInt(process.env.REDIS_ACQUIRE_TIMEOUT || '10000')
        };
    }

    /**
     * Get memory management settings
     */
    public getMemorySettings() {
        return {
            // Enable compression for large values
            enableCompression: process.env.REDIS_ENABLE_COMPRESSION === 'true',

            // Compression threshold (bytes)
            compressionThreshold: parseInt(process.env.REDIS_COMPRESSION_THRESHOLD || '1024'),

            // Max value size (10MB)
            maxValueSize: parseInt(process.env.REDIS_MAX_VALUE_SIZE || '10485760')
        };
    }

    // redis.config.ts (ADD THESE)

    /**
     * Get stats-specific settings for 1M+ users
     */
    public getStatsSettings() {
        return {
            // Buffer period before DB flush
            statsBufferTTL: parseInt(process.env.REDIS_STATS_TTL || '2592000'), // 30 days

            // Flush configuration
            flushBatchSize: parseInt(process.env.STATS_FLUSH_BATCH || '1000'),
            flushInterval: process.env.STATS_FLUSH_CRON || '0 */4 * * *',

            // Rate limiting for increments
            maxIncrementsPerMinute: parseInt(process.env.MAX_STATS_INCREMENT || '100'),

            // Key patterns
            patterns: {
                jobStats: 'job:stats:*:*',
                companyStats: 'company:stats:*:*',
                applicationStats: 'application:stats:*:*',
                // existing patterns ke saath add karo:
                leaderboardStats: 'leaderboard:*:*',
                groupStats: 'group:*:*',
                rankStats: 'rank:*:*',
            }
        };
    }

    /**
     * Get cluster health check settings
     */
    public getHealthCheckSettings() {
        return {
            // Ping interval
            pingInterval: parseInt(process.env.REDIS_PING_INTERVAL || '30000'), // 30s

            // Failure threshold
            failureThreshold: parseInt(process.env.REDIS_FAILURE_THRESHOLD || '3'),

            // Circuit breaker timeout
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