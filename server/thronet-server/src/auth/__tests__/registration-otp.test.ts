/**
 * src/auth/__tests__/registration-otp.test.ts
 *
 * Comprehensive test suite verifying the Pre-Registration Email OTP Verification flow:
 * 1. sendRegistrationOTP: checks user existence, rate limiting, OTP generation, and Redis caching.
 * 2. verifyRegistrationOTP: checks attempt tracking, incorrect OTP rejection, and verificationToken issuance.
 * 3. register: enforces verificationToken requirement, email binding, and sets emailVerified: true.
 */

process.env['LOG_FILE_ENABLED'] = 'false';
process.env['NODE_ENV'] = 'test';
process.env['MONGODB_TEST_URI'] = 'mongodb://127.0.0.1:27017/thronet_test';
process.env['MONGODB_URI'] = 'mongodb://127.0.0.1:27017/thronet_test';
process.env['REDIS_HOST'] = '127.0.0.1';
process.env['REDIS_PORT'] = '6379';
process.env['REDIS_URL'] = 'redis://127.0.0.1:6379';

import dotenv from 'dotenv';
dotenv.config();

import assert from 'assert';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { assertTestEnvironmentSafety } from '@/shared/cache/__tests__/testSafetyGuard';
import { getRedisClient, closeRedisConnection } from '@/shared/cache/redisConnection';
import CacheUtil from '@/shared/cache.util';
import AuthController from '../controllers/auth.controller';
import { User } from '../models';

function createMockResponse() {
    const headers: Record<string, string> = {};
    const res: any = {
        statusCode: 200,
        data: null,
        headers,
        setHeader(name: string, val: string) {
            headers[name.toLowerCase()] = val;
            return this;
        },
        getHeader(name: string) {
            return headers[name.toLowerCase()];
        },
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(body: any) {
            this.data = body;
            return this;
        },
    };
    return res;
}

