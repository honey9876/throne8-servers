// // ============================================
// // Media Queue Definition
// // ============================================

// import Queue from 'bull';
// import { queueConfig } from '@/config/cache/queue';
// import { MediaJobData, MediaJobResult } from '@/company/interfaces';
// import logger from '@/shared/logger.util';

// // Create Media Queue
// export const mediaQueue = new Queue<MediaJobData>(
//   queueConfig.bull.queues.media.name,
//   {
//     redis: queueConfig.bull.redis,
//     defaultJobOptions: {
//       ...queueConfig.bull.defaultJobOptions,
//       timeout: 300000, // 5 minutes for media processing
//     },
//     limiter: queueConfig.bull.queues.media.limiter,
//   }
// );

// // =====================================================
// // Queue Event Handlers
// // =====================================================

// mediaQueue.on('error', (error) => {
//   logger.error('Media Queue Error:', error.message);
// });

// mediaQueue.on('active', (job) => {
//   logger.info(`Processing media job ${job.id}`, {
//     type: job.data.type,
//     filename: job.data.filename,
//     size: job.data.size,
//   });
// });

// mediaQueue.on('completed', (job, result: MediaJobResult) => {
//   logger.info(`Media job ${job.id} completed`, {
//     type: job.data.type,
//     success: result.success,
//     url: result.url,
//   });
// });

// mediaQueue.on('failed', (job, error) => {
//   logger.error(`Media job ${job?.id} failed`, {
//     type: job?.data?.type,
//     filename: job?.data?.filename,
//     error: error.message,
//   });
// });

// mediaQueue.on('progress', (job, progress) => {
//   logger.debug(`Media job ${job.id} progress: ${progress}%`);
// });

// // =====================================================
// // Helper Functions
// // =====================================================

// /**
//  * Add media processing job
//  */
// export async function addMediaJob(
//   data: MediaJobData,
//   options?: {
//     priority?: number;
//   }
// ): Promise<void> {
//   try {
//     await mediaQueue.add(data, {
//       priority: options?.priority || queueConfig.priorities.high,
//       attempts: 2, // Media jobs - fewer retries
//       timeout: 300000, // 5 minutes
//     });

//     logger.info('Media job added', {
//       type: data.type,
//       filename: data.filename,
//     });
//   } catch (error : any) {
//     logger.error('Failed to add media job', error.message);
//     throw error;
//   }
// }

// /**
//  * Get queue stats
//  */
// export async function getMediaQueueStats() {
//   const [waiting, active, completed, failed, delayed] = await Promise.all([
//     mediaQueue.getWaitingCount(),
//     mediaQueue.getActiveCount(),
//     mediaQueue.getCompletedCount(),
//     mediaQueue.getFailedCount(),
//     mediaQueue.getDelayedCount(),
//   ]);

//   return {
//     waiting,
//     active,
//     completed,
//     failed,
//     delayed,
//     paused: await mediaQueue.isPaused(),
//   };
// }

// export default mediaQueue;