/**
 * audit.consumer.ts
 * Redis Streams based Audit Event Consumer
 *
 * Reads from "audit:events" stream and processes them.
 * Can be run in background (setInterval) or as a separate worker.
 *
 * Usage in server.ts:
 *   import { AuditConsumer } from './src/shared/kafka/consumers/audit.consumer';
 *   AuditConsumer.startConsuming(); // non-blocking background loop
 *
 * @module shared/kafka/consumers/audit.consumer
 * @version 4.0.0 (Redis Streams)
 */

import CacheUtil from '@/shared/cache.util';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== CONSTANTS ====================

const AUDIT_STREAM_KEY   = 'audit:events';
const AUDIT_FALLBACK_KEY = 'audit:fallback:queue';
const CONSUMER_GROUP     = 'audit-processors';
const CONSUMER_NAME      = `consumer-${process.pid}`;
const POLL_INTERVAL_MS   = 5000;  // Poll every 5 seconds
const BATCH_SIZE         = 50;    // Read 50 events per poll

// ==================== AUDIT CONSUMER CLASS ====================

export class AuditConsumer {
    private static _running = false;
    private static _intervalId: NodeJS.Timeout | null = null;

    /**
     * startConsuming()
     * Starts background polling loop.
     * Safe to call multiple times — idempotent.
     */
    static startConsuming(): void {
        if (this._running) {
            LoggerUtil.warn('[AuditConsumer] Already running');
            return;
        }

        this._running = true;
        LoggerUtil.info('[AuditConsumer] Starting background audit consumer', {
            pollIntervalMs: POLL_INTERVAL_MS,
            batchSize: BATCH_SIZE,
        });

        this._intervalId = setInterval(async () => {
            await this._poll().catch((err) => {
                LoggerUtil.error('[AuditConsumer] Poll error (non-critical)', { error: err.message });
            });
        }, POLL_INTERVAL_MS);

        // Don't block graceful shutdown
        this._intervalId.unref?.();
    }

    /**
     * stopConsuming()
     * Stops background polling loop.
     */
    static stopConsuming(): void {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._running = false;
        LoggerUtil.info('[AuditConsumer] Stopped');
    }

    /**
     * _poll()
     * Reads a batch of events from Redis Stream and processes them.
     * Uses simple XREAD (no consumer groups needed for single-instance).
     * For multi-instance, switch to XREADGROUP.
     * @private
     */
    private static async _poll(): Promise<void> {
        if (!CacheUtil.isConnected()) {
            LoggerUtil.debug('[AuditConsumer] Redis not connected, skipping poll');
            return;
        }

        try {
            const client = CacheUtil.getClient();
            const prefix = process.env['REDIS_KEY_PREFIX'] || 'auth:';
            const fullKey = `${prefix}${AUDIT_STREAM_KEY}`;

            // XREAD: read new entries from last seen ID
            // For simplicity, using '0' to read all unprocessed
            // In production, persist lastId to Redis so you don't re-process
            const results = await client.xRead(
                [{ key: fullKey, id: '$' }], // '$' = only new entries since last read
                { COUNT: BATCH_SIZE, BLOCK: 1000 } // Block for 1s waiting for new entries
            );

            if (!results || results.length === 0) return;

            for (const stream of results) {
                for (const entry of stream.messages) {
                    await this._processEvent(entry.id, entry.message as Record<string, string>);
                }
            }

            // Also drain fallback list
            await this._drainFallback();

        } catch (error: any) {
            // BLOCK timeout is normal — not an error
            if (!error.message?.includes('BLOCK')) {
                LoggerUtil.error('[AuditConsumer] Stream read error', { error: error.message });
            }
        }
    }

    /**
     * _processEvent()
     * Processes a single audit event from the stream.
     * Currently logs it. Extend this for:
     * - Saving to MongoDB AuditLog collection
     * - Sending alerts for HIGH/CRITICAL severity
     * - Analytics pipelines
     * @private
     */
    private static async _processEvent(
        streamId: string,
        fields: Record<string, string>
    ): Promise<void> {
        const severity = fields['severity'];
        const action   = fields['action'];
        const userId   = fields['userId'];

        LoggerUtil.info('[AuditConsumer] Processing audit event', {
            streamId,
            action,
            userId,
            severity,
        });

        // ==================== ADD YOUR PROCESSING LOGIC HERE ====================

        // Example 1: Save to MongoDB AuditLog
        // await AuditLog.create({
        //     userId: userId === 'anonymous' ? null : userId,
        //     action,
        //     status: fields['status'],
        //     severity,
        //     ipAddress: fields['ipAddress'],
        //     timestamp: new Date(fields['timestamp']),
        //     metadata: JSON.parse(fields['metadata'] || '{}'),
        // });

        // Example 2: Alert on CRITICAL severity
        // if (severity === 'CRITICAL') {
        //     await NotificationService.sendAlert({ ... });
        // }

        // =========================================================================
    }

    /**
     * _drainFallback()
     * Processes events from fallback list (when stream was unavailable).
     * @private
     */
    private static async _drainFallback(): Promise<void> {
        try {
            const fallback = await CacheUtil.lRange(AUDIT_FALLBACK_KEY, 0, BATCH_SIZE - 1);
            if (!fallback || fallback.length === 0) return;

            LoggerUtil.info('[AuditConsumer] Draining fallback queue', { count: fallback.length });

            for (const item of fallback) {
                const event = typeof item === 'string' ? JSON.parse(item) : item;
                await this._processEvent('fallback', event);
            }

            // Remove processed entries
            const client = CacheUtil.getClient();
            const prefix = process.env['REDIS_KEY_PREFIX'] || 'auth:';
            await client.lTrim(
                `${prefix}${AUDIT_FALLBACK_KEY}`,
                fallback.length,
                -1
            );
        } catch (error: any) {
            LoggerUtil.error('[AuditConsumer] Fallback drain error', { error: error.message });
        }
    }
}

export default AuditConsumer;