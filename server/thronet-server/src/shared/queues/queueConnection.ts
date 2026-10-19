/**
 * queueConnection.ts
 * BullMQ Dedicated Redis Connection Configuration
 * 
 * ============================================================================
 * QUEUE REDIS ARCHITECTURE & ISOLATION POLICY:
 * ============================================================================
 * 1. SEPARATE INSTANCE REQUIRED:
 *    - In Redis, `maxmemory-policy` is an instance-level configuration, NOT per-DB.
 *    - Redis Cluster mode supports ONLY DB 0; multi-DB is unsupported in Cluster.
 *    - Background queues (BullMQ) MUST NEVER share an instance with an LRU cache.
 *      If Redis evicts keys under memory pressure, pending jobs, delayed sets,
 *      locks, and stream dependencies are corrupted or lost silently.
 * 
 * 2. MEMORY POLICY REQUIREMENTS:
 *    - Cache Instance: MUST run with `maxmemory-policy allkeys-lru` (or volatile-lru)
 *      so non-persistent cache entries are reclaimed safely.
 *    - Queue Instance: MUST run with `maxmemory-policy noeviction` so job payloads
 *      and state streams are NEVER dropped. Memory must be sized appropriately.
 * 
 * 3. CONNECTION RESOLUTION (REDIS_QUEUE_URL):
 *    - Priority 1: `REDIS_QUEUE_URL` pointing to dedicated queue Redis instance
 *      (e.g., redis://:queue_secret@queue-redis.internal:6380 or rediss:// for TLS).
 *    - Priority 2: `REDIS_QUEUE_HOST` / `REDIS_QUEUE_PORT` / `REDIS_QUEUE_PASSWORD`.
 *    - Priority 3: Default fallback to primary host/port.
 *    - Zero multi-DB assumption (DB 0 default, cluster-ready).
 * ============================================================================
 */

import { LoggerUtil } from '@/shared/logger.util';

export interface QueueRedisConfig {
  host: string;
  port: number;
  password?: string;
  username?: string;
  family?: number;
  tls?: Record<string, any>;
  maxRetriesPerRequest: null;
  enableOfflineQueue: boolean;
}

/**
 * Returns connection configuration for BullMQ queues.
 * Resolves dedicated instance from REDIS_QUEUE_URL or dedicated host/port.
 */
export function getQueueConnectionConfig(): QueueRedisConfig {
  const queueUrl = process.env['REDIS_QUEUE_URL'] || process.env['REDIS_URL'];
  const family = process.env['REDIS_FAMILY'] !== undefined ? parseInt(process.env['REDIS_FAMILY'], 10) : 0;

  if (queueUrl) {
    try {
      const parsed = new URL(queueUrl);
      const isTls = parsed.protocol === 'rediss:';
      return {
        host: parsed.hostname || '127.0.0.1',
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        family,
        tls: isTls ? {} : undefined,
        maxRetriesPerRequest: null, // Strictly required by BullMQ
        enableOfflineQueue: true,
      };
    } catch (err: any) {
      LoggerUtil.warn(
        `[QueueConnection] Failed to parse REDIS_QUEUE_URL (${err.message}), falling back to host/port config`
      );
    }
  }

  const host = process.env['REDIS_QUEUE_HOST'] || process.env['REDIS_HOST'] || '127.0.0.1';
  const rawPort = process.env['REDIS_QUEUE_PORT'] || process.env['REDIS_PORT'];
  const parsedPort = rawPort ? parseInt(rawPort, 10) : 6379;
  const port = !isNaN(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : 6379;
  const password = process.env['REDIS_QUEUE_PASSWORD'] || process.env['REDIS_PASSWORD'] || undefined;
  const username = process.env['REDIS_QUEUE_USERNAME'] || process.env['REDIS_USERNAME'] || process.env['REDIS_USER'] || undefined;
  const tls = process.env['REDIS_TLS'] === 'true' ? {} : undefined;

  return {
    host,
    port,
    password,
    username,
    family,
    tls,
    maxRetriesPerRequest: null, // Strictly required by BullMQ
    enableOfflineQueue: true,
  };
}

/**
 * Masks an email address to prevent PII exposure in logs.
 * Example: 'john.doe@example.com' -> 'j***e@example.com'
 */
export function maskEmail(email: string | string[] | undefined): string {
  if (!email) return 'unknown';
  if (Array.isArray(email)) {
    return email.map((e) => maskEmail(e)).join(', ');
  }
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0]!;
  const domain = parts[1]!;
  const maskedName = name.length <= 2 ? `${name[0]}***` : `${name[0]}***${name[name.length - 1]}`;
  return `${maskedName}@${domain}`;
}

/**
 * Check if a given queue domain is enabled via env kill switch.
 * Example: CACHE_QUEUE_EMAIL_ENABLED=false
 */
export function isQueueEnabled(queueName: string): boolean {
  if (process.env['CACHE_GLOBAL_ENABLED'] === 'false') return false;
  if (process.env['CACHE_QUEUES_ENABLED'] === 'false') return false;
  const cleanName = queueName.replace(/[-_]?QUEUE$/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  if (
    process.env[`CACHE_QUEUE_${cleanName}_ENABLED`] === 'false' ||
    process.env[`CACHE_QUEUE_${cleanName}_ENABLED`] === '0' ||
    process.env[`CACHE_${cleanName}_QUEUE_ENABLED`] === 'false' ||
    process.env[`CACHE_${cleanName}_QUEUE_ENABLED`] === '0'
  ) {
    return false;
  }
  return true;
}
