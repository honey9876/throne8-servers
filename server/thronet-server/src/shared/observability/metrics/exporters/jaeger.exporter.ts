import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export default {
    getExporter() {
        return new OTLPTraceExporter({
            url: process.env['JAEGER_ENDPOINT'] || 'http://localhost:4318/v1/traces',
        });
    }
};