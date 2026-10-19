/**
 * mentorshipCache.ts
 * Mentorship Availability Caching & Distributed Booking Lock Module
 * 
 * Rules Enforced:
 * 1. Redis lock (SET NX PX with unique UUID token, release via atomic Lua script)
 * 2. MongoDB remains the source of truth & final guard against double-booking
 * 3. Exact timezone handling
 * 4. Automatic invalidation on booking, cancellation, rescheduling, slot edits, and direct Mongoose writes
 * 5. Domain kill switches (CACHE_MENTORSHIP_AVAILABILITY_ENABLED, CACHE_MENTORSHIP_LOCK_ENABLED)
 * 6. Non-blocking SCAN-based cache purge
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { CacheHelper, buildKey, buildPattern, applyJitter, isDomainEnabled } from './cacheHelper';
import { getRedisClient } from './redisConnection';
import { LoggerUtil } from '@/shared/logger.util';

// Domain Names
const AVAIL_DOMAIN = 'mentorship_availability';
const LOCK_DOMAIN = 'mentorship_lock';

// TTL Configurations
const AVAILABILITY_TTL_SECONDS = parseInt(
  process.env['MENTORSHIP_AVAILABILITY_CACHE_TTL_SECONDS'] || '1800',
  10
); // Default 30 minutes
const DEFAULT_LOCK_TTL_MS = parseInt(
  process.env['MENTORSHIP_BOOKING_LOCK_TTL_MS'] || '10000',
  10
); // Default 10 seconds

// Atomic Lua Script to release Redis lock only if the token matches
const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`;

/**
 * Acquire distributed lock for session booking slot.
 * Returns { acquired: boolean, token: string }.
 * If lock is not acquired, booking must be rejected to prevent concurrent double-booking.
 */
export async function acquireBookingLock(
  mentorId: string,
  scheduledTimestamp: number,
  ttlMs = DEFAULT_LOCK_TTL_MS
): Promise<{ acquired: boolean; token: string }> {
  const token = uuidv4();
  if (!mentorId || !scheduledTimestamp) {
    return { acquired: false, token };
  }

  // Check kill switch
  if (!isDomainEnabled(LOCK_DOMAIN)) {
    // Fail-open for lock optimization if domain disabled (MongoDB index/transactions guard)
    LoggerUtil.warn(`[MentorshipLock] Lock domain disabled via kill switch, proceeding with token`);
    return { acquired: true, token };
  }

  const sanitizedMentorId = mentorId.replace(/[^a-zA-Z0-9_-]/g, '');
  const lockKey = buildKey(LOCK_DOMAIN, `booking:${sanitizedMentorId}:${scheduledTimestamp}`);

  try {
    const client = getRedisClient();
    // SET lockKey token PX ttlMs NX
    const result = await client.set(lockKey, token, 'PX', ttlMs, 'NX');
    const acquired = result === 'OK';
    if (!acquired) {
      LoggerUtil.info(`[MentorshipLock] Slot lock collision for mentor ${sanitizedMentorId} at ${scheduledTimestamp}`);
    }
    return { acquired, token };
  } catch (error: any) {
    LoggerUtil.warn(`[MentorshipLock] Redis error acquiring lock: ${error.message}`);
    // Fail-open: Redis lock is only an optimization. MongoDB optimistic lock/index is final guard
    const failOpen = process.env['MENTORSHIP_LOCK_FAIL_OPEN'] !== 'false';
    return { acquired: failOpen, token };
  }
}

/**
 * Release distributed lock atomically via Lua script.
 * Returns true if the lock was released, false if lock expired or token mismatched.
 */
export async function releaseBookingLock(
  mentorId: string,
  scheduledTimestamp: number,
  token: string
): Promise<boolean> {
  if (!mentorId || !scheduledTimestamp || !token) {
    return false;
  }

  if (!isDomainEnabled(LOCK_DOMAIN)) {
    return true;
  }

  const sanitizedMentorId = mentorId.replace(/[^a-zA-Z0-9_-]/g, '');
  const lockKey = buildKey(LOCK_DOMAIN, `booking:${sanitizedMentorId}:${scheduledTimestamp}`);

  try {
    const client = getRedisClient();
    const result = await client.eval(RELEASE_LOCK_LUA, 1, lockKey, token);
    return result === 1;
  } catch (error: any) {
    LoggerUtil.warn(`[MentorshipLock] Failed to release booking lock for ${sanitizedMentorId}: ${error.message}`);
    return false;
  }
}

/**
 * Atomic Lua script for updating mentor availability version monotonically.
 * Guarantees that version is always max(current + 1, now).
 */
const BUMP_VERSION_LUA = `
local current = redis.call("get", KEYS[1])
local now = tonumber(ARGV[1])
local next_val = now
if current then
    local cur_num = tonumber(current)
    if cur_num and cur_num >= now then
        next_val = cur_num + 1
    end
end
redis.call("set", KEYS[1], tostring(next_val))
return next_val
`;

/**
 * Get current availability cache version for a mentor.
 * Atomic, O(1), eviction-safe: if missing/evicted, initializes to Date.now()
 * so old cached slots can NEVER become reachable again.
 */
export async function getMentorAvailabilityVersion(mentorId: string): Promise<number> {
  if (!mentorId) return Date.now();
  const sanitizedMentorId = mentorId.replace(/[^a-zA-Z0-9_-]/g, '');
  const verKey = buildKey(AVAIL_DOMAIN, `mentor_ver:${sanitizedMentorId}`);
  try {
    const client = getRedisClient();
    const ver = await client.get(verKey);
    if (ver) {
      return parseInt(ver, 10);
    }
    // Eviction-safe initialization: key is missing in Redis.
    // Generate a fresh timestamp version and set with NX so all concurrent readers converge.
    const now = Date.now();
    await client.set(verKey, now.toString(), 'NX');
    const finalVer = await client.get(verKey);
    return finalVer ? parseInt(finalVer, 10) : now;
  } catch (error: any) {
    LoggerUtil.warn(`[MentorshipCache] Failed to fetch mentor version for ${sanitizedMentorId}: ${error.message}`);
    return Date.now();
  }
}

