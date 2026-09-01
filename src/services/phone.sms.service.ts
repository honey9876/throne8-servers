/**
 * phone.sms.service.ts
 * Simple Twilio SMS Service - Only Sending
 * 
 * @version 2.0.0
 */

import twilio, { Twilio } from 'twilio';
import { MessageInstance } from 'twilio/lib/rest/api/v2010/account/message';
import { LoggerUtil } from '@/shared/logger.util';

const logger = LoggerUtil;

// ==================== TYPES & INTERFACES ====================

interface SMSResult {
    success: boolean;
    provider: 'twilio';
    sid: string;
    status: string;
    dateSent?: Date | null;
}

interface ServiceStatus {
    initialized: boolean;
    provider: 'twilio';
    available: boolean;
}

// ==================== SMS SERVICE CLASS ====================

class PhoneSMSService {
    private static twilioClient: Twilio | null = null;
    private static initialized: boolean = false;

    /**
     * Initialize Twilio Client
     * @returns {Promise<boolean>} Initialization success status
     */
    static async initialize(): Promise<boolean> {
        try {
            const accountSid = process.env.TWILIO_ACCOUNT_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;
            const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

            if (!accountSid || !authToken || !phoneNumber) {
                throw new Error('Twilio credentials missing in .env file');
            }

            // Initialize Twilio client
            this.twilioClient = twilio(accountSid, authToken);

            this.initialized = true;

            logger.info('✅ Twilio SMS Service initialized', {
                accountSid: accountSid.substring(0, 10) + '...',
                phoneNumber: phoneNumber,
            });

            return true;
        } catch(error : any) {
            logger.error('❌ Twilio initialization failed', {
                error: (error as Error).message,
            });
            throw error;
        }
    }

    /**
     * Send OTP SMS
     * @param {string} phoneNumber - Recipient phone number
     * @param {string} otp - OTP code
     * @param {number} expiryMinutes - OTP expiry time in minutes
     * @returns {Promise<SMSResult>} SMS sending result
     */
    static async sendOTP(
        phoneNumber: string,
        otp: string,
        expiryMinutes: number = 10
    ): Promise<SMSResult> {
        try {
            // Initialize if not done
            if (!this.initialized) {
                await this.initialize();
            }

            if (!this.twilioClient) {
                throw new Error('Twilio client not initialized');
            }

            // Create message
            const message = `Your OTP is: ${otp}. Valid for ${expiryMinutes} minutes. Do not share this code.`;

            logger.info('📱 Sending SMS via Twilio', {
                to: phoneNumber.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2'),
                from: process.env.TWILIO_PHONE_NUMBER,
            });

            // Send SMS
            const result: MessageInstance = await this.twilioClient.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber,
            });

            logger.info('✅ SMS sent successfully', {
                sid: result.sid,
                status: result.status,
                to: phoneNumber.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2'),
            });

            return {
                success: true,
                provider: 'twilio',
                sid: result.sid,
                status: result.status,
                dateSent: result.dateSent,
            };
        } catch(error : any) {
            logger.error('❌ SMS send failed', {
                error: (error as Error).message,
                code: (error as any).code,
                phoneNumber: phoneNumber.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2'),
            });
            throw error;
        }
    }

    /**
     * Send Verification Success SMS
     * @param {string} phoneNumber - Recipient phone number
     * @param {string} userName - User's name (default: 'User')
     * @returns {Promise<SMSResult>} SMS sending result
     */
    static async sendVerificationSuccessSMS(
        phoneNumber: string,
        userName: string = 'User'
    ): Promise<SMSResult> {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            if (!this.twilioClient) {
                throw new Error('Twilio client not initialized');
            }

            const message = `🎉 Congratulations ${userName}! Your phone number has been successfully verified. Thank you for securing your account.`;

            logger.info('📱 Sending verification success SMS', {
                to: phoneNumber.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2'),
            });

            const result: MessageInstance = await this.twilioClient.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber,
            });

            logger.info('✅ Success SMS sent', {
                sid: result.sid,
                status: result.status,
            });

            return {
                success: true,
                provider: 'twilio',
                sid: result.sid,
                status: result.status,
            };
        } catch(error : any) {
            logger.error('❌ Success SMS failed', {
                error: (error as Error).message,
                code: (error as any).code,
            });
            throw error;
        }
    }

    /**
     * Get service status
     * @returns {ServiceStatus} Service availability status
     */
    static getStatus(): ServiceStatus {
        return {
            initialized: this.initialized,
            provider: 'twilio',
            available: this.initialized,
        };
    }
}

// ==================== EXPORT ====================

export default PhoneSMSService;