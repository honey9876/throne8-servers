/**
 * socketCache.ts
 * Item L: Socket.IO Redis Adapter, Presence, and Live-Room State Management
 * 
 * Provides:
 * 1. Redis pub/sub adapter setup using dedicated clients from the unified cache factory.
 * 2. Kill switch (SOCKET_REDIS_ADAPTER_ENABLED, CACHE_SOCKET_ENABLED) falling back to in-memory adapter.
 * 3. Multi-device / multi-tab safe Presence with Redis Sorted Set (member=socketId, score=lastHeartbeat).
 *    Prunes stale members on every read and write so crashed instances don't leave dead sockets.
 * 4. Cluster-wide debounced MongoDB lastActive writes (max 1 write per 60s per user).
 * 5. Live room participant sets and study session timer state with atomic Lua capacity checks.
 *    Uses Redis Sorted Set (member=socketId, score=lastHeartbeat) and prunes stale members BEFORE counting.
 * 6. Redis-backed group active sessions and group rooms with heartbeat pruning replacing local Maps.
 * 7. Full in-memory fallback if Redis is disabled or unavailable.
 */

import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createDedicatedClient, getRedisClient } from './redisConnection';
import { buildKey, isCacheEnabled, safeJsonParse, safeJsonStringify } from './cacheHelper';
import { LoggerUtil } from '@/shared/logger.util';

export const SOCKET_DOMAIN = 'socket';
const PRESENCE_DOMAIN = 'presence';
const LIVEROOM_DOMAIN = 'liveroom';

// Default TTLs (in seconds and milliseconds)
const PRESENCE_SOCKET_TTL_SECONDS = 120; // 2 minutes heartbeat
const LIVEROOM_SESSION_TTL_SECONDS = 86400; // 24 hours
const LAST_ACTIVE_DEBOUNCE_SECONDS = 60; // 1 minute debounce for MongoDB writes

// ==================== IN-MEMORY FALLBACK STORES ====================
// userId -> Map<socketId, lastHeartbeatTs>
const memPresenceUserSockets = new Map<string, Map<string, number>>();
const memPresenceSocketUser = new Map<string, string>(); // socketId -> userId
const memLastActiveWriteTs = new Map<string, number>(); // userId -> timestamp

// Live room in-memory fallback: roomId -> Map<socketId, lastHeartbeatTs>
const memLiveRoomSockets = new Map<string, Map<string, number>>();
const memLiveRoomParticipants = new Map<string, Map<string, any>>(); // roomId -> Map<socketId, participantData>
const memLiveRoomSessions = new Map<string, { active: boolean; startedAt: number | null; accumulatedTime: number }>();

// Group rooms and active sessions in-memory fallback: groupId -> Map<userId, lastHeartbeatTs>
const memGroupMembers = new Map<string, Map<string, number>>();
const memSocketGroups = new Map<string, Set<string>>(); // socketId -> Set<groupId>
const memGroupActiveSessions = new Map<string, Map<string, { lastSeen: number; elapsedTime: number }>>();

export interface RoomSessionState {
  active: boolean;
  startedAt: number | null;
  accumulatedTime: number;
}

export interface ParticipantInfo {
  userId: string;
  userName: string;
  socketId: string;
  camOn?: boolean;
  micOn?: boolean;
  joinedAt?: number;
}

/**
 * ============================================================================
 * 1. REDIS ADAPTER FACTORY
 * ============================================================================
 */
export async function setupSocketAdapter(io: Server): Promise<boolean> {
  const isAdapterEnabled =
    process.env['SOCKET_REDIS_ADAPTER_ENABLED'] !== 'false' &&
    isCacheEnabled(SOCKET_DOMAIN);

  if (!isAdapterEnabled) {
    LoggerUtil.info('Socket.IO Redis adapter is disabled via kill switch. Using in-memory adapter.');
    return false;
  }

  try {
    // Create dedicated Pub/Sub clients on the CACHE instance
    const pubClient = createDedicatedClient({
      name: 'socket-pub',
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });

    const subClient = createDedicatedClient({
      name: 'socket-sub',
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });

    // Attach adapter to Socket.IO
    const adapter = createAdapter(pubClient, subClient);
    io.adapter(adapter);

    LoggerUtil.info('Socket.IO Redis adapter attached successfully using CACHE instance pub/sub clients');
    return true;
  } catch (err: any) {
    LoggerUtil.warn('Failed to initialize Socket.IO Redis adapter, falling back to in-memory adapter', {
      error: err?.message || 'Unknown error',
    });
    return false;
  }
}

/**
 * ============================================================================
 * 2. PRESENCE REPOSITORY (Multi-tab, multi-device, Sorted Set with TTL pruning)
 * ============================================================================
 * 
 * Data structures:
 * - `presence:user:<userId>:sockets`: Redis Sorted Set (member=socketId, score=lastHeartbeatTimestampMs).
 *   On EVERY read and write, ZREMRANGEBYSCORE prunes stale members older than (now - TTL).
 *   A user is online ONLY if at least one unexpired socket exists.
 * - `presence:socket:<socketId>`: Redis String storing { userId, connectedAt } with EX = TTL.
 */
export class SocketPresenceRepository {
  private static getUserSocketsKey(userId: string): string {
    return buildKey(PRESENCE_DOMAIN, `user:${userId}:sockets`);
  }

  private static getSocketInfoKey(socketId: string): string {
    return buildKey(PRESENCE_DOMAIN, `socket:${socketId}`);
  }

  private static getLastActiveLockKey(userId: string): string {
    return buildKey(PRESENCE_DOMAIN, `user:${userId}:last_active_lock`);
  }

  static getActiveUsersKey(): string {
    return buildKey(PRESENCE_DOMAIN, 'active_users');
  }

