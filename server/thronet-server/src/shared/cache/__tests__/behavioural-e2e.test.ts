/**
 * behavioural-e2e.test.ts
 * End-to-end behavioural tests for:
 * 1. Ban user in DB -> subsequent request with valid JWT gets 401 immediately (pre-hook + cache bust).
 * 2. Logout -> token is blacklisted and rejected with 401.
 * 3. Redis down during OTP enqueue -> fallback to direct send delivers email.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import express, { Request, Response } from 'express';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
process.env['NODE_ENV'] = 'test';
process.env['MONGODB_TEST_URI'] = process.env['TEST_MONGO_URI'] || 'mongodb://127.0.0.1:27017/thronet_test';
process.env['MONGODB_URI'] = process.env['TEST_MONGO_URI'] || 'mongodb://127.0.0.1:27017/thronet_test';
process.env['REDIS_HOST'] = '127.0.0.1';

import User from '@/auth/models/User.model';
import Session from '@/auth/models/Session.model';
import AuthMiddleware, { authenticateJWT } from '@/shared/middlewares/auth.middleware';
import TokenBlacklistUtil from '@/shared/utils/tokenBlacklist.util';
import { AuthCacheRepository } from '@/auth/repository/auth.repository';
import { getCachedAuthUser, setCachedAuthUser } from '@/shared/cache/authCache';
import { getRedisClient, closeRedisConnection } from '@/shared/cache/redisConnection';
import { enqueueEmail, getEmailQueue, closeEmailQueue } from '@/shared/queues/email.queue';
import NotificationService from '@/auth/services/notification.service';
import { assertTestEnvironmentSafety } from './testSafetyGuard';

async function runBehaviouralTests() {
  console.log('====================================================');
  console.log('🧪 Starting End-to-End Behavioural Test Suite (Item 6)');
  console.log('====================================================');

  const targetMongoUri = assertTestEnvironmentSafety();
  await mongoose.connect(targetMongoUri);
  console.log(`✅ Connected to MongoDB`);

  const redis = getRedisClient();
  await redis.ping();
  console.log('✅ Connected to Redis');

  // Setup express test server with authenticateJWT
  const app = express();
  app.use(express.json());
  app.get('/api/protected', authenticateJWT, (req: Request, res: Response) => {
    res.status(200).json({ success: true, user: (req as any).user });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✅ HTTP Test Server listening on ${baseUrl}`);

  const testUserId = `test_user_e2e_${Date.now()}`;
  const testEmail = `e2e_${Date.now()}@example.com`;
  const jwtSecret = process.env.JWT_SECRET || 'test_jwt_secret_key_1234567890';
  process.env.JWT_SECRET = jwtSecret;

  try {
    // -------------------------------------------------------------
    // Test 6a: Ban a user in DB -> subsequent request with valid JWT gets 401 immediately
    // -------------------------------------------------------------
    console.log('\n--- Test 6a: Ban user in DB -> subsequent request with valid JWT gets 401 immediately ---');

    // 1. Create active user in DB
    const dbUser = await User.create({
      userId: testUserId,
      email: testEmail,
      firstName: 'Test',
      username: `user_${Date.now()}`,
      status: 'active',
      role: 'user',
      passwordHash: 'dummy_hash',
    });

    // 2. Generate valid JWT access token
    const token = User.generateAccessToken({
      userId: testUserId,
      role: 'user',
    });

    // 3. First request: verify 200 OK and cache gets populated
    const res1 = await fetch(`${baseUrl}/api/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body1 = await res1.json() as any;
    assert.strictEqual(res1.status, 200, `Expected 200 for active user, got ${res1.status}`);
    assert.strictEqual(body1.success, true);
    console.log('  [PASS] Initial authenticated request succeeded (HTTP 200)');

    // Verify user is now cached in Redis
    const cachedBeforeBan = await getCachedAuthUser(testUserId);
    assert.notStrictEqual(cachedBeforeBan, null, 'User must be cached in Redis after first request');
    assert.strictEqual(cachedBeforeBan?.status, 'active');
    console.log('  [PASS] User authentication state verified in Redis cache');

    // 4. Ban user in DB (triggers Mongoose pre-hook + post-hook)
    await User.updateOne({ userId: testUserId }, { $set: { status: 'banned' } });

    // Verify pre-hook busted the cache
    const cachedAfterBan = await getCachedAuthUser(testUserId);
    assert.strictEqual(cachedAfterBan, null, 'Redis auth cache must be busted immediately by pre/post-hook');
    console.log('  [PASS] Mongoose mutation hook busted Redis auth cache immediately');

    // 5. Subsequent request with the SAME valid JWT: must receive 401 immediately!
    const res2 = await fetch(`${baseUrl}/api/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(res2.status, 401, `Expected 401 for banned user, got ${res2.status}`);
    console.log('  [PASS] Subsequent request with valid JWT rejected immediately with HTTP 401');

    // -------------------------------------------------------------
    // Test 6b: Log out -> assert token is rejected (blacklisted / session deleted)
    // -------------------------------------------------------------
    console.log('\n--- Test 6b: Logout -> token is rejected (blacklisted / session terminated) ---');

    // Unban user for logout test
    await User.updateOne({ userId: testUserId }, { $set: { status: 'active' } });

    // Verify token works again once user is active
    const resActive = await fetch(`${baseUrl}/api/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(resActive.status, 200, 'Token works when user is active');
    console.log('  [PASS] Token authenticated successfully before logout');

    // Perform logout: blacklist access token via AuthCacheRepository / TokenBlacklistUtil
    await AuthCacheRepository.blacklistAccessToken(token);
    const isBlacklisted = await TokenBlacklistUtil.isAccessTokenBlacklisted(token);
    assert.strictEqual(isBlacklisted, true, 'Token must be verified as blacklisted in Redis');
    console.log('  [PASS] Access token successfully blacklisted in Redis');

    // Subsequent request with the blacklisted token must be rejected with 401
    const resAfterLogout = await fetch(`${baseUrl}/api/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(resAfterLogout.status, 401, `Expected 401 after logout, got ${resAfterLogout.status}`);
    console.log('  [PASS] Post-logout request rejected immediately with HTTP 401 (blacklisted)');

    // -------------------------------------------------------------
    // Test 6c: Redis down during OTP enqueue -> assert email is still sent via direct fallback
    // -------------------------------------------------------------
    console.log('\n--- Test 6c: Redis down during OTP enqueue -> email sent via direct fallback ---');

    let directSendCalled = false;
    let directSendPayload: any = null;

    // Spy on NotificationService.sendEmail
    const originalSendEmail = NotificationService.sendEmail;
    NotificationService.sendEmail = async (payload: any): Promise<any> => {
      directSendCalled = true;
      directSendPayload = payload;
      return { success: true, messageId: 'direct_msg_12345', statusCode: 200, provider: 'sendgrid' };
    };

    // Force queue.add to throw simulated Redis error
    const emailQueue = getEmailQueue();
    const originalAdd = emailQueue.add.bind(emailQueue);
    emailQueue.add = async () => {
      throw new Error('ECONNREFUSED: Redis connection lost');
    };

    try {
      const result = await enqueueEmail({
        to: 'otp_fallback@example.com',
        subject: 'Your OTP Code',
        template: 'otp',
        data: { otp: '654321', expiryMinutes: 10 },
      });

      assert.strictEqual(result.success, true, 'enqueueEmail must return success: true via fallback');
      assert.strictEqual(directSendCalled, true, 'NotificationService.sendEmail direct fallback must be called');
      assert.strictEqual(directSendPayload?.to, 'otp_fallback@example.com');
      assert.strictEqual(directSendPayload?.subject, 'Your OTP Code');
      console.log('  [PASS] Redis down triggered direct fallback; OTP email delivered successfully');
    } finally {
      // Restore spied functions
      NotificationService.sendEmail = originalSendEmail;
      emailQueue.add = originalAdd;
    }

  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await User.deleteMany({ userId: testUserId });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeEmailQueue();
    await mongoose.disconnect();
    await closeRedisConnection();
    console.log('Cleanup complete');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL END-TO-END BEHAVIOURAL TESTS PASSED (100% SUCCESS)');
  console.log('====================================================\n');
  process.exit(0);
}

runBehaviouralTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
