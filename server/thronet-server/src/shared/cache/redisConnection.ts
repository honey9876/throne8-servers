/**
 * Unified Redis Connection Factory
 * Provides a single, production-grade ioredis connection lifecycle with cluster/standalone support,
 * connection pooling for dedicated tasks (PubSub/BullMQ), retry backoff, health checks, and graceful shutdown.
 */

import Redis, { Cluster, RedisOptions, ClusterOptions } from 'ioredis';
import { LoggerUtil } from '@/shared/logger.util';

export interface RedisConnectionHealth {
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  isCluster: boolean;
  totalConnections: number;
  message?: string;
}

export interface DedicatedClientOptions {
  name?: string;
  maxRetriesPerRequest?: number | null;
  enableOfflineQueue?: boolean;
}

// ==================== STATE ====================
let mainClient: Redis | Cluster | null = null;
const dedicatedClients = new Set<Redis | Cluster>();
let isShuttingDown = false;

// ==================== CONFIGURATION ====================
export const getRedisConfig = () => {
  const isCluster = process.env['REDIS_CLUSTER_MODE'] === 'true';

  let host = '127.0.0.1';
  let port = 6379;
  let username: string | undefined = process.env['REDIS_USERNAME'] || process.env['REDIS_USER'] || undefined;
  let password: string | undefined = undefined;
  let db = 0;
  let tls: Record<string, any> | undefined = undefined;

  // 1. Support standard REDIS_URL (e.g. redis://:password@host:port/0 or rediss:// for TLS)
  const rawUrl = process.env['REDIS_URL'];
  if (rawUrl && !rawUrl.includes('${')) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'rediss:') {
        tls = {};
      }
      if (parsed.hostname) host = parsed.hostname;
      if (parsed.port) {
        const p = parseInt(parsed.port, 10);
        if (!isNaN(p) && p > 0) port = p;
      }
      if (parsed.username) username = decodeURIComponent(parsed.username);
      if (parsed.password) password = decodeURIComponent(parsed.password);
      if (parsed.pathname && parsed.pathname.length > 1) {
        const dbFromUrl = parseInt(parsed.pathname.slice(1), 10);
        if (!isNaN(dbFromUrl) && dbFromUrl >= 0) db = dbFromUrl;
      }
    } catch {
      // ignore parse errors and fallback
    }
  }

  // 2. Allow granular env overrides if explicitly defined
  const rawHost = process.env['REDIS_HOST'];
  if (rawHost && !rawHost.includes('${')) host = rawHost;

  const rawPort = process.env['REDIS_PORT'];
  if (rawPort) {
    const parsedPort = parseInt(rawPort, 10);
    if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort < 65536) port = parsedPort;
  }

  const rawUsername = process.env['REDIS_USERNAME'] || process.env['REDIS_USER'];
  if (rawUsername && !rawUsername.includes('${')) username = rawUsername;

  const rawPassword = process.env['REDIS_PASSWORD'];
  if (rawPassword && !rawPassword.includes('${')) password = rawPassword;

  const rawDb = process.env['REDIS_DB'];
  if (rawDb) {
    const parsedDb = parseInt(rawDb, 10);
    if (!isNaN(parsedDb) && parsedDb >= 0) db = parsedDb;
  }

  if (process.env['REDIS_TLS'] === 'true') {
    tls = {};
  }

  const rawClusterNodes = process.env['REDIS_CLUSTER_NODES'] || '';

  const clusterNodes = rawClusterNodes
    ? rawClusterNodes.split(',').map((nodeStr) => {
        const [nodeHost, nodePort] = nodeStr.trim().split(':');
        const parsedNodePort = nodePort ? parseInt(nodePort, 10) : 6379;
        return {
          host: nodeHost && !nodeHost.includes('${') ? nodeHost : '127.0.0.1',
          port: !isNaN(parsedNodePort) && parsedNodePort > 0 ? parsedNodePort : 6379,
        };
      })
    : [{ host, port }];

  const commandTimeoutMs = parseInt(
    process.env['REDIS_COMMAND_TIMEOUT_MS'] || process.env['REDIS_COMMAND_TIMEOUT'] || '30000',
    10
  ) || 30000;

  const connectTimeoutMs = parseInt(
    process.env['REDIS_CONNECT_TIMEOUT_MS'] || process.env['REDIS_CONNECTION_TIMEOUT'] || '60000',
    10
  ) || 60000;

  // family: 0 enables dual-stack (IPv4 and IPv6) DNS lookup in ioredis.
  // Crucial for Railway private networking (redis.railway.internal) which resolves to IPv6.
  const family = process.env['REDIS_FAMILY'] !== undefined ? parseInt(process.env['REDIS_FAMILY'], 10) : 0;

  return {
    isCluster,
    host,
    port,
    username,
    password,
    db,
    tls,
    family,
    clusterNodes,
    commandTimeoutMs,
    connectTimeoutMs,
  };
};

