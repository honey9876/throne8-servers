import { v4 as uuidv4 } from 'uuid';
import OTPVerification from '../models/OTPVerification.model';
import User from '../models/User.model';
import CacheUtil from '@/shared/cache.util';
import Constants from '@/shared/constants.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import NotificationService from './notification.service';
import { LoggerUtil } from '@/shared/logger.util';
class EmailVerificationService {

    static async sendEmailOTP(userId: string, email: string, ipAddress: string): Promise<object> {
        const correlationId = uuidv4();
        try {
            const rateLimitKey = `${Constants.CACHE_PREFIXES.EMAIL_VERIFY_RATE}${userId}`;
            const requests = await CacheUtil.get(rateLimitKey);

            if (requests && parseInt(requests as string) >= Constants.RATE_LIMITS.EMAIL_VERIFICATION.max) {
                await AuditProducer.sendAuditEvent({
                    eventId: uuidv4(), userId,
                    action: Constants.AUDIT_ACTIONS.EMAIL_VERIFICATION_RATE_LIMIT_EXCEEDED,
                    ipAddress,
                    status: Constants.AUDIT_STATUS.FAILURE as 'FAILURE',
                    severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                    timestamp: new Date().toISOString(),
                    metadata: { email, correlationId },
                });
                throw new Error('Too many verification requests. Please try again later.');
            }

            const user = await User.findOne({ userId }).select('email emailVerified').lean().exec();
            if (!user) throw new Error('User not found');

            if (user.emailVerified) {
                return { success: true, alreadyVerified: true, message: 'Email is already verified' };
            }

            const { otp, otpRecord } = await OTPVerification.createOTP({
                userId, otpType: 'email_verification', email: user.email,
                expiryMinutes: 10, maxAttempts: 3, metadata: { ipAddress },
            });

            await NotificationService.sendEmail({
                to: user.email,
                subject: 'Verify Your Email - OTP Code',
                template: 'email-otp',
                data: { otp, expiryMinutes: 10, userName: (user as any).firstName || user.email },
            });

            const newRequests = requests ? parseInt(requests as string) + 1 : 1;
            await CacheUtil.set(rateLimitKey, newRequests.toString(), Constants.CACHE_TTLS.VERIFICATION_RATE_LIMIT);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId,
                action: Constants.AUDIT_ACTIONS.EMAIL_VERIFICATION_LINK_SENT,
                ipAddress,
                status: Constants.AUDIT_STATUS.FAILURE as 'FAILURE',
                severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                timestamp: new Date().toISOString(),
                metadata: { email: user.email, otpId: otpRecord.otpId, expiresAt: otpRecord.expiresAt, correlationId },
            });

