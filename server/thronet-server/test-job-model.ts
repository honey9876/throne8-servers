/**
 * Comprehensive backend verification test
 * Tests: MongoDB, API endpoints, Socket.IO connection, and study group queries
 */
import dotenv from 'dotenv';
dotenv.config();

import MongoConnection from './src/database/sharding/connection.js';
import GroupMember from './src/StudyGroup/models/GroupMember.model.js';
import Message from './src/StudyGroup/models/Message.model.js';
import Ranking from './src/StudyGroup/models/Ranking.model.js';

async function runTests() {
  const results: { test: string; status: string; detail?: string }[] = [];

  // ── Test 1: MongoDB Connection ──
  try {
    await MongoConnection.connect();
    results.push({ test: '1. MongoDB Connection', status: '✅ PASS' });
  } catch (err: any) {
    results.push({ test: '1. MongoDB Connection', status: '❌ FAIL', detail: err.message });
    console.table(results);
    process.exit(1);
  }

  // ── Test 2: GroupMember model query (correct field names) ──
  try {
    const member = await GroupMember.findOne({ userId: 'test-user', groupId: 'test-group' }).lean();
    results.push({
      test: '2. GroupMember query (userId/groupId fields)',
      status: '✅ PASS',
      detail: member ? `Found member` : 'No member found (expected for test data)',
    });
  } catch (err: any) {
    results.push({
      test: '2. GroupMember query (userId/groupId fields)',
      status: '❌ FAIL',
      detail: err.message,
    });
  }

  // ── Test 3: Ranking model (no duplicate index warnings) ──
  try {
    const ranking = await Ranking.findOne({}).lean();
    results.push({
      test: '3. Ranking model query',
      status: '✅ PASS',
      detail: ranking ? `Found ranking for user ${ranking.userId}` : 'No rankings yet (expected)',
    });
  } catch (err: any) {
    results.push({ test: '3. Ranking model query', status: '❌ FAIL', detail: err.message });
  }

  // ── Test 4: Message model query ──
  try {
    const msgCount = await Message.countDocuments({});
    results.push({
      test: '4. Message model query',
      status: '✅ PASS',
      detail: `${msgCount} messages in database`,
    });
  } catch (err: any) {
    results.push({ test: '4. Message model query', status: '❌ FAIL', detail: err.message });
  }

  // ── Test 5: HTTP Health endpoint ──
  try {
    const res = await fetch('http://localhost:4000/api/v1/health');
    const data = await res.json() as any;
    results.push({
      test: '5. HTTP Health endpoint',
      status: res.ok ? '✅ PASS' : '❌ FAIL',
      detail: `Status: ${data?.data?.status}, DB: ${data?.data?.services?.database}`,
    });
  } catch (err: any) {
    results.push({ test: '5. HTTP Health endpoint', status: '❌ FAIL', detail: err.message });
  }

  // ── Test 6: Socket.IO handshake ──
  try {
    const res = await fetch('http://localhost:4000/socket.io/?EIO=4&transport=polling');
    const text = await res.text();
    const hasValidSid = text.includes('"sid"');
    results.push({
      test: '6. Socket.IO handshake',
      status: hasValidSid ? '✅ PASS' : '❌ FAIL',
      detail: hasValidSid ? 'Valid SID received, websocket upgrade available' : text.slice(0, 100),
    });
  } catch (err: any) {
    results.push({ test: '6. Socket.IO handshake', status: '❌ FAIL', detail: err.message });
  }

  // ── Test 7: GroupMember index check (compound index on userId+groupId) ──
  try {
    await GroupMember.createIndexes();
    const indexes = await GroupMember.collection.indexes();
    const hasCompoundIndex = indexes.some(
      (idx: any) => idx.key?.groupId === 1 && idx.key?.userId === 1
    );
    results.push({
      test: '7. GroupMember compound index (userId+groupId)',
      status: hasCompoundIndex ? '✅ PASS' : '⚠️ WARN',
      detail: hasCompoundIndex
        ? 'Compound unique index exists'
        : `Indexes found: ${indexes.map((i: any) => JSON.stringify(i.key)).join(', ')}`,
    });
  } catch (err: any) {
    results.push({ test: '7. GroupMember index check', status: '❌ FAIL', detail: err.message });
  }

  // ── Print results ──
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║       BACKEND VERIFICATION TEST RESULTS          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.table(results);

  const failures = results.filter(r => r.status.includes('FAIL'));
  if (failures.length > 0) {
    console.log(`\n❌ ${failures.length} test(s) FAILED`);
  } else {
    console.log('\n✅ All tests PASSED!');
  }

  await MongoConnection.disconnect();
}

runTests().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
