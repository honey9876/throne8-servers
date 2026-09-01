/**
 * user.producer.ts
 * Kafka Producer for User Events
 * 
 * @version 3.0.0
 */

import { Kafka, Producer, Message } from 'kafkajs';
import kafkaConfig from '@/config/kafka.config';
import { LoggerUtil } from '@/shared/logger.util';
import topics from '@/shared/kafka/config/topic.config';

export interface UserEvent {
    eventId: string;
    userId: string;
    eventType: 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED' | 'USER_DEACTIVATED';
    timestamp: string;
    metadata?: Record<string, any>;
}

class UserProducer {
    private topic: string;
    private kafka: Kafka;
    private producer: Producer;
    private isConnected: boolean = false;

    constructor() {
        this.topic = topics.userEvents.topic;
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
            LoggerUtil.info('✅ User producer connected');
        } catch (error: any) {
            LoggerUtil.error('User producer connection failed', { error: error.message });
        }
    }

    async disconnect(): Promise<void> {
        if (!this.isConnected) return;

        try {
            await this.producer.disconnect();
            this.isConnected = false;
            LoggerUtil.info('✅ User producer disconnected');
        } catch (error: any) {
            LoggerUtil.error('User producer disconnect failed', { error: error.message });
        }
    }

    async sendUserEvent(event: UserEvent): Promise<void> {
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

            LoggerUtil.debug('User event sent', { eventId: event.eventId, eventType: event.eventType });
        } catch (error: any) {
            LoggerUtil.error('Failed to send user event', { error: error.message });
        }
    }
}

export default new UserProducer();