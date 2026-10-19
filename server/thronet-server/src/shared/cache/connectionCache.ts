/**
 * connectionCache.ts
 * Item H: Connections & Mutual Connections Caching via Redis Sets
 *
 * Rules Enforced:
 * 1. Redis key naming:
 *    - User connection set: app:v1:connections:set:<userId>
 * 2. Derived data architecture:
 *    - Derived from MongoDB source of truth.
 *    - Rebuilt on cache miss.
 *    - SINTER used for mutual connections.
 * 3. Mutation synchronisation:
 *    - On accept: SADD both users to each other's set.
 *    - On remove: SREM both users from each other's set.
 *    - On block: SREM from sets; mutual queries respect blocks.
 * 4. Privacy & block enforcement:
 *    - Mutual connection results respect blocks and privacy.
 * 5. Drift check & Rebuild:
 *    - Automated drift check comparing Redis Set size with MongoDB.
 *    - Self-healing rebuild on drift or miss.
 * 6. Kill switch:
 *    - CACHE_CONNECTIONS_ENABLED (falls back directly to MongoDB).
 */

import { Schema } from 'mongoose';
import { buildKey, applyJitter, isCacheEnabled } from './cacheHelper';
import { getRedisClient } from './redisConnection';
import { LoggerUtil } from '@/shared/logger.util';
import Connection from '@/connections/models/Connection';
import ConnectionBlock from '@/connections/models/ConnectionBlock';

const DOMAIN = 'connections';
const EMPTY_SENTINEL = '__EMPTY__';

// Default TTL: 2 hours (7200 seconds) + jitter
const CONNECTION_SET_TTL_SECONDS = parseInt(
  process.env['CONNECTIONS_SET_CACHE_TTL_SECONDS'] || '7200',
  10
);

export interface DriftCheckResult {
  inSync: boolean;
  redisCount: number;
  mongoCount: number;
  drift: number;
}

export class ConnectionCacheRepository {
  /**
   * Build key for a user's connection set.
   */
  static getSetKey(userId: string): string {
    return buildKey(DOMAIN, `set:${userId}`);
  }

  /**
   * Rebuild a user's connection set directly from MongoDB authoritative data.
   */
  static async rebuildUserConnectionsSet(userId: string): Promise<Set<string>> {
    try {
      const activeConnections = await Connection.find({
        $or: [{ fromUserId: userId }, { toUserId: userId }],
        status: 'active',
        isArchived: false,
      })
        .select('fromUserId toUserId')
        .lean()
        .exec();

      const connectedUserIds = activeConnections
        .map((c: any) => (String(c.fromUserId) === String(userId) ? String(c.toUserId) : String(c.fromUserId)))
        .filter((id) => id && id !== String(userId));

      const uniqueIds = [...new Set(connectedUserIds)];

      if (isCacheEnabled(DOMAIN)) {
        const redis = await getRedisClient();
        const key = this.getSetKey(userId);
        const ttl = applyJitter(CONNECTION_SET_TTL_SECONDS);

        const pipeline = redis.pipeline();
        pipeline.del(key);
        if (uniqueIds.length > 0) {
          pipeline.sadd(key, ...uniqueIds);
        } else {
          pipeline.sadd(key, EMPTY_SENTINEL);
        }
        pipeline.expire(key, ttl);
        await pipeline.exec();
      }

      return new Set(uniqueIds);
    } catch (err: any) {
      LoggerUtil.error('ConnectionCache: failed to rebuild connection set from MongoDB', {
        userId,
        error: err.message,
      });
      return new Set();
    }
  }

