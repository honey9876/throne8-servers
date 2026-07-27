import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import EmailVerificationService from '../services/emailVerification.service';
import ComplianceService from '../services/compliance.service';
import ResponseUtil from '@/shared/response.util';
import ValidatorUtil from '@/shared/utils/validator.util';
import { Device, User } from '../models';
import { LoggerUtil } from '@/shared/logger.util';
import Constants from '@/shared/constants.util';
import CacheUtil from '@/shared/cache.util';
import OTPVerification from '../models/OTPVerification.model';
import NotificationService from '../services/notification.service';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import IdentityVerificationService, { validateCompanyEmail } from '../services/identityVerification.service';


class EmailVerificationController {

    static async sendEmailOTP(req: Request, res: Response): Promise<Response> {
        const correlationId = (req as any).correlationId || uuidv4();
        try {
            const { email } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';

            if (!email) return ResponseUtil.validationError(res, ['Email is required'], 'Validation failed');

            const validation = await ValidatorUtil.validateEmail(email);
            if (!validation.isValid) return ResponseUtil.validationError(res, validation.errors, 'Invalid email');

            let targetUserId = userId;
            if (!targetUserId) {
                const user = await User.findOne({ email: (validation.data as any).email }).select('userId emailVerified').lean().exec();
                if (!user) return ResponseUtil.notFound(res, 'User not found');
                targetUserId = user.userId;
            }

            const result = await EmailVerificationService.sendEmailOTP(targetUserId, (validation.data as any).email, ipAddress);
            return ResponseUtil.success(res, result, 'Verification code sent successfully', 200);
        } catch (error: any) {
            if (error.message.includes('rate limit') || error.message.includes('Too many')) {
                return ResponseUtil.tooManyRequests(res, error.message, { retryAfter: 3600 });
            }
            return ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async verifyEmailOTP(req: Request, res: Response): Promise<Response> {
        const correlationId = (req as any).correlationId || uuidv4();
        try {
            const { otp, email } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';

            if (!otp) return ResponseUtil.validationError(res, ['OTP is required'], 'Validation failed');
            if (!/^\d{6}$/.test(otp)) return ResponseUtil.validationError(res, ['OTP must be a 6-digit number'], 'Invalid OTP format');

            let targetUserId = userId;
            if (!targetUserId && email) {
                const user = await User.findOne({ email }).select('userId').lean().exec();
                if (!user) return ResponseUtil.notFound(res, 'User not found');
                targetUserId = user.userId;
            }

            if (!targetUserId) return ResponseUtil.badRequest(res, 'User ID or email required');

            const result = await EmailVerificationService.verifyEmailOTP(targetUserId, otp, ipAddress);
            return ResponseUtil.success(res, result, 'Email verified successfully', 200);
        } catch (error: any) {
            if (error.message.includes('Invalid OTP') || error.message.includes('expired')) {
                return ResponseUtil.badRequest(res, error.message);
            }
            if (error.message.includes('Maximum') || error.message.includes('attempts')) {
                return ResponseUtil.tooManyRequests(res, error.message, { retryAfter: 600 });
            }
            return ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async resendEmailOTP(req: Request, res: Response): Promise<Response> {
        try {
            const { email } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';

            let targetUserId = userId;
            if (!targetUserId && email) {
                const user = await User.findOne({ email }).select('userId').lean().exec();
                if (!user) return ResponseUtil.notFound(res, 'User not found');
                targetUserId = user.userId;
            }

            if (!targetUserId) return ResponseUtil.badRequest(res, 'User ID or email required');

            const result = await EmailVerificationService.resendEmailOTP(targetUserId, ipAddress);
            return ResponseUtil.success(res, result, 'Verification code resent successfully', 200);
        } catch (error: any) {
            if (error.message.includes('rate limit') || error.message.includes('Too many')) {
                return ResponseUtil.tooManyRequests(res, error.message, { retryAfter: 3600 });
            }
            return ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async getEmailVerificationStatus(req: Request, res: Response): Promise<Response> {
        try {
            const userId = (req as any).user?.userId;
            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');

            const statusResult = await EmailVerificationService.checkEmailVerificationStatus(userId) as any;
            let pendingOTP = null;
            if (!statusResult.emailVerified) {
                pendingOTP = await EmailVerificationService.getPendingOTPInfo(userId);
            }

            return ResponseUtil.success(res, { emailVerified: statusResult.emailVerified, pendingOTP }, 'Email verification status retrieved', 200);
        } catch (error: any) {
            return ResponseUtil.internalError(res, error.message, error);
        }
    }

    // ==================== DEVICE VERIFICATION ====================

    static async sendDeviceOTP(req: Request, res: Response): Promise<Response> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';
            const { deviceType, deviceName, os, browser, userAgent } = req.body;

            LoggerUtil.info('Send device verification OTP', { userId, ipAddress, correlationId });

            if (!userId) {
                return ResponseUtil.unauthorized(res, 'Authentication required');
            }

            const user = await User.findOne({ userId }).select('email phoneNumber').lean().exec();
            if (!user) return ResponseUtil.notFound(res, 'User not found');

            const deviceFingerprint = crypto
                .createHash('sha256')
                .update(`${userAgent || req.headers['user-agent']}-${deviceType}-${os}`)
                .digest('hex');

            const rateLimitKey = `${Constants.CACHE_PREFIXES.PHONE_VERIFY_RATE}${userId}`;
            const requests = await CacheUtil.get(rateLimitKey) as string | null;

            if (requests && parseInt(requests) >= 3) {
                return ResponseUtil.tooManyRequests(res, 'Too many device verification requests', { retryAfter: 3600 });
            }

            const { otp, otpRecord } = await OTPVerification.createOTP({
                userId,
                otpType: 'device_verification',
                email: (user as any).email,
                phoneNumber: (user as any).phoneNumber,
                expiryMinutes: 15,
                maxAttempts: 3,
                metadata: { ipAddress, deviceFingerprint, deviceType, deviceName, os, browser },
            });

            await NotificationService.sendEmail({
                to: (user as any).email,
                subject: 'New Device Login - Verification Required',
                template: 'device-verification',
                data: {
                    otp,
                    deviceInfo: {
                        type: deviceType || 'Unknown',
                        name: deviceName || 'Unknown Device',
                        os: os || 'Unknown',
                        browser: browser || 'Unknown',
                    },
                    location: ipAddress,
                    timestamp: new Date().toLocaleString(),
                    expiryMinutes: 15,
                },
            });

            const newRequests = requests ? parseInt(requests) + 1 : 1;
            await CacheUtil.set(rateLimitKey, newRequests.toString(), 3600);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(),
                userId,
                action: 'DEVICE_VERIFICATION_OTP_SENT',
                ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS',
                severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                timestamp: new Date().toISOString(),
                metadata: { otpId: (otpRecord as any).otpId, deviceFingerprint, correlationId },
            });

            return ResponseUtil.success(res, {
                message: 'Verification code sent to your email',
                expiresAt: (otpRecord as any).expiresAt,
                expiresIn: 900,
            }, 'Device verification code sent', 200);

        } catch (error: unknown) {
            LoggerUtil.error('Send device OTP failed', { error: (error as Error).message, correlationId });
            return ResponseUtil.internalError(res, (error as Error).message, error as Error);
        }
    }

    static async verifyDeviceOTP(req: Request, res: Response): Promise<Response> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { otp } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';

            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            if (!otp || !/^\d{6}$/.test(otp)) return ResponseUtil.validationError(res, ['Valid 6-digit OTP required'], 'Invalid OTP');

            const verificationResult = await OTPVerification.verifyOTPByType(userId, otp, 'device_verification');

            const otpRecord = await OTPVerification.findOne({ otpId: (verificationResult as any).otpId }).select('metadata').lean().exec();
            if (!otpRecord || !(otpRecord as any).metadata) throw new Error('Device information not found');

            const meta = (otpRecord as any).metadata;
            const device = await Device.registerDevice(userId, {
                deviceType: meta.deviceType || 'unknown',
                deviceName: meta.deviceName || 'Unknown Device',
                os: meta.os || 'Unknown',
                browser: meta.browser || 'Unknown',
                userAgent: req.headers['user-agent'] || 'Unknown',
                fingerprint: meta.deviceFingerprint,
            });

            (device as any).isVerified = true;
            (device as any).verifiedAt = new Date();
            await (device as any).save();

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(),
                userId,
                action: 'DEVICE_VERIFIED',
                ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS',
                severity: Constants.AUDIT_SEVERITIES.LOW as 'LOW',
                timestamp: new Date().toISOString(),
                metadata: { deviceId: (device as any).deviceId, correlationId },
            });

