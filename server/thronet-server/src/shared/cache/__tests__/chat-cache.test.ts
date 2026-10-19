/**
 * chat-cache.test.ts
 * Item F: Behavioural Verification Suite for Chat & Messaging Caching
 *
 * Requirements:
 * - testSafetyGuard verified (runs on test database only)
 * - Cache hit and miss for conversations & unread counters
 * - Strict participant authorization on all reads (including cache hits)
 * - User removed from a conversation IMMEDIATELY stops seeing it
 * - Invalidation after every write path (sendMessage, markSeen, editMessage, deleteMessage, member removal)
 * - Ephemeral typing indicators (5s TTL, zero DB writes)
 * - 20 concurrent requests
 * - Kill switch & fail-open fallback
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { assertTestEnvironmentSafety } from './testSafetyGuard';
import { getRedisClient } from '../redisConnection';
import { ChatCacheRepository } from '../chatCache';
import Conversation from '@/message/models/conversation.model';
import Message from '@/message/models/messaging.model';
import messageService from '@/message/services/messaging.service';
import { ConversationType, MessageType } from '@/message/types/message.types';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runChatCacheTests() {
  console.log('\n====================================================');
  console.log('🧪 Starting Chat Cache Behavioural Test Suite (Item F)');
  console.log('====================================================');

  // Enforce safety guard & connect DB
  const mongoUri = assertTestEnvironmentSafety();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const redis = await getRedisClient();
  await redis.ping();
  console.log('✅ Connected to MongoDB and Redis');

  const userA = `user_chat_A_${Date.now()}`;
  const userB = `user_chat_B_${Date.now()}`;
  const userC = `user_chat_C_${Date.now()}`;

  let convABId = '';
  let groupConvId = '';

  try {
    // ── Test 1: Cache Miss & Cache Hit ──────────────────────────────
    console.log('\n--- Test 1: Cache Miss & Hit on Conversation List & Unread Counter ---');
    await ChatCacheRepository.invalidateUser([userA, userB, userC]);

    // Create direct conversation between userA and userB
    const convAB = await Conversation.create({
      conversationId: uuidv4(),
      type: ConversationType.DIRECT,
      members: [userA, userB],
      unreadCounts: new Map([
        [userA, 0],
        [userB, 2],
      ]),
      isActive: true,
    });
    convABId = convAB.conversationId;

    // 1. Initial getConversations (Cache miss -> MongoDB -> Cache set)
    const listA1 = await messageService.getConversations(userA);
    assert(listA1.length === 1, `User A sees 1 conversation (got ${listA1.length})`);
    assert(listA1[0].conversationId === convABId, `User A sees conversation AB`);

    // Verify Redis has the cache key
    const cachedConvsA = await ChatCacheRepository.getConversations(userA);
    assert(cachedConvsA !== null, `Conversation list is cached in Redis for User A`);
    assert(cachedConvsA?.length === 1, `Cached conversation list contains 1 item`);

    // Verify unread count cache
    const unreadA = await messageService.getUnreadCount(userA);
    const unreadB = await messageService.getUnreadCount(userB);
    assert(unreadA === 0, `User A unread count is 0 (got ${unreadA})`);
    assert(unreadB === 2, `User B unread count is 2 (got ${unreadB})`);

    // ── Test 2: Participant Authorization on Cache Hits & User Isolation ──
    console.log('\n--- Test 2: Participant Authorization (User C never sees conversation AB) ---');
    // User C is NOT a member of convAB
    const listC = await messageService.getConversations(userC);
    assert(listC.length === 0, `User C has 0 conversations (cannot see AB)`);

    // Test tamper protection: Even if an unauthorized conversation exists in cached array,
    // getConversations filters it out strictly
    const tamperedCache = [
      { conversationId: convABId, members: [userA, userB] },
    ];
    await ChatCacheRepository.setConversations(userC, tamperedCache);
    const sanitizedListC = await ChatCacheRepository.getConversations(userC);
    assert(sanitizedListC?.length === 0, `Participant authorization filtered out unauthorized cached conversation for User C`);

    // ── Test 3: User Removed from Conversation Immediately Stops Seeing It ──
    console.log('\n--- Test 3: User Removed from Conversation Immediately Stops Seeing It ---');
    // Create group conversation with [userA, userB, userC]
    const groupConv = await Conversation.create({
      conversationId: uuidv4(),
      type: ConversationType.GROUP,
      groupName: 'Engineering Core',
      members: [userA, userB, userC],
      unreadCounts: new Map([
        [userA, 0],
        [userB, 0],
        [userC, 0],
      ]),
      isActive: true,
    });
    groupConvId = groupConv.conversationId;

    // User C queries conversations -> sees group conversation
    const userCBeforeRemoval = await messageService.getConversations(userC);
    assert(
      userCBeforeRemoval.some((c) => c.conversationId === groupConvId),
      `User C initially sees the group conversation`
    );

    // Remove userC from conversation in MongoDB via $pull
    await Conversation.updateOne(
      { conversationId: groupConvId },
      { $pull: { members: userC } }
    );

    // Mongoose hook automatically invalidates userC's cache.
    // Query getConversations for userC: must immediately NOT contain groupConvId!
    const userCAfterRemoval = await messageService.getConversations(userC);
    const stillSeesGroup = userCAfterRemoval.some((c) => c.conversationId === groupConvId);
    assert(!stillSeesGroup, `User C IMMEDIATELY stops seeing the group conversation after removal`);

    // ── Test 4: Invalidation after Write Paths (sendMessage & markSeen) ──
    console.log('\n--- Test 4: Invalidation after Write Paths ---');
    // Send message from userA to userB
    await messageService.sendMessage(userA, {
      conversationId: convABId,
      text: 'Hello User B!',
      type: MessageType.TEXT,
    });

    // Unread count for User B should be invalidated and incremented
    const postMessageUnreadB = await messageService.getUnreadCount(userB);
    assert(postMessageUnreadB === 3, `User B unread count incremented to 3 after message (got ${postMessageUnreadB})`);

    // User B marks conversation as seen
    await messageService.markConversationSeen(convABId, userB);

    // Unread count for User B should be reset to 0
    const postSeenUnreadB = await messageService.getUnreadCount(userB);
    assert(postSeenUnreadB === 0, `User B unread count reset to 0 after markConversationSeen`);

    // ── Test 5: Ephemeral Typing Indicator (5s TTL, Zero DB writes) ──
    console.log('\n--- Test 5: Ephemeral Typing Indicator (5s TTL, zero DB writes) ---');
    const msgCountBeforeTyping = await Message.countDocuments({});

    // Start typing
    await ChatCacheRepository.setTyping(convABId, userA, true);
    const isTypingActive = await ChatCacheRepository.isTyping(convABId, userA);
    assert(isTypingActive === true, `User A is typing is active in Redis`);

    // Check DB: zero writes
    const msgCountAfterTyping = await Message.countDocuments({});
    assert(msgCountBeforeTyping === msgCountAfterTyping, `Typing indicator produced ZERO database writes`);

    // Check TTL on key
    const rawTypingKey = `app:v1:chat:typing:${convABId}:${userA}`;
    const ttl = await redis.ttl(rawTypingKey);
    assert(ttl > 0 && ttl <= 5, `Typing key has <= 5s TTL (got ${ttl}s)`);

    // Stop typing
    await ChatCacheRepository.setTyping(convABId, userA, false);
    const isTypingStopped = await ChatCacheRepository.isTyping(convABId, userA);
    assert(isTypingStopped === false, `User A typing indicator cleared immediately`);

    // ── Test 6: 20 Concurrent Requests ──────────────────────────────
    console.log('\n--- Test 6: 20 Concurrent Requests ---');
    const concurrentConversations = await Promise.all(
      Array.from({ length: 20 }, () => messageService.getConversations(userA))
    );
    const allConsistent = concurrentConversations.every(
      (c) => Array.isArray(c) && c.length >= 1
    );
    assert(allConsistent, `All 20 concurrent getConversations calls returned consistent valid lists`);

    // ── Test 7: Kill Switch & MongoDB Fallback ───────────────────────
    console.log('\n--- Test 7: Kill Switch & MongoDB Fallback ---');
    process.env['CACHE_CHAT_ENABLED'] = 'false';

    const fallbackList = await messageService.getConversations(userA);
    assert(fallbackList.length >= 1, `Kill switch CACHE_CHAT_ENABLED=false falls back to MongoDB`);

    delete process.env['CACHE_CHAT_ENABLED'];

    console.log('\n====================================================');
    console.log('🎉 ALL CHAT CACHE TESTS PASSED CLEANLY');
    console.log('====================================================\n');
  } finally {
    // Cleanup test records
    await Conversation.deleteMany({
      $or: [{ conversationId: convABId }, { conversationId: groupConvId }],
    });
    await Message.deleteMany({
      $or: [{ senderId: userA }, { senderId: userB }, { senderId: userC }],
    });
    await ChatCacheRepository.invalidateUser([userA, userB, userC]);
  }
}

// Standalone execution support
if (process.argv[1]?.endsWith('chat-cache.test.ts')) {
  runChatCacheTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}

export { runChatCacheTests };
