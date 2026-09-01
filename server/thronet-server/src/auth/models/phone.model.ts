/**
 * PhoneOTPVerification.ts
 * Production-Level Phone OTP Verification Model (TypeScript)
 *
 * Features:
 * - Phone number OTP verification
 * - Auto-expiry with TTL (10 minutes)
 * - Max 3 attempts per OTP
 * - Rate limiting (3 OTPs per hour per phone)
 * - SHA256 hashed OTP storage
 * - Audit trail integration
 *
 * @module models/PhoneOTPVerification
 * @version 1.0.0
 */

import mongoose, { Document, Model, Schema } from 'mongoose';
import crypto from 'crypto';
import { LoggerUtil as logger } from '@/shared/logger.util';
import AuditLog from '@/auth/models/AuditLog.model';
import userEmitter from '@/shared/events/emitters/user.emitter';

// ==================== TYPES & INTERFACES ====================

export type OTPStatus = 'pending' | 'verified' | 'expired' | 'failed';

export interface IOTPMetadata {
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
}

export interface IPhoneOTPVerification extends Document {
    // Identification
    otpId: string;
    userId: string;

    // Phone Details
    phoneNumber: string;

    // OTP Details
    otpHash: string;

    // Status
    status: OTPStatus;

    // Attempts
    attempts: number;
    maxAttempts: number;

    // Timestamps
    expiresAt: Date;
    verifiedAt?: Date;

    // Metadata
    metadata: IOTPMetadata;

    // Rate Limiting
    requestedAt: Date;

    // Instance Methods
    generateOTPHash(otp: string): string;
    verifyOTP(providedOTP: string): Promise<boolean>;
}

export interface IPhoneOTPVerificationModel extends Model<IPhoneOTPVerification> {
    // Static Methods
    generateOTP(): string;
    createPhoneOTP(data: ICreatePhoneOTPData): Promise<ICreatePhoneOTPResult>;
    verifyPhoneOTP(userId: string, phoneNumber: string, otp: string): Promise<IVerifyPhoneOTPResult>;
}

export interface ICreatePhoneOTPData {
    userId: string;
    phoneNumber: string;
    expiryMinutes?: number;
    metadata?: IOTPMetadata;
}

export interface ICreatePhoneOTPResult {
    otp: string;
    otpRecord: {
        otpId: string;
        userId: string;
        phoneNumber: string;
        expiresAt: Date;
        status: OTPStatus;
    };
}

export interface IVerifyPhoneOTPResult {
    success: boolean;
    otpId: string;
    verifiedAt: Date;
}

// ==================== PHONE OTP SCHEMA ====================

const PhoneOTPSchema = new Schema<IPhoneOTPVerification, IPhoneOTPVerificationModel>(
    {
        // Identification
        otpId: {
            type: String,
            required: true,
            unique: true,
            default: () => crypto.randomUUID(),
            index: true,
        },
        userId: {
            type: String,
            required: true,
            index: true,
        },

        // Phone Details
        phoneNumber: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },

        // OTP Details
        otpHash: {
            type: String,
            required: true,
            select: false, // Don't return in queries
        },

        // Status
        status: {
            type: String,
            enum: ['pending', 'verified', 'expired', 'failed'] as OTPStatus[],
            default: 'pending' as OTPStatus,
            index: true,
        },

        // Attempts
        attempts: {
            type: Number,
            default: 0,
            max: 3,
        },
        maxAttempts: {
            type: Number,
            default: 3,
        },

        // Timestamps
        expiresAt: {
            type: Date,
            required: true,
            index: true,
        },
        verifiedAt: {
            type: Date,
        },

        // Metadata
        metadata: {
            ipAddress: String,
            userAgent: String,
            deviceId: String,
        },

        // Rate Limiting
        requestedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'phone_otp_verifications',
    }
);

// ==================== INDEXES ====================

PhoneOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired
PhoneOTPSchema.index({ userId: 1, status: 1 });
PhoneOTPSchema.index({ phoneNumber: 1, status: 1 });

// ==================== INSTANCE METHODS ====================

/**
 * Generate OTP hash (SHA256)
 */
PhoneOTPSchema.methods.generateOTPHash = function (
    this: IPhoneOTPVerification,
    otp: string
): string {
    const salt: string = process.env.OTP_SALT || 'default-salt-change-in-production';
    return crypto.createHash('sha256').update(otp + salt).digest('hex');
};

/**
 * Verify OTP
 */
