import { v4 as uuidv4 } from 'uuid';
import OTPVerification from '../models/OTPVerification.model';
import User from '../models/User.model';
import CacheUtil from '@/shared/cache.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import NotificationService from './notification.service';
import Constants from '@/shared/constants.util';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== AADHAAR HELPERS ====================

/**
 * Validate Aadhaar format: 12 digits, displayed as XXXX XXXX XXXX
 * Accepts: "1234 5678 9012" or "123456789012"
 */
export function validateAadhaarFormat(aadhaar: string): { isValid: boolean; cleaned: string; last4: string } {
    const cleaned = aadhaar.replace(/\s/g, '');
    const isValid = /^\d{12}$/.test(cleaned) && !/^[0-1]/.test(cleaned); // Aadhaar cannot start with 0 or 1
    return {
        isValid,
        cleaned,
        last4: cleaned.slice(-4),
    };
}

/**
 * Validate company email — domain must NOT be a free/personal provider
 * Comment out the check below for testing with dummy emails
 */
const FREE_EMAIL_DOMAINS = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'icloud.com', 'protonmail.com', 'ymail.com', 'live.com',
    'aol.com', 'mail.com', 'zoho.com', 'rediffmail.com',
    'yandex.com', 'gmx.com', 'tutanota.com',
];

export function validateCompanyEmail(email: string): { isValid: boolean; domain: string; errors: string[] } {
    const errors: string[] = [];
    const lower = email.toLowerCase().trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(lower)) {
        errors.push('Invalid email format');
        return { isValid: false, domain: '', errors };
    }

    const domain = lower.split('@')[1];

    // ==================== COMMENT OUT BELOW FOR TESTING ====================
    // if (FREE_EMAIL_DOMAINS.includes(domain)) {
    //     errors.push(`"${domain}" is a personal email provider. Please use your company/work email.`);
    // }
    // ==================== END COMMENT OUT ====================

    return { isValid: errors.length === 0, domain, errors };
}

// ==================== SERVICE ====================

class IdentityVerificationService {

    // ==================== AADHAAR ====================

    static async sendAadhaarOTP(userId: string, aadhaarNumber: string, ipAddress: string): Promise<object> {
        const correlationId = uuidv4();
        try {
            const aadhaarValidation = validateAadhaarFormat(aadhaarNumber);
            if (!aadhaarValidation.isValid) {
                throw new Error('Invalid Aadhaar number. Must be 12 digits and cannot start with 0 or 1.');
            }

            // Rate limit
            const rateLimitKey = `${Constants.CACHE_PREFIXES.AADHAAR_VERIFY_RATE}${userId}`;
            const requests = await CacheUtil.get(rateLimitKey) as string | null;
            if (requests && parseInt(requests) >= 3) {
                throw new Error('Too many Aadhaar verification requests. Please try again after 1 hour.');
            }

            const user = await User.findOne({ userId }).select('email aadhaarVerified').lean().exec();
            if (!user) throw new Error('User not found');

            if ((user as any).aadhaarVerified) {
                return { success: true, alreadyVerified: true, message: 'Aadhaar is already verified' };
            }

            // DUMMY: In production, call UIDAI API here to send OTP to Aadhaar-linked mobile
            // For now, we generate our own OTP and send via email
            const { otp, otpRecord } = await OTPVerification.createOTP({
                userId,
                otpType: 'aadhaar_verification',
                email: (user as any).email,
                expiryMinutes: 10,
                maxAttempts: 3,
                metadata: {
                    ipAddress,
                    aadhaarLast4: aadhaarValidation.last4,
                    // In production: store UIDAI txnId here
                },
            });

            // Send OTP via email (dummy — in prod this comes from UIDAI to mobile)
            await NotificationService.sendEmail({
                to: (user as any).email,
                subject: 'Aadhaar Verification OTP',
                template: 'aadhaar-verification-otp',
                data: {
                    otp,
                    aadhaarLast4: aadhaarValidation.last4,
                    expiryMinutes: 10,
                },
            });

            const newRequests = requests ? parseInt(requests) + 1 : 1;
            await CacheUtil.set(rateLimitKey, newRequests.toString(), 3600);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(),
                userId,
                action: Constants.AUDIT_ACTIONS.AADHAAR_VERIFICATION_OTP_SENT,
                ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS',
                severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                timestamp: new Date().toISOString(),
                metadata: { aadhaarLast4: aadhaarValidation.last4, correlationId },
            });

