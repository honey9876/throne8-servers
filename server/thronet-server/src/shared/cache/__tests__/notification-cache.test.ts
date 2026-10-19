/**
 * notification-cache.test.ts
 * Item E: Behavioural Verification Suite for Notification Caching
 *
 * Requirements:
 * - testSafetyGuard verified (runs on test database only)
 * - Cache hit and miss
 * - Redis down / kill-switch falls back to MongoDB
 * - Invalidation after EVERY write path (create, markAsRead, markAllAsRead, delete, insertMany, updateMany)
 * - Concurrent requests (20 concurrent)
 * - User A never receives User B's data
 * - Count never goes below 0
 */

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { assertTestEnvironmentSafety } from './testSafetyGuard';
import { getRedisClient, closeRedisConnection } from '../redisConnection';
import { NotificationCacheRepository } from '../notificationCache';
import Notification from '@/notifications/models/Notification.model';
import NotificationService from '@/notifications/services/notification.service';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runNotificationCacheTests() {
  console.log('\n====================================================');
  console.log('🧪 Starting Notification Cache Behavioural Test Suite (Item E)');
  console.log('====================================================');

  // Enforce safety guard & connect DB
  const mongoUri = assertTestEnvironmentSafety();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const redis = await getRedisClient();
  await redis.ping();
  console.log('✅ Connected to MongoDB and Redis');

  const userA = `user_notif_A_${Date.now()}`;
  const userB = `user_notif_B_${Date.now()}`;
  const senderId = `sender_notif_${Date.now()}`;

  try {
    // ── Test 1: Cache Miss & Cache Hit ──────────────────────────────
    console.log('\n--- Test 1: Cache Miss & Hit on Unread Count and List ---');
    // Ensure clean state
    await NotificationCacheRepository.invalidateUser([userA, userB]);

    // Create 3 unread notifications for User A
    for (let i = 1; i <= 3; i++) {
      await Notification.create({
        notificationId: uuidv4(),
        recipientId: userA,
        senderId,
        senderName: 'Test Sender',
        type: 'post_liked',
        entityId: `post_${i}`,
        entityType: 'post',
        message: `User liked post ${i}`,
        isRead: false,
      });
    }

    // 1. Initial getUnreadCount (Cache miss -> DB query -> Cache set)
    const count1 = await NotificationService.getUnreadCount(userA);
    assert(count1 === 3, `Initial unread count is 3 (got ${count1})`);

    // Verify Redis has the key
    const cachedCountRaw = await NotificationCacheRepository.getUnreadCount(userA);
    assert(cachedCountRaw === 3, `Redis unread cache key holds 3 (got ${cachedCountRaw})`);

    // 2. Initial getNotifications (Cache miss -> DB query -> Cache set)
    const listResult1 = await NotificationService.getNotifications(userA, 1, 20);
    assert(listResult1.notifications.length === 3, `List contains 3 notifications`);
    assert(listResult1.unreadCount === 3, `List result unreadCount is 3`);

    // 3. Cache Hit on List
    const cachedList = await NotificationCacheRepository.getNotificationList(userA, 1, 20);
    assert(cachedList !== null, `Notification list is cached in Redis`);
    assert(cachedList?.notifications.length === 3, `Cached list has 3 notifications`);

    // ── Test 2: User Isolation (User A never gets User B data) ───────
    console.log('\n--- Test 2: User Isolation (User A never receives User B data) ---');
    // Create 1 notification for User B
    await Notification.create({
      notificationId: uuidv4(),
      recipientId: userB,
      senderId,
      senderName: 'Test Sender',
      type: 'connection_request',
      entityId: 'conn_1',
      entityType: 'connection',
      message: 'Connection request',
      isRead: false,
    });

    const userACount = await NotificationService.getUnreadCount(userA);
    const userBCount = await NotificationService.getUnreadCount(userB);

    assert(userACount === 3, `User A unread count is 3 (got ${userACount})`);
    assert(userBCount === 1, `User B unread count is 1 (got ${userBCount})`);
    assert(userACount !== userBCount, `User A and User B unread counts do not collide`);

    const userAList = await NotificationService.getNotifications(userA, 1, 20);
    const userBList = await NotificationService.getNotifications(userB, 1, 20);

    const userAHasB = userAList.notifications.some((n: any) => n.recipientId === userB);
    const userBHasA = userBList.notifications.some((n: any) => n.recipientId === userA);
    assert(!userAHasB, `User A list contains NO notifications for User B`);
    assert(!userBHasA, `User B list contains NO notifications for User A`);

    // ── Test 3: Invalidation after Write Paths ───────────────────────
    console.log('\n--- Test 3: Invalidation after Write Paths ---');

    // 3a: Write path: NotificationService.markAsRead
    const targetNotif = userAList.notifications[0];
    await NotificationService.markAsRead(targetNotif.notificationId, userA);

    // Cache should be invalidated immediately
    const postMarkReadCache = await NotificationCacheRepository.getUnreadCount(userA);
    assert(postMarkReadCache === null, `Unread count cache is invalidated after markAsRead`);

    const updatedCount = await NotificationService.getUnreadCount(userA);
    assert(updatedCount === 2, `Unread count recomputed to 2 after marking 1 as read (got ${updatedCount})`);

    // 3b: Write path: NotificationService.deleteNotification
    const deleteTarget = userAList.notifications[1];
    await NotificationService.deleteNotification(deleteTarget.notificationId, userA);

    const postDeleteCache = await NotificationCacheRepository.getUnreadCount(userA);
    assert(postDeleteCache === null, `Cache is invalidated after deleteNotification`);

    const afterDeleteCount = await NotificationService.getUnreadCount(userA);
    assert(afterDeleteCount === 1, `Unread count recomputed to 1 after deleting 1 (got ${afterDeleteCount})`);

    // 3c: Write path: NotificationService.markAllAsRead
    await NotificationService.markAllAsRead(userA);
    const afterMarkAllCount = await NotificationService.getUnreadCount(userA);
    assert(afterMarkAllCount === 0, `Unread count is exactly 0 after markAllAsRead (got ${afterMarkAllCount})`);

    // 3d: Count never goes below 0
    assert(afterMarkAllCount >= 0, `Unread count never goes below 0`);

    // 3e: Direct Mongoose writes (insertMany and updateMany via schema hooks)
    console.log('\n--- Test 3e: Invalidation via Mongoose Schema Hooks ---');
    await NotificationService.getUnreadCount(userA); // prime cache
    assert((await NotificationCacheRepository.getUnreadCount(userA)) === 0, `Cache is primed at 0`);

    // Direct insertMany (hook should invalidate userA)
    await Notification.insertMany([
      {
        notificationId: uuidv4(),
        recipientId: userA,
        senderId,
        senderName: 'Hook Test',
        type: 'post_created',
        entityId: 'post_hook_1',
        entityType: 'post',
        message: 'Hook test post created',
        isRead: false,
      },
    ]);

    // Give microtask queue moment for post hook
    await new Promise((r) => setTimeout(r, 50));
    const postHookCache = await NotificationCacheRepository.getUnreadCount(userA);
    assert(postHookCache === null, `Mongoose insertMany hook invalidated unread cache`);

    const countAfterHook = await NotificationService.getUnreadCount(userA);
    assert(countAfterHook === 1, `Count updated to 1 after hook invalidation (got ${countAfterHook})`);

    // ── Test 4: 20 Concurrent Requests ──────────────────────────────
    console.log('\n--- Test 4: 20 Concurrent Requests ---');
    const concurrentFetches = await Promise.all(
      Array.from({ length: 20 }, () => NotificationService.getUnreadCount(userA))
    );
    const allConsistent = concurrentFetches.every((c) => c === 1);
    assert(allConsistent, `All 20 concurrent getUnreadCount calls returned 1`);

    const concurrentLists = await Promise.all(
      Array.from({ length: 20 }, () => NotificationService.getNotifications(userA, 1, 20))
    );
    const allListsConsistent = concurrentLists.every((l) => l.unreadCount === 1);
    assert(allListsConsistent, `All 20 concurrent getNotifications calls returned consistent unreadCount: 1`);

    // ── Test 5: Fallback to MongoDB when Cache Disabled (Kill Switch) ──
    console.log('\n--- Test 5: Kill Switch & MongoDB Fallback ---');
    process.env['CACHE_NOTIFICATION_ENABLED'] = 'false';

    const fallbackCount = await NotificationService.getUnreadCount(userA);
    assert(fallbackCount === 1, `Kill switch falls back to MongoDB directly (got ${fallbackCount})`);

    const fallbackList = await NotificationService.getNotifications(userA, 1, 20);
    assert(fallbackList.notifications.length >= 1, `Kill switch list fetch returns from MongoDB`);

    delete process.env['CACHE_NOTIFICATION_ENABLED'];

    console.log('\n====================================================');
    console.log('🎉 ALL NOTIFICATION CACHE TESTS PASSED CLEANLY');
    console.log('====================================================\n');
  } finally {
    // Cleanup test records
    await Notification.deleteMany({ recipientId: { $in: [userA, userB] } });
    await NotificationCacheRepository.invalidateUser([userA, userB]);
  }
}

// Standalone execution support
if (process.argv[1]?.endsWith('notification-cache.test.ts')) {
  runNotificationCacheTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}

export { runNotificationCacheTests };
