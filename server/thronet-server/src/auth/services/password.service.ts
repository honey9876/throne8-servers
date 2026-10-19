// Path: src/auth/services/password.service.ts
// ================================================================

import bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import zxcvbn from 'zxcvbn';
import { v4 as uuidv4 } from 'uuid';
import User from '@/auth/models/User.model';
import RefreshToken from '@/auth/models/RefreshToken.model';
import Session from '@/auth/models/Session.model';
import { LoggerUtil } from '@/shared/logger.util';
import CacheUtil from '@/shared/cache.util';
import NotificationService from './notification.service';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import PasswordHistory from '../models/PasswordHistory.model';
import Constants from '@/shared/constants.util';
import { EmailJobData, QueueEmailResult } from '../queues/email.queue';
import OTPVerification from '@/auth/models/OTPVerification.model';

// Try to import queue, fallback to direct send
// let queueEmail: ((data: EmailJobData) => Promise<QueueEmailResult>) | null = null;
// try {
//     const emailQueue = await import('../queues/email.queue');
//     queueEmail = emailQueue.queueEmail;
// } catch {
//     // Queue not available, will use direct send
// }

// async function sendEmail(emailData: EmailJobData): Promise<void> {
//     if (typeof queueEmail === 'function') {
//         await queueEmail(emailData);
//     } else {
//         await NotificationService.sendEmail(emailData);
//     }
// }

async function sendEmail(emailData: EmailJobData): Promise<void> {
    await NotificationService.sendEmail(emailData);
}

function isLocalOrInternalIp(ip: string): boolean {
    if (!ip) return true;
    const clean = ip.replace(/^::ffff:/, '').trim();
    return (
        clean === '127.0.0.1' ||
        clean === '::1' ||
        clean === 'localhost' ||
        clean === '0.0.0.0' ||
        clean.startsWith('172.30.') ||
        clean.startsWith('172.17.') ||
        clean.startsWith('10.') ||
        clean.startsWith('192.168.')
    );
}

class PasswordService {

    static async sendPasswordChangeOTP(userId: string, email: string, currentPassword: string, ipAddress: string) {
        const correlationId = uuidv4();
        try {
            // Rate limit check: max 5 requests per 15 minutes
            const rateLimitKey = `password_change_rate:${userId}`;
            const requests = await CacheUtil.get(rateLimitKey);
            if (requests && parseInt(String(requests), 10) >= 5) throw new Error('Too many password change requests. Please try again later.');

            // Fetch user with password
            const user = await User.findOne({ userId }).select('+passwordHash email firstName').lean().exec();
            if (!user) throw new Error('User not found');

            // Verify current password
            const isPasswordValid = await bcrypt.compare(currentPassword, (user as any).passwordHash);
            if (!isPasswordValid) {
                await AuditProducer.sendAuditEvent({
                    eventId: uuidv4(), userId, action: 'PASSWORD_CHANGE_INVALID_CURRENT_PASSWORD', ipAddress,
                    status: Constants.AUDIT_STATUS.FAILURE as 'FAILURE', severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                    timestamp: new Date().toISOString(), metadata: { correlationId },
                });
                throw new Error('Invalid current password');
            }

            // Create OTP
            const { otp, otpRecord } = await OTPVerification.createOTP({
                userId, otpType: 'password_change', email: (user as any).email,
                expiryMinutes: 10, maxAttempts: 3, metadata: { ipAddress },
            });

            // Send email
            try {
                await sendEmail({
                    to: (user as any).email,
                    subject: 'Password Change Verification Code',
                    template: 'password-change-otp',
                    data: { otp, expiryMinutes: 10, userName: (user as any).firstName || (user as any).email, ipAddress, timestamp: new Date().toLocaleString() },
                });
            } catch (emailError: unknown) {
                if ((otpRecord as any)?._id) {
                    await OTPVerification.deleteOne({ _id: (otpRecord as any)._id }).catch(() => {});
                }
                throw emailError;
            }

            // Increment rate limit atomically (15-minute window)
            await CacheUtil.incr(rateLimitKey, 900);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId, action: Constants.AUDIT_ACTIONS.PASSWORD_CHANGE_OTP_SENT, ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.LOW as 'LOW',
                timestamp: new Date().toISOString(), metadata: { email: (user as any).email, otpId: (otpRecord as any).otpId, correlationId },
            });

