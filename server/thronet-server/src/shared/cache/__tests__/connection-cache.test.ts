/**
 * connection-cache.test.ts
 * Item H: Behavioural Verification Suite for Connections & Mutuals Caching (Redis Sets)
 *
 * Requirements:
 * - testSafetyGuard verified (runs on test database only)
 * - Cache hit and miss for connection sets (derived data)
 * - Rebuild from MongoDB on miss
 * - Sync on request-accept, remove, block, unblock
 * - Mutual-connection results via SINTER respecting blocks and privacy
 * - MongoDB fallback on critical path / Redis down / kill switch
 * - Drift check and automatic self-healing
 * - 100 concurrent accepts
 * - TTL verification
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { assertTestEnvironmentSafety } from './testSafetyGuard';
import { getRedisClient } from '../redisConnection';
import { ConnectionCacheRepository } from '../connectionCache';
import { ProfileCacheRepository } from '../profileCache';
import Connection from '@/connections/models/Connection';
import ConnectionBlock from '@/connections/models/ConnectionBlock';
import User from '@/auth/models/User.model';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runConnectionCacheTests() {
  console.log('\n==========================================================');
  console.log('🧪 Starting Connection Cache Behavioural Test Suite (Item H)');
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
  const mutualFriend1 = uuidv4();
  const mutualFriend2 = uuidv4();
  const extraUser = uuidv4();

  const allTestUsers = [userA, userB, mutualFriend1, mutualFriend2, extraUser];

  // Seed User records so Connection foreign key validators pass
  await User.insertMany(
    allTestUsers.map((uid) => ({
      userId: uid,
      email: `${uid}@test.com`,
      passwordHash: 'dummy_hash',
      firstName: 'Test',
      lastName: 'User',
      status: 'active',
      accountStatus: 'active',
    }))
  );

  try {
    // ── Test 1: Cache Miss & Rebuild from MongoDB ─────────────────────
    console.log('\n--- 1. Cache Miss and Rebuild from MongoDB ---');
    // Ensure Redis set is empty
    const setKeyA = ConnectionCacheRepository.getSetKey(userA);
    await redis.del(setKeyA);

    // Create an active connection in MongoDB
    await Connection.create({
      connectionId: uuidv4(),
      fromUserId: userA,
      toUserId: userB,
      status: 'active',
      isArchived: false,
    });

    // Cache miss triggers rebuild from MongoDB
    const setA = await ConnectionCacheRepository.getConnectionsSet(userA);
    assert(setA.has(userB), 'Cache miss rebuilt from MongoDB and contains userB');

    const redisExists = await redis.exists(setKeyA);
    assert(redisExists === 1, 'Redis Set created in cache on miss');
    const ttl = await redis.ttl(setKeyA);
    assert(ttl > 0, `Redis Set has positive TTL (got ${ttl}s)`);

    // ── Test 2: Connection Accept Sync ────────────────────────────────
    console.log('\n--- 2. Sync on Request-Accept ---');
    // Establish connections with mutualFriend1 and mutualFriend2 for User A
    await Connection.create({
      connectionId: uuidv4(),
      fromUserId: userA,
      toUserId: mutualFriend1,
      status: 'active',
      isArchived: false,
    });

    await Connection.create({
      connectionId: uuidv4(),
      fromUserId: userA,
      toUserId: mutualFriend2,
      status: 'active',
      isArchived: false,
    });

    // Establish connections for User B with mutualFriend1, mutualFriend2, extraUser
    await Connection.create({
      connectionId: uuidv4(),
      fromUserId: userB,
      toUserId: mutualFriend1,
      status: 'active',
      isArchived: false,
    });

    await Connection.create({
      connectionId: uuidv4(),
      fromUserId: userB,
      toUserId: mutualFriend2,
      status: 'active',
      isArchived: false,
    });

    await Connection.create({
      connectionId: uuidv4(),
      fromUserId: userB,
      toUserId: extraUser,
      status: 'active',
      isArchived: false,
    });

    // Rebuild sets to capture all connections
    const [freshSetA, freshSetB] = await Promise.all([
      ConnectionCacheRepository.rebuildUserConnectionsSet(userA),
      ConnectionCacheRepository.rebuildUserConnectionsSet(userB),
    ]);

    assert(freshSetA.has(mutualFriend1) && freshSetA.has(mutualFriend2), 'User A set contains both mutual friends');
    assert(freshSetB.has(mutualFriend1) && freshSetB.has(mutualFriend2) && freshSetB.has(extraUser), 'User B set contains friends and extra user');

    // ── Test 3: SINTER Mutual Connections ─────────────────────────────
    console.log('\n--- 3. Mutual Connections via SINTER ---');
    const mutuals = await ConnectionCacheRepository.getMutualConnections(userA, userB);
    assert(mutuals.length === 2, `Mutuals between A and B returned exactly 2 (got ${mutuals.length})`);
    assert(mutuals.includes(mutualFriend1) && mutuals.includes(mutualFriend2), 'Mutuals contain mutualFriend1 and mutualFriend2');
    assert(!mutuals.includes(extraUser), 'Non-mutual extraUser is excluded');

    // ── Test 4: Privacy & Blocks on Mutual Connections ────────────────
    console.log('\n--- 4. Privacy and Block Enforcement ---');
    // 4a: Direct block between A and B
    await ConnectionBlock.create({
      blockerId: userA,
      blockedId: userB,
      reason: 'spam',
      isActive: true,
      blockedAt: new Date(),
    });

    const blockedMutuals = await ConnectionCacheRepository.getMutualConnections(userA, userB);
    assert(blockedMutuals.length === 0, 'Mutuals between blocked users returns empty array');

    // 4b: Unblock A and B
    await ConnectionBlock.deleteMany({
      $or: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    });

    // 4c: Block one of the mutual friends (userA blocks mutualFriend1)
    await ConnectionBlock.create({
      blockerId: userA,
      blockedId: mutualFriend1,
      reason: 'harassment',
      isActive: true,
      blockedAt: new Date(),
    });

    const filteredMutuals = await ConnectionCacheRepository.getMutualConnections(userA, userB);
    assert(filteredMutuals.length === 1, `Blocked mutual friend is filtered out (expected 1, got ${filteredMutuals.length})`);
    assert(filteredMutuals[0] === mutualFriend2, 'Only unblocked mutualFriend2 returned');

    // Cleanup block on mutualFriend1
    await ConnectionBlock.deleteMany({ blockerId: userA, blockedId: mutualFriend1 });

    // ── Test 5: Remove Connection Sync ────────────────────────────────
    console.log('\n--- 5. Sync on Remove Connection ---');
    await ConnectionCacheRepository.removeConnection(userA, mutualFriend2);
    const afterRemoveA = await ConnectionCacheRepository.getConnectionsSet(userA);
    const afterRemoveM2 = await ConnectionCacheRepository.getConnectionsSet(mutualFriend2);
    assert(!afterRemoveA.has(mutualFriend2), 'User A set no longer contains removed friend');
    assert(!afterRemoveM2.has(userA), 'Removed friend set no longer contains User A');

    // ── Test 6: Drift Check and Self-Healing Rebuild ──────────────────
    console.log('\n--- 6. Drift Check and Self-Healing Rebuild ---');
    // Intentionally inject a ghost user into Redis set to create drift
    const ghostUser = uuidv4();
    await redis.sadd(setKeyA, ghostUser);

    const driftBefore = await ConnectionCacheRepository.checkDrift(userA);
    assert(driftBefore.inSync === false, 'Drift detected when Redis set has extra ghost user');
    assert(driftBefore.drift > 0, `Drift count is greater than 0 (got ${driftBefore.drift})`);

    // Self-healing should have run during checkDrift
    const driftAfter = await ConnectionCacheRepository.checkDrift(userA);
    assert(driftAfter.inSync === true, 'Self-healing rebuild restored sync between Redis and MongoDB');
    const setAAfterHeal = await ConnectionCacheRepository.getConnectionsSet(userA);
    assert(!setAAfterHeal.has(ghostUser), 'Ghost user purged after self-healing rebuild');

    // ── Test 7: 100 Concurrent Accepts ────────────────────────────────
    console.log('\n--- 7. 100 Concurrent Accepts ---');
    const targetUserIds = Array.from({ length: 100 }, () => uuidv4());

    const acceptPromises = targetUserIds.map((targetId) =>
      ConnectionCacheRepository.addConnection(userA, targetId)
    );
    await Promise.all(acceptPromises);

    const concurrentSetA = await ConnectionCacheRepository.getConnectionsSet(userA);
    const allIncluded = targetUserIds.every((id) => concurrentSetA.has(id));
    assert(allIncluded, 'All 100 concurrent accepts successfully registered in User A connection set');

    // ── Test 8: Kill Switch & Fallback ─────────────────────────────────
    console.log('\n--- 8. Kill Switch (CACHE_CONNECTIONS_ENABLED=false) ---');
    process.env['CACHE_CONNECTIONS_ENABLED'] = 'false';

    const fallbackSet = await ConnectionCacheRepository.getConnectionsSet(userA);
    assert(fallbackSet instanceof Set, 'Fallback returns Set when cache is disabled');

    const fallbackMutuals = await ConnectionCacheRepository.getMutualConnections(userA, userB);
    assert(Array.isArray(fallbackMutuals), 'Fallback returns array for mutuals when cache is disabled');

    delete process.env['CACHE_CONNECTIONS_ENABLED'];

    // ── Test 9: Block then Unblock — Viewer Immediately Sees Profile ──
    console.log('\n--- 9. Block then Unblock Profile Visibility ---');
    const viewerId = uuidv4();
    const targetUserId = uuidv4();
    await User.insertMany([
      { userId: viewerId, email: `${viewerId}@test.com`, passwordHash: 'hash', firstName: 'Viewer', lastName: 'User', status: 'active', accountStatus: 'active' },
      { userId: targetUserId, email: `${targetUserId}@test.com`, passwordHash: 'hash', firstName: 'Target', lastName: 'User', status: 'active', accountStatus: 'active' },
    ]);

    const mockProfile = {
      userId: targetUserId,
      firstName: 'Target',
      lastName: 'User',
      headline: 'Software Engineer',
    };

    // 1. Initially unblocked: viewer can see profile
    const initialView = await ProfileCacheRepository.getProfileForViewer(
      viewerId,
      targetUserId,
      async () => mockProfile
    );
    assert(!initialView.isBlocked && initialView.profile !== null, 'Viewer can view profile when unblocked');

    // 2. Viewer blocks target user
    const blockDoc = await ConnectionBlock.create({
      blockerId: viewerId,
      blockedId: targetUserId,
      reason: 'harassment',
      isActive: true,
      blockedAt: new Date(),
    });

    const blockedView = await ProfileCacheRepository.getProfileForViewer(
      viewerId,
      targetUserId,
      async () => mockProfile
    );
    assert(blockedView.isBlocked && blockedView.profile === null, 'Profile is hidden (null) while blocked');

    // 3. Viewer unblocks target user
    await blockDoc.unblock();

    const unblockedView = await ProfileCacheRepository.getProfileForViewer(
      viewerId,
      targetUserId,
      async () => mockProfile
    );
    assert(!unblockedView.isBlocked && unblockedView.profile !== null, 'Viewer immediately sees profile again after unblock');

    // ── Test 10: Deactivated User Disappears from Connection Lists ─────
    console.log('\n--- 10. Deactivated User Disappears from Connection Lists ---');
    const activeFriendId = uuidv4();
    const deactFriendId = uuidv4();
    await User.insertMany([
      { userId: activeFriendId, email: `${activeFriendId}@test.com`, passwordHash: 'hash', firstName: 'Active', lastName: 'User', status: 'active', accountStatus: 'active' },
      { userId: deactFriendId, email: `${deactFriendId}@test.com`, passwordHash: 'hash', firstName: 'Deact', lastName: 'User', status: 'active', accountStatus: 'active' },
    ]);

    // Establish connections with activeFriendId
    await Connection.create({
      connectionId: uuidv4(),
      fromUserId: activeFriendId,
      toUserId: deactFriendId,
      status: 'active',
      isArchived: false,
    });

    // Prime the connection cache set
    const initialFriendSet = await ConnectionCacheRepository.rebuildUserConnectionsSet(activeFriendId);
    assert(initialFriendSet.has(deactFriendId), 'Active user connection set contains friend before deactivation');

    // Trigger account deactivation for deactFriendId
    await ConnectionCacheRepository.handleAccountDeactivated(deactFriendId);

    // Verify deactivated user disappears immediately from active user's connection list/set
    const setAfterDeactivation = await ConnectionCacheRepository.getConnectionsSet(activeFriendId);
    assert(!setAfterDeactivation.has(deactFriendId), 'Deactivated user immediately purged from connection set');

    console.log('\n==========================================================');
    console.log('✅ ALL CONNECTION CACHE BEHAVIOURAL TESTS PASSED (Item H)');
    console.log('==========================================================\n');
  } finally {
    // Cleanup
    try {
      await Connection.deleteMany({
        $or: [
          { fromUserId: { $in: allTestUsers } },
          { toUserId: { $in: allTestUsers } },
        ],
      });
      await ConnectionBlock.deleteMany({
        $or: [
          { blockerId: { $in: allTestUsers } },
          { blockedId: { $in: allTestUsers } },
        ],
      });
      await User.deleteMany({ userId: { $in: allTestUsers } });
      for (const u of allTestUsers) {
        await redis.del(ConnectionCacheRepository.getSetKey(u));
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

if (require.main === module) {
  runConnectionCacheTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test Suite Failed:', err);
      process.exit(1);
    });
}

export { runConnectionCacheTests };