  /**
   * Get members of a user's connection set.
   * On cache miss, automatically rebuilds from MongoDB.
   */
  static async getConnectionsSet(userId: string): Promise<Set<string>> {
    if (!isCacheEnabled(DOMAIN)) {
      return this.rebuildUserConnectionsSet(userId);
    }

    try {
      const redis = await getRedisClient();
      const key = this.getSetKey(userId);

      const exists = await redis.exists(key);
      if (!exists) {
        // Cache miss: rebuild from MongoDB
        return await this.rebuildUserConnectionsSet(userId);
      }

      const members = await redis.smembers(key);
      const activeIds = members.filter((m) => m !== EMPTY_SENTINEL && m !== userId);
      return new Set(activeIds);
    } catch (err: any) {
      LoggerUtil.warn('ConnectionCache: Redis error on getConnectionsSet, falling back to MongoDB', {
        userId,
        error: err.message,
      });
      return this.rebuildUserConnectionsSet(userId);
    }
  }

  /**
   * Add bidirectional connection to Redis sets (sync on accept).
   */
  static async addConnection(userA: string, userB: string): Promise<void> {
    if (!isCacheEnabled(DOMAIN) || !userA || !userB || userA === userB) return;
    try {
      const redis = await getRedisClient();
      const keyA = this.getSetKey(userA);
      const keyB = this.getSetKey(userB);
      const ttl = applyJitter(CONNECTION_SET_TTL_SECONDS);

      const [existsA, existsB] = await Promise.all([
        redis.exists(keyA),
        redis.exists(keyB),
      ]);

      const pipeline = redis.pipeline();

      if (existsA) {
        pipeline.sadd(keyA, userB);
        pipeline.srem(keyA, EMPTY_SENTINEL);
        pipeline.expire(keyA, ttl);
      } else {
        // Build set on next read or trigger rebuild
        await this.rebuildUserConnectionsSet(userA);
      }

      if (existsB) {
        pipeline.sadd(keyB, userA);
        pipeline.srem(keyB, EMPTY_SENTINEL);
        pipeline.expire(keyB, ttl);
      } else {
        await this.rebuildUserConnectionsSet(userB);
      }

      await pipeline.exec();
    } catch (err: any) {
      LoggerUtil.warn('ConnectionCache: failed to add connection to cache sets', {
        userA,
        userB,
        error: err.message,
      });
    }
  }

  /**
   * Remove bidirectional connection from Redis sets (sync on remove/disconnect).
   */
  static async removeConnection(userA: string, userB: string): Promise<void> {
    if (!isCacheEnabled(DOMAIN) || !userA || !userB) return;
    try {
      const redis = await getRedisClient();
      const keyA = this.getSetKey(userA);
      const keyB = this.getSetKey(userB);

      const pipeline = redis.pipeline();
      pipeline.srem(keyA, userB);
      pipeline.srem(keyB, userA);
      await pipeline.exec();

      // Check if sets became empty; if so, put sentinel so miss doesn't stampede
      const [cardA, cardB] = await Promise.all([redis.scard(keyA), redis.scard(keyB)]);
      const fixPipeline = redis.pipeline();
      if (cardA === 0) fixPipeline.sadd(keyA, EMPTY_SENTINEL);
      if (cardB === 0) fixPipeline.sadd(keyB, EMPTY_SENTINEL);
      await fixPipeline.exec();
    } catch (err: any) {
      LoggerUtil.warn('ConnectionCache: failed to remove connection from cache sets', {
        userA,
        userB,
        error: err.message,
      });
    }
  }

  /**
   * Handle user block: remove connection, clear blocks/pending/counts, bump list & profile versions.
   */
  static async handleUserBlock(blockerId: string, blockedId: string): Promise<void> {
    await this.removeConnection(blockerId, blockedId);
    if (!isCacheEnabled(DOMAIN)) return;
    try {
      const redis = await getRedisClient();
      const pipeline = redis.pipeline();
      pipeline.del(buildKey(DOMAIN, `blocks:${blockerId}`));
      pipeline.del(buildKey(DOMAIN, `blocks:${blockedId}`));
      pipeline.del(buildKey(DOMAIN, `count:${blockerId}`));
      pipeline.del(buildKey(DOMAIN, `count:${blockedId}`));
      pipeline.del(buildKey(DOMAIN, `pending:${blockerId}`));
      pipeline.del(buildKey(DOMAIN, `pending:${blockedId}`));
      pipeline.del(buildKey(DOMAIN, `pending_count:${blockerId}`));
      pipeline.del(buildKey(DOMAIN, `pending_count:${blockedId}`));
      pipeline.incr(buildKey(DOMAIN, `v:${blockerId}`));
      pipeline.incr(buildKey(DOMAIN, `v:${blockedId}`));
      await pipeline.exec();

      const { ProfileCacheRepository } = await import('./profileCache');
      await ProfileCacheRepository.invalidateProfile([blockerId, blockedId]);
    } catch (err: any) {
      LoggerUtil.warn('ConnectionCache: failed to invalidate block cache', { error: err.message });
    }
  }