  static getHeartbeatTTLMs(): number {
    if (process.env['PRESENCE_SOCKET_TTL_MS']) {
      const val = Number(process.env['PRESENCE_SOCKET_TTL_MS']);
      if (val > 0) return val;
    }
    return PRESENCE_SOCKET_TTL_SECONDS * 1000;
  }

  /**
   * Register a new socket connection for a user.
   * Multi-tab/multi-device safe: adds socketId to Redis Sorted Set with current timestamp.
   * Prunes stale members from any crashed instances.
   */
  static async registerSocket(
    userId: string,
    socketId: string
  ): Promise<{ isFirstSocket: boolean; totalSockets: number }> {
    if (!userId || !socketId) return { isFirstSocket: false, totalSockets: 0 };

    const now = Date.now();
    const ttlMs = this.getHeartbeatTTLMs();
    const ttlSec = Math.ceil(ttlMs / 1000);

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      // In-memory fallback with stale score pruning
      if (!memPresenceUserSockets.has(userId)) {
        memPresenceUserSockets.set(userId, new Map());
      }
      const sockets = memPresenceUserSockets.get(userId)!;
      // Prune stale
      const cutoff = now - ttlMs;
      for (const [sId, score] of sockets.entries()) {
        if (score <= cutoff) sockets.delete(sId);
      }
      const isFirst = sockets.size === 0;
      sockets.set(socketId, now);
      memPresenceSocketUser.set(socketId, userId);
      return { isFirstSocket: isFirst, totalSockets: sockets.size };
    }

