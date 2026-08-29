// ============================================
// Export All Workers
// ============================================

import { Queue } from 'bull';
import { startEmailWorker } from './email.worker';
import { startNotificationWorker } from './notification.worker';
import { startAnalyticsWorker } from './analytics.worker';
import { startMediaWorker } from './media.worker';
import { startPostWorker } from './post.worker';
import logger from '@/shared/logger.util';

// Import all queues to keep them in memory
import emailQueue from '../../shared/queues/email.queue';
import notificationQueue from '../../shared/queues/notification.queue';
import analyticsQueue from '../../shared/queues/analytics.queue';
import mediaQueue from '../../shared/queues/media.queue';
import postQueue from '../../shared/queues/post.queue';

// =====================================================
// Store Queue Instances (PREVENTS GARBAGE COLLECTION!)
// =====================================================
const activeQueues: Queue[] = [
  emailQueue,
  notificationQueue,
  analyticsQueue,
  mediaQueue,
  postQueue,
];

// Store reference to prevent GC
let isInitialized = false;

// =====================================================
// Start All Workers
// =====================================================
export function startAllWorkers(): void {
  if (isInitialized) {
    logger.warn('⚠️ Workers already initialized, skipping...');
    return;
  }

  logger.info('🚀 Starting all queue workers...');

  try {
    // Start all workers
    startEmailWorker();
    startNotificationWorker();
    startAnalyticsWorker();
    startMediaWorker();
    startPostWorker();

    isInitialized = true;

    logger.info(`✅ All ${activeQueues.length} workers started successfully`);
    
    // Setup event listeners
    setupQueueListeners();
    
    // CRITICAL: Keep process alive
    keepProcessAlive();

  } catch (error : any) {
    logger.error('❌ Failed to start workers', error);
    throw error;
  }
}

// =====================================================
// Setup Queue Event Listeners
// =====================================================
function setupQueueListeners(): void {
  activeQueues.forEach((queue) => {
    queue.on('error', (error) => {
      logger.error(`❌ Queue ${queue.name} error:`, error);
    });

    queue.on('failed', (job, err) => {
      logger.error(`❌ Job ${job.id} in ${queue.name} failed:`, err.message);
    });

    queue.on('completed', (job) => {
      logger.debug(`✅ Job ${job.id} in ${queue.name} completed`);
    });
  });

  logger.info('📡 Queue event listeners attached');
}

// =====================================================
// Keep Process Alive - MOST IMPORTANT!
// =====================================================
function keepProcessAlive(): void {
  // Method 1: Stdin resume (prevents Node.js exit)
  process.stdin.resume();
  
  // Method 2: Heartbeat interval
  const heartbeat = setInterval(() => {
    logger.debug(`💓 Worker heartbeat - ${activeQueues.length} queues active`);
  }, 60000);
  
  // Don't let interval prevent graceful shutdown
  heartbeat.unref();
  
  // Method 3: Infinite timer (backup)
  const keepAlive = setInterval(() => {
    // Do nothing, just keep alive
  }, 2147483647); // Max 32-bit integer
  
  keepAlive.unref();
  
  logger.info('🔄 Worker process locked - will stay alive indefinitely');
}

// =====================================================
// Get Worker Stats
// =====================================================
export async function getWorkerStats() {
  const stats = await Promise.all(
    activeQueues.map(async (queue) => {
      try {
        const jobCounts = await queue.getJobCounts();
        const isPaused = await queue.isPaused();
        
        return {
          name: queue.name,
          isPaused,
          jobs: jobCounts,
        };
      } catch (error : any) {
        return {
          name: queue.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    })
  );
  
  return stats;
}

// =====================================================
// Graceful Shutdown
// =====================================================
export async function stopAllWorkers(): Promise<void> {
  logger.info('🛑 Stopping all workers...');

  try {
    await Promise.all(
      activeQueues.map(async (queue) => {
        logger.info(`⏸️ Closing queue: ${queue.name}`);
        await queue.close();
      })
    );

    isInitialized = false;
    logger.info('✅ All workers stopped gracefully');
  } catch (error : any) {
    logger.error('❌ Error stopping workers', error);
    throw error;
  }
}

// Export individual workers
export { startEmailWorker } from './email.worker';
export { startNotificationWorker } from './notification.worker';
export { startAnalyticsWorker } from './analytics.worker';
export { startMediaWorker } from './media.worker';
export { startPostWorker } from './post.worker';

export default {
  startAllWorkers,
  stopAllWorkers,
  getWorkerStats,
};