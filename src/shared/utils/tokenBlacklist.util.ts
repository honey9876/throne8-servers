/**
 * Token Blacklist Utility
 * Manages token invalidation and blacklisting for security
 * @module utils/tokenBlacklist.util
 */

import CacheUtil from '@/shared/cache.util';
import Constants from '@/shared/constants.util';
import { LoggerUtil } from '@/shared/logger.util';

const logger = LoggerUtil;

interface BlacklistEntry {
    tokenId: string;
    userId: string;
    reason: string;
    blacklistedAt: string;
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
            const key = `${Constants.CACHE_PREFIXES.BLACKLIST_ACCESS}${token}`;
            const entry: BlacklistEntry = {
                tokenId: token.substring(0, 20), // Store partial for privacy
                userId,
                reason,
                blacklistedAt: new Date().toISOString(),
            };

            await CacheUtil.set(
                key,
                entry,
                Constants.CACHE_TTLS.TOKEN_BLACKLIST
            );

            logger.info('Access token blacklisted', { userId, reason });
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
            const key = `${Constants.CACHE_PREFIXES.BLACKLIST_REFRESH}${token}`;
            const entry: BlacklistEntry = {
                tokenId: token.substring(0, 20),
                userId,
                reason,
                blacklistedAt: new Date().toISOString(),
            };

            await CacheUtil.set(
                key,
                entry,
                Constants.CACHE_TTLS.TOKEN_BLACKLIST
            );

            logger.info('Refresh token blacklisted', { userId, reason });
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
    static async isAccessTokenBlacklisted(token: string): Promise<boolean> {
        try {
            const key = `${Constants.CACHE_PREFIXES.BLACKLIST_ACCESS}${token}`;
            const entry = await CacheUtil.get(key);
            return !!entry;
        } catch (error: any) {
            logger.error('Failed to check access token blacklist', {
                error: error.message,
            });
            return false; // Fail open for availability
        }
    }

    /**
     * Check if refresh token is blacklisted
     */
    static async isRefreshTokenBlacklisted(token: string): Promise<boolean> {
        try {
            const key = `${Constants.CACHE_PREFIXES.BLACKLIST_REFRESH}${token}`;
            const entry = await CacheUtil.get(key);
            return !!entry;
        } catch (error: any) {
            logger.error('Failed to check refresh token blacklist', {
                error: error.message,
            });
            return false; // Fail open
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

            const key = `${prefix}${token}`;
            await CacheUtil.del(key);

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