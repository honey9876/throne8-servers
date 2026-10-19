import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';
import { LoggerUtil } from '@/shared/logger.util';
import UserEmitter from '@/shared/events/emitters/user.emitter';
import { invalidateSessionCache, invalidateAllSessionCacheByScan } from '@/shared/cache/authCache';

const logger = LoggerUtil;

// Refresh JWT ki expiry (30d) se match hona chahiye
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashToken = (token: string): string =>
    crypto.createHash('sha256').update(token).digest('hex');

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
    refreshTokenHash?: string;
    previousRefreshTokenHash?: string;
    rotatedAt?: Date;
    isActive: boolean;
    lastActivity: Date;
    expiresAt: Date;
    terminatedAt?: Date;
    terminationReason?: string;
    revokedAt?: Date;
    revokedReason?: string;
    status: 'active' | 'terminated';
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

export type RotationFailureReason = 'not_found' | 'inactive' | 'reuse' | 'conflict';

export type RotationResult =
    | { ok: true; graceUsed: boolean }
    | { ok: false; reason: RotationFailureReason };

export interface RotateRefreshTokenParams {
    sessionId: string;
    userId: string;
    presentedToken: string;
    newToken: string;
    graceMs?: number;
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
    setRefreshToken(sessionId: string, refreshToken: string): Promise<void>;
    rotateRefreshToken(params: RotateRefreshTokenParams): Promise<RotationResult>;
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
        // Creation par random value (unique index ke liye). Asli JWT ka hash refreshTokenHash mein hai.
        refreshToken: { type: String, required: true, unique: true },
        accessToken: { type: String, sparse: true },
        refreshTokenHash: { type: String, select: false },
        previousRefreshTokenHash: { type: String, select: false },
        rotatedAt: { type: Date },
        isActive: { type: Boolean, default: true },
        lastActivity: { type: Date, default: Date.now },
        expiresAt: {
            type: Date,
            required: true,
            index: { expireAfterSeconds: 0 },
        },
        terminatedAt: { type: Date },
        terminationReason: { type: String },
        revokedAt: { type: Date },
        revokedReason: { type: String },
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

// ==================== VIRTUALS ====================
// Purana code session.status = 'terminated' likhta hai. Ye virtual use isActive se map karta hai.
sessionSchema.virtual('status')
    .get(function (this: ISession) {
        return this.isActive ? 'active' : 'terminated';
    })
    .set(function (this: ISession, value: string) {
        this.isActive = value === 'active';
    });

// ==================== INDEXES ====================
// expiresAt ka TTL index field definition mein hai
sessionSchema.index({ userId: 1, isActive: 1, lastActivity: -1 });
sessionSchema.index({ deviceId: 1, userId: 1 });
sessionSchema.index({ userId: 1, deviceId: 1, isActive: 1 });

// ==================== STATICS ====================

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

/**
 * Login/register/OAuth ke baad JWT refresh token ka hash session mein save karta hai.
 */
sessionSchema.statics.setRefreshToken = async function (
    sessionId: string,
    refreshToken: string
): Promise<void> {
    await this.updateOne(
        { _id: sessionId },
        {
            $set: { refreshTokenHash: hashToken(refreshToken) },
            $unset: { previousRefreshTokenHash: 1, rotatedAt: 1 },
        }
    );
};

/**
 * Refresh token rotation (DB-based, atomic).
 * - Normal: presented token current hash se match karta hai -> rotate.
 * - Bootstrap: session mein hash nahi hai (purani session) -> pehli baar accept karke set.
 * - Grace: token abhi hi rotate hua tha (graceMs ke andar) -> naya pair issue.
 * - Reuse: grace ke baad purana token -> sirf yahi session revoke.
 */
sessionSchema.statics.rotateRefreshToken = async function (
    params: RotateRefreshTokenParams
): Promise<RotationResult> {
    const { sessionId, userId, presentedToken, newToken, graceMs = 60 * 1000 } = params;

    const presentedHash = hashToken(presentedToken);
    const newHash = hashToken(newToken);
    const now = new Date();
    const nextExpiry = new Date(now.getTime() + REFRESH_TTL_MS);

    // 1. Normal rotation (ya bootstrap: refreshTokenHash null/missing)
    const rotated = await this.findOneAndUpdate(
        {
            _id: sessionId,
            userId,
            isActive: true,
            expiresAt: { $gt: now },
            $or: [{ refreshTokenHash: presentedHash }, { refreshTokenHash: null }],
        },
        {
            $set: {
                previousRefreshTokenHash: presentedHash,
                refreshTokenHash: newHash,
                rotatedAt: now,
                lastActivity: now,
                expiresAt: nextExpiry,
            },
        },
        { projection: { _id: 1 } }
    );

    if (rotated) return { ok: true, graceUsed: false };

    // 2. Fail kyun hua?
    const session: any = await this.findOne({ _id: sessionId, userId })
        .select('+refreshTokenHash +previousRefreshTokenHash')
        .lean();

    if (!session) return { ok: false, reason: 'not_found' };

    if (!session.isActive || new Date(session.expiresAt) <= now) {
        return { ok: false, reason: 'inactive' };
    }

    // 3. Grace window (do tabs ek saath, ya response kho gaya aur client ne retry kiya)
    const withinGrace =
        session.previousRefreshTokenHash === presentedHash &&
        session.rotatedAt &&
        now.getTime() - new Date(session.rotatedAt).getTime() <= graceMs;

    if (withinGrace) {
        const graceRotated = await this.findOneAndUpdate(
            {
                _id: sessionId,
                userId,
                isActive: true,
                previousRefreshTokenHash: presentedHash,
                refreshTokenHash: session.refreshTokenHash,
            },
            {
                $set: {
                    previousRefreshTokenHash: session.refreshTokenHash,
                    refreshTokenHash: newHash,
                    rotatedAt: now,
                    lastActivity: now,
                    expiresAt: nextExpiry,
                },
            },
            { projection: { _id: 1 } }
        );

        if (graceRotated) return { ok: true, graceUsed: true };
        return { ok: false, reason: 'conflict' };
    }

    // 4. Reuse: sirf ye session revoke karo
    await this.updateOne(
        { _id: sessionId, userId },
        {
            $set: {
                isActive: false,
                terminatedAt: now,
                terminationReason: 'refresh_token_reuse',
                revokedAt: now,
                revokedReason: 'refresh_token_reuse',
            },
        }
    );

    return { ok: false, reason: 'reuse' };
};

sessionSchema.statics.revokeAllUserSessions = async function (userId: string, reason: string): Promise<any> {
    const now = new Date();
    return this.updateMany(
        { userId, isActive: true },
        {
            $set: {
                isActive: false,
                terminatedAt: now,
                terminationReason: reason,
                revokedAt: now,
                revokedReason: reason,
            },
        }
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
        session.terminatedAt = new Date();
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
        await this.updateMany(
            { userId, isActive: true },
            { $set: { isActive: false, terminatedAt: new Date() } }
        );
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
        const ipAddresses = [...new Set(recentSessions.map((s: any) => s.ipAddress))];
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

// ==================== METHODS ====================

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

// Cache invalidation on direct document save
sessionSchema.post('save', async function (doc: any) {
    try {
        const sid = doc?._id?.toString();
        if (sid) {
            await invalidateSessionCache(sid);
        }
    } catch (error: any) {
        logger.warn(`[sessionSchema] Post-save cache invalidation error: ${error.message}`);
    }
});

const SINGLE_DOC_SESSION_MUTATIONS = [
    'updateOne',
    'findOneAndUpdate',
    'deleteOne',
    'findOneAndDelete',
    'replaceOne',
    'findOneAndReplace',
];

const MULTI_DOC_SESSION_MUTATIONS = [
    'updateMany',
    'deleteMany',
];

const SESSION_MUTATION_METHODS = [
    ...SINGLE_DOC_SESSION_MUTATIONS,
    ...MULTI_DOC_SESSION_MUTATIONS,
] as any;

// Pre-hook for update/delete/replace operations:
// Captures affected session IDs BEFORE the mutation runs.
sessionSchema.pre(
    SESSION_MUTATION_METHODS,
    async function (this: any) {
        try {
            const filter = this.getFilter() || {};
            const op = this.op;

            const isObjectFilter =
                (filter._id !== undefined && typeof filter._id === 'object' && filter._id !== null && !(filter._id instanceof mongoose.Types.ObjectId)) ||
                (filter.userId !== undefined && typeof filter.userId === 'object' && filter.userId !== null);

            // Fast-path: only if filter directly targets session _id as primitive string or ObjectId in single-doc op
            const isDirectId =
                filter._id &&
                ((typeof filter._id === 'string' && !filter._id.startsWith('$')) ||
                    filter._id instanceof mongoose.Types.ObjectId);

            if (!isObjectFilter && isDirectId && SINGLE_DOC_SESSION_MUTATIONS.includes(op)) {
                this._preUpdateSessionIds = [filter._id.toString()];
                return;
            }

            // Single-document operations affect at most 1 document (only if not an object operator):
            if (!isObjectFilter && SINGLE_DOC_SESSION_MUTATIONS.includes(op)) {
                const doc = await this.model
                    .findOne(filter)
                    .select('_id userId')
                    .lean()
                    .exec();

                if (doc && doc._id) {
                    this._preUpdateSessionIds = [doc._id.toString()];
                } else {
                    this._preUpdateSessionIds = [];
                }
                return;
            }

            // Multi-document path (updateMany, deleteMany OR when filter._id/filter.userId is an object operator like $in)
            const affectedDocs = await this.model
                .find(filter)
                .select('_id userId')
                .limit(501)
                .lean()
                .exec();

            this._preUpdateSessionIds = affectedDocs
                .slice(0, 500)
                .map((d: any) => d._id?.toString())
                .filter(Boolean);

            // If matches exceed 500 or filter is empty/broad, flag for full SCAN fallback
            if (affectedDocs.length > 500 || Object.keys(filter).length === 0) {
                this._preUpdateNeedsScan = true;
            }
        } catch (err: any) {
            this._preUpdateNeedsScan = true;
        }
    }
);

// Post-hook for update/delete/replace operations:
// Invalidates the captured session IDs (even if the mutation changed status/isActive or deleted doc).
sessionSchema.post(
    SESSION_MUTATION_METHODS,
    async function (this: any) {
        try {
            const sessionIds: string[] = this._preUpdateSessionIds || [];
            if (sessionIds.length > 0) {
                await Promise.all(sessionIds.map((sid: string) => invalidateSessionCache(sid)));
            }
            if (
                this._preUpdateNeedsScan ||
                (sessionIds.length === 0 && Object.keys(this.getFilter() || {}).length === 0)
            ) {
                await invalidateAllSessionCacheByScan();
            }
        } catch (err: any) {
            logger.warn(`[sessionSchema] Post-mutation cache invalidation error: ${err.message}`);
        }
    }
);

const Session = mongoose.model<ISession, ISessionModel>('Session', sessionSchema);
export default Session;