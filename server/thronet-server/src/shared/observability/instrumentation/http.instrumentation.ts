/**
 * http.instrumentation.ts
 * server/thronet-server/src/shared/observability/instrumentation/http.instrumentation.ts
 * Professional-level HTTP instrumentation for auth-service-phase3-kafka
 * Traces HTTP requests using OpenTelemetry
 * Compliant with NIST 800-63B and OWASP guidelines
 */

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import type { Span } from '@opentelemetry/api';
import { LoggerUtil } from '@/shared/logger.util';

const httpInstrumentation = new HttpInstrumentation({
    ignoreIncomingRequestHook: (request) => {
        const url = request.url || '';
        return url.includes('/health') || url.includes('/metrics');
    },
    requestHook: (span: Span, request: any) => {  // Request any for http module
        span.setAttribute('http.user_agent', request.headers['user-agent'] || 'unknown');
        span.setAttribute('http.client_ip', request.headers['x-forwarded-for'] || request.socket.remoteAddress);
        LoggerUtil.info('HTTP request traced', { spanId: span.spanContext().spanId });
    },
    responseHook: (span: Span, response: any) => {  // Response any
        span.setAttribute('http.status_code', response.statusCode);
    },
});

function initializeHttpInstrumentation(): void {
    try {
        httpInstrumentation.enable();
        LoggerUtil.info('HTTP instrumentation enabled');
    } catch (error: unknown) {
        LoggerUtil.error('HTTP instrumentation failed', { error: (error as Error).message });
        throw error;
    }
}

export { httpInstrumentation, initializeHttpInstrumentation };