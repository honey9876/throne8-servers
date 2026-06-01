/**
 * slo-monitor.ts
 * Professional-level SLO monitor for auth-service-phase3-kafka
 * Evaluates SLO compliance using Prometheus queries
 * server/thronet-server/src/shared/observability/slo/slo-monitor.ts
 * Compliant with NIST 800-63B and OWASP guidelines
 */

// import promClient from 'prom-client';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';

interface SLO {
  slo: {
    name: string;
    objectives: Array<{
      name: string;
      query: string;
      target: number;
    }>;
  };
}

interface PrometheusResponse {
  data: {
    result: Array<{
      value: [string, string];
    }>;
  };
}

async function evaluateSLO(sloFile: string): Promise<void> {
  try {
    const sloContent = await fs.readFile(sloFile, 'utf8');
    const slo: SLO = yaml.load(sloContent) as SLO;
    
    for (const objective of slo.slo.objectives) {
      // Query Prometheus via HTTP API
      const prometheusUrl = process.env['PROMETHEUS_URL'] || 'http://localhost:9090';
      const response = await axios.get<PrometheusResponse>(`${prometheusUrl}/api/v1/query`, {
        params: { query: objective.query },
      });
      const result = response.data.data.result[0]?.value[1] ? parseFloat(response.data.data.result[0].value[1]) : 0;
      const compliance = result >= objective.target;
      
      LoggerUtil.info('SLO evaluated', {
        slo: slo.slo.name,
        objective: objective.name,
        compliance,
        result,
        target: objective.target,
      });

      if (!compliance) {
        await AuditProducer.connect();
        await AuditProducer.sendAuditEvent({
          eventId: uuidv4(),
          userId: null,
          action: 'SLO_VIOLATION',
          ipAddress: 'system',
          status: 'ERROR',
          severity: 'HIGH',
          timestamp: new Date().toISOString(),
          metadata: { slo: slo.slo.name, objective: objective.name, result, target: objective.target },
        });
      }
    }
  } catch (error: unknown) {
    LoggerUtil.error('SLO evaluation failed', { sloFile, error: (error as Error).message });
    await AuditProducer.connect();
    await AuditProducer.sendAuditEvent({
      eventId: uuidv4(),
      userId: null,
      action: 'SLO_EVALUATION_FAILED',
      ipAddress: 'system',
      status: 'ERROR',
      severity: 'HIGH',
      timestamp: new Date().toISOString(),
      metadata: { sloFile, error: (error as Error).message },
    });
  } finally {
    await AuditProducer.disconnect().catch((err: unknown) =>
      LoggerUtil.error('Producer disconnect failed', { error: (err as Error).message })
    );
  }
}

async function initializeSLOMonitor(): Promise<void> {
  try {
   const sloFiles: string[] = [
  'observability/slo/definitions/auth-slo.yaml',
  'observability/slo/definitions/api-slo.yaml',
  'observability/slo/definitions/kafka-slo.yaml',
];

    
    // Schedule periodic SLO evaluation
    setInterval(() => {
      sloFiles.forEach((file) => evaluateSLO(file));
    }, 3600000); // Evaluate hourly
    
    LoggerUtil.info('SLO monitor initialized', { sloFiles });
  } catch (error: unknown) {
    LoggerUtil.error('SLO monitor initialization failed', { error: (error as Error).message });
    throw error;
  }
}

export { evaluateSLO, initializeSLOMonitor };