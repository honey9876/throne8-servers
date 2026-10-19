import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { SessionType } from '@/shared/constants/sessionTypes';
import { BookingStatus } from '@/shared/constants/bookingStatus';
import { PaymentStatus, PaymentMethod } from '@/Mentorship/interface/session.types';
import { Availability, SessionMentor } from '@/Mentorship/models';
import SeniorAvailability from '@/Mentorship/models/SeniorAvailability';
import SeniorSession from '@/Mentorship/models/SeniorSession';
import AvailabilitySyncJob from '@/jobs/availabilitySync';
import HeadlineService from '@/Profile/services/headline.service';
import { Headline } from '@/shared/models/index.models';
import CacheUtil from '@/shared/cache.util';
import {
  getCachedMentorAvailability,
  setCachedMentorAvailability,
  getMentorAvailabilityVersion,
} from '@/shared/cache/mentorshipCache';
import availabilityService from '@/Mentorship/services/availability.service';
import { getRedisClient, closeRedisConnection } from '@/shared/cache/redisConnection';
import { assertTestEnvironmentSafety } from './testSafetyGuard';

async function runWriteGapTests() {
  console.log('====================================================');
  console.log('🧪 Starting Write Gap Invalidation Test Suite (Item 5)');
  console.log('====================================================');

  const targetMongoUri = assertTestEnvironmentSafety();
  await mongoose.connect(targetMongoUri);
  console.log(`✅ Connected to MongoDB`);

  // Ensure Redis client is initialized
  const redis = getRedisClient();
  console.log('✅ Connected to Redis');

  // --- Check 1: Model & Collection Separation Evidence ---
  console.log('\n--- Evidence 1: Senior vs Standard Collection Isolation ---');
  const availColl = Availability.collection.collectionName;
  const seniorAvailColl = SeniorAvailability.collection.collectionName;
  const sessionMentorColl = SessionMentor.collection.collectionName;
  const seniorSessionColl = SeniorSession.collection.collectionName;

  console.log(`  Availability collection:       ${availColl}`);
  console.log(`  SeniorAvailability collection: ${seniorAvailColl}`);
  console.log(`  SessionMentor collection:      ${sessionMentorColl}`);
  console.log(`  SeniorSession collection:      ${seniorSessionColl}`);

  assert.notStrictEqual(availColl, seniorAvailColl, 'Availability and SeniorAvailability must be separate collections');
  assert.notStrictEqual(sessionMentorColl, seniorSessionColl, 'SessionMentor and SeniorSession must be separate collections');
  console.log('  [PASS] SeniorAvailability & SeniorSession write to isolated, independent MongoDB collections.');

  // --- Check 2: AvailabilitySyncJob Cache Invalidation ---
  console.log('\n--- Test 2: AvailabilitySyncJob Invalidates Mentor Cache ---');
  const testMentorId = `test_mentor_sync_${Date.now()}`;
  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[now.getDay()];

  // Seed Availability document
  const testAvailDoc = await Availability.create({
    mentorId: testMentorId,
    availabilityId: uuidv4(),
    timezone: 'UTC',
    date: new Date(now.toISOString().split('T')[0]),
    dayOfWeek: dayName,
    slots: [
      { startTime: '10:00', endTime: '11:00', isBooked: false },
    ],
  });

  // Seed cache with initial slots
  const v1 = await getMentorAvailabilityVersion(testMentorId);
  const filter1 = { date: now.toISOString().split('T')[0] };
  await setCachedMentorAvailability(testMentorId, filter1, [{ startTime: '10:00', endTime: '11:00' }]);
  const cachedBefore = await getCachedMentorAvailability(testMentorId, filter1);
  assert.notStrictEqual(cachedBefore, null, 'Cache should be populated before sync');
  console.log('  [PASS] Seeded initial mentor availability in Redis cache');

  // Seed a session that triggers sync
  await SessionMentor.create({
    mentorId: testMentorId,
    menteeId: `mentee_${Date.now()}`,
    sessionId: uuidv4(),
    title: 'Sync Test Session',
    scheduledAt: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour ahead
    duration: 60,
    timezone: 'UTC',
    status: BookingStatus.CONFIRMED,
    sessionType: SessionType.DEEP_DIVE,
    pricing: {
      basePrice: 100,
      platformFee: 10,
      totalAmount: 110,
      currency: 'INR',
    },
    payment: {
      status: PaymentStatus.COMPLETED,
      method: PaymentMethod.RAZORPAY,
    },
  });

  // Trigger syncMentor
  await AvailabilitySyncJob.syncMentor(testMentorId);

  // Assert version was bumped and cached slots are now invalid/evicted
  const v2 = await getMentorAvailabilityVersion(testMentorId);
  assert.strictEqual(v2 > v1, true, `Version must increment after sync (v1=${v1}, v2=${v2})`);
  const cachedAfter = await getCachedMentorAvailability(testMentorId, filter1);
  assert.strictEqual(cachedAfter, null, 'Cache miss expected after AvailabilitySyncJob invalidation');
  console.log('  [PASS] AvailabilitySyncJob successfully bumped mentor version and invalidated cache');

  // --- Check 3: HeadlineService.expireOldHeadlines Cache Invalidation ---
  console.log('\n--- Test 3: HeadlineService.expireOldHeadlines Invalidates Cache ---');
  const testHeadlineKey = 'headlines:user:testuser:all';
  await CacheUtil.set(testHeadlineKey, JSON.stringify([{ id: 'h1' }]), 60);
  const headlineCachedBefore = await CacheUtil.get(testHeadlineKey);
  assert.notStrictEqual(headlineCachedBefore, null, 'Headline cache should be populated before test');

  // Insert an expired headline to ensure count > 0 (using raw collection to simulate active record reaching expiration)
  const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await Headline.collection.insertOne({
    headlineId: uuidv4(),
    title: 'Expired Headline Title',
    message: 'This is an expired test headline message content',
    type: 'announcement',
    priority: 'MEDIUM',
    status: 'ACTIVE',
    audience: {
      type: 'ALL',
      userIds: ['testuser'],
    },
    scheduling: {
      expiresAt: pastDate,
    },
    metadata: {
      createdBy: 'testuser',
      createdByName: 'Test User',
      version: 1,
    },
    flags: {
      isDeleted: false,
    },
    createdAt: pastDate,
    updatedAt: pastDate,
  });

  const expiredCount = await HeadlineService.expireOldHeadlines();
  assert.strictEqual(expiredCount >= 1, true, `Expected >= 1 expired headline, got ${expiredCount}`);

  const headlineCachedAfter = await CacheUtil.get(testHeadlineKey);
  assert.strictEqual(headlineCachedAfter, null, 'Headline cache must be invalidated after expireOldHeadlines()');
  console.log('  [PASS] HeadlineService.expireOldHeadlines purged cache on expired records');

  // --- Check 4: releaseRange Cache Invalidation (Cancel/Reschedule/Refund Write Path) ---
  console.log('\n--- Test 4: releaseRange (Cancel/Reschedule) Invalidates Mentor Cache ---');
  const releaseMentorId = `test_mentor_rel_${Date.now()}`;
  const relAvailId = uuidv4();
  await Availability.create({
    mentorId: releaseMentorId,
    availabilityId: relAvailId,
    timezone: 'UTC',
    date: new Date('2026-11-01T00:00:00.000Z'),
    dayOfWeek: 'sunday',
    slots: [
      { startTime: '14:00', endTime: '15:00', isBooked: true },
    ],
  });

  const relV1 = await getMentorAvailabilityVersion(releaseMentorId);
  const filter2 = { date: '2026-11-01' };
  await setCachedMentorAvailability(releaseMentorId, filter2, [{ startTime: '14:00', endTime: '15:00' }]);

  const released = await availabilityService.releaseRange(relAvailId, '14:00', '15:00');
  assert.strictEqual(released, true, 'releaseRange must return true');

  const relV2 = await getMentorAvailabilityVersion(releaseMentorId);
  assert.strictEqual(relV2 > relV1, true, `Version must increment after releaseRange (relV1=${relV1}, relV2=${relV2})`);
  const relCachedAfter = await getCachedMentorAvailability(releaseMentorId, filter2);
  assert.strictEqual(relCachedAfter, null, 'Cache miss expected after releaseRange invalidation');
  console.log('  [PASS] releaseRange bumped version and invalidated cache');

  // --- Cleanup ---
  console.log('\n🧹 Cleaning up test data...');
  await Availability.deleteMany({ mentorId: { $in: [testMentorId, releaseMentorId] } });
  await SessionMentor.deleteMany({ mentorId: testMentorId });
  await Headline.deleteMany({ userId: 'testuser' });
  console.log('Cleanup complete');

  await mongoose.disconnect();
  await closeRedisConnection();
  console.log('\n====================================================');
  console.log('🎉 ALL WRITE GAP INVALIDATION TESTS PASSED (100% SUCCESS)');
  console.log('====================================================\n');
  process.exit(0);
}

runWriteGapTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
