/**
 * auth.repository.ts
 * Auth module ki saari direct database aur cache access yahin hai.
 * Business logic AuthService mein rehta hai.
 */

import CacheUtil from '@/shared/cache.util';
import logger, { LoggerUtil } from '@/shared/logger.util';
import {
    User,
    UserProfile,
    Device,
    Session,
    AuditLog,
    LoginAttempt,
} from '@/shared/models/index.models';
import Constants from '@/shared/constants.util';
import {
    GetAllUsersParams,
    GetAllUsersResult,
    UserForVerification,
    DeviceData,
} from '../interfaces/auth.interfaces';
import TokenBlacklistUtil, { hashTokenForBlacklist } from '@/shared/utils/tokenBlacklist.util';

const MAX_ACTIVE_DEVICES = Number(process.env['MAX_ACTIVE_DEVICES']) || 3;
const VALID_DEVICE_TYPES = ['desktop', 'mobile', 'tablet', 'unknown'];

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined;

// ==================== USER QUERIES ====================

export class UserRepository {

    static async findByEmail(email: string): Promise<any | null> {
        return User.findOne({ email: (email || '').trim().toLowerCase() }).lean().exec();
    }

    /**
     * Password fields ke saath (login ke liye)
     */
    static async findByEmailWithPassword(email: string): Promise<any | null> {
        return User.findOne({
            email: (email || '').trim().toLowerCase(),
            'flags.isDeleted': { $ne: true },
        })
            .select('+passwordHash +passwordSalt')
            .exec();
    }

    static async findByUserId(userId: string): Promise<any | null> {
        return User.findOne({ userId, 'flags.isDeleted': false })
            .select('-passwordHash -passwordSalt -backupCodes -twoFactorSecret -__v')
            .lean()
            .exec();
    }

    static async findByUserIdForProfile(userId: string): Promise<any | null> {
        return User.findOne({ userId })
            .select('-passwordHash -passwordSalt -backupCodes -__v')
            .lean()
            .exec();
    }

    static async findByUserIdWithPassword(userId: string): Promise<any | null> {
        return User.findOne({ userId })
            .select('+passwordHash +passwordSalt preferences onboarding phoneNumber email')
            .lean()
            .exec();
    }

    static async findByEmailOrOAuth(
        email: string,
        provider: string,
        providerId: string
    ): Promise<any | null> {
        return User.findOne({
            $or: [
                { email: email.toLowerCase() },
                {
                    'oauthProviders.provider': provider,
                    'oauthProviders.providerId': providerId,
                },
            ],
        });
    }

    static async emailExistsForOtherUser(
        email: string,
        currentUserId: string
    ): Promise<boolean> {
        const user = await User.findOne({
            email: email.trim().toLowerCase(),
            userId: { $ne: currentUserId },
        });
        return !!user;
    }

    static async usernameExists(username: string): Promise<boolean> {
        const user = await User.findOne({ username });
        return !!user;
    }

    static async updateByUserId(
        userId: string,
        updates: Record<string, any>
    ): Promise<any | null> {
        return User.findOneAndUpdate(
            { userId, 'flags.isDeleted': false },
            { $set: { ...updates, updatedAt: new Date() } },
            {
                new: true,
                runValidators: true,
                select: '-passwordHash -passwordSalt -backupCodes -twoFactorSecret -__v',
            }
        ).lean();
    }

    static async updateLastActive(userId: string): Promise<void> {
        await User.findOneAndUpdate(
            { userId },
            { $set: { 'metadata.lastActiveAt': new Date() } }
        );
    }

    static async deleteByUserId(userId: string): Promise<any> {
        return User.deleteOne({ userId });
    }

