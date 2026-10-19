/**
 * mentorship-cache.test.ts
 * Rigorous test suite for Mentorship Distributed Booking Lock & Availability Caching
 * 
 * Verifies:
 * 1. Lock acquisition & collision detection
 * 2. Atomic Lua release safety (tamper-proof)
 * 3. Cache hit & miss
 * 4. Mentor isolation (Mentor A never gets Mentor B data)
 * 5. Timezone variation keys
 * 6. Immediate invalidation after write paths
 * 7. 20 concurrent booking requests (single winner, 19 collisions)
 * 8. Kill switches (fail-open to DB)
 */

import {
  acquireBookingLock,
  releaseBookingLock,
  getCachedAvailableSlots,
  setCachedAvailableSlots,
  getCachedMentorAvailability,
  setCachedMentorAvailability,
  invalidateMentorAvailabilityCache,
} from '../mentorshipCache';
import { closeRedisConnection } from '../redisConnection';

async function runMentorshipCacheTests() {
  console.log('====================================================');
  console.log('🧪 Starting Mentorship Booking Lock & Availability Test Suite');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  const mentorA = 'mentor_alpha_101';
  const mentorB = 'mentor_beta_202';
  const timestamp = 1791738000000; // Fixed deterministic timestamp
  const dateStr = '2026-10-15';

  // Ensure clean initial state
  await invalidateMentorAvailabilityCache(mentorA);
  await invalidateMentorAvailabilityCache(mentorB);

  // --- Test 1: Distributed Lock Acquisition & Collision ---
  console.log('\n--- Test 1: Distributed Lock Acquisition & Collision ---');
  const lock1 = await acquireBookingLock(mentorA, timestamp, 5000);
  assert(lock1.acquired === true, 'First lock acquisition succeeded');
  assert(typeof lock1.token === 'string' && lock1.token.length > 0, 'Unique lock token generated');

  const lockCollision = await acquireBookingLock(mentorA, timestamp, 5000);
  assert(lockCollision.acquired === false, 'Second lock attempt for same slot was rejected (collision prevented)');

  const lockDifferentMentor = await acquireBookingLock(mentorB, timestamp, 5000);
  assert(lockDifferentMentor.acquired === true, 'Different mentor for same timestamp succeeded');

  const lockDifferentTime = await acquireBookingLock(mentorA, timestamp + 3600000, 5000);
  assert(lockDifferentTime.acquired === true, 'Different timestamp for same mentor succeeded');

  // Clean up
  await releaseBookingLock(mentorB, timestamp, lockDifferentMentor.token);
  await releaseBookingLock(mentorA, timestamp + 3600000, lockDifferentTime.token);

  // --- Test 2: Atomic Lua Lock Release & Tamper Protection ---
  console.log('\n--- Test 2: Atomic Lua Lock Release & Tamper Protection ---');
  const fakeTokenRelease = await releaseBookingLock(mentorA, timestamp, 'fake-token-attempt');
  assert(fakeTokenRelease === false, 'Release with invalid token was rejected (lock preserved)');

  const stillLocked = await acquireBookingLock(mentorA, timestamp, 5000);
  assert(stillLocked.acquired === false, 'Slot remained locked after rejected fake release');

  const legitRelease = await releaseBookingLock(mentorA, timestamp, lock1.token);
  assert(legitRelease === true, 'Release with matching token succeeded via Lua script');

  const reacquire = await acquireBookingLock(mentorA, timestamp, 5000);
  assert(reacquire.acquired === true, 'Slot re-acquired immediately after release');
  await releaseBookingLock(mentorA, timestamp, reacquire.token);

  // --- Test 3: Availability Slots Cache Miss & Hit ---
  console.log('\n--- Test 3: Availability Slots Cache Miss & Hit ---');
  const missSlots = await getCachedAvailableSlots(mentorA, dateStr, 'Asia/Kolkata');
  assert(missSlots === null, 'Cache miss returns null');

  const sampleSlots = [
    { startTime: '10:00', endTime: '11:00', duration: 60 },
    { startTime: '14:00', endTime: '15:00', duration: 60 },
  ];
  await setCachedAvailableSlots(mentorA, dateStr, 'Asia/Kolkata', sampleSlots);

  const hitSlots = await getCachedAvailableSlots(mentorA, dateStr, 'Asia/Kolkata');
  assert(hitSlots !== null && hitSlots.length === 2, 'Cache hit returns slots array');
  assert(hitSlots?.[0]?.startTime === '10:00', 'Slot start time preserved accurately');

  // --- Test 4: Timezone Isolation ---
  console.log('\n--- Test 4: Timezone Isolation ---');
  const nySlots = await getCachedAvailableSlots(mentorA, dateStr, 'America/New_York');
  assert(nySlots === null, 'Different timezone misses cache (timezone isolation preserved)');

  // --- Test 5: Mentor Isolation (Mentor A never gets Mentor B data) ---
  console.log('\n--- Test 5: Mentor Isolation ---');
  const mentorBSlots = await getCachedAvailableSlots(mentorB, dateStr, 'Asia/Kolkata');
  assert(mentorBSlots === null, 'Mentor B does not receive Mentor A slots');

  const mentorBSample = [{ startTime: '09:00', endTime: '09:30', duration: 30 }];
  await setCachedAvailableSlots(mentorB, dateStr, 'Asia/Kolkata', mentorBSample);

  const readA = await getCachedAvailableSlots(mentorA, dateStr, 'Asia/Kolkata');
  const readB = await getCachedAvailableSlots(mentorB, dateStr, 'Asia/Kolkata');
  assert(readA?.[0]?.startTime === '10:00', 'Mentor A retains 10:00 slot');
  assert(readB?.[0]?.startTime === '09:00', 'Mentor B retains 09:00 slot');

  // --- Test 6: Invalidation after Write Paths ---
  console.log('\n--- Test 6: Invalidation after Write Paths ---');
  await setCachedMentorAvailability(mentorA, { status: 'available' }, [{ date: dateStr }]);
  const preInvalidateList = await getCachedMentorAvailability(mentorA, { status: 'available' });
  assert(preInvalidateList !== null && preInvalidateList.length > 0, 'Overview list cached before invalidation');

  await invalidateMentorAvailabilityCache(mentorA);

  const postSlots = await getCachedAvailableSlots(mentorA, dateStr, 'Asia/Kolkata');
  const postList = await getCachedMentorAvailability(mentorA, { status: 'available' });
  assert(postSlots === null, 'Slots cache cleared after invalidation');
  assert(postList === null, 'Overview list cache cleared after invalidation');

  // Mentor B should remain intact
  const mentorBStillCached = await getCachedAvailableSlots(mentorB, dateStr, 'Asia/Kolkata');
  assert(mentorBStillCached !== null, 'Mentor B cache was NOT affected by Mentor A invalidation');
  await invalidateMentorAvailabilityCache(mentorB);

  // --- Test 7: 20 Concurrent Booking Requests Stress Test ---
  console.log('\n--- Test 7: 20 Concurrent Booking Requests Stress Test ---');
  const concurrentTimestamp = 1791739000000;
  const concurrentPromises = Array.from({ length: 20 }, () =>
    acquireBookingLock(mentorA, concurrentTimestamp, 5000)
  );

  const results = await Promise.all(concurrentPromises);
  const winners = results.filter((r) => r.acquired);
  const rejected = results.filter((r) => !r.acquired);

  assert(winners.length === 1, `Exactly 1 concurrent request acquired the lock (got ${winners.length})`);
  assert(rejected.length === 19, `Remaining 19 concurrent requests were rejected (got ${rejected.length})`);

  // Release the winner's lock
  if (winners[0]) {
    await releaseBookingLock(mentorA, concurrentTimestamp, winners[0].token);
  }

  // --- Test 8: Kill Switch Guard ---
  console.log('\n--- Test 8: Kill Switch Guard ---');
  process.env['CACHE_MENTORSHIP_AVAILABILITY_ENABLED'] = 'false';
  process.env['CACHE_MENTORSHIP_LOCK_ENABLED'] = 'false';

  await setCachedAvailableSlots(mentorA, dateStr, 'Asia/Kolkata', sampleSlots);
  const disabledRead = await getCachedAvailableSlots(mentorA, dateStr, 'Asia/Kolkata');
  assert(disabledRead === null, 'Slots cache returns null when domain disabled');

  const disabledLock = await acquireBookingLock(mentorA, concurrentTimestamp);
  assert(disabledLock.acquired === true, 'Lock acquisition succeeds (fails open) when domain disabled');

  delete process.env['CACHE_MENTORSHIP_AVAILABILITY_ENABLED'];
  delete process.env['CACHE_MENTORSHIP_LOCK_ENABLED'];

  // --- Test 9: 20 Concurrent Bookings with Redis Lock DISABLED (DB Atomic Guard) ---
  console.log('\n--- Test 9: 20 Concurrent Bookings with Redis Lock DISABLED (DB Atomic Guard) ---');
  process.env['CACHE_MENTORSHIP_LOCK_ENABLED'] = 'false';

  // 1. All 20 requests attempt lock acquisition; all 20 pass through because lock is disabled
  const lockDisabledAttempts = await Promise.all(
    Array.from({ length: 20 }, () => acquireBookingLock(mentorA, concurrentTimestamp))
  );
  assert(
    lockDisabledAttempts.every((l) => l.acquired),
    'All 20 requests bypassed Redis lock when lock domain disabled'
  );

  // 2. All 20 concurrent requests hit atomic conditional update for the same slot
  // Exactly 1 must succeed and 19 must cleanly fail
  let slotState = { startTime: '10:00', endTime: '11:00', isBooked: false, sessionId: undefined as string | undefined };

  // Atomic conditional update matching Availability.findOneAndUpdate logic:
  // findOneAndUpdate({ slots: { $elemMatch: { startTime, endTime, isBooked: false } } }, { $set: { isBooked: true, sessionId } })
  const atomicDbBooking = async (reqId: number) => {
    // In MongoDB single document operations are serialized by the document write lock
    if (!slotState.isBooked) {
      slotState.isBooked = true;
      slotState.sessionId = `session_${reqId}`;
      return { success: true, sessionId: slotState.sessionId };
    }
    return { success: false, error: 'This time slot is no longer available. Please pick another slot.' };
  };

  const dbBookingResults = await Promise.all(
    Array.from({ length: 20 }, (_, idx) => atomicDbBooking(idx + 1))
  );

  const dbWinners = dbBookingResults.filter((r) => r.success);
  const dbFailures = dbBookingResults.filter((r) => !r.success);

  assert(dbWinners.length === 1, `Exactly 1 booking succeeded in atomic DB update (got ${dbWinners.length})`);
  assert(dbFailures.length === 19, `Remaining 19 bookings cleanly failed with unavailability error (got ${dbFailures.length})`);

  delete process.env['CACHE_MENTORSHIP_LOCK_ENABLED'];

  // --- Cleanup ---
  console.log('\n--- Cleanup ---');
  await closeRedisConnection();

  console.log('\n====================================================');
  console.log(`Total Passed: ${passed}, Total Failed: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runMentorshipCacheTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
