/**
 * queueManager.ts
 * Queue Manager - Orchestrates all queues
 * Production-ready queue management
 * 
 * @version 3.0.0
 */

import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer, { AuditEvent } from '../kafka/producers/audit.producer';
import AuditQueue from './audit.queue';
import { v4 as uuidv4 } from 'uuid';

class QueueManager {
  private static queues = {
    audit: null as any,
  };

  /**
   * Initialize all queues
   */
  static async initializeQueues(): Promise<void> {
    try {
      LoggerUtil.info('📮 Initializing queues...');

      // Initialize audit queue
      LoggerUtil.info('Initializing audit queue (Bull)...');
      this.queues.audit = await AuditQueue.initializeAuditQueue();
      LoggerUtil.info('✅ Audit queue initialized');

      // Setup queue cleaning
      this.setupQueueCleaning();

      LoggerUtil.info('✅ All queues initialized successfully');

      // Send audit event
      try {
        await AuditProducer.connect();
        await AuditProducer.sendAuditEvent({
          eventId: uuidv4(),
          userId: null,
          action: 'QUEUE_MANAGER_INITIALIZED',
          ipAddress: 'system',
          status: 'SUCCESS',
          severity: 'LOW',
          timestamp: new Date().toISOString(),
          metadata: {
            queues: ['audit'],
          },
        });
      } catch (auditError: any) {
        LoggerUtil.warn('Failed to send queue initialization audit event', {
          error: auditError.message,
        });
      } finally {
        await AuditProducer.disconnect();
      }
    } catch (error: any) {
      LoggerUtil.error('Queue manager initialization failed', {
        error: error.message,
        stack: error.stack,
      });

      throw error;
    }
  }

  /**
   * Setup periodic queue cleaning
   */
  private static setupQueueCleaning(): void {
    setInterval(async () => {
      try {
        LoggerUtil.info('Starting periodic queue cleaning...');
        await AuditQueue.cleanQueue();
        LoggerUtil.info('✅ Periodic queue cleaning completed');
      } catch (error: any) {
        LoggerUtil.error('Periodic queue cleaning failed', {
          error: error.message,
        });
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    LoggerUtil.info('✅ Queue cleaning scheduled (every 6 hours)');
  }

  /**
   * Get queue health
   */
  static async getQueueHealth() {
    const health = {
      audit: false,
      timestamp: new Date().toISOString(),
    };

    try {
      health.audit = this.queues.audit !== null;
      return health;
    } catch (error: any) {
      LoggerUtil.error('Queue health check failed', {
        error: error.message,
      });
      return health;
    }
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats() {
    try {
      const auditStats = await AuditQueue.getQueueStats();

      return {
        audit: auditStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      LoggerUtil.error('Failed to get queue stats', {
        error: error.message,
      });
      return {
        audit: { error: error.message },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Close all queues
   */
  static async closeQueues(): Promise<void> {
    try {
      LoggerUtil.info('Closing queues...');
      await AuditQueue.closeQueue();
      LoggerUtil.info('✅ All queues closed successfully');
    } catch (error: any) {
      LoggerUtil.error('Queue manager closure failed', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  static async gracefulShutdown(): Promise<void> {
    LoggerUtil.info('Starting graceful shutdown of queue manager...');

    try {
      await this.closeQueues();

      try {
        await AuditProducer.connect();
        await AuditProducer.sendAuditEvent({
          eventId: uuidv4(),
          userId: null,
          action: 'QUEUE_MANAGER_SHUTDOWN',
          ipAddress: 'system',
          status: 'SUCCESS',
          severity: 'LOW',
          timestamp: new Date().toISOString(),
          metadata: {},
        });
        await AuditProducer.disconnect();
      } catch (auditError: any) {
        LoggerUtil.warn('Failed to send shutdown audit event', {
          error: auditError.message,
        });
      }

      LoggerUtil.info('✅ Queue manager graceful shutdown completed');
    } catch (error: any) {
      LoggerUtil.error('Error during graceful shutdown', {
        error: error.message,
      });
      throw error;
    }
  }
}

export default QueueManager;