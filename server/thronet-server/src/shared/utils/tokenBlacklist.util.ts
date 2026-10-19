/**
 * Token Blacklist Utility
 * Manages token invalidation and blacklisting for security
 * @module utils/tokenBlacklist.util
 */

import crypto from 'crypto';
import CacheUtil from '@/shared/cache.util';
import Constants from '@/shared/constants.util';
import { LoggerUtil } from '@/shared/logger.util';

import jwt from 'jsonwebtoken';

const logger = LoggerUtil;

export function hashTokenForBlacklist(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Computes remaining lifetime of JWT in seconds. Falls back to default if decode fails.
 */
function getRemainingTokenLifetimeSeconds(token: string, fallbackSeconds = Constants.CACHE_TTLS.TOKEN_BLACKLIST): number {
    try {
        const decoded = jwt.decode(token) as { exp?: number } | null;
        if (decoded && typeof decoded.exp === 'number') {
            const remaining = Math.floor(decoded.exp - Date.now() / 1000);
            return remaining > 0 ? remaining : 1; // Expire in 1s if already expired
        }
    } catch {
        // Fall back to default
    }
    return fallbackSeconds;
}

interface BlacklistEntry {
    tokenId: string;
    userId: string;
    reason: string;
    blacklistedAt: string;
}

export type BlacklistFailMode = 'closed' | 'database';

export function getBlacklistFailMode(): BlacklistFailMode {
    const mode = process.env['BLACKLIST_FAIL_MODE']?.toLowerCase();
    if (mode === 'database') return 'database';
    return 'closed'; // Default closed in production and by default
}

class TokenBlacklistUtil {
    /**
     * Blacklist an access token
     */
    static async blacklistAccessToken(
        token: string,
        userId: string,
        reason: string = 'manual_logout'
    ): Promise<boolean> {
        try {
            const tokenHash = hashTokenForBlacklist(token);
            const key = `${Constants.CACHE_PREFIXES.BLACKLIST_ACCESS}${tokenHash}`;
            const entry: BlacklistEntry = {
                tokenId: token.substring(0, 20), // Store partial for privacy
                userId,
                reason,
                blacklistedAt: new Date().toISOString(),
            };

            const ttl = getRemainingTokenLifetimeSeconds(token);

            await CacheUtil.set(
                key,
                entry,
                ttl
            );

            logger.info('Access token blacklisted', { userId, reason, ttl });
            return true;
        } catch (error: any) {
            logger.error('Failed to blacklist access token', {
                error: error.message,
                userId,
            });
            return false;
        }
    }

    /**
     * Blacklist a refresh token
     */
    static async blacklistRefreshToken(
        token: string,
        userId: string,
        reason: string = 'token_rotation'
    ): Promise<boolean> {
        try {
            const tokenHash = hashTokenForBlacklist(token);
            const key = `${Constants.CACHE_PREFIXES.BLACKLIST_REFRESH}${tokenHash}`;
            const entry: BlacklistEntry = {
                tokenId: token.substring(0, 20),
                userId,
                reason,
                blacklistedAt: new Date().toISOString(),
            };

            const ttl = getRemainingTokenLifetimeSeconds(token);

            await CacheUtil.set(
                key,
                entry,
                ttl
            );

            logger.info('Refresh token blacklisted', { userId, reason, ttl });
            return true;
        } catch (error: any) {
            logger.error('Failed to blacklist refresh token', {
                error: error.message,
                userId,
            });
            return false;
        }
    }

    /**
     * Check if access token is blacklisted
     */
    private static async handleBlacklistWhenRedisDown(token: string, tokenType: 'access' | 'refresh'): Promise<boolean> {
        const mode = getBlacklistFailMode();
        logger.warn(`Redis is unavailable for token blacklist check. Policy: BLACKLIST_FAIL_MODE=${mode}`, {
            tokenType,
            mode,
        });

        if (mode === 'closed') {
            // Fail closed: reject request (treat token as revoked/blacklisted)
            return true;
        }

        // Database fallback mode: verify session in MongoDB
        try {
            const decoded = jwt.decode(token) as { sessionId?: string; userId?: string; exp?: number } | null;
            if (!decoded) {
                logger.warn('Token could not be decoded during DB fallback blacklist check; failing closed');
                return true;
            }

            // If token is already expired according to JWT exp, treat as invalid
            if (decoded.exp && Math.floor(Date.now() / 1000) > decoded.exp) {
                return true;
            }

            const { default: Session } = await import('@/auth/models/Session.model');
            if (decoded.sessionId) {
                const session = await Session.findById(decoded.sessionId).lean();
                if (!session || !session.isActive || session.revokedAt || session.terminatedAt) {
                    return true; // Session terminated/revoked -> token is blacklisted
                }
                if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
                    return true;
                }
                return false; // Active valid session in DB -> not blacklisted
            }

            if (decoded.userId) {
                const { default: User } = await import('@/auth/models/User.model');
                const user = await User.findOne({ userId: decoded.userId }).lean();
                if (!user || user.status !== 'active' || user.accountStatus !== 'active') {
                    return true;
                }
                if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
                    return true;
                }
                return false;
            }

            return true;
        } catch (dbErr: any) {
            logger.error('Database fallback token blacklist check failed; failing closed', {
                error: dbErr.message,
            });
            return true;
        }
    }

    /**
     * Check if access token is blacklisted
     */
    static async isAccessTokenBlacklisted(token: string): Promise<boolean> {
        if (!CacheUtil.isConnected()) {
            return this.handleBlacklistWhenRedisDown(token, 'access');
        }

        try {
            const tokenHash = hashTokenForBlacklist(token);
            const hashedKey = `${Constants.CACHE_PREFIXES.BLACKLIST_ACCESS}${tokenHash}`;
            const entry = await CacheUtil.get(hashedKey);
            if (entry) return true;

            // Migration safety: check legacy raw key if flag is enabled (default true)
            if (process.env['BLACKLIST_LEGACY_RAW_KEYS_ENABLED'] !== 'false') {
                const legacyKey = `${Constants.CACHE_PREFIXES.BLACKLIST_ACCESS}${token}`;
                const legacyEntry = await CacheUtil.get(legacyKey);
                if (legacyEntry) return true;
            }

            return false;
        } catch (error: any) {
            logger.error('Failed to check access token blacklist in Redis', {
                error: error.message,
            });
            return this.handleBlacklistWhenRedisDown(token, 'access');
        }
    }

    /**
     * Check if refresh token is blacklisted
     */
    static async isRefreshTokenBlacklisted(token: string): Promise<boolean> {
        if (!CacheUtil.isConnected()) {
            return this.handleBlacklistWhenRedisDown(token, 'refresh');
        }

        try {
            const tokenHash = hashTokenForBlacklist(token);
            const hashedKey = `${Constants.CACHE_PREFIXES.BLACKLIST_REFRESH}${tokenHash}`;
            const entry = await CacheUtil.get(hashedKey);
            if (entry) return true;

            // Migration safety: check legacy raw key if flag is enabled (default true)
            if (process.env['BLACKLIST_LEGACY_RAW_KEYS_ENABLED'] !== 'false') {
                const legacyKey = `${Constants.CACHE_PREFIXES.BLACKLIST_REFRESH}${token}`;
                const legacyEntry = await CacheUtil.get(legacyKey);
                if (legacyEntry) return true;
            }

            return false;
        } catch (error: any) {
            logger.error('Failed to check refresh token blacklist in Redis', {
                error: error.message,
            });
            return this.handleBlacklistWhenRedisDown(token, 'refresh');
        }
    }

    /**
     * Blacklist all user tokens (for logout all devices)
     */
    static async blacklistAllUserTokens(userId: string): Promise<boolean> {
        try {
            // Store user-level blacklist marker
            const key = `${Constants.CACHE_PREFIXES.BLACKLIST}user:${userId}`;
            await CacheUtil.set(
                key,
                {
                    userId,
                    reason: 'logout_all_devices',
                    blacklistedAt: new Date().toISOString(),
                },
                Constants.CACHE_TTLS.TOKEN_BLACKLIST
            );

            logger.info('All user tokens blacklisted', { userId });
            return true;
        } catch (error: any) {
            logger.error('Failed to blacklist all user tokens', {
                error: error.message,
                userId,
            });
            return false;
        }
    }

    /**
     * Check if user has active blacklist (all tokens invalidated)
     */
    static async isUserBlacklisted(userId: string): Promise<boolean> {
        try {
            const key = `${Constants.CACHE_PREFIXES.BLACKLIST}user:${userId}`;
            const entry = await CacheUtil.get(key);
            return !!entry;
        } catch (error: any) {
            logger.error('Failed to check user blacklist', {
                error: error.message,
                userId,
            });
            return false;
        }
    }

    /**
     * Remove token from blacklist (for testing/admin purposes)
     */
    static async removeFromBlacklist(token: string, type: 'access' | 'refresh'): Promise<boolean> {
        try {
            const prefix = type === 'access'
                ? Constants.CACHE_PREFIXES.BLACKLIST_ACCESS
                : Constants.CACHE_PREFIXES.BLACKLIST_REFRESH;

            const tokenHash = hashTokenForBlacklist(token);
            const hashedKey = `${prefix}${tokenHash}`;
            const legacyKey = `${prefix}${token}`;

            await Promise.all([
                CacheUtil.del(hashedKey),
                CacheUtil.del(legacyKey),
            ]);

            logger.info('Token removed from blacklist', { type });
            return true;
        } catch (error: any) {
            logger.error('Failed to remove token from blacklist', {
                error: error.message,
            });
            return false;
        }
    }
}

export default TokenBlacklistUtil;