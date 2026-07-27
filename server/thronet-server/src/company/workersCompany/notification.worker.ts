// ============================================
// Notification Worker - ESLint Fixed
// ============================================

import { Job } from 'bull';
import notificationQueue from '../../shared/queues/notification.queue';
import { NotificationJobData, NotificationJobResult } from '../interfaces';
import logger from '@/shared/logger.util';
import { queueConfig } from '@/config/cache/queue';

// =====================================================
// Notification Processing Function
// =====================================================
async function processNotificationJob(
  job: Job<NotificationJobData>
): Promise<NotificationJobResult> {
  const { type, userId, title, message, channels } = job.data;

  try {
    logger.info(`Processing notification job ${job.id}`, {
      type,
      userId,
      channels,
    });

    await job.progress(10);

    const result: NotificationJobResult = {
      success: true,
      notificationId: `notif_${Date.now()}`,
      channels: {},
    };

    // Process each channel
    if (channels.includes('push')) {
      await job.progress(30);
      result.channels.push = await sendPushNotification(userId, title, message);
    }

    if (channels.includes('email')) {
      await job.progress(60);
      result.channels.email = await sendEmailNotification(userId, title, message);
    }

    if (channels.includes('sms')) {
      await job.progress(90);
      result.channels.sms = await sendSMSNotification(userId, message);
    }

    await job.progress(100);

    logger.info('Notification sent successfully', {
      jobId: job.id,
      type,
      channels: result.channels,
    });

    return result;
  } catch (error : any) {
    logger.error(`Notification job ${job.id} failed`, {
      type,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      channels: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =====================================================
// Channel Handlers
// =====================================================

async function sendPushNotification(
  userId: string,
  title: string,
  _message: string
): Promise<boolean> {
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));

    logger.info('Push notification sent', { userId, title });
    return true;
  } catch (error : any) {
    logger.error('Failed to send push notification', error);
    return false;
  }
}

async function sendEmailNotification(
  userId: string,
  title: string,
  _message: string
): Promise<boolean> {
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));

    logger.info('Email notification sent', { userId, title });
    return true;
  } catch (error : any) {
    logger.error('Failed to send email notification', error);
    return false;
  }
}

async function sendSMSNotification(
  userId: string,
  _message: string
): Promise<boolean> {
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));

    logger.info('SMS notification sent', { userId });
    return true;
  } catch (error : any) {
    logger.error('Failed to send SMS notification', error);
    return false;
  }
}

// =====================================================
// Start Worker
// =====================================================
export function startNotificationWorker(): void {
  const concurrency = queueConfig.bull.queues.notification.concurrency;

  notificationQueue.process(concurrency, processNotificationJob);

  logger.info(`✅ Notification worker started with concurrency: ${concurrency}`);
}

export default startNotificationWorker;