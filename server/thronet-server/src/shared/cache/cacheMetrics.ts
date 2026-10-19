/**
 * cacheMetrics.ts
 * Prometheus metrics registry for Redis caching, BullMQ queues, and Socket.IO presence.
 * 
 * Metrics:
 * 1. cache_operations_total: Counter with domain, operation, status (hit, miss, error)
 * 2. bullmq_jobs_waiting: Gauge with queue (email, notification)
 * 3. bullmq_jobs_failed: Gauge with queue (email, notification)
 * 4. presence_online_users: Gauge for active cluster-wide presence
 */

import promClient from 'prom-client';
import { getEmailQueue } from '@/shared/queues/email.queue';
import { getNotificationQueue } from '@/shared/queues/notification.queue';
import { SocketPresenceRepository } from '@/shared/cache/socketCache';
import { LoggerUtil } from '@/shared/logger.util';

const register = promClient.register;

export const cacheOperationsTotal =
  (register.getSingleMetric('cache_operations_total') as promClient.Counter<string>) ||
  new promClient.Counter({
    name: 'cache_operations_total',
    help: 'Total number of cache operations partitioned by domain, operation, and status (hit, miss, error)',
    labelNames: ['domain', 'operation', 'status'],
  });

export const bullmqWaitingGauge =
  (register.getSingleMetric('bullmq_jobs_waiting') as promClient.Gauge<string>) ||
  new promClient.Gauge({
    name: 'bullmq_jobs_waiting',
    help: 'Number of jobs currently waiting in BullMQ queues',
    labelNames: ['queue'],
    async collect() {
      try {
        const emailQ = getEmailQueue();
        const waitingEmail = await emailQ.getWaitingCount();
        this.set({ queue: 'email' }, waitingEmail);
      } catch {
        this.set({ queue: 'email' }, 0);
      }
      try {
        const notifQ = getNotificationQueue();
        const waitingNotif = await notifQ.getWaitingCount();
        this.set({ queue: 'notification' }, waitingNotif);
      } catch {
        this.set({ queue: 'notification' }, 0);
      }
    },
  });

export const bullmqFailedGauge =
  (register.getSingleMetric('bullmq_jobs_failed') as promClient.Gauge<string>) ||
  new promClient.Gauge({
    name: 'bullmq_jobs_failed',
    help: 'Number of failed jobs in BullMQ queues',
    labelNames: ['queue'],
    async collect() {
      try {
        const emailQ = getEmailQueue();
        const failedEmail = await emailQ.getFailedCount();
        this.set({ queue: 'email' }, failedEmail);
      } catch {
        this.set({ queue: 'email' }, 0);
      }
      try {
        const notifQ = getNotificationQueue();
        const failedNotif = await notifQ.getFailedCount();
        this.set({ queue: 'notification' }, failedNotif);
      } catch {
        this.set({ queue: 'notification' }, 0);
      }
    },
  });

export const redisUpGauge =
  (register.getSingleMetric('redis_up') as promClient.Gauge<string>) ||
  new promClient.Gauge({
    name: 'redis_up',
    help: 'Redis connectivity status (1 = healthy, 0 = degraded or down)',
  });

export const presenceOnlineGauge =
  (register.getSingleMetric('presence_online_users') as promClient.Gauge<string>) ||
  new promClient.Gauge({
    name: 'presence_online_users',
    help: 'Number of currently active online users across cluster',
    async collect() {
      try {
        const count = await SocketPresenceRepository.getOnlineUserCount();
        this.set(count);
      } catch {
        this.set(0);
      }
    },
  });

export function recordCacheHit(domain = 'general', operation = 'get'): void {
  try {
    cacheOperationsTotal.inc({ domain, operation, status: 'hit' });
  } catch (err: any) {
    LoggerUtil.warn('Failed to record cache hit metric', { domain, operation, error: err.message });
  }
}

export function recordCacheMiss(domain = 'general', operation = 'get'): void {
  try {
    cacheOperationsTotal.inc({ domain, operation, status: 'miss' });
  } catch (err: any) {
    LoggerUtil.warn('Failed to record cache miss metric', { domain, operation, error: err.message });
  }
}

export function recordCacheError(domain = 'general', operation = 'get'): void {
  try {
    cacheOperationsTotal.inc({ domain, operation, status: 'error' });
  } catch (err: any) {
    LoggerUtil.warn('Failed to record cache error metric', { domain, operation, error: err.message });
  }
}
