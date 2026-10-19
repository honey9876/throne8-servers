/**
 * notification.worker.ts
 * BullMQ Worker for background notification processing
 */

import { Worker, Job } from 'bullmq';
import { LoggerUtil } from '@/shared/logger.util';
import { getQueueConnectionConfig } from '../queueConnection';
import { NotificationJobPayload } from '../notification.queue';

const QUEUE_NAME = 'notification-queue';

export function createNotificationWorker(concurrency = 5): Worker<NotificationJobPayload> {
  const connection = getQueueConnectionConfig();

  const worker = new Worker<NotificationJobPayload>(
    QUEUE_NAME,
    async (job: Job<NotificationJobPayload>) => {
      const { userId, title, message, type } = job.data;

      LoggerUtil.info('[NotificationWorker] Processing notification job', {
        jobId: job.id,
        userId,
        type,
      });

      // Emits socket event if socket server is initialized
      try {
        const { emitToUser } = await import('@/socket/emitter');
        emitToUser(userId, 'notification:new', {
          id: job.id,
          title,
          message,
          type,
          data: job.data.data,
          timestamp: new Date().toISOString(),
        });
      } catch (socketErr: any) {
        // Socket may not be active in pure worker process; non-critical
        LoggerUtil.debug(`[NotificationWorker] Socket dispatch skipped: ${socketErr.message}`);
      }

      return { success: true, processedAt: new Date().toISOString() };
    },
    {
      connection,
      concurrency,
    }
  );

  worker.on('completed', (job) => {
    LoggerUtil.info('[NotificationWorker] Job completed', {
      jobId: job.id,
      userId: job.data.userId,
    });
  });

  worker.on('failed', (job, err) => {
    LoggerUtil.error('[NotificationWorker] Job failed', {
      jobId: job?.id,
      userId: job?.data?.userId,
      attempt: job?.attemptsMade,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    LoggerUtil.error(`[NotificationWorker] Worker error: ${err.message}`);
  });

  return worker;
}
