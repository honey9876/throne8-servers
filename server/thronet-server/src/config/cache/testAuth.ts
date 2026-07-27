/**
 * ⚠️ TEST AUTHENTICATION CONFIG
 * 
 * This file provides a centralized way to bypass authentication during testing.
 * 
 * USAGE:
 * - Set BYPASS_AUTH=true in .env to enable test authentication
 * - Toggle TEST_USER_ID between mentor and mentee IDs for different test scenarios
 * 
 * MENTOR TESTING:
 * - TEST_USER_ID=694e193aa8b4baea270dff46 (Mentor)
 * - TEST_USER_ROLE=mentor
 * - Use for: Complete session, Confirm session, Start session
 * 
 * MENTEE TESTING:
 * - TEST_USER_ID=6822ed4cc4180cc11daabfae (Mentee)
 * - TEST_USER_ROLE=user
 * - Use for: Create session, Cancel session, Add review
 * 
 * PRODUCTION:
 * - Set BYPASS_AUTH=false or remove it from .env
 * - This will automatically use real JWT authentication
 */

export const TEST_AUTH_CONFIG = {
  // 🔴 TOGGLE THIS FOR TESTING
  BYPASS_AUTH: process.env.BYPASS_AUTH === 'true',
  
  // 🔴 DYNAMIC TEST USER (Set in .env)
  TEST_USER_ID: process.env.TEST_USER_ID || '694e193aa8b4baea270dff46',
  TEST_USER_EMAIL: process.env.TEST_USER_EMAIL || 'mentor@example.com',
  TEST_USER_ROLE: process.env.TEST_USER_ROLE || 'mentor',
  
  // 📋 AVAILABLE TEST USERS
  USERS: {
    MENTOR: {
      userId: '694e193aa8b4baea270dff46',
      email: 'mentor@example.com',
      role: 'mentor',
    },
    MENTEE: {
      userId: '6822ed4cc4180cc11daabfae',
      email: 'rob@example.com',
      role: 'user',
    },
  },
};

/**
 * Get test user object
 */
export const getTestUser = () => ({
  userId: TEST_AUTH_CONFIG.TEST_USER_ID,
  email: TEST_AUTH_CONFIG.TEST_USER_EMAIL,
  role: TEST_AUTH_CONFIG.TEST_USER_ROLE,
});

/**
 * Check if test mode is enabled
 */
export const isTestMode = (): boolean => {
  return TEST_AUTH_CONFIG.BYPASS_AUTH;
};

/**
 * Get mentor test user
 */
export const getMentorTestUser = () => TEST_AUTH_CONFIG.USERS.MENTOR;

/**
 * Get mentee test user
 */
export const getMenteeTestUser = () => TEST_AUTH_CONFIG.USERS.MENTEE;

/**
 * Check if current test user is mentor
 */
export const isTestMentor = (): boolean => {
  return TEST_AUTH_CONFIG.TEST_USER_ID === TEST_AUTH_CONFIG.USERS.MENTOR.userId;
};

/**
 * Check if current test user is mentee
 */
export const isTestMentee = (): boolean => {
  return TEST_AUTH_CONFIG.TEST_USER_ID === TEST_AUTH_CONFIG.USERS.MENTEE.userId;
};

/**
 * Log current test user info
 */
export const logTestUserInfo = () => {
  if (isTestMode()) {
    console.log('\n🔴 ==================== TEST MODE ACTIVE ====================');
    console.log(`👤 Test User ID: ${TEST_AUTH_CONFIG.TEST_USER_ID}`);
    console.log(`📧 Test User Email: ${TEST_AUTH_CONFIG.TEST_USER_EMAIL}`);
    console.log(`🎭 Test User Role: ${TEST_AUTH_CONFIG.TEST_USER_ROLE}`);
    console.log(`🔑 Is Mentor: ${isTestMentor() ? 'YES ✅' : 'NO ❌'}`);
    console.log(`🔑 Is Mentee: ${isTestMentee() ? 'YES ✅' : 'NO ❌'}`);
    console.log('🔴 ==========================================================\n');
  }
};

export default {
  TEST_AUTH_CONFIG,
  getTestUser,
  isTestMode,
  getMentorTestUser,
  getMenteeTestUser,
  isTestMentor,
  isTestMentee,
  logTestUserInfo,
};