    try {
      const redis = getRedisClient();
      const userKey = this.getUserSocketsKey(userId);
      const socketKey = this.getSocketInfoKey(socketId);
      const cutoff = now - ttlMs;

      const pipeline = redis.pipeline();
      // 1. Prune stale sockets from crashed servers
      pipeline.zremrangebyscore(userKey, '-inf', cutoff);
      // 2. Count active sockets before this registration to detect first socket
      pipeline.zcard(userKey);
      // 3. Add or refresh socket with current timestamp
      pipeline.zadd(userKey, now, socketId);
      // 4. Set safety expiration on the sorted set (2x TTL)
      pipeline.expire(userKey, ttlSec * 2);
      // 5. Store per-socket metadata key with TTL
      pipeline.set(socketKey, safeJsonStringify({ userId, connectedAt: now }), 'EX', ttlSec);

      const results = await pipeline.exec();
      const countBefore = (results?.[1]?.[1] as number) || 0;
      const isFirst = countBefore === 0;

      if (isFirst) {
        redis.sadd(this.getActiveUsersKey(), userId).catch(() => {});
      }

      return {
        isFirstSocket: isFirst,
        totalSockets: countBefore + 1,
      };
    } catch (err: any) {
      LoggerUtil.warn('SocketPresenceRepository.registerSocket fallback to memory', { error: err.message });
      if (!memPresenceUserSockets.has(userId)) {
        memPresenceUserSockets.set(userId, new Map());
      }
      const sockets = memPresenceUserSockets.get(userId)!;
      const cutoff = now - ttlMs;
      for (const [sId, score] of sockets.entries()) {
        if (score <= cutoff) sockets.delete(sId);
      }
      const isFirst = sockets.size === 0;
      sockets.set(socketId, now);
      memPresenceSocketUser.set(socketId, userId);
      return { isFirstSocket: isFirst, totalSockets: sockets.size };
    }
  }

  /**
   * Refresh heartbeat on socket connection in Redis Sorted Set.
   * Updates score to current timestamp and prunes any stale members.
   */
  static async heartbeat(userId: string, socketId: string): Promise<void> {
    if (!userId || !socketId) return;

    const now = Date.now();
    const ttlMs = this.getHeartbeatTTLMs();
    const ttlSec = Math.ceil(ttlMs / 1000);

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const sockets = memPresenceUserSockets.get(userId);
      if (sockets) {
        const cutoff = now - ttlMs;
        for (const [sId, score] of sockets.entries()) {
          if (score <= cutoff) sockets.delete(sId);
        }
        sockets.set(socketId, now);
      }
      return;
    }

    try {
      const redis = getRedisClient();
      const userKey = this.getUserSocketsKey(userId);
      const socketKey = this.getSocketInfoKey(socketId);
      const cutoff = now - ttlMs;

      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(userKey, '-inf', cutoff);
      pipeline.zadd(userKey, now, socketId);
      pipeline.expire(userKey, ttlSec * 2);
      pipeline.expire(socketKey, ttlSec);
      await pipeline.exec();
    } catch (err: any) {
      LoggerUtil.warn('SocketPresenceRepository.heartbeat failed (non-critical)', { error: err.message });
    }
  }

  /**
   * Deregister a socket on disconnect.
   * Multi-tab/multi-device safe: removes socketId from Redis Sorted Set.
   * User is only offline when their last live socket is gone (ZCARD === 0).
   */
  static async deregisterSocket(
    socketId: string,
    knownUserId?: string
  ): Promise<{ userId: string | null; isLastSocket: boolean; remainingSockets: number }> {
    if (!socketId) return { userId: null, isLastSocket: false, remainingSockets: 0 };

    const now = Date.now();
    const ttlMs = this.getHeartbeatTTLMs();
    const ttlSec = Math.ceil(ttlMs / 1000);

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const userId = knownUserId || memPresenceSocketUser.get(socketId) || null;
      memPresenceSocketUser.delete(socketId);

      if (!userId || !memPresenceUserSockets.has(userId)) {
        return { userId, isLastSocket: true, remainingSockets: 0 };
      }

      const sockets = memPresenceUserSockets.get(userId)!;
      sockets.delete(socketId);
      // Prune stale
      const cutoff = now - ttlMs;
      for (const [sId, score] of sockets.entries()) {
        if (score <= cutoff) sockets.delete(sId);
      }
      const remaining = sockets.size;
      const isLast = remaining === 0;
      if (isLast) {
        memPresenceUserSockets.delete(userId);
      }
      return { userId, isLastSocket: isLast, remainingSockets: remaining };
    }

    try {
      const redis = getRedisClient();
      let resolvedUserId = knownUserId;

      if (!resolvedUserId) {
        const socketKey = this.getSocketInfoKey(socketId);
        const dataStr = await redis.get(socketKey);
        if (dataStr) {
          const parsed = safeJsonParse<{ userId: string }>(dataStr);
          resolvedUserId = parsed?.userId;
        }
      }

      if (!resolvedUserId) {
        await redis.del(this.getSocketInfoKey(socketId));
        return { userId: null, isLastSocket: false, remainingSockets: 0 };
      }

      const userKey = this.getUserSocketsKey(resolvedUserId);
      const socketKey = this.getSocketInfoKey(socketId);
      const cutoff = now - ttlMs;

      const pipeline = redis.pipeline();
      // 1. Prune stale
      pipeline.zremrangebyscore(userKey, '-inf', cutoff);
      // 2. Remove disconnecting socket
      pipeline.zrem(userKey, socketId);
      // 3. Remove socket metadata key
      pipeline.del(socketKey);
      // 4. Count remaining live sockets
      pipeline.zcard(userKey);

      const results = await pipeline.exec();
      const scardRes = results?.[3]?.[1] as number | undefined;
      const remaining = typeof scardRes === 'number' ? scardRes : 0;
      const isLast = remaining === 0;

      if (isLast) {
        await Promise.all([
          redis.del(userKey),
          redis.srem(this.getActiveUsersKey(), resolvedUserId),
        ]);
      } else {
        await redis.expire(userKey, ttlSec * 2);
      }

      return {
        userId: resolvedUserId,
        isLastSocket: isLast,
        remainingSockets: remaining,
      };
    } catch (err: any) {
      LoggerUtil.warn('SocketPresenceRepository.deregisterSocket fallback to memory', { error: err.message });
      const userId = knownUserId || memPresenceSocketUser.get(socketId) || null;
      memPresenceSocketUser.delete(socketId);
      if (userId && memPresenceUserSockets.has(userId)) {
        const sockets = memPresenceUserSockets.get(userId)!;
        sockets.delete(socketId);
        const cutoff = now - ttlMs;
        for (const [sId, score] of sockets.entries()) {
          if (score <= cutoff) sockets.delete(sId);
        }
        const remaining = sockets.size;
        const isLast = remaining === 0;
        if (isLast) memPresenceUserSockets.delete(userId);
        return { userId, isLastSocket: isLast, remainingSockets: remaining };
      }
      return { userId, isLastSocket: true, remainingSockets: 0 };
    }
  }

  /**
   * Check if a user is online (has at least 1 live socket with score > now - TTL).
   * Prunes stale members on every check.
   */
  static async isUserOnline(userId: string, customTtlMs?: number): Promise<boolean> {
    if (!userId) return false;

    const now = Date.now();
    const ttlMs = customTtlMs || this.getHeartbeatTTLMs();

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const sockets = memPresenceUserSockets.get(userId);
      if (!sockets) return false;
      const cutoff = now - ttlMs;
      for (const [sId, score] of sockets.entries()) {
        if (score <= cutoff) sockets.delete(sId);
      }
      return sockets.size > 0;
    }

    try {
      const redis = getRedisClient();
      const userKey = this.getUserSocketsKey(userId);
      const cutoff = now - ttlMs;

      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(userKey, '-inf', cutoff);
      pipeline.zcard(userKey);

      const results = await pipeline.exec();
      const count = (results?.[1]?.[1] as number) || 0;
      return count > 0;
    } catch {
      const sockets = memPresenceUserSockets.get(userId);
      if (!sockets) return false;
      const cutoff = now - ttlMs;
      for (const [sId, score] of sockets.entries()) {
        if (score <= cutoff) sockets.delete(sId);
      }
      return sockets.size > 0;
    }
  }

  /**
   * Get all live socket IDs for a user across all server instances.
   * Prunes stale members on read.
   */
  static async getUserSockets(userId: string, customTtlMs?: number): Promise<string[]> {
    if (!userId) return [];

    const now = Date.now();
    const ttlMs = customTtlMs || this.getHeartbeatTTLMs();

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const sockets = memPresenceUserSockets.get(userId);
      if (!sockets) return [];
      const cutoff = now - ttlMs;
      const live: string[] = [];
      for (const [sId, score] of sockets.entries()) {
        if (score > cutoff) {
          live.push(sId);
        } else {
          sockets.delete(sId);
        }
      }
      return live;
    }

    try {
      const redis = getRedisClient();
      const userKey = this.getUserSocketsKey(userId);
      const cutoff = now - ttlMs;

      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(userKey, '-inf', cutoff);
      pipeline.zrange(userKey, 0, -1);

      const results = await pipeline.exec();
      return (results?.[1]?.[1] as string[]) || [];
    } catch {
      const sockets = memPresenceUserSockets.get(userId);
      if (!sockets) return [];
      const cutoff = now - ttlMs;
      const live: string[] = [];
      for (const [sId, score] of sockets.entries()) {
        if (score > cutoff) live.push(sId);
        else sockets.delete(sId);
      }
      return live;
    }
  }

  /**
   * Bulk check online status for multiple user IDs.
   * Prunes stale members and checks live counts.
   */
  static async getOnlineUsers(userIds: string[], customTtlMs?: number): Promise<string[]> {
    if (!userIds || userIds.length === 0) return [];

    const now = Date.now();
    const ttlMs = customTtlMs || this.getHeartbeatTTLMs();

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const cutoff = now - ttlMs;
      return userIds.filter((id) => {
        const sockets = memPresenceUserSockets.get(id);
        if (!sockets) return false;
        for (const [sId, score] of sockets.entries()) {
          if (score <= cutoff) sockets.delete(sId);
        }
        return sockets.size > 0;
      });
    }

    try {
      const redis = getRedisClient();
      const pipeline = redis.pipeline();
      const cutoff = now - ttlMs;

      userIds.forEach((id) => {
        const key = this.getUserSocketsKey(id);
        pipeline.zremrangebyscore(key, '-inf', cutoff);
        pipeline.zcard(key);
      });

      const results = await pipeline.exec();
      const online: string[] = [];

      userIds.forEach((id, idx) => {
        const count = results?.[idx * 2 + 1]?.[1] as number | undefined;
        if (count && count > 0) {
          online.push(id);
        }
      });

      return online;
    } catch {
      const cutoff = now - ttlMs;
      return userIds.filter((id) => {
        const sockets = memPresenceUserSockets.get(id);
        if (!sockets) return false;
        for (const [sId, score] of sockets.entries()) {
          if (score <= cutoff) sockets.delete(sId);
        }
        return sockets.size > 0;
      });
    }
  }

  /**
   * Get total online user count across cluster for Prometheus metrics.
   */
  static async getOnlineUserCount(): Promise<number> {
    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      return memPresenceUserSockets.size;
    }
    try {
      const redis = getRedisClient();
      return await redis.scard(this.getActiveUsersKey());
    } catch {
      return memPresenceUserSockets.size;
    }
  }

  /**
   * Resolve userId from socketId.
   */
  static async getSocketUserId(socketId: string): Promise<string | null> {
    if (!socketId) return null;

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      return memPresenceSocketUser.get(socketId) || null;
    }

    try {
      const redis = getRedisClient();
      const str = await redis.get(this.getSocketInfoKey(socketId));
      if (!str) return memPresenceSocketUser.get(socketId) || null;
      const parsed = safeJsonParse<{ userId: string }>(str);
      return parsed?.userId || null;
    } catch {
      return memPresenceSocketUser.get(socketId) || null;
    }
  }

  /**
   * Debounce MongoDB lastActive writes across multi-instance nodes.
   * Atomically acquires a 60s Redis key lock.
   */
  static async acquireLastActiveLock(
    userId: string,
    ttlSeconds = LAST_ACTIVE_DEBOUNCE_SECONDS
  ): Promise<boolean> {
    if (!userId) return false;

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const now = Date.now();
      const last = memLastActiveWriteTs.get(userId) || 0;
      if (now - last < ttlSeconds * 1000) return false;
      memLastActiveWriteTs.set(userId, now);
      return true;
    }

    try {
      const redis = getRedisClient();
      const lockKey = this.getLastActiveLockKey(userId);
      const acquired = await redis.set(lockKey, '1', 'EX', ttlSeconds, 'NX');
      return acquired === 'OK';
    } catch {
      const now = Date.now();
      const last = memLastActiveWriteTs.get(userId) || 0;
      if (now - last < ttlSeconds * 1000) return false;
      memLastActiveWriteTs.set(userId, now);
      return true;
    }
  }
}

