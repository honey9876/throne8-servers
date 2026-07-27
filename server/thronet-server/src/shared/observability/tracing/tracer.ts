/**
 * tracer.ts
 * server/thronet-server/src/shared/observability/tracing/tracer.ts
 * Professional-level OpenTelemetry tracer setup for auth-service-phase3-kafka
 * Initializes tracing provider and exporters
 * Compliant with NIST 800-63B and OWASP guidelines
 */

import * as otelResources from '@opentelemetry/resources';
const Resource = (otelResources as any).Resource ?? (otelResources as any).default?.Resource ?? class Resource {
    constructor(attrs: any) { return attrs; }
};
import { NodeSDK } from '@opentelemetry/sdk-node';
import * as semConv from '@opentelemetry/semantic-conventions';
const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } = semConv as any;
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace } from '@opentelemetry/api';
import { LoggerUtil } from '@/shared/logger.util';

// OTLP Exporter (Jaeger/Grafana Tempo compatible)
const otlpExporter = new OTLPTraceExporter({
    url: process.env['JAEGER_ENDPOINT'] || 'http://jaeger:4318/v1/traces',
});

const sdk = new NodeSDK({
    resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]: 'thronet-server',
        [SEMRESATTRS_SERVICE_VERSION]: '1.0.0',
        [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env['NODE_ENV'] || 'development',
    }),
    spanProcessor: new BatchSpanProcessor(otlpExporter, {
        maxQueueSize: 1000,
        maxExportBatchSize: 100,
        scheduledDelayMillis: 5000,
    }),
});

const tracer = trace.getTracer('thronet-server-tracer');

async function initializeTracer(): Promise<void> {
    try {
        // Only initialize if Jaeger endpoint is configured
        if (!process.env['JAEGER_ENDPOINT'] && !process.env['OTLP_ENDPOINT']) {
            LoggerUtil.warn('⚠️ No trace exporter configured, skipping tracer init');
            return;
        }

        sdk.start();

        LoggerUtil.info('✅ OpenTelemetry tracer initialized', {
            endpoint: process.env['JAEGER_ENDPOINT'] || process.env['OTLP_ENDPOINT'],
            service: 'thronet-server',
        });

    } catch (error: unknown) {
        LoggerUtil.error('Tracer initialization failed', {
            error: (error as Error).message
        });
        // Non-critical — don't throw
    }
}

async function shutdownTracer(): Promise<void> {
    try {
        await sdk.shutdown();
        LoggerUtil.info('✅ Tracer shutdown complete');
    } catch (error: unknown) {
        LoggerUtil.error('Tracer shutdown failed', {
            error: (error as Error).message
        });
    }
}

export { tracer, initializeTracer, shutdownTracer };