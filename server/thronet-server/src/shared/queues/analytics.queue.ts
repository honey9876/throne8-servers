
// // ============================================
// // Analytics Queue Definition
// // ============================================

// import Queue from 'bull';
// import { queueConfig } from '@/config/cache/queue';
// import logger from '@/shared/logger.util';
// import { AnalyticsJobData, AnalyticsJobResult } from '@/company/interfaces';

// // Create Analytics Queue
// export const analyticsQueue = new Queue<AnalyticsJobData>(
//   queueConfig.bull.queues.analytics.name,
//   {
//     redis: queueConfig.bull.redis,
//     defaultJobOptions: queueConfig.bull.defaultJobOptions,
//     limiter: queueConfig.bull.queues.analytics.limiter,
//   }
// );

// // =====================================================
// // Queue Event Handlers
// // =====================================================

// analyticsQueue.on('error', (error) => {
//   logger.error('Analytics Queue Error:', error.message);
// });

// analyticsQueue.on('active', (job) => {
//   logger.debug(`Processing analytics job ${job.id}`, {
//     eventType: job.data.eventType,
//   });
// });

// analyticsQueue.on('completed', (job, result: AnalyticsJobResult) => {
//   logger.debug(`Analytics job ${job.id} completed`, {
//     success: result.success,
//   });
// });

// analyticsQueue.on('failed', (job, error) => {
//   logger.error(`Analytics job ${job?.id} failed`, {
//     eventType: job?.data?.eventType,
//     error: error.message,
//   });
// });

// // =====================================================
// // Helper Functions
// // =====================================================

// /**
//  * Track analytics event
//  */
// export async function trackAnalyticsEvent(
//   data: AnalyticsJobData
// ): Promise<void> {
//   try {
//     await analyticsQueue.add(data, {
//       priority: queueConfig.priorities.low, // Analytics is lower priority
//       attempts: 2, // Fewer retries for analytics
//     });

//     logger.debug('Analytics event tracked', {
//       eventType: data.eventType,
//     });
//   } catch (error: any) {
//     logger.error('Failed to track analytics event', error);
//     // Don't throw - analytics failures shouldn't break app
//   }
// }

// /**
//  * Track batch events
//  */
// export async function trackBatchAnalytics(
//   events: AnalyticsJobData[]
// ): Promise<void> {
//   try {
//     const jobs = events.map((event) => ({
//       data: event,
//       opts: {
//         priority: queueConfig.priorities.low,
//         attempts: 2,
//       },
//     }));

//     await analyticsQueue.addBulk(jobs);

//     logger.info('Batch analytics tracked', { count: events.length });
//   } catch (error: any) {
//     logger.error('Failed to track batch analytics', error);
//   }
// }

// /**
//  * Get queue stats
//  */
// export async function getAnalyticsQueueStats() {
//   const [waiting, active, completed, failed] = await Promise.all([
//     analyticsQueue.getWaitingCount(),
//     analyticsQueue.getActiveCount(),
//     analyticsQueue.getCompletedCount(),
//     analyticsQueue.getFailedCount(),
//   ]);

//   return {
//     waiting,
//     active,
//     completed,
//     failed,
//     paused: await analyticsQueue.isPaused(),
//   };
// }

// export default analyticsQueue;