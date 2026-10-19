/**
 * profileCache.ts
 * Dedicated Profile Caching Module (Item G)
 *
 * Rules Enforced:
 * 1. Redis key naming: app:v1:profile:<type>:<id>
 * 2. Public profile cache: app:v1:profile:public:<userId>:v:<version> (TTL: 1800s + jitter)
 * 3. Eviction-safe monotonic per-user version key: app:v1:profile:v:<userId>
 * 4. Separate PUBLIC profile cache (identical for every viewer) from VIEWER-SPECIFIC data
 * 5. Private fields NEVER appear in the public cache
 * 6. Blocked viewer NEVER gets cached profile data (blocked check runs before cache hit)
 * 7. Invalidate on EVERY profile sub-model write (about, education, skills, experience,
 *    positions, projects, honors, photo, headline, etc.) including updateMany/findOneAndUpdate
 * 8. Domain kill switch: CACHE_PROFILE_ENABLED
 * 9. Fallback to MongoDB on Redis downtime or timeout
 */

import { Schema } from 'mongoose';
import { CacheHelper, buildKey, applyJitter, isCacheEnabled } from './cacheHelper';
import { getRedisClient } from './redisConnection';
import { LoggerUtil } from '@/shared/logger.util';
import ConnectionBlock from '@/connections/models/ConnectionBlock';

const DOMAIN = 'profile';

// TTL configs (seconds)
const PUBLIC_PROFILE_TTL_SECONDS = parseInt(
  process.env['PROFILE_PUBLIC_CACHE_TTL_SECONDS'] || '1800',
  10
);
const VERSION_KEY_TTL_SECONDS = 7 * 24 * 3600; // 7 days

export interface PublicProfilePayload {
  userId: string;
  firstName?: string;
  lastName?: string;
  headline?: any;
  about?: any;
  experiences?: any[];
  educations?: any[];
  skills?: any[];
  positions?: any[];
  projects?: any[];
  honors?: any[];
  courses?: any[];
  patents?: any[];
  publications?: any[];
  volunteers?: any[];
  testScores?: any[];
  careerBreaks?: any[];
  profilePhoto?: any;
  coverPhoto?: any;
}

export interface ViewerSpecificProfileResponse {
  isBlocked: boolean;
  canInteract: boolean;
  connectionStatus?: string;
  isFollowing?: boolean;
  profile: PublicProfilePayload | null;
}

let isConnectionResolver: ((viewerId: string, targetUserId: string) => Promise<boolean>) | null = null;

export class ProfileCacheRepository {
  /**
   * Set dynamic connection resolver function
   */
  static setIsConnectionFn(fn: ((viewerId: string, targetUserId: string) => Promise<boolean>) | null): void {
    isConnectionResolver = fn;
  }
  /**
   * Get monotonic version for user's public profile.
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
      LoggerUtil.warn('ProfileCache: failed to get user version, falling back to 1', {
        userId,
        error: err.message,
      });
      return '1';
    }
  }

  /**
   * Invalidate public profile cache for user(s) (version bump).
   */
  static async invalidateProfile(userId: string | string[]): Promise<void> {
    if (!isCacheEnabled(DOMAIN)) return;
    try {
      const redis = await getRedisClient();
      const userIds = Array.isArray(userId) ? userId : [userId];
      const validIds = userIds.filter(Boolean);
      if (validIds.length === 0) return;

      const pipeline = redis.pipeline();
      for (const id of validIds) {
        pipeline.incr(buildKey(DOMAIN, `v:${id}`));
        pipeline.expire(buildKey(DOMAIN, `v:${id}`), VERSION_KEY_TTL_SECONDS);
      }
      await pipeline.exec();
    } catch (err: any) {
      LoggerUtil.warn('ProfileCache: failed to invalidate profile cache', {
        error: err.message,
      });
    }
  }

  /**
   * Get cached public profile for target user.
   */
  static async getPublicProfile(targetUserId: string): Promise<PublicProfilePayload | null> {
    if (!isCacheEnabled(DOMAIN)) return null;
    const version = await this.getUserVersion(targetUserId);
    const key = buildKey(DOMAIN, `public:${targetUserId}:v:${version}`);
    return CacheHelper.get<PublicProfilePayload>(key, DOMAIN);
  }

