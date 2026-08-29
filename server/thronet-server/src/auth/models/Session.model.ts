import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';
import { LoggerUtil } from '@/shared/logger.util';
import UserEmitter from '@/shared/events/emitters/user.emitter';

const logger = LoggerUtil;

export interface IDeviceInfo {
    userAgent?: string;
    platform?: string;
    browser?: string;
    os?: string;
    deviceType?: 'mobile' | 'tablet' | 'desktop' | 'other';
}

export interface IMetadata {
    location?: {
        country?: string;
        city?: string;
        region?: string;
        latitude?: number;
        longitude?: number;
    };
    device?: {
        deviceType?: string;
        os?: string;
        browser?: string;
    };
    ipAddress?: string;
    userAgent?: string;
    loginMethod: 'password' | 'otp' | 'social' | 'sso';
    mfaVerified: boolean;
    riskScore: number;
}

export interface ISession extends Document<string> {
    _id: string;
    userId: string;
    deviceId: string;
    deviceInfo: IDeviceInfo;
    ipAddress: string;
    refreshToken: string;
    accessToken?: string;
    isActive: boolean;
    lastActivity: Date;
    expiresAt: Date;
    sessionType: 'web' | 'mobile' | 'api' | 'oauth';
    metadata: IMetadata;
    isUnusualActivity: boolean;
    isSuspiciousLocation: boolean;
    isVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
    extend(additionalTime?: number): Promise<ISession>;
    refreshTokens(): Promise<{ accessToken: string; refreshToken: string }>;
}

export interface ISessionModel extends Model<ISession> {
    createSession(data: Partial<ISession>): Promise<ISession>;
    findUserSessions(userId: string, options?: { active?: boolean; limit?: number; skip?: number }): Promise<ISession[]>;
    validateSession(sessionId: string, accessToken: string): Promise<{ valid: boolean; reason?: string; session?: ISession }>;
    updateActivity(sessionId: string): Promise<void>;
    invalidateSession(sessionId: string): Promise<void>;
    invalidateUserSessions(userId: string): Promise<{ invalidatedCount: number }>;
    detectAnomalies(userId: string): Promise<any[]>;
    revokeAllUserSessions(userId: string, reason: string): Promise<any>;
}

const sessionSchema = new Schema<ISession, ISessionModel>(
    {
        _id: {
            type: String,
            default: () => crypto.randomBytes(32).toString('hex'),
        },
        userId: { type: String, required: true },
        deviceId: { type: String, required: true },
        deviceInfo: {
            userAgent: String,
            platform: String,
            browser: String,
            os: String,
            deviceType: {
                type: String,
                enum: ['mobile', 'tablet', 'desktop', 'other'],
                default: 'other',
            },
        },
        ipAddress: { type: String, required: true },
        refreshToken: { type: String, required: true, unique: true },
        accessToken: { type: String, sparse: true },
        isActive: { type: Boolean, default: true },
        lastActivity: { type: Date, default: Date.now },
        expiresAt: {
            type: Date,
            required: true,
            index: { expireAfterSeconds: 0 },
        },
        sessionType: {
            type: String,
            enum: ['web', 'mobile', 'api', 'oauth'],
            default: 'web',
        },
        metadata: {
            location: {
                country: String,
                city: String,
                region: String,
                latitude: Number,
                longitude: Number,
            },
            device: {
                deviceType: String,
                os: String,
                browser: String,
            },
            ipAddress: String,
            userAgent: String,
            loginMethod: {
                type: String,
                enum: ['password', 'otp', 'social', 'sso'],
                default: 'password',
            },
            mfaVerified: { type: Boolean, default: false },
            riskScore: { type: Number, min: 0, max: 100, default: 0 },
        },
        isUnusualActivity: { type: Boolean, default: false },
        isSuspiciousLocation: { type: Boolean, default: false },
        isVerified: { type: Boolean, default: false },
    },
    {
        timestamps: true,
        collection: 'sessions',
    }
);

// ==================== INDEXES ====================
// ✅ Sirf compound indexes yahan - single field indexes upar defined hain
sessionSchema.index({ userId: 1, isActive: 1, lastActivity: -1 });
sessionSchema.index({ deviceId: 1, userId: 1 });
// ✅ FIX: sessionSchema.index({ expiresAt: 1 }) NAHI hai yahan
// expiresAt ka TTL index field definition mein index:{ expireAfterSeconds: 0 } se handle ho raha hai

sessionSchema.statics.createSession = async function (data: Partial<ISession>): Promise<ISession> {
    try {
        const ttl = data.sessionType === 'mobile' ? 90 * 24 * 3600 : 30 * 24 * 3600;
        const expiresAt = new Date(Date.now() + ttl * 1000);

        const session = new this({
            _id: crypto.randomBytes(32).toString('hex'),
            ...data,
            refreshToken: crypto.randomBytes(64).toString('hex'),
            accessToken: crypto.randomBytes(48).toString('hex'),
            expiresAt,
        });

        await session.save();

        UserEmitter.emit('session:created', {
            sessionId: session._id,
            userId: session.userId,
            deviceId: session.deviceId,
            timestamp: new Date(),
        });

        return session;
    } catch (error: any) {
        logger.error('Session creation failed', { error: (error as Error).message });
        throw error;
    }
};