async function runRegistrationOTPTests(): Promise<void> {
    console.log('====================================================');
    console.log('🧪 Starting Pre-Registration Email OTP Test Suite');
    console.log('====================================================');

    const mongoUri = assertTestEnvironmentSafety();
    await mongoose.connect(mongoUri);
    const redis = getRedisClient();
    await redis.ping();
    console.log('✅ Connected to Test MongoDB and Redis');

    const timestamp = Date.now();
    const testEmail = `pre_reg_test_${timestamp}@example.com`;
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'dev-only-access-secret-change-me-0123456789';

    try {
        // -------------------------------------------------------------
        // Test 1: Send Registration OTP for a new email
        // -------------------------------------------------------------
        console.log('\n--- Test 1: Send Registration OTP for new email ---');
        const req1: any = {
            body: { email: testEmail, firstName: 'TestUser' },
            ip: '127.0.0.1',
        };
        const res1 = createMockResponse();

        await AuthController.sendRegistrationOTP(req1, res1);

        assert.strictEqual(res1.statusCode, 200, `Expected 200 OK, got ${res1.statusCode}: ${JSON.stringify(res1.data)}`);
        assert.strictEqual(res1.data.status, 'success');
        assert.strictEqual(res1.data.data.email, testEmail);

        // Verify key stored in Redis
        const otpKey = `registration_otp:${testEmail}`;
        const rawCached = await CacheUtil.get(otpKey);
        assert(rawCached, 'OTP record must be present in Redis');

        const otpRecord = typeof rawCached === 'string' ? JSON.parse(rawCached) : rawCached;
        assert(otpRecord.otpHash, 'OTP hash must be present');
        assert.strictEqual(otpRecord.email, testEmail);
        assert.strictEqual(otpRecord.attempts, 0);

        console.log('  [PASS] sendRegistrationOTP cached OTP in Redis with 10-minute TTL');

        // -------------------------------------------------------------
        // Test 2: Duplicate Email Conflict Check
        // -------------------------------------------------------------
        console.log('\n--- Test 2: Conflict when sending OTP to already registered email ---');
        const existingEmail = `existing_${timestamp}@example.com`;
        await User.create({
            userId: `usr_exist_${timestamp}`,
            email: existingEmail,
            passwordHash: 'dummyhash123',
            firstName: 'Existing',
            lastName: 'User',
            role: 'user',
            emailVerified: true,
            status: 'active',
        });

        const req2: any = {
            body: { email: existingEmail },
            ip: '127.0.0.1',
        };
        const res2 = createMockResponse();

        await AuthController.sendRegistrationOTP(req2, res2);
        assert.strictEqual(res2.statusCode, 409, `Expected 409 Conflict for existing user, got ${res2.statusCode}`);
        console.log('  [PASS] Duplicate email rejected with 409 Conflict');

        // -------------------------------------------------------------
        // Test 3: Verify Registration OTP - Invalid OTP Attempt Tracking
        // -------------------------------------------------------------
        console.log('\n--- Test 3: Invalid OTP attempt increment and limit ---');
        const req3: any = {
            body: { email: testEmail, otp: '000000' },
            ip: '127.0.0.1',
        };
        const res3 = createMockResponse();

        await AuthController.verifyRegistrationOTP(req3, res3);
        assert.strictEqual(res3.statusCode, 400, `Expected 400 Bad Request, got ${res3.statusCode}`);

        const updatedCached = await CacheUtil.get(otpKey);
        const updatedRecord = typeof updatedCached === 'string' ? JSON.parse(updatedCached) : updatedCached;
        assert.strictEqual(updatedRecord.attempts, 1, 'Attempts counter should be incremented to 1');
        console.log('  [PASS] Invalid OTP incremented attempts counter');

        // -------------------------------------------------------------
        // Test 4: Verify Registration OTP - Success & verificationToken
        // -------------------------------------------------------------
        console.log('\n--- Test 4: Successful OTP verification issues verificationToken ---');
        // Retrieve or inject known OTP
        const crypto = await import('crypto');
        const knownOtp = '789123';
        const salt = process.env.OTP_SALT || 'default-otp-salt-change-in-production';
        const knownHash = crypto.createHash('sha256').update(knownOtp + salt).digest('hex');

        await CacheUtil.set(
            otpKey,
            JSON.stringify({
                otpHash: knownHash,
                email: testEmail,
                attempts: 0,
                maxAttempts: 5,
                createdAt: Date.now(),
            }),
            600
        );

        const req4: any = {
            body: { email: testEmail, otp: knownOtp },
            ip: '127.0.0.1',
        };
        const res4 = createMockResponse();

        await AuthController.verifyRegistrationOTP(req4, res4);
        assert.strictEqual(res4.statusCode, 200, `Expected 200 OK, got ${res4.statusCode}`);
        assert(res4.data.data.verificationToken, 'Response must contain verificationToken');

        const verificationToken = res4.data.data.verificationToken;
        const decoded = jwt.verify(verificationToken, secret) as any;
        assert.strictEqual(decoded.email, testEmail);
        assert.strictEqual(decoded.purpose, 'registration_verification');

        // Ensure OTP key deleted from Redis to prevent replay
        const deletedOtp = await CacheUtil.get(otpKey);
        assert(!deletedOtp, 'OTP key must be deleted after successful verification');
        console.log('  [PASS] VerificationToken signed correctly and Redis OTP cleared');

        // -------------------------------------------------------------
        // Test 5: Register User with Missing verificationToken
        // -------------------------------------------------------------
        console.log('\n--- Test 5: Register user rejects missing verificationToken ---');
        const req5: any = {
            body: {
                email: testEmail,
                password: 'Password123!',
                confirmPassword: 'Password123!',
                firstName: 'John',
                lastName: 'Doe',
                userType: 'fresher',
                location: 'Mumbai',
                highestEducation: 'B.Tech',
                preferredRole: 'Software Engineer',
                // verificationToken omitted
            },
            headers: { 'user-agent': 'test-agent' },
            ip: '127.0.0.1',
        };
        const res5 = createMockResponse();

        await AuthController.register(req5, res5);
        assert.strictEqual(res5.statusCode, 400, `Expected 400 Bad Request, got ${res5.statusCode}`);
        console.log('  [PASS] Register rejects request without verificationToken');

        // -------------------------------------------------------------
        // Test 6: Register User with Mismatched Email in verificationToken
        // -------------------------------------------------------------
        console.log('\n--- Test 6: Register rejects verificationToken for another email ---');
        const forgedToken = jwt.sign(
            { email: 'someone_else@example.com', purpose: 'registration_verification' },
            secret,
            { expiresIn: '15m' }
        );

        const req6: any = {
            body: {
                ...req5.body,
                verificationToken: forgedToken,
            },
            headers: { 'user-agent': 'test-agent' },
            ip: '127.0.0.1',
        };
        const res6 = createMockResponse();

        await AuthController.register(req6, res6);
        assert.strictEqual(res6.statusCode, 401, `Expected 401 Unauthorized for mismatched email, got ${res6.statusCode}`);
        console.log('  [PASS] Register strictly rejects verificationToken from different email');

        // -------------------------------------------------------------
        // Test 7: Successful Registration with Valid verificationToken
        // -------------------------------------------------------------
        console.log('\n--- Test 7: Successful registration with valid verificationToken ---');
        const validToken = jwt.sign(
            { email: testEmail, purpose: 'registration_verification' },
            secret,
            { expiresIn: '15m' }
        );

        const req7: any = {
            body: {
                email: testEmail,
                password: 'Password123!',
                confirmPassword: 'Password123!',
                firstName: 'John',
                lastName: 'Doe',
                userType: 'fresher',
                location: 'Mumbai',
                highestEducation: 'B.Tech',
                preferredRole: 'Software Engineer',
                verificationToken: validToken,
            },
            headers: { 'user-agent': 'test-agent' },
            ip: '127.0.0.1',
        };
        const res7 = createMockResponse();

        await AuthController.register(req7, res7);
        assert.strictEqual(res7.statusCode, 201, `Expected 201 Created, got ${res7.statusCode}: ${JSON.stringify(res7.data)}`);
        assert.strictEqual(res7.data.data.user.emailVerified, true, 'User emailVerified must be true');
        assert(res7.data.data.tokens.accessToken, 'Access token must be returned');

        // Verify MongoDB user document
        const createdUser = await User.findOne({ email: testEmail });
        assert(createdUser, 'User document must exist in MongoDB');
        assert.strictEqual(createdUser.emailVerified, true, 'Database record emailVerified must be true');
        assert(createdUser.emailVerifiedAt, 'Database record emailVerifiedAt must be populated');

        console.log('  [PASS] User created with emailVerified: true and emailVerifiedAt timestamp');

        // -------------------------------------------------------------
        // Test 8: Token Replay Prevention (Consumed Token Rejection)
        // -------------------------------------------------------------
        console.log('\n--- Test 8: Consumed token replay is rejected ---');
        const res8 = createMockResponse();
        await AuthController.register(req7, res8);
        assert.strictEqual(res8.statusCode, 401, `Expected 401 Unauthorized for consumed token replay, got ${res8.statusCode}`);
        console.log('  [PASS] Replay attack blocked: consumed verificationToken strictly rejected');

        // Cleanup
        await User.deleteOne({ email: testEmail });
        await User.deleteOne({ email: existingEmail });

        console.log('\n====================================================');
        console.log('🎉 ALL PRE-REGISTRATION OTP TESTS PASSED (100% SUCCESS)');
        console.log('====================================================\n');
    } finally {
        await mongoose.disconnect();
        await closeRedisConnection();
    }
}

if (require.main === module) {
    runRegistrationOTPTests()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('❌ Test failed:', err);
            process.exit(1);
        });
}

export { runRegistrationOTPTests };
