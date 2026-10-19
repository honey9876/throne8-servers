/**
 * scripts/benchmark.ts
 * Empirical local-machine performance benchmark comparing Redis Cache ON vs Kill-Switch ON (Bypass to MongoDB).
 * 
 * Benchmarks:
 * 1. Authenticated Endpoint (/api/v1/health or /api/v1/auth/profile)
 * 2. Profile (/api/v1/profile/me)
 * 3. Notifications Unread Count (/api/v1/notifications/unread-count)
 * 4. Chat Conversation List (/api/v1/messaging/conversations)
 * 5. StudyGroup Leaderboard (/api/v1/study-group/leaderboard)
 * 6. Email OTP Dispatch (/api/v1/auth/email/send-otp)
 */

import './setup-bench-env';

import http from 'http';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { assertTestEnvironmentSafety } from '../src/shared/cache/__tests__/testSafetyGuard';
import { getRedisClient } from '../src/shared/cache/redisConnection';
import User from '../src/auth/models/User.model';
import Ranking from '../src/StudyGroup/models/Ranking.model';
import GroupCategory from '../src/StudyGroup/enums/GroupCategory.enum';

interface BenchmarkConfig {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  connections: number;
  durationSeconds: number;
}

export interface BenchmarkResult {
  endpoint: string;
  name: string;
  requestsTotal: number;
  throughputRps: number;
  latencyAvgMs: number;
  latencyP99Ms: number;
  errorsTotal: number;
}

async function runHttpBenchmark(baseUrl: string, config: BenchmarkConfig): Promise<BenchmarkResult> {
  const url = new URL(config.endpoint, baseUrl);
  const startTime = Date.now();
  const endTime = startTime + config.durationSeconds * 1000;

  let requests = 0;
  let errors = 0;
  const latencies: number[] = [];

  return new Promise<BenchmarkResult>((resolve) => {
    let activeConnections = 0;
    let stopping = false;

    function sendRequest() {
      if (Date.now() >= endTime) {
        if (!stopping) {
          stopping = true;
        }
        if (activeConnections === 0) {
          finish();
        }
        return;
      }

      activeConnections++;
      const reqStart = process.hrtime.bigint();

      const req = http.request(
        url,
        {
          method: config.method,
          headers: {
            'Content-Type': 'application/json',
            ...(config.headers || {}),
          },
          timeout: 4000,
        },
        (res) => {
          res.on('data', () => {});
          res.on('end', () => {
            const reqEnd = process.hrtime.bigint();
            const latencyMs = Number(reqEnd - reqStart) / 1_000_000;
            latencies.push(latencyMs);
            requests++;
            activeConnections--;
            sendRequest();
          });
        }
      );

      req.on('error', () => {
        errors++;
        activeConnections--;
        sendRequest();
      });

      if (config.body) {
        req.write(config.body);
      }
      req.end();
    }

    function finish() {
      latencies.sort((a, b) => a - b);
      const totalTimeSec = (Date.now() - startTime) / 1000;
      const throughputRps = totalTimeSec > 0 ? Math.round(requests / totalTimeSec) : 0;
      const sum = latencies.reduce((a, b) => a + b, 0);
      const latencyAvgMs = latencies.length > 0 ? Math.round((sum / latencies.length) * 100) / 100 : 0;
      const p99Index = Math.floor(latencies.length * 0.99);
      const latencyP99Ms = latencies.length > 0 ? Math.round(latencies[p99Index]! * 100) / 100 : 0;

      resolve({
        endpoint: config.endpoint,
        name: config.name,
        requestsTotal: requests,
        throughputRps,
        latencyAvgMs,
        latencyP99Ms,
        errorsTotal: errors,
      });
    }

    // Launch initial concurrent connections
    for (let i = 0; i < config.connections; i++) {
      sendRequest();
    }
  });
}

