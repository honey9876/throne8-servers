/**
 * kafka.instrumentation.ts
 * server/thronet-server/src/shared/observability/instrumentation/kafka.instrumentation.ts
 * Professional-level Kafka instrumentation for auth-service-phase3-kafka
 * Traces Kafka producer and consumer messages
 * Compliant with NIST 800-63B and OWASP guidelines
 */

import { KafkaJsInstrumentation } from '@opentelemetry/instrumentation-kafkajs';
import type { Span } from '@opentelemetry/api';
import { LoggerUtil } from '@/shared/logger.util';

const kafkaInstrumentation = new KafkaJsInstrumentation({
    producerHook: (span: Span, info: any) => {
        span.setAttribute('messaging.kafka.topic', info.topic || 'unknown');
        LoggerUtil.info('Kafka producer message traced', {
            spanId: span.spanContext().spanId,
            topic: info.topic
        });
    },
    consumerHook: (span: Span, info: any) => {
        span.setAttribute('messaging.kafka.topic', info.topic || 'unknown');
        span.setAttribute('messaging.kafka.offset', info.message?.offset || 'unknown');
        LoggerUtil.info('Kafka consumer message traced', {
            spanId: span.spanContext().spanId,
            topic: info.topic
        });
    },
});

function initializeKafkaInstrumentation(): void {
    try {
        kafkaInstrumentation.enable();
        LoggerUtil.info('Kafka instrumentation enabled');
    } catch (error: unknown) {
        LoggerUtil.error('Kafka instrumentation failed', { error: (error as Error).message });
        throw error;
    }
}

export { kafkaInstrumentation, initializeKafkaInstrumentation };    