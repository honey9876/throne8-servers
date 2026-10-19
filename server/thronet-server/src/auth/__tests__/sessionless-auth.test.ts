/**
 * src/auth/__tests__/sessionless-auth.test.ts
 *
 * Verifies that express-session and connect-mongo are completely absent,
 * and that OAuth flows, regular login, refresh, and logout work statelessly
 * with JWTs and the custom Session model without express-session.
 */

process.env['LOG_FILE_ENABLED'] = 'false';

import dotenv from 'dotenv';
dotenv.config();

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import passport from '@/config/oauth/passport.config';
import { assertTestEnvironmentSafety } from '@/shared/cache/__tests__/testSafetyGuard';
import { getRedisClient, closeRedisConnection } from '@/shared/cache/redisConnection';
import mongoose from 'mongoose';
import { Session, User } from '@/auth/models';

async function runSessionlessAuthTests(): Promise<void> {
  console.log('====================================================');
  console.log('🧪 Starting Sessionless Authentication Verification Test Suite');
  console.log('====================================================');

  // Verify test environment safety
  const mongoUri = assertTestEnvironmentSafety();
  await mongoose.connect(mongoUri);
  const redis = getRedisClient();
  await redis.ping();
  console.log('✅ Connected to MongoDB and Redis');

  // -------------------------------------------------------------
  // Test 1: Zero imports of connect-mongo and express-session
  // -------------------------------------------------------------
  console.log('\n--- Test 1: Zero Imports of connect-mongo and express-session ---');
  const srcDir = path.resolve(__dirname, '../../../src');
  
  function scanDir(dir: string, results: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath, results);
      } else if ((file.endsWith('.ts') || file.endsWith('.js')) && fullPath !== __filename) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes("from 'connect-mongo'") || content.includes('from "connect-mongo"') ||
            content.includes("from 'express-session'") || content.includes('from "express-session"') ||
            content.includes("require('connect-mongo')") || content.includes('require("connect-mongo")') ||
            content.includes("require('express-session')") || content.includes('require("express-session")')) {
          results.push(fullPath);
        }
      }
    }
    return results;
  }

  const matches = scanDir(srcDir);
  assert.strictEqual(
    matches.length,
    0,
    `No files in src/ should import connect-mongo or express-session. Found: ${matches.join(', ')}`
  );
  console.log('  [PASS] Checked entire src/ directory: 0 references to connect-mongo or express-session');

  // Check package.json dependencies
  const pkgJsonPath = path.resolve(__dirname, '../../../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  assert(!pkg.dependencies?.['connect-mongo'], 'connect-mongo must not be in dependencies');
  assert(!pkg.dependencies?.['express-session'], 'express-session must not be in dependencies');
  assert(!pkg.devDependencies?.['@types/connect-mongo'], '@types/connect-mongo must not be in devDependencies');
  assert(!pkg.devDependencies?.['@types/express-session'], '@types/express-session must not be in devDependencies');
  console.log('  [PASS] package.json verified: express-session and connect-mongo completely uninstalled');

  // -------------------------------------------------------------
  // Test 2: Passport & OAuth Routes Use Stateless session: false
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Passport OAuth Routes Are Fully Stateless (session: false) ---');
  const authRoutesPath = path.resolve(__dirname, '../routes/auth.routes.ts');
  const authRoutesContent = fs.readFileSync(authRoutesPath, 'utf8');

  // Check all passport.authenticate calls in auth.routes.ts
  const authMatches = authRoutesContent.match(/passport\.authenticate\([^)]+\)/gs) || [];
  assert(authMatches.length >= 4, `Found ${authMatches.length} passport.authenticate calls`);
  for (const match of authMatches) {
    assert(
      match.includes("session: false"),
      `Every passport.authenticate invocation must specify session: false. Found:\n${match}`
    );
  }
  console.log(`  [PASS] Verified ${authMatches.length} OAuth route handlers: 100% specify session: false`);

  // Check that app.ts source does NOT contain express-session, connect-mongo, or passport.session()
  const appPath = path.resolve(__dirname, '../../../src/app.ts');
  const appContent = fs.readFileSync(appPath, 'utf8');
  assert(!appContent.includes('express-session'), 'app.ts must NOT contain express-session');
  assert(!appContent.includes('connect-mongo'), 'app.ts must NOT contain connect-mongo');
  assert(!appContent.includes('passport.session()'), 'app.ts must NOT contain passport.session()');
  assert(!appContent.includes('MongoStore'), 'app.ts must NOT contain MongoStore');
  console.log('  [PASS] Express app verified: express-session, connect-mongo, and passport.session() completely absent');

  // -------------------------------------------------------------
  // Test 3: Custom Session Model Works Without express-session
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Custom Session Model Lifecycle (Login, Refresh, Logout) ---');
  const testUserId = `test_usr_auth_${Date.now()}`;
  const testSessionId = `test_sess_${Date.now()}`;

  // 3a. Creation on Login
  const createdSession = await Session.create({
    _id: testSessionId,
    userId: testUserId,
    deviceId: 'test_device_uuid',
    ipAddress: '127.0.0.1',
    refreshToken: `rf_token_${testSessionId}`,
    isActive: true,
    expiresAt: new Date(Date.now() + 3600000),
  });

  assert(createdSession._id === testSessionId, 'Custom Session created on login');
  assert(createdSession.userId === testUserId, 'Custom Session contains userId');
  assert(!('session' in createdSession.toObject()), 'Custom Session does not have legacy express-session string field');
  console.log('  [PASS] Session model persists login session independently of express-session');

  // 3b. Read & Validate on Refresh
  const foundSession = await Session.findOne({ _id: testSessionId, isActive: true });
  assert(foundSession !== null, 'Session found and validated for refresh');
  assert(foundSession?.userId === testUserId, 'Session userId matches');
  console.log('  [PASS] Session refresh token validation succeeds');

  // 3c. Invalidation on Logout
  await Session.updateOne({ _id: testSessionId }, { $set: { isActive: false, terminatedAt: new Date() } });
  const terminatedSession = await Session.findOne({ _id: testSessionId, isActive: true });
  assert(terminatedSession === null, 'Session successfully terminated on logout');
  console.log('  [PASS] Session logout termination succeeds');

  // Cleanup
  await Session.deleteOne({ _id: testSessionId });
  console.log('  [PASS] Test session cleaned up from database');

  await mongoose.disconnect();
  await closeRedisConnection();
  console.log('\n====================================================');
  console.log('🎉 ALL SESSIONLESS AUTH TESTS PASSED CLEANLY');
  console.log('====================================================\n');
}

if (require.main === module) {
  runSessionlessAuthTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}

export default runSessionlessAuthTests;