export async function runFullBenchmark(): Promise<{
  cacheOn: BenchmarkResult[];
  cacheOff: BenchmarkResult[];
}> {
  console.log('\n========================================================================');
  console.log('⚡ STARTING LOCAL-MACHINE EMPIRICAL BENCHMARK SUITE');
  console.log('========================================================================');

  const mongoUri = assertTestEnvironmentSafety();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const redis = getRedisClient();
  await redis.ping();

  // 1. Seed benchmark user
  const benchUserId = 'bench_user_' + uuidv4().substring(0, 8);
  const benchEmail = `bench_${Date.now()}@example.com`;

  await User.deleteMany({ email: benchEmail });
  const userDoc = await User.create({
    userId: benchUserId,
    email: benchEmail,
    passwordHash: 'dummy_hash_for_benchmark',
    firstName: 'Bench',
    lastName: 'Tester',
    status: 'active',
    accountStatus: 'active',
  });

  const authToken = User.generateAccessToken({
    userId: benchUserId,
    email: benchEmail,
    role: 'user',
  });

  // Seed sample leaderboard rankings
  await Ranking.deleteMany({ userId: benchUserId });
  await Ranking.create({
    rankingId: uuidv4(),
    userId: benchUserId,
    totalStudyHours: 120,
    attendancePercentage: 90,
    currentStreak: 15,
    globalRank: 1,
    category: GroupCategory.OTHER,
  });

  // 2. Start HTTP server on port 5057
  const BENCH_PORT = 5057;
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(BENCH_PORT, resolve));
  const baseUrl = `http://127.0.0.1:${BENCH_PORT}`;
  console.log(`✅ Benchmark server listening on ${baseUrl}\n`);

  const suites: BenchmarkConfig[] = [
    {
      name: '1. Authenticated Endpoint',
      endpoint: '/api/v1/auth/profile',
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` },
      connections: 20,
      durationSeconds: 3,
    },
    {
      name: '2. Profile Endpoint',
      endpoint: '/api/v1/profile/me',
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` },
      connections: 20,
      durationSeconds: 3,
    },
    {
      name: '3. Notifications Unread Count',
      endpoint: '/api/v1/notifications/unread-count',
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` },
      connections: 20,
      durationSeconds: 3,
    },
    {
      name: '4. Chat Conversation List',
      endpoint: '/api/v1/messaging/conversations',
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` },
      connections: 20,
      durationSeconds: 3,
    },
    {
      name: '5. Leaderboard Page',
      endpoint: '/api/v1/study-group/leaderboard',
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` },
      connections: 20,
      durationSeconds: 3,
    },
    {
      name: '6. Email OTP Dispatch',
      endpoint: '/api/v1/auth/email/send-otp',
      method: 'POST',
      body: JSON.stringify({ email: benchEmail }),
      connections: 10,
      durationSeconds: 3,
    },
  ];

  // --------------------------------------------------------------------------
  // RUN 1: Cache ENABLED (CACHE_GLOBAL_ENABLED=true)
  // --------------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log('🚀 RUN 1: CACHE ON (CACHE_GLOBAL_ENABLED=true, Kill Switches OFF)');
  console.log('------------------------------------------------------------------------');
  process.env['CACHE_GLOBAL_ENABLED'] = 'true';
  process.env['CACHE_QUEUE_EMAIL_ENABLED'] = 'true';

  // Warm up cache
  try {
    await fetch(`${baseUrl}/api/v1/auth/profile`, { headers: { Authorization: `Bearer ${authToken}` } });
    await fetch(`${baseUrl}/api/v1/profile/me`, { headers: { Authorization: `Bearer ${authToken}` } });
    await fetch(`${baseUrl}/api/v1/notifications/unread-count`, { headers: { Authorization: `Bearer ${authToken}` } });
    await fetch(`${baseUrl}/api/v1/study-group/leaderboard`, { headers: { Authorization: `Bearer ${authToken}` } });
  } catch {}

  const cacheOnResults: BenchmarkResult[] = [];
  for (const s of suites) {
    process.stdout.write(`  Measuring ${s.name}... `);
    const res = await runHttpBenchmark(baseUrl, s);
    cacheOnResults.push(res);
    console.log(`[RPS: ${res.throughputRps}, Avg: ${res.latencyAvgMs}ms, p99: ${res.latencyP99Ms}ms]`);
  }

  // --------------------------------------------------------------------------
  // RUN 2: Cache DISABLED (CACHE_GLOBAL_ENABLED=false, Kill Switch ON)
  // --------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('🛑 RUN 2: CACHE OFF / KILL SWITCH ON (CACHE_GLOBAL_ENABLED=false, Direct DB)');
  console.log('------------------------------------------------------------------------');
  process.env['CACHE_GLOBAL_ENABLED'] = 'false';
  process.env['CACHE_QUEUE_EMAIL_ENABLED'] = 'false';

  const cacheOffResults: BenchmarkResult[] = [];
  for (const s of suites) {
    process.stdout.write(`  Measuring ${s.name}... `);
    const res = await runHttpBenchmark(baseUrl, s);
    cacheOffResults.push(res);
    console.log(`[RPS: ${res.throughputRps}, Avg: ${res.latencyAvgMs}ms, p99: ${res.latencyP99Ms}ms]`);
  }

  // Teardown
  server.close();
  delete process.env['CACHE_GLOBAL_ENABLED'];
  delete process.env['CACHE_QUEUE_EMAIL_ENABLED'];

  // Print Comparison Table
  console.log('\n========================================================================================================');
  console.log('📊 BENCHMARK COMPARISON TABLE (LOCAL MACHINE MEASURED NUMBERS)');
  console.log('========================================================================================================');
  console.log('| Scenario                         | Cache ON (RPS) | Cache OFF (RPS) | Cache ON (Avg) | Cache OFF (Avg) | Speedup |');
  console.log('| :--------------------------------| -------------: | --------------: | -------------: | --------------: | ------: |');

  for (let i = 0; i < suites.length; i++) {
    const on = cacheOnResults[i]!;
    const off = cacheOffResults[i]!;
    const speedup = off.latencyAvgMs > 0 ? (off.latencyAvgMs / Math.max(0.1, on.latencyAvgMs)).toFixed(1) + 'x' : '1.0x';
    const namePad = on.name.padEnd(32, ' ');
    const onRps = String(on.throughputRps).padStart(14, ' ');
    const offRps = String(off.throughputRps).padStart(15, ' ');
    const onAvg = (on.latencyAvgMs + ' ms').padStart(14, ' ');
    const offAvg = (off.latencyAvgMs + ' ms').padStart(15, ' ');
    const spd = speedup.padStart(7, ' ');
    console.log(`| ${namePad} | ${onRps} | ${offRps} | ${onAvg} | ${offAvg} | ${spd} |`);
  }
  console.log('========================================================================================================\n');

  return { cacheOn: cacheOnResults, cacheOff: cacheOffResults };
}

runFullBenchmark()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal benchmark error:', err);
    process.exit(1);
  });