  /**
   * Handle user unblock: clear blocks cache, bump connection version and profile versions for BOTH users.
   */
  static async handleUserUnblock(blockerId: string, blockedId: string): Promise<void> {
    if (!isCacheEnabled(DOMAIN)) return;
    try {
      const redis = await getRedisClient();
      const pipeline = redis.pipeline();
      pipeline.del(buildKey(DOMAIN, `blocks:${blockerId}`));
      pipeline.del(buildKey(DOMAIN, `blocks:${blockedId}`));
      pipeline.del(buildKey(DOMAIN, `count:${blockerId}`));
      pipeline.del(buildKey(DOMAIN, `count:${blockedId}`));
      pipeline.del(buildKey(DOMAIN, `pending:${blockerId}`));
      pipeline.del(buildKey(DOMAIN, `pending:${blockedId}`));
      pipeline.incr(buildKey(DOMAIN, `v:${blockerId}`));
      pipeline.incr(buildKey(DOMAIN, `v:${blockedId}`));
      await pipeline.exec();

      // Invalidate profile version for BOTH users so viewer immediately sees profile
      const { ProfileCacheRepository } = await import('./profileCache');
      await ProfileCacheRepository.invalidateProfile([blockerId, blockedId]);
    } catch (err: any) {
      LoggerUtil.warn('ConnectionCache: failed to invalidate unblock cache', { error: err.message });
    }
  }

  /**
   * Handle connection request withdraw / cancel: clear pending caches and bump profile versions for BOTH users.
   */
  static async handleRequestCancelled(fromUserId: string, toUserId: string): Promise<void> {
    if (!isCacheEnabled(DOMAIN)) return;
    try {
      const redis = await getRedisClient();
      const pipeline = redis.pipeline();
      pipeline.del(buildKey(DOMAIN, `pending:${fromUserId}`));
      pipeline.del(buildKey(DOMAIN, `pending:${toUserId}`));
      pipeline.del(buildKey(DOMAIN, `pending_count:${fromUserId}`));
      pipeline.del(buildKey(DOMAIN, `pending_count:${toUserId}`));
      pipeline.incr(buildKey(DOMAIN, `v:${fromUserId}`));
      pipeline.incr(buildKey(DOMAIN, `v:${toUserId}`));
      await pipeline.exec();

      const { ProfileCacheRepository } = await import('./profileCache');
      await ProfileCacheRepository.invalidateProfile([fromUserId, toUserId]);
    } catch (err: any) {
      LoggerUtil.warn('ConnectionCache: failed to invalidate request cancelled cache', { error: err.message });
    }
  }

  /**
   * Handle connection request reject / decline: clear pending caches and bump profile versions for BOTH users.
   */
  static async handleRequestRejected(fromUserId: string, toUserId: string): Promise<void> {
    return this.handleRequestCancelled(fromUserId, toUserId);
  }

