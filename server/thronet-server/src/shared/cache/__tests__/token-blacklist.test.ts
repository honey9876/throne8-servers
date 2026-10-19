import crypto from 'crypto';
import { getRedisClient, closeRedisConnection } from '../redisConnection';
import CacheUtil from '@/shared/cache.util';
import TokenBlacklistUtil, { hashTokenForBlacklist } from '@/shared/utils/tokenBlacklist.util';
import { AuthCacheRepository } from '@/auth/repository/auth.repository';
import Constants from '@/shared/constants.util';

async function runTokenBlacklistTests() {
  console.log('--- Starting Token Blacklist Hashing & Migration Tests ---');
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

  const fakeJwtAccess = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyMTIzIiwicm9sZSI6InVzZXIiLCJpYXQiOjE2MDAwMDAwMDB9.mocksignatureaccess';
  const fakeJwtRefresh = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyMTIzIiwicm9sZSI6InVzZXIiLCJpYXQiOjE2MDAwMDAwMDB9.mocksignaturerefresh';

  const expectedAccessHash = crypto.createHash('sha256').update(fakeJwtAccess).digest('hex');
  const expectedRefreshHash = crypto.createHash('sha256').update(fakeJwtRefresh).digest('hex');

  // Test 1: Write path uses SHA256, NEVER raw JWT in key
  console.log('\nTest 1: Write path never stores raw JWT in Redis key');
  await TokenBlacklistUtil.blacklistAccessToken(fakeJwtAccess, 'user123', 'logout');
  await TokenBlacklistUtil.blacklistRefreshToken(fakeJwtRefresh, 'user123', 'token_rotation');

  const hashedAccessExists = await CacheUtil.exists(`${Constants.CACHE_PREFIXES.BLACKLIST_ACCESS}${expectedAccessHash}`);
  const rawAccessExists = await CacheUtil.exists(`${Constants.CACHE_PREFIXES.BLACKLIST_ACCESS}${fakeJwtAccess}`);
  assert(hashedAccessExists === true, 'Hashed key blacklist:access:<sha256> exists in cache');
  assert(rawAccessExists === false, 'Raw JWT key blacklist:access:<rawJwt> DOES NOT exist in cache');

  const hashedRefreshExists = await CacheUtil.exists(`${Constants.CACHE_PREFIXES.BLACKLIST_REFRESH}${expectedRefreshHash}`);
  const rawRefreshExists = await CacheUtil.exists(`${Constants.CACHE_PREFIXES.BLACKLIST_REFRESH}${fakeJwtRefresh}`);
  assert(hashedRefreshExists === true, 'Hashed key blacklist:refresh:<sha256> exists in cache');
  assert(rawRefreshExists === false, 'Raw JWT key blacklist:refresh:<rawJwt> DOES NOT exist in cache');

  // Direct Redis scan assertion: ensure raw JWT is nowhere in Redis keyspace
  const rawJwtInRedisKeys = await client.keys(`*${fakeJwtAccess}*`);
  assert(rawJwtInRedisKeys.length === 0, 'Direct Redis scan confirms 0 keys contain raw JWT string');

  // Test 2: Read path finds token via SHA256 key
  console.log('\nTest 2: Read path detects blacklisted token via SHA256');
  const isAccessBlocked = await TokenBlacklistUtil.isAccessTokenBlacklisted(fakeJwtAccess);
  const isRefreshBlocked = await TokenBlacklistUtil.isRefreshTokenBlacklisted(fakeJwtRefresh);
  assert(isAccessBlocked === true, 'TokenBlacklistUtil confirms access token is blacklisted');
  assert(isRefreshBlocked === true, 'TokenBlacklistUtil confirms refresh token is blacklisted');

  // Test 3: Migration Safety Period - Reading legacy raw keys
  console.log('\nTest 3: Migration Safety - Legacy raw keys are still detected');
  const legacyRawAccess = 'eyJhbGciOiJIUzI1NiJ9.legacy_raw_access_token_from_old_version.sig';
  const legacyRawRefresh = 'eyJhbGciOiJIUzI1NiJ9.legacy_raw_refresh_token_from_old_version.sig';

  // Seed Redis with legacy raw key via CacheUtil (simulating key written before this deployment)
  await CacheUtil.set(`${Constants.CACHE_PREFIXES.BLACKLIST_ACCESS}${legacyRawAccess}`, 'true', 60);
  await CacheUtil.set(`${Constants.CACHE_PREFIXES.BLACKLIST_REFRESH}${legacyRawRefresh}`, 'true', 60);

  const isLegacyAccessBlocked = await TokenBlacklistUtil.isAccessTokenBlacklisted(legacyRawAccess);
  const isLegacyRefreshBlocked = await TokenBlacklistUtil.isRefreshTokenBlacklisted(legacyRawRefresh);
  assert(isLegacyAccessBlocked === true, 'Legacy unhashed access token key is detected (migration fallback)');
  assert(isLegacyRefreshBlocked === true, 'Legacy unhashed refresh token key is detected (migration fallback)');

  // Test 4: AuthCacheRepository compatibility
  console.log('\nTest 4: AuthCacheRepository SHA256 check with migration fallback');
  const repoAccessHashed = await AuthCacheRepository.isBlacklisted('access', fakeJwtAccess);
  const repoAccessLegacy = await AuthCacheRepository.isBlacklisted('access', legacyRawAccess);
  assert(repoAccessHashed === true, 'AuthCacheRepository detects hashed access token');
  assert(repoAccessLegacy === true, 'AuthCacheRepository detects legacy raw access token');

  // Test 5: Clean token (not blacklisted)
  console.log('\nTest 5: Non-blacklisted token returns false');
  const cleanToken = 'eyJhbGciOiJIUzI1NiJ9.clean_unblacklisted_token.sig';
  const isCleanBlocked = await TokenBlacklistUtil.isAccessTokenBlacklisted(cleanToken);
  assert(isCleanBlocked === false, 'Clean token is not blacklisted');

  // Test 6: Removal from blacklist removes both keys
  console.log('\nTest 6: Remove from blacklist removes both keys');
  await TokenBlacklistUtil.removeFromBlacklist(fakeJwtAccess, 'access');
  await TokenBlacklistUtil.removeFromBlacklist(legacyRawAccess, 'access');
  const accessAfterRemove = await TokenBlacklistUtil.isAccessTokenBlacklisted(fakeJwtAccess);
  const legacyAfterRemove = await TokenBlacklistUtil.isAccessTokenBlacklisted(legacyRawAccess);
  assert(accessAfterRemove === false, 'Removed hashed token is no longer blacklisted');
  assert(legacyAfterRemove === false, 'Removed legacy token is no longer blacklisted');

  // Test 7: BLACKLIST_LEGACY_RAW_KEYS_ENABLED env flag toggling
  console.log('\nTest 7: BLACKLIST_LEGACY_RAW_KEYS_ENABLED env flag controls legacy check');
  const tempLegacyToken = 'eyJhbGciOiJIUzI1NiJ9.legacy_token_for_flag_test.sig';
  await CacheUtil.set(`${Constants.CACHE_PREFIXES.BLACKLIST_ACCESS}${tempLegacyToken}`, 'true', 60);

  // Default / true: legacy token is recognized
  process.env['BLACKLIST_LEGACY_RAW_KEYS_ENABLED'] = 'true';
  const blockedWhenFlagTrue = await TokenBlacklistUtil.isAccessTokenBlacklisted(tempLegacyToken);
  const repoBlockedWhenFlagTrue = await AuthCacheRepository.isBlacklisted('access', tempLegacyToken);
  assert(blockedWhenFlagTrue === true, 'Legacy key detected when BLACKLIST_LEGACY_RAW_KEYS_ENABLED=true');
  assert(repoBlockedWhenFlagTrue === true, 'AuthCacheRepository detects legacy key when flag=true');

  // Flag disabled: legacy raw key is IGNORED (only SHA256 accepted)
  process.env['BLACKLIST_LEGACY_RAW_KEYS_ENABLED'] = 'false';
  const blockedWhenFlagFalse = await TokenBlacklistUtil.isAccessTokenBlacklisted(tempLegacyToken);
  const repoBlockedWhenFlagFalse = await AuthCacheRepository.isBlacklisted('access', tempLegacyToken);
  assert(blockedWhenFlagFalse === false, 'Legacy key IGNORED when BLACKLIST_LEGACY_RAW_KEYS_ENABLED=false');
  assert(repoBlockedWhenFlagFalse === false, 'AuthCacheRepository ignores legacy key when flag=false');

  // Reset flag
  delete process.env['BLACKLIST_LEGACY_RAW_KEYS_ENABLED'];
  await CacheUtil.del(`${Constants.CACHE_PREFIXES.BLACKLIST_ACCESS}${tempLegacyToken}`);

  // Cleanup
  await CacheUtil.del(`${Constants.CACHE_PREFIXES.BLACKLIST_REFRESH}${expectedRefreshHash}`);
  await CacheUtil.del(`${Constants.CACHE_PREFIXES.BLACKLIST_REFRESH}${legacyRawRefresh}`);

  await closeRedisConnection();

  console.log(`\n========================================`);
  console.log(`Total Passed: ${passed}, Total Failed: ${failed}`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTokenBlacklistTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
