// // ============================================
// // Post Queue Definition - ESLint Fixed
// // ============================================

// import Queue from 'bull';
// import { queueConfig } from '@/config/cache/queue';
// import { PostJobData, PostJobResult, PostJobType } from '@/company/interfaces';
// import logger from '@/shared/logger.util';

// // Create Post Queue
// export const postQueue = new Queue<PostJobData>(
//   queueConfig.bull.queues.post.name,
//   {
//     redis: queueConfig.bull.redis,
//     defaultJobOptions: queueConfig.bull.defaultJobOptions,
//     limiter: queueConfig.bull.queues.post.limiter,
//   }
// );

// // =====================================================
// // Queue Event Handlers
// // =====================================================

// postQueue.on('error', (error) => {
//   logger.error('Post Queue Error:', error.message);
// });

// postQueue.on('active', (job) => {
//   logger.info(`Processing post job ${job.id}`, {
//     type: job.data.type,
//     postId: job.data.postId,
//     action: job.data.action,
//   });
// });

// postQueue.on('completed', (job, result: PostJobResult) => {
//   logger.info(`Post job ${job.id} completed`, {
//     type: job.data.type,
//     success: result.success,
//     action: result.action,
//   });
// });

// postQueue.on('failed', (job, error) => {
//   logger.error(`Post job ${job?.id} failed`, {
//     type: job?.data?.type,
//     postId: job?.data?.postId,
//     error: error.message,
//   });
// });

// // =====================================================
// // Helper Functions
// // =====================================================

// /**
//  * Add post processing job
//  */
// export async function addPostJob(
//   data: PostJobData,
//   options?: {
//     priority?: number;
//     delay?: number;
//   }
// ): Promise<void> {
//   try {
//     await postQueue.add(data, {
//       priority: options?.priority || queueConfig.priorities.normal,
//       delay: options?.delay,
//     });

//     logger.info('Post job added', {
//       type: data.type,
//       postId: data.postId,
//     });
//   } catch (error : any) {
//     logger.error('Failed to add post job', error);
//     throw error;
//   }
// }

// /**
//  * Schedule post for later
//  */
// export async function schedulePost(
//   postId: string,
//   companyId: string,
//   scheduledFor: Date
// ): Promise<void> {
//   const delay = scheduledFor.getTime() - Date.now();

//   if (delay <= 0) {
//     throw new Error('Scheduled time must be in the future');
//   }

//   await addPostJob(
//     {
//       type: PostJobType.SCHEDULE_POST,
//       postId,
//       companyId,
//       action: 'publish',
//       scheduledFor,
//     },
//     {
//       delay,
//       priority: queueConfig.priorities.high,
//     }
//   );

//   logger.info('Post scheduled', {
//     postId,
//     scheduledFor,
//   });
// }

// /**
//  * Get queue stats
//  */
// export async function getPostQueueStats() {
//   const [waiting, active, completed, failed, delayed] = await Promise.all([
//     postQueue.getWaitingCount(),
//     postQueue.getActiveCount(),
//     postQueue.getCompletedCount(),
//     postQueue.getFailedCount(),
//     postQueue.getDelayedCount(),
//   ]);

//   return {
//     waiting,
//     active,
//     completed,
//     failed,
//     delayed,
//     paused: await postQueue.isPaused(),
//   };
// }

// export default postQueue;