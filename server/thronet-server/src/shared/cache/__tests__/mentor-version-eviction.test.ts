/**
 * mentor-version-eviction.test.ts
 * Rigorous test verifying that per-mentor availability cache version key is eviction-safe:
 * A lost/evicted version key in Redis can NEVER make old cached slots reachable again.
 */

import {
  getMentorAvailabilityVersion,
  incrementMentorAvailabilityVersion,
  getCachedAvailableSlots,
  setCachedAvailableSlots,
  buildSlotsCacheKey,
} from '../mentorshipCache';
import { getRedisClient, closeRedisConnection } from '../redisConnection';
import { buildKey } from '../cacheHelper';

function assert(condition: boolean, msg: string): void {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
  } else {
    console.error(`  [FAIL] ${msg}`);
    throw new Error(`Assertion Failed: ${msg}`);
  }
}

import { assertTestEnvironmentSafety } from './testSafetyGuard';

async function runMentorVersionEvictionTests(): Promise<void> {
  console.log('====================================================');
  console.log('🧪 Starting Mentor Version Eviction Safety Test Suite');
  console.log('====================================================');

  assertTestEnvironmentSafety();
  const client = getRedisClient();
  await client.ping();

  const mentorId = `mentor_evict_test_${Date.now()}`;
  const dateStr = '2026-12-15';
  const tz = 'Asia/Kolkata';
  const verKey = buildKey('mentorship_availability', `mentor_ver:${mentorId}`);

  try {
    // Step 1: Initial state - get initial version T1
    console.log('\n--- Step 1: Initialize Version T1 ---');
    const t1 = await getMentorAvailabilityVersion(mentorId);
    assert(typeof t1 === 'number' && t1 > 1000000000000, `Initial version T1 is a valid timestamp (${t1})`);

    const slotsV1 = [{ startTime: '09:00', endTime: '10:00', isBooked: false, versionTag: 'V1' }];
    await setCachedAvailableSlots(mentorId, dateStr, tz, slotsV1);

    const readV1 = await getCachedAvailableSlots(mentorId, dateStr, tz);
    assert(readV1 !== null && readV1[0]?.versionTag === 'V1', 'Cached slots for version T1 retrieved successfully');

    // Step 2: Invalidation - bump to version T2
    console.log('\n--- Step 2: Monotonic Increment to Version T2 ---');
    // Ensure at least 5ms delay so Date.now() increments
    await new Promise((r) => setTimeout(r, 10));
    const t2 = await incrementMentorAvailabilityVersion(mentorId);
    assert(t2 > t1, `Incremented version T2 (${t2}) is strictly greater than T1 (${t1})`);

    const slotsV2 = [{ startTime: '09:00', endTime: '10:00', isBooked: true, versionTag: 'V2' }];
    await setCachedAvailableSlots(mentorId, dateStr, tz, slotsV2);

    const readV2 = await getCachedAvailableSlots(mentorId, dateStr, tz);
    assert(readV2 !== null && readV2[0]?.versionTag === 'V2', 'Cached slots for version T2 retrieved successfully');

    // Step 3: Simulate Redis Key Eviction of the Version Key
    console.log('\n--- Step 3: Simulate Redis Memory Eviction of Version Key ---');
    const delResult = await client.del(verKey);
    assert(delResult === 1, 'Simulated Redis eviction: mentor_ver key deleted from Redis');

    // Verify key is truly absent in Redis
    const existsInRedis = await client.exists(verKey);
    assert(existsInRedis === 0, 'Version key is verified absent from Redis');

    // Ensure timestamp advances by at least 10ms
    await new Promise((r) => setTimeout(r, 15));

    // Step 4: Critical Invariant Check - Read after Eviction
    console.log('\n--- Step 4: Verification After Eviction (Old Cache Must Be Unreachable) ---');
    // In legacy code, missing key defaulted to 1, causing a collision with old cache.
    // In eviction-safe code, missing key generates a fresh monotonic timestamp T3 > T2 > T1.
    const readAfterEviction = await getCachedAvailableSlots(mentorId, dateStr, tz);
    assert(
      readAfterEviction === null,
      'Cached slots returned NULL (cache miss) after version key eviction — old slots are completely unreachable!'
    );

    const t3 = await getMentorAvailabilityVersion(mentorId);
    assert(t3 > t2, `New post-eviction version T3 (${t3}) is strictly greater than pre-eviction T2 (${t2})`);

    // Verify direct check: old cache keys for V1 and V2 still physically sit in Redis (before their TTL),
    // but the application key resolution CANNOT reach them.
    const keyV1 = buildSlotsCacheKey(mentorId, dateStr, tz, t1);
    const keyV2 = buildSlotsCacheKey(mentorId, dateStr, tz, t2);
    const keyV3 = buildSlotsCacheKey(mentorId, dateStr, tz, t3);

    assert(keyV3 !== keyV1 && keyV3 !== keyV2, 'Post-eviction key path is completely isolated from historical keys');

    // Step 5: Second Eviction Test (Repetitive eviction safety)
    console.log('\n--- Step 5: Secondary Eviction & Re-seeding ---');
    const slotsV3 = [{ startTime: '11:00', endTime: '12:00', isBooked: false, versionTag: 'V3' }];
    await setCachedAvailableSlots(mentorId, dateStr, tz, slotsV3);

    const readV3 = await getCachedAvailableSlots(mentorId, dateStr, tz);
    assert(readV3 !== null && readV3[0]?.versionTag === 'V3', 'Cached slots for version T3 retrieved');

    // Evict again
    await client.del(verKey);
    await new Promise((r) => setTimeout(r, 15));

    const readAfterSecondEviction = await getCachedAvailableSlots(mentorId, dateStr, tz);
    assert(
      readAfterSecondEviction === null,
      'Second eviction also resulted in safe cache miss (never returns stale V1, V2, or V3 data)'
    );

    const t4 = await getMentorAvailabilityVersion(mentorId);
    assert(t4 > t3, `Monotonic progression preserved across multiple evictions: T4 (${t4}) > T3 (${t3})`);
    console.log('✅ Eviction-safe monotonic per-mentor versioning verified 100%');

  } finally {
    // Cleanup
    await client.del(verKey);
    await closeRedisConnection();
    console.log('Redis connections closed');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL MENTOR VERSION EVICTION TESTS PASSED (100% SUCCESS)');
  console.log('====================================================\n');
  process.exit(0);
}

runMentorVersionEvictionTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
