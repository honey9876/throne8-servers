/**
 * pre-update-hooks.test.ts
 * Real MongoDB & Redis behavioural test suite for Mongoose mutation hooks:
 * Proves that after each of deleteOne, deleteMany, findOneAndDelete, replaceOne,
 * findOneAndReplace, updateOne, and findOneAndUpdate, the cached auth key is GONE.
 * Also proves that operators like $in in filters correctly bypass the fast path
 * and invalidate all matching records.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { User } from '@/shared/models/index.models';
import Session from '@/auth/models/Session.model';
import {
  setCachedAuthUser,
  getCachedAuthUser,
  setSessionValidCached,
  isSessionValidCached,
} from '../authCache';
import { getRedisClient, closeRedisConnection } from '../redisConnection';
import { assertTestEnvironmentSafety } from './testSafetyGuard';

function assert(condition: boolean, msg: string): void {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
  } else {
    console.error(`  [FAIL] ${msg}`);
    throw new Error(`Assertion Failed: ${msg}`);
  }
}

async function runPreUpdateHookTests(): Promise<void> {
  console.log('====================================================');
  console.log('🧪 Starting Mongoose Mutation Invalidation Behavioural Test Suite');
  console.log('====================================================');

  const mongoUri = assertTestEnvironmentSafety();
  await mongoose.connect(mongoUri);
  console.log(`✅ Connected to MongoDB`);

  const client = getRedisClient();
  await client.ping();
  console.log('✅ Connected to Redis\n');

  const createdUserIds: string[] = [];
  const createdSessionIds: string[] = [];

  const createAndCacheUser = async (label: string): Promise<string> => {
    const userId = `user_${label}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    createdUserIds.push(userId);

    await User.create({
      userId,
      email: `${userId}@example.com`,
      firstName: 'Test',
      passwordHash: 'hashed_pw_12345',
      role: 'user',
      status: 'active',
    });

    await setCachedAuthUser(userId, {
      _id: new mongoose.Types.ObjectId().toHexString(),
      userId,
      email: `${userId}@example.com`,
      role: 'user',
      status: 'active',
    });

    const cached = await getCachedAuthUser(userId);
    assert(cached !== null && cached.userId === userId, `Initial auth cache seeded and verified for ${label}`);
    return userId;
  };

  try {
    // -------------------------------------------------------------
    // Test 1: deleteOne
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Behavioural check on User.deleteOne ---');
    const u1 = await createAndCacheUser('del_one');
    await User.deleteOne({ userId: u1 });
    const cachedAfterDelOne = await getCachedAuthUser(u1);
    assert(cachedAfterDelOne === null, 'After deleteOne, cached auth key is GONE');

    // -------------------------------------------------------------
    // Test 2: deleteMany (with $in operator, bypassing fast path)
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Behavioural check on User.deleteMany with $in filter ---');
    const u2a = await createAndCacheUser('del_many_a');
    const u2b = await createAndCacheUser('del_many_b');
    await User.deleteMany({ userId: { $in: [u2a, u2b] } });
    const cachedAfterDelManyA = await getCachedAuthUser(u2a);
    const cachedAfterDelManyB = await getCachedAuthUser(u2b);
    assert(cachedAfterDelManyA === null, 'After deleteMany, user A cached auth key is GONE');
    assert(cachedAfterDelManyB === null, 'After deleteMany, user B cached auth key is GONE');

    // -------------------------------------------------------------
    // Test 3: findOneAndDelete
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Behavioural check on User.findOneAndDelete ---');
    const u3 = await createAndCacheUser('find_one_del');
    await User.findOneAndDelete({ userId: u3 });
    const cachedAfterFindOneDel = await getCachedAuthUser(u3);
    assert(cachedAfterFindOneDel === null, 'After findOneAndDelete, cached auth key is GONE');

    // -------------------------------------------------------------
    // Test 4: replaceOne
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Behavioural check on User.replaceOne ---');
    const u4 = await createAndCacheUser('replace_one');
    await User.replaceOne(
      { userId: u4 },
      {
        userId: u4,
        email: `${u4}_replaced@example.com`,
        firstName: 'TestReplaced',
        passwordHash: 'hashed_pw_replaced',
        role: 'user',
        status: 'suspended',
      }
    );
    const cachedAfterReplaceOne = await getCachedAuthUser(u4);
    assert(cachedAfterReplaceOne === null, 'After replaceOne, cached auth key is GONE');

    // -------------------------------------------------------------
    // Test 5: findOneAndReplace
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Behavioural check on User.findOneAndReplace ---');
    const u5 = await createAndCacheUser('find_one_replace');
    await User.findOneAndReplace(
      { userId: u5 },
      {
        userId: u5,
        email: `${u5}_fo_replaced@example.com`,
        firstName: 'TestFOReplaced',
        passwordHash: 'hashed_pw_fo_replaced',
        role: 'user',
        status: 'banned',
      }
    );
    const cachedAfterFindOneReplace = await getCachedAuthUser(u5);
    assert(cachedAfterFindOneReplace === null, 'After findOneAndReplace, cached auth key is GONE');

    // -------------------------------------------------------------
    // Test 6: updateOne
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Behavioural check on User.updateOne ---');
    const u6 = await createAndCacheUser('update_one');
    await User.updateOne({ userId: u6 }, { $set: { status: 'banned' } });
    const cachedAfterUpdateOne = await getCachedAuthUser(u6);
    assert(cachedAfterUpdateOne === null, 'After updateOne, cached auth key is GONE');

    // -------------------------------------------------------------
    // Test 7: findOneAndUpdate
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Behavioural check on User.findOneAndUpdate ---');
    const u7 = await createAndCacheUser('find_one_update');
    await User.findOneAndUpdate({ userId: u7 }, { $set: { status: 'banned' } });
    const cachedAfterFindOneUpdate = await getCachedAuthUser(u7);
    assert(cachedAfterFindOneUpdate === null, 'After findOneAndUpdate, cached auth key is GONE');

    // -------------------------------------------------------------
    // Test 8: updateMany with {userId: {$in:[a,b,c]}}
    // -------------------------------------------------------------
    console.log('\n--- Test 8: Behavioural check on User.updateMany with {userId: {$in:[a,b,c]}} ---');
    const u8a = await createAndCacheUser('update_many_a');
    const u8b = await createAndCacheUser('update_many_b');
    const u8c = await createAndCacheUser('update_many_c');
    await User.updateMany(
      { userId: { $in: [u8a, u8b, u8c] } },
      { $set: { status: 'banned' } }
    );
    const cachedAfterUpdateManyA = await getCachedAuthUser(u8a);
    const cachedAfterUpdateManyB = await getCachedAuthUser(u8b);
    const cachedAfterUpdateManyC = await getCachedAuthUser(u8c);
    assert(cachedAfterUpdateManyA === null, 'Pre-hook captured user 8a; cache key is GONE');
    assert(cachedAfterUpdateManyB === null, 'Pre-hook captured user 8b; cache key is GONE');
    // -------------------------------------------------------------
    // Session Tests (Tests 9 to 12)
    // -------------------------------------------------------------
    const createAndCacheSession = async (label: string): Promise<string> => {
      const sessionId = `sess_${label}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      createdSessionIds.push(sessionId);
      await Session.create({
        _id: sessionId,
        userId: `usr_sess_${label}`,
        deviceId: `dev_${label}`,
        ipAddress: '127.0.0.1',
        refreshToken: `refresh_${sessionId}`,
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000),
      });
      await setSessionValidCached(sessionId, true);
      const cached = await isSessionValidCached(sessionId);
      assert(cached === true, `Initial session cache verified for ${label}`);
      return sessionId;
    };

    // Test 9: Session.deleteOne
    console.log('\n--- Test 9: Behavioural check on Session.deleteOne ---');
    const s9 = await createAndCacheSession('del_one');
    await Session.deleteOne({ _id: s9 });
    const cachedAfterS9 = await isSessionValidCached(s9);
    assert(cachedAfterS9 === null, 'After Session.deleteOne, cached session key is GONE');

    // Test 10: Session.deleteMany with {_id: {$in: [...]}}
    console.log('\n--- Test 10: Behavioural check on Session.deleteMany with {_id: {$in: [...]}} ---');
    const s10a = await createAndCacheSession('del_many_a');
    const s10b = await createAndCacheSession('del_many_b');
    await Session.deleteMany({ _id: { $in: [s10a, s10b] } });
    const cachedAfterS10a = await isSessionValidCached(s10a);
    const cachedAfterS10b = await isSessionValidCached(s10b);
    assert(cachedAfterS10a === null, 'After Session.deleteMany, session 10a cached key is GONE');
    assert(cachedAfterS10b === null, 'After Session.deleteMany, session 10b cached key is GONE');

    // Test 11: Session.updateMany with {_id: {$in: [...]}}
    console.log('\n--- Test 11: Behavioural check on Session.updateMany with {_id: {$in: [...]}} ---');
    const s11a = await createAndCacheSession('update_many_a');
    const s11b = await createAndCacheSession('update_many_b');
    await Session.updateMany(
      { _id: { $in: [s11a, s11b] } },
      { $set: { isActive: false } }
    );
    const cachedAfterS11a = await isSessionValidCached(s11a);
    const cachedAfterS11b = await isSessionValidCached(s11b);
    assert(cachedAfterS11a === null, 'After Session.updateMany, session 11a cached key is GONE');
    assert(cachedAfterS11b === null, 'After Session.updateMany, session 11b cached key is GONE');

    // Test 12: Session.updateMany matching > 500 sessions (exercising limit(501) and SCAN fallback)
    console.log('\n--- Test 12: Session.updateMany matching >500 sessions (limit(501) SCAN fallback) ---');
    const bulkUserId = `user_bulk_scan_${Date.now()}`;
    const bulkSessions: any[] = [];
    const bulkCount = 505;

    for (let i = 0; i < bulkCount; i++) {
      const sid = `sess_bulk_${Date.now()}_${i}`;
      createdSessionIds.push(sid);
      bulkSessions.push({
        _id: sid,
        userId: bulkUserId,
        deviceId: `dev_bulk_${i}`,
        ipAddress: '127.0.0.1',
        refreshToken: `refresh_bulk_${Date.now()}_${i}`,
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000),
      });
    }

    await Session.insertMany(bulkSessions, { ordered: false });

    // Cache the 1st session, 501st session, and 505th session in Redis
    const sFirst = bulkSessions[0]._id;
    const s501 = bulkSessions[500]._id;
    const sLast = bulkSessions[504]._id;

    await setSessionValidCached(sFirst, true);
    await setSessionValidCached(s501, true);
    await setSessionValidCached(sLast, true);

    assert((await isSessionValidCached(sFirst)) === true, 'Seeded first session in Redis');
    assert((await isSessionValidCached(s501)) === true, 'Seeded 501st session in Redis');
    assert((await isSessionValidCached(sLast)) === true, 'Seeded 505th session in Redis');

    // Trigger updateMany targeting all 505 sessions.
    // Pre-hook executes find().limit(501) -> returns 501 docs -> sets _preUpdateNeedsScan = true.
    // Post-hook triggers invalidateAllSessionCacheByScan().
    await Session.updateMany(
      { userId: bulkUserId },
      { $set: { isActive: false } }
    );

    const cachedFirstAfter = await isSessionValidCached(sFirst);
    const cached501After = await isSessionValidCached(s501);
    const cachedLastAfter = await isSessionValidCached(sLast);

    assert(cachedFirstAfter === null, 'First session invalidated by SCAN fallback');
    assert(cached501After === null, '501st session invalidated by SCAN fallback');
    assert(cachedLastAfter === null, '505th session invalidated by SCAN fallback');
    console.log('✅ updateMany with >500 sessions correctly exercised limit(501) and SCAN fallback');

  } finally {
    if (createdUserIds.length > 0) {
      console.log(`\n🧹 Cleaning up ${createdUserIds.length} test users from MongoDB...`);
      await User.deleteMany({ userId: { $in: createdUserIds } });
      console.log('User cleanup complete');
    }

    if (createdSessionIds.length > 0) {
      console.log(`🧹 Cleaning up ${createdSessionIds.length} test sessions from MongoDB...`);
      await Session.deleteMany({ _id: { $in: createdSessionIds } });
      console.log('Session cleanup complete');
    }

    await mongoose.disconnect();
    await closeRedisConnection();
    console.log('MongoDB and Redis connections closed');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL MUTATION HOOK BEHAVIOURAL TESTS PASSED (100% SUCCESS)');
  console.log('====================================================\n');
  process.exit(0);
}

runPreUpdateHookTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
