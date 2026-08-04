import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';
import { LoggerUtil } from '@/shared/logger.util';
import userEmitter from '@/shared/events/emitters/user.emitter';
import AuditLog from './AuditLog.model';
import LoginAttempt from './LoginAttempt.model';

const logger = LoggerUtil;

export interface IUsageStats {
    totalSessions: number;
    successfulLogins: number;
    failedLogins: number;
    lastSuccessfulLogin?: Date;
    lastFailedLogin?: Date;
}

export interface IDevice extends Document {
    deviceId: string;
    userId: string;
    fingerprintHash: string;
    deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
    deviceName?: string;
    os?: string;
    browser?: string;
    trustLevel: 'trusted' | 'recognized' | 'new' | 'suspicious';
    riskScore: number;
    isActive: boolean;
    isVerified: boolean;
    verifiedAt?: Date;
    lastSeenAt: Date;
    registeredAt: Date;
    revokedAt?: Date;
    revokedReason?: 'user_request' | 'security_breach' | 'session_timeout' | 'device_limit_exceeded';
    usageStats: IUsageStats;
    metadata?: Map<string, any>;
    createdAt: Date;
    updatedAt: Date;
    revoke(reason?: string): Promise<IDevice>;
    recordLoginAttempt(success: boolean, ipAddress: string, attemptType?: string): Promise<IDevice>;
    calculateRiskScore(): number;
}

export interface IDeviceModel extends Model<IDevice> {
    generateFingerprintHash(deviceData: any): string;
    registerDevice(userId: string, deviceData: any, options?: any): Promise<IDevice>;
    validateDevice(deviceId: string, fingerprint?: string): Promise<IDevice>;
    getUserDevices(userId: string, options?: { limit?: number }): Promise<any[]>;
}

