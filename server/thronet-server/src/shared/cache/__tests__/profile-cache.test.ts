/**
 * profile-cache.test.ts
 * Item G: Behavioural Verification Suite for Profile Caching
 *
 * Requirements:
 * - testSafetyGuard verified (runs on test database only)
 * - Cache hit and miss for public profiles
 * - Separate public profile cache from viewer-specific data
 * - Private fields NEVER appear in public cache
 * - Blocked viewer NEVER receives cached profile data
 * - Invalidation after every sub-model write path (About, Experience, Education, Positions, bulkWrite, User update)
 * - User isolation (user A never gets user B's profile)
 * - Concurrent requests (20 simultaneous reads)
 * - Kill switch & fail-open fallback
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { assertTestEnvironmentSafety } from './testSafetyGuard';
import { getRedisClient } from '../redisConnection';
import { ProfileCacheRepository, PublicProfilePayload } from '../profileCache';
import ConnectionBlock from '@/connections/models/ConnectionBlock';
import Experience from '@/Profile/models/Experience.model';
import Education from '@/Profile/models/Education.model';
import About from '@/Profile/models/about.model';
import Position from '@/Profile/models/Position.model';
import User from '@/auth/models/User.model';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runProfileCacheTests() {
  console.log('\n=======================================================');
  console.log('🧪 Starting Profile Cache Behavioural Test Suite (Item G)');
  console.log('=======================================================');

  // Safety guard & DB connection
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

  try {
    // ── Test 1: Cache Miss & Cache Hit ────────────────────────────────
    console.log('\n--- 1. Cache Miss and Cache Hit ---');
    const miss = await ProfileCacheRepository.getPublicProfile(userA);
    assert(miss === null, 'Cache miss returns null for uncached user');

    const sampleProfileA: PublicProfilePayload = {
      userId: userA,
      firstName: 'Alice',
      lastName: 'Smith',
      headline: { title: 'Lead Architect' },
      about: { summary: 'Building high throughput systems' },
      experiences: [
        { experienceId: 'exp-1', title: 'Tech Lead', company: 'Acme', isPrivate: false },
      ],
    };

    await ProfileCacheRepository.setPublicProfile(userA, sampleProfileA);
    const hit = await ProfileCacheRepository.getPublicProfile(userA);
    assert(hit !== null && hit.firstName === 'Alice', 'Cache hit returns stored profile');
    assert(hit?.experiences?.length === 1, 'Cache hit preserves public experiences');

    // ── Test 2: User Isolation (User A never gets User B) ─────────────
    console.log('\n--- 2. User Isolation ---');
    const userBProfile = await ProfileCacheRepository.getPublicProfile(userB);
    assert(userBProfile === null, 'User B cache is isolated and empty');

    const sampleProfileB: PublicProfilePayload = {
      userId: userB,
      firstName: 'Bob',
      lastName: 'Jones',
      about: { summary: 'Bob summary' },
    };
    await ProfileCacheRepository.setPublicProfile(userB, sampleProfileB);

    const hitA = await ProfileCacheRepository.getPublicProfile(userA);
    const hitB = await ProfileCacheRepository.getPublicProfile(userB);
    assert(hitA?.firstName === 'Alice', 'User A profile unchanged and isolated');
    assert(hitB?.firstName === 'Bob', 'User B profile isolated and correct');

    // ── Test 3: Private Field Filtering ───────────────────────────────
    console.log('\n--- 3. Private Fields NEVER Enter Public Cache ---');
    const profileWithPrivateData: PublicProfilePayload = {
      userId: userA,
      firstName: 'Alice',
      lastName: 'Smith',
      experiences: [
        { experienceId: 'exp-pub', title: 'Public Job', isPrivate: false },
        { experienceId: 'exp-priv', title: 'Confidential Job', isPrivate: true },
        { experienceId: 'exp-priv-vis', title: 'Hidden Project', visibility: 'private' },
      ],
      skills: [
        { skillId: 'sk-1', name: 'TypeScript', isPrivate: false },
        { skillId: 'sk-2', name: 'Secret Skill', isPrivate: true },
      ],
    };

    await ProfileCacheRepository.setPublicProfile(userA, profileWithPrivateData);
    const sanitizedHit = await ProfileCacheRepository.getPublicProfile(userA);
    assert(sanitizedHit?.experiences?.length === 1, 'Private experiences stripped from cache');
    assert(sanitizedHit?.experiences?.[0].experienceId === 'exp-pub', 'Only public experience preserved');
    assert(sanitizedHit?.skills?.length === 1, 'Private skills stripped from cache');
    assert(sanitizedHit?.skills?.[0].skillId === 'sk-1', 'Only public skill preserved');

    // ── Test 4: Blocked Viewer Security Enforcement ───────────────────
    console.log('\n--- 4. Blocked Viewer NEVER Receives Cached Profile ---');
    // Block userC from viewing userA
    await ConnectionBlock.create({
      blockerId: userA,
      blockedId: userC,
      reason: 'harassment',
      blockedAt: new Date(),
    });

    const viewerResponse = await ProfileCacheRepository.getProfileForViewer(
      userC,
      userA,
      async () => sampleProfileA
    );

    assert(viewerResponse.isBlocked === true, 'Blocked viewer recognized');
    assert(viewerResponse.profile === null, 'Blocked viewer receives null profile, NEVER cached data');

    // Reverse block: userB blocks userA
    await ConnectionBlock.create({
      blockerId: userB,
      blockedId: userA,
      reason: 'spam',
      blockedAt: new Date(),
    });

    const reverseBlockedResponse = await ProfileCacheRepository.getProfileForViewer(
      userA,
      userB,
      async () => sampleProfileB
    );
    assert(reverseBlockedResponse.isBlocked === true, 'Reverse blocked recognized');
    assert(reverseBlockedResponse.profile === null, 'Reverse blocked receives null profile');

    // Non-blocked viewer gets cached profile
    const unblockedResponse = await ProfileCacheRepository.getProfileForViewer(
      uuidv4(),
      userA,
      async () => sampleProfileA
    );
    assert(unblockedResponse.isBlocked === false, 'Unblocked viewer allowed');
    assert(unblockedResponse.profile !== null, 'Unblocked viewer receives profile');

    // ── Test 4b: Privacy Filtering: Connections-Only Field Stripping On Cache Hit ──
    console.log('\n--- 4b. Privacy Filtering: Connections-Only Field Stripping On Cache Hit ---');
    const userConnected = uuidv4();
    const userNonConnected = uuidv4();

    // Configure connection resolver: userConnected is connected to userA, userNonConnected is NOT
    ProfileCacheRepository.setIsConnectionFn(async (viewerId: string, targetId: string) => {
      return viewerId === userConnected && targetId === userA;
    });

    const profileWithRestrictedFields: PublicProfilePayload = {
      userId: userA,
      firstName: 'Alice',
      lastName: 'Smith',
      headline: { title: 'Lead Architect' },
      experiences: [
        { experienceId: 'exp-public', title: 'Public Lead', company: 'Acme', visibility: 'public' },
        { experienceId: 'exp-conn', title: 'Stealth Founder', company: 'Secret Labs', visibility: 'connections_only' },
      ],
      skills: [
        { skillId: 'sk-public', name: 'TypeScript', visibility: 'public' },
        { skillId: 'sk-conn', name: 'Internal Kernel Architecture', visibility: 'connections_only' },
      ],
    };

    // Populate public cache
    await ProfileCacheRepository.setPublicProfile(userA, profileWithRestrictedFields);

    // 1. Connected viewer reads profile (cache hit)
    const connResponse = await ProfileCacheRepository.getProfileForViewer(
      userConnected,
      userA,
      async () => profileWithRestrictedFields
    );
    assert(connResponse.profile !== null, 'Connected viewer receives profile');
    assert(connResponse.profile?.experiences?.length === 2, 'Connected viewer sees all experiences including connections_only');
    assert(connResponse.profile?.skills?.length === 2, 'Connected viewer sees connections_only skills');

    // 2. Non-connected viewer reads profile (cache hit)
    const nonConnResponse = await ProfileCacheRepository.getProfileForViewer(
      userNonConnected,
      userA,
      async () => profileWithRestrictedFields
    );
    assert(nonConnResponse.profile !== null, 'Non-connected viewer receives profile');
    assert(
      nonConnResponse.profile?.experiences?.length === 1 &&
      nonConnResponse.profile?.experiences?.[0].experienceId === 'exp-public',
      'Non-connected viewer NEVER receives connections_only experience after cache hit'
    );
    assert(
      nonConnResponse.profile?.skills?.length === 1 &&
      nonConnResponse.profile?.skills?.[0].skillId === 'sk-public',
      'Non-connected viewer NEVER receives connections_only skills after cache hit'
    );

    // ── Test 5: Invalidation After Sub-model Writes ───────────────────
    console.log('\n--- 5. Invalidation on Sub-model Writes ---');
    // Ensure userA is cached
    await ProfileCacheRepository.setPublicProfile(userA, sampleProfileA);
    assert((await ProfileCacheRepository.getPublicProfile(userA)) !== null, 'Profile cached prior to write');

    // 5a: Experience save invalidation
    const expDoc = await Experience.create({
      experienceId: uuidv4(),
      userId: userA,
      currentPosition: 'Senior Engineer',
      companyName: 'Tech Corp',
      description: 'Developed scalable microservices and distributed event queues.',
      startDate: new Date('2022-01-01'),
      currentlyWorking: true,
      isDeleted: false,
      isArchived: false,
    });
    let afterExpWrite = await ProfileCacheRepository.getPublicProfile(userA);
    assert(afterExpWrite === null, 'Experience creation invalidates user profile cache');

    // Recache and test Experience updateOne
    await ProfileCacheRepository.setPublicProfile(userA, sampleProfileA);
    await Experience.updateOne({ experienceId: expDoc.experienceId }, { $set: { currentPosition: 'Staff Engineer' } });
    let afterExpUpdate = await ProfileCacheRepository.getPublicProfile(userA);
    assert(afterExpUpdate === null, 'Experience updateOne invalidates user profile cache');

    // 5b: Education save invalidation
    await ProfileCacheRepository.setPublicProfile(userA, sampleProfileA);
    const eduDoc = await Education.create({
      educationId: uuidv4(),
      userId: userA,
      schoolCollegeName: 'Stanford University',
      degree: 'Bachelor of Science',
      degreeType: "Bachelor's",
      startDate: new Date('2018-09-01'),
      isDeleted: false,
    });
    let afterEduWrite = await ProfileCacheRepository.getPublicProfile(userA);
    assert(afterEduWrite === null, 'Education creation invalidates user profile cache');

    // 5c: About model update
    await ProfileCacheRepository.setPublicProfile(userA, sampleProfileA);
    const aboutText = 'Architectural engineer with over 10 years of experience building scalable backend platforms.';
    const aboutDoc = await About.create({
      aboutId: uuidv4(),
      userId: userA,
      aboutText,
      characterCount: aboutText.length,
      isDeleted: false,
    });
    let afterAboutWrite = await ProfileCacheRepository.getPublicProfile(userA);
    assert(afterAboutWrite === null, 'About creation invalidates user profile cache');

    // 5d: Position bulkWrite invalidation
    await ProfileCacheRepository.setPublicProfile(userA, sampleProfileA);
    await Position.bulkWrite([
      {
        updateOne: {
          filter: { userId: userA, positionId: uuidv4() },
          update: {
            $set: {
              jobTitle: 'Staff Engineer',
              companyName: 'Stripe Corp',
              employmentType: 'full-time',
              startDate: new Date('2021-01-01'),
              displayOrder: 1,
            },
          },
          upsert: true,
        },
      },
    ]);
    let afterBulkWrite = await ProfileCacheRepository.getPublicProfile(userA);
    assert(afterBulkWrite === null, 'Position bulkWrite invalidates user profile cache');

    // 5e: User model update invalidates profile cache
    await ProfileCacheRepository.setPublicProfile(userA, sampleProfileA);
    await User.create({
      userId: userA,
      email: `${userA}@test.com`,
      passwordHash: 'dummy_hash',
      firstName: 'Alice',
      lastName: 'Smith',
    });
    await User.updateOne({ userId: userA }, { $set: { firstName: 'Alicia' } });
    let afterUserUpdate = await ProfileCacheRepository.getPublicProfile(userA);
    assert(afterUserUpdate === null, 'User document update invalidates profile cache');

    // ── Test 6: 20 Concurrent Requests ────────────────────────────────
    console.log('\n--- 6. Concurrent Read Operations (20 parallel requests) ---');
    await ProfileCacheRepository.setPublicProfile(userA, sampleProfileA);
    const concurrentFetches = await Promise.all(
      Array.from({ length: 20 }, () => ProfileCacheRepository.getPublicProfile(userA))
    );
    const allMatching = concurrentFetches.every((res) => res !== null && res.firstName === 'Alice');
    assert(allMatching, 'All 20 concurrent requests succeeded and retrieved identical profile');

    // ── Test 7: Kill Switch ───────────────────────────────────────────
    console.log('\n--- 7. Kill Switch (CACHE_PROFILE_ENABLED=false) ---');
    process.env['CACHE_PROFILE_ENABLED'] = 'false';
    const disabledGet = await ProfileCacheRepository.getPublicProfile(userA);
    assert(disabledGet === null, 'Profile cache returns null when CACHE_PROFILE_ENABLED is false');
    delete process.env['CACHE_PROFILE_ENABLED'];

    console.log('\n=======================================================');
    console.log('✅ ALL PROFILE CACHE BEHAVIOURAL TESTS PASSED (Item G)');
    console.log('=======================================================\n');
  } finally {
    // Cleanup
    try {
      await ConnectionBlock.deleteMany({
        $or: [
          { blockerId: { $in: [userA, userB, userC] } },
          { blockedId: { $in: [userA, userB, userC] } },
        ],
      });
      await Experience.deleteMany({ userId: { $in: [userA, userB, userC] } });
      await Education.deleteMany({ userId: { $in: [userA, userB, userC] } });
      await About.deleteMany({ userId: { $in: [userA, userB, userC] } });
      await Position.deleteMany({ userId: { $in: [userA, userB, userC] } });
      await User.deleteMany({ userId: { $in: [userA, userB, userC] } });
    } catch {
      // ignore cleanup errors
    }
  }
}

if (require.main === module) {
  runProfileCacheTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test Suite Failed:', err);
      process.exit(1);
    });
}

export { runProfileCacheTests };
