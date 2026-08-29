/**
 * audit.producer.ts
 * Redis Streams based Audit Event Producer
 * Drop-in replacement for Kafka-based AuditProducer
 *
 * Why Redis Streams (not Pub/Sub)?
 * - Messages persist even if consumer is down
 * - Audit logs kabhi lose nahi honge
 * - Consumer groups support (future scaling)
 * - Kafka jaise semantics, lekin zero extra infra
 *
 * Stream key: "audit:events"
 * Max stream length: 10,000 entries (MAXLEN trimming)
 *
 * @module shared/kafka/producers/audit.producer
 * @version 4.0.0 (Redis Streams)
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
const AUDIT_STREAM_MAXLEN = 10_000; // Max entries in stream (auto-trimmed)
const AUDIT_FALLBACK_KEY = 'audit:fallback:queue'; // In-memory fallback list

// ==================== AUDIT PRODUCER CLASS ====================

class AuditProducer {
  /**
   * connect() — No-op for Redis.
   * Kept for API compatibility with old Kafka-based code.
   * Redis connection is managed by CacheUtil globally.
   */
  static async connect(): Promise<void> {
    // No connection needed — CacheUtil handles Redis lifecycle
    LoggerUtil.debug('[AuditProducer] connect() called — no-op (Redis managed by CacheUtil)');
  }

  /**
   * disconnect() — No-op for Redis.
   * Kept for API compatibility with old Kafka-based code.
   */
  static async disconnect(): Promise<void> {
    // No disconnect needed
    LoggerUtil.debug('[AuditProducer] disconnect() called — no-op (Redis managed by CacheUtil)');
  }

  /**
   * sendAuditEvent()
   * Publishes an audit event to Redis Stream.
   *
   * Falls back to in-memory Redis list if stream write fails.
   * All fields are stored as flat string key-value pairs
   * (Redis Streams requirement).
   *
   * @param event AuditEvent
   */
  static async sendAuditEvent(event: AuditEvent): Promise<void> {
    try {
      // Redis Streams require flat string key-value fields
      const fields: Record<string, string> = {
        eventId: event.eventId,
        userId: event.userId ?? 'anonymous',
        action: event.action,
        ipAddress: event.ipAddress,
        status: event.status,
        severity: event.severity,
        timestamp: event.timestamp,
        metadata: event.metadata ? JSON.stringify(event.metadata) : '{}',
      };

      if (CacheUtil.isConnected()) {
        // Write to Redis Stream with auto-trimming at MAXLEN
        const client = CacheUtil.getClient();
        await client.xAdd(
          `${process.env['REDIS_KEY_PREFIX'] || 'auth:'}${AUDIT_STREAM_KEY}`,
          '*', // Auto-generate stream entry ID
          fields,
          {
            TRIM: {
              strategy: 'MAXLEN',
              strategyModifier: '~', // Approximate trimming (faster)
              threshold: AUDIT_STREAM_MAXLEN,
            },
          }
        );

        LoggerUtil.debug('[AuditProducer] Event written to Redis Stream', {
          action: event.action,
          userId: event.userId,
          severity: event.severity,
        });
      } else {
        // Fallback: write to Redis list (simpler, no stream needed)
        // Consumer can drain this list separately
        await this._fallbackWrite(fields);
      }
    } catch (error: any) {
      LoggerUtil.error('[AuditProducer] Failed to send audit event', {
        error: error.message,
        action: event.action,
        userId: event.userId,
      });

      // Last resort: try fallback list
      try {
        await this._fallbackWrite({
          eventId: event.eventId,
          userId: event.userId ?? 'anonymous',
          action: event.action,
          status: event.status,
          severity: event.severity,
          timestamp: event.timestamp,
          metadata: event.metadata ? JSON.stringify(event.metadata) : '{}',
        });
      } catch (fallbackError: any) {
        // Silently swallow — audit must never crash the main flow
        LoggerUtil.error('[AuditProducer] Fallback write also failed (non-critical)', {
          error: fallbackError.message,
        });
      }
    }
  }

  /**
   * _fallbackWrite()
   * Writes event as JSON to a Redis list as a last resort.
   * Consumer can drain this separately.
   * @private
   */
  private static async _fallbackWrite(fields: Record<string, string>): Promise<void> {
    const serialized = JSON.stringify({ ...fields, _fallback: true });
    await CacheUtil.lpush(AUDIT_FALLBACK_KEY, serialized);

    // Keep fallback list bounded (max 1000 entries)
    const client = CacheUtil.getClient();
    if (CacheUtil.isConnected()) {
      await client.lTrim(
        `${process.env['REDIS_KEY_PREFIX'] || 'auth:'}${AUDIT_FALLBACK_KEY}`,
        0,
        999
      );
    }

    LoggerUtil.warn('[AuditProducer] Event written to fallback list', {
      action: fields['action'],
    });
  }
}

export default AuditProducer;













