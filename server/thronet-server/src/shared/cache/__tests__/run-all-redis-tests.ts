/**
 * run-all-redis-tests.ts
 * Master runner for all Redis cache, queue, and behavioural integration test suites.
 * Exits with non-zero code immediately if ANY suite fails.
 */

import dotenv from 'dotenv';
dotenv.config();
process.env['NODE_ENV'] = 'test';
process.env['MONGODB_TEST_URI'] = 'mongodb://127.0.0.1:27017/thronet_test';
process.env['MONGODB_URI'] = 'mongodb://127.0.0.1:27017/thronet_test';
process.env['REDIS_HOST'] = '127.0.0.1';
process.env['REDIS_PORT'] = '6379';
process.env['REDIS_URL'] = 'redis://127.0.0.1:6379';
process.env['LOG_DIR'] = './logs';
import { spawn } from 'child_process';
import path from 'path';
import { assertTestEnvironmentSafety } from './testSafetyGuard';

const testFiles = [
  'src/shared/cache/__tests__/cache.test.ts',
  'src/shared/cache/__tests__/mentorship-cache.test.ts',
  'src/auth/__tests__/password-change.test.ts',
  'src/shared/cache/__tests__/book-range-concurrency.test.ts',
  'src/shared/cache/__tests__/mentor-version-eviction.test.ts',
  'src/shared/cache/__tests__/pre-update-hooks.test.ts',
  'src/shared/cache/__tests__/write-gap-invalidation.test.ts',
  'src/shared/cache/__tests__/behavioural-e2e.test.ts',
  'src/shared/cache/__tests__/token-blacklist.test.ts',
  'src/shared/cache/__tests__/auth-cache.test.ts',
  'src/auth/__tests__/sessionless-auth.test.ts',
  'src/shared/queues/__tests__/queue.test.ts',
  'src/shared/cache/__tests__/notification-cache.test.ts',
  'src/shared/cache/__tests__/chat-cache.test.ts',
  'src/shared/cache/__tests__/profile-cache.test.ts',
  'src/shared/cache/__tests__/connection-cache.test.ts',
  'src/shared/cache/__tests__/study-cache.test.ts',
  'src/shared/cache/__tests__/doubt-company-comment-cache.test.ts',
  'src/shared/cache/__tests__/master-cache.test.ts',
  'src/shared/cache/__tests__/socket-adapter-presence.test.ts',
  'src/shared/cache/__tests__/prometheus-metrics.test.ts',
  'src/shared/cache/__tests__/headline-allowlist.test.ts',
  'src/shared/cache/__tests__/testSafetyGuard.test.ts',
  'src/shared/cache/__tests__/real-server-boot-blacklist.test.ts',
];

async function runTestFile(file: string): Promise<boolean> {
  console.log(`\n============================================================`);
  console.log(`🚀 RUNNING SUITE: ${file}`);
  console.log(`============================================================\n`);

  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', file], {
      cwd: path.resolve(__dirname, '../../../../'),
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: 'true' },
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ SUITE PASSED: ${file}\n`);
        resolve(true);
      } else {
        console.error(`\n❌ SUITE FAILED with exit code ${code}: ${file}\n`);
        resolve(false);
      }
    });

    child.on('error', (err) => {
      console.error(`\n❌ SUITE ERROR: ${file}`, err);
      resolve(false);
    });
  });
}

async function main() {
  assertTestEnvironmentSafety();
  const startTime = Date.now();
  console.log('============================================================');
  console.log('🏁 STARTING MASTER REDIS TEST RUNNER (ALL SUITES)');
  console.log('============================================================');

  let passed = 0;
  let failed = 0;
  const failedSuites: string[] = [];

  for (const file of testFiles) {
    const success = await runTestFile(file);
    if (success) {
      passed++;
    } else {
      failed++;
      failedSuites.push(file);
      // Fail-fast on failure
      console.error(`\n🚨 Master runner aborting due to failure in: ${file}`);
      process.exit(1);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n============================================================');
  console.log(`🎉 ALL ${passed} REDIS SUITES PASSED IN ${durationSec}s (0 FAILURES)`);
  console.log('============================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
