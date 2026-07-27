import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';
import { LoggerUtil } from '@/shared/logger.util';
import userEmitter from '@/shared/events/emitters/user.emitter';
import AuditLog from './AuditLog.model';

const logger = LoggerUtil;

export interface IMetadata {
    browser?: string;
    os?: string;
    deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
    location?: {
        country?: string;
        city?: string;
        timezone?: string;
    };
}

export interface IRefreshToken extends Document {
    tokenId: string;
    userId: string;
    hashedToken: string;
    deviceId?: string;
    sessionId: string;
    ipAddress: string;
    userAgent?: string;
    isActive: boolean;
    expiresAt: Date;
    lastUsedAt: Date;
    usageCount: number;
    maxUsageCount: number;
    revokedAt?: Date;
    revokedBy?: 'user' | 'admin' | 'system' | 'security';
    revokedReason?: 'user_request' | 'security_breach' | 'token_rotation' | 'session_timeout' | 'suspicious_activity' | 'admin_action';
    metadata?: IMetadata;
    createdAt: Date;
    updatedAt: Date;
    revoke(reason?: string, revokedBy?: string): Promise<IRefreshToken>;
}

export interface IRefreshTokenModel extends Model<IRefreshToken> {
    generateHashedToken(token: string): string;
    createToken(userId: string, sessionId: string, deviceId: string, ipAddress: string, options?: any): Promise<{ rawToken: string; tokenId: string; expiresAt: Date }>;
    validateToken(rawToken: string, ipAddress: string): Promise<IRefreshToken>;
    revokeAllUserTokens(userId: string, reason?: string, revokedBy?: string): Promise<{ revokedCount: number }>;
    cleanupOldTokens(userId: string, keepCount?: number): Promise<number>;
    getUserTokens(userId: string, options?: { limit?: number }): Promise<any[]>;
    rotateToken(oldRawToken: string, ipAddress: string, options?: any): Promise<{ rawToken: string; tokenId: string; expiresAt: Date }>;
}

const RefreshTokenSchema = new Schema<IRefreshToken, IRefreshTokenModel>(
    {
        tokenId: {
            type: String,
            required: [true, 'Token ID is required'],
            unique: true,
            default: () => crypto.randomBytes(32).toString('hex'),
            // ✅ CORRECT: unique:true apne aap index banata hai
            //  hataya - unique already ek index hai, duplicate nahi banana
        },
        userId: {
            type: String,
            required: [true, 'User ID is required'],
        },
        hashedToken: {
            type: String,
            required: [true, 'Hashed token is required'],
            unique: true,
        },
        deviceId: { type: String },
        sessionId: { type: String, required: true },
        ipAddress: { type: String, required: true },
        userAgent: String,
        isActive: { type: Boolean, default: true },
        // ✅ CORRECT: TTL index yahan field mein sahi hai
        expiresAt: {
            type: Date,
            required: true,
            index: { expireAfterSeconds: 0 },
        },
        lastUsedAt: { type: Date, default: Date.now },
        usageCount: { type: Number, default: 0, min: 0 },
        maxUsageCount: { type: Number, default: 1, min: 1 },
        revokedAt: Date,
        revokedBy: {
            type: String,
            enum: ['user', 'admin', 'system', 'security'],
        },
        revokedReason: {
            type: String,
            enum: ['user_request', 'security_breach', 'token_rotation', 'session_timeout', 'suspicious_activity', 'admin_action'],
        },
        metadata: {
            browser: String,
            os: String,
            deviceType: {
                type: String,
                enum: ['desktop', 'mobile', 'tablet', 'unknown'],
                default: 'unknown',
            },
            location: {
                country: String,
                city: String,
                timezone: String,
            },
        },
    },
    {
        timestamps: true,
        collection: 'refresh_tokens',
        shardKey: { userId: 'hashed' },
    }
);

