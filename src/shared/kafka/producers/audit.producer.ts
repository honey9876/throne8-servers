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

















// /**
//  * audit.producer.ts
//  * Production-grade Kafka Audit Producer
//  * Handles audit event streaming for auth-service
//  *
//  * @version 3.0.0
//  * Compliant with NIST 800-63B and OWASP guidelines
//  */

// import { Kafka, Producer, ProducerRecord, Message } from 'kafkajs';
// import kafkaConfig from '@/config/kafka.config';
// import { LoggerUtil } from '@/shared/logger.util';
// import topics from '@/shared/kafka/config/topic.config';
// import { KafkaRetryUtil } from '@/shared/kafka/utils/kafka-retry.util';

// // ==================== INTERFACES & TYPES ====================

// export interface AuditEvent {
//   eventId: string;
//   userId: string | null;
//   action: string;
//   ipAddress: string;
//   status: 'SUCCESS' | 'ERROR' | 'WARNING' | 'FAILURE' | 'PENDING';
//   severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
//   timestamp: string;
//   metadata?: Record<string, any>;
// }

// // ==================== AUDIT PRODUCER CLASS ====================

// class AuditProducer {
//   private topic: string;
//   private kafka: Kafka;
//   private producer: Producer;
//   private isConnected: boolean = false;
//   private messagesSent: number = 0;
//   private messagesFailed: number = 0;
//   private connectionAttempts: number = 0;

//   constructor() {
//     this.topic = topics.auditEvents.topic;
//     this.kafka = new Kafka(kafkaConfig);

//     this.producer = this.kafka.producer({
//       allowAutoTopicCreation: true, // ✅ Allow auto-creation
//       transactionTimeout: 30000,
//       idempotent: true,
//       maxInFlightRequests: 5,
//       retry: {
//         initialRetryTime: 300,
//         retries: 8,
//         maxRetryTime: 30000,
//         multiplier: 2,
//       },
//     });

//     this.setupEventListeners();
//   }

//   // ==================== CONNECTION MANAGEMENT ====================

//   async connect(): Promise<void> {
//     if (this.isConnected) {
//       LoggerUtil.debug('Audit producer already connected');
//       return;
//     }

//     try {
//       this.connectionAttempts++;

//       await KafkaRetryUtil.withRetry(
//         async () => {
//           await this.producer.connect();
//         },
//         {
//           maxRetries: 3,
//           initialDelayMs: 1000,
//           maxDelayMs: 10000,
//         },
//         'audit-producer-connect'
//       );

//       this.isConnected = true;

//       LoggerUtil.info('✅ Audit producer connected', {
//         topic: this.topic,
//         attempt: this.connectionAttempts,
//       });

//       this.recordMetric('connection_success', 1);
//     } catch (error: any) {
//       this.isConnected = false;

//       LoggerUtil.error('❌ Audit producer connection failed', {
//         topic: this.topic,
//         attempt: this.connectionAttempts,
//         error: error.message,
//       });

//       this.recordMetric('connection_failure', 1);
//       // ✅ Don't throw - allow app to continue
//     }
//   }

//   async disconnect(): Promise<void> {
//     if (!this.isConnected) {
//       LoggerUtil.debug('Audit producer already disconnected');
//       return;
//     }

//     try {
//       await this.producer.disconnect();
//       this.isConnected = false;

//       LoggerUtil.info('✅ Audit producer disconnected', {
//         topic: this.topic,
//         messagesSent: this.messagesSent,
//         messagesFailed: this.messagesFailed,
//       });

//       this.recordMetric('disconnection_success', 1);
//     } catch (error: any) {
//       LoggerUtil.error('❌ Audit producer disconnection failed', {
//         topic: this.topic,
//         error: error.message,
//       });

//       this.recordMetric('disconnection_failure', 1);
//     }
//   }

//   // ==================== MESSAGE SENDING ====================

//   async sendAuditEvent(event: AuditEvent): Promise<void> {
//     try {
//       // ✅ Validate event
//       this.validateAuditEvent(event);

//       // ✅ Auto-reconnect if needed
//       if (!this.isConnected) {
//         LoggerUtil.warn('Producer not connected, attempting reconnection...');
//         await this.connect();
//       }

//       // ✅ If still not connected, skip silently
//       if (!this.isConnected) {
//         LoggerUtil.warn('Skipping audit event - producer not connected', {
//           eventId: event.eventId,
//           action: event.action,
//         });
//         return;
//       }

//       const message: Message = {
//         key: event.userId || event.eventId,
//         value: JSON.stringify(event),
//         timestamp: Date.now().toString(),
//         headers: {
//           'event-type': 'audit',
//           'severity': event.severity,
//           'correlation-id': event.eventId,
//         },
//       };

