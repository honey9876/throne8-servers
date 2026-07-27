// // ============================================
// // Email Queue Definition
// // ============================================

// import Queue from 'bull';
// import { queueConfig } from '@/config/cache/queue';
// import logger from '@/shared/logger.util';
// import { EmailJobData, EmailJobResult } from '@/company/interfaces';

// // Create Email Queue
// export const emailQueue = new Queue<EmailJobData>(
//   queueConfig.bull.queues.email.name,
//   {
//     redis: queueConfig.bull.redis,
//     defaultJobOptions: queueConfig.bull.defaultJobOptions,
//     limiter: queueConfig.bull.queues.email.limiter,
//   }
// );

// // =====================================================
// // Queue Event Handlers
// // =====================================================

// emailQueue.on('error', (error) => {
//   logger.error('Email Queue Error:', error.message, error.stack);
// });

// emailQueue.on('waiting', (jobId) => {
//   logger.debug(`Email job ${jobId} is waiting`);
// });

// emailQueue.on('active', (job) => {
//   logger.info(`Processing email job ${job.id}`, {
//     type: job.data.type,
//     to: job.data.to,
//   });
// });

// emailQueue.on('completed', (job, result: EmailJobResult) => {
//   logger.info(`Email job ${job.id} completed`, {
//     type: job.data.type,
//     success: result.success,
//     messageId: result.messageId,
//   });
// });

// emailQueue.on('failed', (job, error) => {
//   logger.error(`Email job ${job?.id} failed`, {
//     type: job?.data?.type,
//     error: error.message,
//     attempts: job?.attemptsMade,
//   });
// });

// emailQueue.on('stalled', (job) => {
//   logger.warn(`Email job ${job.id} stalled`);
// });

// // =====================================================
// // Helper Functions
// // =====================================================

// /**
//  * Add email job to queue
//  */
// export async function addEmailJob(
//   data: EmailJobData,
//   options?: {
//     priority?: number;
//     delay?: number;
//     attempts?: number;
//   }
// ): Promise<void> {
//   try {
//     await emailQueue.add(data, {
//       priority: options?.priority || queueConfig.priorities.normal,
//       delay: options?.delay,
//       attempts: options?.attempts || 3,
//     });

//     logger.info('Email job added to queue', {
//       type: data.type,
//       to: data.to,
//     });
//   } catch (error: any) {
//     logger.error('Failed to add email job to queue', error);
//     throw error;
//   }
// }

// /**
//  * Get queue stats
//  */
// export async function getEmailQueueStats() {
//   const [waiting, active, completed, failed, delayed] = await Promise.all([
//     emailQueue.getWaitingCount(),
//     emailQueue.getActiveCount(),
//     emailQueue.getCompletedCount(),
//     emailQueue.getFailedCount(),
//     emailQueue.getDelayedCount(),
//   ]);

//   return {
//     waiting,
//     active,
//     completed,
//     failed,
//     delayed,
//     paused: await emailQueue.isPaused(),
//   };
// }

// /**
//  * Clean old jobs
//  */
// export async function cleanEmailQueue() {
//   await emailQueue.clean(3600000, 'completed'); // Remove completed jobs older than 1 hour
//   await emailQueue.clean(86400000, 'failed'); // Remove failed jobs older than 24 hours
//   logger.info('Email queue cleaned');
// }

// /**
//  * Pause queue
//  */
// export async function pauseEmailQueue() {
//   await emailQueue.pause();
//   logger.info('Email queue paused');
// }

// /**
//  * Resume queue
//  */
// export async function resumeEmailQueue() {
//   await emailQueue.resume();
//   logger.info('Email queue resumed');
// }

// export default emailQueue;