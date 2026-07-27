/**
 * producer.metrics.ts
 * Professional-level Kafka producer metrics for auth-service-phase3-kafka
 * Collects metrics for producers
 * Compliant with NIST 800-63B and OWASP guidelines
 * 
 * @module kafka/metrics/producer.metrics
 * @version 3.0.0
 */

import { Counter, Gauge, register, Registry } from 'prom-client';
import LoggerUtil from '@/shared/logger.util';

// ==================== INTERFACES ====================

interface MetricLabels {
    topic: string;
}

interface ProducerMetricsData {
    messagesSent: number;
    messagesFailed: number;
    isConnected: boolean;
    topic: string;
}

// ==================== PRODUCER METRICS CLASS ====================

class ProducerMetrics {
    // Static metrics - shared across all instances
    private static messagesSent: Counter<string> | null = null;
    private static messagesFailed: Counter<string> | null = null;
    private static connectionStatus: Gauge<string> | null = null;
    private static initialized: boolean = false;

    // Instance properties
    private topic: string;
    private messagesSentCounter: Counter<string> | null = null;
    private messagesFailedCounter: Counter<string> | null = null;
    private connectionStatusGauge: Gauge<string> | null = null;

    constructor(topic: string) {
        this.topic = topic;

        // Initialize metrics only once
        if (!ProducerMetrics.initialized) {
            this.initializeMetrics();
            ProducerMetrics.initialized = true;
        }

        // Use the static metrics
        this.messagesSentCounter = ProducerMetrics.messagesSent;
        this.messagesFailedCounter = ProducerMetrics.messagesFailed;
        this.connectionStatusGauge = ProducerMetrics.connectionStatus;
    }

    /**
     * Initialize Prometheus metrics
     */
    private initializeMetrics(): void {
        try {
            // Check if metrics already exist and remove them
            const existingMetrics = [
                'kafka_producer_messages_sent_total',
                'kafka_producer_messages_failed_total',
                'kafka_producer_connection_status'
            ];

            existingMetrics.forEach((metricName) => {
                try {
                    register.removeSingleMetric(metricName);
                } catch(error : any) {
                    // Metric doesn't exist, ignore
                }
            });

            // Create new metrics
            ProducerMetrics.messagesSent = new Counter({
                name: 'kafka_producer_messages_sent_total',
                help: 'Total number of messages sent by producer',
                labelNames: ['topic'],
                registers: [register],
            });

            ProducerMetrics.messagesFailed = new Counter({
                name: 'kafka_producer_messages_failed_total',
                help: 'Total number of messages failed by producer',
                labelNames: ['topic'],
                registers: [register],
            });

            ProducerMetrics.connectionStatus = new Gauge({
                name: 'kafka_producer_connection_status',
                help: 'Producer connection status (1 = connected, 0 = disconnected)',
                labelNames: ['topic'],
                registers: [register],
            });

            LoggerUtil.info('Producer metrics initialized successfully');
        } catch (error: unknown) {
            LoggerUtil.error('Failed to initialize producer metrics', {
                error: (error as Error).message,
            });
            throw error;
        }
    }

    /**
     * Record messages sent
     * 
     * @param count - Number of messages sent
     */
    recordMessagesSent(count: number = 1): void {
        try {
            if (!this.messagesSentCounter) {
                LoggerUtil.warn('Messages sent counter not initialized', { topic: this.topic });
                return;
            }

            this.messagesSentCounter.inc({ topic: this.topic }, count);

            LoggerUtil.debug('Producer messages sent', {
                topic: this.topic,
                count,
            });
        } catch (error: unknown) {
            LoggerUtil.error('Failed to record messages sent', {
                error: (error as Error).message,
                topic: this.topic,
            });
        }
    }

    /**
     * Record messages failed
     * 
     * @param count - Number of messages failed
     */
    recordMessagesFailed(count: number = 1): void {
        try {
            if (!this.messagesFailedCounter) {
                LoggerUtil.warn('Messages failed counter not initialized', { topic: this.topic });
                return;
            }

            this.messagesFailedCounter.inc({ topic: this.topic }, count);

            LoggerUtil.error('Producer messages failed', {
                topic: this.topic,
                count,
            });
        } catch (error: unknown) {
            LoggerUtil.error('Failed to record messages failed', {
                error: (error as Error).message,
                topic: this.topic,
            });
        }
    }

    /**
     * Record connection success
     */
    recordConnectionSuccess(): void {
        try {
            if (!this.connectionStatusGauge) {
                LoggerUtil.warn('Connection status gauge not initialized', { topic: this.topic });
                return;
            }

            this.connectionStatusGauge.set({ topic: this.topic }, 1);

            LoggerUtil.info('Producer connection successful', {
                topic: this.topic,
            });
        } catch (error: unknown) {
            LoggerUtil.error('Failed to record connection success', {
                error: (error as Error).message,
                topic: this.topic,
            });
        }
    }

    /**
     * Record connection failure
     */
    recordConnectionFailure(): void {
        try {
            if (!this.connectionStatusGauge) {
                LoggerUtil.warn('Connection status gauge not initialized', { topic: this.topic });
                return;
            }

            this.connectionStatusGauge.set({ topic: this.topic }, 0);

            LoggerUtil.error('Producer connection failed', {
                topic: this.topic,
            });
        } catch (error: unknown) {
            LoggerUtil.error('Failed to record connection failure', {
                error: (error as Error).message,
                topic: this.topic,
            });
        }
    }

    /**
     * Get current metrics data
     * 
     * @returns Current metrics snapshot
     */
    getMetricsData(): ProducerMetricsData {
        return {
            messagesSent: 0, // Would need to query Prometheus or cache
            messagesFailed: 0,
            isConnected: false,
            topic: this.topic,
        };
    }

    /**
     * Get topic name
     * 
     * @returns Topic name
     */
    getTopic(): string {
        return this.topic;
    }

    /**
     * Reset metrics for this topic
     */
    reset(): void {
        try {
            if (this.connectionStatusGauge) {
                this.connectionStatusGauge.set({ topic: this.topic }, 0);
            }

            LoggerUtil.info('Producer metrics reset', { topic: this.topic });
        } catch (error: unknown) {
            LoggerUtil.error('Failed to reset metrics', {
                error: (error as Error).message,
                topic: this.topic,
            });
        }
    }

    /**
     * Clear all metrics (useful for testing/development)
     * Static method to clear all producer metrics
     */
    static clearMetrics(): void {
        try {
            register.clear();
            ProducerMetrics.initialized = false;
            ProducerMetrics.messagesSent = null;
            ProducerMetrics.messagesFailed = null;
            ProducerMetrics.connectionStatus = null;

            LoggerUtil.info('All producer metrics cleared');
        } catch (error: unknown) {
            LoggerUtil.error('Failed to clear metrics', {
                error: (error as Error).message,
            });
        }
    }

    /**
     * Get Prometheus registry
     * 
     * @returns Prometheus registry
     */
    static getRegistry(): Registry {
        return register;
    }

    /**
     * Check if metrics are initialized
     * 
     * @returns True if initialized
     */
    static isInitialized(): boolean {
        return ProducerMetrics.initialized;
    }
}

// ==================== EXPORT ====================

export default ProducerMetrics;

export { ProducerMetricsData, MetricLabels };