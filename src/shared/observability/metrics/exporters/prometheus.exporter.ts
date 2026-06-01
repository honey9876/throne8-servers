// server/thronet-server/src/shared/observability/metrics/exporters/prometheus.exporter.ts
import promClient from 'prom-client';
import express, { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';

const logger = LoggerUtil;  // From previous conversion

const router: Router = express.Router();

router.get('/metrics', async (req: Request, res: Response) => {
    try {
        res.set('Content-Type', promClient.register.contentType);
        const metrics = await promClient.register.metrics();
        res.end(metrics);

        logger.info('Prometheus metrics scraped', {
            ip: req.ip,
            userAgent: req.get('user-agent')
        });
    } catch (error: unknown) {
        logger.error('Prometheus metrics scrape failed', {
            error: (error as Error).message,
            stack: (error as Error).stack
        });

        // Try to send audit event, but don't let it block the response
        try {
            await AuditProducer.connect();
            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(),
                userId: null,
                action: 'PROMETHEUS_SCRAPE_FAILED',
                ipAddress: req.ip || 'unknown',
                status: 'ERROR',
                severity: 'HIGH',
                timestamp: new Date().toISOString(),
                metadata: {
                    error: (error as Error).message,
                    userAgent: req.get('user-agent')
                },
            });
            await AuditProducer.disconnect();
        } catch (auditError: unknown) {
            logger.error('Failed to send audit event for metrics scrape failure', {
                error: (auditError as Error).message
            });
        }

        res.status(500).json({
            error: 'Failed to retrieve metrics',
            message: process.env['NODE_ENV'] === 'production' ? 'Internal server error' : (error as Error).message
        });
    }
});

// Health check endpoint for Prometheus
router.get('/metrics/health', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

async function initializePrometheusExporter(): Promise<void> {
    try {
        // Verify that metrics registry is working
        const testMetrics = await promClient.register.metrics();
        if (!testMetrics) {
            throw new Error('Prometheus registry returned empty metrics');
        }

        logger.info('Prometheus exporter initialized', {
            endpoint: '/metrics',
            // metricsCount: promClient.register._metrics.size
        });

        // Send initialization audit event
        try {
            await AuditProducer.connect();
            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(),
                userId: null,
                action: 'PROMETHEUS_EXPORTER_INITIALIZED',
                ipAddress: 'system',
                status: 'SUCCESS',
                severity: 'LOW',
                timestamp: new Date().toISOString(),
                metadata: {
                    endpoint: '/metrics',
                    // metricsCount: promClient.register._metrics.size
                },
            });
            await AuditProducer.disconnect();
        } catch (auditError: unknown) {
            logger.warn('Failed to send audit event for Prometheus initialization', {
                error: (auditError as Error).message
            });
        }

    } catch (error: unknown) {
        logger.error('Prometheus exporter initialization failed', {
            error: (error as Error).message,
            stack: (error as Error).stack
        });
        throw error;
    }
}

// Function to add custom labels to all metrics
function addGlobalLabels(labels: Record<string, string>): void {
    promClient.register.setDefaultLabels(labels);
}

// Function to reset all metrics (useful for testing)
function resetMetrics(): void {
    promClient.register.clear();
}

export {
    router as prometheusRouter,
    initializePrometheusExporter,
    addGlobalLabels,
    resetMetrics,
    promClient
};