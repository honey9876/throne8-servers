/**
 * testSafetyGuard.test.ts
 * Unit tests for strict local-only safety guard.
 * Validates positive cases and required negative test cases.
 */

import { validateEnvironmentSafety } from './testSafetyGuard';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

function expectThrows(fn: () => void, expectedSnippet: string, testName: string) {
  try {
    fn();
    console.error(`  [FAIL] Expected exception containing "${expectedSnippet}" but none was thrown (${testName})`);
    throw new Error(`Expected exception containing "${expectedSnippet}"`);
  } catch (err: any) {
    if (err.message && err.message.includes(expectedSnippet)) {
      console.log(`  [PASS] Correctly threw expected error for ${testName}: "${err.message}"`);
    } else {
      console.error(`  [FAIL] Threw unexpected error: ${err.message}`);
      throw err;
    }
  }
}

async function runSafetyGuardTests() {
  console.log('\n============================================================');
  console.log('🛡️ Starting Strict Test Safety Guard Unit Tests');
  console.log('============================================================');

  // --- 1. Positive Tests (Local MongoDB & Local Redis) ---
  console.log('\n--- 1. Valid Local Environments ---');
  const valid1 = validateEnvironmentSafety({
    mongoUri: 'mongodb://127.0.0.1:27017/thronet_test',
    redisHost: '127.0.0.1',
    redisUrl: 'redis://127.0.0.1:6379',
    redisQueueUrl: 'redis://127.0.0.1:6380',
    redisClusterNodes: '127.0.0.1:7001,127.0.0.1:7002',
  });
  assert(valid1.dbName === 'thronet_test', 'Parsed valid dbName thronet_test');
  assert(valid1.mongoHost === '127.0.0.1', 'Parsed valid mongoHost 127.0.0.1');

  const valid2 = validateEnvironmentSafety({
    mongoUri: 'mongodb://localhost:27017/app_test_db',
    redisHost: 'localhost',
  });
  assert(valid2.mongoHost === 'localhost', 'Parsed localhost mongoHost');

  const valid3 = validateEnvironmentSafety({
    mongoUri: 'mongodb://127.0.0.1:27017/thronet_test',
    redisHost: 'custom-ci-redis',
    redisTestUrl: 'redis://custom-ci-redis:6379',
  });
  assert(valid3.dbName === 'thronet_test', 'Allowed custom host matching REDIS_TEST_URL');

  // --- 2. Negative Tests (Strictly Required Rejections) ---
  console.log('\n--- 2. Required Negative Tests ---');

  // Negative Test A: "prod-local-cache.example.com" must be rejected (cannot bypass with 'local')
  expectThrows(
    () =>
      validateEnvironmentSafety({
        mongoUri: 'mongodb://127.0.0.1:27017/thronet_test',
        redisHost: 'prod-local-cache.example.com',
      }),
    'is not a local/test instance',
    'prod-local-cache.example.com Redis host rejection'
  );

  // Negative Test B: "mongodb://remote/test" must be rejected (cannot bypass with remote host)
  expectThrows(
    () =>
      validateEnvironmentSafety({
        mongoUri: 'mongodb://remote/test',
        redisHost: '127.0.0.1',
      }),
    'MongoDB host "remote" is not local',
    'mongodb://remote/test remote Mongo rejection'
  );

  // Negative Test C: Non-test DB name rejected
  expectThrows(
    () =>
      validateEnvironmentSafety({
        mongoUri: 'mongodb://127.0.0.1:27017/production_database',
        redisHost: '127.0.0.1',
      }),
    'does not contain "test"',
    'Production database name rejection'
  );

  // Negative Test D: Remote REDIS_QUEUE_URL rejected
  expectThrows(
    () =>
      validateEnvironmentSafety({
        mongoUri: 'mongodb://127.0.0.1:27017/thronet_test',
        redisHost: '127.0.0.1',
        redisQueueUrl: 'redis://queue.internal.corp:6379',
      }),
    'is not a local/test instance',
    'Remote REDIS_QUEUE_URL rejection'
  );

  // Negative Test E: Remote node in REDIS_CLUSTER_NODES rejected
  expectThrows(
    () =>
      validateEnvironmentSafety({
        mongoUri: 'mongodb://127.0.0.1:27017/thronet_test',
        redisHost: '127.0.0.1',
        redisClusterNodes: '127.0.0.1:7001,node-2.redis.prod:7002',
      }),
    'is not a local/test instance',
    'Remote REDIS_CLUSTER_NODES rejection'
  );

  console.log('\n============================================================');
  console.log('✅ ALL TEST SAFETY GUARD TESTS PASSED (100% SUCCESS)');
  console.log('============================================================\n');
}

runSafetyGuardTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal safety test error:', err);
    process.exit(1);
  });