/**
 * ============================================================================
 * 3. LIVE ROOM REPOSITORY (Participants, atomic Lua capacity & study timer in Redis)
 * ============================================================================
 * Heartbeat-backed sorted set design:
 * - `liveroom:<roomId>:sockets`: ZSET (member=socketId, score=lastHeartbeatMs)
 * - `liveroom:<roomId>:participants`: HASH (socketId -> JSON(ParticipantInfo))
 * Stale members are pruned BEFORE counting capacity so dead sockets never consume capacity.
 */
export class SocketLiveRoomRepository {
  static getSocketsKey(roomId: string): string {
    return buildKey(LIVEROOM_DOMAIN, `{${roomId}}:sockets`);
  }

  private static getParticipantsKey(roomId: string): string {
    return buildKey(LIVEROOM_DOMAIN, `{${roomId}}:participants`);
  }

  private static getSessionKey(roomId: string): string {
    return buildKey(LIVEROOM_DOMAIN, `{${roomId}}:session`);
  }

  // Atomic Lua script: prunes stale sockets from ZSET/HASH BEFORE checking capacity and adding
  private static readonly ADD_PARTICIPANT_LUA = `
local socketsKey = KEYS[1]
local participantsKey = KEYS[2]
local maxCapacity = tonumber(ARGV[1])
local socketId = ARGV[2]
local participantJson = ARGV[3]
local now = tonumber(ARGV[4])
local ttlMs = tonumber(ARGV[5])
local ttlSeconds = tonumber(ARGV[6])

local cutoff = now - ttlMs
-- 1. Prune stale members whose heartbeat expired before counting
local stale = redis.call('ZRANGEBYSCORE', socketsKey, '-inf', cutoff)
if #stale > 0 then
    redis.call('ZREMRANGEBYSCORE', socketsKey, '-inf', cutoff)
    for i, sId in ipairs(stale) do
        redis.call('HDEL', participantsKey, sId)
    end
end

-- 2. Check if this socket is already active in the room
local isMember = redis.call('ZSCORE', socketsKey, socketId)
if not isMember then
    local currentCount = redis.call('ZCARD', socketsKey)
    if currentCount >= maxCapacity then
        return {0, currentCount}
    end
end

-- 3. Add or update socket in ZSET and Hash
redis.call('ZADD', socketsKey, now, socketId)
redis.call('HSET', participantsKey, socketId, participantJson)
redis.call('EXPIRE', socketsKey, ttlSeconds)
redis.call('EXPIRE', participantsKey, ttlSeconds)
local newCount = redis.call('ZCARD', socketsKey)
return {1, newCount}
`;