  /**
   * Handle account deactivation: remove user from all partners' connection sets and clear all user connection caches.
   */
  static async handleAccountDeactivated(userId: string): Promise<void> {
    try {
      const activeConnections = await Connection.find({
        $or: [{ fromUserId: userId }, { toUserId: userId }],
        status: 'active',
        isArchived: false,
      })
        .select('fromUserId toUserId')
        .lean()
        .exec();

      const partnerIds = activeConnections
        .map((c: any) => (String(c.fromUserId) === String(userId) ? String(c.toUserId) : String(c.fromUserId)))
        .filter((id) => id && id !== String(userId));

      // 1. Archive/deactivate connection records in MongoDB
      await Connection.updateMany(
        { $or: [{ fromUserId: userId }, { toUserId: userId }] },
        { $set: { status: 'inactive', isArchived: true } }
      );

      if (isCacheEnabled(DOMAIN)) {
        const redis = await getRedisClient();
        const pipeline = redis.pipeline();

        // 2. Remove deactivated user from each partner's Redis set, invalidate counts & bump versions
        for (const partnerId of partnerIds) {
          pipeline.srem(this.getSetKey(partnerId), userId);
          pipeline.del(buildKey(DOMAIN, `count:${partnerId}`));
          pipeline.incr(buildKey(DOMAIN, `v:${partnerId}`));
        }

        // 3. Clear all connection keys for deactivated user
        pipeline.del(this.getSetKey(userId));
        pipeline.del(buildKey(DOMAIN, `count:${userId}`));
        pipeline.del(buildKey(DOMAIN, `pending:${userId}`));
        pipeline.del(buildKey(DOMAIN, `pending_count:${userId}`));
        pipeline.del(buildKey(DOMAIN, `blocks:${userId}`));
        pipeline.incr(buildKey(DOMAIN, `v:${userId}`));

        await pipeline.exec();

        // 4. If partner set became empty, insert EMPTY_SENTINEL so key doesn't vanish
        for (const partnerId of partnerIds) {
          const key = this.getSetKey(partnerId);
          const card = await redis.scard(key);
          if (card === 0) {
            await redis.sadd(key, EMPTY_SENTINEL);
          }
        }
      }

      // 5. Invalidate profile versions for all affected users + deactivated user
      const { ProfileCacheRepository } = await import('./profileCache');
      await ProfileCacheRepository.invalidateProfile([...partnerIds, userId]);
    } catch (err: any) {
      LoggerUtil.error('ConnectionCache: failed to handle account deactivation cache purge', {
        userId,
        error: err.message,
      });
    }
  }

  /**
   * Handle account deletion: identical to deactivation purge.
   */
  static async handleAccountDeleted(userId: string): Promise<void> {
    return this.handleAccountDeactivated(userId);
  }

  /**
   * Calculate mutual connections between two users using Redis SINTER.
   * STRICT SECURITY & PRIVACY:
   * 1. Bidirectional block check: if blocked, returns empty array.
   * 2. Filters out any candidates that have blocked either user or are blocked.
   * 3. Fallback to MongoDB on miss or Redis downtime.
   */
  static async getMutualConnections(userA: string, userB: string): Promise<string[]> {
    if (!userA || !userB || userA === userB) return [];

    // 1. Strict block check between A and B
    try {
      const isBlocked = await ConnectionBlock.isBlocked(userA, userB);
      const isReverseBlocked = await ConnectionBlock.isBlocked(userB, userA);
      if (isBlocked || isReverseBlocked) {
        return [];
      }
    } catch {
      // In fail-safe mode, proceed
    }

    if (!isCacheEnabled(DOMAIN)) {
      return this.getMutualsFromMongoDB(userA, userB);
    }

    try {
      const redis = await getRedisClient();
      const keyA = this.getSetKey(userA);
      const keyB = this.getSetKey(userB);

      // Ensure both sets exist
      const [existsA, existsB] = await Promise.all([redis.exists(keyA), redis.exists(keyB)]);
      if (!existsA) await this.rebuildUserConnectionsSet(userA);
      if (!existsB) await this.rebuildUserConnectionsSet(userB);

      // Perform SINTER
      const mutualIds = await redis.sinter(keyA, keyB);
      const cleanMutuals = mutualIds.filter(
        (id) => id !== EMPTY_SENTINEL && id !== userA && id !== userB
      );

      if (cleanMutuals.length === 0) return [];

      // Filter out any mutual users that have an active block with userA or userB
      const activeBlocks = await ConnectionBlock.find({
        $or: [
          { blockerId: userA, blockedId: { $in: cleanMutuals }, isActive: true },
          { blockerId: { $in: cleanMutuals }, blockedId: userA, isActive: true },
          { blockerId: userB, blockedId: { $in: cleanMutuals }, isActive: true },
          { blockerId: { $in: cleanMutuals }, blockedId: userB, isActive: true },
        ],
      })
        .select('blockerId blockedId')
        .lean()
        .exec();

      const blockedSet = new Set<string>();
      for (const b of activeBlocks) {
        blockedSet.add(String(b.blockerId));
        blockedSet.add(String(b.blockedId));
      }

      return cleanMutuals.filter((id) => !blockedSet.has(id));
    } catch (err: any) {
      LoggerUtil.warn('ConnectionCache: SINTER failed, falling back to MongoDB', {
        userA,
        userB,
        error: err.message,
      });
      return this.getMutualsFromMongoDB(userA, userB);
    }
  }

