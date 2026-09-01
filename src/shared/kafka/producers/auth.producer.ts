/**
 * auth.producer.ts
 * Kafka Producer for Auth Events
 * 
 * @version 3.0.0
 */

import { Kafka, Producer, Message } from 'kafkajs';
import kafkaConfig from '@/config/kafka.config';
import { LoggerUtil } from '@/shared/logger.util';
import topics from '@/kafka/config/topic.config';

export interface AuthEvent {
    eventId: string;
    userId: string;
    eventType: 'LOGIN' | 'LOGOUT' | 'TOKEN_REFRESH' | 'PASSWORD_RESET';
    timestamp: string;
    metadata?: Record<string, any>;
}

class AuthProducer {
    private topic: string;
    private kafka: Kafka;
    private producer: Producer;
    private isConnected: boolean = false;

    constructor() {
        this.topic = topics.authEvents.topic;
        this.kafka = new Kafka(kafkaConfig);
        this.producer = this.kafka.producer({
            allowAutoTopicCreation: true,
            idempotent: true,
        });
    }

    async connect(): Promise<void> {
        if (this.isConnected) return;

        try {
            await this.producer.connect();
            this.isConnected = true;
            LoggerUtil.info('✅ Auth producer connected');
        } catch (error: any) {
            LoggerUtil.error('Auth producer connection failed', { error: error.message });
        }
    }

    async disconnect(): Promise<void> {
        if (!this.isConnected) return;

        try {
            await this.producer.disconnect();
            this.isConnected = false;
            LoggerUtil.info('✅ Auth producer disconnected');
        } catch (error: any) {
            LoggerUtil.error('Auth producer disconnect failed', { error: error.message });
        }
    }

    async sendAuthEvent(event: AuthEvent): Promise<void> {
        try {
            if (!this.isConnected) await this.connect();
            if (!this.isConnected) return;

            const message: Message = {
                key: event.userId,
                value: JSON.stringify(event),
                timestamp: Date.now().toString(),
            };

            await this.producer.send({
                topic: this.topic,
                messages: [message],
            });

            LoggerUtil.debug('Auth event sent', { eventId: event.eventId, eventType: event.eventType });
        } catch (error: any) {
            LoggerUtil.error('Failed to send auth event', { error: error.message });
        }
    }
}

export default new AuthProducer();