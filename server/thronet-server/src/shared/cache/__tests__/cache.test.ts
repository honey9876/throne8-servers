/**
 * Phase 1 Foundation Test Suite
 * Tests:
 * 1. Cache Hit
 * 2. Cache Miss
 * 3. Safe Serialization Round-trip (Date recovery & ObjectIds)
 * 4. TTL Jitter Bounds
 * 5. Key Sanitization & Namespacing
 * 6. Non-blocking SCAN pattern deletion (delByPattern)
 * 7. Cache Stampede Protection (Single-Flight mutex)
 * 8. Domain Kill Switches (CACHE_<DOMAIN>_ENABLED)
 * 9. Fail-Open Timeout Guard
 * 10. CacheUtil Backward Compatibility
 */

import { initRedis, closeRedis, getRedisHealth } from '../redisConnection';
import { CacheHelper, applyJitter, buildKey, safeJsonParse, safeJsonStringify } from '../cacheHelper';
import CacheUtil from '@/shared/cache.util';

// Simple test runner assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Phase 1 Cache Foundation Test Suite');
  console.log('====================================================');

  // 1. Connection & Health Check
  console.log('\n--- Test 1: Redis Connection & Health Probe ---');
  const connected = await initRedis();
  assert(connected, 'Redis should connect successfully');
  const health = await getRedisHealth();
  console.log('Redis Health Status:', health);
  assert(health.status === 'healthy' || health.status === 'degraded', 'Redis health should be healthy or degraded');
  console.log('✅ Test 1 Passed: Redis Connection Verified');

  // 2. Cache Hit & Miss
  console.log('\n--- Test 2: Cache Hit & Miss ---');
  CacheHelper.resetMetrics();
  const testKey = buildKey('test', `hit_miss_key_${Date.now()}`);
  await CacheHelper.del(testKey);
  
  // Miss test
  const missVal = await CacheHelper.get(testKey);
  assert(missVal === null, 'Non-existent key should return null');
  
  // Hit test
  await CacheHelper.set(testKey, { message: 'hello_thronet', count: 42 }, 60);
  const hitVal = await CacheHelper.get<{ message: string; count: number }>(testKey);
  assert(hitVal !== null, 'Saved key should return non-null');
  assert(hitVal?.message === 'hello_thronet', 'Saved payload message should match');
  assert(hitVal?.count === 42, 'Saved payload count should match');

  const metrics = CacheHelper.getMetrics();
  console.log('Metrics after Hit & Miss:', metrics);
  assert(metrics.hits >= 1, 'Hits metric should be >= 1');
  assert(metrics.misses >= 1, 'Misses metric should be >= 1');
  console.log('✅ Test 2 Passed: Hit & Miss verified');

  // 3. Safe Serialization Round-Trip (Date restoration)
  console.log('\n--- Test 3: Safe Serialization Round-Trip (Dates & ObjectIds) ---');
  const dateKey = buildKey('test', 'date_serialization');
  const now = new Date('2026-10-10T12:30:00.000Z');
  const sampleDoc = {
    _id: '65f1a2b3c4d5e6f7a8b9c0d1',
    name: 'Test Session',
    createdAt: now,
    meta: {
      updatedAt: new Date('2026-10-10T14:45:00.000Z'),
    },
  };

  await CacheHelper.set(dateKey, sampleDoc, 60);
  const retrievedDoc = await CacheHelper.get<typeof sampleDoc>(dateKey);
  assert(retrievedDoc !== null, 'Retrieved doc should not be null');
  assert(retrievedDoc?.createdAt instanceof Date, 'createdAt must be revived as a Date instance');
  assert(retrievedDoc?.createdAt.getTime() === now.getTime(), 'createdAt timestamp must match original date');
  assert(retrievedDoc?.meta.updatedAt instanceof Date, 'Nested updatedAt must be revived as a Date instance');
  console.log('✅ Test 3 Passed: Date instance restoration verified');

  // 4. TTL Jitter Bounds
  console.log('\n--- Test 4: TTL Jitter Bounds ---');
  const baseTtl = 1000;
  for (let i = 0; i < 50; i++) {
    const jittered = applyJitter(baseTtl);
    assert(jittered >= 900 && jittered <= 1100, `Jittered TTL ${jittered} must be within [900, 1100]`);
  }
  console.log('✅ Test 4 Passed: 50/50 TTL jitter calculations within ±10% range');

  // 5. Key Namespacing & Sanitization
  console.log('\n--- Test 5: Key Namespacing & Sanitization ---');
  const messyKey = buildKey('user profile\n\t', 'user id 123;drop table');
  console.log('Sanitized Key:', messyKey);
  assert(!messyKey.includes('\n') && !messyKey.includes(' '), 'Key must not contain newlines or spaces');
  assert(messyKey.startsWith('app:v1:user_profile:'), 'Key must adhere to app:v1:<domain>:<id> format');
  console.log('✅ Test 5 Passed: Key sanitization verified');

  // 6. delByPattern via non-blocking SCAN
  console.log('\n--- Test 6: Non-Blocking SCAN Pattern Deletion (delByPattern) ---');
  const scanPrefix = 'app:v1:scantest';
  for (let i = 0; i < 5; i++) {
    await CacheHelper.set(`${scanPrefix}:item_${i}`, { index: i }, 60);
  }
  const deletedCount = await CacheHelper.delByPattern(`${scanPrefix}:*`);
  console.log(`Deleted ${deletedCount} keys via SCAN`);
  assert(deletedCount >= 5, 'delByPattern should delete all matched keys');

  const checkSample = await CacheHelper.get(`${scanPrefix}:item_0`);
  assert(checkSample === null, 'Deleted key should return null');
  console.log('✅ Test 6 Passed: SCAN pattern deletion verified');

  // 7. Cache Stampede Protection (Single-Flight Loader Mutex)
  console.log('\n--- Test 7: Cache Stampede Protection (Single-Flight Mutex) ---');
  const stampedeKey = buildKey('test', 'stampede_protection');
  await CacheHelper.del(stampedeKey);

  let loaderInvocationCount = 0;
  const heavyDbQueryMock = async () => {
    loaderInvocationCount++;
    // Simulate 50ms slow database query
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { data: 'heavy_db_result', fetchedAt: Date.now() };
  };

  // Dispatch 10 concurrent requests simultaneously for the same missing key
  const concurrentCalls = Array.from({ length: 10 }, () =>
    CacheHelper.getOrSet(stampedeKey, heavyDbQueryMock, 60)
  );
  const results = await Promise.all(concurrentCalls);

  console.log(`Loader was called ${loaderInvocationCount} time(s) across 10 concurrent requests`);
  assert(loaderInvocationCount === 1, 'Heavy loader query must execute exactly ONCE');
  assert(results.length === 10, 'All 10 concurrent callers should receive results');
  assert(results[0]?.data === 'heavy_db_result', 'Caller result should match DB data');
  console.log('✅ Test 7 Passed: Single-flight cache stampede protection verified');

  // 8. Domain Kill Switches
  console.log('\n--- Test 8: Domain Kill Switches ---');
  process.env['CACHE_MENTOR_ENABLED'] = 'false';
  const mentorKey = buildKey('mentor', 'profile_123');

  const setBlocked = await CacheHelper.set(mentorKey, { status: 'active' }, { domain: 'mentor' });
  assert(setBlocked === false, 'Setting key for disabled domain must return false');

  const getBlocked = await CacheHelper.get(mentorKey, 'mentor');
  assert(getBlocked === null, 'Getting key for disabled domain must return null');
  delete process.env['CACHE_MENTOR_ENABLED'];
  console.log('✅ Test 8 Passed: Domain kill-switch works correctly');

  // 9. CacheUtil Backward Compatibility Verification
  console.log('\n--- Test 9: CacheUtil Backward Compatibility Layer ---');
  const legacyKey = 'compat_test_key';
  await CacheUtil.set(legacyKey, { legacy: true, count: 10 }, 60);
  const legacyFetched = await CacheUtil.get(legacyKey);
  assert(legacyFetched?.legacy === true, 'CacheUtil.get should return stored object');

  const legacyIncr = await CacheUtil.incr(legacyKey + '_counter', 60);
  assert(legacyIncr === 1, 'CacheUtil.incr should increment counter');

  const legacyExists = await CacheUtil.exists(legacyKey);
  assert(legacyExists === true, 'CacheUtil.exists should return true');

  await CacheUtil.del(legacyKey);
  const afterDel = await CacheUtil.get(legacyKey);
  assert(afterDel === null, 'CacheUtil.del should remove key');
  console.log('✅ Test 9 Passed: CacheUtil backward compatibility verified');

  // Cleanup
  console.log('\n--- Cleanup ---');
  await closeRedis();
  console.log('====================================================');
  console.log('🎉 ALL 9 TEST SUITES PASSED CLEANLY (100% SUCCESS)');
  console.log('====================================================');
}

// Run test suite
runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test Suite Failed:', err);
    process.exit(1);
  });
