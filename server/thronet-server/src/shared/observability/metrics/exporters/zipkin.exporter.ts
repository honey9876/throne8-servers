import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';

export default {
    getExporter() {
        return new ZipkinExporter({
            url: process.env['ZIPKIN_ENDPOINT'] || 'http://localhost:9411/api/v2/spans',
        });
    }
};