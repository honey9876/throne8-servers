/**
 * Verification Validator Utility - TypeScript
 * Handles all verification-related input validation:
 * - Email verification (OTP + token)
 * - Phone verification
 * - Device verification
 * - Step-up authentication
 * - Password change/reset (OTP-based)
 * - Compliance verifications
 *
 * @module utils/verification.validator
 * @version 1.0.0
 */

import Joi from 'joi';
import validator from 'validator';
import zxcvbn from 'zxcvbn';
import { LoggerUtil } from '@/shared/logger.util';

// ==================== TYPES ====================

interface ValidationResult<T = Record<string, any>> {
    isValid: boolean;
    errors: string[];
    data?: T;
}

interface EmailValidationData {
    email: string;
    domain: string;
}

interface OTPValidationData {
    otp: string;
}

interface PhoneValidationData {
    phoneNumber: string;
}

interface PasswordChangeData {
    otp: string;
    newPassword: string;
}

interface PasswordResetData {
    email: string;
    resetCode: string;
    newPassword: string;
}

interface PasswordStrengthResult {
    score: number;
    crackTime?: string;
    feedback: {
        warning: string;
        suggestions: string[];
    };
    requirements?: {
        minLength: boolean;
        maxLength: boolean;
        hasUpperCase: boolean;
        hasLowerCase: boolean;
        hasNumbers: boolean;
        hasSpecialChars: boolean;
    };
    requirementsMet?: number;
    totalRequirements?: number;
    strength: string;
    isAcceptable: boolean;
    error?: string;
}

// ==================== BASE SCHEMAS ====================

const schemas = {
    otp: Joi.string()
        .length(6)
        .pattern(/^\d{6}$/)
        .required()
        .messages({
            'string.length': 'OTP must be 6 digits',
            'string.pattern.base': 'OTP must contain only numbers',
            'any.required': 'OTP is required',
        }),

    token64: Joi.string()
        .length(64)
        .pattern(/^[0-9a-fA-F]{64}$/)
        .required()
        .messages({
            'string.length': 'Invalid token format',
            'string.pattern.base': 'Token must be hexadecimal',
            'any.required': 'Verification token is required',
        }),

    phoneNumber: Joi.string()
        .pattern(/^\+?[1-9]\d{1,14}$/)
        .required()
        .messages({
            'string.pattern.base': 'Invalid phone number format (use E.164 format, e.g., +1234567890)',
            'any.required': 'Phone number is required',
        }),

    password: Joi.string()
        .min(8)
        .max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{}|;:,.<>])[A-Za-z\d@$!%*?&#^()_+\-=\[\]{}|;:,.<>]{8,}$/)
        .required()
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'string.max': 'Password must not exceed 128 characters',
            'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character',
            'any.required': 'Password is required',
        }),

    email: Joi.string()
        .email({ tlds: { allow: false } })
        .lowercase()
        .max(255)
        .required()
        .messages({
            'string.email': 'Invalid email format',
            'string.max': 'Email must be less than 255 characters',
            'any.required': 'Email is required',
        }),
};

// ==================== CORE VALIDATE HELPER ====================

async function validate<T>(
    data: unknown,
    schema: Joi.Schema,
    userId: string | null = null,
    ipAddress: string | null = null
): Promise<ValidationResult<T>> {
    try {
        if (!schema || typeof schema.validateAsync !== 'function') {
            LoggerUtil.error('Invalid schema provided to validator', { userId, ipAddress });
            return { isValid: false, errors: ['Internal validation error'] };
        }

        const result = await schema.validateAsync(data, {
            abortEarly: false,
            stripUnknown: true,
            convert: true,
        });

        return { isValid: true, errors: [], data: result as T };
    } catch (error: any) {
        const details = error.details
            ? error.details.map((d: any) => d.message).join('; ')
            : error.message;

        LoggerUtil.warn('Validation failed', {
            error: details,
            userId,
            ipAddress,
            path: error.details?.[0]?.path,
        });

        return {
            isValid: false,
            errors: error.details ? error.details.map((d: any) => d.message) : [error.message],
        };
    }
}

// ==================== VERIFICATION VALIDATOR CLASS ====================

class VerificationValidatorUtil {

    // ==================== EMAIL VERIFICATION ====================

