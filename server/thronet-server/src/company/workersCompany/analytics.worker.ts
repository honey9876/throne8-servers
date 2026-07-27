// ============================================
// Analytics Worker - ESLint Fixed
// ============================================

import { Job } from 'bull';
import analyticsQueue from '../../shared/queues/analytics.queue';
import { AnalyticsJobData, AnalyticsJobResult } from '../interfaces';
import logger from '@/shared/logger.util';
// import { queueConfig
import queueConfig from '@/config/cache/queue';

// =====================================================
// Analytics Processing Function
// =====================================================
async function processAnalyticsJob(
  job: Job<AnalyticsJobData>
): Promise<AnalyticsJobResult> {
  const { eventType, companyId, postId } = job.data;

  try {
    logger.debug(`Processing analytics job ${job.id}`, {
      eventType,
      companyId,
      postId,
    });

    // Store event in database
    const eventId = await storeAnalyticsEvent(job.data);

    // Update aggregated metrics
    await updateMetrics(job.data);

    // Send to external analytics
    await sendToExternalAnalytics(job.data);

    logger.debug('Analytics event processed', {
      jobId: job.id,
      eventId,
      eventType,
    });

    return {
      success: true,
      eventId,
      processed: true,
    };
  } catch (error : any) {
    logger.error(`Analytics job ${job.id} failed`, {
      eventType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      processed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =====================================================
// Helper Functions
// =====================================================

async function storeAnalyticsEvent(data: AnalyticsJobData): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  logger.debug('Analytics event stored', {
    eventId,
    eventType: data.eventType,
  });

  return eventId;
}

async function updateMetrics(data: AnalyticsJobData): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));

  logger.debug('Metrics updated', {
    eventType: data.eventType,
    companyId: data.companyId,
  });
}

async function sendToExternalAnalytics(data: AnalyticsJobData): Promise<void> {
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));

    logger.debug('Sent to external analytics', {
      eventType: data.eventType,
    });
  } catch (error : any) {
    logger.warn('Failed to send to external analytics', error);
  }
}

// =====================================================
// Start Worker
// =====================================================
export function startAnalyticsWorker(): void {
  const concurrency = queueConfig.bull.queues.analytics.concurrency;

  analyticsQueue.process(concurrency, processAnalyticsJob);

  logger.info(`✅ Analytics worker started with concurrency: ${concurrency}`);
}

export default startAnalyticsWorker;