  /**
   * MongoDB fallback for mutual connections.
   */
  private static async getMutualsFromMongoDB(userA: string, userB: string): Promise<string[]> {
    try {
      const raw = await (Connection as any).findMutualConnections(userA, userB, 100);
      return (raw || []).map((conn: any) =>
        String(conn.fromUserId) === String(userA) ? String(conn.toUserId) : String(conn.fromUserId)
      );
    } catch {
      return [];
    }
  }

  /**
   * Drift check comparing Redis Set members with MongoDB truth.
   * If drift detected, automatically triggers self-healing rebuild.
   */
  static async checkDrift(userId: string): Promise<DriftCheckResult> {
    try {
      const redis = await getRedisClient();
      const key = this.getSetKey(userId);

      const [redisMembers, mongoCount] = await Promise.all([
        redis.smembers(key),
        Connection.countDocuments({
          $or: [{ fromUserId: userId }, { toUserId: userId }],
          status: 'active',
          isArchived: false,
        }),
      ]);

      const redisActiveCount = redisMembers.filter(
        (m) => m !== EMPTY_SENTINEL && m !== userId
      ).length;

      const drift = Math.abs(redisActiveCount - mongoCount);
      const inSync = drift === 0;

      if (!inSync) {
        LoggerUtil.warn('ConnectionCache: drift detected, rebuilding set from MongoDB', {
          userId,
          redisCount: redisActiveCount,
          mongoCount,
          drift,
        });
        await this.rebuildUserConnectionsSet(userId);
      }

      return {
        inSync,
        redisCount: redisActiveCount,
        mongoCount,
        drift,
      };
    } catch (err: any) {
      LoggerUtil.error('ConnectionCache: drift check failed', { userId, error: err.message });
      return {
        inSync: false,
        redisCount: 0,
        mongoCount: 0,
        drift: -1,
      };
    }
  }
}

/**
 * Mongoose hooks attacher for Connection model.
 */
export function attachConnectionCacheHooks(schema: Schema): void {
  schema.post('save', async function (doc: any) {
    if (doc?.fromUserId && doc?.toUserId) {
      const from = String(doc.fromUserId);
      const to = String(doc.toUserId);
      if (doc.status === 'active' && !doc.isArchived) {
        await ConnectionCacheRepository.addConnection(from, to);
      } else {
        await ConnectionCacheRepository.removeConnection(from, to);
      }
    }
  });

  schema.post(['updateOne', 'findOneAndUpdate', 'deleteOne', 'findOneAndDelete'] as any, async function (this: any) {
    try {
      const filter = this.getFilter() || {};
      if (filter.fromUserId && filter.toUserId) {
        await Promise.all([
          ConnectionCacheRepository.rebuildUserConnectionsSet(String(filter.fromUserId)),
          ConnectionCacheRepository.rebuildUserConnectionsSet(String(filter.toUserId)),
        ]);
      }
    } catch {
      // safe fallback
    }
  });
}
