// // ============================================
// // Notification Queue Definition
// // ============================================

// import Queue from 'bull';
// import { queueConfig } from '@/config/cache/queue';
// import { NotificationJobData, NotificationJobResult } from '@/company/interfaces';
// import logger from '@/shared/logger.util';

// // Create Notification Queue
// export const notificationQueue = new Queue<NotificationJobData>(
//   queueConfig.bull.queues.notification.name,
//   {
//     redis: queueConfig.bull.redis,
//     defaultJobOptions: queueConfig.bull.defaultJobOptions,
//     limiter: queueConfig.bull.queues.notification.limiter,
//   }
// );

// // =====================================================
// // Queue Event Handlers
// // =====================================================

// notificationQueue.on('error', (error) => {
//   logger.error('Notification Queue Error:', error.message);
// });

// notificationQueue.on('active', (job) => {
//   logger.info(`Processing notification job ${job.id}`, {
//     type: job.data.type,
//     userId: job.data.userId,
//   });
// });

// notificationQueue.on('completed', (job, result: NotificationJobResult) => {
//   logger.info(`Notification job ${job.id} completed`, {
//     type: job.data.type,
//     success: result.success,
//     channels: result.channels,
//   });
// });

// notificationQueue.on('failed', (job, error) => {
//   logger.error(`Notification job ${job?.id} failed`, {
//     type: job?.data?.type,
//     error: error.message,
//   });
// });

// // =====================================================
// // Helper Functions
// // =====================================================

// /**
//  * Add notification job to queue
//  */
// export async function addNotificationJob(
//   data: NotificationJobData,
//   options?: {
//     priority?: number;
//     delay?: number;
//   }
// ): Promise<void> {
//   try {
//     await notificationQueue.add(data, {
//       priority: options?.priority || queueConfig.priorities.normal,
//       delay: options?.delay,
//     });

//     logger.info('Notification job added', {
//       type: data.type,
//       userId: data.userId,
//     });
//   } catch (error : any) {
//     logger.error('Failed to add notification job', error);
//     throw error;
//   }
// }

// /**
//  * Get queue stats
//  */
// export async function getNotificationQueueStats() {
//   const [waiting, active, completed, failed, delayed] = await Promise.all([
//     notificationQueue.getWaitingCount(),
//     notificationQueue.getActiveCount(),
//     notificationQueue.getCompletedCount(),
//     notificationQueue.getFailedCount(),
//     notificationQueue.getDelayedCount(),
//   ]);

//   return {
//     waiting,
//     active,
//     completed,
//     failed,
//     delayed,
//     paused: await notificationQueue.isPaused(),
//   };
// }

// export default notificationQueue;