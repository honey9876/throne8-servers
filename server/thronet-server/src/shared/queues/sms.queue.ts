/**
 * sms.queue.ts
 * Production SMS Queue with BullMQ + Redis
 * Background SMS processing with retry & rate limiting
 * 
 * @version 2.0.0
 */

import { Queue, QueueOptions, JobsOptions, Job } from 'bullmq';
import LoggerUtil from '@/shared/logger.util';

// ==================== TYPES & INTERFACES ====================

interface SMSData {
    to: string;
    message: string;
    priority?: number;
    delay?: number;
    jobId?: string;
    metadata?: Record<string, any>;
}

interface SMSQueueResult {
    success: boolean;
    jobId: string;
    queuedAt: string;
}

interface SMSQueueStats {
    queue: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    total: number;
    timestamp: string;
}

interface SMSQueueStatsError {
    error: string;
}

// ==================== QUEUE CONFIGURATION ====================

const queueConfig: QueueOptions = {
    connection: {
        host: process.env['REDIS_HOST'] || 'localhost',
        port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
        password: process.env['REDIS_PASSWORD'],
        username: process.env['REDIS_USERNAME'],
        db: parseInt(process.env['REDIS_DB'] || '0', 10),
    },
    defaultJobOptions: {
        attempts: 3, // Retry 3 times
        backoff: {
            type: 'exponential',
            delay: 3000, // Start with 3 seconds
        },
        removeOnComplete: {
            age: 24 * 3600, // Keep completed for 24 hours
            count: 500,
        },
        removeOnFail: {
            age: 7 * 24 * 3600, // Keep failed for 7 days
        },
    } as JobsOptions,
};

// ==================== CREATE SMS QUEUE ====================

let smsQueue: Queue<SMSData> | null = null;

/**
 * Initialize SMS Queue
 * @returns {Queue<SMSData>} SMS Queue instance
 */
export function initializeSMSQueue(): Queue<SMSData> {
    try {
        smsQueue = new Queue<SMSData>('sms-notifications', queueConfig);

        // Event Listeners
        smsQueue.on('error', (error: Error) => {
            LoggerUtil.error('SMS queue error', { error: error.message });
        });

        LoggerUtil.info('✅ SMS queue initialized (BullMQ + Redis)');
        return smsQueue;
    } catch (error : any) {
        LoggerUtil.error('SMS queue initialization failed', {
            error: (error as Error).message,
        });
        throw error;
    }
}

// ==================== QUEUE SMS ====================

/**
 * Add SMS to queue
 * @param {SMSData} smsData - SMS job data
 * @returns {Promise<SMSQueueResult>} Job result
 */
export async function queueSMS(smsData: SMSData): Promise<SMSQueueResult> {
    try {
        if (!smsQueue) {
            throw new Error('SMS queue not initialized');
        }

        // Validate SMS data
        if (!smsData.to || !smsData.message) {
            throw new Error('SMS must have "to" and "message" fields');
        }

        // Add job to queue
        const job: Job<SMSData> = await smsQueue.add('send-sms', smsData, {
            priority: smsData.priority || 5,
            delay: smsData.delay || 0,
            jobId: smsData.jobId || undefined,
        });

        LoggerUtil.info('📱 SMS queued successfully', {
            jobId: job.id,
            to: smsData.to,
            priority: smsData.priority || 5,
        });

        return {
            success: true,
            jobId: job.id as string,
            queuedAt: new Date().toISOString(),
        };
    } catch (error : any) {
        LoggerUtil.error('Failed to queue SMS', {
            error: (error as Error).message,
            to: smsData?.to,
        });
        throw error;
    }
}

// ==================== MONITORING ====================

/**
 * Get SMS queue stats
 * @returns {Promise<SMSQueueStats | SMSQueueStatsError>} Queue statistics
 */
export async function getSMSQueueStats(): Promise<SMSQueueStats | SMSQueueStatsError> {
    try {
        if (!smsQueue) {
            return { error: 'Queue not initialized' };
        }

        const [waiting, active, completed, failed, delayed] = await Promise.all([
            smsQueue.getWaitingCount(),
            smsQueue.getActiveCount(),
            smsQueue.getCompletedCount(),
            smsQueue.getFailedCount(),
            smsQueue.getDelayedCount(),
        ]);

        return {
            queue: 'sms-notifications',
            waiting,
            active,
            completed,
            failed,
            delayed,
            total: waiting + active + completed + failed + delayed,
            timestamp: new Date().toISOString(),
        };
    } catch (error : any) {
        LoggerUtil.error('Failed to get SMS queue stats', {
            error: (error as Error).message,
        });
        return { error: (error as Error).message };
    }
}

/**
 * Clean old SMS jobs
 * @returns {Promise<void>}
 */
export async function cleanSMSQueue(): Promise<void> {
    try {
        if (!smsQueue) {
            throw new Error('Queue not initialized');
        }

        await Promise.all([
            smsQueue.clean(24 * 3600 * 1000, 500, 'completed'),
            smsQueue.clean(7 * 24 * 3600 * 1000, 500, 'failed'),
        ]);

        LoggerUtil.info('SMS queue cleaned successfully');
    } catch (error : any) {
        LoggerUtil.error('Failed to clean SMS queue', {
            error: (error as Error).message,
        });
    }
}

// ==================== SHUTDOWN ====================

/**
 * Close SMS queue gracefully
 * @returns {Promise<void>}
 */
export async function closeSMSQueue(): Promise<void> {
    try {
        if (smsQueue) {
            await smsQueue.close();
            LoggerUtil.info('✅ SMS queue closed');
        }
    } catch (error : any) {
        LoggerUtil.error('SMS queue close failed', { error: (error as Error).message });
    }
}

// ==================== EXPORT ====================

export { smsQueue };

export default {
    initializeSMSQueue,
    queueSMS,
    getSMSQueueStats,
    cleanSMSQueue,
    closeSMSQueue,
};