  // Atomic Lua script for participant removal and room cleanup when empty
  private static readonly REMOVE_PARTICIPANT_LUA = `
local socketsKey = KEYS[1]
local participantsKey = KEYS[2]
local sessionKey = KEYS[3]
local socketId = ARGV[1]
local now = tonumber(ARGV[2])
local ttlMs = tonumber(ARGV[3])

local cutoff = now - ttlMs
local stale = redis.call('ZRANGEBYSCORE', socketsKey, '-inf', cutoff)
if #stale > 0 then
    redis.call('ZREMRANGEBYSCORE', socketsKey, '-inf', cutoff)
    for i, sId in ipairs(stale) do
        redis.call('HDEL', participantsKey, sId)
    end
end

local participantJson = redis.call('HGET', participantsKey, socketId)
local wasRemoved = redis.call('ZREM', socketsKey, socketId)
redis.call('HDEL', participantsKey, socketId)
local remaining = redis.call('ZCARD', socketsKey)

if remaining == 0 then
    redis.call('DEL', socketsKey, participantsKey, sessionKey)
end

return {wasRemoved, remaining, participantJson}
`;

  /**
   * Atomically adds a participant to a live room while strictly enforcing MAX_ROOM_SIZE
   * after pruning stale members via an atomic Redis Lua script.
   */
  static async addParticipant(
    roomId: string,
    userId: string,
    socketId: string,
    participantData: Partial<ParticipantInfo>,
    maxCapacity = 16
  ): Promise<{ success: boolean; isFirst: boolean; currentCount: number; errorReason?: string }> {
    if (!roomId || !userId || !socketId) {
      return { success: false, isFirst: false, currentCount: 0, errorReason: 'Missing parameters' };
    }

    const now = Date.now();
    const ttlMs = SocketPresenceRepository.getHeartbeatTTLMs();

    const fullParticipant: ParticipantInfo = {
      userId,
      userName: participantData.userName || 'Unknown',
      socketId,
      camOn: !!participantData.camOn,
      micOn: !!participantData.micOn,
      joinedAt: now,
    };

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      // In-memory fallback with stale score pruning
      if (!memLiveRoomSockets.has(roomId)) {
        memLiveRoomSockets.set(roomId, new Map());
      }
      const sockets = memLiveRoomSockets.get(roomId)!;
      const cutoff = now - ttlMs;
      for (const [sId, score] of sockets.entries()) {
        if (score <= cutoff) {
          sockets.delete(sId);
          memLiveRoomParticipants.get(roomId)?.delete(sId);
        }
      }

      if (!sockets.has(socketId) && sockets.size >= maxCapacity) {
        return { success: false, isFirst: false, currentCount: sockets.size, errorReason: 'Room is full' };
      }
      const isFirst = sockets.size === 0;
      sockets.set(socketId, now);

      if (!memLiveRoomParticipants.has(roomId)) {
        memLiveRoomParticipants.set(roomId, new Map());
      }
      memLiveRoomParticipants.get(roomId)!.set(socketId, fullParticipant);

      if (isFirst && !memLiveRoomSessions.has(roomId)) {
        memLiveRoomSessions.set(roomId, {
          active: true,
          startedAt: now,
          accumulatedTime: 0,
        });
      }

      return { success: true, isFirst, currentCount: sockets.size };
    }

