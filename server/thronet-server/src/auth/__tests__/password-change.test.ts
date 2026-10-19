import bcrypt from 'bcrypt';
import zxcvbn from 'zxcvbn';
import PasswordService from '../services/password.service';
import { User, Session } from '@/shared/models/index.models';
import RefreshToken from '../models/RefreshToken.model';
import OTPVerification from '../models/OTPVerification.model';
import PasswordHistory from '../models/PasswordHistory.model';
import CacheUtil from '@/shared/cache.util';

async function runPasswordChangeTests() {
  console.log('--- Starting Password Change Verification Tests ---');
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

  const testUserId = `test_usr_${Date.now()}`;
  const testEmail = 'user_pw_test@example.com';
  const validCurrentPassword = 'CurrentValidPassword123!';
  const currentSalt = await bcrypt.genSalt(10);
  const currentPasswordHash = await bcrypt.hash(validCurrentPassword, currentSalt);

  // Stubs for isolated test execution
  const originalUserFindOne = User.findOne;
  const originalUserFindOneAndUpdate = User.findOneAndUpdate;
  const originalOtpVerify = OTPVerification.verifyOTPByType;
  const originalOtpCreate = OTPVerification.createOTP;
  const originalHistoryIsUsed = PasswordHistory.isPasswordRecentlyUsed;
  const originalHistoryAdd = PasswordHistory.addPasswordToHistory;
  const originalCacheGet = CacheUtil.get;
  const originalCacheSet = CacheUtil.set;
  const originalRevokeSessions = Session.revokeAllUserSessions;
  const originalRevokeTokens = RefreshToken.revokeAllUserTokens;

  try {
    // Setup standard mock returns
    (CacheUtil as any).get = async () => null;
    (CacheUtil as any).set = async () => true;

    // Test 1: Wrong Current Password in sendPasswordChangeOTP
    console.log('\nTest 1: Wrong current password throws "Invalid current password"');
    (User as any).findOne = () => ({
      select: () => ({
        lean: () => ({
          exec: async () => ({
            userId: testUserId,
            email: testEmail,
            firstName: 'Tester',
            passwordHash: currentPasswordHash,
          }),
        }),
      }),
    });

    let wrongPasswordError: string | null = null;
    try {
      await PasswordService.sendPasswordChangeOTP(
        testUserId,
        testEmail,
        'WrongCurrentPassword999!',
        '127.0.0.1'
      );
    } catch (err: any) {
      wrongPasswordError = err.message;
    }
    assert(wrongPasswordError === 'Invalid current password', 'Wrong current password correctly throws "Invalid current password"');

    // Test 2: Recently Used Password in verifyPasswordChangeOTP
    console.log('\nTest 2: Recently used password throws "Cannot reuse any of your last 5 passwords"');
    (OTPVerification as any).verifyOTPByType = async () => ({ success: true, otpId: 'otp_123' });
    (PasswordHistory as any).isPasswordRecentlyUsed = async () => true; // Simulating recently used

    let recentPasswordError: string | null = null;
    try {
      await PasswordService.verifyPasswordChangeOTP(
        testUserId,
        testEmail,
        '123456',
        'StrongNewPass#2026!',
        '127.0.0.1',
        'Mozilla/5.0'
      );
    } catch (err: any) {
      recentPasswordError = err.message;
    }
    assert(recentPasswordError === 'Cannot reuse any of your last 5 passwords', 'Recently used password correctly throws "Cannot reuse any of your last 5 passwords"');

    // Test 3: Weak Password check precedes user lookup
    console.log('\nTest 3: Weak password check throws before database lookup');
    let weakPasswordError: string | null = null;
    try {
      await PasswordService.verifyPasswordChangeOTP(
        testUserId,
        testEmail,
        '123456',
        '123',
        '127.0.0.1',
        'Mozilla/5.0'
      );
    } catch (err: any) {
      weakPasswordError = err.message;
    }
    assert(
      typeof weakPasswordError === 'string' &&
      (weakPasswordError.includes('easy to guess') || weakPasswordError.includes('Password is too weak')),
      'Weak password check correctly rejects weak password with feedback or weakness warning'
    );

    // Test 4: Success Case
    console.log('\nTest 4: Success path updates password and revokes sessions');
    (PasswordHistory as any).isPasswordRecentlyUsed = async () => false; // Not recently used
    (PasswordHistory as any).addPasswordToHistory = async () => ({});
    (User as any).findOneAndUpdate = () => ({
      select: () => ({
        exec: async () => ({
          userId: testUserId,
          email: testEmail,
          firstName: 'Tester',
        }),
      }),
    });
    (Session as any).revokeAllUserSessions = async () => 2;
    (RefreshToken as any).revokeAllUserTokens = async () => ({ revokedCount: 2 });

    const successResult = await PasswordService.verifyPasswordChangeOTP(
      testUserId,
      testEmail,
      '123456',
      'BrandNewSuperStrong#Password999!',
      '127.0.0.1',
      'Mozilla/5.0'
    );

    assert(successResult.success === true, 'Success flag is true');
    assert(successResult.message === 'Password changed successfully. Please login again.', 'Message confirms password change and re-login requirement');
    assert(successResult.requiresLogin === true, 'requiresLogin is true');
    assert(successResult.sessionsRevoked === 2, 'Sessions revoked matches count');

  } finally {
    // Restore all mocked functions
    User.findOne = originalUserFindOne;
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
    OTPVerification.verifyOTPByType = originalOtpVerify;
    OTPVerification.createOTP = originalOtpCreate;
    PasswordHistory.isPasswordRecentlyUsed = originalHistoryIsUsed;
    PasswordHistory.addPasswordToHistory = originalHistoryAdd;
    CacheUtil.get = originalCacheGet;
    CacheUtil.set = originalCacheSet;
    Session.revokeAllUserSessions = originalRevokeSessions;
    RefreshToken.revokeAllUserTokens = originalRevokeTokens;
  }

  console.log(`\n========================================`);
  console.log(`Total Passed: ${passed}, Total Failed: ${failed}`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPasswordChangeTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
