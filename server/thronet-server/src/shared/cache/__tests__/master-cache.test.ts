/**
 * master-cache.test.ts
 * Item M: Behavioural Verification Suite for Master / Reference Data Caching
 *
 * Requirements Tested:
 * 1. testSafetyGuard enabled (must refuse to run unless on test database)
 * 2. Cache hit, miss, and 24h TTL with jitter for all 5 domains (skills, industries, degrees, categories, tags)
 * 3. Admin edits (create, update, delete) immediately visible without waiting for 24h TTL
 * 4. Automatic Mongoose post-save / delete hook invalidation
 * 5. Startup background warm-up routine populates all reference keys
 * 6. Kill switch CACHE_MASTER_ENABLED fallback to MongoDB
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { assertTestEnvironmentSafety } from './testSafetyGuard';
import { getRedisClient } from '../redisConnection';
import { MasterDataCacheRepository, MasterDataService } from '../masterCache';
import MasterData, { MASTER_DATA_TYPES, MasterDataType } from '@/shared/models/MasterData.model';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function runMasterCacheTests() {
  console.log('\n========================================================================');
  console.log('🧪 Starting Master / Reference Data Cache Test Suite (Item M)');
  console.log('========================================================================');

  // Enforce safety guard & connect DB
  const mongoUri = assertTestEnvironmentSafety();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const redis = await getRedisClient();
  await redis.ping();
  console.log('✅ Connected to MongoDB and Redis');

  // Clean existing master cache
  await MasterDataCacheRepository.invalidateAll();

  // --------------------------------------------------------------------------
  // TEST 1: Cache Miss, Populate & 24h TTL with Jitter for All Domains
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 1: Cache Miss, Hit & 24h TTL for All Master Domains ---');
  for (const type of MASTER_DATA_TYPES) {
    // 1a. Cache miss initially
    const initialCache = await MasterDataCacheRepository.getCachedMasterData(type);
    assert(initialCache === null, `Initial cache for "${type}" is null on miss`);

    // 1b. Fetch via service (populates cache from DB/seeds)
    const data = await MasterDataService.getMasterData(type);
    assert(Array.isArray(data) && data.length > 0, `MasterDataService returned items for "${type}" (count: ${data.length})`);

    // 1c. Cache hit on second call
    const cachedData = await MasterDataCacheRepository.getCachedMasterData(type);
    assert(cachedData !== null, `Cache hit returned data for "${type}"`);
    assert(cachedData && cachedData.length === data.length, `Cached item count matches database count for "${type}"`);

    // 1d. Verify 24h TTL with jitter (around 86400s)
    const key = MasterDataCacheRepository.getKey(type);
    const ttl = await redis.ttl(key);
    assert(ttl >= 70000 && ttl <= 100000, `TTL for "${type}" is within 24h jittered range: ${ttl}s`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Admin Create is Visible Immediately (No waiting for TTL)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Admin Create Item Visible Immediately ---');
  // Initial skills in cache
  const initialSkills = await MasterDataService.getMasterData('skills');
  const initialCount = initialSkills.length;

  // Admin adds a brand new skill "Rust"
  const newCode = 'rust_' + Date.now();
  await MasterDataService.createItem({
    type: 'skills',
    code: newCode,
    name: 'Rust Systems Programming',
    category: 'Programming',
  });

  // Verify cache key was invalidated immediately
  const cacheAfterCreate = await MasterDataCacheRepository.getCachedMasterData('skills');
  assert(cacheAfterCreate === null, 'Skills cache was invalidated immediately after admin create');

  // Read immediately: new skill MUST be present
  const updatedSkills = await MasterDataService.getMasterData('skills');
  assert(updatedSkills.length === initialCount + 1, 'Updated skills list contains newly created skill');
  const foundNew = updatedSkills.find((s) => s.code === newCode);
  assert(foundNew && foundNew.name === 'Rust Systems Programming', 'Newly created skill content is visible immediately');

  // --------------------------------------------------------------------------
  // TEST 3: Admin Update is Visible Immediately
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Admin Update Item Visible Immediately ---');
  // Ensure cache is populated
  await MasterDataService.getMasterData('skills');
  assert(await MasterDataCacheRepository.getCachedMasterData('skills') !== null, 'Skills cache is warm before update');

  // Admin updates the skill name
  await MasterDataService.updateItem('skills', newCode, {
    name: 'Advanced Rust Systems',
  });

  // Verify cache was invalidated
  assert(await MasterDataCacheRepository.getCachedMasterData('skills') === null, 'Skills cache was invalidated immediately after admin update');

  // Read immediately: updated name MUST be present
  const skillsAfterUpdate = await MasterDataService.getMasterData('skills');
  const foundUpdated = skillsAfterUpdate.find((s) => s.code === newCode);
  assert(foundUpdated && foundUpdated.name === 'Advanced Rust Systems', 'Updated skill name is visible immediately');

  // --------------------------------------------------------------------------
  // TEST 4: Admin Delete is Visible Immediately
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Admin Delete Item Visible Immediately ---');
  // Ensure cache is populated
  await MasterDataService.getMasterData('skills');

  // Admin deletes the skill
  await MasterDataService.deleteItem('skills', newCode);

  // Verify cache was invalidated
  assert(await MasterDataCacheRepository.getCachedMasterData('skills') === null, 'Skills cache was invalidated immediately after admin delete');

  // Read immediately: deleted skill MUST be gone
  const skillsAfterDelete = await MasterDataService.getMasterData('skills');
  const foundDeleted = skillsAfterDelete.find((s) => s.code === newCode);
  assert(!foundDeleted, 'Deleted skill is completely gone on immediate subsequent read');
  assert(skillsAfterDelete.length === initialCount, 'Skills count returned to initial count after delete');

  // --------------------------------------------------------------------------
  // TEST 5: Mongoose Model Hook Invalidation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Direct Mongoose Model Hook Invalidation ---');
  await MasterDataService.getMasterData('industries');
  assert(await MasterDataCacheRepository.getCachedMasterData('industries') !== null, 'Industries cache is warm');

  const directDoc = new MasterData({
    type: 'industries',
    code: 'space_tech_' + Date.now(),
    name: 'Aerospace & Defense',
    isActive: true,
  });
  await directDoc.save();
  await tick();

  assert(await MasterDataCacheRepository.getCachedMasterData('industries') === null,
    'Direct Mongoose post-save hook successfully invalidated industries cache');

  // 5b: Direct updateOne test - assert master data edit is visible on the very next read
  await MasterDataService.getMasterData('industries');
  assert(await MasterDataCacheRepository.getCachedMasterData('industries') !== null, 'Industries cache warm before updateOne');

  const testCode = 'space_edit_' + Date.now();
  await MasterData.create({
    type: 'industries',
    code: testCode,
    name: 'Old Aerospace Name',
    isActive: true,
  });
  // Repopulate cache
  await MasterDataService.getMasterData('industries');
  assert(await MasterDataCacheRepository.getCachedMasterData('industries') !== null, 'Industries cache warm with test item');

  // Perform updateOne
  await MasterData.updateOne({ type: 'industries', code: testCode }, { $set: { name: 'Brand New Aerospace Name' } });
  await tick();
  assert(await MasterDataCacheRepository.getCachedMasterData('industries') === null, 'updateOne hook invalidated industries cache');

  // Verify edit is visible on the VERY NEXT read
  const nextRead = await MasterDataService.getMasterData('industries');
  const editedItem = nextRead.find((i) => i.code === testCode);
  assert(editedItem && editedItem.name === 'Brand New Aerospace Name', 'Master-data updateOne edit is visible on the very next read');

  // 5c: findOneAndUpdate
  await MasterData.findOneAndUpdate({ type: 'industries', code: testCode }, { $set: { name: 'Updated Via findOneAndUpdate' } });
  await tick();
  assert(await MasterDataCacheRepository.getCachedMasterData('industries') === null, 'findOneAndUpdate hook invalidated industries cache');

  // 5d: insertMany
  const insertManyCode = 'space_batch_' + Date.now();
  await MasterData.insertMany([
    { type: 'industries', code: insertManyCode, name: 'Batch Industry', isActive: true },
  ]);
  await tick();
  assert(await MasterDataCacheRepository.getCachedMasterData('industries') === null, 'insertMany hook invalidated industries cache');

  // 5e: updateMany
  await MasterData.updateMany({ type: 'industries', code: { $in: [testCode, insertManyCode] } }, { $set: { isActive: false } });
  await tick();
  assert(await MasterDataCacheRepository.getCachedMasterData('industries') === null, 'updateMany hook invalidated industries cache');

  // 5f: bulkWrite
  await MasterData.bulkWrite([
    { deleteOne: { filter: { type: 'industries', code: { $in: [testCode, insertManyCode] } } } },
  ]);
  await tick();
  assert(await MasterDataCacheRepository.getCachedMasterData('industries') === null, 'bulkWrite hook invalidated industries cache');

  // --------------------------------------------------------------------------
  // TEST 6: Background Startup Warm-Up Routine
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Background Startup Warm-Up Routine ---');
  // Invalidate all keys
  await MasterDataCacheRepository.invalidateAll();
  for (const type of MASTER_DATA_TYPES) {
    assert(await MasterDataCacheRepository.getCachedMasterData(type) === null, `Key for "${type}" is cleared before warm-up`);
  }

  // Trigger non-blocking warm-up
  await MasterDataCacheRepository.warmUp();

  // Verify all 5 keys are now populated in Redis
  for (const type of MASTER_DATA_TYPES) {
    const cached = await MasterDataCacheRepository.getCachedMasterData(type);
    assert(cached !== null && cached.length > 0, `Key for "${type}" successfully pre-warmed in Redis (items: ${cached?.length})`);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Kill Switch & MongoDB Fallback
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Kill Switch & MongoDB Fallback ---');
  process.env.CACHE_MASTER_ENABLED = 'false';

  const cacheWhenDisabled = await MasterDataCacheRepository.getCachedMasterData('skills');
  assert(cacheWhenDisabled === null, 'Cache returns null when CACHE_MASTER_ENABLED=false');

  const fallbackData = await MasterDataService.getMasterData('skills');
  assert(Array.isArray(fallbackData) && fallbackData.length > 0, 'Service gracefully falls back to MongoDB when cache is disabled');

  // Restore kill switch
  process.env.CACHE_MASTER_ENABLED = 'true';

  console.log('\n========================================================================');
  console.log('✅ ALL MASTER / REFERENCE DATA TESTS PASSED (ITEM M)');
  console.log('========================================================================\n');
}

runMasterCacheTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Master Data Test Suite Failed:', err);
    process.exit(1);
  });