    try {
      const redis = getRedisClient();
      const socketsKey = this.getSocketsKey(roomId);
      const participantsKey = this.getParticipantsKey(roomId);

      const res = (await redis.eval(
        this.ADD_PARTICIPANT_LUA,
        2,
        socketsKey,
        participantsKey,
        maxCapacity,
        socketId,
        safeJsonStringify(fullParticipant),
        now,
        ttlMs,
        LIVEROOM_SESSION_TTL_SECONDS
      )) as [number, number];

      const status = res?.[0];
      const count = res?.[1] || 0;

      if (status === 0) {
        return {
          success: false,
          isFirst: false,
          currentCount: count,
          errorReason: `Live room is full (max ${maxCapacity} participants)`,
        };
      }

      const isFirst = count === 1;

      // If first participant, ensure session timer is started in Redis
      if (isFirst) {
        const session = await this.getRoomSession(roomId);
        if (!session) {
          await this.startRoomSession(roomId);
        }
      }

      return {
        success: true,
        isFirst,
        currentCount: count,
      };
    } catch (err: any) {
      LoggerUtil.warn('SocketLiveRoomRepository.addParticipant fallback', { error: err.message });
      if (!memLiveRoomSockets.has(roomId)) memLiveRoomSockets.set(roomId, new Map());
      const sockets = memLiveRoomSockets.get(roomId)!;
      sockets.set(socketId, now);
      return { success: true, isFirst: sockets.size === 1, currentCount: sockets.size };
    }
  }

  /**
   * Update heartbeat timestamp for a participant in a live room.
   */
  static async heartbeat(roomId: string, socketId: string): Promise<void> {
    if (!roomId || !socketId) return;
    const now = Date.now();

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      memLiveRoomSockets.get(roomId)?.set(socketId, now);
      return;
    }

    try {
      const redis = getRedisClient();
      const socketsKey = this.getSocketsKey(roomId);
      const participantsKey = this.getParticipantsKey(roomId);
      const pipeline = redis.pipeline();
      pipeline.zadd(socketsKey, 'XX', now, socketId);
      pipeline.expire(socketsKey, LIVEROOM_SESSION_TTL_SECONDS);
      pipeline.expire(participantsKey, LIVEROOM_SESSION_TTL_SECONDS);
      await pipeline.exec();
    } catch (err: any) {
      LoggerUtil.warn('SocketLiveRoomRepository.heartbeat failed', { error: err.message });
    }
  }

  /**
   * Remove a participant socket from a live room atomically via Lua.
   */
  static async removeParticipant(
    roomId: string,
    socketId: string
  ): Promise<{ userId: string | null; remainingCount: number; isRoomEmpty: boolean; wasRemoved: boolean }> {
    if (!roomId || !socketId) {
      return { userId: null, remainingCount: 0, isRoomEmpty: true, wasRemoved: false };
    }

    const now = Date.now();
    const ttlMs = SocketPresenceRepository.getHeartbeatTTLMs();

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const sockets = memLiveRoomSockets.get(roomId);
      const participants = memLiveRoomParticipants.get(roomId);
      const participant = participants?.get(socketId);
      const userId = participant?.userId || null;

      if (sockets) {
        sockets.delete(socketId);
        participants?.delete(socketId);
        const remaining = sockets.size;
        const empty = remaining === 0;
        if (empty) {
          memLiveRoomSockets.delete(roomId);
          memLiveRoomParticipants.delete(roomId);
          memLiveRoomSessions.delete(roomId);
        }
        return { userId, remainingCount: remaining, isRoomEmpty: empty, wasRemoved: true };
      }
      return { userId, remainingCount: 0, isRoomEmpty: true, wasRemoved: false };
    }

    try {
      const redis = getRedisClient();
      const socketsKey = this.getSocketsKey(roomId);
      const participantsKey = this.getParticipantsKey(roomId);
      const sessionKey = this.getSessionKey(roomId);

      const res = (await redis.eval(
        this.REMOVE_PARTICIPANT_LUA,
        3,
        socketsKey,
        participantsKey,
        sessionKey,
        socketId,
        now,
        ttlMs
      )) as [number, number, string | null];

      const wasRemoved = res?.[0] === 1;
      const remainingCount = res?.[1] || 0;
      const participantJson = res?.[2];
      const parsed = participantJson ? safeJsonParse<ParticipantInfo>(participantJson) : null;
      const userId = parsed?.userId || null;
      const isRoomEmpty = remainingCount === 0;

      return {
        userId,
        remainingCount,
        isRoomEmpty,
        wasRemoved,
      };
    } catch (err: any) {
      LoggerUtil.warn('SocketLiveRoomRepository.removeParticipant fallback', { error: err.message });
      return { userId: null, remainingCount: 0, isRoomEmpty: true, wasRemoved: false };
    }
  }

  /**
   * Get all live participants in a room across all instances (pruning stale members on read).
   */
  static async getRoomParticipants(roomId: string): Promise<ParticipantInfo[]> {
    if (!roomId) return [];

    const now = Date.now();
    const ttlMs = SocketPresenceRepository.getHeartbeatTTLMs();
    const cutoff = now - ttlMs;

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const sockets = memLiveRoomSockets.get(roomId);
      const map = memLiveRoomParticipants.get(roomId);
      if (!sockets || !map) return [];
      const live: ParticipantInfo[] = [];
      for (const [sId, score] of sockets.entries()) {
        if (score > cutoff) {
          const p = map.get(sId);
          if (p) live.push(p);
        } else {
          sockets.delete(sId);
          map.delete(sId);
        }
      }
      return live;
    }

    try {
      const redis = getRedisClient();
      const socketsKey = this.getSocketsKey(roomId);
      const participantsKey = this.getParticipantsKey(roomId);

      // Prune stale members from ZSET and Hash
      const staleSockets = await redis.zrangebyscore(socketsKey, '-inf', cutoff);
      if (staleSockets.length > 0) {
        const pipeline = redis.pipeline();
        pipeline.zremrangebyscore(socketsKey, '-inf', cutoff);
        pipeline.hdel(participantsKey, ...staleSockets);
        await pipeline.exec();
      }

      const liveSocketIds = await redis.zrangebyscore(socketsKey, cutoff, '+inf');
      if (liveSocketIds.length === 0) {
        return [];
      }

      const rawValues = await redis.hmget(participantsKey, ...liveSocketIds);
      return rawValues
        .map((str) => (str ? safeJsonParse<ParticipantInfo>(str) : null))
        .filter((p): p is ParticipantInfo => !!p && !!p.userId);
    } catch {
      const map = memLiveRoomParticipants.get(roomId);
      return map ? Array.from(map.values()) : [];
    }
  }

  /**
   * Update participant media status (camOn/micOn) in Redis.
   */
  static async updateParticipantState(
    roomId: string,
    socketId: string,
    updates: { camOn?: boolean; micOn?: boolean }
  ): Promise<void> {
    if (!roomId || !socketId) return;

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const p = memLiveRoomParticipants.get(roomId)?.get(socketId);
      if (p) {
        if (updates.camOn !== undefined) p.camOn = updates.camOn;
        if (updates.micOn !== undefined) p.micOn = updates.micOn;
      }
      return;
    }

    try {
      const redis = getRedisClient();
      const key = this.getParticipantsKey(roomId);
      const str = await redis.hget(key, socketId);
      if (str) {
        const p = safeJsonParse<ParticipantInfo>(str);
        if (p) {
          if (updates.camOn !== undefined) p.camOn = updates.camOn;
          if (updates.micOn !== undefined) p.micOn = updates.micOn;
          await redis.hset(key, socketId, safeJsonStringify(p));
        }
      }
    } catch (err: any) {
      LoggerUtil.warn('SocketLiveRoomRepository.updateParticipantState failed', { error: err.message });
    }
  }

  /**
   * Get current room session timer state from Redis.
   */
  static async getRoomSession(roomId: string): Promise<RoomSessionState | null> {
    if (!roomId) return null;

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      return memLiveRoomSessions.get(roomId) || null;
    }

    try {
      const redis = getRedisClient();
      const data = await redis.hgetall(this.getSessionKey(roomId));
      if (!data || Object.keys(data).length === 0) return null;

      return {
        active: data['active'] === 'true',
        startedAt: data['startedAt'] ? Number(data['startedAt']) : null,
        accumulatedTime: Number(data['accumulatedTime'] || 0),
      };
    } catch {
      return memLiveRoomSessions.get(roomId) || null;
    }
  }

  /**
   * Start or initialize study session timer in Redis.
   */
  static async startRoomSession(roomId: string): Promise<RoomSessionState> {
    const sessionState: RoomSessionState = {
      active: true,
      startedAt: Date.now(),
      accumulatedTime: 0,
    };

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      memLiveRoomSessions.set(roomId, sessionState);
      return sessionState;
    }

    try {
      const redis = getRedisClient();
      const key = this.getSessionKey(roomId);
      await redis.hmset(key, {
        active: 'true',
        startedAt: String(sessionState.startedAt),
        accumulatedTime: '0',
      });
      await redis.expire(key, LIVEROOM_SESSION_TTL_SECONDS);
      return sessionState;
    } catch {
      memLiveRoomSessions.set(roomId, sessionState);
      return sessionState;
    }
  }

  /**
   * Toggle study session timer (pause or resume) in Redis.
   */
  static async toggleRoomSession(roomId: string, active: boolean): Promise<RoomSessionState> {
    const existing = await this.getRoomSession(roomId);
    let sessionState: RoomSessionState;

    if (!existing) {
      sessionState = {
        active,
        startedAt: active ? Date.now() : null,
        accumulatedTime: 0,
      };
    } else {
      sessionState = { ...existing };
      if (sessionState.active !== active) {
        if (active) {
          // Resume
          sessionState.active = true;
          sessionState.startedAt = Date.now();
        } else {
          // Pause
          sessionState.active = false;
          if (sessionState.startedAt) {
            sessionState.accumulatedTime += Date.now() - sessionState.startedAt;
            sessionState.startedAt = null;
          }
        }
      }
    }

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      memLiveRoomSessions.set(roomId, sessionState);
      return sessionState;
    }

    try {
      const redis = getRedisClient();
      const key = this.getSessionKey(roomId);
      await redis.hmset(key, {
        active: String(sessionState.active),
        startedAt: sessionState.startedAt ? String(sessionState.startedAt) : '',
        accumulatedTime: String(sessionState.accumulatedTime),
      });
      await redis.expire(key, LIVEROOM_SESSION_TTL_SECONDS);
      return sessionState;
    } catch {
      memLiveRoomSessions.set(roomId, sessionState);
      return sessionState;
    }
  }

  /**
   * Clean up all state for a room.
   */
  static async clearRoom(roomId: string): Promise<void> {
    if (!roomId) return;

    memLiveRoomSockets.delete(roomId);
    memLiveRoomParticipants.delete(roomId);
    memLiveRoomSessions.delete(roomId);

    if (!isCacheEnabled(SOCKET_DOMAIN)) return;

    try {
      const redis = getRedisClient();
      await redis.del(
        this.getSocketsKey(roomId),
        this.getParticipantsKey(roomId),
        this.getSessionKey(roomId)
      );
    } catch (err: any) {
      LoggerUtil.warn('SocketLiveRoomRepository.clearRoom failed', { error: err.message });
    }
  }
}

