import mongoose, { Schema, Document, Model } from 'mongoose';
import validator from 'validator';
import { LoggerUtil } from '@/shared/logger.util';
import userEmitter from '@/shared/events/emitters/user.emitter';
import AuditLog from './AuditLog.model';
import User from './User.model';
import Device from './Device.model';
import UserProfile from './UserProfile.model';

const logger = LoggerUtil;

export interface ISuspiciousFactor {
    factor: 'unusual_location' | 'new_device' | 'rapid_attempts' | 'known_bad_ip';
    severity: 'low' | 'medium' | 'high';
}

export interface ILoginAttempt extends Document {
    userId?: string;
    ipAddress: string;
    userAgent?: string;
    deviceId?: string;
    attemptType: 'login' | 'password_reset' | 'two_factor';
    status: 'success' | 'failed' | 'blocked';
    failureReason?: 'invalid_credentials' | 'account_locked' | 'account_disabled' | 'invalid_2fa' | 'rate_limited';
    riskScore: number;
    suspiciousFactors: ISuspiciousFactor[];
    sessionId?: string;
    metadata?: Map<string, any>;
    expiresAt: Date;
    attemptedAt: Date;
}

export interface ILoginAttemptModel extends Model<ILoginAttempt> {
    recordAttempt(userId: string | null, ipAddress: string, attemptType: string, status: string, options?: any): Promise<ILoginAttempt>;
    isBlocked(userId: string | null, ipAddress: string): Promise<boolean>;
    getRecentAttempts(userId: string, options?: { limit?: number }): Promise<any[]>;
    getSuspiciousActivity(options?: { timeframeHours?: number; limit?: number }): Promise<any[]>;
}

const LoginAttemptSchema = new Schema<ILoginAttempt, ILoginAttemptModel>(
    {
        userId: {
            type: String,
        },
        ipAddress: {
            type: String,
            required: [true, 'IP address is required'],
            validate: [validator.isIP, 'Invalid IP address'],
        },
        userAgent: String,
        deviceId: {
            type: String,
        },
        attemptType: {
            type: String,
            enum: ['login', 'password_reset', 'two_factor'],
            required: true,
            default: 'login',
        },
        status: {
            type: String,
            enum: ['success', 'failed', 'blocked'],
            required: true,
        },
        failureReason: {
            type: String,
            enum: ['invalid_credentials', 'account_locked', 'account_disabled', 'invalid_2fa', 'rate_limited'],
        },
        riskScore: {
            type: Number,
            min: 0,
            max: 100,
            default: 0,
        },
        suspiciousFactors: [
            {
                factor: {
                    type: String,
                    enum: ['unusual_location', 'new_device', 'rapid_attempts', 'known_bad_ip'],
                },
                severity: {
                    type: String,
                    enum: ['low', 'medium', 'high'],
                    default: 'low',
                },
            },
        ],
        sessionId: String,
        metadata: {
            type: Map,
            of: Schema.Types.Mixed,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expireAfterSeconds: 0 },
            default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
    },
    {
        timestamps: { createdAt: 'attemptedAt' },
        collection: 'login_attempts',
        shardKey: { userId: 'hashed' },
    }
);

LoginAttemptSchema.index({ userId: 1, attemptedAt: -1 });
LoginAttemptSchema.index({ ipAddress: 1, status: 1 });

