/**
 * chatCache.ts
 * Dedicated Chat & Messaging Caching Module (Item F)
 *
 * Rules Enforced:
 * 1. Redis key naming: app:v1:chat:<type>:<id>
 * 2. Conversation list cache per user: app:v1:chat:convs:<userId>:v:<version> (TTL: 120s + jitter)
 * 3. Total unread counter per user: app:v1:chat:unread:<userId> (TTL: 120s + jitter)
 * 4. Eviction-safe monotonic per-user version key: app:v1:chat:v:<userId>
 * 5. Typing indicator: ephemeral keys with 5s TTL (app:v1:chat:typing:<conversationId>:<userId>) with zero DB writes
 * 6. Participant authorization strictly enforced on every read including cache hits
 * 7. Removed conversation members immediately stop seeing the conversation
 * 8. Domain kill switch: CACHE_CHAT_ENABLED
 * 9. Fallback to MongoDB on Redis downtime or timeout
 */

import { CacheHelper, buildKey, applyJitter, isCacheEnabled } from './cacheHelper';
import { getRedisClient } from './redisConnection';
import { LoggerUtil } from '@/shared/logger.util';

const DOMAIN = 'chat';

// TTL configs (seconds)
const CONVERSATION_CACHE_TTL_SECONDS = parseInt(
  process.env['CHAT_CONVERSATION_CACHE_TTL_SECONDS'] || '120',
  10
);
const UNREAD_CACHE_TTL_SECONDS = parseInt(
  process.env['CHAT_UNREAD_CACHE_TTL_SECONDS'] || '120',
  10
);
const TYPING_TTL_SECONDS = 5; // Exactly 5s ephemeral TTL per spec
const VERSION_KEY_TTL_SECONDS = 7 * 24 * 3600; // 7 days

export class ChatCacheRepository {
  /**
   * Get monotonic version for user's conversation list.
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
      LoggerUtil.warn('ChatCache: failed to get user version, falling back to 1', {
        userId,
        error: err.message,
      });
      return '1';
    }
  }

  /**
   * Invalidate all chat cache for user(s) (unread count + version bump for conversation list).
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
        // Invalidate unread count
        pipeline.del(buildKey(DOMAIN, `unread:${id}`));
        // Monotonic version bump for conversation list
        pipeline.incr(buildKey(DOMAIN, `v:${id}`));
        pipeline.expire(buildKey(DOMAIN, `v:${id}`), VERSION_KEY_TTL_SECONDS);
      }
      await pipeline.exec();
    } catch (err: any) {
      LoggerUtil.warn('ChatCache: failed to invalidate user chat cache', {
        error: err.message,
      });
    }
  }

  /**
   * Get cached conversation list for user.
   * Participant authorization is strictly enforced: any conversation where the user is NOT a member is filtered out.
   */
  static async getConversations(userId: string): Promise<any[] | null> {
    if (!isCacheEnabled(DOMAIN)) return null;
    const version = await this.getUserVersion(userId);
    const key = buildKey(DOMAIN, `convs:${userId}:v:${version}`);
    const cached = await CacheHelper.get<any[]>(key, DOMAIN);
    if (!cached || !Array.isArray(cached)) return null;

    // Strict Gate 3 participant authorization check: user must be in members array of EVERY returned conversation
    const authorized = cached.filter((conv) => {
      if (!conv || !Array.isArray(conv.members)) return false;
      return conv.members.includes(userId);
    });

    return authorized;
  }

  /**
   * Set cached conversation list for user.
   */
  static async setConversations(userId: string, conversations: any[]): Promise<void> {
    if (!isCacheEnabled(DOMAIN)) return;
    const version = await this.getUserVersion(userId);
    const key = buildKey(DOMAIN, `convs:${userId}:v:${version}`);
    await CacheHelper.set(key, conversations, {
      ttlSeconds: applyJitter(CONVERSATION_CACHE_TTL_SECONDS),
      domain: DOMAIN,
    });
  }

  /**
   * Get cached unread message count for user.
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
   * Set cached unread message count for user.
   */
  static async setUnreadCount(userId: string, count: number): Promise<void> {
    if (!isCacheEnabled(DOMAIN)) return;
    const key = buildKey(DOMAIN, `unread:${userId}`);
    const safeCount = Math.max(0, Math.floor(count));
    await CacheHelper.set(key, safeCount, {
      ttlSeconds: applyJitter(UNREAD_CACHE_TTL_SECONDS),
      domain: DOMAIN,
    });
  }

  /**
   * Set ephemeral typing indicator (5s TTL, zero DB writes).
   */
  static async setTyping(
    conversationId: string,
    userId: string,
    isTyping: boolean
  ): Promise<void> {
    if (!isCacheEnabled(DOMAIN)) return;
    try {
      const redis = await getRedisClient();
      const key = buildKey(DOMAIN, `typing:${conversationId}:${userId}`);
      if (isTyping) {
        await redis.set(key, '1', 'EX', TYPING_TTL_SECONDS);
      } else {
        await redis.del(key);
      }
    } catch (err: any) {
      LoggerUtil.warn('ChatCache: typing indicator set failed', {
        conversationId,
        userId,
        error: err.message,
      });
    }
  }

  /**
   * Check if user is typing (ephemeral 5s key).
   */
  static async isTyping(conversationId: string, userId: string): Promise<boolean> {
    if (!isCacheEnabled(DOMAIN)) return false;
    try {
      const redis = await getRedisClient();
      const key = buildKey(DOMAIN, `typing:${conversationId}:${userId}`);
      const val = await redis.get(key);
      return val === '1';
    } catch {
      return false;
    }
  }
}
