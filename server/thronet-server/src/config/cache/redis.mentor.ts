
// src/config/redis.ts

import { logger } from '@/shared/logger.util';
import config from '../env/env';
import Redis ,  { Cluster } from 'ioredis';

let redis: Redis | Cluster | null = null;
const POOL_SIZE = 10;
const connectionPool: Redis[] = [];

/**
 * Initialize Redis connection (with pooling)
 */
export const initRedis = (): Redis => {
  try {
    if (redis) {
      return redis as Redis;
    }

    // Check if Redis is configured
    if (!config.REDIS_HOST) {
      logger.warn('⚠️  Redis not configured. Using mock Redis.');
      return createMockRedis();
    }

    // Create connection pool for high concurrency
    for (let i = 0; i < POOL_SIZE; i++) {
      const client = new Redis({
        host: config.REDIS_HOST,
        port: config.REDIS_PORT || 6379,
        password: config.REDIS_PASSWORD,
        db: config.REDIS_DB || 0,
        connectTimeout: 10000,        // ✅ Connection timeout
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
          return delay;
        },
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            return true; // Reconnect on READONLY errors
          }
          return false;
        },
      });

      // Setup event handlers
      if (i === 0) {
        setupEventHandlers(client);
      }

      connectionPool.push(client);
    }

    redis = connectionPool[0];
    logger.info(`✅ Redis pool created with ${POOL_SIZE} connections`);

    return connectionPool[0];
  } catch (error : any) {
    logger.error('Failed to initialize Redis:', error);
    return createMockRedis();
  }
};

/**
 * Setup event handlers
 */
function setupEventHandlers(client: Redis): void {
  client.on('connect', () => {
    logger.info('✅ Redis connecting...');
  });

  client.on('ready', () => {
    logger.info('✅ Redis connected and ready');
  });

  client.on('error', (err) => {
    logger.error('❌ Redis error:', err);
  });

  client.on('close', () => {
    logger.warn('⚠️  Redis connection closed');
  });

  client.on('reconnecting', (delay: number) => {
    logger.info(`🔄 Redis reconnecting in ${delay}ms...`);
  });

  client.on('end', () => {
    logger.warn('⚠️  Redis connection ended');
  });
}

/**
 * Get Redis instance (round-robin from pool)
 */
export const getRedis = (): Redis => {
  if (connectionPool.length === 0) {
    return initRedis();
  }

  // Simple round-robin load balancing
  const index = Math.floor(Math.random() * connectionPool.length);
  return connectionPool[index];
};

/**
 * Close all Redis connections
 */
export const closeRedis = async (): Promise<void> => {
  if (connectionPool.length > 0) {
    try {
      await Promise.all(connectionPool.map(client => client.quit()));
      connectionPool.length = 0;
      redis = null;
      logger.info('✅ Redis connections closed gracefully');
    } catch (error : any) {
      logger.error('Error closing Redis connections:', error);
      await Promise.all(connectionPool.map(client => client.disconnect()));
      connectionPool.length = 0;
      redis = null;
    }
  }
};

/**
 * Create mock Redis for development (with memory limits)
 */
const createMockRedis = (): any => {
  const MAX_SIZE = 10000;
  const cache = new Map<string, { value: string; expiry?: number }>();

  const evictOldest = () => {
    if (cache.size >= MAX_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) {
        cache.delete(oldestKey);
        logger.debug(`Mock Redis: Evicted ${oldestKey} (size: ${cache.size})`);
      }
    }
  };

  const checkExpiry = (key: string): boolean => {
    const entry = cache.get(key);
    if (entry?.expiry && Date.now() > entry.expiry) {
      cache.delete(key);
      return true;
    }
    return false;
  };

  return {
    get: async (key: string) => {
      if (checkExpiry(key)) return null;
      return cache.get(key)?.value || null;
    },

    set: async (key: string, value: string) => {
      evictOldest();
      cache.set(key, { value });
      return 'OK';
    },

    setex: async (key: string, seconds: number, value: string) => {
      evictOldest();
      cache.set(key, {
        value,
        expiry: Date.now() + (seconds * 1000)
      });
      return 'OK';
    },

    del: async (...keys: string[]) => {
      keys.forEach((key) => cache.delete(key));
      return keys.length;
    },

    exists: async (...keys: string[]) => {
      return keys.filter((key) => cache.has(key) && !checkExpiry(key)).length;
    },

    ttl: async (key: string) => {
      if (checkExpiry(key)) return -2;
      const entry = cache.get(key);
      if (!entry) return -2;
      if (!entry.expiry) return -1;
      return Math.floor((entry.expiry - Date.now()) / 1000);
    },

    expire: async (key: string, seconds: number) => {
      const entry = cache.get(key);
      if (entry) {
        entry.expiry = Date.now() + (seconds * 1000);
        return 1;
      }
      return 0;
    },

    scan: async (cursor: string, ..._args: any[]) => {
      // Simple scan implementation for mock
      const keys = Array.from(cache.keys());
      const start = parseInt(cursor) || 0;
      const count = 100;
      const end = Math.min(start + count, keys.length);
      const nextCursor = end >= keys.length ? '0' : end.toString();
      return [nextCursor, keys.slice(start, end)];
    },

    pipeline: () => ({
      setex: () => {},
      del: () => {},
      exec: async () => [],
    }),

    mget: async (...keys: string[]) => {
      return keys.map(key => {
        if (checkExpiry(key)) return null;
        return cache.get(key)?.value || null;
      });
    },

    flushdb: async () => {
      cache.clear();
      return 'OK';
    },

    ping: async () => 'PONG',
    quit: async () => 'OK',
    disconnect: () => {},
    on: () => {},
  };
};