const DeviceSchema = new Schema<IDevice, IDeviceModel>(
    {
        deviceId: {
            type: String,
            required: [true, 'Device ID is required'],
            unique: true,
            default: () => crypto.randomBytes(16).toString('hex'),
        },
        userId: {
            type: String,
            required: [true, 'User ID is required'],
        },
        fingerprintHash: {
            type: String,
            required: [true, 'Fingerprint hash is required'],
            select: false,
        },
        deviceType: {
            type: String,
            enum: ['desktop', 'mobile', 'tablet', 'unknown'],
            required: true,
            default: 'unknown',
        },
        deviceName: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        os: String,
        browser: String,
        trustLevel: {
            type: String,
            enum: ['trusted', 'recognized', 'new', 'suspicious'],
            default: 'new',
        },
        riskScore: {
            type: Number,
            min: 0,
            max: 100,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        verifiedAt: Date,
        lastSeenAt: {
            type: Date,
            default: Date.now,
            required: true,
        },
        registeredAt: {
            type: Date,
            default: Date.now,
            required: true,
        },
        revokedAt: Date,
        revokedReason: {
            type: String,
            enum: ['user_request', 'security_breach', 'session_timeout' , 'device_limit_exceeded'],
        },
        usageStats: {
            totalSessions: { type: Number, default: 0 },
            successfulLogins: { type: Number, default: 0 },
            failedLogins: { type: Number, default: 0 },
            lastSuccessfulLogin: Date,
            lastFailedLogin: Date,
        },
        metadata: {
            type: Map,
            of: Schema.Types.Mixed,
        },
    },
    {
        timestamps: true,
        collection: 'devices',
        shardKey: { userId: 'hashed' },
    }
);

DeviceSchema.index({ userId: 1, isActive: 1 });
DeviceSchema.index({ deviceId: 1, registeredAt: -1 });

DeviceSchema.statics.generateFingerprintHash = function (deviceData: any): string {
    const components = [
        deviceData.userAgent || '',
        deviceData.screenResolution || '',
        deviceData.timezone || '',
        deviceData.language || '',
        deviceData.platform || '',
    ];
    return crypto.createHash('sha256').update(components.join('|')).digest('hex');
};

DeviceSchema.statics.registerDevice = async function (userId: string, deviceData: any, options: any = {}): Promise<IDevice> {
    try {
        const { deviceType, deviceName, os, browser, metadata = {} } = deviceData;

        const deviceCount = await this.countDocuments({ userId, isActive: true });
        if (deviceCount >= 10) {
            const oldestDevice = await this.findOne({ userId, isActive: true }).sort({ registeredAt: 1 });
            if (oldestDevice) await oldestDevice.revoke('session_timeout');
        }

        const fingerprintHash = this.generateFingerprintHash(deviceData);
        let device = await this.findOne({ userId, fingerprintHash, isActive: true });

        if (device) {
            device.lastSeenAt = new Date();
            device.deviceType = deviceType || device.deviceType;
            device.deviceName = deviceName || device.deviceName;
            device.os = os || device.os;
            device.browser = browser || device.browser;
            await device.save();
            return device;
        }

        device = new this({
            userId,
            deviceType,
            deviceName,
            os,
            browser,
            fingerprintHash,
            isVerified: options.isVerified || false,
            metadata,
            trustLevel: options.isVerified ? 'trusted' : 'new',
        });

        await device.save();

        await AuditLog.logAction({
            userId,
            action: 'DEVICE_REGISTERED',
            status: 'SUCCESS',
            severity: 'LOW',
            metadata: new Map([['deviceId', device.deviceId], ['deviceType', deviceType]]),
        });

        userEmitter.emit('device:registered', {
            userId,
            deviceId: device.deviceId,
            deviceType,
            timestamp: new Date(),
        });

        return device;
    } catch (error: any) {
        logger.error('Device registration failed', { error: (error as Error).message, userId });
        throw error;
    }
};

DeviceSchema.statics.validateDevice = async function (deviceId: string, fingerprint?: string): Promise<IDevice> {
    try {
        const device = await this.findOne({ deviceId, isActive: true }).select('+fingerprintHash');
        if (!device) throw new Error('Device not found or revoked');

        if (fingerprint) {
            const fingerprintHash = this.generateFingerprintHash({ userAgent: fingerprint });
            if (fingerprintHash !== device.fingerprintHash) throw new Error('Device fingerprint mismatch');
        }

        device.lastSeenAt = new Date();
        await device.save();

        return device;
    } catch (error: any) {
        logger.error('Device validation failed', { error: (error as Error).message, deviceId });
        throw error;
    }
};

DeviceSchema.statics.getUserDevices = async function (userId: string, { limit = 10 }: { limit?: number } = {}): Promise<any[]> {
    try {
        const devices = await this.find({ userId, isActive: true }).sort({ lastSeenAt: -1 }).limit(limit).lean();
        return devices.map((device) => ({
            deviceId: device.deviceId,
            deviceType: device.deviceType,
            deviceName: device.deviceName,
            os: device.os,
            browser: device.browser,
            trustLevel: device.trustLevel,
            riskScore: device.riskScore,
            lastSeenAt: device.lastSeenAt,
            registeredAt: device.registeredAt,
        }));
    } catch (error: any) {
        logger.error('User devices retrieval failed', { error: (error as Error).message, userId });
        throw error;
    }
};

DeviceSchema.methods.revoke = async function (this: IDevice, reason: string = 'user_request'): Promise<IDevice> {
    try {
        if (!this.isActive) return this;
        this.isActive = false;
        this.revokedAt = new Date();
        this.revokedReason = reason as any;
        await this.save();

        await AuditLog.logAction({
            userId: this.userId,
            action: 'DEVICE_REVOKED',
            status: 'SUCCESS',
            severity: 'MEDIUM',
            metadata: new Map([['deviceId', this.deviceId], ['reason', reason]]),
        });

        userEmitter.emit('device:revoked', {
            userId: this.userId,
            deviceId: this.deviceId,
            reason,
            timestamp: new Date(),
        });

        return this;
    } catch (error: any) {
        logger.error('Device revocation failed', { error: (error as Error).message, deviceId: this.deviceId });
        throw error;
    }
};

DeviceSchema.methods.recordLoginAttempt = async function (this: IDevice, success: boolean, ipAddress: string, attemptType: string = 'login'): Promise<IDevice> {
    try {
        this.usageStats.totalSessions += 1;
        if (success) {
            this.usageStats.successfulLogins += 1;
            this.usageStats.lastSuccessfulLogin = new Date();
            this.trustLevel = this.trustLevel === 'new' ? 'recognized' : this.trustLevel;
        } else {
            this.usageStats.failedLogins += 1;
            this.usageStats.lastFailedLogin = new Date();
            this.trustLevel = this.usageStats.failedLogins > 5 ? 'suspicious' : this.trustLevel;
        }
        this.riskScore = this.calculateRiskScore();
        this.lastSeenAt = new Date();
        await this.save();

        await LoginAttempt.recordAttempt(this.userId, ipAddress, attemptType as any, success ? 'success' : 'failed', {
            deviceId: this.deviceId,
            failureReason: success ? undefined : 'invalid_credentials',
            metadata: { deviceType: this.deviceType },
        });

        return this;
    } catch (error: any) {
        logger.error('Login attempt recording failed', { error: (error as Error).message, deviceId: this.deviceId });
        throw error;
    }
};

DeviceSchema.methods.calculateRiskScore = function (): number {
    let score = 0;
    if (this.trustLevel === 'new') score += 20;
    if (this.trustLevel === 'suspicious') score += 50;
    const failureRate = this.usageStats.totalSessions > 0
        ? (this.usageStats.failedLogins / this.usageStats.totalSessions) * 100
        : 0;
    if (failureRate > 50) score += 30;
    else if (failureRate > 25) score += 15;
    const daysSinceRegistered = Math.floor((Date.now() - this.registeredAt.getTime()) / (24 * 60 * 60 * 1000));
    if (daysSinceRegistered < 1) score += 15;
    else if (daysSinceRegistered < 7) score += 10;
    if (!this.isVerified) score += 10;
    this.riskScore = Math.min(score, 100);
    return this.riskScore;
};

const Device = mongoose.model<IDevice, IDeviceModel>('Device', DeviceSchema);
export default Device;