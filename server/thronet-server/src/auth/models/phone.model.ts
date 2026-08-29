import mongoose, { Document, Model, Schema } from 'mongoose';
import crypto from 'crypto';
import { LoggerUtil as logger } from '@/shared/logger.util';
import AuditLog from '@/auth/models/AuditLog.model';
import userEmitter from '@/shared/events/emitters/user.emitter';

export type OTPStatus = 'pending' | 'verified' | 'expired' | 'failed';

export interface IOTPMetadata {
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
}

export interface IPhoneOTPVerification extends Document {
    otpId: string;
    userId: string;
    phoneNumber: string;
    otpHash: string;
    status: OTPStatus;
    attempts: number;
    maxAttempts: number;
    expiresAt: Date;
    verifiedAt?: Date;
    metadata: IOTPMetadata;
    requestedAt: Date;
    generateOTPHash(otp: string): string;
    verifyOTP(providedOTP: string): Promise<boolean>;
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

export interface IPhoneOTPVerificationModel extends Model<IPhoneOTPVerification> {
    generateOTP(): string;
    createPhoneOTP(data: ICreatePhoneOTPData): Promise<ICreatePhoneOTPResult>;
    verifyPhoneOTP(userId: string, phoneNumber: string, otp: string): Promise<IVerifyPhoneOTPResult>;
}

const PhoneOTPSchema = new Schema<IPhoneOTPVerification, IPhoneOTPVerificationModel>(
    {
        otpId: {
            type: String,
            required: true,
            unique: true,
            default: () => crypto.randomUUID(),
        },
        userId: { type: String, required: true },
        phoneNumber: { type: String, required: true, trim: true },
        otpHash: { type: String, required: true, select: false },
        status: {
            type: String,
            enum: ['pending', 'verified', 'expired', 'failed'],
            default: 'pending',
        },
        attempts: { type: Number, default: 0 },
        maxAttempts: { type: Number, default: 3 },
        expiresAt: { type: Date, required: true },
        verifiedAt: { type: Date },
        metadata: {
            ipAddress: String,
            userAgent: String,
            deviceId: String,
        },
        requestedAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
        collection: 'phone_otp_verifications',
    }
);

PhoneOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PhoneOTPSchema.index({ userId: 1, status: 1 });
PhoneOTPSchema.index({ phoneNumber: 1, status: 1 });

PhoneOTPSchema.methods.generateOTPHash = function (otp: string): string {
    const salt = process.env.OTP_SALT || 'default-salt-change-in-production';
    return crypto.createHash('sha256').update(otp + salt).digest('hex');
};

PhoneOTPSchema.methods.verifyOTP = async function (providedOTP: string): Promise<boolean> {
    try {
        if (this.status === 'verified') throw new Error('OTP already verified');
        if (new Date() > this.expiresAt) {
            this.status = 'expired';
            await this.save();
            throw new Error('OTP expired');
        }
        if (this.attempts >= this.maxAttempts) {
            this.status = 'failed';
            await this.save();
            throw new Error('Maximum verification attempts exceeded');
        }

        this.attempts += 1;
        const providedHash = this.generateOTPHash(providedOTP);
        const isValid = providedHash === this.otpHash;

        if (isValid) {
            this.status = 'verified';
            this.verifiedAt = new Date();
            await this.save();
            userEmitter.emit('phone:otp:verified', {
                otpId: this.otpId,
                userId: this.userId,
                phoneNumber: this.phoneNumber,
                timestamp: new Date(),
            });
            await AuditLog.logAction({
                userId: this.userId,
                action: 'PHONE_OTP_VERIFIED',
                status: 'SUCCESS',
                severity: 'LOW',
                metadata: new Map([['phoneNumber', this.phoneNumber], ['otpId', this.otpId]]),
            });
            return true;
        }

        if (this.attempts >= this.maxAttempts) {
            this.status = 'failed';
        }
        await this.save();
        throw new Error('Invalid OTP');
    } catch (error: unknown) {
        logger.error('Phone OTP verification error', {
            error: (error as Error).message,
            otpId: this.otpId,
            userId: this.userId,
        });
        throw error;
    }
};

PhoneOTPSchema.statics.generateOTP = function (): string {
    return crypto.randomInt(100000, 999999).toString();
};

PhoneOTPSchema.statics.createPhoneOTP = async function (data: ICreatePhoneOTPData): Promise<ICreatePhoneOTPResult> {
    try {
        const { userId, phoneNumber, expiryMinutes = 10, metadata = {} } = data;
        if (!userId || !phoneNumber) throw new Error('userId and phoneNumber are required');

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentOTPs = await this.countDocuments({ phoneNumber, createdAt: { $gte: oneHourAgo } });
        if (recentOTPs >= 3) throw new Error('Too many OTP requests. Try again in 1 hour.');

        await this.updateMany({ phoneNumber, status: 'pending' }, { $set: { status: 'expired' } });

        const otp = this.generateOTP();
        const salt = process.env.OTP_SALT || 'default-salt-change-in-production';
        const otpHash = crypto.createHash('sha256').update(otp + salt).digest('hex');
        const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

        const otpRecord = new this({ userId, phoneNumber, otpHash, expiresAt, metadata, status: 'pending' });
        await otpRecord.save();

        userEmitter.emit('phone:otp:created', {
            otpId: otpRecord.otpId,
            userId,
            phoneNumber,
            expiresAt,
            timestamp: new Date(),
        });

        await AuditLog.logAction({
            userId,
            action: 'PHONE_OTP_SENT',
            status: 'SUCCESS',
            severity: 'LOW',
            metadata: new Map([['phoneNumber', phoneNumber], ['otpId', otpRecord.otpId]]),
        });

        return {
            otp,
            otpRecord: {
                otpId: otpRecord.otpId,
                userId: otpRecord.userId,
                phoneNumber: otpRecord.phoneNumber,
                expiresAt: otpRecord.expiresAt,
                status: otpRecord.status,
            },
        };
    } catch (error: unknown) {
        logger.error('Phone OTP creation failed', {
            error: (error as Error).message,
            phoneNumber: data.phoneNumber,
        });
        throw error;
    }
};

PhoneOTPSchema.statics.verifyPhoneOTP = async function (
    userId: string,
    phoneNumber: string,
    otp: string
): Promise<IVerifyPhoneOTPResult> {
    try {
        const otpRecord = await this.findOne({ userId, phoneNumber, status: 'pending' }).select('+otpHash');
        if (!otpRecord) throw new Error('No pending OTP found. Please request a new one.');
        await otpRecord.verifyOTP(otp);
        return { success: true, otpId: otpRecord.otpId, verifiedAt: otpRecord.verifiedAt as Date };
    } catch (error: unknown) {
        logger.error('Phone OTP verification failed', {
            error: (error as Error).message,
            userId,
            phoneNumber,
        });
        throw error;
    }
};

const PhoneOTPVerification = mongoose.model<IPhoneOTPVerification, IPhoneOTPVerificationModel>(
    'PhoneOTPVerification',
    PhoneOTPSchema
);

export default PhoneOTPVerification;