/**
 * Check if Redis is available (with timeout)
 */
export const isRedisAvailable = async (timeoutMs = 3000): Promise<boolean> => {
  try {
    const redis = getRedis();
    
    const pingPromise = redis.ping();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Redis health check timeout')), timeoutMs)
    );

    const result = await Promise.race([pingPromise, timeoutPromise]);
    return result === 'PONG';
  } catch (error : any) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};

/**
 * Redis cache helper functions
 */
export const redisCache = {
  /**
   * Get value from cache
   */
  get: async <T>(key: string): Promise<T | null> => {
    try {
      const redis = getRedis();
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error : any) {
      logger.error('Redis get error:', error);
      return null;
    }
  },

  /**
   * Set value in cache with expiry
   */
  set: async <T>(key: string, value: T, ttl: number = 3600): Promise<boolean> => {
    try {
      const redis = getRedis();
      const data = JSON.stringify(value);
      await redis.setex(key, ttl, data);
      return true;
    } catch (error : any) {
      logger.error('Redis set error:', error);
      return false;
    }
  },

  /**
   * Delete key from cache
   */
  del: async (key: string): Promise<boolean> => {
    try {
      const redis = getRedis();
      await redis.del(key);
      return true;
    } catch (error : any) {
      logger.error('Redis del error:', error);
      return false;
    }
  },

  /**
   * Delete multiple keys by pattern (using SCAN)
   */
  delPattern: async (pattern: string): Promise<number> => {
    try {
      const redis = getRedis();
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH', pattern,
          'COUNT', 100
        );

        cursor = nextCursor;

        if (keys.length > 0) {
          const pipeline = redis.pipeline();
          keys.forEach(key => pipeline.del(key));
          await pipeline.exec();
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      logger.debug(`Deleted ${deletedCount} keys matching pattern: ${pattern}`);
      return deletedCount;
    } catch (error : any) {
      logger.error('Redis delPattern error:', error);
      return 0;
    }
  },

  /**
   * Check if key exists
   */
  exists: async (key: string): Promise<boolean> => {
    try {
      const redis = getRedis();
      const result = await redis.exists(key);
      return result === 1;
    } catch (error : any) {
      logger.error('Redis exists error:', error);
      return false;
    }
  },

  /**
   * Get remaining TTL
   */
  ttl: async (key: string): Promise<number> => {
    try {
      const redis = getRedis();
      return await redis.ttl(key);
    } catch (error : any) {
      logger.error('Redis ttl error:', error);
      return -1;
    }
  },

  /**
   * Increment counter
   */
  incr: async (key: string): Promise<number> => {
    try {
      const redis = getRedis();
      return await redis.incr(key);
    } catch (error : any) {
      logger.error('Redis incr error:', error);
      return 0;
    }
  },

  /**
   * Set expiry on key
   */
  expire: async (key: string, seconds: number): Promise<boolean> => {
    try {
      const redis = getRedis();
      const result = await redis.expire(key, seconds);
      return result === 1;
    } catch (error : any) {
      logger.error('Redis expire error:', error);
      return false;
    }
  },

  /**
   * Set multiple keys efficiently (pipeline)
   */
  mset: async (entries: Record<string, any>, ttl: number = 3600): Promise<boolean> => {
    try {
      const redis = getRedis();
      const pipeline = redis.pipeline();

      for (const [key, value] of Object.entries(entries)) {
        const data = JSON.stringify(value);
        pipeline.setex(key, ttl, data);
      }

      await pipeline.exec();
      return true;
    } catch (error : any) {
      logger.error('Redis mset error:', error);
      return false;
    }
  },

  /**
   * Get multiple keys efficiently
   */
  mget: async <T>(keys: string[]): Promise<Map<string, T>> => {
    try {
      const redis = getRedis();
      const values = await redis.mget(...keys);
      
      const result = new Map<string, T>();
      values.forEach((value, index) => {
        if (value) {
          result.set(keys[index], JSON.parse(value));
        }
      });

      return result;
    } catch (error : any) {
      logger.error('Redis mget error:', error);
      return new Map();
    }
  },
};

export default getRedis();
