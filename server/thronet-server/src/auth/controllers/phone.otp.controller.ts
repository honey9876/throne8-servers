// Path: src/auth/controllers/phone.otp.controller.ts
// ================================================================

import { Request, Response } from 'express';
import User from '@/auth/models/User.model';
import { LoggerUtil as logger } from '@/shared/logger.util';
import AuditLog from '@/auth/models/AuditLog.model';
import PhoneSMSService from '../services/phone.sms.service';
import PhoneOTPVerification from '../models/phone.model';

class PhoneOTPController {

    static async sendOTP(req: Request, res: Response): Promise<Response> {
        try {
            const { userId } = (req as any).user;
            const { phoneNumber } = req.body;

            if (!phoneNumber) {
                return res.status(400).json({ status: 'error', message: 'Phone number is required' });
            }

            const user = await (User as any).findByUserId(userId);
            if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

            if (user.phoneNumber !== phoneNumber) {
                return res.status(403).json({ status: 'error', message: 'Phone number does not match registered number' });
            }

            const { otp, otpRecord } = await PhoneOTPVerification.createPhoneOTP({
                userId, phoneNumber, expiryMinutes: 10,
                metadata: { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
            });

            const smsResult = await PhoneSMSService.sendOTP(phoneNumber, otp, 10);

            logger.info('Phone OTP sent successfully', {
                userId,
                phoneNumber: phoneNumber.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2'),
                otpId: (otpRecord as any).otpId,
            });

            return res.status(200).json({
                status: 'success',
                message: 'OTP sent to your registered phone number',
                data: {
                    otpId: (otpRecord as any).otpId,
                    expiresAt: (otpRecord as any).expiresAt,
                    phoneNumber: phoneNumber.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2'),
                    twilioSid: smsResult.sid,
                },
            });

        } catch (error: unknown) {
            logger.error('Send Phone OTP failed', { error: (error as Error).message, userId: (req as any).user?.userId });

            AuditLog.logAction({
                userId: (req as any).user?.userId, action: 'PHONE_OTP_SEND_FAILED',
                status: 'FAILED', severity: 'MEDIUM', ipAddress: req.ip,
                metadata: new Map([['error', (error as Error).message], ['errorCode', (error as any).code]]),
            }).catch(() => { });

            if ((error as any).code === 21211) {
                return res.status(400).json({
                    status: 'error', message: 'Phone number not verified in Twilio',
                    verifyUrl: 'https://console.twilio.com/us1/develop/phone-numbers/manage/verified',
                });
            }

            return res.status(500).json({ status: 'error', message: (error as Error).message || 'Failed to send OTP', code: (error as any).code });
        }
    }

    static async verifyOTP(req: Request, res: Response): Promise<Response> {
        try {
            const { userId } = (req as any).user;
            const { phoneNumber, otp } = req.body;

            if (!phoneNumber || !otp) {
                return res.status(400).json({ status: 'error', message: 'Phone number and OTP are required' });
            }

            const user = await (User as any).findByUserId(userId);
            if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

            if (user.phoneNumber !== phoneNumber) {
                return res.status(403).json({ status: 'error', message: 'Phone number mismatch' });
            }

            const result = await PhoneOTPVerification.verifyPhoneOTP(userId, phoneNumber, otp);

            if ((result as any).success && !user.phoneVerified) {
                user.phoneVerified = true;
                user.phoneVerifiedAt = new Date();
                await user.save();

                try {
                    await PhoneSMSService.sendVerificationSuccessSMS(phoneNumber, user.firstName || 'User');
                } catch (smsError: unknown) {
                    logger.warn('Success SMS failed (non-critical)', { error: (smsError as Error).message });
                }
            }

            return res.status(200).json({
                status: 'success',
                message: 'Phone number verified successfully',
                data: { phoneVerified: true, verifiedAt: (result as any).verifiedAt },
            });

        } catch (error: unknown) {
            logger.error('Verify Phone OTP failed', { error: (error as Error).message, userId: (req as any).user?.userId });

            AuditLog.logAction({
                userId: (req as any).user?.userId, action: 'PHONE_OTP_VERIFY_FAILED',
                status: 'FAILED', severity: 'MEDIUM', ipAddress: req.ip,
                metadata: new Map([['error', (error as Error).message], ['errorCode', (error as any).code]]),
            }).catch(() => { });

            return res.status(400).json({ status: 'error', message: (error as Error).message || 'OTP verification failed' });
        }
    }

    static async resendOTP(req: Request, res: Response): Promise<Response> {
        try {
            const { userId } = (req as any).user;
            const { phoneNumber } = req.body;

            if (!phoneNumber) return res.status(400).json({ status: 'error', message: 'Phone number is required' });

            const user = await (User as any).findByUserId(userId);
            if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
            if (user.phoneVerified) return res.status(400).json({ status: 'error', message: 'Phone number is already verified' });
            if (user.phoneNumber !== phoneNumber) return res.status(403).json({ status: 'error', message: 'Phone number mismatch' });

            const { otp, otpRecord } = await PhoneOTPVerification.createPhoneOTP({
                userId, phoneNumber, expiryMinutes: 10,
                metadata: { ipAddress: req.ip, userAgent: req.headers['user-agent'], resend: true },
            });

            const smsResult = await PhoneSMSService.sendOTP(phoneNumber, otp, 10);

            return res.status(200).json({
                status: 'success', message: 'OTP resent successfully',
                data: { otpId: (otpRecord as any).otpId, expiresAt: (otpRecord as any).expiresAt },
            });

        } catch (error: unknown) {
            logger.error('Resend Phone OTP failed', { error: (error as Error).message, userId: (req as any).user?.userId });
            return res.status(500).json({ status: 'error', message: (error as Error).message || 'Failed to resend OTP' });
        }
    }

    static async getVerificationStatus(req: Request, res: Response): Promise<Response> {
        try {
            const { userId } = (req as any).user;

            const user = await (User as any).findByUserId(userId);
            if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

            return res.status(200).json({
                status: 'success',
                data: {
                    phoneNumber: user.phoneNumber
                        ? user.phoneNumber.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2')
                        : null,
                    phoneVerified: user.phoneVerified,
                    phoneVerifiedAt: user.phoneVerifiedAt,
                },
            });

        } catch (error: unknown) {
            logger.error('Get verification status failed', { error: (error as Error).message, userId: (req as any).user?.userId });
            return res.status(500).json({ status: 'error', message: 'Failed to fetch verification status' });
        }
    }
}

export default PhoneOTPController;