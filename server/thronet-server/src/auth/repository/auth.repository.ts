/**
 * auth.repository.ts
 * All direct database and cache interactions for auth module.
 * Business logic stays in AuthService; only data-access lives here.
 */

import { v4 as uuidv4 } from 'uuid';
import CacheUtil from '@/shared/cache.util';
import logger, { LoggerUtil } from '@/shared/logger.util.js';
import {
    User,
    UserProfile,
    Device,
    Session,
    AuditLog,
    LoginAttempt,
} from '@/shared/models/index.models';
import Constants from '@/shared/constants.util.js';
import {
    ProfileOptions,
    GetAllUsersParams,
    GetAllUsersResult,
    UserForVerification,
    DeviceData,
} from '../interfaces/auth.interfaces';

// ==================== USER QUERIES ====================

export class UserRepository {

    /**
     * Find user by email (without sensitive fields)
     */
    static async findByEmail(email: string): Promise<any | null> {
        return User.findOne({ email }).lean().exec();
    }

    /**
     * Find user by email WITH password fields (for login)
     */
    static async findByEmailWithPassword(email: string): Promise<any | null> {
        return User.findOne({ email })
            .select('+passwordHash +passwordSalt')
            .exec();
    }

    /**
     * Find user by userId (excludes sensitive fields)
     */
    static async findByUserId(userId: string): Promise<any | null> {
        return User.findOne({ userId, 'flags.isDeleted': false })
            .select('-passwordHash -passwordSalt -backupCodes -twoFactorSecret -__v')
            .lean()
            .exec();
    }

    /**
     * Find user by userId for profile (includes more fields)
     */
    static async findByUserIdForProfile(userId: string): Promise<any | null> {
        return User.findOne({ userId })
            .select('-passwordHash -passwordSalt -backupCodes -__v')
            .lean()
            .exec();
    }

    /**
     * Find user by userId with password (for profile update validation)
     */
    static async findByUserIdWithPassword(userId: string): Promise<any | null> {
        return User.findOne({ userId })
            .select('+passwordHash +passwordSalt preferences onboarding')
            .lean()
            .exec();
    }

    /**
     * Find user by email or OAuth providerId
     */
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

    /**
     * Check if email exists for another user (update conflict check)
     */
    static async emailExistsForOtherUser(
        email: string,
        currentUserId: string
    ): Promise<boolean> {
        const user = await User.findOne({
            email,
            userId: { $ne: currentUserId },
        });
        return !!user;
    }

    /**
     * Check if username exists (for uniqueness)
     */
    static async usernameExists(username: string): Promise<boolean> {
        const user = await User.findOne({ username });
        return !!user;
    }

    /**
     * Update user by userId with partial data
     */
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

    /**
     * Update last active timestamp
     */
    static async updateLastActive(userId: string): Promise<void> {
        await User.findOneAndUpdate(
            { userId },
            { $set: { 'metadata.lastActiveAt': new Date() } }
        );
    }

    /**
     * Delete user permanently
     */
    static async deleteByUserId(userId: string): Promise<any> {
        return User.deleteOne({ userId });
    }

