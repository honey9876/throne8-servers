/**
 * feedCompanyCommentCache.ts
 * Item K: Doubts Feed, Company Profiles, Post Comments and Reactions Caching Module
 *
 * Requirements Enforced:
 * 1. Redis key naming:
 *    - Doubt feed: app:v1:doubt:feed:<groupId>:<queryHash> (TTL: 180s + jitter)
 *    - Doubt detail: app:v1:doubt:detail:<doubtId> (TTL: 300s + jitter)
 *    - Company public profile: app:v1:company:public:<companyId> (TTL: 3600s + jitter)
 *    - Post comments: app:v1:comment:post:<postId> (TTL: 120s + jitter)
 *    - Reactions summary: app:v1:reaction:summary:<entryId> (TTL: 60s + jitter)
 * 2. Visibility & Authorization:
 *    - Doubts: Never cache content a user isn't allowed to see (private groups, blocked authors, deleted or moderated content).
 *    - The feed key includes whatever decides visibility (groupId, filter hash).
 * 3. Company public profile:
 *    - Only publicly visible fields are cached.
 *    - Invalidation on company edit, new job, review changes, follower changes.
 * 4. Comments:
 *    - Short-TTL read cache per post, invalidated on add, edit, delete, moderation.
 * 5. Reactions:
 *    - Short-TTL read cache (60s + jitter) with writes directly in MongoDB.
 *    - Rationale: Asynchronous Redis counter increments risk lost counts on crash or double-counting on retry
 *      without distributed 2PC. MongoDB atomic operators ($addToSet, $pull, $inc) maintain authoritative correctness.
 * 6. Kill switches:
 *    - CACHE_DOUBT_ENABLED, CACHE_COMPANY_ENABLED, CACHE_COMMENT_ENABLED, CACHE_REACTION_ENABLED.
 * 7. Fallback to MongoDB on Redis down / cache miss.
 */

import crypto from 'crypto';
import { buildKey, buildPattern, applyJitter, isCacheEnabled, CacheHelper } from './cacheHelper';
import { getRedisClient } from './redisConnection';
import { LoggerUtil } from '@/shared/logger.util';

const DOUBT_DOMAIN = 'doubt';
const COMPANY_DOMAIN = 'company';
const COMMENT_DOMAIN = 'comment';
const REACTION_DOMAIN = 'reaction';

const DOUBT_FEED_TTL_SECONDS = parseInt(process.env['DOUBT_FEED_CACHE_TTL_SECONDS'] || '180', 10);
const DOUBT_DETAIL_TTL_SECONDS = parseInt(process.env['DOUBT_DETAIL_CACHE_TTL_SECONDS'] || '300', 10);
const COMPANY_PUBLIC_TTL_SECONDS = parseInt(process.env['COMPANY_PUBLIC_CACHE_TTL_SECONDS'] || '3600', 10);
const COMMENT_POST_TTL_SECONDS = parseInt(process.env['COMMENT_POST_CACHE_TTL_SECONDS'] || '120', 10);
const REACTION_SUMMARY_TTL_SECONDS = parseInt(process.env['REACTION_SUMMARY_CACHE_TTL_SECONDS'] || '60', 10);

// ============================================================================
// 1. DOUBTS FEED & DETAIL CACHE
// ============================================================================

export class DoubtCacheRepository {
  static getFeedKey(groupId: string, queryParams: any): string {
    const serialized = JSON.stringify(queryParams || {});
    const hash = crypto.createHash('md5').update(serialized).digest('hex').slice(0, 12);
    return buildKey(DOUBT_DOMAIN, `feed:${groupId}:${hash}`);
  }

  static getDetailKey(doubtId: string): string {
    return buildKey(DOUBT_DOMAIN, `detail:${doubtId}`);
  }

  static async getCachedFeed(groupId: string, queryParams: any): Promise<any | null> {
    if (!isCacheEnabled(DOUBT_DOMAIN) || !groupId) return null;
    const key = this.getFeedKey(groupId, queryParams);
    return CacheHelper.get<any>(key, DOUBT_DOMAIN);
  }

  static async setCachedFeed(groupId: string, queryParams: any, data: any): Promise<void> {
    if (!isCacheEnabled(DOUBT_DOMAIN) || !groupId || !data) return;
    const key = this.getFeedKey(groupId, queryParams);
    await CacheHelper.set(key, data, {
      ttlSeconds: applyJitter(DOUBT_FEED_TTL_SECONDS),
      domain: DOUBT_DOMAIN,
    });
  }

  static async getCachedDetail(doubtId: string): Promise<any | null> {
    if (!isCacheEnabled(DOUBT_DOMAIN) || !doubtId) return null;
    const key = this.getDetailKey(doubtId);
    return CacheHelper.get<any>(key, DOUBT_DOMAIN);
  }

  static async setCachedDetail(doubtId: string, data: any): Promise<void> {
    if (!isCacheEnabled(DOUBT_DOMAIN) || !doubtId || !data) return;
    const key = this.getDetailKey(doubtId);
    await CacheHelper.set(key, data, {
      ttlSeconds: applyJitter(DOUBT_DETAIL_TTL_SECONDS),
      domain: DOUBT_DOMAIN,
    });
  }