PhoneOTPSchema.methods.verifyOTP = async function (
    this: IPhoneOTPVerification,
    providedOTP: string
): Promise<boolean> {
    try {
        // Check if already verified
        if (this.status === 'verified') {
            throw new Error('OTP already verified');
        }

        // Check if expired
        if (new Date() > this.expiresAt) {
            this.status = 'expired';
            await this.save();
            throw new Error('OTP expired');
        }

        // Check max attempts
        if (this.attempts >= this.maxAttempts) {
            this.status = 'failed';
            await this.save();
            throw new Error('Maximum verification attempts exceeded');
        }

        // Increment attempts
        this.attempts += 1;

        // Verify OTP
        const providedHash: string = this.generateOTPHash(providedOTP);
        const isValid: boolean = providedHash === this.otpHash;

        if (isValid) {
            this.status = 'verified';
            this.verifiedAt = new Date();
            await this.save();

            // Emit event
            userEmitter.emit('phone:otp:verified', {
                otpId: this.otpId,
                userId: this.userId,
                phoneNumber: this.phoneNumber,
                timestamp: new Date(),
            });

            // Audit log
            await AuditLog.logAction({
                userId: this.userId,
                action: 'PHONE_OTP_VERIFIED',
                status: 'SUCCESS',
                severity: 'LOW',
                metadata: new Map([['phoneNumber', this.phoneNumber], ['otpId', this.otpId]]),
            });

            logger.info('Phone OTP verified', {
                otpId: this.otpId,
                userId: this.userId,
                phoneNumber: this.phoneNumber,
            });

            return true;
        } else {
            await this.save(); // Save incremented attempts

            if (this.attempts >= this.maxAttempts) {
                this.status = 'failed';
                await this.save();
            }

            throw new Error('Invalid OTP');
        }
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Phone OTP verification error', {
            error: err.message,
            otpId: this.otpId,
            userId: this.userId,
        });
        throw error;
    }
};

// ==================== STATIC METHODS ====================

/**
 * Generate 6-digit OTP
 */
PhoneOTPSchema.statics.generateOTP = function (): string {
    return crypto.randomInt(100000, 999999).toString();
};

/**
 * Create new Phone OTP
 */
PhoneOTPSchema.statics.createPhoneOTP = async function (
    this: IPhoneOTPVerificationModel,
    data: ICreatePhoneOTPData
): Promise<ICreatePhoneOTPResult> {
    try {
        const { userId, phoneNumber, expiryMinutes = 10, metadata = {} } = data;

        if (!userId || !phoneNumber) {
            throw new Error('userId and phoneNumber are required');
        }

        // Rate limiting: Max 3 OTPs per hour per phone
        const oneHourAgo: Date = new Date(Date.now() - 60 * 60 * 1000);
        const recentOTPs: number = await this.countDocuments({
            phoneNumber,
            createdAt: { $gte: oneHourAgo },
        });

        if (recentOTPs >= 3) {
            logger.warn('Phone OTP rate limit exceeded', { phoneNumber });
            throw new Error('Too many OTP requests. Try again in 1 hour.');
        }

        // Revoke any pending OTPs for this phone
        await this.updateMany(
            { phoneNumber, status: 'pending' },
            { $set: { status: 'expired' } }
        );

        // Generate OTP
        const otp: string = this.generateOTP();
        const salt: string = process.env.OTP_SALT || 'default-salt-change-in-production';
        const otpHash: string = crypto.createHash('sha256').update(otp + salt).digest('hex');

        // Calculate expiry
        const expiresAt: Date = new Date(Date.now() + expiryMinutes * 60 * 1000);

        // Create OTP record
        const otpRecord = new this({
            userId,
            phoneNumber,
            otpHash,
            expiresAt,
            metadata,
            status: 'pending' as OTPStatus,
        });

        await otpRecord.save();

        // Emit event
        userEmitter.emit('phone:otp:created', {
            otpId: otpRecord.otpId,
            userId,
            phoneNumber,
            expiresAt,
            timestamp: new Date(),
        });

        // Audit log
        await AuditLog.logAction({
            userId,
            action: 'PHONE_OTP_SENT',
            status: 'SUCCESS',
            severity: 'LOW',
            metadata: new Map([['phoneNumber', phoneNumber], ['otpId', otpRecord.otpId]]),
        });

        logger.info('Phone OTP created', {
            otpId: otpRecord.otpId,
            userId,
            phoneNumber,
            expiresAt,
        });

        return {
            otp, // Return plain OTP (send via SMS)
            otpRecord: {
                otpId: otpRecord.otpId,
                userId: otpRecord.userId,
                phoneNumber: otpRecord.phoneNumber,
                expiresAt: otpRecord.expiresAt,
                status: otpRecord.status,
            },
        };
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Phone OTP creation failed', {
            error: err.message,
            phoneNumber: data.phoneNumber,
        });
        throw error;
    }
};

/**
 * Verify Phone OTP
 */
PhoneOTPSchema.statics.verifyPhoneOTP = async function (
    this: IPhoneOTPVerificationModel,
    userId: string,
    phoneNumber: string,
    otp: string
): Promise<IVerifyPhoneOTPResult> {
    try {
        const otpRecord = await this.findOne({
            userId,
            phoneNumber,
            status: 'pending',
        }).select('+otpHash');

        if (!otpRecord) {
            throw new Error('No pending OTP found. Please request a new one.');
        }

        await otpRecord.verifyOTP(otp);

        return {
            success: true,
            otpId: otpRecord.otpId,
            verifiedAt: otpRecord.verifiedAt as Date,
        };
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Phone OTP verification failed', {
            error: err.message,
            userId,
            phoneNumber,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const PhoneOTPVerification = mongoose.model<IPhoneOTPVerification, IPhoneOTPVerificationModel>(
    'PhoneOTPVerification',
    PhoneOTPSchema
);

export default PhoneOTPVerification;