    /**
     * Get paginated list of all users
     */
    static async findAllPaginated(
        params: GetAllUsersParams
    ): Promise<GetAllUsersResult> {
        const { page, limit, skip, filters, sortBy } = params;

        const query: any = { 'flags.isDeleted': false };

        if (filters.status) query.status = filters.status;
        if (filters.role) query.role = filters.role;
        if (filters.userType) query['onboarding.userType'] = filters.userType;
        if (filters.location) {
            query.location = { $regex: filters.location, $options: 'i' };
        }
        if (filters.search) {
            const searchRegex = { $regex: filters.search, $options: 'i' };
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
                    metadata.totalLogins createdAt updatedAt
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

    /**
     * Find user by userId for verification (status-checked)
     */
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

    /**
     * Count recent failed attempts for an IP
     */
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

    /**
     * Count recent failed attempts for a specific user+IP
     */
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

    /**
     * Record a login attempt (safe - swallows errors)
     */
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

export class SessionRepository {

    /**
     * Find session by sessionId + userId
     */
    static async findSession(
        sessionId: string,
        userId: string
    ): Promise<any | null> {
        return Session.findOne({ sessionId, userId });
    }

    /**
     * Create new session
     */
    static async createSession(data: {
        userId: string;
        ipAddress: string;
        deviceId: string;
        sessionType: string;
        deviceInfo?: Record<string, any>;
    }): Promise<any> {
        return Session.createSession(data);
    }

    /**
     * Terminate all active sessions for a user
     */
    static async terminateAllForUser(
        userId: string,
        reason: string
    ): Promise<void> {
        await Session.updateMany(
            { userId, status: 'active' },
            {
                $set: {
                    status: 'terminated',
                    terminatedAt: new Date(),
                    terminationReason: reason,
                },
            }
        );
    }

    /**
     * Get all active sessions for a user
     */
    static async findAllActive(userId: string): Promise<any[]> {
        return Session.find({ userId, status: 'active' });
    }

    /**
     * Count active sessions for a user
     */
    static async countActive(userId: string): Promise<number> {
        return Session.countDocuments({ userId, status: 'active' });
    }

    /**
     * Get recent sessions for profile display
     */
    static async findRecentForProfile(userId: string): Promise<any[]> {
        return Session.find({ userId, status: 'active' })
            .select('sessionId deviceId ipAddress createdAt lastActivityAt')
            .sort({ lastActivityAt: -1 })
            .limit(10)
            .lean();
    }

    /**
     * Update session activity timestamp
     */
    static async updateActivity(sessionMongoId: string): Promise<void> {
        await Session.updateActivity(sessionMongoId);
    }
}

// ==================== DEVICE QUERIES ====================

export class DeviceRepository {

    /**
     * Register or find device
     */
    static async registerDevice(
        userId: string,
        deviceData: DeviceData
    ): Promise<any> {
        return Device.registerDevice(userId, deviceData);
    }

    /**
     * Deactivate a single device
     */
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

    /**
     * Deactivate all devices for a user
     */
    static async deactivateAllForUser(userId: string): Promise<number> {
        const result = await Device.updateMany(
            { userId, isActive: true },
            { $set: { isActive: false, lastSeenAt: new Date() } }
        );
        return result.modifiedCount || 0;
    }

    /**
     * Count active devices for a user
     */
    static async countActive(userId: string): Promise<number> {
        return Device.countDocuments({ userId, isActive: true });
    }

    /**
     * Delete all devices for a user (hard delete)
     */
    static async deleteAllForUser(userId: string): Promise<any> {
        return Device.deleteMany({ userId });
    }
}

// ==================== USER PROFILE QUERIES ====================

export class UserProfileRepository {

    /**
     * Create user profile document
     */
    static async create(data: Record<string, any>): Promise<any> {
        return UserProfile.create(data);
    }
}

// ==================== AUDIT LOG QUERIES ====================

export class AuditLogRepository {

    /**
     * Log an action to AuditLog model
     */
    static async logAction(data: {
        userId: string;
        userEmail: string;
        action: string;
        ipAddress: string;
        status: string;
        severity: string;
        metadata: Map<string, any>;
    }): Promise<void> {
        await AuditLog.logAction(data);
    }
}

// ==================== CACHE HELPERS ====================

export class AuthCacheRepository {

    /**
     * Blacklist an access token
     */
    static async blacklistAccessToken(token: string, ttl: number = 900): Promise<void> {
        await CacheUtil.set(`blacklist:access:${token}`, 'true', ttl);
    }

    /**
     * Blacklist a refresh token
     */
    static async blacklistRefreshToken(token: string): Promise<void> {
        await CacheUtil.set(
            `blacklist:refresh:${token}`,
            'true',
            7 * 24 * 60 * 60
        );
    }

    /**
     * Check if a token is blacklisted
     */
    static async isBlacklisted(type: 'access' | 'refresh', token: string): Promise<boolean> {
        return CacheUtil.exists(`blacklist:${type}:${token}`);
    }

    /**
     * Get cached user profile
     */
    static async getCachedProfile(userId: string): Promise<any | null> {
        const data = await CacheUtil.get(`user:profile:${userId}`);
        if (!data) return null;
        return typeof data === 'string' ? JSON.parse(data) : data;
    }

    /**
     * Set cached user profile
     */
    static async setCachedProfile(userId: string, profile: any): Promise<void> {
        await CacheUtil.set(`user:profile:${userId}`, profile, 900);
    }

    /**
     * Get cached user by userId (generic)
     */
    static async getCachedUser(userId: string): Promise<any | null> {
        const data = await CacheUtil.get(`user:${userId}`);
        if (!data) return null;
        return typeof data === 'string' ? JSON.parse(data) : data;
    }

    /**
     * Set cached user
     */
    static async setCachedUser(userId: string, user: any): Promise<void> {
        await CacheUtil.set(`user:${userId}`, JSON.stringify(user), 900);
    }

    /**
     * Invalidate all user-related caches
     */
    static async invalidateUserCaches(userId: string): Promise<void> {
        try {
            await Promise.all([
                CacheUtil.del(`user:profile:${userId}`),
                CacheUtil.del(`user:${userId}`),
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

    /**
     * Invalidate session-specific caches
     */
    static async invalidateSessionCache(
        userId: string,
        sessionId: string
    ): Promise<void> {
        try {
            await Promise.all([
                CacheUtil.del(`session:${sessionId}`),
                CacheUtil.del(`user:session:${userId}:${sessionId}`),
                CacheUtil.del(`user:profile:${userId}`),
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

    /**
     * Get rate limit counter
     */
    static async getRateLimit(key: string): Promise<number> {
        return parseInt((await CacheUtil.get(key)) as string) || 0;
    }

    /**
     * Increment and set rate limit counter
     */
    static async setRateLimit(key: string, count: number, ttl: number): Promise<void> {
        await CacheUtil.set(key, count, ttl);
    }

    /**
     * Delete a cache key
     */
    static async del(key: string): Promise<void> {
        await CacheUtil.del(key);
    }

    /**
     * Get a raw cache value
     */
    static async get(key: string): Promise<any> {
        return CacheUtil.get(key);
    }

    /**
     * Set a raw cache value
     */
    static async set(key: string, value: any, ttl: number): Promise<void> {
        await CacheUtil.set(key, value, ttl);
    }
}