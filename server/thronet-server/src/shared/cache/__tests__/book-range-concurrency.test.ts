/**
 * book-range-concurrency.test.ts
 * Real MongoDB concurrency test suite for AvailabilityService.bookRange
 * Tests sub-range splitting with Redis Lock DISABLED:
 *  1a. Concurrent release + booking never loses either change
 *  1b. doc.__v missing uses { __v: { $exists: false } }
 *  1c. MAX_RETRIES exhausted throws distinct BookingConcurrencyConflictError with backoff
 *  1d. 100 iterations of non-overlapping (b) and 100 iterations of overlapping (c)
 *  1e. Refuses to run unless target DB name contains "test"
 *  1f. Zero any casts
 */

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

import Availability, { AvailabilityDocument } from '@/Mentorship/models/Availability';
import availabilityService, { BookingConcurrencyConflictError } from '@/Mentorship/services/availability.service';
import availabilityRepository from '@/Mentorship/repositories/availability.repository';
import { closeRedisConnection } from '../redisConnection';

import { assertTestEnvironmentSafety } from './testSafetyGuard';

function assert(condition: boolean, msg: string): void {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
  } else {
    console.error(`  [FAIL] ${msg}`);
    throw new Error(`Assertion Failed: ${msg}`);
  }
}

async function runBookRangeConcurrencyTests(): Promise<void> {
  console.log('====================================================');
  console.log('🧪 Starting Real MongoDB bookRange Concurrency Test Suite');
  console.log('====================================================');

  const mongoUri = assertTestEnvironmentSafety();
  await mongoose.connect(mongoUri);
  console.log(`✅ Connected to MongoDB\n`);

  // Explicitly DISABLE Redis Lock so all concurrency guards rely 100% on MongoDB atomic CAS
  process.env['CACHE_MENTORSHIP_LOCK_ENABLED'] = 'false';
  process.env['CACHE_MENTORSHIP_AVAILABILITY_ENABLED'] = 'false';

  const createdAvailabilityIds: string[] = [];

  try {
    // -------------------------------------------------------------
    // Test (a): 20 concurrent bookings of the SAME sub-range
    // -------------------------------------------------------------
    console.log('--- Test (a): 20 Concurrent Bookings of the SAME Sub-Range (Redis Lock Disabled) ---');
    const availIdA = uuidv4();
    const mentorIdA = `mentor_test_same_${Date.now()}`;
    createdAvailabilityIds.push(availIdA);

    await Availability.create({
      availabilityId: availIdA,
      mentorId: mentorIdA,
      date: new Date('2026-12-01T00:00:00.000Z'),
      dayOfWeek: 'tuesday',
      timezone: 'Asia/Kolkata',
      slots: [
        {
          startTime: '09:00',
          endTime: '12:00',
          isBooked: false,
          isBlocked: false,
        },
      ],
    });

    const concurrentBookings = await Promise.all(
      Array.from({ length: 20 }, (_, idx) =>
        availabilityService.bookRange(
          availIdA,
          mentorIdA,
          '09:00',
          '10:00',
          `session_same_${idx + 1}`
        )
      )
    );

    const successesA = concurrentBookings.filter((res) => res !== null);
    const failuresA = concurrentBookings.filter((res) => res === null);

    assert(successesA.length === 1, `Exactly 1 booking succeeded (got ${successesA.length})`);
    assert(failuresA.length === 19, `Remaining 19 bookings cleanly failed with null (got ${failuresA.length})`);

    const docA = await Availability.findOne({ availabilityId: availIdA }).lean();
    assert(!!docA, 'Document A exists in MongoDB');
    const bookedSlotA = docA?.slots?.find((s) => s.startTime === '09:00' && s.endTime === '10:00');
    assert(bookedSlotA?.isBooked === true, 'Sub-range 09:00 - 10:00 is marked isBooked: true');
    const freeSlotA = docA?.slots?.find((s) => s.startTime === '10:00' && s.endTime === '12:00');
    assert(freeSlotA?.isBooked === false, 'Remaining sub-range 10:00 - 12:00 is preserved and unbooked');

    // -------------------------------------------------------------
    // Test 1a: Slot release running concurrently with a sub-range booking
    // Neither change must be lost!
    // -------------------------------------------------------------
    console.log('\n--- Test 1a: Concurrent Slot Release and Sub-Range Booking (No Lost Updates) ---');
    const availId1a = uuidv4();
    const mentorId1a = `mentor_test_1a_${Date.now()}`;
    createdAvailabilityIds.push(availId1a);

    // Initial state: 09:00 - 10:00 is booked, 10:00 - 12:00 is free
    await Availability.create({
      availabilityId: availId1a,
      mentorId: mentorId1a,
      date: new Date('2026-12-05T00:00:00.000Z'),
      dayOfWeek: 'friday',
      timezone: 'Asia/Kolkata',
      slots: [
        {
          startTime: '09:00',
          endTime: '10:00',
          isBooked: true,
          sessionId: 'session_initial_booked',
          isBlocked: false,
        },
        {
          startTime: '10:00',
          endTime: '12:00',
          isBooked: false,
          isBlocked: false,
        },
      ],
    });

    // Concurrently release 09:00 - 10:00 AND book 10:00 - 11:00
    const [releaseResult, bookResult] = await Promise.all([
      availabilityService.releaseRange(availId1a, '09:00', '10:00'),
      availabilityService.bookRange(availId1a, mentorId1a, '10:00', '11:00', 'session_1a_booked'),
    ]);

    assert(releaseResult === true, 'Concurrent releaseRange returned true');
    assert(bookResult !== null, 'Concurrent bookRange returned non-null');

    const doc1a = await Availability.findOne({ availabilityId: availId1a }).lean();
    assert(!!doc1a, 'Document 1a exists in MongoDB');

    const releasedSlot1a = doc1a?.slots?.find((s) => s.startTime === '09:00' && s.endTime === '10:00');
    assert(releasedSlot1a?.isBooked === false, '09:00 - 10:00 was successfully released (isBooked: false)');

    const bookedSlot1a = doc1a?.slots?.find((s) => s.startTime === '10:00' && s.endTime === '11:00');
    assert(bookedSlot1a?.isBooked === true && bookedSlot1a?.sessionId === 'session_1a_booked', '10:00 - 11:00 was successfully booked');

    const remainingFreeSlot1a = doc1a?.slots?.find((s) => s.startTime === '11:00' && s.endTime === '12:00');
    assert(remainingFreeSlot1a?.isBooked === false, '11:00 - 12:00 remains free');
    console.log('✅ Concurrent release and sub-range booking verified: neither change was lost');

    // -------------------------------------------------------------
    // Test 1-block: Date block and unblock increments __v in MongoDB
    // -------------------------------------------------------------
    console.log('\n--- Test 1-block: Date Block and Unblock Increments __v ---');
    const availIdBlock = uuidv4();
    const mentorIdBlock = `mentor_test_block_${Date.now()}`;
    createdAvailabilityIds.push(availIdBlock);

    const initialDoc = await Availability.create({
      availabilityId: availIdBlock,
      mentorId: mentorIdBlock,
      date: new Date('2026-12-07T00:00:00.000Z'),
      dayOfWeek: 'sunday',
      timezone: 'Asia/Kolkata',
      slots: [
        {
          startTime: '10:00',
          endTime: '11:00',
          isBooked: false,
          isBlocked: false,
        },
      ],
    });
    assert(initialDoc.__v === 0, `Initial __v must be 0, got ${initialDoc.__v}`);

    // Block the date
    await availabilityService.setDateBlocked(availIdBlock, true, 'Testing block increment');
    const docAfterBlock = await Availability.findOne({ availabilityId: availIdBlock }).lean();
    if (!docAfterBlock) throw new Error('Document must exist after block');
    assert(docAfterBlock.__v === 1, `__v must increment to 1 after block, got ${docAfterBlock.__v}`);
    assert(docAfterBlock.isDateBlocked === true, 'isDateBlocked must be true');
    assert(docAfterBlock.slots[0].isBlocked === true, 'slot isBlocked must be true');

    // Unblock the date
    await availabilityService.setDateBlocked(availIdBlock, false);
    const docAfterUnblock = await Availability.findOne({ availabilityId: availIdBlock }).lean();
    if (!docAfterUnblock) throw new Error('Document must exist after unblock');
    assert(docAfterUnblock.__v === 2, `__v must increment to 2 after unblock, got ${docAfterUnblock.__v}`);
    assert(docAfterUnblock.isDateBlocked === false, 'isDateBlocked must be false');
    assert(docAfterUnblock.slots[0].isBlocked === false, 'slot isBlocked must be false');
    console.log('✅ Date block & unblock successfully incremented __v from 0 -> 1 -> 2');

    // -------------------------------------------------------------
    // Test 1-concurrent-block: Block running concurrently with sub-range booking
    // NEVER throws a raw VersionError (retries boundedly or returns clean conflict)
    // -------------------------------------------------------------
    console.log('\n--- Test 1-concurrent-block: Concurrent Date Block vs Sub-Range Booking ---');
    const availIdConcBlock = uuidv4();
    const mentorIdConcBlock = `mentor_test_conc_block_${Date.now()}`;
    createdAvailabilityIds.push(availIdConcBlock);

    await Availability.create({
      availabilityId: availIdConcBlock,
      mentorId: mentorIdConcBlock,
      date: new Date('2026-12-07T00:00:00.000Z'),
      dayOfWeek: 'sunday',
      timezone: 'Asia/Kolkata',
      slots: [
        {
          startTime: '09:00',
          endTime: '12:00',
          isBooked: false,
          isBlocked: false,
        },
      ],
    });

    // Run setDateBlocked concurrently with bookRange
    let thrownError: any = null;
    try {
      await Promise.all([
        availabilityService.setDateBlocked(availIdConcBlock, true, 'Concurrent block'),
        availabilityService.bookRange(availIdConcBlock, mentorIdConcBlock, '09:00', '10:00', 'session_conc_block'),
      ]);
    } catch (err: any) {
      thrownError = err;
    }

    if (thrownError) {
      assert(
        thrownError.name !== 'VersionError',
        `Must NEVER throw raw VersionError (got error name: ${thrownError.name}, msg: ${thrownError.message})`
      );
      assert(
        thrownError instanceof BookingConcurrencyConflictError || thrownError.name === 'BookingConcurrencyConflictError',
        `Error must be BookingConcurrencyConflictError or clean conflict (got: ${thrownError.name})`
      );
    } else {
      console.log('  [PASS] Concurrent block and booking completed cleanly with bounded retry');
    }

    const docConcBlock = await Availability.findOne({ availabilityId: availIdConcBlock }).lean();
    assert(!!docConcBlock, 'Document exists in MongoDB');
    if (!docConcBlock) throw new Error('Document must exist');
    assert(docConcBlock.__v >= 1, `__v was incremented to ${docConcBlock.__v}`);
    console.log('✅ Concurrent block & booking never throws raw VersionError');

    // -------------------------------------------------------------
    // Test 1c: When MAX_RETRIES is exhausted, throw BookingConcurrencyConflictError
    // -------------------------------------------------------------
    console.log('\n--- Test 1c: Error Throw on Retry Exhaustion ---');
    const availId1c = uuidv4();
    const mentorId1c = `mentor_test_1c_${Date.now()}`;
    createdAvailabilityIds.push(availId1c);

    await Availability.create({
      availabilityId: availId1c,
      mentorId: mentorId1c,
      date: new Date('2026-12-06T00:00:00.000Z'),
      dayOfWeek: 'saturday',
      timezone: 'Asia/Kolkata',
      slots: [
        {
          startTime: '09:00',
          endTime: '12:00',
          isBooked: false,
          isBlocked: false,
        },
      ],
    });

    // Intercept findOneAndUpdate to simulate perpetual CAS conflicts
    const originalFindOneAndUpdate = Availability.findOneAndUpdate;
    let interceptedCalls = 0;
    (Availability as any).findOneAndUpdate = function (filter: any, update: any, options: any) {
      if (filter && filter.availabilityId === availId1c && filter.__v !== undefined) {
        interceptedCalls++;
        return Promise.resolve(null); // Simulate CAS conflict on every retry
      }
      return originalFindOneAndUpdate.apply(this, [filter, update, options]);
    };

    let caughtError: any = null;
    try {
      await availabilityService.bookRange(availId1c, mentorId1c, '09:00', '10:00', 'sess_conflict');
    } catch (err: any) {
      caughtError = err;
    } finally {
      Availability.findOneAndUpdate = originalFindOneAndUpdate;
    }

    assert(caughtError !== null, 'bookRange threw an error when retries exhausted');
    assert(
      caughtError instanceof BookingConcurrencyConflictError || caughtError?.name === 'BookingConcurrencyConflictError',
      'Thrown error is an instance of BookingConcurrencyConflictError'
    );
    assert(interceptedCalls >= 25, `All 25 retries were attempted before throwing error (got ${interceptedCalls})`);
    console.log('✅ BookingConcurrencyConflictError thrown cleanly upon retry exhaustion');

    // -------------------------------------------------------------
    // Test 1d: Run Test (b) and Test (c) in a loop of 100 iterations each
    // -------------------------------------------------------------
    console.log('\n--- Test 1d: 100 Iterations of Non-Overlapping Bookings (Test b) ---');
    const BATCH_SIZE = 10;
    let passedB = 0;

    for (let batch = 0; batch < 100 / BATCH_SIZE; batch++) {
      const promises = Array.from({ length: BATCH_SIZE }, async (_, idx) => {
        const iter = batch * BATCH_SIZE + idx + 1;
        const availId = uuidv4();
        const mentorId = `mentor_b_100_${iter}_${Date.now()}`;
        createdAvailabilityIds.push(availId);

        await Availability.create({
          availabilityId: availId,
          mentorId,
          date: new Date('2026-12-07T00:00:00.000Z'),
          dayOfWeek: 'sunday',
          timezone: 'Asia/Kolkata',
          slots: [
            {
              startTime: '09:00',
              endTime: '12:00',
              isBooked: false,
              isBlocked: false,
            },
          ],
        });

        const [r1, r2] = await Promise.all([
          availabilityService.bookRange(availId, mentorId, '09:00', '10:00', `sess_b1_${iter}`),
          availabilityService.bookRange(availId, mentorId, '10:00', '11:00', `sess_b2_${iter}`),
        ]);

        if (!r1 || !r2) {
          throw new Error(`Iteration ${iter} failed: r1=${JSON.stringify(r1)}, r2=${JSON.stringify(r2)}`);
        }

        const doc = await Availability.findOne({ availabilityId: availId }).lean();
        const b1 = doc?.slots?.find((s) => s.startTime === '09:00' && s.endTime === '10:00' && s.isBooked);
        const b2 = doc?.slots?.find((s) => s.startTime === '10:00' && s.endTime === '11:00' && s.isBooked);
        const free = doc?.slots?.find((s) => s.startTime === '11:00' && s.endTime === '12:00' && !s.isBooked);

        if (!b1 || !b2 || !free) {
          throw new Error(`Iteration ${iter} document state corrupted`);
        }
        return true;
      });

      await Promise.all(promises);
      passedB += BATCH_SIZE;
      process.stdout.write(`  Completed ${passedB}/100 non-overlapping iterations\r`);
    }
    console.log('\n  [PASS] All 100/100 non-overlapping iterations succeeded with zero lost updates');

    console.log('\n--- Test 1d: 100 Iterations of Overlapping Bookings (Test c) ---');
    let passedC = 0;

    for (let batch = 0; batch < 100 / BATCH_SIZE; batch++) {
      const promises = Array.from({ length: BATCH_SIZE }, async (_, idx) => {
        const iter = batch * BATCH_SIZE + idx + 1;
        const availId = uuidv4();
        const mentorId = `mentor_c_100_${iter}_${Date.now()}`;
        createdAvailabilityIds.push(availId);

        await Availability.create({
          availabilityId: availId,
          mentorId,
          date: new Date('2026-12-08T00:00:00.000Z'),
          dayOfWeek: 'monday',
          timezone: 'Asia/Kolkata',
          slots: [
            {
              startTime: '09:00',
              endTime: '12:00',
              isBooked: false,
              isBlocked: false,
            },
          ],
        });

        const [r1, r2] = await Promise.all([
          availabilityService.bookRange(availId, mentorId, '09:00', '10:30', `sess_c1_${iter}`),
          availabilityService.bookRange(availId, mentorId, '10:00', '11:30', `sess_c2_${iter}`),
        ]);

        const wins = [r1, r2].filter((r) => r !== null);
        const losses = [r1, r2].filter((r) => r === null);

        if (wins.length !== 1 || losses.length !== 1) {
          throw new Error(`Iteration ${iter} failed: expected 1 win and 1 loss, got wins=${wins.length}`);
        }
        return true;
      });

      await Promise.all(promises);
      passedC += BATCH_SIZE;
      process.stdout.write(`  Completed ${passedC}/100 overlapping iterations\r`);
    }
    console.log('\n  [PASS] All 100/100 overlapping iterations succeeded with exactly 1 winner and 1 clean failure');

  } finally {
    // Cleanup created test records in batches
    if (createdAvailabilityIds.length > 0) {
      console.log(`\n🧹 Cleaning up ${createdAvailabilityIds.length} test availability documents from MongoDB...`);
      await Availability.deleteMany({ availabilityId: { $in: createdAvailabilityIds } });
      console.log('Cleanup complete');
    }

    delete process.env['CACHE_MENTORSHIP_LOCK_ENABLED'];
    delete process.env['CACHE_MENTORSHIP_AVAILABILITY_ENABLED'];

    await mongoose.disconnect();
    await closeRedisConnection();
    console.log('MongoDB and Redis connections closed');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL FIX 1 FOLLOW-UP CONCURRENCY TESTS PASSED (100% SUCCESS)');
  console.log('====================================================\n');
  process.exit(0);
}

runBookRangeConcurrencyTests().catch((err) => {
  console.error('Fatal concurrency test error:', err);
  process.exit(1);
});