            return {
                success: true,
                message: 'Verification code sent to your email',
                email: user.email,
                expiresAt: otpRecord.expiresAt,
                expiresIn: 600,
            };
        } catch (error: any) {
            LoggerUtil.error('Send email OTP failed', { error: error.message, userId, correlationId });
            throw error;
        }
    }

    static async verifyEmailOTP(userId: string, otp: string, ipAddress: string): Promise<object> {
        const correlationId = uuidv4();
        try {
            const user = await User.findOne({ userId }).select('email emailVerified').lean().exec();
            if (!user) throw new Error('User not found');
            if (user.emailVerified) return { success: true, alreadyVerified: true, message: 'Email is already verified' };

            const verificationResult = await OTPVerification.verifyOTPByType(userId, otp, 'email_verification');

            await User.findOneAndUpdate({ userId }, { $set: { emailVerified: true, emailVerifiedAt: new Date() } });

            const rateLimitKey = `${Constants.CACHE_PREFIXES.EMAIL_VERIFY_RATE}${userId}`;
            await CacheUtil.del(rateLimitKey);

            await CacheUtil.set(
                `${Constants.CACHE_PREFIXES.USER}${userId}`,
                JSON.stringify({ userId, emailVerified: true }),
                Constants.CACHE_TTLS.USER
            );

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId,
                action: Constants.AUDIT_ACTIONS.EMAIL_VERIFIED,
                ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS',
                severity: Constants.AUDIT_SEVERITIES.LOW as 'LOW',
                timestamp: new Date().toISOString(),
                metadata: { email: user.email, verifiedAt: new Date().toISOString(), correlationId },
            });

            try {
                await NotificationService.sendEmail({
                    to: user.email,
                    subject: 'Email Verified Successfully',
                    template: 'email-verified-confirmation',
                    data: { userName: (user as any).firstName || user.email, verifiedAt: new Date().toLocaleString() },
                });
            } catch (e) { /* non-critical */ }

            return { success: true, message: 'Email verified successfully', emailVerified: true, verifiedAt: new Date().toISOString() };
        } catch (error: any) {
            LoggerUtil.error('Email OTP verification failed', { error: error.message, userId, correlationId });
            throw error;
        }
    }

    static async resendEmailOTP(userId: string, ipAddress: string): Promise<object> {
        const correlationId = uuidv4();
        try {
            const user = await User.findOne({ userId }).select('email emailVerified firstName').lean().exec();
            if (!user) throw new Error('User not found');
            if (user.emailVerified) return { success: true, alreadyVerified: true, message: 'Email is already verified' };

            const resendRateLimitKey = `${Constants.CACHE_PREFIXES.EMAIL_VERIFY_RATE}resend:${userId}`;
            const resends = await CacheUtil.get(resendRateLimitKey);

            if (resends && parseInt(resends as string) >= 2) {
                throw new Error('Too many resend requests. Please try again after 1 hour.');
            }

            await OTPVerification.updateMany({ userId, otpType: 'email_verification', status: 'pending' }, { $set: { status: 'revoked' } });

            const { otp, otpRecord } = await OTPVerification.createOTP({
                userId, otpType: 'email_verification', email: user.email,
                expiryMinutes: 10, maxAttempts: 3, metadata: { ipAddress, resent: true },
            });

            await NotificationService.sendEmail({
                to: user.email,
                subject: 'Verify Your Email - OTP Code (Resent)',
                template: 'email-otp',
                data: { otp, expiryMinutes: 10, userName: (user as any).firstName || user.email },
            });

            const newResends = resends ? parseInt(resends as string) + 1 : 1;
            await CacheUtil.set(resendRateLimitKey, newResends.toString(), 3600);

            return {
                success: true, message: 'Verification code resent to your email',
                email: user.email, expiresAt: otpRecord.expiresAt, expiresIn: 600,
                resent: true, resendCount: newResends,
            };
        } catch (error: any) {
            throw error;
        }
    }

    static async checkEmailVerificationStatus(userId: string): Promise<object> {
        const cacheKey = `${Constants.CACHE_PREFIXES.USER}${userId}`;
        try {
            const cached = await CacheUtil.get(cacheKey);
            if (cached) {
                let userData: any;
                if (typeof cached === 'string') {
                    try { userData = JSON.parse(cached); } catch { await CacheUtil.del(cacheKey); }
                } else {
                    userData = cached;
                }

                // ✅ KEY FIX: Cache में true है तो trust करो, false है तो DB से verify करो
                if (userData && userData.emailVerified === true) {
                    return { emailVerified: true, fromCache: true };
                }
                // emailVerified false/undefined है cache में — DB से fresh data lo
            }

            // DB से fetch करो
            const user = await User.findOne({ userId }).select('emailVerified').lean().exec();
            if (!user) throw new Error('User not found');

            // ✅ Cache update करो with emailVerified from DB
            await CacheUtil.set(
                cacheKey,
                JSON.stringify({ userId, emailVerified: user.emailVerified }),
                Constants.CACHE_TTLS.USER
            );

            return { emailVerified: user.emailVerified || false, fromCache: false };
        } catch (error: any) {
            throw error;
        }
    }

    static async getPendingOTPInfo(userId: string): Promise<object | null> {
        const otpRecord = await OTPVerification.getActiveOTP(userId, 'email_verification');
        if (!otpRecord) return null;
        return {
            otpId: otpRecord.otpId,
            expiresAt: otpRecord.expiresAt,
            attempts: otpRecord.attempts,
            maxAttempts: otpRecord.maxAttempts,
            remainingAttempts: otpRecord.maxAttempts - otpRecord.attempts,
        };
    }
}

export default EmailVerificationService;