/**
 * Increment mentor availability cache version monotonically using timestamps.
 * Guarantees monotonic increase >= Date.now().
 */
export async function incrementMentorAvailabilityVersion(mentorId: string): Promise<number> {
  if (!mentorId) return Date.now();
  const sanitizedMentorId = mentorId.replace(/[^a-zA-Z0-9_-]/g, '');
  const verKey = buildKey(AVAIL_DOMAIN, `mentor_ver:${sanitizedMentorId}`);
  try {
    const client = getRedisClient();
    const now = Date.now();
    const result = await client.eval(BUMP_VERSION_LUA, 1, verKey, now.toString());
    const newVer = typeof result === 'number' ? result : parseInt(String(result), 10);
    LoggerUtil.debug(`[MentorshipCache] Incremented availability version to ${newVer} for mentor ${sanitizedMentorId}`);
    return newVer;
  } catch (error: any) {
    LoggerUtil.warn(`[MentorshipCache] Failed to increment mentor version for ${sanitizedMentorId}: ${error.message}`);
    return Date.now();
  }
}

/**
 * Build a deterministic cache key for mentor available slots for a given date, timezone, and version
 */
export function buildSlotsCacheKey(mentorId: string, dateStr: string, timezone: string, version: number = 1): string {
  const sanitizedMentorId = mentorId.replace(/[^a-zA-Z0-9_-]/g, '');
  const sanitizedDate = dateStr.slice(0, 10).replace(/[^0-9-]/g, '');
  const sanitizedTz = (timezone || 'UTC').replace(/[^a-zA-Z0-9_/+-]/g, '');
  return buildKey(AVAIL_DOMAIN, `slots:${sanitizedMentorId}:v${version}:${sanitizedDate}:${sanitizedTz}`);
}

/**
 * Get cached available slots for a mentor on a specific date and timezone
 */
export async function getCachedAvailableSlots(
  mentorId: string,
  dateStr: string,
  timezone: string
): Promise<any[] | null> {
  const version = await getMentorAvailabilityVersion(mentorId);
  const key = buildSlotsCacheKey(mentorId, dateStr, timezone, version);
  return CacheHelper.get<any[]>(key, AVAIL_DOMAIN);
}

/**
 * Store calculated available slots in cache with TTL jitter
 */
export async function setCachedAvailableSlots(
  mentorId: string,
  dateStr: string,
  timezone: string,
  slots: any[]
): Promise<void> {
  const version = await getMentorAvailabilityVersion(mentorId);
  const key = buildSlotsCacheKey(mentorId, dateStr, timezone, version);
  await CacheHelper.set(key, slots, {
    ttlSeconds: AVAILABILITY_TTL_SECONDS,
    domain: AVAIL_DOMAIN,
  });
}

/**
 * Hash filters to create bounded deterministic key for mentor availability overview
 */
export function hashAvailabilityFilters(filters: Record<string, any>): string {
  const serialized = JSON.stringify(filters || {});
  return crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

/**
 * Get cached mentor availability overview
 */
export async function getCachedMentorAvailability(
  mentorId: string,
  filters: Record<string, any>
): Promise<any[] | null> {
  const sanitizedMentorId = mentorId.replace(/[^a-zA-Z0-9_-]/g, '');
  const version = await getMentorAvailabilityVersion(mentorId);
  const filterHash = hashAvailabilityFilters(filters);
  const key = buildKey(AVAIL_DOMAIN, `list:${sanitizedMentorId}:v${version}:${filterHash}`);
  return CacheHelper.get<any[]>(key, AVAIL_DOMAIN);
}

/**
 * Cache mentor availability overview
 */
export async function setCachedMentorAvailability(
  mentorId: string,
  filters: Record<string, any>,
  data: any[]
): Promise<void> {
  const sanitizedMentorId = mentorId.replace(/[^a-zA-Z0-9_-]/g, '');
  const version = await getMentorAvailabilityVersion(mentorId);
  const filterHash = hashAvailabilityFilters(filters);
  const key = buildKey(AVAIL_DOMAIN, `list:${sanitizedMentorId}:v${version}:${filterHash}`);
  await CacheHelper.set(key, data, {
    ttlSeconds: AVAILABILITY_TTL_SECONDS,
    domain: AVAIL_DOMAIN,
  });
}

/**
 * Invalidate all availability & slot caches for a mentor via atomic O(1) version increment.
 * Replaces SCAN-per-booking with instantaneous version bump.
 * Called immediately upon:
 * - Session booked
 * - Session cancelled
 * - Session rescheduled
 * - Availability slot created, updated, blocked, unblocked, deleted
 * - Refund processed
 */
export async function invalidateMentorAvailabilityCache(
  mentorId: string,
  date?: string | Date
): Promise<number> {
  if (!mentorId) return 0;
  const sanitizedMentorId = mentorId.replace(/[^a-zA-Z0-9_-]/g, '');

  try {
    const newVer = await incrementMentorAvailabilityVersion(sanitizedMentorId);
    LoggerUtil.debug(`[MentorshipCache] Invalidated cache for mentor ${sanitizedMentorId} (version -> ${newVer})`);
    return 1;
  } catch (error: any) {
    LoggerUtil.warn(`[MentorshipCache] Failed to invalidate availability for mentor ${sanitizedMentorId}: ${error.message}`);
    return 0;
  }
}