/**
 * ============================================================================
 * 4. GROUP ACTIVE SESSIONS REPOSITORY (Replaces local groupActiveSessions Map)
 * ============================================================================
 * Key: `liveroom:group:<groupId>:active_sessions` -> Redis Hash (userId -> JSON({ lastSeen, elapsedTime }))
 * Prunes sessions inactive for >90s on read and write.
 */
export class SocketGroupSessionRepository {
  private static getActiveSessionsKey(groupId: string): string {
    return buildKey(LIVEROOM_DOMAIN, `group:${groupId}:active_sessions`);
  }

  static async updateActiveSession(
    groupId: string,
    userId: string,
    elapsedTime: number
  ): Promise<void> {
    if (!groupId || !userId) return;
    const now = Date.now();
    const sessionData = { lastSeen: now, elapsedTime };

    const thresholdMs = 90_000;

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      if (!memGroupActiveSessions.has(groupId)) {
        memGroupActiveSessions.set(groupId, new Map());
      }
      const map = memGroupActiveSessions.get(groupId)!;
      for (const [uId, val] of map.entries()) {
        if (now - val.lastSeen > thresholdMs) map.delete(uId);
      }
      map.set(userId, sessionData);
      return;
    }

    try {
      const redis = getRedisClient();
      const key = this.getActiveSessionsKey(groupId);
      const all = await redis.hgetall(key);
      const staleUserIds: string[] = [];
      for (const [uId, str] of Object.entries(all || {})) {
        const parsed = safeJsonParse<{ lastSeen: number; elapsedTime: number }>(str);
        if (parsed && now - parsed.lastSeen > thresholdMs) {
          staleUserIds.push(uId);
        }
      }
      const pipeline = redis.pipeline();
      if (staleUserIds.length > 0) {
        pipeline.hdel(key, ...staleUserIds);
      }
      pipeline.hset(key, userId, safeJsonStringify(sessionData));
      pipeline.expire(key, LIVEROOM_SESSION_TTL_SECONDS);
      await pipeline.exec();
    } catch {
      if (!memGroupActiveSessions.has(groupId)) memGroupActiveSessions.set(groupId, new Map());
      memGroupActiveSessions.get(groupId)!.set(userId, sessionData);
    }
  }

  static async removeActiveSession(groupId: string, userId: string): Promise<void> {
    if (!groupId || !userId) return;

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      memGroupActiveSessions.get(groupId)?.delete(userId);
      return;
    }

    try {
      const redis = getRedisClient();
      await redis.hdel(this.getActiveSessionsKey(groupId), userId);
    } catch {
      memGroupActiveSessions.get(groupId)?.delete(userId);
    }
  }

  static async getActiveMembers(
    groupId: string
  ): Promise<{ userId: string; elapsedTime: number }[]> {
    if (!groupId) return [];
    const now = Date.now();
    const thresholdMs = 90_000; // 90 seconds activity window

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const sessions = memGroupActiveSessions.get(groupId);
      const activeList: { userId: string; elapsedTime: number }[] = [];
      if (sessions) {
        for (const [uId, val] of sessions.entries()) {
          if (now - val.lastSeen <= thresholdMs) {
            activeList.push({ userId: uId, elapsedTime: val.elapsedTime });
          } else {
            sessions.delete(uId);
          }
        }
      }
      return activeList;
    }

    try {
      const redis = getRedisClient();
      const key = this.getActiveSessionsKey(groupId);
      const all = await redis.hgetall(key);
      const activeList: { userId: string; elapsedTime: number }[] = [];
      const staleUserIds: string[] = [];

      for (const [uId, str] of Object.entries(all || {})) {
        const parsed = safeJsonParse<{ lastSeen: number; elapsedTime: number }>(str);
        if (parsed && now - parsed.lastSeen <= thresholdMs) {
          activeList.push({ userId: uId, elapsedTime: parsed.elapsedTime });
        } else {
          staleUserIds.push(uId);
        }
      }

      if (staleUserIds.length > 0) {
        redis.hdel(key, ...staleUserIds).catch(() => {});
      }

      return activeList;
    } catch {
      const sessions = memGroupActiveSessions.get(groupId);
      const activeList: { userId: string; elapsedTime: number }[] = [];
      if (sessions) {
        sessions.forEach((val, uId) => {
          if (now - val.lastSeen <= thresholdMs) {
            activeList.push({ userId: uId, elapsedTime: val.elapsedTime });
          }
        });
      }
      return activeList;
    }
  }
}

