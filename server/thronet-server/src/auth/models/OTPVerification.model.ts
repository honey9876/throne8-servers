import mongoose, { Document, Model, Schema } from 'mongoose';
import crypto from 'crypto';
import userEmitter from '@/shared/events/emitters/user.emitter';

export type OTPType =
    | 'email_verification'
    | 'phone_verification'
    | 'login_2fa'
    | 'device_verification'
    | 'step_up_auth'
    | 'password_change'
    | 'password_reset'
    | 'annual_email_recheck'
    | 'annual_phone_recheck'
    | 'unusual_activity_verification'
    | 'suspicious_location_verification'
    | 'aadhaar_verification'
    | 'company_email_verification';

export type OTPStatus = 'pending' | 'verified' | 'expired' | 'failed' | 'revoked';

export interface IOTPVerification extends Document {
    otpId: string;
    userId: string;
    otpHash: string;
    otpType: OTPType;
    email?: string;
    phoneNumber?: string;
    status: OTPStatus;
    attempts: number;
    maxAttempts: number;
    expiresAt: Date;
    verifiedAt?: Date;
    metadata?: {
        ipAddress?: string;
        userAgent?: string;
        deviceId?: string;
        deviceFingerprint?: string;
        action?: string;
    };
    requestedAt: Date;
    resentCount: number;
    generateOTPHash(otp: string): string;
    verifyOTP(providedOTP: string): Promise<boolean>;
    revoke(): Promise<void>;
}

export interface IOTPVerificationModel extends Model<IOTPVerification> {
    generateOTP(): string;
    createOTP(data: {
        userId: string;
        otpType: OTPType;
        email?: string;
        phoneNumber?: string;
        expiryMinutes?: number;
        maxAttempts?: number;
        metadata?: Record<string, any>;
    }): Promise<{ otp: string; otpRecord: Partial<IOTPVerification> }>;
    verifyOTPByType(userId: string, otp: string, otpType: OTPType): Promise<{ success: boolean; otpId: string; verifiedAt: Date }>;
    getActiveOTP(userId: string, otpType: OTPType): Promise<IOTPVerification | null>;
    cleanupExpiredOTPs(): Promise<number>;
}

const OTPVerificationSchema = new Schema<IOTPVerification, IOTPVerificationModel>(
    {
        otpId: {
            type: String,
            required: true,
            unique: true,
            default: () => crypto.randomUUID(),
            // ✅ FIX:  hataya - unique:true apne aap index banata hai, duplicate avoid
        },
        userId: { type: String, required: true },
        otpHash: { type: String, required: true, select: false },
        otpType: {
            type: String,
            required: true,
            enum: [
                'email_verification',
                'phone_verification',
                'login_2fa',
                'device_verification',
                'step_up_auth',
                'password_change',
                'password_reset',
                'annual_email_recheck',
                'annual_phone_recheck',
                'unusual_activity_verification',
                'suspicious_location_verification',
                'aadhaar_verification',
                'company_email_verification',
            ],
        },
        email: { type: String, lowercase: true, trim: true },
        phoneNumber: { type: String, trim: true },
        status: {
            type: String,
            enum: ['pending', 'verified', 'expired', 'failed', 'revoked'],
            default: 'pending',
        },
        attempts: { type: Number, default: 0 },
        maxAttempts: { type: Number, default: 3 },
        // ✅ FIX: expiresAt field mein  tha AUR neeche
        // OTPVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) bhi tha
        // DUPLICATE tha - field level index hataya, neeche sirf TTL index rakha
        expiresAt: { type: Date, required: true },
        verifiedAt: { type: Date },
        metadata: {
            ipAddress: String,
            userAgent: String,
            deviceId: String,
            deviceFingerprint: String,
            action: String,
        },
        requestedAt: { type: Date, default: Date.now },
        resentCount: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        collection: 'otp_verifications',
    }
);

