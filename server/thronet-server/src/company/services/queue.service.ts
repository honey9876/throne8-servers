// ============================================
// QUEUE SERVICE - Queue Management & Operations
// ============================================

import Queue from 'bull';
import {
  EmailJobData,
  NotificationJobData,
  AnalyticsJobData,
  MediaJobData,
  PostJobData,
  QueueJobOptions,
  QueueStats,
} from '../interfaces';
import { allQueues } from '@/shared/queues';
import logger from '@/shared/logger.util';
// import { createCircuitBreaker
import CircuitBreaker from 'opossum';
import { createCircuitBreaker } from '@/shared/utils/company';

class QueueService {
  private queues: Map<string, Queue.Queue>;
  private circuitBreakers: Map<string, CircuitBreaker<unknown[], unknown>>;

  constructor() {
    this.queues = new Map();
    this.circuitBreakers = new Map();
    this.initializeQueues();
  }

  /**
   * Initialize all queues
   */
  private initializeQueues(): void {
    try {
      this.queues.set('email', allQueues.emailQueue);
      this.queues.set('notification', allQueues.notificationQueue);
      this.queues.set('analytics', allQueues.analyticsQueue);
      this.queues.set('media', allQueues.mediaQueue);
      this.queues.set('post', allQueues.postQueue);

      logger.info('All queues initialized successfully');
    } catch (error : any) {
      logger.error('Failed to initialize queues', { error });
      throw error;
    }
  }

  /**
   * Get circuit breaker for queue operations
   */
  private getCircuitBreaker(queueName: string): CircuitBreaker<unknown[], unknown> {
    if (!this.circuitBreakers.has(queueName)) {
      const breaker = createCircuitBreaker(
        async (operation: () => Promise<unknown>) => operation(),
        {
          timeout: 3000,
          errorThresholdPercentage: 70,
          resetTimeout: 20000,
          name: `queue-${queueName}`,
        }
      );
      this.circuitBreakers.set(queueName, breaker);
    }
    return this.circuitBreakers.get(queueName)!;
  }

  // =====================================================
  // EMAIL QUEUE OPERATIONS
  // =====================================================

  async addEmailJob(data: EmailJobData, options?: QueueJobOptions): Promise<Queue.Job> {
    const breaker = this.getCircuitBreaker('email');
    return breaker.fire(async () => {
      const job = await this.queues.get('email')!.add(data, {
        priority: options?.priority || 3,
        delay: options?.delay,
        attempts: options?.attempts || 3,
        backoff: options?.backoff || { type: 'exponential', delay: 2000 },
        removeOnComplete: options?.removeOnComplete ?? true,
        removeOnFail: options?.removeOnFail ?? false,
      });

      logger.info('Email job added to queue', { jobId: job.id, type: data.type });
      return job;
    }) as Promise<Queue.Job>;
  }

  // =====================================================
  // NOTIFICATION QUEUE OPERATIONS
  // =====================================================

  async addNotificationJob(
    data: NotificationJobData,
    options?: QueueJobOptions
  ): Promise<Queue.Job> {
    const breaker = this.getCircuitBreaker('notification');
    return breaker.fire(async () => {
      const job = await this.queues.get('notification')!.add(data, {
        priority: options?.priority || data.priority || 3,
        delay: options?.delay,
        attempts: options?.attempts || 3,
        backoff: options?.backoff || { type: 'exponential', delay: 2000 },
      });

      logger.info('Notification job added', { jobId: job.id, type: data.type });
      return job;
    }) as Promise<Queue.Job>;
  }

  // =====================================================
  // ANALYTICS QUEUE OPERATIONS
  // =====================================================

  async addAnalyticsJob(
    data: AnalyticsJobData,
    options?: QueueJobOptions
  ): Promise<Queue.Job> {
    const breaker = this.getCircuitBreaker('analytics');
    return breaker.fire(async () => {
      const job = await this.queues.get('analytics')!.add(data, {
        priority: options?.priority || 4, // Lower priority
        attempts: options?.attempts || 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: true,
      });

      logger.debug('Analytics job added', { jobId: job.id, eventType: data.eventType });
      return job;
    }) as Promise<Queue.Job>;
  }

