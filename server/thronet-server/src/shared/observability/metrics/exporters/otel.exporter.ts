import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export default {
    getExporter() {
        return new OTLPTraceExporter({
            url: process.env['OTLP_ENDPOINT'] || 'http://localhost:4318/v1/traces',
        });
    }
};