// ==================== INDEXES ====================
// ✅ FIX: Pehle expiresAt field mein  tha AUR yahan bhi index tha - DUPLICATE
// Ab sirf yahan TTL index hai, field mein  nahi
OTPVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ✅ CORRECT: Compound index - query performance ke liye zaroori
OTPVerificationSchema.index({ userId: 1, otpType: 1, status: 1 });

OTPVerificationSchema.methods.generateOTPHash = function (otp: string): string {
    const salt = process.env.OTP_SALT || 'default-otp-salt-change-in-production';
    return crypto.createHash('sha256').update(otp + salt).digest('hex');
};

OTPVerificationSchema.methods.verifyOTP = async function (providedOTP: string): Promise<boolean> {
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
        userEmitter.emit('otp:verified', {
            otpId: this.otpId,
            userId: this.userId,
            otpType: this.otpType,
            timestamp: new Date(),
        });
        return true;
    }

    if (this.attempts >= this.maxAttempts) {
        this.status = 'failed';
    }
    await this.save();
    throw new Error('Invalid OTP');
};

OTPVerificationSchema.methods.revoke = async function (): Promise<void> {
    this.status = 'revoked';
    await this.save();
};

OTPVerificationSchema.statics.generateOTP = function (): string {
    return crypto.randomInt(100000, 999999).toString();
};

OTPVerificationSchema.statics.createOTP = async function (data: any) {
    const { userId, otpType, email, phoneNumber, expiryMinutes = 10, maxAttempts = 3, metadata = {} } = data;
    if (!userId || !otpType) throw new Error('userId and otpType are required');

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOTPs = await this.countDocuments({ userId, otpType, createdAt: { $gte: oneHourAgo } });
    if (recentOTPs >= 3) throw new Error('Too many OTP requests. Please try again later.');

    await this.updateMany({ userId, otpType, status: 'pending' }, { $set: { status: 'revoked' } });

    const otp = this.generateOTP();
    const salt = process.env.OTP_SALT || 'default-otp-salt-change-in-production';
    const otpHash = crypto.createHash('sha256').update(otp + salt).digest('hex');
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    const otpRecord = new this({
        userId,
        otpType,
        email,
        phoneNumber,
        otpHash,
        expiresAt,
        maxAttempts,
        metadata,
        status: 'pending',
    });
    await otpRecord.save();

    userEmitter.emit('otp:created', {
        otpId: otpRecord.otpId,
        userId,
        otpType,
        expiresAt,
        timestamp: new Date(),
    });

    return {
        otp,
        otpRecord: {
            otpId: otpRecord.otpId,
            userId: otpRecord.userId,
            otpType: otpRecord.otpType,
            expiresAt: otpRecord.expiresAt,
            status: otpRecord.status,
        },
    };
};

OTPVerificationSchema.statics.verifyOTPByType = async function (userId: string, otp: string, otpType: OTPType) {
    const otpRecord = await this.findOne({ userId, otpType, status: 'pending' }).select('+otpHash');
    if (!otpRecord) throw new Error('No pending OTP found. Please request a new one.');
    await otpRecord.verifyOTP(otp);
    return { success: true, otpId: otpRecord.otpId, verifiedAt: otpRecord.verifiedAt };
};

OTPVerificationSchema.statics.getActiveOTP = async function (userId: string, otpType: OTPType) {
    return this.findOne({ userId, otpType, status: 'pending', expiresAt: { $gt: new Date() } });
};

OTPVerificationSchema.statics.cleanupExpiredOTPs = async function () {
    const result = await this.updateMany(
        { status: 'pending', expiresAt: { $lt: new Date() } },
        { $set: { status: 'expired' } }
    );
    return result.modifiedCount;
};

OTPVerificationSchema.pre('save', function (next) {
    if (this.status === 'pending' && new Date() > this.expiresAt) this.status = 'expired';
    next();
});

const OTPVerification = mongoose.model<IOTPVerification, IOTPVerificationModel>('OTPVerification', OTPVerificationSchema);
export default OTPVerification;