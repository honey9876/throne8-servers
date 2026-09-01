import Joi from 'joi';
import validator from 'validator';
import zxcvbn, { ZXCVBNResult } from 'zxcvbn';

interface ValidationResult {
    isValid: boolean;
    errors?: string[];
    data?: any;
}

interface PasswordStrength {
    score: number;
    crackTime: string;
    feedback: {
        warning: string;
        suggestions: string[];
    };
    requirements: Record<string, boolean>;
    requirementsMet: number;
    totalRequirements: number;
    strength: string;
    isAcceptable: boolean;
}

class ValidatorUtil {
    static schemas = {
        userId: Joi.alternatives()
            .try(
                Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
                Joi.string().uuid()
            )
            .required(),

        email: Joi.string()
            .email({ tlds: { allow: false } })
            .lowercase()
            .max(255)
            .required(),

        password: Joi.string()
            .min(8)
            .max(128)
            .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{}|;:,.<>])[A-Za-z\d@$!%*?&#^()_+\-=\[\]{}|;:,.<>]{8,}$/)
            .required(),

        phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
        otp: Joi.string().length(6).pattern(/^\d{6}$/).required(),
        token: Joi.string().min(32).max(128).required(),
    };

    static async validate(data: any, schema: Joi.ObjectSchema, userId?: any, ipAddress?: string): Promise<ValidationResult> {
        try {
            if (!schema || typeof schema.validateAsync !== 'function') {
                return { isValid: false, errors: ['Invalid schema'] };
            }

            const result = await schema.validateAsync(data, {
                abortEarly: false,
                stripUnknown: true,
                convert: true,
            });

            return { isValid: true, data: result, errors: [] };
        } catch (error: any) {
            const errors = error.details ? error.details.map((d: any) => d.message) : [error.message];
            return { isValid: false, errors };
        }
    }

    /**
 * Validate user registration data
 * Production-ready with comprehensive checks for 1M+ users
 * UPDATED: Enhanced date validation for working professionals
 */
    static async validateUserRegistration(
        data: {
            email: string;
            password: string;
            confirmPassword: string;
            firstName: string;
            lastName?: string;
            location: string;
            phoneNumber?: string;
            userType: 'working' | 'student' | 'fresher';

            // Working
            jobTitle?: string;
            companyName?: string;
            startDate?: string;
            endDate?: string;

            // Student
            collegeName?: string;
            degree?: string;
            fieldOfStudy?: string;
            graduationYear?: string;

            // Fresher
            highestEducation?: string;
            preferredRole?: string;
            cgpa?: string;
        },
        ipAddress: string
    ): Promise<ValidationResult> {
        const errors: string[] = [];

        // ==================== BASIC VALIDATION ====================

        // Email validation
        if (!validator.isEmail(data.email)) {
            errors.push('Invalid email format');
        }

        // Password validation
        if (data.password.length < 8) {
            errors.push('Password must be at least 8 characters');
        }
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(data.password)) {
            errors.push('Password must contain uppercase, lowercase, number, and special character');
        }

        // Confirm password validation
        if (data.password !== data.confirmPassword) {
            errors.push('Passwords do not match');
        }

        // FirstName required validation
        if (!data.firstName || data.firstName.trim().length < 2) {
            errors.push('First name is required and must be at least 2 characters');
        }
        if (data.firstName && !/^[A-Za-z\s\-']+$/.test(data.firstName)) {
            errors.push('First name can only contain letters, spaces, hyphens, and apostrophes');
        }

        // Location validation
        if (!data.location || data.location.trim().length < 2) {
            errors.push('Location is required');
        }
        if (data.location && !/^[A-Z]/.test(data.location)) {
            errors.push('Location must start with a capital letter');
        }
        if (data.location && !/^[A-Z][a-zA-Z\s\-]{1,49}$/.test(data.location)) {
            errors.push('Location can only contain letters, spaces, and hyphens');
        }

        // Phone validation (if provided)
        if (data.phoneNumber && !validator.isMobilePhone(data.phoneNumber)) {
            errors.push('Invalid phone number format');
        }

        // IP validation
        if (!validator.isIP(ipAddress)) {
            errors.push('Invalid IP address');
        }

        // ==================== ONBOARDING VALIDATION ====================

        // User type validation
        if (!['working', 'student', 'fresher'].includes(data.userType)) {
            errors.push('Invalid user type. Must be: working, student, or fresher');
        }

        // ✅ UPDATED: Working professional validation with enhanced date checks
        if (data.userType === 'working') {
            // Job title validation
            if (!data.jobTitle) {
                errors.push('Job title is required for working professionals');
            }

            // Company name validation
            if (!data.companyName) {
                errors.push('Company name is required for working professionals');
            }

            // ✅ START DATE VALIDATION
            if (!data.startDate) {
                errors.push('Start date is required for working professionals');
            } else {
                const startDate = new Date(data.startDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Reset time to midnight for date-only comparison

                // Check if start date is a valid date
                if (isNaN(startDate.getTime())) {
                    errors.push('Invalid start date format. Use YYYY-MM-DD format');
                } else {
                    // ✅ Rule 1: Start date cannot be in the future
                    if (startDate > today) {
                        errors.push('Start date cannot be in the future');
                    }

                    // Additional check: Start date should not be too old (optional - prevent unrealistic dates)
                    const fiftyYearsAgo = new Date();
                    fiftyYearsAgo.setFullYear(today.getFullYear() - 50);
                    if (startDate < fiftyYearsAgo) {
                        errors.push('Start date cannot be more than 50 years ago');
                    }
                }
            }

            // ✅ END DATE VALIDATION (OPTIONAL - only if provided)
            if (data.endDate) {
                const endDate = new Date(data.endDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                // Check if end date is a valid date
                if (isNaN(endDate.getTime())) {
                    errors.push('Invalid end date format. Use YYYY-MM-DD format');
                } else {
                    // ✅ Rule 2: End date cannot be in the future
                    if (endDate > today) {
                        errors.push('End date cannot be in the future');
                    }

                    // If both dates are valid, perform comparison checks
                    if (data.startDate) {
                        const startDate = new Date(data.startDate);

                        if (!isNaN(startDate.getTime())) {
                            // Check if end date is after start date
                            if (endDate <= startDate) {
                                errors.push('End date must be after start date');
                            }

                            // ✅ Rule 3: Calculate months difference - minimum 1 month gap
                            const yearsDiff = endDate.getFullYear() - startDate.getFullYear();
                            const monthsDiff = yearsDiff * 12 + (endDate.getMonth() - startDate.getMonth());

                            // Calculate days in case months are same
                            const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

                            // If less than 1 month (30 days)
                            if (monthsDiff === 0 && daysDiff < 30) {
                                errors.push('Minimum 1 month job duration is required (at least 30 days between start and end date)');
                            } else if (monthsDiff < 1 && daysDiff < 30) {
                                errors.push('Minimum 1 month job duration is required (at least 30 days between start and end date)');
                            }

                            // Additional check: Job duration should not exceed 50 years (sanity check)
                            if (yearsDiff > 50) {
                                errors.push('Job duration cannot exceed 50 years');
                            }
                        }
                    }
                }
            }
            // Note: If endDate is not provided, it means user is currently working (present/working radio selected)
            // This is valid and no error should be raised
        }

        // Student validation
        if (data.userType === 'student') {
            if (!data.collegeName || data.collegeName.trim().length < 3) {
                errors.push('College name is required for students and must be at least 3 characters');
            }
            if (!data.degree) {
                errors.push('Degree is required for students');
            }
            if (!data.fieldOfStudy) {
                errors.push('Field of study is required for students');
            }
            if (!data.graduationYear) {
                errors.push('Graduation year is required for students');
            }
            if (data.graduationYear) {
                // Check if it's a 4-digit number
                if (!/^\d{4}$/.test(data.graduationYear)) {
                    errors.push('Graduation year must be a 4-digit year (e.g., 2025)');
                } else {
                    const year = parseInt(data.graduationYear);
                    const currentYear = new Date().getFullYear();

                    // Graduation year should be between 2020 and current year + 10
                    if (year < 2020) {
                        errors.push('Graduation year cannot be before 2020');
                    }
                    if (year > currentYear + 10) {
                        errors.push(`Graduation year cannot be more than ${currentYear + 10}`);
                    }
                }
            }
        }

        // Fresher validation
        if (data.userType === 'fresher') {
            if (!data.highestEducation) {
                errors.push('Highest education is required for freshers');
            }
            if (!data.preferredRole) {
                errors.push('Preferred job role is required for freshers');
            }
            // CGPA is optional, no validation needed
            // If CGPA is provided, you can add optional validation:
            if (data.cgpa && data.cgpa.trim() !== '') {
                const cgpaValue = parseFloat(data.cgpa);
                if (isNaN(cgpaValue)) {
                    errors.push('CGPA must be a valid number');
                } else if (cgpaValue < 0 || cgpaValue > 10) {
                    errors.push('CGPA must be between 0.00 and 10.00');
                }
            }
        }

        return {
            isValid: errors.length === 0,
            data: errors.length === 0 ? {
                email: data.email.toLowerCase().trim(),
                password: data.password,
                confirmPassword: data.confirmPassword,
                firstName: data.firstName.trim(),
                lastName: data.lastName?.trim(),
                location: data.location.trim(),
                phoneNumber: data.phoneNumber?.trim(),
                userType: data.userType,

                // Working
                jobTitle: data.jobTitle,
                companyName: data.companyName,
                startDate: data.startDate,
                endDate: data.endDate || undefined,  // ✅ Keep empty if not provided

                // Student
                collegeName: data.collegeName?.trim(),
                degree: data.degree,
                fieldOfStudy: data.fieldOfStudy,
                graduationYear: data.graduationYear,

                // Fresher
                highestEducation: data.highestEducation,
                preferredRole: data.preferredRole,
                cgpa: data.cgpa?.trim() || undefined,  // ✅ Keep empty if not provided
            } : undefined,
            errors: errors.length > 0 ? errors : undefined,
        };
    }

    static async validateLogin(data: any, ipAddress?: string): Promise<ValidationResult> {
        const schema = Joi.object({
            email: this.schemas.email,
            password: Joi.string().min(1).required(),
            deviceId: Joi.string().uuid().optional(),
            rememberMe: Joi.boolean().optional().default(false),
        });

        return this.validate(data, schema);
    }

    static async validatePasswordChange(data: any): Promise<ValidationResult> {
        const schema = Joi.object({
            currentPassword: Joi.string().required(),
            newPassword: this.schemas.password,
            confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
                .messages({ 'any.only': 'Passwords do not match' }),
        });

        return this.validate(data, schema);
    }

    static async validatePasswordReset(data: any): Promise<ValidationResult> {
        const schema = Joi.object({
            email: this.schemas.email,
            resetCode: Joi.string().length(6).pattern(/^\d{6}$/).required()
                .messages({ 'string.length': 'Reset code must be 6 digits', 'string.pattern.base': 'Reset code must be 6 digits' }),
            newPassword: this.schemas.password,
        });

        return this.validate(data, schema);
    }

    static validateEmail(email: string): ValidationResult {
        const errors: string[] = [];
        if (!email) {
            errors.push('Email is required');
            return { isValid: false, errors };
        }

        const cleanEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            errors.push('Invalid email format');
            return { isValid: false, errors };
        }

        return { isValid: true, errors: [], data: { email: cleanEmail } };
    }

    static validateOTP(otp: string): ValidationResult {
        const errors: string[] = [];
        if (!otp) {
            errors.push('OTP is required');
            return { isValid: false, errors };
        }
        if (!/^\d{6}$/.test(otp)) {
            errors.push('OTP must be 6 digits');
            return { isValid: false, errors };
        }
        return { isValid: true, errors: [] };
    }

    static validatePasswordStrength(password: string, userInputs: string[] = []): PasswordStrength {
        const result: ZXCVBNResult = zxcvbn(password, userInputs);

        const requirements = {
            minLength: password.length >= 8,
            maxLength: password.length <= 128,
            hasUpperCase: /[A-Z]/.test(password),
            hasLowerCase: /[a-z]/.test(password),
            hasNumbers: /\d/.test(password),
            hasSpecialChars: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
        };

        const requirementsMet = Object.values(requirements).filter(Boolean).length;

        const strengthMap = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

        return {
            score: result.score,
            crackTime: String(result.crack_times_display.offline_slow_hashing_1e4_per_second),
            feedback: {
                warning: result.feedback.warning || '',
                suggestions: result.feedback.suggestions || [],
            },
            requirements,
            requirementsMet,
            totalRequirements: Object.keys(requirements).length,
            strength: strengthMap[result.score],
            isAcceptable: result.score >= 2,
        };
    }
}

export default ValidatorUtil;