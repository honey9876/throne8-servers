import {
  getCachedAuthUser,
  setCachedAuthUser,
  invalidateUserAuthCache,
  acquireSessionActivityGuard,
  isSessionValidCached,
  setSessionValidCached,
  invalidateSessionCache,
  invalidateAllAuthUserCacheByScan,
  invalidateAllSessionCacheByScan,
  CachedAuthUser,
} from '../authCache';
import { buildKey } from '../cacheHelper';
import { getRedisClient, closeRedisConnection } from '../redisConnection';

async function runAuthCacheTests() {
  console.log('--- Starting Auth Cache & Session Optimization Tests ---');
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

  const client = getRedisClient();
  await client.ping();

  // Test 1: User Auth Cache Miss & Hit
  console.log('\nTest 1: User Auth Cache Miss & Hit');
  const user1Id = `test_u1_${Date.now()}`;
  const missResult = await getCachedAuthUser(user1Id);
  assert(missResult === null, 'Cache miss returns null');

  const mockUser: CachedAuthUser = {
    _id: '507f1f77bcf86cd799439011',
    userId: user1Id,
    email: 'user1@example.com',
    role: 'user',
    status: 'active',
    accountStatus: 'active',
    region: 'in',
  };
  await setCachedAuthUser(user1Id, mockUser);

  const hitResult = await getCachedAuthUser(user1Id);
  assert(hitResult !== null, 'Cache hit returns object');
  assert(hitResult?.userId === user1Id, 'Cached userId matches');
  assert(hitResult?.email === 'user1@example.com', 'Cached email matches');
  assert(hitResult?.role === 'user', 'Cached role matches');

  // Test 2: User A vs User B Isolation
  console.log('\nTest 2: User Isolation (User A never gets User B data)');
  const user2Id = `test_u2_${Date.now()}`;
  const mockUser2: CachedAuthUser = {
    _id: '507f1f77bcf86cd799439022',
    userId: user2Id,
    email: 'admin@example.com',
    role: 'admin',
    status: 'active',
  };
  await setCachedAuthUser(user2Id, mockUser2);

  const hitU1 = await getCachedAuthUser(user1Id);
  const hitU2 = await getCachedAuthUser(user2Id);
  assert(hitU1?.role === 'user' && hitU1?.userId === user1Id, 'User 1 gets User 1 data');
  assert(hitU2?.role === 'admin' && hitU2?.userId === user2Id, 'User 2 gets User 2 data');
  assert(hitU1?.email !== hitU2?.email, 'User 1 and User 2 data do not collide');

  // Test 3: Sensitive Data Stripping
  console.log('\nTest 3: Sensitive Data Stripping');
  const userWithSecrets: any = {
    ...mockUser,
    userId: `test_secrets_${Date.now()}`,
    passwordHash: '$2b$12$super_secret_hash',
    tokens: ['token1', 'token2'],
    otp: '123456',
  };
  await setCachedAuthUser(userWithSecrets.userId, userWithSecrets);
  const cleanResult: any = await getCachedAuthUser(userWithSecrets.userId);
  assert(cleanResult?.passwordHash === undefined, 'passwordHash is not present in cached data');
  assert(cleanResult?.tokens === undefined, 'tokens are not present in cached data');
  assert(cleanResult?.otp === undefined, 'otp is not present in cached data');

  // Test 4: Immediate Invalidation
  console.log('\nTest 4: Invalidation after write path');
  await invalidateUserAuthCache(user1Id);
  const afterInvalidate = await getCachedAuthUser(user1Id);
  assert(afterInvalidate === null, 'Cache is null after invalidation');

  // Test 5: Session Activity Debounce Guard (SET NX EX)
  console.log('\nTest 5: Session Activity Write Debouncing');
  const sessionId = `sess_${Date.now()}`;
  const firstAcquire = await acquireSessionActivityGuard(sessionId, 60);
  assert(firstAcquire === true, 'First session activity check acquires guard (DB write allowed)');

  const secondAcquire = await acquireSessionActivityGuard(sessionId, 60);
  assert(secondAcquire === false, 'Second session activity check is debounced (DB write skipped)');

  // Test 6: Concurrent Session Debounce (20 simultaneous requests)
  console.log('\nTest 6: Concurrent Session Debounce (20 simultaneous requests)');
  const concurrentSessionId = `sess_conc_${Date.now()}`;
  const acquirePromises = Array.from({ length: 20 }, () =>
    acquireSessionActivityGuard(concurrentSessionId, 60)
  );
  const results = await Promise.all(acquirePromises);
  const acquiredCount = results.filter((r) => r === true).length;
  const debouncedCount = results.filter((r) => r === false).length;
  assert(acquiredCount === 1, `Exactly 1 concurrent request acquires guard (got ${acquiredCount})`);
  assert(debouncedCount === 19, `Remaining 19 concurrent requests are debounced (got ${debouncedCount})`);

  // Test 7: Session Validity Caching & Invalidation (60s default TTL)
  console.log('\nTest 7: Session Validity Caching & Invalidation (60s default TTL)');
  await setSessionValidCached(sessionId, true); // No TTL passed: must default to 60s
  const validKey = buildKey('auth_session', `valid:${sessionId}`);
  const ttl = await client.ttl(validKey);
  assert(ttl > 0 && ttl <= 66, `Session validity TTL defaults to 60s with jitter (got ${ttl}s)`);

  const validStatus = await isSessionValidCached(sessionId);
  assert(validStatus === true, 'Session validity returns true');

  await invalidateSessionCache(sessionId);
  const afterSessionInvalidate = await isSessionValidCached(sessionId);
  assert(afterSessionInvalidate === null, 'Session validity returns null after invalidation');

  const reacquireAfterInvalidate = await acquireSessionActivityGuard(sessionId, 60);
  assert(reacquireAfterInvalidate === true, 'Guard re-acquired immediately after invalidation');

  // Test 8: Kill Switch Guard
  console.log('\nTest 8: Kill Switch Guard (CACHE_AUTH_USER_ENABLED / CACHE_AUTH_SESSION_ENABLED)');
  process.env['CACHE_AUTH_USER_ENABLED'] = 'false';
  const killSwitchUser = await getCachedAuthUser(user2Id);
  assert(killSwitchUser === null, 'User cache returns null when CACHE_AUTH_USER_ENABLED=false');
  process.env['CACHE_AUTH_USER_ENABLED'] = 'true';

  process.env['CACHE_AUTH_SESSION_ENABLED'] = 'false';
  const killSwitchGuard = await acquireSessionActivityGuard(`sess_kill_${Date.now()}`);
  assert(killSwitchGuard === true, 'Activity guard returns true (fail-open to DB) when CACHE_AUTH_SESSION_ENABLED=false');
  process.env['CACHE_AUTH_SESSION_ENABLED'] = 'true';

  // Test 9: Bulk Write SCAN Invalidation (updateMany/bulkWrite without single userId)
  console.log('\nTest 9: Bulk Write SCAN Invalidation');
  const bulkU1 = `bulk_u1_${Date.now()}`;
  const bulkU2 = `bulk_u2_${Date.now()}`;
  await setCachedAuthUser(bulkU1, { ...mockUser, userId: bulkU1 });
  await setCachedAuthUser(bulkU2, { ...mockUser, userId: bulkU2 });

  const bulkS1 = `bulk_s1_${Date.now()}`;
  const bulkS2 = `bulk_s2_${Date.now()}`;
  await setSessionValidCached(bulkS1, true);
  await setSessionValidCached(bulkS2, true);

  assert((await getCachedAuthUser(bulkU1)) !== null, 'Bulk user 1 cached before SCAN');
  assert((await isSessionValidCached(bulkS1)) === true, 'Bulk session 1 valid before SCAN');

  await invalidateAllAuthUserCacheByScan();
  await invalidateAllSessionCacheByScan();

  assert((await getCachedAuthUser(bulkU1)) === null, 'Bulk user 1 cleared by SCAN invalidation');
  assert((await getCachedAuthUser(bulkU2)) === null, 'Bulk user 2 cleared by SCAN invalidation');
  assert((await isSessionValidCached(bulkS1)) === null, 'Bulk session 1 cleared by SCAN invalidation');
  assert((await isSessionValidCached(bulkS2)) === null, 'Bulk session 2 cleared by SCAN invalidation');

  // Cleanup
  await invalidateUserAuthCache(user2Id);
  await invalidateUserAuthCache(userWithSecrets.userId);
  await invalidateSessionCache(sessionId);
  await invalidateSessionCache(concurrentSessionId);

  await closeRedisConnection();

  console.log(`\n========================================`);
  console.log(`Total Passed: ${passed}, Total Failed: ${failed}`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAuthCacheTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
