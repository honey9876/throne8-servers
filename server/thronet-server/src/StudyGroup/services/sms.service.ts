/**
 * ====================================
 * SMS SERVICE
 * ====================================
 * Send SMS notifications using Twilio
 */

import twilio, { Twilio } from 'twilio';
import env from '@/config/env/env';
import { LoggerUtil } from '@/shared/logger.util';

/**
 * Twilio Client
 */
let twilioClient: Twilio | null = null;

/**
 * Check if SMS is configured
 */
export const isSMSConfigured = (): boolean => {
  return !!(
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_PHONE_NUMBER
  );
};

/**
 * Initialize Twilio client
 */
const initializeTwilioClient = (): Twilio | null => {
  if (!isSMSConfigured()) {
    LoggerUtil.warn('⚠️  Twilio SMS not configured - SMS features disabled');
    return null;
  }

  try {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);
    LoggerUtil.info('✅ Twilio SMS client initialized');
    return twilioClient;
  } catch (error : any) {
    LoggerUtil.error('❌ Failed to initialize Twilio client:', error);
    return null;
  }
};

/**
 * Get Twilio client
 */
const getTwilioClient = (): Twilio | null => {
  if (!twilioClient) {
    return initializeTwilioClient();
  }
  return twilioClient;
};

/**
 * Send SMS
 */
export const sendSMS = async (
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  const client = getTwilioClient();

  if (!client) {
    LoggerUtil.warn('⚠️  SMS not configured - skipping SMS send');
    return {
      success: false,
      error: 'SMS service not configured',
    };
  }

  try {
    // Validate phone number format
    if (!to.startsWith('+')) {
      to = `+91${to}`; // Default to India country code
    }

    LoggerUtil.info(`📱 Sending SMS to ${to}...`);

    const result = await client.messages.create({
      body: message,
      from: env.TWILIO_PHONE_NUMBER!,
      to: to,
    });

    LoggerUtil.info(`✅ SMS sent successfully. SID: ${result.sid}`);

    return {
      success: true,
      messageId: result.sid,
    };
  } catch (error: any) {
    LoggerUtil.error('❌ Failed to send SMS:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Send OTP SMS
 */
export const sendOTP = async (
  phone: string,
  otp: string
): Promise<{ success: boolean; error?: string }> => {
  const message = `Your Study Group App verification code is: ${otp}. This code will expire in 10 minutes. Do not share this code with anyone.`;

  const result = await sendSMS(phone, message);
  return {
    success: result.success,
    error: result.error,
  };
};

/**
 * Send welcome SMS
 */
export const sendWelcomeSMS = async (
  phone: string,
  name: string
): Promise<{ success: boolean; error?: string }> => {
  const message = `Welcome to Study Group App, ${name}! 🎉 Start your learning journey with us. Happy studying!`;

  const result = await sendSMS(phone, message);
  return {
    success: result.success,
    error: result.error,
  };
};

/**
 * Send streak reminder SMS
 */
export const sendStreakReminderSMS = async (
  phone: string,
  name: string,
  currentStreak: number
): Promise<{ success: boolean; error?: string }> => {
  const message = `Hi ${name}! 🔥 Your ${currentStreak}-day streak is about to break! Study now to maintain your streak. Keep going! 💪`;

  const result = await sendSMS(phone, message);
  return {
    success: result.success,
    error: result.error,
  };
};

/**
 * Send goal reminder SMS
 */
export const sendGoalReminderSMS = async (
  phone: string,
  name: string,
  remainingHours: number
): Promise<{ success: boolean; error?: string }> => {
  const message = `Hi ${name}! ⏰ You have ${remainingHours} hours left to complete your daily goal. Start studying now! 📚`;

  const result = await sendSMS(phone, message);
  return {
    success: result.success,
    error: result.error,
  };
};

/**
 * Send deadline alert SMS
 */
export const sendDeadlineAlertSMS = async (
  phone: string,
  name: string,
  taskTitle: string,
  hoursLeft: number
): Promise<{ success: boolean; error?: string }> => {
  const message = `Hi ${name}! ⚠️ Task "${taskTitle}" is due in ${hoursLeft} hours. Complete it before the deadline! ⏳`;

  const result = await sendSMS(phone, message);
  return {
    success: result.success,
    error: result.error,
  };
};

/**
 * Send group invitation SMS
 */
export const sendGroupInviteSMS = async (
  phone: string,
  inviterName: string,
  groupName: string,
  inviteLink: string
): Promise<{ success: boolean; error?: string }> => {
  const message = `${inviterName} invited you to join "${groupName}" study group! 👥 Join now: ${inviteLink}`;

  const result = await sendSMS(phone, message);
  return {
    success: result.success,
    error: result.error,
  };
};

/**
 * Send bulk SMS
 */
export const sendBulkSMS = async (
  phoneNumbers: string[],
  message: string
): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
}> => {
  const client = getTwilioClient();

  if (!client) {
    return {
      success: false,
      sent: 0,
      failed: phoneNumbers.length,
      errors: ['SMS service not configured'],
    };
  }

  LoggerUtil.info(`📱 Sending bulk SMS to ${phoneNumbers.length} recipients...`);

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const phone of phoneNumbers) {
    const result = await sendSMS(phone, message);
    if (result.success) {
      sent++;
    } else {
      failed++;
      errors.push(`${phone}: ${result.error}`);
    }

    // Add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  LoggerUtil.info(`✅ Bulk SMS completed. Sent: ${sent}, Failed: ${failed}`);

  return {
    success: sent > 0,
    sent,
    failed,
    errors,
  };
};

/**
 * Verify phone number (send verification code)
 */
export const verifyPhoneNumber = async (
  phone: string
): Promise<{ success: boolean; error?: string }> => {
  const client = getTwilioClient();

  if (!client) {
    return {
      success: false,
      error: 'SMS service not configured',
    };
  }

  try {
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Send OTP
    const result = await sendOTP(phone, otp);

    if (result.success) {
      // Store OTP in cache/database for verification (implement based on your needs)
      LoggerUtil.info(`✅ Verification code sent to ${phone}`);
    }

    return result;
  } catch (error: any) {
    LoggerUtil.error('❌ Phone verification failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export default {
  sendSMS,
  sendOTP,
  sendWelcomeSMS,
  sendStreakReminderSMS,
  sendGoalReminderSMS,
  sendDeadlineAlertSMS,
  sendGroupInviteSMS,
  sendBulkSMS,
  verifyPhoneNumber,
  isSMSConfigured,
};