//       const record: ProducerRecord = {
//         topic: this.topic,
//         messages: [message],
//         compression: 1,
//       };

//       await this.producer.send(record);

//       this.messagesSent++;
//       this.recordMetric('messages_sent', 1);

//       LoggerUtil.debug('Audit event sent', {
//         eventId: event.eventId,
//         action: event.action,
//         userId: event.userId,
//       });
//     } catch (error: any) {
//       this.messagesFailed++;
//       this.recordMetric('messages_failed', 1);

//       LoggerUtil.error('Failed to send audit event', {
//         eventId: event.eventId,
//         action: event.action,
//         error: error.message,
//       });

//       // ✅ Don't throw - just log
//     }
//   }

//   async sendAuditEventsBatch(events: AuditEvent[]): Promise<void> {
//     if (!events || events.length === 0) {
//       LoggerUtil.warn('No audit events to send in batch');
//       return;
//     }

//     try {
//       events.forEach(event => this.validateAuditEvent(event));

//       if (!this.isConnected) {
//         await this.connect();
//       }

//       if (!this.isConnected) {
//         LoggerUtil.warn('Skipping batch audit events - producer not connected');
//         return;
//       }

//       const messages: Message[] = events.map(event => ({
//         key: event.userId || event.eventId,
//         value: JSON.stringify(event),
//         timestamp: Date.now().toString(),
//         headers: {
//           'event-type': 'audit',
//           'severity': event.severity,
//           'correlation-id': event.eventId,
//         },
//       }));

//       const record: ProducerRecord = {
//         topic: this.topic,
//         messages,
//         compression: 1,
//       };

//       await this.producer.send(record);

//       this.messagesSent += events.length;
//       this.recordMetric('messages_sent', events.length);

//       LoggerUtil.info('Audit events batch sent', {
//         count: events.length,
//         topic: this.topic,
//       });
//     } catch (error: any) {
//       this.messagesFailed += events.length;
//       this.recordMetric('messages_failed', events.length);

//       LoggerUtil.error('Failed to send audit events batch', {
//         count: events.length,
//         error: error.message,
//       });
//     }
//   }

//   // ==================== VALIDATION ====================

//   private validateAuditEvent(event: AuditEvent): void {
//     const requiredFields: (keyof AuditEvent)[] = [
//       'eventId',
//       'action',
//       'ipAddress',
//       'status',
//       'severity',
//       'timestamp',
//     ];

//     for (const field of requiredFields) {
//       if (!event[field]) {
//         throw new Error(`Missing required field: ${field}`);
//       }
//     }

//     // ✅ Include all valid statuses
//     const validStatuses = ['SUCCESS', 'ERROR', 'WARNING', 'FAILURE', 'PENDING'];
//     const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

//     if (!validStatuses.includes(event.status)) {
//       throw new Error(`Invalid status: ${event.status}`);
//     }

//     if (!validSeverities.includes(event.severity)) {
//       throw new Error(`Invalid severity: ${event.severity}`);
//     }
//   }

//   // ==================== EVENT LISTENERS ====================

//   private setupEventListeners(): void {
//     this.producer.on('producer.connect', () => {
//       LoggerUtil.debug('Producer connected event received');
//       this.isConnected = true;
//     });

//     this.producer.on('producer.disconnect', () => {
//       LoggerUtil.debug('Producer disconnected event received');
//       this.isConnected = false;
//     });

//     this.producer.on('producer.network.request', () => {
//       LoggerUtil.debug('Producer network request');
//     });

//     this.producer.on('producer.network.request_timeout', ({ payload }) => {
//       LoggerUtil.warn('Producer request timeout', {
//         broker: payload.broker,
//         clientId: payload.clientId,
//       });
//       this.recordMetric('request_timeout', 1);
//     });
//   }

//   // ==================== METRICS ====================

//   private recordMetric(metric: string, value: number): void {
//     LoggerUtil.debug('Metric recorded', {
//       metric,
//       value,
//       topic: this.topic,
//       timestamp: new Date().toISOString(),
//     });
//   }

//   getStats() {
//     return {
//       isConnected: this.isConnected,
//       messagesSent: this.messagesSent,
//       messagesFailed: this.messagesFailed,
//       connectionAttempts: this.connectionAttempts,
//       topic: this.topic,
//     };
//   }

//   resetStats(): void {
//     this.messagesSent = 0;
//     this.messagesFailed = 0;
//     this.connectionAttempts = 0;
//     LoggerUtil.info('Audit producer stats reset');
//   }
// }

// export default new AuditProducer();