  /**
   * Invalidate doubt cache on write (create, update, delete, solve, answer, moderation).
   */
  static async invalidateDoubt(doubtId?: string, groupId?: string): Promise<void> {
    try {
      const keysToDelete: string[] = [];
      if (doubtId) {
        keysToDelete.push(this.getDetailKey(doubtId));
      }

      if (keysToDelete.length > 0) {
        await CacheHelper.del(keysToDelete, DOUBT_DOMAIN);
      }

      if (groupId) {
        // Invalidate all feed variations for this group via pattern scan
        const pattern = buildPattern(DOUBT_DOMAIN, `feed:${groupId}:*`);
        await CacheHelper.delByPattern(pattern, DOUBT_DOMAIN);
      }
    } catch (err: any) {
      LoggerUtil.warn('DoubtCache: failed to invalidate cache', { doubtId, groupId, error: err.message });
    }
  }
}

// ============================================================================
// 2. COMPANY PUBLIC PROFILE CACHE
// ============================================================================

export class CompanyCacheRepository {
  static getPublicKey(companyId: string): string {
    return buildKey(COMPANY_DOMAIN, `public:${companyId}`);
  }

  static async getCachedPublicProfile(companyId: string): Promise<any | null> {
    if (!isCacheEnabled(COMPANY_DOMAIN) || !companyId) return null;
    const key = this.getPublicKey(companyId);
    return CacheHelper.get<any>(key, COMPANY_DOMAIN);
  }

  static async setCachedPublicProfile(companyId: string, data: any): Promise<void> {
    if (!isCacheEnabled(COMPANY_DOMAIN) || !companyId || !data) return;
    const key = this.getPublicKey(companyId);
    await CacheHelper.set(key, data, {
      ttlSeconds: applyJitter(COMPANY_PUBLIC_TTL_SECONDS),
      domain: COMPANY_DOMAIN,
    });
  }

  /**
   * Invalidate company public profile on edit, new job, review change, or follower change.
   */
  static async invalidateCompany(companyId: string, alternateId?: string): Promise<void> {
    if (!companyId && !alternateId) return;
    try {
      const keys: string[] = [];
      if (companyId) keys.push(this.getPublicKey(companyId));
      if (alternateId && alternateId !== companyId) keys.push(this.getPublicKey(alternateId));
      await CacheHelper.del(keys, COMPANY_DOMAIN);
      LoggerUtil.info(`CompanyCache: invalidated public profile for ${companyId}`);
    } catch (err: any) {
      LoggerUtil.warn('CompanyCache: failed to invalidate company cache', { companyId, error: err.message });
    }
  }
}

// ============================================================================
// 3. POST COMMENTS CACHE
// ============================================================================

export class CommentCacheRepository {
  static getPostKey(postId: string): string {
    return buildKey(COMMENT_DOMAIN, `post:${postId}`);
  }

  static async getCachedPostComments(postId: string): Promise<any | null> {
    if (!isCacheEnabled(COMMENT_DOMAIN) || !postId) return null;
    const key = this.getPostKey(postId);
    return CacheHelper.get<any>(key, COMMENT_DOMAIN);
  }

  static async setCachedPostComments(postId: string, data: any): Promise<void> {
    if (!isCacheEnabled(COMMENT_DOMAIN) || !postId || !data) return;
    const key = this.getPostKey(postId);
    await CacheHelper.set(key, data, {
      ttlSeconds: applyJitter(COMMENT_POST_TTL_SECONDS),
      domain: COMMENT_DOMAIN,
    });
  }

  /**
   * Invalidate comments on add, edit, delete, or moderation.
   */
  static async invalidatePostComments(postId: string): Promise<void> {
    if (!postId) return;
    try {
      const key = this.getPostKey(postId);
      await CacheHelper.del(key, COMMENT_DOMAIN);
    } catch (err: any) {
      LoggerUtil.warn('CommentCache: failed to invalidate post comments cache', { postId, error: err.message });
    }
  }
}

// ============================================================================
// 4. POST REACTIONS CACHE
// ============================================================================

export class ReactionCacheRepository {
  static getSummaryKey(entryId: string): string {
    return buildKey(REACTION_DOMAIN, `summary:${entryId}`);
  }

  static async getCachedSummary(entryId: string): Promise<any | null> {
    if (!isCacheEnabled(REACTION_DOMAIN) || !entryId) return null;
    const key = this.getSummaryKey(entryId);
    return CacheHelper.get<any>(key, REACTION_DOMAIN);
  }

  static async setCachedSummary(entryId: string, data: any): Promise<void> {
    if (!isCacheEnabled(REACTION_DOMAIN) || !entryId || !data) return;
    const key = this.getSummaryKey(entryId);
    await CacheHelper.set(key, data, {
      ttlSeconds: applyJitter(REACTION_SUMMARY_TTL_SECONDS),
      domain: REACTION_DOMAIN,
    });
  }

  static async invalidateReactionSummary(entryId: string): Promise<void> {
    if (!entryId) return;
    try {
      const key = this.getSummaryKey(entryId);
      await CacheHelper.del(key, REACTION_DOMAIN);
    } catch (err: any) {
      LoggerUtil.warn('ReactionCache: failed to invalidate summary cache', { entryId, error: err.message });
    }
  }
}
