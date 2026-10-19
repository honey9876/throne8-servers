/**
 * notificationCache.ts
 * Dedicated Notification Caching Module (Item E)
 *
 * Rules Enforced:
 * 1. Redis key naming: app:v1:notification:<type>:<id>
 * 2. Unread count cache: app:v1:notification:unread:<userId> (TTL: 120s + jitter)
 * 3. List cache: app:v1:notification:list:<userId>:v:<version>:<page>:<limit> (TTL: 60s + jitter)
 * 4. Eviction-safe monotonic per-user version key: app:v1:notification:v:<userId>
 * 5. Recompute on miss directly from MongoDB
 * 6. Count never goes below 0 (Math.max(0, count))
 * 7. Domain kill switch: CACHE_NOTIFICATION_ENABLED
 * 8. Automatic fail-open to MongoDB on Redis downtime or timeout
 */

import { CacheHelper, buildKey, applyJitter, isCacheEnabled } from './cacheHelper';
import { getRedisClient } from './redisConnection';
import { LoggerUtil } from '@/shared/logger.util';

const DOMAIN = 'notification';

// TTL configs (seconds)
const UNREAD_COUNT_TTL_SECONDS = Math.min(
  120,
  parseInt(process.env['NOTIFICATION_UNREAD_CACHE_TTL_SECONDS'] || '120', 10)
);
const LIST_CACHE_TTL_SECONDS = parseInt(
  process.env['NOTIFICATION_LIST_CACHE_TTL_SECONDS'] || '60',
  10
);
const VERSION_KEY_TTL_SECONDS = 7 * 24 * 3600; // 7 days

export interface CachedNotificationListResult {
  notifications: any[];
  unreadCount: number;
  total: number;
}

export class NotificationCacheRepository {
  /**
   * Get monotonic version for user's notification feed.
   * If missing, sets to current timestamp.
   */
  static async getUserVersion(userId: string): Promise<string> {
    if (!isCacheEnabled(DOMAIN)) return '1';
    try {
      const redis = await getRedisClient();
      const versionKey = buildKey(DOMAIN, `v:${userId}`);
      let version = await redis.get(versionKey);
      if (!version) {
        version = String(Date.now());
        await redis.set(versionKey, version, 'EX', VERSION_KEY_TTL_SECONDS);
      }
      return version;
    } catch (err: any) {
      LoggerUtil.warn('NotificationCache: failed to get user version, falling back to 1', {
        userId,
        error: err.message,
      });
      return '1';
    }
  }

  /**
   * Invalidate all notification cache for a user (unread count + version bump for list).
   */
  static async invalidateUser(userId: string | string[]): Promise<void> {
    if (!isCacheEnabled(DOMAIN)) return;
    try {
      const redis = await getRedisClient();
      const userIds = Array.isArray(userId) ? userId : [userId];
      const validIds = userIds.filter(Boolean);
      if (validIds.length === 0) return;

      const pipeline = redis.pipeline();
      for (const id of validIds) {
        // Delete unread count
        pipeline.del(buildKey(DOMAIN, `unread:${id}`));
        // Monotonic version bump for list keys (O(1), zero SCAN, renders previous cached pages dead)
        pipeline.incr(buildKey(DOMAIN, `v:${id}`));
        pipeline.expire(buildKey(DOMAIN, `v:${id}`), VERSION_KEY_TTL_SECONDS);
      }
      await pipeline.exec();
    } catch (err: any) {
      LoggerUtil.warn('NotificationCache: failed to invalidate notification cache', {
        error: err.message,
      });
    }
  }

  /**
   * Get cached unread count for user. Returns null on miss or when cache disabled.
   */
  static async getUnreadCount(userId: string): Promise<number | null> {
    if (!isCacheEnabled(DOMAIN)) return null;
    const key = buildKey(DOMAIN, `unread:${userId}`);
    const raw = await CacheHelper.get<number>(key, DOMAIN);
    if (raw !== null && raw !== undefined) {
      const count = Number(raw);
      return isNaN(count) ? null : Math.max(0, Math.floor(count));
    }
    return null;
  }

  /**
   * Set cached unread count for user.
   */
  static async setUnreadCount(userId: string, count: number): Promise<void> {
    if (!isCacheEnabled(DOMAIN)) return;
    const key = buildKey(DOMAIN, `unread:${userId}`);
    const safeCount = Math.max(0, Math.floor(count));
    await CacheHelper.set(key, safeCount, {
      ttlSeconds: applyJitter(UNREAD_COUNT_TTL_SECONDS),
      domain: DOMAIN,
    });
  }

  /**
   * Get cached paginated notification list.
   */
  static async getNotificationList(
    userId: string,
    page: number,
    limit: number
  ): Promise<CachedNotificationListResult | null> {
    if (!isCacheEnabled(DOMAIN)) return null;
    const version = await this.getUserVersion(userId);
    const key = buildKey(DOMAIN, `list:${userId}:v:${version}:${page}:${limit}`);
    return CacheHelper.get<CachedNotificationListResult>(key, DOMAIN);
  }

  /**
   * Set cached paginated notification list.
   */
  static async setNotificationList(
    userId: string,
    page: number,
    limit: number,
    data: CachedNotificationListResult
  ): Promise<void> {
    if (!isCacheEnabled(DOMAIN)) return;
    const version = await this.getUserVersion(userId);
    const key = buildKey(DOMAIN, `list:${userId}:v:${version}:${page}:${limit}`);
    await CacheHelper.set(key, data, {
      ttlSeconds: applyJitter(LIST_CACHE_TTL_SECONDS),
      domain: DOMAIN,
    });
  }
}
