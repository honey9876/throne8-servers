/**
 * Dedicated Auth Cache Module
 * Handles:
 * 1. User status caching (userId, role, status, accountStatus, lockUntil, flags)
 * 2. Session lastActivity write debouncing via Redis SET NX EX
 * 3. Immediate invalidation on user ban, role update, password change, logout
 */

import { CacheHelper, buildKey, buildPattern, applyJitter, isDomainEnabled } from './cacheHelper';
import { getRedisClient } from './redisConnection';
import { LoggerUtil } from '@/shared/logger.util';

export interface CachedAuthUser {
  _id: string;
  userId: string;
  email: string;
  role: 'user' | 'admin';
  status: string;
  accountStatus?: string;
  lockUntil?: Date | string | null;
  accountLockedReason?: string | null;
  flags?: {
    isDeleted?: boolean;
  };
  region?: string;
}

// TTL configs (seconds)
const USER_AUTH_TTL_SECONDS = parseInt(process.env['AUTH_USER_CACHE_TTL_SECONDS'] || '300', 10); // 5 min max
const SESSION_DEBOUNCE_TTL_SECONDS = parseInt(process.env['AUTH_SESSION_DEBOUNCE_SECONDS'] || '300', 10); // 5 min debounce
const SESSION_VALIDITY_TTL_SECONDS = parseInt(process.env['AUTH_SESSION_VALIDITY_TTL_SECONDS'] || '60', 10); // 60s max per strict cache rule
const DOMAIN = 'auth_user';
const SESSION_DOMAIN = 'auth_session';

/**
 * Get cached user authentication state
 */
export async function getCachedAuthUser(userId: string): Promise<CachedAuthUser | null> {
  const key = buildKey(DOMAIN, userId);
  return CacheHelper.get<CachedAuthUser>(key, DOMAIN);
}

/**
 * Cache user authentication state (strictly non-sensitive fields only)
 */
export async function setCachedAuthUser(userId: string, user: CachedAuthUser): Promise<void> {
  const key = buildKey(DOMAIN, userId);
  // Sanitize to guarantee no sensitive data is cached
  const cleanPayload: CachedAuthUser = {
    _id: String(user._id),
    userId: String(user.userId),
    email: String(user.email),
    role: (user.role as 'user' | 'admin') || 'user',
    status: String(user.status || 'active'),
    accountStatus: user.accountStatus ? String(user.accountStatus) : undefined,
    lockUntil: user.lockUntil ? (user.lockUntil instanceof Date ? user.lockUntil.toISOString() : user.lockUntil) : null,
    accountLockedReason: user.accountLockedReason ? String(user.accountLockedReason) : null,
    flags: user.flags ? { isDeleted: !!user.flags.isDeleted } : undefined,
    region: user.region ? String(user.region) : undefined,
  };

  await CacheHelper.set(key, cleanPayload, {
    ttlSeconds: USER_AUTH_TTL_SECONDS,
    domain: DOMAIN,
  });
}

/**
 * Invalidate user authentication cache immediately
 * Called on: ban, deactivate, delete, role change, credential change, password change, logout-all
 */
export async function invalidateUserAuthCache(userId: string): Promise<void> {
  if (!userId) return;
  const key = buildKey(DOMAIN, userId);
  try {
    await CacheHelper.del(key, DOMAIN);
    LoggerUtil.debug(`[AuthCache] Invalidated user auth cache for ${userId}`);
  } catch (error: any) {
    LoggerUtil.warn(`[AuthCache] Failed to invalidate user auth cache for ${userId}: ${error.message}`);
  }
}

/**
 * Attempt to acquire session activity debounce guard.
 * Returns true if guard was acquired (meaning MongoDB SHOULD be updated).
 * Returns false if guard already exists (meaning MongoDB write should be SKIPPED).
 */