    /**
     * Admin: paginated users. Filters sirf strings maane jaate hain (operator injection nahi),
     * aur regex escape hota hai.
     */
    static async findAllPaginated(
        params: GetAllUsersParams
    ): Promise<GetAllUsersResult> {
        const { limit, skip, filters, sortBy } = params;

        const query: any = { 'flags.isDeleted': false };

        const status = asString((filters as any)?.status);
        const role = asString((filters as any)?.role);
        const userType = asString((filters as any)?.userType);
        const location = asString((filters as any)?.location);
        const search = asString((filters as any)?.search);

        if (status) query.status = status;
        if (role) query.role = role;
        if (userType) query['onboarding.userType'] = userType;
        if (location) {
            query.location = { $regex: escapeRegex(location), $options: 'i' };
        }
        if (search) {
            const searchRegex = { $regex: escapeRegex(search), $options: 'i' };
            query.$or = [
                { email: searchRegex },
                { firstName: searchRegex },
                { lastName: searchRegex },
            ];
        }

        const sort: Record<string, 1 | -1> =
            sortBy === 'oldest' ? { createdAt: 1 }
                : sortBy === 'name' ? { firstName: 1, lastName: 1 }
                    : sortBy === 'email' ? { email: 1 }
                        : { createdAt: -1 };

        const [users, total] = await Promise.all([
            User.find(query)
                .select(`
                    userId email firstName lastName location
                    onboarding.userType role status emailVerified
                    phoneVerified phoneNumber lastLoginAt
                    metadata.totalLogins createdAt updatedAt profilePhotoId
                `)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            User.countDocuments(query),
        ]);

        return {
            users,
            total,
            totalPages: Math.ceil(total / limit),
        };
    }

    static async findForVerification(
        userId: string
    ): Promise<UserForVerification | null> {
        const user = await User.findOne({ userId })
            .select(
                'userId email emailVerified phoneNumber phoneVerified firstName lastName status accountStatus'
            )
            .lean()
            .exec();

        if (!user) return null;
        if (user.status !== 'active') return null;
        if (user.accountStatus && user.accountStatus !== 'active') return null;

        return user as UserForVerification;
    }
}

// ==================== LOGIN ATTEMPT QUERIES ====================

export class LoginAttemptRepository {

    static async countRecentByIp(
        ipAddress: string,
        windowMs: number = 15 * 60 * 1000
    ): Promise<number> {
        return LoginAttempt.countDocuments({
            ipAddress,
            status: 'failed',
            attemptedAt: { $gte: new Date(Date.now() - windowMs) },
        });
    }

    static async countRecentByUserAndIp(
        userId: string,
        ipAddress: string,
        windowMs: number = 15 * 60 * 1000
    ): Promise<number> {
        return LoginAttempt.countDocuments({
            userId,
            ipAddress,
            status: 'failed',
            attemptedAt: { $gte: new Date(Date.now() - windowMs) },
        });
    }

    static async recordSafe(
        userId: string | null,
        ipAddress: string,
        action: string,
        status: string,
        extras: Record<string, any> = {}
    ): Promise<void> {
        try {
            await LoginAttempt.recordAttempt(userId, ipAddress, action, status, extras);
        } catch (err: any) {
            logger.error('LoginAttempt recording failed (non-critical)', {
                error: err.message,
            });
        }
    }
}

// ==================== SESSION QUERIES ====================
// Session model ke asli fields: _id (sessionId), isActive, lastActivity,
// terminatedAt, terminationReason.

export class SessionRepository {

    static async findSession(
        sessionId: string,
        userId: string
    ): Promise<any | null> {
        return Session.findOne({ _id: sessionId, userId });
    }

    static async createSession(data: {
        userId: string;
        ipAddress: string;
        deviceId: string;
        sessionType: 'mobile' | 'web' | 'api' | 'oauth';
        deviceInfo?: Record<string, any>;
    }): Promise<any> {
        return Session.createSession(data);
    }

    static async terminateAllForUser(
        userId: string,
        reason: string
    ): Promise<void> {
        const now = new Date();
        await Session.updateMany(
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
    }

    static async findAllActive(userId: string): Promise<any[]> {
        return Session.find({ userId, isActive: true });
    }

    static async countActive(userId: string): Promise<number> {
        return Session.countDocuments({ userId, isActive: true });
    }

    static async findRecentForProfile(userId: string): Promise<any[]> {
        return Session.find({ userId, isActive: true })
            .select('_id deviceId ipAddress createdAt lastActivity sessionType')
            .sort({ lastActivity: -1 })
            .limit(10)
            .lean();
    }

    static async updateActivity(sessionMongoId: string): Promise<void> {
        await Session.updateActivity(sessionMongoId);
    }
}

// ==================== DEVICE QUERIES ====================

const normalizeDeviceData = (deviceData: DeviceData | any): any => {
    const data: any = deviceData || {};
    const userAgent: string = String(data.userAgent || '');

    let deviceType = String(data.deviceType || '').toLowerCase();
    if (!VALID_DEVICE_TYPES.includes(deviceType)) {
        deviceType = /mobile|android|iphone/i.test(userAgent)
            ? 'mobile'
            : userAgent
                ? 'desktop'
                : 'unknown';
    }

    return {
        ...data,
        deviceType,
        deviceName: data.deviceName ? String(data.deviceName).slice(0, 100) : data.deviceName,
    };
};

export class DeviceRepository {