            return ResponseUtil.success(res, {
                success: true,
                deviceId: (device as any).deviceId,
                deviceName: (device as any).deviceName,
                verifiedAt: (device as any).verifiedAt,
            }, 'Device verified successfully', 200);

        } catch (error: unknown) {
            const msg = (error as Error).message;
            if (msg.includes('Invalid OTP') || msg.includes('expired')) return ResponseUtil.badRequest(res, msg);
            return ResponseUtil.internalError(res, msg, error as Error);
        }
    }

    // ==================== STEP-UP AUTHENTICATION ====================

    static async sendStepUpOTP(req: Request, res: Response): Promise<Response> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { action } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';

            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            if (!action) return ResponseUtil.validationError(res, ['Action is required'], 'Validation failed');

            const user = await User.findOne({ userId }).select('email emailVerified').lean().exec();
            if (!user) return ResponseUtil.notFound(res, 'User not found');
            if (!(user as any).emailVerified) return ResponseUtil.forbidden(res, 'Email verification required');

            const rateLimitKey = `stepup:requests:${userId}`;
            const requests = await CacheUtil.get(rateLimitKey) as string | null;
            if (requests && parseInt(requests) >= 3) {
                return ResponseUtil.tooManyRequests(res, 'Too many step-up authentication requests', { retryAfter: 900 });
            }

            const { otp, otpRecord } = await OTPVerification.createOTP({
                userId,
                otpType: 'step_up_auth',
                email: (user as any).email,
                expiryMinutes: 10,
                maxAttempts: 3,
                metadata: { ipAddress, action },
            });

            await NotificationService.sendEmail({
                to: (user as any).email,
                subject: 'Security Verification Required',
                template: 'step-up-otp',
                data: { otp, action, ipAddress, timestamp: new Date().toLocaleString(), expiryMinutes: 10 },
            });

            const newRequests = requests ? parseInt(requests) + 1 : 1;
            await CacheUtil.set(rateLimitKey, newRequests.toString(), 900);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId, action: 'STEPUP_OTP_SENT', ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                timestamp: new Date().toISOString(), metadata: { otpId: (otpRecord as any).otpId, action, correlationId },
            });

            return ResponseUtil.success(res, {
                message: 'Verification code sent to your email', action,
                expiresAt: (otpRecord as any).expiresAt, expiresIn: 600,
            }, 'Step-up verification code sent', 200);

        } catch (error: unknown) {
            LoggerUtil.error('Send step-up OTP failed', { error: (error as Error).message, correlationId });
            return ResponseUtil.internalError(res, (error as Error).message, error as Error);
        }
    }

    static async verifyStepUpOTP(req: Request, res: Response): Promise<Response> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { otp, action } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';

            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            if (!otp || !/^\d{6}$/.test(otp)) return ResponseUtil.validationError(res, ['Valid 6-digit OTP required'], 'Invalid OTP');

            await OTPVerification.verifyOTPByType(userId, otp, 'step_up_auth');

            const stepUpToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(stepUpToken).digest('hex');

            await CacheUtil.set(`stepup:token:${hashedToken}`, JSON.stringify({
                userId, action, ipAddress, timestamp: new Date().toISOString(), verified: true,
            }), 1800);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId, action: 'STEPUP_VERIFICATION_SUCCESS', ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.LOW as 'LOW',
                timestamp: new Date().toISOString(), metadata: { action, correlationId },
            });

            return ResponseUtil.success(res, {
                success: true, stepUpToken, action, expiresIn: 1800,
                message: 'Verification successful. You may proceed with the action.',
            }, 'Step-up verification successful', 200);

        } catch (error: unknown) {
            const msg = (error as Error).message;
            if (msg.includes('Invalid OTP') || msg.includes('expired')) return ResponseUtil.badRequest(res, msg);
            return ResponseUtil.internalError(res, msg, error as Error);
        }
    }

    // ==================== COMPLIANCE ====================

    static async check90DayPasswordStatus(req: Request, res: Response): Promise<Response> {
        const correlationId = (req as any).correlationId || uuidv4();
        try {
            const userId = (req as any).user?.userId;
            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            const status = await ComplianceService.check90DayPasswordCompliance(userId);
            return ResponseUtil.success(res, status, 'Compliance status retrieved', 200);
        } catch (error: unknown) {
            return ResponseUtil.internalError(res, (error as Error).message, error as Error);
        }
    }

    static async verify90DayPassword(req: Request, res: Response): Promise<Response> {
        const correlationId = (req as any).correlationId || uuidv4();
        try {
            const { password } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';
            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            if (!password) return ResponseUtil.validationError(res, ['Password is required'], 'Validation failed');
            const result = await ComplianceService.enforce90DayPasswordReVerification(userId, password);
            return ResponseUtil.success(res, result, 'Password re-verified successfully', 200);
        } catch (error: unknown) {
            const msg = (error as Error).message;
            if (msg.includes('Invalid password')) return ResponseUtil.unauthorized(res, 'Invalid password');
            return ResponseUtil.internalError(res, msg, error as Error);
        }
    }

    static async checkAnnualIdentityStatus(req: Request, res: Response): Promise<Response> {
        try {
            const userId = (req as any).user?.userId;
            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            const status = await ComplianceService.checkAnnualIdentityCompliance(userId);
            return ResponseUtil.success(res, status, 'Compliance status retrieved', 200);
        } catch (error: unknown) {
            return ResponseUtil.internalError(res, (error as Error).message, error as Error);
        }
    }

    static async sendAnnualIdentityOTP(req: Request, res: Response): Promise<Response> {
        try {
            const { verificationType } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';
            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            if (!verificationType || !['email', 'phone'].includes(verificationType)) {
                return ResponseUtil.validationError(res, ['verificationType must be "email" or "phone"'], 'Validation failed');
            }
            const result = await ComplianceService.sendAnnualIdentityReCheckOTP(userId, verificationType, ipAddress);
            return ResponseUtil.success(res, result, 'Verification code sent', 200);
        } catch (error: unknown) {
            return ResponseUtil.internalError(res, (error as Error).message, error as Error);
        }
    }

    static async verifyAnnualIdentityOTP(req: Request, res: Response): Promise<Response> {
        try {
            const { otp, verificationType } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';
            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            if (!otp || !/^\d{6}$/.test(otp)) return ResponseUtil.validationError(res, ['Valid 6-digit OTP required'], 'Invalid OTP');
            if (!verificationType || !['email', 'phone'].includes(verificationType)) {
                return ResponseUtil.validationError(res, ['verificationType must be "email" or "phone"'], 'Validation failed');
            }
            const result = await ComplianceService.verifyAnnualIdentityReCheckOTP(userId, otp, verificationType, ipAddress);
            return ResponseUtil.success(res, result, 'Identity re-verified successfully', 200);
        } catch (error: unknown) {
            const msg = (error as Error).message;
            if (msg.includes('Invalid OTP') || msg.includes('expired')) return ResponseUtil.badRequest(res, msg);
            return ResponseUtil.internalError(res, msg, error as Error);
        }
    }

    static async checkUnusualActivity(req: Request, res: Response): Promise<Response> {
        try {
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';
            const userAgent = req.headers['user-agent'] || 'Unknown';
            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            const result = await ComplianceService.detectUnusualActivity(userId, ipAddress, userAgent);
            if ((result as any).isUnusual && (result as any).requiresVerification) {
                await ComplianceService.sendUnusualActivityVerification(userId, result as any, ipAddress);
            }
            return ResponseUtil.success(res, result, 'Activity check completed', 200);
        } catch (error: unknown) {
            return ResponseUtil.internalError(res, (error as Error).message, error as Error);
        }
    }

    static async verifyUnusualActivityOTP(req: Request, res: Response): Promise<Response> {
        try {
            const { otp } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';
            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            if (!otp || !/^\d{6}$/.test(otp)) return ResponseUtil.validationError(res, ['Valid 6-digit OTP required'], 'Invalid OTP');

            await OTPVerification.verifyOTPByType(userId, otp, 'unusual_activity_verification');
            await CacheUtil.set(`activity_verified:${userId}:${ipAddress}`, 'true', 24 * 60 * 60);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId, action: 'UNUSUAL_ACTIVITY_VERIFIED', ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.LOW as 'LOW',
                timestamp: new Date().toISOString(), metadata: {},
            });

            return ResponseUtil.success(res, {
                success: true, message: 'Activity verified successfully', verifiedAt: new Date().toISOString(),
            }, 'Activity verified', 200);

        } catch (error: unknown) {
            const msg = (error as Error).message;
            if (msg.includes('Invalid OTP') || msg.includes('expired')) return ResponseUtil.badRequest(res, msg);
            return ResponseUtil.internalError(res, msg, error as Error);
        }
    }

    static async checkSuspiciousLocation(req: Request, res: Response): Promise<Response> {
        try {
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';
            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            const result = await ComplianceService.checkSuspiciousLocation(userId, ipAddress);
            if ((result as any).isSuspicious && (result as any).requiresVerification) {
                await ComplianceService.sendSuspiciousLocationVerification(userId, (result as any).location, ipAddress);
            }
            return ResponseUtil.success(res, result, 'Location check completed', 200);
        } catch (error: unknown) {
            return ResponseUtil.internalError(res, (error as Error).message, error as Error);
        }
    }

    static async verifySuspiciousLocation(req: Request, res: Response): Promise<Response> {
        try {
            const { token } = req.params;
            if (!token) return ResponseUtil.validationError(res, ['Verification token required'], 'Validation failed');
            const result = await ComplianceService.verifySuspiciousLocation(token);
            return ResponseUtil.success(res, result, 'Location verified successfully', 200);
        } catch (error: unknown) {
            const msg = (error as Error).message;
            if (msg.includes('Invalid or expired')) return ResponseUtil.badRequest(res, 'Invalid or expired verification link');
            return ResponseUtil.internalError(res, msg, error as Error);
        }
    }

    // ==================== AADHAAR VERIFICATION ====================

    static async sendAadhaarOTP(req: Request, res: Response): Promise<Response> {
        const correlationId = (req as any).correlationId || uuidv4();
        try {
            const { aadhaarNumber } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';

            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            if (!aadhaarNumber) return ResponseUtil.validationError(res, ['Aadhaar number is required'], 'Validation failed');

            // Strict format: 12 digits, optionally with spaces like "1234 5678 9012"
            const cleaned = aadhaarNumber.replace(/\s/g, '');
            if (!/^\d{12}$/.test(cleaned)) {
                return ResponseUtil.validationError(res, ['Aadhaar number must be exactly 12 digits (format: XXXX XXXX XXXX)'], 'Invalid Aadhaar');
            }
            if (/^[01]/.test(cleaned)) {
                return ResponseUtil.validationError(res, ['Invalid Aadhaar number'], 'Invalid Aadhaar');
            }

            const result = await IdentityVerificationService.sendAadhaarOTP(userId, cleaned, ipAddress);
            return ResponseUtil.success(res, result, 'Aadhaar OTP sent successfully', 200);
        } catch (error: any) {
            if (error.message.includes('Too many') || error.message.includes('rate limit')) {
                return ResponseUtil.tooManyRequests(res, error.message, { retryAfter: 3600 });
            }
            return ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async verifyAadhaarOTP(req: Request, res: Response): Promise<Response> {
        const correlationId = (req as any).correlationId || uuidv4();
        try {
            const { otp } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';

            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            if (!otp || !/^\d{6}$/.test(otp)) return ResponseUtil.validationError(res, ['Valid 6-digit OTP required'], 'Invalid OTP');

            const result = await IdentityVerificationService.verifyAadhaarOTP(userId, otp, ipAddress);
            return ResponseUtil.success(res, result, 'Aadhaar verified successfully', 200);
        } catch (error: any) {
            if (error.message.includes('Invalid OTP') || error.message.includes('expired')) {
                return ResponseUtil.badRequest(res, error.message);
            }
            if (error.message.includes('Maximum') || error.message.includes('attempts')) {
                return ResponseUtil.tooManyRequests(res, error.message, { retryAfter: 600 });
            }
            return ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async getAadhaarVerificationStatus(req: Request, res: Response): Promise<Response> {
        try {
            const userId = (req as any).user?.userId;
            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            const result = await IdentityVerificationService.getAadhaarVerificationStatus(userId);
            return ResponseUtil.success(res, result, 'Aadhaar verification status retrieved', 200);
        } catch (error: any) {
            return ResponseUtil.internalError(res, error.message, error);
        }
    }

    // ==================== COMPANY EMAIL VERIFICATION ====================

    static async sendCompanyEmailOTP(req: Request, res: Response): Promise<Response> {
        const correlationId = (req as any).correlationId || uuidv4();
        try {
            const { companyEmail } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';

            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            if (!companyEmail) return ResponseUtil.validationError(res, ['Company email is required'], 'Validation failed');

            const emailValidation = validateCompanyEmail(companyEmail);
            if (!emailValidation.isValid) {
                return ResponseUtil.validationError(res, emailValidation.errors, 'Invalid company email');
            }

            const result = await IdentityVerificationService.sendCompanyEmailOTP(userId, companyEmail, ipAddress);
            return ResponseUtil.success(res, result, 'Company email OTP sent successfully', 200);
        } catch (error: any) {
            if (error.message.includes('Too many') || error.message.includes('rate limit')) {
                return ResponseUtil.tooManyRequests(res, error.message, { retryAfter: 3600 });
            }
            return ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async verifyCompanyEmailOTP(req: Request, res: Response): Promise<Response> {
        const correlationId = (req as any).correlationId || uuidv4();
        try {
            const { otp } = req.body;
            const userId = (req as any).user?.userId;
            const ipAddress = req.ip || '0.0.0.0';

            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            if (!otp || !/^\d{6}$/.test(otp)) return ResponseUtil.validationError(res, ['Valid 6-digit OTP required'], 'Invalid OTP');

            const result = await IdentityVerificationService.verifyCompanyEmailOTP(userId, otp, ipAddress);
            return ResponseUtil.success(res, result, 'Company email verified successfully', 200);
        } catch (error: any) {
            if (error.message.includes('Invalid OTP') || error.message.includes('expired')) {
                return ResponseUtil.badRequest(res, error.message);
            }
            if (error.message.includes('Maximum') || error.message.includes('attempts')) {
                return ResponseUtil.tooManyRequests(res, error.message, { retryAfter: 600 });
            }
            return ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async getCompanyEmailVerificationStatus(req: Request, res: Response): Promise<Response> {
        try {
            const userId = (req as any).user?.userId;
            if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');
            const result = await IdentityVerificationService.getCompanyEmailVerificationStatus(userId);
            return ResponseUtil.success(res, result, 'Company email verification status retrieved', 200);
        } catch (error: any) {
            return ResponseUtil.internalError(res, error.message, error);
        }
    }

}

export default EmailVerificationController;