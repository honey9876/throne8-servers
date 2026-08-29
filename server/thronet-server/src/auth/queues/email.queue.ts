/**
 * email.queue.ts
 * Production Email Queue with BullMQ + Redis
 * Background email processing with retry & monitoring
 */

import { Queue, JobsOptions, QueueOptions } from 'bullmq';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== TYPES & INTERFACES ====================

export interface EmailJobData {
    to: string;
    subject: string;
    template?: string;
    data?: Record<string, unknown>;
    priority?: number;
    delay?: number;
    jobId?: string;
    [key: string]: unknown;
}

export interface QueueEmailResult {
    success: boolean;
    jobId: string | undefined;
    queuedAt: string;
}

export interface EmailQueueStats {
    queue: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    total: number;
    timestamp: string;
    error?: string;
}

export interface QueueConfig extends QueueOptions {
    connection: {
        host: string;
        port: number;
        password?: string;
        username?: string;
        db: number;
    };
    defaultJobOptions: JobsOptions;
}

// ==================== QUEUE CONFIGURATION ====================

const queueConfig: QueueConfig = {
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        username: process.env.REDIS_USERNAME,
        db: parseInt(process.env.REDIS_DB || '0'),
    },
    defaultJobOptions: {
        attempts: 3, // Retry 3 times
        backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 seconds, then 10s, 20s
        },
        removeOnComplete: {
            age: 24 * 3600, // Keep completed jobs for 24 hours
            count: 1000,    // Keep last 1000 completed jobs
        },
        removeOnFail: {
            age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
    },
};

// ==================== CREATE EMAIL QUEUE ====================

let emailQueue: Queue | null = null;

/**
 * Initialize Email Queue
 */
export function initializeEmailQueue(): Queue {
    try {
        emailQueue = new Queue('email-notifications', queueConfig);

        // Event Listeners
        emailQueue.on('error', (error: Error) => {
            LoggerUtil.error('Email queue error', { error: error.message });
        });

        LoggerUtil.info('✅ Email queue initialized (BullMQ + Redis)');
        return emailQueue;
    } catch (error: unknown) {
        LoggerUtil.error('Email queue initialization failed', {
            error: (error as Error).message,
        });
        throw error;
    }
}

// ==================== QUEUE EMAIL ====================

/**
 * Add email to queue
 * @param emailData - Email job data
 * @returns Job result
 */
export async function queueEmail(emailData: EmailJobData): Promise<QueueEmailResult> {
    try {
        if (!emailQueue) {
            throw new Error('Email queue not initialized');
        }

        // Validate email data
        if (!emailData.to || !emailData.subject) {
            throw new Error('Email must have "to" and "subject" fields');
        }

        // Add job to queue
        const job = await emailQueue.add('send-email', emailData, {
            priority: emailData.priority ?? 5, // 1 = highest, 10 = lowest
            delay: emailData.delay ?? 0,       // Optional delay in milliseconds
            jobId: emailData.jobId,            // Optional custom job ID
        });

        LoggerUtil.info('📧 Email queued successfully', {
            jobId: job.id,
            to: emailData.to,
            template: emailData.template,
            priority: emailData.priority ?? 5,
        });

        return {
            success: true,
            jobId: job.id,
            queuedAt: new Date().toISOString(),
        };
    } catch (error: unknown) {
        LoggerUtil.error('Failed to queue email', {
            error: (error as Error).message,
            to: emailData?.to,
        });
        throw error;
    }
}

// ==================== MONITORING ====================

/**
 * Get email queue stats
 */
export async function getEmailQueueStats(): Promise<EmailQueueStats> {
    try {
        if (!emailQueue) {
            return { error: 'Queue not initialized' } as EmailQueueStats;
        }

        const [waiting, active, completed, failed, delayed] = await Promise.all([
            emailQueue.getWaitingCount(),
            emailQueue.getActiveCount(),
            emailQueue.getCompletedCount(),
            emailQueue.getFailedCount(),
            emailQueue.getDelayedCount(),
        ]);

        return {
            queue: 'email-notifications',
            waiting,
            active,
            completed,
            failed,
            delayed,
            total: waiting + active + completed + failed + delayed,
            timestamp: new Date().toISOString(),
        };
    } catch (error: unknown) {
        LoggerUtil.error('Failed to get email queue stats', {
            error: (error as Error).message,
        });
        return { error: (error as Error).message } as EmailQueueStats;
    }
}

/**
 * Clean old completed/failed jobs
 */
export async function cleanEmailQueue(): Promise<void> {
    try {
        if (!emailQueue) {
            throw new Error('Queue not initialized');
        }

        await Promise.all([
            emailQueue.clean(24 * 3600 * 1000, 1000, 'completed'), // 24 hours
            emailQueue.clean(7 * 24 * 3600 * 1000, 1000, 'failed'), // 7 days
        ]);

        LoggerUtil.info('Email queue cleaned successfully');
    } catch (error: unknown) {
        LoggerUtil.error('Failed to clean email queue', {
            error: (error as Error).message,
        });
    }
}

// ==================== SHUTDOWN ====================

/**
 * Close email queue gracefully
 */
export async function closeEmailQueue(): Promise<void> {
    try {
        if (emailQueue) {
            await emailQueue.close();
            LoggerUtil.info('✅ Email queue closed');
        }
    } catch (error: unknown) {
        LoggerUtil.error('Email queue close failed', { error: (error as Error).message });
    }
}

// ==================== EXPORT ====================

export { emailQueue };

export default {
    initializeEmailQueue,
    queueEmail,
    getEmailQueueStats,
    cleanEmailQueue,
    closeEmailQueue,
};