    /**
     * Device register karo aur limit enforce karo (fire-and-forget).
     */
    static async registerDevice(
        userId: string,
        deviceData: DeviceData
    ): Promise<any> {
        const device = await Device.registerDevice(userId, normalizeDeviceData(deviceData));

        DeviceRepository.enforceLimit(userId, device.deviceId).catch((err: any) =>
            logger.error('Device limit enforcement failed (non-critical)', {
                error: err.message,
                userId,
            })
        );

        return device;
    }

    /**
     * Current device ko chhodkar sabse purane devices revoke karo (aur unke sessions band).
     */
    static async enforceLimit(
        userId: string,
        keepDeviceId: string,
        max: number = MAX_ACTIVE_DEVICES
    ): Promise<void> {
        const others = await Device.find({
            userId,
            isActive: true,
            deviceId: { $ne: keepDeviceId },
        }).sort({ lastSeenAt: 1 });

        const allowedOthers = Math.max(0, max - 1);
        if (others.length <= allowedOthers) return;

        const toRevoke = others.slice(0, others.length - allowedOthers);
        const deviceIds = toRevoke.map((d: any) => d.deviceId);
        const now = new Date();

        await Device.updateMany(
            { userId, deviceId: { $in: deviceIds } },
            {
                $set: {
                    isActive: false,
                    revokedAt: now,
                    revokedReason: 'device_limit_exceeded',
                },
            }
        );

        await Session.updateMany(
            { userId, deviceId: { $in: deviceIds }, isActive: true },
            {
                $set: {
                    isActive: false,
                    terminatedAt: now,
                    terminationReason: 'device_limit_exceeded',
                    revokedAt: now,
                    revokedReason: 'device_limit_exceeded',
                },
            }
        );

        logger.info('Old devices revoked (device limit)', {
            userId,
            revokedDeviceIds: deviceIds,
            keepDeviceId,
        });
    }

    static async deactivateDevice(
        deviceId: string,
        userId: string
    ): Promise<any | null> {
        return Device.findOneAndUpdate(
            { deviceId, userId },
            { $set: { isActive: false, lastSeenAt: new Date() } },
            { new: true }
        );
    }

    static async deactivateAllForUser(userId: string): Promise<number> {
        const result = await Device.updateMany(
            { userId, isActive: true },
            { $set: { isActive: false, lastSeenAt: new Date() } }
        );
        return result.modifiedCount || 0;
    }

    static async countActive(userId: string): Promise<number> {
        return Device.countDocuments({ userId, isActive: true });
    }

    static async deleteAllForUser(userId: string): Promise<any> {
        return Device.deleteMany({ userId });
    }
}

// ==================== USER PROFILE QUERIES ====================

export class UserProfileRepository {

    static async create(data: Record<string, any>): Promise<any> {
        return UserProfile.create(data);
    }
}

// ==================== AUDIT LOG QUERIES ====================

export class AuditLogRepository {

    static async logAction(data: {
        userId: string;
        userEmail: string;
        action: string;
        ipAddress: string;
        status: 'WARNING' | 'SUCCESS' | 'FAILURE' | 'FAILED';
        severity: 'LOW' | 'MEDIUM' | 'HIGH';
        metadata: Map<string, any>;
    }): Promise<void> {
        await AuditLog.logAction(data);
    }
}

// ==================== CACHE HELPERS ====================

export class AuthCacheRepository {

    static async blacklistAccessToken(token: string, ttl: number = 900): Promise<void> {
        const hash = hashTokenForBlacklist(token);
        await CacheUtil.set(`blacklist:access:${hash}`, 'true', ttl);
    }

    static async blacklistRefreshToken(token: string): Promise<void> {
        const hash = hashTokenForBlacklist(token);
        await CacheUtil.set(
            `blacklist:refresh:${hash}`,
            'true',
            7 * 24 * 60 * 60
        );
    }