// ==================== INDEXES ====================
// ✅ Sirf compound indexes yahan - single field indexes upar defined hain
RefreshTokenSchema.index({ userId: 1, isActive: 1, expiresAt: -1 });
RefreshTokenSchema.index({ hashedToken: 1, isActive: 1 });
RefreshTokenSchema.index({ sessionId: 1, isActive: 1 });

RefreshTokenSchema.statics.generateHashedToken = function (token: string): string {
    const salt = process.env['REFRESH_TOKEN_SALT'] || 'default-salt-change-in-production';
    return crypto.createHash('sha256').update(token + salt).digest('hex');
};

RefreshTokenSchema.statics.createToken = async function (
    userId: string,
    sessionId: string,
    deviceId: string,
    ipAddress: string,
    options: any = {}
): Promise<{ rawToken: string; tokenId: string; expiresAt: Date }> {
    try {
        const { ttl = 7 * 24 * 60 * 60, userAgent, metadata = {}, maxUsageCount = 1 } = options;
        const rawToken = crypto.randomBytes(64).toString('hex');
        const hashedToken = this.generateHashedToken(rawToken);

        await this.cleanupOldTokens(userId, 5);

        const refreshToken = new this({
            userId,
            sessionId,
            deviceId,
            hashedToken,
            ipAddress,
            userAgent,
            expiresAt: new Date(Date.now() + ttl * 1000),
            maxUsageCount,
            metadata,
        });

        await refreshToken.save();

        await AuditLog.logAction({
            userId,
            action: 'REFRESH_TOKEN_CREATED',
            ipAddress,
            status: 'SUCCESS',
            severity: 'LOW',
            metadata: new Map([
                ['tokenId', refreshToken.tokenId],
                ['deviceId', deviceId],
                ['sessionId', sessionId],
            ]),
        });

        userEmitter.emit('token:created', {
            tokenId: refreshToken.tokenId,
            userId,
            sessionId,
            timestamp: new Date(),
        });

        return { rawToken, tokenId: refreshToken.tokenId, expiresAt: refreshToken.expiresAt };
    } catch (error: any) {
        logger.error('Refresh token creation failed', { error: (error as Error).message, userId });
        throw error;
    }
};

RefreshTokenSchema.statics.validateToken = async function (rawToken: string, ipAddress: string): Promise<IRefreshToken> {
    try {
        const hashedToken = this.generateHashedToken(rawToken);
        const token = await this.findOne({
            hashedToken,
            isActive: true,
            expiresAt: { $gt: new Date() },
        });

        if (!token) throw new Error('Invalid or expired refresh token');

        if (token.usageCount >= token.maxUsageCount) {
            await token.revoke('token_rotation', 'system');
            throw new Error('Refresh token usage limit exceeded');
        }

        if (token.ipAddress !== ipAddress) {
            await AuditLog.logAction({
                userId: token.userId,
                action: 'SUSPICIOUS_ACTIVITY',
                ipAddress,
                status: 'WARNING',
                severity: 'HIGH',
                metadata: new Map([
                    ['reason', 'IP address mismatch'],
                    ['originalIp', token.ipAddress],
                    ['currentIp', ipAddress],
                ]),
            });
        }

        token.usageCount += 1;
        token.lastUsedAt = new Date();
        await token.save();

        return token;
    } catch (error: any) {
        logger.error('Refresh token validation failed', { error: (error as Error).message });
        throw error;
    }
};

RefreshTokenSchema.methods.revoke = async function (
    this: IRefreshToken,
    reason: string = 'user_request',
    revokedBy: string = 'user'
): Promise<IRefreshToken> {
    try {
        if (!this.isActive) return this;
        this.isActive = false;
        this.revokedAt = new Date();
        this.revokedReason = reason as any;
        this.revokedBy = revokedBy as any;
        await this.save();

        await AuditLog.logAction({
            userId: this.userId,
            action: 'REFRESH_TOKEN_REVOKED',
            ipAddress: this.ipAddress,
            status: 'SUCCESS',
            severity: 'MEDIUM',
            metadata: new Map([
                ['tokenId', this.tokenId],
                ['reason', reason],
                ['revokedBy', revokedBy],
            ]),
        });

        userEmitter.emit('token:revoked', {
            tokenId: this.tokenId,
            userId: this.userId,
            reason,
            timestamp: new Date(),
        });

        return this;
    } catch (error: any) {
        logger.error('Refresh token revocation failed', { error: (error as Error).message, tokenId: this.tokenId });
        throw error;
    }
};