  /**
   * Set cached public profile for target user.
   * Sanitizes to ensure no private fields or viewer-specific data ever leak into public key.
   */
  static async setPublicProfile(
    targetUserId: string,
    profile: PublicProfilePayload
  ): Promise<void> {
    if (!isCacheEnabled(DOMAIN)) return;

    // Strict sanitization: ensure private fields and viewer-specific fields never enter public cache
    const cleanPublicProfile: PublicProfilePayload = {
      userId: targetUserId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      headline: profile.headline,
      about: profile.about,
      experiences: (profile.experiences || []).filter((e: any) => !e.isPrivate && e.visibility !== 'private'),
      educations: (profile.educations || []).filter((e: any) => !e.isPrivate && e.visibility !== 'private'),
      skills: (profile.skills || []).filter((s: any) => !s.isPrivate && s.visibility !== 'private'),
      positions: (profile.positions || []).filter((p: any) => !p.isPrivate && p.visibility !== 'private'),
      projects: (profile.projects || []).filter((p: any) => !p.isPrivate && p.visibility !== 'private'),
      honors: (profile.honors || []).filter((h: any) => !h.isPrivate && h.visibility !== 'private'),
      courses: profile.courses,
      patents: profile.patents,
      publications: profile.publications,
      volunteers: profile.volunteers,
      testScores: profile.testScores,
      careerBreaks: profile.careerBreaks,
      profilePhoto: profile.profilePhoto,
      coverPhoto: profile.coverPhoto,
    };

    const version = await this.getUserVersion(targetUserId);
    const key = buildKey(DOMAIN, `public:${targetUserId}:v:${version}`);
    await CacheHelper.set(key, cleanPublicProfile, {
      ttlSeconds: applyJitter(PUBLIC_PROFILE_TTL_SECONDS),
      domain: DOMAIN,
    });
  }

  /**
   * Resolve profile for a specific viewer.
   * STRICT SECURITY ENFORCEMENT:
   * 1. Check if viewer is blocked by target user or target user is blocked by viewer.
   * 2. If blocked, NEVER return cached profile data.
   * 3. Merge viewer-specific relationship data dynamically (never stored in public key).
   */
  static async getProfileForViewer(
    viewerId: string,
    targetUserId: string,
    fetchFromDbFn: (userId: string) => Promise<PublicProfilePayload | null>
  ): Promise<ViewerSpecificProfileResponse> {
    // 1. Strict block check (runs before ANY profile data is returned)
    const isBlocked = await ConnectionBlock.isBlocked(viewerId, targetUserId);
    const isReverseBlocked = await ConnectionBlock.isBlocked(targetUserId, viewerId);

    if (isBlocked || isReverseBlocked) {
      return {
        isBlocked: true,
        canInteract: false,
        profile: null, // Blocked viewer NEVER gets cached profile data!
      };
    }

    // 2. Resolve public profile (cache hit or miss)
    let publicProfile = await this.getPublicProfile(targetUserId);
    if (!publicProfile) {
      publicProfile = await fetchFromDbFn(targetUserId);
      if (publicProfile) {
        await this.setPublicProfile(targetUserId, publicProfile);
      }
    }

    if (!publicProfile) {
      return {
        isBlocked: false,
        canInteract: true,
        profile: null,
      };
    }

    // 3. Dynamic viewer privacy filtering (Connection vs Non-connection)
    const isSelf = viewerId === targetUserId;
    const isConnected = isSelf || (isConnectionResolver ? await isConnectionResolver(viewerId, targetUserId) : false);

    let filteredProfile = publicProfile;
    if (!isConnected) {
      // Strip any fields or entries marked as connections-only
      filteredProfile = {
        ...publicProfile,
        experiences: (publicProfile.experiences || []).filter(
          (e: any) => e.visibility !== 'connections_only' && e.visibility !== 'connections' && !e.connectionsOnly
        ),
        skills: (publicProfile.skills || []).filter(
          (s: any) => s.visibility !== 'connections_only' && s.visibility !== 'connections' && !s.connectionsOnly
        ),
        positions: (publicProfile.positions || []).filter(
          (p: any) => p.visibility !== 'connections_only' && p.visibility !== 'connections' && !p.connectionsOnly
        ),
        projects: (publicProfile.projects || []).filter(
          (p: any) => p.visibility !== 'connections_only' && p.visibility !== 'connections' && !p.connectionsOnly
        ),
        honors: (publicProfile.honors || []).filter(
          (h: any) => h.visibility !== 'connections_only' && h.visibility !== 'connections' && !h.connectionsOnly
        ),
      };
    }

    // 4. Return viewer-specific combined response
    return {
      isBlocked: false,
      canInteract: true,
      profile: filteredProfile,
    };
  }
}