    static async isBlacklisted(type: 'access' | 'refresh', token: string): Promise<boolean> {
        if (type === 'access') {
            return TokenBlacklistUtil.isAccessTokenBlacklisted(token);
        }
        return TokenBlacklistUtil.isRefreshTokenBlacklisted(token);
    }

    static async getCachedProfile(userId: string): Promise<any | null> {
        const data = await CacheUtil.get(`user:profile:${userId}`);
        if (!data) return null;
        return typeof data === 'string' ? JSON.parse(data) : data;
    }

    static async setCachedProfile(userId: string, profile: any): Promise<void> {
        await CacheUtil.set(`user:profile:${userId}`, profile, 900);
    }

    /**
     * "user:<userId>" key: sirf PUBLIC profile (AuthService.getUserById).
     */
    static async getCachedUser(userId: string): Promise<any | null> {
        const data = await CacheUtil.get(`user:${userId}`);
        if (!data) return null;
        return typeof data === 'string' ? JSON.parse(data) : data;
    }

    static async setCachedUser(userId: string, user: any): Promise<void> {
        await CacheUtil.set(`user:${userId}`, JSON.stringify(user), 900);
    }

    // Login ka session-scoped user snapshot (public profile cache se alag key)
    static async setLoginSessionUser(userId: string, data: any, ttl: number): Promise<void> {
        await CacheUtil.set(`session:user:${userId}`, data, ttl);
    }

    static async getLoginSessionUser(userId: string): Promise<any | null> {
        const data = await CacheUtil.get(`session:user:${userId}`);
        if (!data) return null;
        return typeof data === 'string' ? JSON.parse(data) : data;
    }

    static async invalidateUserCaches(userId: string): Promise<void> {
        try {
            await Promise.all([
                CacheUtil.del(`user:profile:${userId}`),
                CacheUtil.del(`user:${userId}`),
                CacheUtil.del(`session:user:${userId}`),
                CacheUtil.del(`${Constants.CACHE_PREFIXES.USER}${userId}`),
                CacheUtil.clearByPattern(`session:user:${userId}:*`),
                CacheUtil.clearByPattern(`user:*:${userId}:*`),
            ]);
        } catch (err: any) {
            LoggerUtil.warn('Cache invalidation failed (non-critical)', {
                error: err.message,
                userId,
            });
        }
    }

    static async invalidateSessionCache(
        userId: string,
        sessionId: string
    ): Promise<void> {
        try {
            await Promise.all([
                CacheUtil.del(`session:${sessionId}`),
                CacheUtil.del(`user:session:${userId}:${sessionId}`),
                CacheUtil.del(`user:profile:${userId}`),
                CacheUtil.del(`session:user:${userId}`),
                CacheUtil.del(`${Constants.CACHE_PREFIXES?.USER}${userId}`),
                CacheUtil.del(`${Constants.CACHE_PREFIXES?.SESSION}${sessionId}`),
            ]);
        } catch (err: any) {
            LoggerUtil.warn('Session cache invalidation failed (non-critical)', {
                error: err.message,
                userId,
                sessionId,
            });
        }
    }

    // Verification ke liye alag cache namespace ("verify:user:<userId>")
    static async getCachedVerificationUser(userId: string): Promise<any | null> {
        const data = await CacheUtil.get(`verify:user:${userId}`);
        if (!data) return null;
        return typeof data === 'string' ? JSON.parse(data) : data;
    }

    static async setCachedVerificationUser(userId: string, user: any, ttl: number): Promise<void> {
        await CacheUtil.set(`verify:user:${userId}`, JSON.stringify(user), ttl);
    }

    static async getRateLimit(key: string): Promise<number> {
        return parseInt((await CacheUtil.get(key)) as string) || 0;
    }

    static async setRateLimit(key: string, count: number, ttl: number): Promise<void> {
        await CacheUtil.set(key, count, ttl);
    }

    static async del(key: string): Promise<void> {
        await CacheUtil.del(key);
    }

    static async get(key: string): Promise<any> {
        return CacheUtil.get(key);
    }

    static async set(key: string, value: any, ttl: number): Promise<void> {
        await CacheUtil.set(key, value, ttl);
    }
}