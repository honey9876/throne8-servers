process.env['NODE_ENV'] = 'test';
import dotenv from 'dotenv';
dotenv.config();
process.env['NODE_ENV'] = 'test';
process.env['MONGODB_TEST_URI'] = 'mongodb://127.0.0.1:27017/thronet_test';
process.env['MONGODB_URI'] = 'mongodb://127.0.0.1:27017/thronet_test';
process.env['USE_REDIS'] = 'true';
process.env['REDIS_HOST'] = '127.0.0.1';
process.env['REDIS_PORT'] = '6379';
process.env['LOG_DIR'] = './logs';

import http from 'http';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../../../app';
import { assertTestEnvironmentSafety } from './testSafetyGuard';
import { getRedisClient, initRedis, setRedisHealthOverride } from '../redisConnection';
import CacheUtil from '../../cache.util';
import User from '../../../auth/models/User.model';
import Session from '../../../auth/models/Session.model';
import { hashTokenForBlacklist } from '../../utils/tokenBlacklist.util';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function request(
  server: http.Server,
  path: string,
  method: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; body: any }> {
  const addr = server.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}${path}`;

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runRealServerBlacklistTest() {
  console.log('\n============================================================');
  console.log('🧪 Starting Real Server Boot & Token Blacklist Test (Item 1)');
  console.log('============================================================');

  const mongoUri = assertTestEnvironmentSafety();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  await initRedis();
  await CacheUtil.init();
  const redis = getRedisClient();
  await redis.ping();

  // 1. Seed user
  const testEmail = `blacklist_boot_${Date.now()}@example.com`;
  const plainPassword = 'Password123!';
  const userId = 'usr_boot_' + uuidv4().substring(0, 8);

  await User.deleteMany({ email: testEmail });
  const user = await User.create({
    userId,
    email: testEmail,
    passwordHash: plainPassword,
    firstName: 'Real',
    lastName: 'BootTester',
    status: 'active',
    accountStatus: 'active',
    emailVerified: true,
  });

  // 2. Boot HTTP server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  console.log(`✅ Real Express server booted and listening on port ${port}`);

  try {
    // 3. Test Health Check endpoint reporting Redis (Healthy state)
    console.log('\n--- 1. Health Check Endpoint Verification (Healthy) ---');
    const healthRes = await request(server, '/api/v1/health', 'GET');
    assert(healthRes.status === 200, 'GET /api/v1/health returns 200 OK');
    assert(healthRes.body?.status === 'ok', 'Health status is ok');
    assert(healthRes.body?.dependencies?.redis === 'ready' || healthRes.body?.dependencies?.redis === 'healthy', 'Redis dependency reports healthy/ready');

    const readyRes = await request(server, '/api/v1/health/ready', 'GET');
    assert(readyRes.status === 200, 'GET /api/v1/health/ready returns 200 OK');
    assert(readyRes.body?.dependencies?.mongodb === 'connected', 'MongoDB dependency reports connected');

    // 3b. Test Health Check endpoint when Redis is DOWN (Item 1 requirement)
    console.log('\n--- 1b. Health Check Endpoint Verification when Redis is DOWN (Item 1) ---');
    setRedisHealthOverride({
      status: 'down',
      latencyMs: 0,
      isCluster: false,
      totalConnections: 0,
      message: 'Connection refused (ECONNREFUSED)',
    });

    const healthDownRes = await request(server, '/api/v1/health', 'GET');
    assert(healthDownRes.status === 200, 'Liveness GET /api/v1/health returns 200 OK even when Redis is down');
    assert(healthDownRes.body?.status === 'degraded', 'Liveness reports degraded when Redis is down');
    assert(healthDownRes.body?.dependencies?.redis === 'down', 'Liveness body explicitly contains redis: "down"');

    const readyDownRes = await request(server, '/api/v1/health/ready', 'GET');
    assert(readyDownRes.status === 200, 'Readiness GET /api/v1/health/ready returns 200 OK (does NOT fail on Redis alone)');
    assert(readyDownRes.body?.dependencies?.mongodb === 'connected', 'Readiness reports mongodb connected');
    assert(readyDownRes.body?.dependencies?.redis === 'down', 'Readiness body explicitly contains redis: "down"');

    // Restore health override
    setRedisHealthOverride(null);

    // 4. Login via real API endpoint
    console.log('\n--- 2. User Login via Real API ---');
    const loginRes = await request(server, '/api/v1/auth/login', 'POST', {}, {
      email: testEmail,
      password: plainPassword,
    });
    assert(loginRes.status === 200, 'Login returned HTTP 200');
    const accessToken = loginRes.body?.data?.tokens?.accessToken || loginRes.body?.data?.accessToken;
    assert(!!accessToken, 'Access token successfully obtained');

    // 5. Verify token works on authenticated endpoint
    console.log('\n--- 3. Authenticated Endpoint Access with Fresh Token ---');
    const profileResBefore = await request(server, '/api/v1/auth/profile', 'GET', {
      Authorization: `Bearer ${accessToken}`,
    });
    assert(profileResBefore.status === 200, 'Accessing /api/v1/auth/profile with fresh token succeeds (200)');

    // 6. Test Token Blacklist Fail Modes when Redis is DOWN (Item 3 requirement)
    console.log('\n--- 4. Token Blacklist Policy when Redis is DOWN (Item 3) ---');
    // Simulate Redis down for CacheUtil
    CacheUtil.setConnectionOverride(false);

    // 6a. BLACKLIST_FAIL_MODE=closed (default) -> strictly reject 401
    process.env['BLACKLIST_FAIL_MODE'] = 'closed';
    const profileClosedRes = await request(server, '/api/v1/auth/profile', 'GET', {
      Authorization: `Bearer ${accessToken}`,
    });
    assert(profileClosedRes.status === 401, 'In closed mode, request rejected with HTTP 401 Unauthorized when Redis is down');
    console.log('  [PASS] Fail-closed: prevented unverified token access during Redis outage');

    // 6b. BLACKLIST_FAIL_MODE=database -> check MongoDB session
    process.env['BLACKLIST_FAIL_MODE'] = 'database';
    const profileDbModeRes = await request(server, '/api/v1/auth/profile', 'GET', {
      Authorization: `Bearer ${accessToken}`,
    });
    assert(profileDbModeRes.status === 200, 'In database mode, active session verified via MongoDB returns HTTP 200');
    console.log('  [PASS] Fail-to-DB: active session successfully authenticated via MongoDB fallback');

    // 6c. Now terminate session in MongoDB while Redis is still down
    await Session.updateMany({ userId }, { $set: { isActive: false, terminatedAt: new Date() } });
    const profileDbRevokedRes = await request(server, '/api/v1/auth/profile', 'GET', {
      Authorization: `Bearer ${accessToken}`,
    });
    assert(profileDbRevokedRes.status === 401, 'In database mode, terminated session strictly rejected with HTTP 401');
    console.log('  [PASS] Fail-to-DB: revoked session rejected based on MongoDB session state');

    // Re-activate session & restore CacheUtil override
    await Session.updateMany({ userId }, { $set: { isActive: true, terminatedAt: undefined } });
    CacheUtil.setConnectionOverride(null);
    delete process.env['BLACKLIST_FAIL_MODE'];

    // 7. User Logout (Blacklisting Token in Redis)
    console.log('\n--- 5. User Logout (Blacklisting Token in Redis) ---');
    const logoutRes = await request(server, '/api/v1/auth/logout', 'POST', {
      Authorization: `Bearer ${accessToken}`,
    });
    assert(logoutRes.status === 200, 'Logout returned HTTP 200');

    // 8. Verify blacklist key exists in Redis
    console.log('\n--- 6. Verify Blacklist Key in Redis ---');
    const tokenHash = hashTokenForBlacklist(accessToken);
    const expectedKey = `auth:blacklist:access:${tokenHash}`;
    const rawEntry = await redis.get(expectedKey);
    assert(rawEntry !== null, `Blacklist key "${expectedKey}" confirmed present in Redis!`);
    const ttl = await redis.ttl(expectedKey);
    assert(ttl > 0, `Blacklist key has active TTL (${ttl}s remaining)`);

    // 9. Verify revoked token is strictly rejected by AuthMiddleware
    console.log('\n--- 7. Verify Revoked Token Rejected on Next Request ---');
    const profileResAfter = await request(server, '/api/v1/auth/profile', 'GET', {
      Authorization: `Bearer ${accessToken}`,
    });
    assert(profileResAfter.status === 401, 'Request with revoked token strictly rejected with HTTP 401 Unauthorized');
    console.log('  [PASS] Revoked token cannot access protected endpoints');

    console.log('\n============================================================');
    console.log('✅ REAL SERVER BOOT & BLACKLIST TEST PASSED (100% SUCCESS)');
    console.log('============================================================\n');
  } finally {
    server.close();
    await User.deleteMany({ email: testEmail });
    await Session.deleteMany({ userId });
  }
}

runRealServerBlacklistTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error in real server blacklist test:', err);
    process.exit(1);
  });