LoginAttemptSchema.statics.recordAttempt = async function (
    userId: string | null,
    ipAddress: string,
    attemptType: string,
    status: string,
    options: any = {}
): Promise<ILoginAttempt> {
    try {
        const { userAgent, deviceId, failureReason, metadata = {} } = options;

        if (userId) {
            const profile = await UserProfile.findByUserIdCached(userId);
            if (!profile && status !== 'failed') throw new Error('User profile not found');
        }

        if (deviceId && userId) {
            const device = await Device.validateDevice(deviceId);
            if (!device) throw new Error('Invalid device');
        }

        const query = userId ? { userId, ipAddress } : { ipAddress };
        const recentAttempts = await this.countDocuments({
            ...query,
            status: 'failed',
            attemptedAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
        });

        let isBlocked = false;
        if (recentAttempts >= 3 && status === 'failed') {
            isBlocked = true;
            if (userId) {
                await User.lockAccount(userId, 'too_many_attempts');
                userEmitter.emit('account:locked', { userId, reason: 'too_many_attempts', ipAddress });
            }
        }

        let riskScore = 0;
        const suspiciousFactors: ISuspiciousFactor[] = [];

        if (status === 'failed') riskScore += 10;
        if (recentAttempts > 2) {
            riskScore += Math.min(recentAttempts * 5, 30);
            suspiciousFactors.push({ factor: 'rapid_attempts', severity: 'medium' });
        }
        if (metadata.isProxy || metadata.isVpn) {
            riskScore += 20;
            suspiciousFactors.push({ factor: 'known_bad_ip', severity: 'high' });
        }
        if (deviceId && userId && !(await Device.findOne({ deviceId, userId }))) {
            riskScore += 15;
            suspiciousFactors.push({ factor: 'new_device', severity: 'medium' });
        }
        riskScore = Math.min(riskScore, 100);

        const attemptData: any = {
            ipAddress,
            userAgent,
            deviceId,
            attemptType,
            status,
            failureReason: status === 'failed' ? failureReason : undefined,
            riskScore,
            suspiciousFactors,
            metadata,
            sessionId: options.sessionId || null,
        };
        if (userId) attemptData.userId = userId;

        const attempt = new this(attemptData);
        await attempt.save();

        await AuditLog.logAction({
            userId: userId || undefined,
            userEmail: userId ? undefined : 'anonymous',
            action: status === 'success' ? 'USER_LOGIN' : 'FAILED_LOGIN_ATTEMPT',
            ipAddress,
            userAgent,
            status: status === 'success' ? 'SUCCESS' : 'FAILURE',
            severity: riskScore >= 70 ? 'HIGH' : 'LOW',
            metadata: new Map([
                ['attemptType', attemptType],
                ['failureReason', failureReason],
                ['riskScore', riskScore],
            ]),
        });

        userEmitter.emit(`login:${status}`, {
            userId: userId || 'anonymous',
            ipAddress,
            attemptType,
            status,
            riskScore,
            timestamp: new Date(),
        });

        if (isBlocked) throw new Error('Account locked due to too many attempts');

        return attempt;
    } catch (error: any) {
        logger.error('Login attempt recording failed', { error: (error as Error).message, userId: userId || 'anonymous' });
        throw error;
    }
};

LoginAttemptSchema.statics.isBlocked = async function (userId: string | null, ipAddress: string): Promise<boolean> {
    try {
        const query = userId ? { userId, ipAddress } : { ipAddress };
        const recentAttempts = await this.countDocuments({
            ...query,
            status: 'failed',
            attemptedAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
        });
        return recentAttempts >= 3;
    } catch (error: any) {
        logger.error('Block check failed', { error: (error as Error).message, userId: userId || 'anonymous' });
        throw error;
    }
};

LoginAttemptSchema.statics.getRecentAttempts = async function (userId: string, { limit = 10 }: { limit?: number } = {}): Promise<any[]> {
    if (!userId) return [];
    try {
        const attempts = await this.find({ userId }).sort({ attemptedAt: -1 }).limit(limit).lean();
        return attempts.map((attempt) => ({
            id: attempt._id,
            ipAddress: attempt.ipAddress,
            attemptType: attempt.attemptType,
            status: attempt.status,
            failureReason: attempt.failureReason,
            riskScore: attempt.riskScore,
            attemptedAt: attempt.attemptedAt,
        }));
    } catch (error: any) {
        logger.error('Recent attempts retrieval failed', { error: (error as Error).message, userId });
        throw error;
    }
};

LoginAttemptSchema.statics.getSuspiciousActivity = async function ({
    timeframeHours = 24,
    limit = 100,
}: { timeframeHours?: number; limit?: number } = {}): Promise<any[]> {
    try {
        const since = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);
        return await this.aggregate([
            {
                $match: {
                    attemptedAt: { $gte: since },
                    $or: [{ riskScore: { $gte: 50 } }, { status: 'blocked' }],
                },
            },
            {
                $group: {
                    _id: { userId: '$userId', ipAddress: '$ipAddress' },
                    totalAttempts: { $sum: 1 },
                    maxRiskScore: { $max: '$riskScore' },
                    lastAttempt: { $max: '$attemptedAt' },
                    factors: { $addToSet: '$suspiciousFactors.factor' },
                },
            },
            { $sort: { maxRiskScore: -1, totalAttempts: -1 } },
            { $limit: limit },
        ]);
    } catch (error: any) {
        logger.error('Suspicious activity retrieval failed', { error: (error as Error).message });
        throw error;
    }
};

const LoginAttempt = mongoose.model<ILoginAttempt, ILoginAttemptModel>('LoginAttempt', LoginAttemptSchema);
export default LoginAttempt;