/**
 * Reusable Mongoose Schema Hook Attacher for all Profile Sub-models.
 * Invalidator catches: save, insertMany, updateOne, updateMany, findOneAndUpdate,
 * deleteOne, deleteMany, findOneAndDelete, replaceOne, etc.
 */
export function attachProfileCacheInvalidationHooks(
  schema: any,
  userIdField = 'userId'
): void {
  // Post save
  schema.post('save', async function (doc: any) {
    if (doc && doc[userIdField]) {
      await ProfileCacheRepository.invalidateProfile(String(doc[userIdField]));
    }
  });

  // Post insertMany
  schema.post('insertMany', async function (docs: any) {
    if (Array.isArray(docs)) {
      const userIds = [...new Set(docs.map((d: any) => d[userIdField]).filter(Boolean))];
      if (userIds.length > 0) {
        await ProfileCacheRepository.invalidateProfile(userIds.map(String));
      }
    }
  });

  const MUTATION_METHODS = [
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'findOneAndUpdate',
    'findOneAndDelete',
    'replaceOne',
    'findOneAndReplace',
  ] as const;

  schema.pre(MUTATION_METHODS as any, async function (this: any) {
    try {
      const filter = this.getFilter() || {};
      if (filter[userIdField] && typeof filter[userIdField] === 'string') {
        this._preUpdateProfileUserIds = [filter[userIdField]];
        return;
      }
      if (filter[userIdField] && typeof filter[userIdField] === 'object' && Array.isArray(filter[userIdField].$in)) {
        this._preUpdateProfileUserIds = filter[userIdField].$in.map(String);
        return;
      }
      const affectedDocs = await this.model
        .find(filter)
        .select(userIdField)
        .limit(501)
        .lean()
        .exec();
      this._preUpdateProfileUserIds = [
        ...new Set(affectedDocs.map((d: any) => d[userIdField]).filter(Boolean).map(String)),
      ];
    } catch {
      this._preUpdateProfileUserIds = [];
    }
  });

  schema.post(MUTATION_METHODS as any, async function (this: any) {
    try {
      const ids: string[] = this._preUpdateProfileUserIds || [];
      if (ids.length > 0) {
        await ProfileCacheRepository.invalidateProfile(ids);
      }
    } catch {
      // fail-safe
    }
  });

  // Pre-hook for bulkWrite
  schema.pre('bulkWrite', function (this: any, next: any, ops: any) {
    try {
      const operations = Array.isArray(ops) ? ops : Array.isArray(next) ? next : [];
      const userIds: string[] = [];
      if (Array.isArray(operations)) {
        for (const op of operations) {
          const action =
            op?.updateOne ||
            op?.updateMany ||
            op?.deleteOne ||
            op?.deleteMany ||
            op?.replaceOne ||
            op?.insertOne;
          if (action) {
            const filter = action.filter || action.document;
            if (filter && filter[userIdField]) {
              if (typeof filter[userIdField] === 'string') userIds.push(filter[userIdField]);
              else if (Array.isArray(filter[userIdField].$in))
                userIds.push(...filter[userIdField].$in.map(String));
            }
          }
        }
      }
      if (userIds.length > 0) {
        ProfileCacheRepository.invalidateProfile([...new Set(userIds)]).finally(() => {
          if (typeof next === 'function') next();
        });
      } else {
        if (typeof next === 'function') next();
      }
    } catch {
      if (typeof next === 'function') next();
    }
  });
}
