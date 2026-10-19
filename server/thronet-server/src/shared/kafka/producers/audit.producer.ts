/**
 * audit.producer.ts
 * Redis Streams based Audit Event Producer
 * Works with both node-redis (xAdd/lTrim) and ioredis (xadd/ltrim) clients.
 *
 * Stream key: "audit:events"
 * Max stream length: 10,000 entries (MAXLEN trimming)
 *
 * @module shared/kafka/producers/audit.producer
 * @version 4.1.0 (Redis Streams, client-agnostic)
 */

import CacheUtil from '@/shared/cache.util';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== INTERFACES ====================

export interface AuditEvent {
  eventId: string;
  userId: string | null;
  action: string;
  ipAddress: string;
  status: 'SUCCESS' | 'FAILURE' | 'ERROR' | 'WARNING';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: string;
  metadata?: Record<string, any>;
}

// ==================== CONSTANTS ====================

const AUDIT_STREAM_KEY = 'audit:events';
const AUDIT_STREAM_MAXLEN = 10_000;
const AUDIT_FALLBACK_KEY = 'audit:fallback:queue';
const AUDIT_FALLBACK_MAXLEN = 1000;

const keyPrefix = (): string => process.env['REDIS_KEY_PREFIX'] || 'auth:';

// ==================== CLIENT COMPAT HELPERS ====================

/**
 * XADD with MAXLEN trimming for node-redis or ioredis.
 */
async function streamAdd(
  client: any,
  key: string,
  fields: Record<string, string>
): Promise<void> {
  // node-redis v4+
  if (typeof client.xAdd === 'function') {
    await client.xAdd(key, '*', fields, {
      TRIM: {
        strategy: 'MAXLEN',
        strategyModifier: '~',
        threshold: AUDIT_STREAM_MAXLEN,
      },
    });
    return;
  }

  // ioredis
  if (typeof client.xadd === 'function') {
    const flat: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
      flat.push(k, v);
    }
    await client.xadd(key, 'MAXLEN', '~', AUDIT_STREAM_MAXLEN, '*', ...flat);
    return;
  }

  throw new Error('Redis client does not support streams (no xAdd/xadd)');
}

/**
 * LTRIM for node-redis or ioredis.
 */
async function listTrim(client: any, key: string, start: number, stop: number): Promise<void> {
  if (typeof client.lTrim === 'function') {
    await client.lTrim(key, start, stop);
    return;
  }
  if (typeof client.ltrim === 'function') {
    await client.ltrim(key, start, stop);
    return;
  }
  throw new Error('Redis client does not support LTRIM (no lTrim/ltrim)');
}

function toFields(event: AuditEvent): Record<string, string> {
  return {
    eventId: String(event.eventId || ''),
    userId: String(event.userId ?? 'anonymous'),
    action: String(event.action || 'unknown'),
    ipAddress: String(event.ipAddress || 'unknown'),
    status: String(event.status || 'SUCCESS'),
    severity: String(event.severity || 'LOW'),
    timestamp: String(event.timestamp || new Date().toISOString()),
    metadata: event.metadata ? JSON.stringify(event.metadata) : '{}',
  };
}

// ==================== AUDIT PRODUCER CLASS ====================

class AuditProducer {
  /** No-op, Redis connection is managed by CacheUtil. Kept for API compatibility. */
  static async connect(): Promise<void> {
    LoggerUtil.debug('[AuditProducer] connect() called - no-op (Redis managed by CacheUtil)');
  }

  /** No-op, kept for API compatibility. */
  static async disconnect(): Promise<void> {
    LoggerUtil.debug('[AuditProducer] disconnect() called - no-op (Redis managed by CacheUtil)');
  }

  /**
   * Publishes an audit event to the Redis Stream.
   * Falls back to a bounded Redis list if the stream write fails.
   * Never throws: audit must not crash the main flow.
   */
  static async sendAuditEvent(event: AuditEvent): Promise<void> {
    const fields = toFields(event);

    try {
      if (CacheUtil.isConnected()) {
        const client = CacheUtil.getClient();
        await streamAdd(client, `${keyPrefix()}${AUDIT_STREAM_KEY}`, fields);

        LoggerUtil.debug('[AuditProducer] Event written to Redis Stream', {
          action: event.action,
          userId: event.userId,
          severity: event.severity,
        });
      } else {
        await this._fallbackWrite(fields);
      }
    } catch (error: any) {
      LoggerUtil.error('[AuditProducer] Failed to send audit event', {
        error: error.message,
        action: event.action,
        userId: event.userId,
      });

      try {
        await this._fallbackWrite(fields);
      } catch (fallbackError: any) {
        LoggerUtil.error('[AuditProducer] Fallback write also failed (non-critical)', {
          error: fallbackError.message,
        });
      }
    }
  }

  /**
   * Writes the event as JSON to a bounded Redis list.
   * @private
   */
  private static async _fallbackWrite(fields: Record<string, string>): Promise<void> {
    const serialized = JSON.stringify({ ...fields, _fallback: true });
    await CacheUtil.lpush(AUDIT_FALLBACK_KEY, serialized);

    // Trimming is best-effort: a trim failure must not make the write look failed
    try {
      if (CacheUtil.isConnected()) {
        await listTrim(
          CacheUtil.getClient(),
          `${keyPrefix()}${AUDIT_FALLBACK_KEY}`,
          0,
          AUDIT_FALLBACK_MAXLEN - 1
        );
      }
    } catch (trimError: any) {
      LoggerUtil.warn('[AuditProducer] Fallback list trim failed (non-critical)', {
        error: trimError.message,
      });
    }

    LoggerUtil.warn('[AuditProducer] Event written to fallback list', {
      action: fields['action'],
    });
  }
}

export default AuditProducer;