export async function acquireSessionActivityGuard(
  sessionId: string,
  ttlSeconds = SESSION_DEBOUNCE_TTL_SECONDS
): Promise<boolean> {
  if (!sessionId) return false;
  if (!isDomainEnabled(SESSION_DOMAIN)) return true; // Fail-open to DB write when cache domain disabled
  const key = buildKey(SESSION_DOMAIN, `guard:${sessionId}`);
  const client = getRedisClient();
  const effectiveTTL = applyJitter(ttlSeconds);

  try {
    // SET key 1 EX <ttl> NX
    const result = await client.set(key, '1', 'EX', effectiveTTL, 'NX');
    return result === 'OK';
  } catch (error: any) {
    LoggerUtil.warn(`[AuthCache] Error checking session activity guard: ${error.message}`);
    // On Redis error, fail-safe to true so MongoDB write still happens
    return true;
  }
}

/**
 * Check if session active state is cached as valid
 * Returns true if cached valid, false if cached invalid, null if not cached
 */
export async function isSessionValidCached(sessionId: string): Promise<boolean | null> {
  if (!sessionId) return null;
  const key = buildKey(SESSION_DOMAIN, `valid:${sessionId}`);
  const val = await CacheHelper.get<number>(key, SESSION_DOMAIN);
  if (val === 1) return true;
  if (val === 0) return false;
  return null;
}

/**
 * Cache session validity state (strictly 60s default TTL)
 */
export async function setSessionValidCached(
  sessionId: string,
  isValid: boolean,
  ttlSeconds = SESSION_VALIDITY_TTL_SECONDS
): Promise<void> {
  if (!sessionId) return;
  const key = buildKey(SESSION_DOMAIN, `valid:${sessionId}`);
  await CacheHelper.set(key, isValid ? 1 : 0, {
    ttlSeconds,
    domain: SESSION_DOMAIN,
  });
}

/**
 * Invalidate session cache and clear debounce guard immediately
 * Called on: session termination, logout, revoke
 */
export async function invalidateSessionCache(sessionId: string): Promise<void> {
  if (!sessionId) return;
  const validKey = buildKey(SESSION_DOMAIN, `valid:${sessionId}`);
  const guardKey = buildKey(SESSION_DOMAIN, `guard:${sessionId}`);
  try {
    await CacheHelper.del([validKey, guardKey], SESSION_DOMAIN);
    LoggerUtil.debug(`[AuthCache] Invalidated session cache for ${sessionId}`);
  } catch (error: any) {
    LoggerUtil.warn(`[AuthCache] Failed to invalidate session cache for ${sessionId}: ${error.message}`);
  }
}

/**
 * Invalidate all auth user caches via SCAN
 * Used when bulk operations (updateMany/bulkWrite) affect users without identifiable userIds
 */
export async function invalidateAllAuthUserCacheByScan(): Promise<number> {
  const pattern = buildPattern(DOMAIN, '*');
  try {
    const deleted = await CacheHelper.delByPattern(pattern, DOMAIN);
    LoggerUtil.info(`[AuthCache] Invalidated ${deleted} auth user keys by SCAN`);
    return deleted;
  } catch (error: any) {
    LoggerUtil.warn(`[AuthCache] Failed to invalidate auth user keys by SCAN: ${error.message}`);
    return 0;
  }
}

/**
 * Invalidate all session caches (validity + guards) via SCAN
 * Used when bulk operations (updateMany/bulkWrite) affect sessions without identifiable sessionIds
 */
export async function invalidateAllSessionCacheByScan(): Promise<number> {
  const pattern = buildPattern(SESSION_DOMAIN, '*');
  try {
    const deleted = await CacheHelper.delByPattern(pattern, SESSION_DOMAIN);
    LoggerUtil.info(`[AuthCache] Invalidated ${deleted} auth session keys by SCAN`);
    return deleted;
  } catch (error: any) {
    LoggerUtil.warn(`[AuthCache] Failed to invalidate auth session keys by SCAN: ${error.message}`);
    return 0;
  }
}
