/**
 * prometheus-metrics.test.ts
 * Item 10: Verification Suite for Prometheus Metrics on Existing Endpoint
 * 
 * Requirements Tested:
 * 1. testSafetyGuard enabled
 * 2. GET /metrics returns 200 with text/plain content-type
 * 3. cache_operations_total counter registers and tracks hits, misses, and errors per domain
 * 4. bullmq_jobs_waiting and bullmq_jobs_failed gauges are registered and exposed
 * 5. presence_online_users gauge is registered and exposed
 */

import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import express from 'express';
import { assertTestEnvironmentSafety } from './testSafetyGuard';
import { prometheusRouter, promClient } from '@/shared/observability/metrics/exporters/prometheus.exporter';
import {
  cacheOperationsTotal,
  bullmqWaitingGauge,
  bullmqFailedGauge,
  presenceOnlineGauge,
  recordCacheHit,
  recordCacheMiss,
  recordCacheError,
} from '../cacheMetrics';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runPrometheusMetricsTests() {
  console.log('\n========================================================================');
  console.log('🧪 Starting Prometheus Metrics Endpoint & Registry Tests (Item 10)');
  console.log('========================================================================');

  const mongoUri = assertTestEnvironmentSafety();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const app = express();
  app.use(prometheusRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const port = address.port;

  try {
    // 1. Test /metrics HTTP endpoint exists and returns 200
    console.log('\n--- 1. HTTP Scrape on /metrics ---');
    const res = await fetch(`http://localhost:${port}/metrics`);
    assert(res.status === 200, 'GET /metrics returned status 200');
    assert(res.headers.get('content-type')?.includes('text/plain'), 'Content-Type is Prometheus text format');

  // 2. Test cache operations counter
  console.log('\n--- 2. Cache Hit/Miss/Error Counters ---');
  recordCacheHit('profile', 'get');
  recordCacheMiss('chat', 'get');
  recordCacheError('auth', 'set');

  const scrapedMetrics = await promClient.register.metrics();
  assert(scrapedMetrics.includes('cache_operations_total'), 'cache_operations_total is present in scraped metrics');
  assert(scrapedMetrics.includes('domain="profile"'), 'Profile domain label is present in cache metrics');
  assert(scrapedMetrics.includes('status="hit"'), 'Hit status is present in cache metrics');
  assert(scrapedMetrics.includes('domain="chat"'), 'Chat domain label is present');
  assert(scrapedMetrics.includes('status="miss"'), 'Miss status is present');
  assert(scrapedMetrics.includes('domain="auth"'), 'Auth domain label is present');
  assert(scrapedMetrics.includes('status="error"'), 'Error status is present');

  // 3. Test BullMQ Gauges
  console.log('\n--- 3. BullMQ Gauges (Waiting & Failed) ---');
  assert(scrapedMetrics.includes('bullmq_jobs_waiting'), 'bullmq_jobs_waiting gauge is exposed');
  assert(scrapedMetrics.includes('bullmq_jobs_failed'), 'bullmq_jobs_failed gauge is exposed');

  // 4. Test Presence Online Gauge
  console.log('\n--- 4. Presence Online Users Gauge ---');
  assert(scrapedMetrics.includes('presence_online_users'), 'presence_online_users gauge is exposed');

  console.log('\n========================================================================');
  console.log('✅ ALL PROMETHEUS METRICS TESTS PASSED (ITEM 10)');
  console.log('========================================================================\n');
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runPrometheusMetricsTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error in metrics test:', err);
      process.exit(1);
    });
}

export default runPrometheusMetricsTests;