/**
 * ============================================================================
 * 5. GROUP ROOM MEMBERS REPOSITORY (Replaces local groupRooms Map)
 * ============================================================================
 * Key: `liveroom:group:<groupId>:members` -> Redis Sorted Set (member=userId, score=lastHeartbeatMs)
 * Key: `presence:socket:<socketId>:groups` -> Redis Set of groupIds joined by this socket
 */
export class SocketGroupRoomRepository {
  private static getGroupMembersKey(groupId: string): string {
    return buildKey(LIVEROOM_DOMAIN, `group:${groupId}:members`);
  }

  private static getSocketGroupsKey(socketId: string): string {
    return buildKey(PRESENCE_DOMAIN, `socket:${socketId}:groups`);
  }

  static async joinGroup(groupId: string, userId: string, socketId: string): Promise<void> {
    if (!groupId || !userId || !socketId) return;

    const now = Date.now();
    const ttlMs = SocketPresenceRepository.getHeartbeatTTLMs();
    const cutoff = now - ttlMs;

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      if (!memGroupMembers.has(groupId)) memGroupMembers.set(groupId, new Map());
      const m = memGroupMembers.get(groupId)!;
      for (const [uId, score] of m.entries()) {
        if (score <= cutoff) m.delete(uId);
      }
      m.set(userId, now);

      if (!memSocketGroups.has(socketId)) memSocketGroups.set(socketId, new Set());
      memSocketGroups.get(socketId)!.add(groupId);
      return;
    }

    try {
      const redis = getRedisClient();
      const pipeline = redis.pipeline();
      const groupKey = this.getGroupMembersKey(groupId);
      const socketKey = this.getSocketGroupsKey(socketId);
      pipeline.zremrangebyscore(groupKey, '-inf', cutoff);
      pipeline.zadd(groupKey, now, userId);
      pipeline.expire(groupKey, LIVEROOM_SESSION_TTL_SECONDS);
      pipeline.sadd(socketKey, groupId);
      pipeline.expire(socketKey, LIVEROOM_SESSION_TTL_SECONDS);
      await pipeline.exec();
    } catch {
      if (!memGroupMembers.has(groupId)) memGroupMembers.set(groupId, new Map());
      memGroupMembers.get(groupId)!.set(userId, now);
      if (!memSocketGroups.has(socketId)) memSocketGroups.set(socketId, new Set());
      memSocketGroups.get(socketId)!.add(groupId);
    }
  }

  static async leaveGroup(groupId: string, userId: string, socketId?: string): Promise<void> {
    if (!groupId || !userId) return;

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      memGroupMembers.get(groupId)?.delete(userId);
      if (socketId) memSocketGroups.get(socketId)?.delete(groupId);
      return;
    }

    try {
      const redis = getRedisClient();
      const pipeline = redis.pipeline();
      pipeline.zrem(this.getGroupMembersKey(groupId), userId);
      if (socketId) pipeline.srem(this.getSocketGroupsKey(socketId), groupId);
      await pipeline.exec();
    } catch {
      memGroupMembers.get(groupId)?.delete(userId);
      if (socketId) memSocketGroups.get(socketId)?.delete(groupId);
    }
  }

  static async getOnlineUsersInGroup(groupId: string): Promise<string[]> {
    if (!groupId) return [];

    const now = Date.now();
    const ttlMs = SocketPresenceRepository.getHeartbeatTTLMs();
    const cutoff = now - ttlMs;

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const m = memGroupMembers.get(groupId);
      if (!m) return [];
      const live: string[] = [];
      for (const [uId, score] of m.entries()) {
        if (score > cutoff) live.push(uId);
        else m.delete(uId);
      }
      return live;
    }

    try {
      const redis = getRedisClient();
      const groupKey = this.getGroupMembersKey(groupId);
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(groupKey, '-inf', cutoff);
      pipeline.zrange(groupKey, 0, -1);
      const res = await pipeline.exec();
      return (res?.[1]?.[1] as string[]) || [];
    } catch {
      const m = memGroupMembers.get(groupId);
      return m ? Array.from(m.keys()) : [];
    }
  }

  static async getSocketGroups(socketId: string): Promise<string[]> {
    if (!socketId) return [];

    if (!isCacheEnabled(SOCKET_DOMAIN)) {
      const groups = memSocketGroups.get(socketId);
      const list = groups ? Array.from(groups) : [];
      memSocketGroups.delete(socketId);
      return list;
    }

    try {
      const redis = getRedisClient();
      const socketKey = this.getSocketGroupsKey(socketId);
      const groups = await redis.smembers(socketKey);
      await redis.del(socketKey);
      return groups || [];
    } catch {
      const groups = memSocketGroups.get(socketId);
      const list = groups ? Array.from(groups) : [];
      memSocketGroups.delete(socketId);
      return list;
    }
  }
}