            return {
                success: true, message: 'Verification code sent to your email',
                email: (user as any).email, expiresAt: (otpRecord as any).expiresAt, expiresIn: 600,
            };
        } catch (error: unknown) {
            LoggerUtil.error('Send password change OTP failed', { error: (error as Error).message, userId, correlationId });
            throw error;
        }
    }

    static async verifyPasswordChangeOTP(userId: string, email: string, otp: string, newPassword: string, ipAddress: string, userAgent: string) {
        const correlationId = uuidv4();
        try {
            // Step 1: Password strength
            const passwordStrength = zxcvbn(newPassword, [email, userId]);
            if (passwordStrength.score < 3) {
                const feedbackMsg = [passwordStrength.feedback.warning, ...passwordStrength.feedback.suggestions]
                    .filter(Boolean).join(' ').trim();
                throw new Error(feedbackMsg ? `Password is too weak: ${feedbackMsg}` : 'Password is too weak. Please choose a stronger password.');
            }

            // Step 2: Fetch user
            const user = await User.findOne({ userId }).select('+passwordHash email firstName').lean().exec();
            if (!user) throw new Error('User not found');

            // Step 3: Password history
            const isRecentPassword = await PasswordHistory.isPasswordRecentlyUsed(userId, newPassword);
            if (isRecentPassword) throw new Error('Cannot reuse any of your last 5 passwords');

            // Step 4: Verify OTP
            const otpVerification = await OTPVerification.verifyOTPByType(userId, otp, 'password_change', email);
            if (!(otpVerification as any)?.success) throw new Error('Invalid or expired OTP');

            // Step 5: Save to history
            if ((user as any).passwordHash) {
                await PasswordHistory.addPasswordToHistory(userId, (user as any).passwordHash, {
                    changedBy: 'user', ipAddress, userAgent, reason: 'password_change',
                });
            }

            // Step 6: Hash new password
            const salt = await bcrypt.genSalt(12);
            const newPasswordHash = await bcrypt.hash(newPassword, salt);

            // Step 7: Update password
            const updatedUser = await User.findOneAndUpdate(
                { userId },
                { $set: { passwordHash: newPasswordHash, passwordChangedAt: new Date() } },
                { new: true, runValidators: false }
            ).select('userId email firstName').exec();

            if (!updatedUser) throw new Error('Failed to update password');

            // Step 8: Revoke sessions & tokens
            let sessionsRevoked = 0;
            let tokensRevoked = 0;
            try {
                const [sessions, tokens] = await Promise.all([
                    Session.revokeAllUserSessions(userId, 'password_changed'),
                    RefreshToken.revokeAllUserTokens(userId, 'password_changed', 'system'),
                ]);
                sessionsRevoked = sessions || 0;
                tokensRevoked = tokens?.revokedCount || 0;
            } catch (revokeError: unknown) {
                LoggerUtil.error('Failed to revoke sessions/tokens (non-critical)', { error: (revokeError as Error).message, userId, correlationId });
            }

            // Step 9: Confirmation email
            try {
                await sendEmail({
                    to: (updatedUser as any).email, subject: 'Password Changed Successfully',
                    template: 'password-changed',
                    data: { userName: (updatedUser as any).firstName || (updatedUser as any).email, timestamp: new Date().toLocaleString(), ipAddress, userAgent },
                });
            } catch (emailError: unknown) {
                LoggerUtil.error('Failed to send password changed email (non-critical)', { error: (emailError as Error).message, userId, correlationId });
            }

            // Step 10: Audit (non-critical)
            try {
                await AuditProducer.sendAuditEvent({
                    eventId: uuidv4(), userId, action: Constants.AUDIT_ACTIONS.PASSWORD_CHANGED, ipAddress,
                    status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.HIGH as 'HIGH',
                    timestamp: new Date().toISOString(),
                    metadata: { email: (updatedUser as any).email, passwordStrength: passwordStrength.score, sessionsRevoked, tokensRevoked, correlationId },
                });
            } catch (auditError: unknown) {
                LoggerUtil.error('Failed to send password changed audit event (non-critical)', { error: (auditError as Error).message, userId, correlationId });
            }

            return {
                success: true, message: 'Password changed successfully. Please login again.',
                userId: (updatedUser as any).userId, email: (updatedUser as any).email,
                changedAt: new Date(), sessionsRevoked, tokensRevoked, requiresLogin: true,
            };
        } catch (error: unknown) {
            LoggerUtil.error('Verify password change OTP failed', { error: (error as Error).message, userId, correlationId });
            throw error;
        }
    }

    static async requestPasswordReset(email: string, ipAddress: string) {
        const correlationId = uuidv4();
        try {
            const normalizedEmail = email.toLowerCase().trim();

            // 1. Per-Email rate limit: max 5 requests per email per 15 minutes (900 seconds)
            const emailRateKey = `password_reset_email:${normalizedEmail}`;
            const emailRequests = await CacheUtil.get(emailRateKey);
            if (emailRequests && parseInt(String(emailRequests), 10) >= 5) {
                throw new Error('Too many password reset requests for this email. Please try again later.');
            }

            // 2. Per-IP rate limit:
            // Local/internal/docker gateway IPs are allowed up to 100 requests per 15m.
            // External public IPs are capped at 20 requests per 15m to block brute-force/DoS.
            const isLocal = isLocalOrInternalIp(ipAddress);
            const ipLimit = isLocal ? 100 : 20;
            const ipRateKey = `password_reset_ip:${ipAddress}`;
            const ipRequests = await CacheUtil.get(ipRateKey);
            if (ipRequests && parseInt(String(ipRequests), 10) >= ipLimit) {
                throw new Error('Too many password reset requests from this network. Please try again later.');
            }

            const user = await User.findOne({ email: normalizedEmail }).select('userId email firstName').lean().exec();

            if (!user) {
                // Security: Don't reveal user doesn't exist, count attempt against IP and email
                await CacheUtil.incr(emailRateKey, 900);
                await CacheUtil.incr(ipRateKey, 900);
                return { success: true, message: 'If an account exists with this email, a reset code has been sent' };
            }

            const { otp, otpRecord } = await OTPVerification.createOTP({
                userId: (user as any).userId, otpType: 'password_reset', email: (user as any).email,
                expiryMinutes: 15, maxAttempts: 5, metadata: { ipAddress },
            });

            try {
                await sendEmail({
                    to: (user as any).email, subject: 'Password Reset Code',
                    template: 'password-reset',
                    data: { resetCode: otp, expiryMinutes: 15, userName: (user as any).firstName || (user as any).email, ipAddress },
                });
            } catch (emailError: unknown) {
                // If email infrastructure fails, remove the unused OTP record so delivery errors don't exhaust the user's limit
                if ((otpRecord as any)?._id) {
                    await OTPVerification.deleteOne({ _id: (otpRecord as any)._id }).catch(() => {});
                }
                throw emailError;
            }

            // Increment rate limits atomically with fixed 15-minute window (does NOT push TTL forward)
            await CacheUtil.incr(emailRateKey, 900);
            await CacheUtil.incr(ipRateKey, 900);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId: (user as any).userId, action: Constants.AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED, ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                timestamp: new Date().toISOString(), metadata: { email: (user as any).email, otpId: (otpRecord as any).otpId, correlationId },
            });

            return {
                success: true, message: 'Password reset code sent to your email',
                email: (user as any).email, expiresAt: (otpRecord as any).expiresAt, expiresIn: 900,
            };
        } catch (error: unknown) {
            LoggerUtil.error('Request password reset failed', { error: (error as Error).message, email, correlationId });
            throw error;
        }
    }

    static async verifyPasswordReset(email: string, resetCode: string, newPassword: string, ipAddress: string, userAgent: string) {
        const correlationId = uuidv4();
        try {
            const normalizedEmail = email.toLowerCase().trim();
            // Step 1: Find user
            const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash userId email firstName').lean().exec();
            if (!user) throw new Error('Invalid or expired reset code');

            // Step 2: Password strength
            const passwordStrength = zxcvbn(newPassword, [normalizedEmail, (user as any).userId]);
            if (passwordStrength.score < 3) {
                const feedbackMsg = [passwordStrength.feedback.warning, ...passwordStrength.feedback.suggestions]
                    .filter(Boolean).join(' ').trim();
                throw new Error(feedbackMsg ? `Password is too weak: ${feedbackMsg}` : 'Password is too weak. Please choose a stronger password.');
            }

            // Step 3: Password history
            const isRecentPassword = await PasswordHistory.isPasswordRecentlyUsed((user as any).userId, newPassword);
            if (isRecentPassword) throw new Error('Cannot reuse any of your last 5 passwords');

            // Step 4: Verify reset code
            const otpVerification = await OTPVerification.verifyOTPByType((user as any).userId, resetCode, 'password_reset', normalizedEmail);
            if (!(otpVerification as any)?.success) throw new Error('Invalid or expired reset code');

            // Step 5: Save to history
            if ((user as any).passwordHash) {
                await PasswordHistory.addPasswordToHistory((user as any).userId, (user as any).passwordHash, {
                    changedBy: 'reset', ipAddress, userAgent, reason: 'password_reset',
                });
            }

            // Step 6: Hash new password
            const salt = await bcrypt.genSalt(12);
            const newPasswordHash = await bcrypt.hash(newPassword, salt);

            // Step 7: Update user
            const updatedUser = await User.findOneAndUpdate(
                { userId: (user as any).userId },
                { $set: { passwordHash: newPasswordHash, passwordChangedAt: new Date(), loginAttempts: 0, hasLocalPassword: true }, $unset: { lockUntil: 1, accountLockedReason: 1 } },
                { new: true, runValidators: false }
            ).select('userId email firstName').exec();

            if (!updatedUser) throw new Error('Failed to reset password');

            // Step 8: Revoke all sessions
            let sessionsRevoked = 0;
            let tokensRevoked = 0;
            try {
                const [sessions, tokens] = await Promise.all([
                    Session.revokeAllUserSessions((user as any).userId, 'password_reset'),
                    RefreshToken.revokeAllUserTokens((user as any).userId, 'password_reset', 'system'),
                ]);
                sessionsRevoked = sessions || 0;
                tokensRevoked = tokens?.revokedCount || 0;
            } catch (revokeError: unknown) {
                LoggerUtil.error('Failed to revoke sessions/tokens (non-critical)', { error: (revokeError as Error).message, correlationId });
            }

            // Step 9: Confirmation email
            try {
                await sendEmail({
                    to: (updatedUser as any).email, subject: 'Password Reset Successful',
                    template: 'password-reset-success',
                    data: { userName: (updatedUser as any).firstName || (updatedUser as any).email, timestamp: new Date().toLocaleString(), ipAddress, userAgent },
                });
            } catch (emailError: unknown) {
                LoggerUtil.error('Failed to send password reset success email (non-critical)', { error: (emailError as Error).message, correlationId });
            }

            // Step 10: Audit (non-critical)
            try {
                await AuditProducer.sendAuditEvent({
                    eventId: uuidv4(), userId: (user as any).userId, action: Constants.AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED, ipAddress,
                    status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.HIGH as 'HIGH',
                    timestamp: new Date().toISOString(),
                    metadata: { email: (updatedUser as any).email, passwordStrength: passwordStrength.score, sessionsRevoked, tokensRevoked, correlationId },
                });
            } catch (auditError: unknown) {
                LoggerUtil.error('Failed to send password reset audit event (non-critical)', { error: (auditError as Error).message, correlationId });
            }

            return {
                success: true, message: 'Password reset successfully. You can now login with your new password.',
                userId: (updatedUser as any).userId, email: (updatedUser as any).email, resetAt: new Date(),
            };
        } catch (error: unknown) {
            LoggerUtil.error('Verify password reset failed', { error: (error as Error).message, email, correlationId });
            throw error;
        }
    }
}

export default PasswordService;