    /**
     * Validate email address (basic + disposable domain check)
     */
    static async validateEmail(email: string): Promise<ValidationResult<EmailValidationData>> {
        const errors: string[] = [];

        if (!email) {
            errors.push('Email is required');
            return { isValid: false, errors };
        }

        const cleanEmail = email.trim().toLowerCase();
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (!emailRegex.test(cleanEmail)) {
            errors.push('Invalid email format');
            return { isValid: false, errors };
        }

        if (cleanEmail.length > 254) {
            errors.push('Email is too long');
            return { isValid: false, errors };
        }

        const disposableDomains = ['tempmail.com', 'throwaway.email', '10minutemail.com'];
        const domain = cleanEmail.split('@')[1];

        if (disposableDomains.includes(domain)) {
            errors.push('Disposable email addresses are not allowed');
            return { isValid: false, errors };
        }

        return { isValid: true, errors: [], data: { email: cleanEmail, domain } };
    }

    /**
     * Validate email verification OTP (6-digit)
     */
    static async validateEmailVerificationOTP(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<OTPValidationData>> {
        const schema = Joi.object({ otp: schemas.otp });
        return validate<OTPValidationData>(data, schema, userId, ipAddress);
    }

    /**
     * Validate email verification token (link-based, 64-char hex)
     */
    static async validateEmailVerificationToken(
        data: unknown,
        ipAddress: string
    ): Promise<ValidationResult<{ token: string }>> {
        const schema = Joi.object({ token: schemas.token64 });
        return validate<{ token: string }>(data, schema, null, ipAddress);
    }

    /**
     * Validate resend email verification request
     */
    static async validateResendEmailVerification(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<{ type: string }>> {
        const schema = Joi.object({
            type: Joi.string()
                .valid('link', 'otp')
                .default('link')
                .messages({ 'any.only': 'Type must be either "link" or "otp"' }),
        });
        return validate<{ type: string }>(data, schema, userId, ipAddress);
    }

    // ==================== PHONE VERIFICATION ====================

    /**
     * Validate phone number (E.164 format)
     */
    static validatePhoneNumber(phoneNumber: string): ValidationResult<PhoneValidationData> {
        const errors: string[] = [];

        if (!phoneNumber) {
            errors.push('Phone number is required');
            return { isValid: false, errors };
        }

        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        if (!phoneRegex.test(phoneNumber)) {
            errors.push('Invalid phone number format');
            return { isValid: false, errors };
        }

        return { isValid: true, errors: [], data: { phoneNumber } };
    }

    /**
     * Validate phone verification request body
     */
    static async validatePhoneVerificationRequest(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<{ phoneNumber: string; countryCode: string }>> {
        const schema = Joi.object({
            phoneNumber: schemas.phoneNumber,
            countryCode: Joi.string().pattern(/^\+\d{1,3}$/).optional().default('+91'),
        });
        return validate<{ phoneNumber: string; countryCode: string }>(data, schema, userId, ipAddress);
    }

    /**
     * Validate phone OTP
     */
    static async validatePhoneOTP(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<OTPValidationData>> {
        const schema = Joi.object({ otp: schemas.otp });
        return validate<OTPValidationData>(data, schema, userId, ipAddress);
    }

    // ==================== OTP (GENERIC) ====================

    /**
     * Validate OTP format (sync, generic use)
     */
    static validateOTP(otp: string, length: number = 6): ValidationResult<string> {
        const errors: string[] = [];

        if (!otp) {
            errors.push('Verification code is required');
        } else {
            const otpStr = otp.toString().trim();
            const pattern = new RegExp(`^\\d{${length}}$`);
            if (!pattern.test(otpStr)) {
                errors.push(`Verification code must be ${length} digits`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            data: errors.length === 0 ? otp.toString().trim() : undefined,
        };
    }

    // ==================== DEVICE VERIFICATION ====================

    /**
     * Validate device verification OTP
     */
    static async validateDeviceOTP(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<OTPValidationData>> {
        const schema = Joi.object({ otp: schemas.otp });
        return validate<OTPValidationData>(data, schema, userId, ipAddress);
    }

    /**
     * Validate send device OTP request body
     */
    static async validateSendDeviceOTP(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<{ deviceType: string; deviceName: string; os: string; browser: string; userAgent?: string }>> {
        const schema = Joi.object({
            deviceType: Joi.string().max(50).optional().default('unknown'),
            deviceName: Joi.string().max(100).optional().default('Unknown Device'),
            os: Joi.string().max(50).optional().default('Unknown'),
            browser: Joi.string().max(50).optional().default('Unknown'),
            userAgent: Joi.string().max(500).optional(),
        });
        return validate(data, schema, userId, ipAddress);
    }

    // ==================== STEP-UP AUTHENTICATION ====================

    /**
     * Validate send step-up OTP request
     */
    static async validateSendStepUpOTP(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<{ action: string }>> {
        const schema = Joi.object({
            action: Joi.string().min(1).max(100).required().messages({
                'any.required': 'Action is required',
                'string.empty': 'Action cannot be empty',
            }),
        });
        return validate<{ action: string }>(data, schema, userId, ipAddress);
    }

    /**
     * Validate verify step-up OTP request
     */
    static async validateVerifyStepUpOTP(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<{ otp: string; action: string }>> {
        const schema = Joi.object({
            otp: schemas.otp,
            action: Joi.string().min(1).max(100).required().messages({
                'any.required': 'Action is required',
            }),
        });
        return validate<{ otp: string; action: string }>(data, schema, userId, ipAddress);
    }

    // ==================== PASSWORD CHANGE (OTP-BASED) ====================

    /**
     * Validate password change via OTP
     * Used when user submits OTP + new password
     */
    static async validatePasswordChangeOTP(data: {
        otp?: string;
        newPassword?: string;
    }): Promise<ValidationResult<PasswordChangeData>> {
        const errors: string[] = [];
        const sanitized: Partial<PasswordChangeData> = {};

        try {
            // Validate OTP
            if (!data.otp) {
                errors.push('Verification code is required');
            } else {
                const otp = data.otp.toString().trim();
                if (!/^\d{6}$/.test(otp)) {
                    errors.push('Verification code must be 6 digits');
                } else {
                    sanitized.otp = otp;
                }
            }

            // Validate new password
            if (!data.newPassword) {
                errors.push('New password is required');
            } else {
                const password = data.newPassword.trim();
                if (password.length < 8) {
                    errors.push('Password must be at least 8 characters long');
                } else if (password.length > 128) {
                    errors.push('Password must not exceed 128 characters');
                } else {
                    const strength = zxcvbn(password);
                    if (strength.score < 2) {
                        errors.push(
                            `Password is too weak. ${strength.feedback.warning || ''} ${strength.feedback.suggestions.join(' ')}`.trim()
                        );
                    } else {
                        sanitized.newPassword = password;
                    }
                }
            }

            return { isValid: errors.length === 0, errors, data: sanitized as PasswordChangeData };
        } catch (error: unknown) {
            return { isValid: false, errors: ['Validation error occurred'] };
        }
    }

    // ==================== PASSWORD RESET (OTP-BASED) ====================

    /**
     * Validate password reset via OTP
     * Used when user submits email + reset code + new password
     */
    static async validatePasswordResetOTP(data: {
        email?: string;
        resetCode?: string;
        newPassword?: string;
    }): Promise<ValidationResult<PasswordResetData>> {
        const errors: string[] = [];
        const sanitized: Partial<PasswordResetData> = {};

        try {
            // Validate email
            if (!data.email) {
                errors.push('Email is required');
            } else {
                const email = data.email.trim().toLowerCase();
                if (!validator.isEmail(email)) {
                    errors.push('Invalid email format');
                } else {
                    sanitized.email = email;
                }
            }

            // Validate reset code
            if (!data.resetCode) {
                errors.push('Reset code is required');
            } else {
                const resetCode = data.resetCode.toString().trim();
                if (!/^\d{6}$/.test(resetCode)) {
                    errors.push('Reset code must be 6 digits');
                } else {
                    sanitized.resetCode = resetCode;
                }
            }

            // Validate new password
            if (!data.newPassword) {
                errors.push('New password is required');
            } else {
                const password = data.newPassword.trim();
                if (password.length < 8) {
                    errors.push('Password must be at least 8 characters long');
                } else if (password.length > 128) {
                    errors.push('Password must not exceed 128 characters');
                } else {
                    const strength = zxcvbn(password, [data.email || '']);
                    if (strength.score < 2) {
                        errors.push(
                            `Password is too weak. ${strength.feedback.warning || ''} ${strength.feedback.suggestions.join(' ')}`.trim()
                        );
                    } else {
                        sanitized.newPassword = password;
                    }
                }
            }

            return { isValid: errors.length === 0, errors, data: sanitized as PasswordResetData };
        } catch (error: unknown) {
            return { isValid: false, errors: ['Validation error occurred'] };
        }
    }

    // ==================== PASSWORD STRENGTH ====================

    /**
     * Detailed password strength analysis using zxcvbn
     */
    static validatePasswordStrength(password: string, userInputs: string[] = []): PasswordStrengthResult {
        try {
            const result = zxcvbn(password, userInputs);

            const requirements = {
                minLength: password.length >= 8,
                maxLength: password.length <= 128,
                hasUpperCase: /[A-Z]/.test(password),
                hasLowerCase: /[a-z]/.test(password),
                hasNumbers: /\d/.test(password),
                hasSpecialChars: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
            };

            const requirementsMet = Object.values(requirements).filter(Boolean).length;
            const totalRequirements = Object.keys(requirements).length;

            return {
                score: result.score,
                crackTime: String(result.crack_times_display.offline_slow_hashing_1e4_per_second),
                feedback: {
                    warning: result.feedback.warning || '',
                    suggestions: result.feedback.suggestions || [],
                },
                requirements,
                requirementsMet,
                totalRequirements,
                strength:
                    result.score === 0 ? 'Very Weak' :
                        result.score === 1 ? 'Weak' :
                            result.score === 2 ? 'Fair' :
                                result.score === 3 ? 'Strong' : 'Very Strong',
                isAcceptable: result.score >= 2,
            };
        } catch (error: unknown) {
            return {
                score: 0,
                strength: 'Error',
                isAcceptable: false,
                feedback: { warning: '', suggestions: [] },
                error: (error as Error).message,
            };
        }
    }

    // ==================== COMPLIANCE VERIFICATIONS ====================

    /**
     * Validate annual identity re-check OTP request
     */
    static async validateAnnualIdentityOTP(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<{ otp: string; verificationType: string }>> {
        const schema = Joi.object({
            otp: schemas.otp,
            verificationType: Joi.string()
                .valid('email', 'phone')
                .required()
                .messages({
                    'any.only': 'verificationType must be "email" or "phone"',
                    'any.required': 'verificationType is required',
                }),
        });
        return validate<{ otp: string; verificationType: string }>(data, schema, userId, ipAddress);
    }

    /**
     * Validate send annual identity OTP request
     */
    static async validateSendAnnualIdentityOTP(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<{ verificationType: string }>> {
        const schema = Joi.object({
            verificationType: Joi.string()
                .valid('email', 'phone')
                .required()
                .messages({
                    'any.only': 'verificationType must be "email" or "phone"',
                    'any.required': 'verificationType is required',
                }),
        });
        return validate<{ verificationType: string }>(data, schema, userId, ipAddress);
    }

    /**
     * Validate unusual activity OTP
     */
    static async validateUnusualActivityOTP(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<OTPValidationData>> {
        const schema = Joi.object({ otp: schemas.otp });
        return validate<OTPValidationData>(data, schema, userId, ipAddress);
    }

    /**
     * Validate suspicious location token (from email link)
     */
    static async validateSuspiciousLocationToken(
        token: string
    ): Promise<ValidationResult<{ token: string }>> {
        const errors: string[] = [];

        if (!token) {
            errors.push('Verification token is required');
            return { isValid: false, errors };
        }

        if (token.length !== 64 || !/^[0-9a-f]{64}$/.test(token)) {
            errors.push('Invalid verification token format');
            return { isValid: false, errors };
        }

        return { isValid: true, errors: [], data: { token } };
    }

    /**
     * Validate 90-day password re-verification body
     */
    static async validate90DayPasswordBody(
        data: unknown,
        userId: string,
        ipAddress: string
    ): Promise<ValidationResult<{ password: string }>> {
        const schema = Joi.object({
            password: Joi.string().min(1).required().messages({
                'any.required': 'Password is required',
                'string.empty': 'Password cannot be empty',
            }),
        });
        return validate<{ password: string }>(data, schema, userId, ipAddress);
    }
}

export default VerificationValidatorUtil;