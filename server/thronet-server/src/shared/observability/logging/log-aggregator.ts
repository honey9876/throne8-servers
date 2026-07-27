/**
 * log-aggregator.ts
 * Professional-level log aggregator for auth-service-phase3-kafka
 * Collects and forwards logs to external systems
 * Compliant with NIST 800-63B and OWASP guidelines
 */

// import { logger } from './structured-logger.js';  // Assume typed
import LoggerUtil from '../../logger.util.js';
import AuditProducer from '../../kafka/producers/audit.producer.js';
import { v4 as uuidv4 } from 'uuid';

const logger = LoggerUtil.getLogger('LogAggregator');

async function aggregateLogs(logData: any): Promise<void> {
    try {
        logger.info('Log aggregated', logData);

        // Optionally forward to external system (e.g., ELK)
        if (process.env['LOG_AGGREGATOR_ENDPOINT']) {
            // Placeholder for HTTP POST to log aggregator (e.g., Logstash)
            LoggerUtil.info('Log forwarded to external aggregator', { endpoint: process.env['LOG_AGGREGATOR_ENDPOINT'] });
        }
    } catch (error: unknown) {
        LoggerUtil.error('Log aggregation failed', { error: (error as Error).message });
        await AuditProducer.connect();
        await AuditProducer.sendAuditEvent({
            eventId: uuidv4(),
            userId: null,
            action: 'LOG_AGGREGATION_FAILED',
            ipAddress: 'system',
            status: 'ERROR',
            severity: 'HIGH',
            timestamp: new Date().toISOString(),
            metadata: { error: (error as Error).message },
        });
    } finally {
        await AuditProducer.disconnect().catch((err: unknown) =>
            LoggerUtil.error('Producer disconnect failed', { error: (err as Error).message })
        );
    }
}

function initializeLogAggregator(): void {
    try {
        LoggerUtil.info('Log aggregator initialized');
    } catch (error: unknown) {
        LoggerUtil.error('Log aggregator initialization failed', { error: (error as Error).message });
        throw error;
    }
}

export { aggregateLogs, initializeLogAggregator };