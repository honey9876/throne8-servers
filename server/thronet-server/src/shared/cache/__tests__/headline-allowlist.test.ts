/**
 * headline-allowlist.test.ts
 * Verifies that HeadlineService.updateHeadline strictly enforces ALLOWED_UPDATE_FIELDS.
 * Asserts that client attempts to send version, status, flags, metadata, or type are ignored.
 */

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { assertTestEnvironmentSafety } from './testSafetyGuard';
import HeadlineService from '@/Profile/services/headline.service';
import Headline from '@/Profile/models/headline.model';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runHeadlineAllowlistTests() {
  console.log('\n============================================================');
  console.log('🧪 Starting Headline Update Allowlist Verification Test');
  console.log('============================================================');

  const mongoUri = assertTestEnvironmentSafety();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const headlineId = uuidv4();
  const userId = uuidv4();

  // 1. Seed initial headline
  const initial = await Headline.create({
    headlineId,
    type: 'dashboard',
    title: 'Original Title',
    message: 'Original Message',
    priority: 'MEDIUM',
    status: 'ACTIVE',
    audience: { type: 'ALL' },
    scheduling: { timezone: 'UTC', isRecurring: false },
    styling: {},
    flags: {
      isDismissible: true,
      isSticky: false,
      requiresAction: false,
      isDeleted: false,
    },
    metadata: {
      createdBy: userId,
      createdByName: 'Test Creator',
      version: 1,
      viewCount: 0,
      clickCount: 0,
      dismissCount: 0,
    },
  });

  assert(initial.title === 'Original Title', 'Initial headline seeded');
  assert(initial.metadata.version === 1, 'Initial version is 1');
  assert(initial.status === 'ACTIVE', 'Initial status is ACTIVE');

  // 2. Client calls updateHeadline sending prohibited fields:
  // version, status, flags, metadata, type
  const clientPayload: any = {
    title: 'Legitimate Updated Title',
    message: 'Legitimate Updated Message',
    // Prohibited fields client must never set:
    version: 999,
    status: 'EXPIRED',
    type: 'announcement',
    flags: {
      isDeleted: true,
      isSticky: true,
    },
    metadata: {
      version: 999,
      createdBy: 'malicious_user',
    },
  };

  const updated = await HeadlineService.updateHeadline(
    headlineId,
    clientPayload,
    'admin_user_id',
    'Admin User'
  );

  // 3. Verify allowed fields were updated
  assert(updated.title === 'Legitimate Updated Title', 'Allowed field "title" was updated');
  assert(updated.message === 'Legitimate Updated Message', 'Allowed field "message" was updated');

  // 4. Verify prohibited fields were IGNORED
  assert(updated.type === 'dashboard', 'Client "type" was ignored (remains "dashboard")');
  assert(updated.status === 'ACTIVE', 'Client "status" was ignored (remains "ACTIVE")');
  assert(updated.flags.isDeleted === false, 'Client "flags.isDeleted" was ignored (remains false)');
  assert(updated.flags.isSticky === false, 'Client "flags.isSticky" was ignored (remains false)');

  // 5. Verify service computed version increment
  assert(updated.metadata.version === 2, 'Version was incremented by service from 1 -> 2 (client 999 was ignored)');
  assert(updated.metadata.lastModifiedBy === 'admin_user_id', 'lastModifiedBy set by service');

  // 6. Direct database reload check
  const fromDb = await Headline.findOne({ headlineId }).lean();
  assert(fromDb?.type === 'dashboard', 'DB reload confirms type remains dashboard');
  assert(fromDb?.status === 'ACTIVE', 'DB reload confirms status remains ACTIVE');
  assert(fromDb?.flags?.isDeleted === false, 'DB reload confirms isDeleted remains false');
  assert(fromDb?.metadata?.version === 2, 'DB reload confirms version is 2');

  // Cleanup
  await Headline.deleteOne({ headlineId });
  await mongoose.disconnect();

  console.log('\n============================================================');
  console.log('✅ ALL HEADLINE ALLOWLIST TESTS PASSED (100% SUCCESS)');
  console.log('============================================================\n');
}

runHeadlineAllowlistTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error in headline allowlist tests:', err);
    process.exit(1);
  });
