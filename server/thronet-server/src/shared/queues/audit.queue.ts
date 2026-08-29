/**
 * audit.queue.ts
 * Bull Queue for Audit Events (Fallback mechanism)
 * Production-ready audit queue with Redis
 * 
 * @version 3.0.0
 */

import Queue, { Job, JobOptions, Queue as QueueType } from 'bull';
import { LoggerUtil } from '@/shared/logger.util';
// import AuditProducer, { AuditEvent } from '@/kafka/producers/audit.producer';
import { v4 as uuidv4 } from 'uuid';
import AuditProducer, { AuditEvent } from '../kafka/producers/audit.producer';

// ==================== QUEUE SETUP ====================

const auditQueue = new Queue<AuditEvent>('audit-queue', {
    redis: {
        host: process.env['REDIS_HOST'] || '127.0.0.1',
        port: parseInt(process.env['REDIS_PORT'] || '6379'),
        password: process.env['REDIS_PASSWORD'],
    },
    settings: {
        maxStalledCount: 3,
        lockDuration: 30000,
        stalledInterval: 30000,
    },
    defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
    },
});

// ==================== AUDIT QUEUE CLASS ====================

class AuditQueue {
    private static initialized: boolean = false;

    /**
     * Initialize audit queue and processor
     */
    static async initializeAuditQueue(): Promise<QueueType<AuditEvent>> {
        if (this.initialized) {
            LoggerUtil.debug('Audit queue already initialized');
            return auditQueue;
        }

        try {
            LoggerUtil.info('Initializing audit queue...');

            // Setup processors
            await this.setupProcessors();

            // Setup event handlers
            await this.setupEventHandlers();

            this.initialized = true;

            LoggerUtil.info('✅ Audit queue initialized successfully');
            return auditQueue;
        } catch (error: any) {
            LoggerUtil.error('Failed to initialize audit queue', { error: error.message });
            throw error;
        }
    }

    /**
     * Setup audit event processor
     */
    private static async setupProcessors(): Promise<void> {
        auditQueue.process('audit-event', async (job: Job<AuditEvent>) => {
            try {
                LoggerUtil.info('Processing audit job', {
                    jobId: job.id,
                    eventId: job.data.eventId,
                    action: job.data.action,
                });

                // Validate required fields
                if (!job.data.eventId || !job.data.action) {
                    throw new Error('Missing required audit fields (eventId, action)');
                }

                // Send audit event to Kafka
                await AuditProducer.connect();
                await AuditProducer.sendAuditEvent(job.data);

                LoggerUtil.info('Audit event processed successfully', {
                    jobId: job.id,
                    eventId: job.data.eventId,
                    action: job.data.action,
                });

                return { success: true, eventId: job.data.eventId };
            } catch (error: any) {
                LoggerUtil.error('Audit job processing failed', {
                    jobId: job.id,
                    error: error.message,
                    stack: error.stack,
                    eventData: job.data,
                });

                // Re-throw to trigger Bull's retry mechanism
                throw error;
            } finally {
                try {
                    await AuditProducer.disconnect();
                } catch (err: any) {
                    LoggerUtil.error('Producer disconnect failed', { error: err.message });
                }
            }
        });
    }

    /**
     * Setup event handlers
     */
    private static async setupEventHandlers(): Promise<void> {
        auditQueue.on('error', (error: Error) => {
            LoggerUtil.error('Audit queue error', { error: error.message });
        });

        auditQueue.on('completed', (job: Job, result: any) => {
            LoggerUtil.info('Audit job completed', {
                jobId: job.id,
                eventId: job.data.eventId,
                action: job.data.action,
                result,
            });
        });

        auditQueue.on('failed', (job: Job, error: Error) => {
            LoggerUtil.error('Audit job failed permanently', {
                jobId: job.id,
                eventId: job.data.eventId,
                action: job.data.action,
                error: error.message,
                attempts: job.attemptsMade,
            });
        });

        auditQueue.on('stalled', (job: Job) => {
            LoggerUtil.warn('Audit job stalled', {
                jobId: job.id,
                eventId: job.data.eventId,
                action: job.data.action,
            });
        });

        auditQueue.on('active', (job: Job) => {
            LoggerUtil.debug('Audit job started', {
                jobId: job.id,
                eventId: job.data.eventId,
                action: job.data.action,
            });
        });
    }

    /**
     * Get queue instance
     */
    static getQueue(): QueueType<AuditEvent> {
        return auditQueue;
    }

    /**
     * Add audit job to queue
     */
    static async addAuditJob(auditEvent: AuditEvent, options: JobOptions = {}): Promise<Job<AuditEvent>> {
        try {
            // Validate required fields
            if (!auditEvent.eventId || !auditEvent.action) {
                throw new Error('Missing required audit fields: eventId and action are required');
            }

            const job = await auditQueue.add('audit-event', auditEvent, {
                priority: options.priority || 0,
                delay: options.delay || 0,
                ...options,
            });

            LoggerUtil.info('Audit job added to queue', {
                jobId: job.id,
                eventId: auditEvent.eventId,
                action: auditEvent.action,
            });

            return job;
        } catch (error: any) {
            LoggerUtil.error('Failed to add audit job to queue', {
                error: error.message,
                eventId: auditEvent.eventId,
                action: auditEvent.action,
            });

            throw error;
        }
    }

    /**
     * Get queue statistics
     */
    static async getQueueStats() {
        try {
            const [waiting, active, completed, failed] = await Promise.all([
                auditQueue.getWaiting(),
                auditQueue.getActive(),
                auditQueue.getCompleted(),
                auditQueue.getFailed(),
            ]);

            return {
                waiting: waiting.length,
                active: active.length,
                completed: completed.length,
                failed: failed.length,
                total: waiting.length + active.length + completed.length + failed.length,
            };
        } catch (error: any) {
            LoggerUtil.error('Failed to get audit queue stats', { error: error.message });
            return null;
        }
    }

    /**
     * Clean up old jobs
     */
    static async cleanQueue(): Promise<void> {
        try {
            await auditQueue.clean(24 * 60 * 60 * 1000, 'completed'); // 24 hours
            await auditQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // 7 days
            LoggerUtil.info('Audit queue cleaned');
        } catch (error: any) {
            LoggerUtil.error('Failed to clean audit queue', { error: error.message });
        }
    }

    /**
     * Close queue gracefully
     */
    static async closeQueue(): Promise<void> {
        try {
            await auditQueue.close();
            LoggerUtil.info('✅ Audit queue closed');
        } catch (error: any) {
            LoggerUtil.error('Error closing audit queue', { error: error.message });
        }
    }
}

export default AuditQueue;