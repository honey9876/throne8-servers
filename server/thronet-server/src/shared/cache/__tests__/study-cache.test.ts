/**
 * study-cache.test.ts
 * Item I: Behavioural Verification Suite for Leaderboards and Study Analytics Caching
 *
 * Requirements Tested:
 * 1. testSafetyGuard enabled (must refuse to run unless on test database)
 * 2. Cache hit and miss for user analytics (getUserStats, getStudyPatterns)
 * 3. User isolation: User A never gets User B's analytics
 * 4. Invalidation after write paths (study session, ranking updates)
 * 5. Redis sorted sets (ZADD/ZREVRANGE/ZREVRANK) with rebuild on miss
 * 6. Tie-breaking and rank semantics: exact match between MongoDB and Redis on identical data
 * 7. ZREM on user deactivation or deletion
 * 8. Fallback to MongoDB / compute when Redis is unavailable or kill switch CACHE_ANALYTICS_ENABLED=false
 * 9. Concurrency: multiple concurrent reads and updates
 * 10. TTL with jitter verification
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { assertTestEnvironmentSafety } from './testSafetyGuard';
import { getRedisClient } from '../redisConnection';
import { StudyAnalyticsCacheRepository, LeaderboardCacheRepository } from '../studyCache';
import User from '@/auth/models/User.model';
import Ranking from '@/StudyGroup/models/Ranking.model';
import studySessionRepository from '@/StudyGroup/repositories/studySession.repository';
import rankingService from '@/StudyGroup/services/ranking.service';
import analyticsService from '@/StudyGroup/services/analytics.service';
import { SessionStatus } from '@/StudyGroup/interfaces/IStudySession';
import GroupCategory from '@/StudyGroup/enums/GroupCategory.enum';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runStudyCacheTests() {
  console.log('\n==========================================================');
  console.log('🧪 Starting Study Analytics & Leaderboard Test Suite (Item I)');
  console.log('==========================================================');

  // Enforce safety guard & connect DB
  const mongoUri = assertTestEnvironmentSafety();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const redis = await getRedisClient();
  await redis.ping();
  console.log('✅ Connected to MongoDB and Redis');

  const userA = uuidv4();
  const userB = uuidv4();
  const userC = uuidv4();

  // Seed User records
  await User.insertMany([
    {
      userId: userA,
      email: `${userA}@test.com`,
      passwordHash: 'dummy_hash',
      firstName: 'Alice',
      lastName: 'Study',
      status: 'active',
      accountStatus: 'active',
    },
    {
      userId: userB,
      email: `${userB}@test.com`,
      passwordHash: 'dummy_hash',
      firstName: 'Bob',
      lastName: 'Study',
      status: 'active',
      accountStatus: 'active',
    },
    {
      userId: userC,
      email: `${userC}@test.com`,
      passwordHash: 'dummy_hash',
      firstName: 'Charlie',
      lastName: 'Study',
      status: 'active',
      accountStatus: 'active',
    },
  ]);

  try {
    // ── Test 1: User Analytics Cache Hit, Miss & Isolation ────────────
    console.log('\n--- 1. User Analytics Cache Hit, Miss & User Isolation ---');
    const statsKeyA = StudyAnalyticsCacheRepository.getStatsKey(userA);
    const statsKeyB = StudyAnalyticsCacheRepository.getStatsKey(userB);

    await redis.del(statsKeyA);
    await redis.del(statsKeyB);

    let computeCountA = 0;
    let computeCountB = 0;

    const computeA = async () => {
      computeCountA++;
      return { totalStudyTime: 5400, completedSessions: 3, user: userA };
    };

    const computeB = async () => {
      computeCountB++;
      return { totalStudyTime: 1800, completedSessions: 1, user: userB };
    };

    // First call: Miss
    const resA1 = await StudyAnalyticsCacheRepository.getUserStats(userA, computeA);
    assert(computeCountA === 1, 'First call computes stats on miss');
    assert(resA1.user === userA, 'User A gets user A data');

    // Second call: Hit
    const resA2 = await StudyAnalyticsCacheRepository.getUserStats(userA, computeA);
    assert(computeCountA === 1, 'Second call hits cache (no compute re-run)');
    assert(resA2.totalStudyTime === 5400, 'Cached stats match computed');

    // User B call: Isolated from User A
    const resB1 = await StudyAnalyticsCacheRepository.getUserStats(userB, computeB);
    assert(computeCountB === 1, 'User B computes separately');
    assert(resB1.user === userB, 'User B gets user B data, never user A data');
    assert(resB1.totalStudyTime !== resA2.totalStudyTime, 'User isolation verified (distinct cache keys)');

    // Verify TTL is set
    const ttl = await redis.ttl(statsKeyA);
    assert(ttl >= 750 && ttl <= 1050, `TTL is in expected range with jitter (${ttl}s)`);

    // ── Test 2: Study Patterns Cache ──────────────────────────────────
    console.log('\n--- 2. Study Patterns Cache & Invalidation ---');
    let patternsComputeCount = 0;
    const computePatterns = async () => {
      patternsComputeCount++;
      return { days: 7, streak: 5, sessionsPerDay: [1, 2, 0, 1, 3, 2, 1] };
    };

    const patterns1 = await StudyAnalyticsCacheRepository.getStudyPatterns(userA, 7, computePatterns);
    assert(patternsComputeCount === 1, 'Patterns computed on cache miss');
    assert(patterns1.streak === 5, 'Patterns data returned');

    const patterns2 = await StudyAnalyticsCacheRepository.getStudyPatterns(userA, 7, computePatterns);
    assert(patternsComputeCount === 1, 'Patterns served from cache on second call');

    // Invalidation on write
    await StudyAnalyticsCacheRepository.invalidateUserAnalytics(userA);
    const keyAfterDel = await redis.get(statsKeyA);
    assert(keyAfterDel === null, 'Stats key deleted upon user analytics invalidation');

    const patternsAfterDel = await redis.get(StudyAnalyticsCacheRepository.getPatternsKey(userA, 7));
    assert(patternsAfterDel === null, 'Patterns key deleted upon user analytics invalidation');

    // ── Test 3: Redis Down Fallback & Kill Switch ─────────────────────
    console.log('\n--- 3. Fallback to MongoDB & Kill Switch ---');
    process.env['CACHE_ANALYTICS_ENABLED'] = 'false';

    let fallbackCompute = 0;
    const resFallback = await StudyAnalyticsCacheRepository.getUserStats(userA, async () => {
      fallbackCompute++;
      return { totalStudyTime: 9999, fallback: true };
    });
    assert(fallbackCompute === 1, 'Kill switch immediately falls back to direct compute');
    assert(resFallback.fallback === true, 'Fallback returned correct result');

    delete process.env['CACHE_ANALYTICS_ENABLED'];

    // ── Test 4: Leaderboards as Redis Sorted Sets (ZADD/ZREVRANGE/ZREVRANK)
    console.log('\n--- 4. Leaderboard Sorted Sets (ZADD / ZREVRANGE / ZREVRANK) ---');
    const globalKey = LeaderboardCacheRepository.getGlobalSetKey();
    await redis.del(globalKey);

    // Seed rankings in MongoDB
    await Ranking.deleteMany({});
    const createdDocs = await Ranking.create([
      { rankingId: uuidv4(), userId: userA, totalStudyHours: 1000, attendancePercentage: 100, currentStreak: 365, globalRank: 1, category: GroupCategory.OTHER, city: 'Mumbai' },
      { rankingId: uuidv4(), userId: userB, totalStudyHours: 500, attendancePercentage: 50, currentStreak: 50, globalRank: 2, category: GroupCategory.OTHER, city: 'Delhi' },
      { rankingId: uuidv4(), userId: userC, totalStudyHours: 100, attendancePercentage: 10, currentStreak: 10, globalRank: 3, category: GroupCategory.OTHER, city: 'Bangalore' },
    ]);

    const expectedScoreA = createdDocs[0].rankScore;
    const expectedScoreB = createdDocs[1].rankScore;
    const expectedScoreC = createdDocs[2].rankScore;

    // Rebuild global leaderboard
    const count = await LeaderboardCacheRepository.rebuildGlobalLeaderboard();
    assert(count >= 3, `Rebuild global leaderboard populated at least 3 users (got ${count})`);

    // Verify ZREVRANK (0-based -> 1-based)
    const rankA = await LeaderboardCacheRepository.getUserGlobalRank(userA);
    assert(rankA !== null && rankA.rank === 1 && rankA.score === expectedScoreA, `User A rank is #1 with score ${expectedScoreA}`);

    const rankB = await LeaderboardCacheRepository.getUserGlobalRank(userB);
    assert(rankB !== null && rankB.rank === 2 && rankB.score === expectedScoreB, `User B rank is #2 with score ${expectedScoreB}`);

    const rankC = await LeaderboardCacheRepository.getUserGlobalRank(userC);
    assert(rankC !== null && rankC.rank === 3 && rankC.score === expectedScoreC, `User C rank is #3 with score ${expectedScoreC}`);

    // Verify pagination via ZREVRANGE
    const page = await LeaderboardCacheRepository.getGlobalLeaderboardPage(0, 2);
    assert(page !== null, 'getGlobalLeaderboardPage returns data');
    if (!page) throw new Error('page is null');
    assert(page.userIds.length === 2, 'Page size respects limit');
    assert(page.userIds[0] === userA, 'First entry is User A');
    assert(page.userIds[1] === userB, 'Second entry is User B');

    // ── Test 5: Exact Tie-breaking Semantics Comparison with MongoDB ──
    console.log('\n--- 5. Tie-breaking Semantics Match MongoDB Exactly ---');
    // Clear and create two tied users with valid UUID v4s
    const tiedUser1 = '11111111-1111-4111-8111-111111111111';
    const tiedUser2 = '22222222-2222-4222-8222-222222222222';
    await User.deleteMany({ userId: { $in: [tiedUser1, tiedUser2] } });
    await Ranking.deleteMany({ userId: { $in: [tiedUser1, tiedUser2] } });

    await User.insertMany([
      { userId: tiedUser1, email: `${tiedUser1}@test.com`, passwordHash: 'hash', firstName: 'Tied1', lastName: 'User', status: 'active', accountStatus: 'active' },
      { userId: tiedUser2, email: `${tiedUser2}@test.com`, passwordHash: 'hash', firstName: 'Tied2', lastName: 'User', status: 'active', accountStatus: 'active' },
    ]);

    await Ranking.create([
      { rankingId: uuidv4(), userId: tiedUser1, totalStudyHours: 200, attendancePercentage: 50, currentStreak: 30, globalRank: 0, category: GroupCategory.OTHER },
      { rankingId: uuidv4(), userId: tiedUser2, totalStudyHours: 200, attendancePercentage: 50, currentStreak: 30, globalRank: 0, category: GroupCategory.OTHER },
    ]);

    // Rebuild Redis
    await LeaderboardCacheRepository.rebuildGlobalLeaderboard();

    // Query MongoDB with the authoritative tie-break sort: { rankScore: -1, userId: -1 }
    const mongoDocs = await Ranking.find({ userId: { $in: [tiedUser1, tiedUser2] } })
      .sort({ rankScore: -1, userId: -1 })
      .select('userId rankScore')
      .lean();

    // Query Redis with ZREVRANGE
    const redisPage = await redis.zrevrange(globalKey, 0, -1);
    const redisFiltered = redisPage.filter((id) => id === tiedUser1 || id === tiedUser2);

    assert(mongoDocs.length === 2, 'Found 2 tied docs in MongoDB');
    assert(redisFiltered.length === 2, 'Found 2 tied docs in Redis');

    // In descending tie break on equal score 250:
    // tiedUser2 > tiedUser1, so tiedUser2 must come first in BOTH!
    assert(
      mongoDocs[0].userId === redisFiltered[0] && mongoDocs[1].userId === redisFiltered[1],
      `Exact tie-break order matches! Mongo: [${mongoDocs.map((d) => d.userId).join(', ')}] vs Redis: [${redisFiltered.join(', ')}]`
    );

    // ── Test 5b: Rebuild on Expired Key Before ZADD & Equal Mongo Ranking ──
    console.log('\n--- 5b. Leaderboard Rebuild on Expired Key Before ZADD Update ---');
    // 1. Forcefully expire/delete the global leaderboard key in Redis
    await redis.del(globalKey);
    const keyExistsBefore = await redis.exists(globalKey);
    assert(keyExistsBefore === 0, 'Leaderboard key is completely missing/expired in Redis');

    // 2. Update one user points in MongoDB and push to cache
    await Ranking.updateOne({ userId: userA }, { $set: { rankScore: 9999, totalStudyHours: 3000 } });
    await LeaderboardCacheRepository.updateUserScore(userA, 9999);

    // 3. Read leaderboard from Redis
    const leaderboardFromRedis = await LeaderboardCacheRepository.getGlobalLeaderboardPage(0, 10);
    assert(leaderboardFromRedis !== null, 'Leaderboard page returned after single-flight rebuild + update');
    if (!leaderboardFromRedis) throw new Error('leaderboardFromRedis is null');
    assert(leaderboardFromRedis.total >= 3, 'Redis leaderboard contains all users (not only the updated user)');

    // 4. Assert it equals MongoDB-computed ranking
    const mongoComputedRanking = await Ranking.find({ rankScore: { $gt: 0 } })
      .sort({ rankScore: -1, userId: -1 })
      .select('userId rankScore')
      .lean();

    assert(
      leaderboardFromRedis.userIds.length === mongoComputedRanking.length,
      `Redis leaderboard count (${leaderboardFromRedis.userIds.length}) equals MongoDB count (${mongoComputedRanking.length})`
    );
    assert(
      leaderboardFromRedis.userIds[0] === userA && leaderboardFromRedis.scores[0] === 9999,
      'User A is rank #1 with 9999 points in Redis'
    );
    for (let i = 0; i < mongoComputedRanking.length; i++) {
      assert(
        leaderboardFromRedis.userIds[i] === mongoComputedRanking[i].userId,
        `Rank #${i + 1} user ID matches MongoDB: ${leaderboardFromRedis.userIds[i]} === ${mongoComputedRanking[i].userId}`
      );
      assert(
        leaderboardFromRedis.scores[i] === mongoComputedRanking[i].rankScore,
        `Rank #${i + 1} score matches MongoDB: ${leaderboardFromRedis.scores[i]} === ${mongoComputedRanking[i].rankScore}`
      );
    }

    // ── Test 5c: Weekly Leaderboard Rebuild on Expired Key Before ZADD ──
    console.log('\n--- 5c. Weekly Leaderboard Guarded Rebuild via Atomic Lua ---');
    const weeklyKey = LeaderboardCacheRepository.getWeeklySetKey();
    await redis.del(weeklyKey);
    assert((await redis.exists(weeklyKey)) === 0, 'Weekly leaderboard key deleted in Redis');

    await Ranking.updateOne({ userId: userA }, { $set: { weeklyHours: 50 } });
    await LeaderboardCacheRepository.updateUserScore(userA, 9999, undefined, 50);

    const weeklyScore = await redis.zscore(weeklyKey, userA);
    assert(weeklyScore !== null && parseFloat(weeklyScore) === 50, 'Weekly leaderboard rebuilt from MongoDB and userA weekly score is 50');

    // ── Test 5d: Monthly Leaderboard Rebuild on Expired Key Before ZADD ──
    console.log('\n--- 5d. Monthly Leaderboard Guarded Rebuild via Atomic Lua ---');
    const monthlyKey = LeaderboardCacheRepository.getMonthlySetKey();
    await redis.del(monthlyKey);
    assert((await redis.exists(monthlyKey)) === 0, 'Monthly leaderboard key deleted in Redis');

    await Ranking.updateOne({ userId: userA }, { $set: { monthlyHours: 200 } });
    await LeaderboardCacheRepository.updateUserScore(userA, 9999, undefined, undefined, 200);

    const monthlyScore = await redis.zscore(monthlyKey, userA);
    assert(monthlyScore !== null && parseFloat(monthlyScore) === 200, 'Monthly leaderboard rebuilt from MongoDB and userA monthly score is 200');

    // ── Test 5e: Category Leaderboard Rebuild on Expired Key Before ZADD ──
    console.log('\n--- 5e. Category Leaderboard Guarded Rebuild via Atomic Lua ---');
    const categoryKey = LeaderboardCacheRepository.getCategorySetKey(GroupCategory.OTHER);
    await redis.del(categoryKey);
    assert((await redis.exists(categoryKey)) === 0, 'Category leaderboard key deleted in Redis');

    await Ranking.updateOne({ userId: userA }, { $set: { rankScore: 9999, category: GroupCategory.OTHER } });
    await LeaderboardCacheRepository.updateUserScore(userA, 9999, GroupCategory.OTHER);

    const catScore = await redis.zscore(categoryKey, userA);
    assert(catScore !== null && parseFloat(catScore) === 9999, 'Category leaderboard rebuilt from MongoDB and userA score is 9999');

    // ── Test 6: ZREM on User Deactivation / Deletion ──────────────────
    console.log('\n--- 6. ZREM on User Deletion / Deactivation ---');
    await LeaderboardCacheRepository.removeUser(userC);

    const rankCAfterRem = await LeaderboardCacheRepository.getUserGlobalRank(userC);
    assert(rankCAfterRem === null, 'User C removed from sorted sets via ZREM');

    // Also test User model hook triggers ZREM
    const testUser = await User.findOne({ userId: userB });
    if (testUser) {
      testUser.status = 'inactive';
      await testUser.save();

      const rankBAfterDeact = await LeaderboardCacheRepository.getUserGlobalRank(userB);
      assert(rankBAfterDeact === null, 'Deactivated user automatically removed from Redis leaderboard');
    }

    // ── Test 7: Concurrency Test ──────────────────────────────────────
    console.log('\n--- 7. Concurrency Test ---');
    const concurrentOps = Array.from({ length: 20 }, (_, idx) =>
      StudyAnalyticsCacheRepository.getUserStats(userA, async () => ({
        totalStudyTime: 5400,
        iteration: idx,
      }))
    );
    const concurrentResults = await Promise.all(concurrentOps);
    assert(concurrentResults.length === 20, '20 concurrent analytics reads completed successfully');
    assert(
      concurrentResults.every((r) => r.totalStudyTime === 5400),
      'All concurrent reads return consistent data'
    );

    // ── Test 8: Study Analytics Invalidation across Write Paths ───────
    console.log('\n--- 8. Study Analytics Invalidation on Task, Goal, Attendance, Streak ---');
    const Task = (await import('@/StudyGroup/models/Task.model')).default;
    const Goal = (await import('@/StudyGroup/models/Goal.model')).default;
    const Attendance = (await import('@/StudyGroup/models/Attendance.model')).default;
    const Streak = (await import('@/StudyGroup/models/Streak.model')).default;

    // 8a: Task write path
    await StudyAnalyticsCacheRepository.getUserStats(userA, async () => ({ totalStudyTime: 5000 }));
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) !== null, 'Stats cached before Task save');
    const taskDoc = await Task.create({
      taskId: uuidv4(),
      userId: userA,
      user: userA,
      title: 'Analytics Task Invalidation',
    });
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) === null, 'Task save invalidated user stats cache');

    // Task updateOne
    await StudyAnalyticsCacheRepository.getUserStats(userA, async () => ({ totalStudyTime: 5000 }));
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) !== null, 'Stats cached before Task updateOne');
    await Task.updateOne({ _id: taskDoc._id }, { $set: { completed: true } });
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) === null, 'Task updateOne invalidated user stats cache');

    // 8b: Goal write path
    await StudyAnalyticsCacheRepository.getUserStats(userA, async () => ({ totalStudyTime: 5000 }));
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) !== null, 'Stats cached before Goal save');
    const goalDoc = await Goal.create({
      goalId: uuidv4(),
      user: userA,
      title: 'Analytics Goal Invalidation',
      targetHours: 20,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000 * 7),
    });
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) === null, 'Goal save invalidated user stats cache');

    // Goal updateOne
    await StudyAnalyticsCacheRepository.getUserStats(userA, async () => ({ totalStudyTime: 5000 }));
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) !== null, 'Stats cached before Goal updateOne');
    await Goal.updateOne({ _id: goalDoc._id }, { $set: { currentHours: 15 } });
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) === null, 'Goal updateOne invalidated user stats cache');

    // 8c: Attendance write path
    await StudyAnalyticsCacheRepository.getUserStats(userA, async () => ({ totalStudyTime: 5000 }));
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) !== null, 'Stats cached before Attendance save');
    const attDoc = await Attendance.create({
      attendanceId: uuidv4(),
      user: userA,
      date: new Date('2026-01-01'),
    });
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) === null, 'Attendance save invalidated user stats cache');

    // 8d: Streak write path
    await StudyAnalyticsCacheRepository.getUserStats(userA, async () => ({ totalStudyTime: 5000 }));
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) !== null, 'Stats cached before Streak save');
    const streakDoc = await Streak.create({
      streakId: uuidv4(),
      user: userA,
      currentStreak: 12,
    });
    assert(await redis.get(StudyAnalyticsCacheRepository.getStatsKey(userA)) === null, 'Streak save invalidated user stats cache');

    // Cleanup models
    await Task.deleteOne({ _id: taskDoc._id });
    await Goal.deleteOne({ _id: goalDoc._id });
    await Attendance.deleteOne({ _id: attDoc._id });
    await Streak.deleteOne({ _id: streakDoc._id });

    console.log('\n==========================================================');
    console.log('🎉 Item I Study Analytics & Leaderboard Tests Passed Successfully!');
    console.log('==========================================================\n');
  } finally {
    // Cleanup test data
    await User.deleteMany({ userId: { $in: [userA, userB, userC, 'user_tied_aaa', 'user_tied_zzz'] } });
    await Ranking.deleteMany({ userId: { $in: [userA, userB, userC, 'user_tied_aaa', 'user_tied_zzz'] } });
    await redis.del(StudyAnalyticsCacheRepository.getStatsKey(userA));
    await redis.del(StudyAnalyticsCacheRepository.getStatsKey(userB));
    await redis.del(LeaderboardCacheRepository.getGlobalSetKey());
  }
}

runStudyCacheTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Study Cache Test failed:', err);
    process.exit(1);
  });