RefreshTokenSchema.statics.revokeAllUserTokens = async function (
    userId: string,
    reason: string = 'user_request',
    revokedBy: string = 'user'
): Promise<{ revokedCount: number }> {
    try {
        const result = await this.updateMany(
            { userId, isActive: true },
            {
                $set: {
                    isActive: false,
                    revokedAt: new Date(),
                    revokedReason: reason,
                    revokedBy,
                },
            }
        );

        await AuditLog.logAction({
            userId,
            action: 'ALL_REFRESH_TOKENS_REVOKED',
            status: 'SUCCESS',
            severity: 'HIGH',
            metadata: new Map([
                ['count', result.modifiedCount.toString()],
                ['reason', reason],
            ]),
        });

        userEmitter.emit('tokens:all_revoked', {
            userId,
            count: result.modifiedCount,
            reason,
            timestamp: new Date(),
        });

        return { revokedCount: result.modifiedCount };
    } catch (error: any) {
        logger.error('All refresh tokens revocation failed', { error: (error as Error).message, userId });
        throw error;
    }
};

RefreshTokenSchema.statics.cleanupOldTokens = async function (userId: string, keepCount: number = 5): Promise<number> {
    try {
        const tokens = await this.find({ userId, isActive: false })
            .sort({ createdAt: -1 })
            .skip(keepCount);
        if (tokens.length === 0) return 0;
        const tokenIds = tokens.map((t) => t._id);
        const result = await this.deleteMany({ _id: { $in: tokenIds } });
        return result.deletedCount || 0;
    } catch (error: any) {
        logger.error('Token cleanup failed', { error: (error as Error).message, userId });
        throw error;
    }
};

RefreshTokenSchema.statics.getUserTokens = async function (userId: string, { limit = 10 }: { limit?: number } = {}): Promise<any[]> {
    try {
        const tokens = await this.find({ userId, isActive: true })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        return tokens.map((token) => ({
            tokenId: token.tokenId,
            deviceId: token.deviceId,
            ipAddress: token.ipAddress,
            createdAt: token.createdAt,
            expiresAt: token.expiresAt,
            lastUsedAt: token.lastUsedAt,
            usageCount: token.usageCount,
            metadata: token.metadata,
        }));
    } catch (error: any) {
        logger.error('User tokens retrieval failed', { error: (error as Error).message, userId });
        throw error;
    }
};

RefreshTokenSchema.statics.rotateToken = async function (
    oldRawToken: string,
    ipAddress: string,
    options: any = {}
): Promise<{ rawToken: string; tokenId: string; expiresAt: Date }> {
    try {
        const oldToken = await this.validateToken(oldRawToken, ipAddress);
        await oldToken.revoke('token_rotation', 'system');
        const newToken = await this.createToken(
            oldToken.userId,
            oldToken.sessionId,
            oldToken.deviceId!,
            ipAddress,
            { ...options, userAgent: oldToken.userAgent, metadata: oldToken.metadata }
        );
        return newToken;
    } catch (error: any) {
        logger.error('Token rotation failed', { error: (error as Error).message });
        throw error;
    }
};

RefreshTokenSchema.pre('save', function (next) {
    if (this.expiresAt && new Date(this.expiresAt) < new Date()) this.isActive = false;
    next();
}); 

const RefreshToken = mongoose.model<IRefreshToken, IRefreshTokenModel>('RefreshToken', RefreshTokenSchema);
export default RefreshToken;