            return {
                success: true,
                message: 'OTP sent to your registered email (dummy: in production it goes to Aadhaar-linked mobile)',
                expiresAt: (otpRecord as any).expiresAt,
                expiresIn: 600,
                aadhaarLast4: aadhaarValidation.last4,
            };
        } catch (error: any) {
            LoggerUtil.error('Send Aadhaar OTP failed', { error: error.message, userId, correlationId });
            throw error;
        }
    }

    static async verifyAadhaarOTP(userId: string, otp: string, ipAddress: string): Promise<object> {
        const correlationId = uuidv4();
        try {
            const user = await User.findOne({ userId }).select('email aadhaarVerified').lean().exec();
            if (!user) throw new Error('User not found');

            if ((user as any).aadhaarVerified) {
                return { success: true, alreadyVerified: true, message: 'Aadhaar is already verified' };
            }

            const verificationResult = await OTPVerification.verifyOTPByType(userId, otp, 'aadhaar_verification');

            // Get OTP record to retrieve aadhaarLast4 from metadata
            const otpRecord = await OTPVerification.findOne({ otpId: (verificationResult as any).otpId }).select('metadata').lean().exec();
            const aadhaarLast4 = (otpRecord as any)?.metadata?.aadhaarLast4;

            await User.findOneAndUpdate(
                { userId },
                {
                    $set: {
                        aadhaarVerified: true,
                        aadhaarVerifiedAt: new Date(),
                        aadhaarLast4: aadhaarLast4,
                    },
                }
            );

            // Clear rate limit
            await CacheUtil.del(`${Constants.CACHE_PREFIXES.AADHAAR_VERIFY_RATE}${userId}`);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(),
                userId,
                action: Constants.AUDIT_ACTIONS.AADHAAR_VERIFIED,
                ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS',
                severity: Constants.AUDIT_SEVERITIES.LOW as 'LOW',
                timestamp: new Date().toISOString(),
                metadata: { aadhaarLast4, verifiedAt: new Date().toISOString(), correlationId },
            });

            return {
                success: true,
                message: 'Aadhaar verified successfully',
                aadhaarVerified: true,
                verifiedAt: new Date().toISOString(),
            };
        } catch (error: any) {
            LoggerUtil.error('Aadhaar OTP verification failed', { error: error.message, userId, correlationId });
            throw error;
        }
    }

    static async getAadhaarVerificationStatus(userId: string): Promise<object> {
        const user = await User.findOne({ userId }).select('aadhaarVerified aadhaarVerifiedAt').lean().exec();
        if (!user) throw new Error('User not found');
        return {
            aadhaarVerified: (user as any).aadhaarVerified || false,
            aadhaarVerifiedAt: (user as any).aadhaarVerifiedAt || null,
        };
    }

    // ==================== COMPANY EMAIL ====================

    static async sendCompanyEmailOTP(userId: string, companyEmail: string, ipAddress: string): Promise<object> {
        const correlationId = uuidv4();
        try {
            const emailValidation = validateCompanyEmail(companyEmail);
            if (!emailValidation.isValid) {
                throw new Error(emailValidation.errors.join(', '));
            }

            const rateLimitKey = `${Constants.CACHE_PREFIXES.COMPANY_EMAIL_VERIFY_RATE}${userId}`;
            const requests = await CacheUtil.get(rateLimitKey) as string | null;
            if (requests && parseInt(requests) >= 3) {
                throw new Error('Too many company email verification requests. Please try again after 1 hour.');
            }

            const user = await User.findOne({ userId }).select('companyEmailVerified companyEmail').lean().exec();
            if (!user) throw new Error('User not found');

            if ((user as any).companyEmailVerified && (user as any).companyEmail === companyEmail.toLowerCase()) {
                return { success: true, alreadyVerified: true, message: 'Company email is already verified' };
            }

            const { otp, otpRecord } = await OTPVerification.createOTP({
                userId,
                otpType: 'company_email_verification',
                email: companyEmail.toLowerCase(),
                expiryMinutes: 10,
                maxAttempts: 3,
                metadata: { ipAddress, companyEmail: companyEmail.toLowerCase(), domain: emailValidation.domain },
            });

            await NotificationService.sendEmail({
                to: companyEmail,
                subject: 'Company Email Verification OTP',
                template: 'company-email-verification-otp',
                data: {
                    otp,
                    companyEmail,
                    domain: emailValidation.domain,
                    expiryMinutes: 10,
                },
            });

            const newRequests = requests ? parseInt(requests) + 1 : 1;
            await CacheUtil.set(rateLimitKey, newRequests.toString(), 3600);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(),
                userId,
                action: Constants.AUDIT_ACTIONS.COMPANY_EMAIL_OTP_SENT,
                ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS',
                severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                timestamp: new Date().toISOString(),
                metadata: { companyEmail: companyEmail.toLowerCase(), domain: emailValidation.domain, correlationId },
            });

            return {
                success: true,
                message: `OTP sent to ${companyEmail}`,
                expiresAt: (otpRecord as any).expiresAt,
                expiresIn: 600,
                domain: emailValidation.domain,
            };
        } catch (error: any) {
            LoggerUtil.error('Send company email OTP failed', { error: error.message, userId, correlationId });
            throw error;
        }
    }

    static async verifyCompanyEmailOTP(userId: string, otp: string, ipAddress: string): Promise<object> {
        const correlationId = uuidv4();
        try {
            const user = await User.findOne({ userId }).select('companyEmailVerified').lean().exec();
            if (!user) throw new Error('User not found');

            const verificationResult = await OTPVerification.verifyOTPByType(userId, otp, 'company_email_verification');

            const otpRecord = await OTPVerification.findOne({ otpId: (verificationResult as any).otpId }).select('metadata').lean().exec();
            const companyEmail = (otpRecord as any)?.metadata?.companyEmail;

            await User.findOneAndUpdate(
                { userId },
                {
                    $set: {
                        companyEmailVerified: true,
                        companyEmailVerifiedAt: new Date(),
                        companyEmail,
                    },
                }
            );

            await CacheUtil.del(`${Constants.CACHE_PREFIXES.COMPANY_EMAIL_VERIFY_RATE}${userId}`);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(),
                userId,
                action: Constants.AUDIT_ACTIONS.COMPANY_EMAIL_VERIFIED,
                ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS',
                severity: Constants.AUDIT_SEVERITIES.LOW as 'LOW',
                timestamp: new Date().toISOString(),
                metadata: { companyEmail, verifiedAt: new Date().toISOString(), correlationId },
            });

            return {
                success: true,
                message: 'Company email verified successfully',
                companyEmailVerified: true,
                companyEmail,
                verifiedAt: new Date().toISOString(),
            };
        } catch (error: any) {
            LoggerUtil.error('Company email OTP verification failed', { error: error.message, userId, correlationId });
            throw error;
        }
    }

    static async getCompanyEmailVerificationStatus(userId: string): Promise<object> {
        const user = await User.findOne({ userId }).select('companyEmailVerified companyEmailVerifiedAt companyEmail').lean().exec();
        if (!user) throw new Error('User not found');
        return {
            companyEmailVerified: (user as any).companyEmailVerified || false,
            companyEmailVerifiedAt: (user as any).companyEmailVerifiedAt || null,
            companyEmail: (user as any).companyEmail || null,
        };
    }
}

export default IdentityVerificationService;