/**
 * Standard retry strategy with exponential backoff and jitter
 */
const defaultRetryStrategy = (times: number): number | void => {
  if (isShuttingDown) return undefined;
  const maxRetries = parseInt(process.env['REDIS_MAX_RETRIES'] || '10', 10);
  if (times > maxRetries) {
    LoggerUtil.error(`Redis max retry attempts reached (${times}/${maxRetries})`);
    return undefined;
  }
  const retryDelay = parseInt(process.env['REDIS_RETRY_DELAY'] || '3000', 10);
  const delay = Math.min(times * 200, retryDelay);
  const jitter = Math.floor(Math.random() * 200);
  LoggerUtil.warn(`Redis connection retry attempt ${times}, waiting ${delay + jitter}ms`);
  return delay + jitter;
};

/**
 * Create a standalone or cluster ioredis instance
 */
function createInstance(options: {
  maxRetriesPerRequest?: number | null;
  enableOfflineQueue?: boolean;
  name?: string;
}): Redis | Cluster {
  const config = getRedisConfig();
  const clientName = options.name || 'main';

  const redisOptions: RedisOptions = {
    host: config.host,
    port: config.port,
    ...(config.username ? { username: config.username } : {}),
    ...(config.password ? { password: config.password } : {}),
    db: config.db,
    family: config.family,
    ...(config.tls ? { tls: config.tls } : {}),
    connectTimeout: config.connectTimeoutMs,
    commandTimeout: config.commandTimeoutMs,
    maxRetriesPerRequest: options.maxRetriesPerRequest !== undefined ? options.maxRetriesPerRequest : 3,
    enableOfflineQueue: options.enableOfflineQueue !== undefined ? options.enableOfflineQueue : true,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: defaultRetryStrategy,
    reconnectOnError: (err: Error) => {
      const targetError = 'READONLY';
      if (err.message && err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  };

  let client: Redis | Cluster;

  if (config.isCluster) {
    LoggerUtil.warn('[REDIS_CLUSTER_WARNING] Redis Cluster mode active. Ensure all multi-key operations (pipelines, Lua scripts) use hash tags {...} or operate per-node. For standard production deployments, Redis Standalone with Sentinel / Read Replicas is recommended.');
    const clusterOptions: ClusterOptions = {
      clusterRetryStrategy: (times) => defaultRetryStrategy(times) ?? 2000,
      enableReadyCheck: true,
      scaleReads: 'slave',
      redisOptions: {
        ...(config.username ? { username: config.username } : {}),
        password: config.password,
        family: config.family,
        ...(config.tls ? { tls: config.tls } : {}),
        connectTimeout: config.connectTimeoutMs,
        commandTimeout: config.commandTimeoutMs,
      },
    };
    client = new Redis.Cluster(config.clusterNodes, clusterOptions);
  } else {
    client = new Redis(redisOptions);
  }

  // Attach structured event listeners
  client.on('connect', () => {
    LoggerUtil.info(`[Redis:${clientName}] Socket connected to Redis`);
  });

  client.on('ready', () => {
    LoggerUtil.info(`[Redis:${clientName}] Ready to accept commands`);
  });

  client.on('error', (err: Error) => {
    LoggerUtil.error(`[Redis:${clientName}] Connection error`, {
      message: err.message,
      name: err.name,
    });
  });

  client.on('close', () => {
    if (!isShuttingDown) {
      LoggerUtil.warn(`[Redis:${clientName}] Connection closed`);
    }
  });

  client.on('reconnecting', (time: number) => {
    LoggerUtil.warn(`[Redis:${clientName}] Reconnecting in ${time}ms`);
  });

  return client;
}

/**
 * Get or lazily create the main shared Redis client
 */
export const getRedisClient = (): Redis | Cluster => {
  if (!mainClient) {
    mainClient = createInstance({ name: 'main', maxRetriesPerRequest: 3 });
  }
  return mainClient;
};

/**
 * Create a dedicated Redis client for separate workloads (PubSub, BullMQ, blocking queues)
 */
export const createDedicatedClient = (options: DedicatedClientOptions = {}): Redis | Cluster => {
  const client = createInstance({
    name: options.name || 'dedicated',
    maxRetriesPerRequest: options.maxRetriesPerRequest !== undefined ? options.maxRetriesPerRequest : null,
    enableOfflineQueue: options.enableOfflineQueue !== undefined ? options.enableOfflineQueue : true,
  });
  dedicatedClients.add(client);

  client.on('end', () => {
    dedicatedClients.delete(client);
  });

  return client;
};

/**
 * Initialize and verify main Redis connection
 */
export const initRedis = async (): Promise<boolean> => {
  try {
    const client = getRedisClient();
    if (client.status === 'ready') {
      return true;
    }

    if (client.status === 'wait' || client.status === 'close') {
      await client.connect();
    }

    const pong = await client.ping();
    LoggerUtil.info('Redis initialized successfully', { ping: pong });
    return true;
  } catch (error: any) {
    LoggerUtil.error('Failed to initialize Redis connection', {
      error: error.message,
      stack: error.stack,
    });
    return false;
  }
};

let healthOverride: RedisConnectionHealth | null = null;

export const setRedisHealthOverride = (override: RedisConnectionHealth | null): void => {
  healthOverride = override;
};

/**
 * Health check with round-trip latency probe
 */
export const getRedisHealth = async (): Promise<RedisConnectionHealth> => {
  if (healthOverride !== null) return healthOverride;
  const client = getRedisClient();
  const config = getRedisConfig();
  const startTime = Date.now();

  try {
    const pong = await client.ping();
    const latencyMs = Date.now() - startTime;

    if (pong === 'PONG') {
      return {
        status: latencyMs > 500 ? 'degraded' : 'healthy',
        latencyMs,
        isCluster: config.isCluster,
        totalConnections: 1 + dedicatedClients.size,
      };
    }

    return {
      status: 'degraded',
      latencyMs,
      isCluster: config.isCluster,
      totalConnections: 1 + dedicatedClients.size,
      message: `Unexpected ping response: ${pong}`,
    };
  } catch (error: any) {
    return {
      status: 'down',
      latencyMs: Date.now() - startTime,
      isCluster: config.isCluster,
      totalConnections: 1 + dedicatedClients.size,
      message: error.message,
    };
  }
};

/**
 * Gracefully close all Redis connections
 */
export const closeRedis = async (): Promise<void> => {
  isShuttingDown = true;
  LoggerUtil.info('Closing all Redis connections...');

  const closePromises: Promise<any>[] = [];

  if (mainClient) {
    closePromises.push(
      mainClient.quit().catch(() => mainClient?.disconnect())
    );
    mainClient = null;
  }

  for (const client of dedicatedClients) {
    closePromises.push(
      client.quit().catch(() => client.disconnect())
    );
  }
  dedicatedClients.clear();

  await Promise.allSettled(closePromises);
  LoggerUtil.info('All Redis connections closed');
};

export const closeRedisConnection = closeRedis;
