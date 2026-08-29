// Path: src/auth/services/phone.sms.service.ts
// ================================================================

import twilio from 'twilio';
import { LoggerUtil as logger } from '@/shared/logger.util';

class PhoneSMSService {
    static twilioClient: twilio.Twilio | null = null;
    static initialized: boolean = false;

    static async initialize(): Promise<boolean> {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

        if (!accountSid || !authToken || !phoneNumber) {
            throw new Error('Twilio credentials missing in .env file');
        }

        this.twilioClient = twilio(accountSid, authToken);
        this.initialized = true;

        logger.info('Twilio SMS Service initialized', {
            accountSid: accountSid.substring(0, 10) + '...',
            phoneNumber,
        });

        return true;
    }

    static async sendOTP(phoneNumber: string, otp: string, expiryMinutes = 10): Promise<{ success: boolean; provider: string; sid: string; status: string; dateSent: Date }> {
        if (!this.initialized) await this.initialize();

        const message = `Your OTP is: ${otp}. Valid for ${expiryMinutes} minutes. Do not share this code.`;

        const result = await this.twilioClient!.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: phoneNumber,
        });

        logger.info('SMS sent successfully', {
            sid: result.sid, status: result.status,
            to: phoneNumber.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2'),
        });

        return { success: true, provider: 'twilio', sid: result.sid, status: result.status, dateSent: result.dateSent as Date };
    }

    static async sendVerificationSuccessSMS(phoneNumber: string, userName = 'User'): Promise<{ success: boolean; provider: string; sid: string; status: string }> {
        if (!this.initialized) await this.initialize();

        const message = `Congratulations ${userName}! Your phone number has been successfully verified. Thank you for securing your account.`;

        const result = await this.twilioClient!.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: phoneNumber,
        });

        return { success: true, provider: 'twilio', sid: result.sid, status: result.status };
    }

    static getStatus() {
        return { initialized: this.initialized, provider: 'twilio', available: this.initialized };
    }
}

export default PhoneSMSService;