  // =====================================================
  // MEDIA QUEUE OPERATIONS
  // =====================================================

  async addMediaJob(data: MediaJobData, options?: QueueJobOptions): Promise<Queue.Job> {
    const breaker = this.getCircuitBreaker('media');
    return breaker.fire(async () => {
      const job = await this.queues.get('media')!.add(data, {
        priority: options?.priority || 2, // Higher priority
        attempts: options?.attempts || 3,
        timeout: 60000, // 1 minute timeout
        backoff: { type: 'exponential', delay: 3000 },
      });

      logger.info('Media job added', { jobId: job.id, type: data.type });
      return job;
    }) as Promise<Queue.Job>;
  }

  // =====================================================
  // POST QUEUE OPERATIONS
  // =====================================================

  async addPostJob(data: PostJobData, options?: QueueJobOptions): Promise<Queue.Job> {
    const breaker = this.getCircuitBreaker('post');
    return breaker.fire(async () => {
      const job = await this.queues.get('post')!.add(data, {
        priority: options?.priority || 3,
        delay: options?.delay,
        attempts: options?.attempts || 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      logger.info('Post job added', { jobId: job.id, type: data.type });
      return job;
    }) as Promise<Queue.Job>;
  }

  // =====================================================
  // QUEUE STATS & MONITORING
  // =====================================================

  async getQueueStats(queueName: string): Promise<QueueStats> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: isPaused,
    };
  }

  async getAllQueueStats(): Promise<Record<string, QueueStats>> {
    const stats: Record<string, QueueStats> = {};

    for (const [name] of this.queues) {
      stats[name] = await this.getQueueStats(name);
    }

    return stats;
  }

  // =====================================================
  // QUEUE MANAGEMENT
  // =====================================================

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.pause();
    logger.warn(`Queue '${queueName}' paused`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.resume();
    logger.info(`Queue '${queueName}' resumed`);
  }

  async cleanQueue(
    queueName: string,
    grace: number = 0,
    status?: 'completed' | 'failed'
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    if (status) {
      await queue.clean(grace, status);
    } else {
      await queue.clean(grace, 'completed');
      await queue.clean(grace, 'failed');
    }

    logger.info(`Queue '${queueName}' cleaned`, { grace, status });
  }

  async emptyQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.empty();
    logger.warn(`Queue '${queueName}' emptied`);
  }

  // =====================================================
  // JOB OPERATIONS
  // =====================================================

  async getJob(queueName: string, jobId: string): Promise<Queue.Job | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    return queue.getJob(jobId);
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (job) {
      await job.remove();
      logger.info('Job removed from queue', { queueName, jobId });
    }
  }

  async retryJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (job) {
      await job.retry();
      logger.info('Job retried', { queueName, jobId });
    }
  }

  // =====================================================
  // GRACEFUL SHUTDOWN
  // =====================================================

  async closeAllQueues(): Promise<void> {
    logger.info('Closing all queues...');

    const closePromises = Array.from(this.queues.values()).map((queue) => queue.close());

    await Promise.all(closePromises);
    logger.info('All queues closed successfully');
  }

  // =====================================================
  // HEALTH CHECK
  // =====================================================

  async healthCheck(): Promise<{ healthy: boolean; queues: Record<string, boolean> }> {
    const health: Record<string, boolean> = {};

    for (const [name, queue] of this.queues) {
      try {
        await queue.isReady();
        health[name] = true;
      } catch (error : any) {
        logger.error(`Queue '${name}' health check failed`, { error });
        health[name] = false;
      }
    }

    const healthy = Object.values(health).every((status) => status === true);

    return { healthy, queues: health };
  }
}

export default new QueueService();
