/**
 * base.producer.ts
 * Professional-level base Kafka producer for auth-service-phase3-kafka
 * Provides reusable producer functionality
 * Compliant with NIST 800-63B and OWASP guidelines
 * 
 * @module kafka/producers/base.producer
 * @version 3.0.0
 */

import { Kafka, Producer, Message, ProducerRecord } from 'kafkajs';
import LoggerUtil from '@/shared/logger.util';
import kafkaConfig from '@/config/kafka.config';
import ProducerMetrics from '@/kafka/metrics/producer.metrics';
import ErrorHandler from '@/kafka/utils/error-handler';

// ==================== INTERFACES ====================

interface BaseMessage {
    key?: string | null;
    value: any;
    headers?: Record<string, string | Buffer>;
    partition?: number;
    timestamp?: string;
}

// ==================== BASE PRODUCER CLASS ====================

export class BaseProducer {
    protected topic: string;
    protected kafka: Kafka;
    protected producer: Producer;
    protected metrics: ProducerMetrics;
    private isConnected: boolean = false;

    constructor(topic: string) {
        this.topic = topic;
        this.kafka = new Kafka(kafkaConfig);
        this.producer = this.kafka.producer({
            allowAutoTopicCreation: false,
            transactionTimeout: 30000,
            idempotent: true,
            maxInFlightRequests: 5,
            retry: {
                initialRetryTime: 300,
                retries: 8,
                maxRetryTime: 30000,
                multiplier: 2,
            },
        });
        this.metrics = new ProducerMetrics(this.topic);
    }

    /**
     * Connect to Kafka broker
     * 
     * @throws Error if connection fails
     */
    async connect(): Promise<void> {
        if (this.isConnected) {
            LoggerUtil.debug(`Producer already connected for topic: ${this.topic}`);
            return;
        }

        try {
            await this.producer.connect();
            this.isConnected = true;
            LoggerUtil.info(`Producer connected for topic: ${this.topic}`);
            this.metrics.recordConnectionSuccess();
        } catch (error: unknown) {
            this.isConnected = false;
            LoggerUtil.error(`Producer connection failed for topic: ${this.topic}`, {
                error: (error as Error).message
            });
            this.metrics.recordConnectionFailure();
            throw ErrorHandler.kafkaError(error as Error, 'Producer connection failed');
        }
    }

    /**
     * Send messages to Kafka topic
     * 
     * @param messages - Array of messages to send
     * @throws Error if send fails
     */
    async sendMessage(messages: BaseMessage[]): Promise<void> {
        if (!this.isConnected) {
            await this.connect();
        }

        try {
            const kafkaMessages: Message[] = messages.map((msg) => ({
                key: msg.key || null,
                value: JSON.stringify(msg.value),
                headers: msg.headers,
                partition: msg.partition,
                timestamp: msg.timestamp,
            }));

            const record: ProducerRecord = {
                topic: this.topic,
                messages: kafkaMessages,
                compression: 1, // GZIP
            };

            await this.producer.send(record);

            LoggerUtil.info(`Messages sent to topic: ${this.topic}`, {
                messageCount: messages.length
            });
            this.metrics.recordMessagesSent(messages.length);
        } catch (error: unknown) {
            LoggerUtil.error(`Failed to send messages to topic: ${this.topic}`, {
                error: (error as Error).message
            });
            this.metrics.recordMessagesFailed(messages.length);
            throw ErrorHandler.kafkaError(error as Error, 'Message send failed');
        }
    }

    /**
     * Send a single message to Kafka topic
     * 
     * @param message - Message to send
     * @throws Error if send fails
     */
    async sendSingleMessage(message: BaseMessage): Promise<void> {
        await this.sendMessage([message]);
    }

    /**
     * Disconnect from Kafka broker
     * 
     * @throws Error if disconnection fails
     */
    async disconnect(): Promise<void> {
        if (!this.isConnected) {
            LoggerUtil.debug(`Producer already disconnected for topic: ${this.topic}`);
            return;
        }

        try {
            await this.producer.disconnect();
            this.isConnected = false;
            LoggerUtil.info(`Producer disconnected for topic: ${this.topic}`);
        } catch (error: unknown) {
            LoggerUtil.error(`Producer disconnection failed for topic: ${this.topic}`, {
                error: (error as Error).message
            });
            throw ErrorHandler.kafkaError(error as Error, 'Producer disconnection failed');
        }
    }

    /**
     * Get connection status
     * 
     * @returns Connection status
     */
    isProducerConnected(): boolean {
        return this.isConnected;
    }

    /**
     * Get producer metrics
     * 
     * @returns Producer metrics
     */
    getMetrics(): ProducerMetrics {
        return this.metrics;
    }

    /**
     * Get topic name
     * 
     * @returns Topic name
     */
    getTopic(): string {
        return this.topic;
    }
}

// ==================== EXPORT ====================

export default BaseProducer;

export { BaseMessage };