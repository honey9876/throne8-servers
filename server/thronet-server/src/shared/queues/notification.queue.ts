/**
 * notification.queue.ts
 * BullMQ Notification Queue Implementation
 */

import { Queue, JobsOptions } from 'bullmq';
import crypto from 'crypto';
import { LoggerUtil } from '@/shared/logger.util';
import { getQueueConnectionConfig } from './queueConnection';

export interface NotificationJobPayload {
  userId: string;
  title: string;
  message: string;
  type?: string;
  channels?: string[];
  data?: Record<string, any>;
  jobId?: string;
  idempotencyKey?: string;
  [key: string]: any;
}

export interface QueueNotificationResult {
  success: boolean;
  jobId?: string;
  queuedAt: string;
}

const QUEUE_NAME = 'notification-queue';

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    age: 86400,
    count: 10000,
  },
  removeOnFail: {
    age: 7 * 86400,
  },
};

let notificationQueueInstance: Queue<NotificationJobPayload> | null = null;

export function getNotificationQueue(): Queue<NotificationJobPayload> {
  if (!notificationQueueInstance) {
    const connection = getQueueConnectionConfig();
    notificationQueueInstance = new Queue<NotificationJobPayload>(QUEUE_NAME, {
      connection,
      defaultJobOptions,
    });
  }
  return notificationQueueInstance;
}

export async function enqueueNotification(data: NotificationJobPayload): Promise<QueueNotificationResult> {
  const queue = getNotificationQueue();
  const computedJobId = data.jobId || data.idempotencyKey || `notif_${data.userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const job = await queue.add('send-notification', data, {
    jobId: computedJobId,
  });

  return {
    success: true,
    jobId: job.id,
    queuedAt: new Date().toISOString(),
  };
}

export async function closeNotificationQueue(): Promise<void> {
  if (notificationQueueInstance) {
    await notificationQueueInstance.close();
    notificationQueueInstance = null;
  }
}

export const notificationQueue = {
  add: async (nameOrData: any, maybeData?: any) => {
    const payload = maybeData || nameOrData;
    return enqueueNotification(payload);
  },
  process: (_concurrencyOrHandler: any, _maybeHandler?: any) => {
    // BullMQ processing is handled in worker.ts
  },
  close: closeNotificationQueue,
};

export default notificationQueue;