sessionSchema.statics.revokeAllUserSessions = async function (userId: string, reason: string): Promise<any> {
    return this.updateMany(
        { userId, isActive: true },
        { $set: { isActive: false, revokedAt: new Date(), revokedReason: reason } }
    );
};

sessionSchema.statics.findUserSessions = async function (
    userId: string,
    { active = true, limit = 10, skip = 0 }: { active?: boolean; limit?: number; skip?: number } = {}
): Promise<ISession[]> {
    try {
        const query: any = { userId };
        if (active) query.isActive = true;
        return this.find(query).sort({ lastActivity: -1 }).skip(skip).limit(limit);
    } catch (error: any) {
        logger.error('User sessions fetch failed', { error: (error as Error).message });
        throw error;
    }
};

sessionSchema.statics.validateSession = async function (
    sessionId: string,
    accessToken: string
): Promise<{ valid: boolean; reason?: string; session?: ISession }> {
    try {
        const session = await this.findById(sessionId);
        if (!session) return { valid: false, reason: 'Session not found' };
        if (!session.isActive) return { valid: false, reason: 'Session inactive' };
        if (session.accessToken !== accessToken) return { valid: false, reason: 'Invalid access token' };
        if (new Date(session.expiresAt) < new Date()) {
            await this.invalidateSession(sessionId);
            return { valid: false, reason: 'Session expired' };
        }
        await this.updateActivity(sessionId);
        return { valid: true, session };
    } catch (error: any) {
        logger.error('Session validation failed', { error: (error as Error).message });
        throw error;
    }
};

sessionSchema.statics.updateActivity = async function (sessionId: string): Promise<void> {
    await this.updateOne({ _id: sessionId }, { $set: { lastActivity: new Date() } });
};

sessionSchema.statics.invalidateSession = async function (sessionId: string): Promise<void> {
    try {
        const session = await this.findById(sessionId);
        if (!session) return;
        session.isActive = false;
        await session.save();
        UserEmitter.emit('session:invalidated', { sessionId, userId: session.userId, timestamp: new Date() });
    } catch (error: any) {
        logger.error('Session invalidation failed', { error: (error as Error).message });
        throw error;
    }
};

sessionSchema.statics.invalidateUserSessions = async function (userId: string): Promise<{ invalidatedCount: number }> {
    try {
        const sessions = await this.find({ userId, isActive: true });
        await this.updateMany({ userId, isActive: true }, { $set: { isActive: false } });
        UserEmitter.emit('user:all_sessions_invalidated', {
            userId,
            sessionCount: sessions.length,
            timestamp: new Date(),
        });
        return { invalidatedCount: sessions.length };
    } catch (error: any) {
        logger.error('User sessions invalidation failed', { error: (error as Error).message });
        throw error;
    }
};

sessionSchema.statics.detectAnomalies = async function (userId: string): Promise<any[]> {
    try {
        const recentSessions = await this.find({
            userId,
            createdAt: { $gte: new Date(Date.now() - 3600000) },
        }).lean();

        const anomalies: any[] = [];
        const ipAddresses = [...new Set(recentSessions.map((s) => s.ipAddress))];
        if (ipAddresses.length > 3) {
            anomalies.push({
                type: 'multiple_locations',
                severity: 'high',
                details: `${ipAddresses.length} different IP addresses detected`,
            });
        }

        if (anomalies.length) {
            UserEmitter.emit('session:anomaly', { userId, anomalies, timestamp: new Date() });
        }

        return anomalies;
    } catch (error: any) {
        logger.error('Anomaly detection failed', { error: (error as Error).message });
        throw error;
    }
};

sessionSchema.methods.extend = async function (this: ISession, additionalTime: number = 3600): Promise<ISession> {
    this.expiresAt = new Date(this.expiresAt.getTime() + additionalTime * 1000);
    await this.save();
    return this;
};

sessionSchema.methods.refreshTokens = async function (): Promise<{ accessToken: string; refreshToken: string }> {
    this.accessToken = crypto.randomBytes(48).toString('hex');
    this.refreshToken = crypto.randomBytes(64).toString('hex');
    await this.save();
    UserEmitter.emit('session:tokens_refreshed', {
        sessionId: this._id,
        userId: this.userId,
        timestamp: new Date(),
    });
    return { accessToken: this.accessToken!, refreshToken: this.refreshToken };
};

sessionSchema.pre('save', function (next) {
    if (this.expiresAt && new Date(this.expiresAt) < new Date()) this.isActive = false;
    next();
});

const Session = mongoose.model<ISession, ISessionModel>('Session', sessionSchema);
export default Session;