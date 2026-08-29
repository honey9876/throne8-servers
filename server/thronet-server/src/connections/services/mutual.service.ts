// src/services/mutualService.ts
/**
 * Mutual Service (MongoDB-only version)
 * -----------------------------------------------------------------------
 * Neo4j completely hata diya gaya hai. Ab saare mutual-connection features
 * MongoDB ke Connection model (self-join $lookup / $graphLookup) aur Redis
 * cache pe chal rahe hain.
 *
 * Neo4j wala purana code neeche bottom me commented reference ke liye chhod
 * diya hai — agar future me wapas chahiye to uncomment kar sakte ho.
 * -----------------------------------------------------------------------
 */

import logger from '@/shared/logger.util';
import { IMutualConnection, MutualQueryParams } from '../types/network.types';
import environmentConfig from '@/config/environment/environment';
import { mutualAlgorithms } from '../algorithms/mutualAlgorithms';
import { getRedisClient } from '@/services/redis.service';
import { User } from '@/shared/models/index.models';
import Connection from '@/connections/models/Connection'; // <-- tera existing MongoDB Connection model

interface PublicLogMetadata {
  userId?: string;
  userId1?: string;
  count?: number;
  error?: string;
  cacheKey?: string;
  keysCount?: number;
  pairCount?: number;
  [key: string]: any;
}

interface EnvironmentConfig {
  MUTUAL_CONNECTIONS_CACHE_TTL: number;
  [key: string]: any;
}

const config = environmentConfig as EnvironmentConfig;

export class MutualService {
  private redisClient: any;

  constructor() {
    this.redisClient = null;
  }

  /**
   * Redis client init. MongoDB connection already app.ts me establish hoti hai,
   * isliye yaha sirf Redis lazy-init karna hai.
   */
  async initialize(): Promise<void> {
    try {
      this.redisClient = await getRedisClient();
      logger.info('MutualService initialized (MongoDB + Redis, no Neo4j)');
    } catch (error: any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
      };
      logger.warn('Redis unavailable for MutualService — proceeding without cache', logMetadata);
      this.redisClient = null;
    }
  }

  private async getFromCache(key: string): Promise<any | null> {
    if (!this.redisClient) return null;
    try {
      const cached = await this.redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  private async validateUser(userId: string): Promise<any> {
    const user = await User.findOne({ userId }).lean().select('_id status accountStatus');
    if (!user) throw new Error('User not found');
    if ((user as any).status !== 'active') throw new Error('User is not active');
    if ((user as any).accountStatus && (user as any).accountStatus !== 'active') {
      throw new Error('User account is locked or suspended');
    }
    return user;
  }

  /**
   * Feature 1: Find mutual connections between two users
   * MongoDB $lookup self-join se compute hota hai (Connection.findMutualConnections)
   */
  async findMutualConnections(
    userId1: string,
    userId2: string,
    params: MutualQueryParams = {}
  ): Promise<IMutualConnection[]> {
    try {
      await Promise.all([this.validateUser(userId1), this.validateUser(userId2)]);

      const cacheKey = `mutuals:${userId1}:${userId2}:${JSON.stringify(params)}`;
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        logger.debug('Mutual connections from cache', { cacheKey } as unknown as PublicLogMetadata);
        return cached;
      }

      const limit = params.limit || 20;
      const offset = params.offset || 0;

      // Connection model ka static method (schema me already defined hai)
      const rawMutuals = await (Connection as any).findMutualConnections(userId1, userId2, limit + offset);
      const paged = rawMutuals.slice(offset, offset + limit);

      // Har mutual-record se actual "connected user" nikalo (userId1 ke perspective se)
      const mutualUserIds: string[] = paged.map((conn: any) =>
        conn.fromUserId === userId1 ? conn.toUserId : conn.fromUserId
      );

      let mutuals: IMutualConnection[] = mutualUserIds.map((id) => ({
        userId: id,
        name: '',
        headline: '',
        mutualCount: 1,
        connectionStrength: 0,
        profileComplete: false,
      }));

      mutuals = await this.enrichWithUserProfiles(mutuals);

      await this.cacheMutualData(cacheKey, mutuals, config.MUTUAL_CONNECTIONS_CACHE_TTL || 600);

      logger.info('Mutual connections found', {
        userId1,
        count: mutuals.length,
        mode: 'mongodb',
      } as unknown as PublicLogMetadata);

      return mutuals;
    } catch (error: any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2,
      };
      logger.error('Error finding mutual connections', logMetadata);
      throw new Error(`Failed to find mutual connections: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Feature 2: Calculate mutual connection count
   */
  async calculateMutualCount(userId1: string, userId2: string): Promise<number> {
    try {
      await Promise.all([this.validateUser(userId1), this.validateUser(userId2)]);

      const cacheKey = `mutual_count:${userId1}:${userId2}`;
      const cachedCount = await this.getFromCache(cacheKey);
      if (cachedCount !== null && cachedCount !== undefined) {
        return typeof cachedCount === 'number' ? cachedCount : parseInt(cachedCount);
      }

      // ✅ CHANGED — ab sirf aggregation-based count aata hai,
      // 1000 poore documents pull nahi hote
      const count = await (Connection as any).countMutualConnections(userId1, userId2);

      if (this.redisClient) {
        const ttl = Math.floor((config.MUTUAL_CONNECTIONS_CACHE_TTL || 600) / 2);
        await this.redisClient.setex(cacheKey, ttl, count.toString());
      }

      logger.debug('Mutual count calculated', { userId1, userId2, count, mode: 'mongodb' });
      return count;
    } catch (error: any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2,
      };
      logger.error('Error calculating mutual count', logMetadata);
      return 0;
    }
  }
  /**
   * Feature 3: Get mutual suggestions
   * (Connection.getConnectionRecommendations already MongoDB-based hai, wahi reuse)
   */
  async getMutualSuggestions(userId: string, limit: number = 10): Promise<IMutualConnection[]> {
    try {
      await this.validateUser(userId);

      const recommendedIds: string[] = await (Connection as any).getConnectionRecommendations(userId, limit);

      const suggestions: IMutualConnection[] = recommendedIds.map((id) => ({
        userId: id,
        name: '',
        headline: '',
        mutualCount: 0,
        connectionStrength: 0,
        profileComplete: false,
      }));

      return await this.enrichWithUserProfiles(suggestions);
    } catch (error: any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId,
      };
      logger.error('Error getting mutual suggestions', logMetadata);
      throw error;
    }
  }

  /**
   * Feature 4: Get extended (2nd/3rd degree) mutuals
   * MongoDB me true graph traversal costly hoti hai, isliye simple BFS:
   * userId1 ke connections ke connections nikaal ke userId2 tak path dhoondo.
   * Depth chhoti (2-3) hone ki wajah se yeh practically theek chalega.
   */
  async getExtendedMutuals(userId1: string, userId2: string, degree: 2 | 3 = 2): Promise<IMutualConnection[]> {
    try {
      await Promise.all([this.validateUser(userId1), this.validateUser(userId2)]);

      const getDirectConnections = async (uid: string): Promise<string[]> => {
        const result = await (Connection as any).findUserConnectionsPaginated(uid, {
          status: 'active',
          limit: 200,
        });
        return result.data.map((c: any) => (c.fromUserId === uid ? c.toUserId : c.fromUserId));
      };

      let frontier = new Set<string>([userId1]);
      let visited = new Set<string>([userId1]);
      let found: Set<string> = new Set();

      for (let d = 0; d < degree; d++) {
        const nextFrontier = new Set<string>();
        for (const uid of frontier) {
          const conns = await getDirectConnections(uid);
          for (const c of conns) {
            if (!visited.has(c)) {
              visited.add(c);
              nextFrontier.add(c);
            }
            if (c === userId2) found.add(uid);
          }
        }
        frontier = nextFrontier;
        if (frontier.size === 0) break;
      }

      const mutuals: IMutualConnection[] = Array.from(found).map((id) => ({
        userId: id,
        name: '',
        headline: '',
        mutualCount: 0,
        connectionStrength: 0,
        profileComplete: false,
      }));

      return await this.enrichWithUserProfiles(mutuals);
    } catch (error: any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2,
      };
      logger.error('Error getting extended mutuals', logMetadata);
      throw error;
    }
  }

  /**
   * Feature 5: Cache mutual data in Redis
   */
  private async cacheMutualData(key: string, data: any, ttl: number = 600): Promise<void> {
    try {
      if (this.redisClient) {
        await this.redisClient.setex(key, ttl, JSON.stringify(data));
      }
    } catch (error: any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        cacheKey: key,
      };
      logger.error('Error caching mutual data', logMetadata);
    }
  }

  /**
   * Feature 6: Invalidate mutual cache
   */
  async invalidateMutualCache(userId: string): Promise<void> {
    try {
      if (!this.redisClient) return;
      const keys = await this.redisClient.keys(`mutuals:${userId}:*`);
      if (keys.length > 0) {
        await this.redisClient.del(keys);
        logger.info('Mutual cache invalidated', { userId, keysCount: keys.length } as unknown as PublicLogMetadata);
      }
    } catch (error: any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId,
      };
      logger.error('Error invalidating mutual cache', logMetadata);
    }
  }

  /**
   * Feature 7: Enrich mutuals with user profiles (MongoDB User model)
   */
  private async enrichWithUserProfiles(mutuals: IMutualConnection[]): Promise<IMutualConnection[]> {
    try {
      const userIds = mutuals.map((m) => m.userId);
      if (userIds.length === 0) return mutuals;

      const users = await User.find({ userId: { $in: userIds } })
        .lean()
        .select('userId firstName lastName headline avatar company');

      const userMap = new Map(users.map((u: any) => [u.userId, u]));

      return mutuals.map((mutual) => {
        const profile: any = userMap.get(mutual.userId);
        return {
          ...mutual,
          name: profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : mutual.name || '',
          headline: profile?.headline || mutual.headline || '',
          avatar: profile?.avatar || '',
          company: profile?.company || '',
          profileComplete: Boolean(profile?.firstName && profile?.headline),
        };
      });
    } catch (error: any) {
      logger.error('Error enriching user profiles', {
        error: error instanceof Error ? error.message : String(error),
      } as unknown as PublicLogMetadata);
      return mutuals;
    }
  }

  /**
   * Feature 8: Calculate mutual strength (pure algorithm, no DB dependency)
   */
  async calculateMutualStrength(userId1: string, userId2: string, mutuals: IMutualConnection[]): Promise<number> {
    try {
      return mutualAlgorithms.calculateStrength(userId1, userId2, mutuals);
    } catch (error: any) {
      logger.error('Error calculating mutual strength', {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2,
      } as unknown as PublicLogMetadata);
      return 0;
    }
  }

  /**
   * Feature 9: Find common connections using set intersection
   */
  async findCommonConnections(userConnections1: string[], userConnections2: string[]): Promise<string[]> {
    try {
      return mutualAlgorithms.findIntersection(userConnections1, userConnections2);
    } catch (error: any) {
      logger.error('Error finding common connections', {
        error: error instanceof Error ? error.message : String(error),
      } as unknown as PublicLogMetadata);
      return [];
    }
  }

  /**
   * Feature 10: Get mutual network metrics
   */
  async getMutualNetworkMetrics(
    userId1: string,
    userId2: string
  ): Promise<{ mutualCount: number; avgDegree: number; totalNetworkSize: number }> {
    try {
      const mutualCount = await this.calculateMutualCount(userId1, userId2);
      const mutuals = await this.findMutualConnections(userId1, userId2, { limit: 100 });
      const avgDegree = mutuals.length > 0
        ? mutuals.reduce((sum, m) => sum + (m.mutualCount || 0), 0) / mutuals.length
        : 0;

      return { mutualCount, avgDegree, totalNetworkSize: mutualCount * 2 };
    } catch (error: any) {
      logger.error('Error getting mutual network metrics', {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2,
      } as unknown as PublicLogMetadata);
      return { mutualCount: 0, avgDegree: 0, totalNetworkSize: 0 };
    }
  }

  /**
   * Feature 11: Handle bulk mutual queries
   */
  async handleBulkMutualQueries(pairs: [string, string][]): Promise<Map<string, IMutualConnection[]>> {
    const results = new Map<string, IMutualConnection[]>();

    const settled = await Promise.allSettled(
      pairs.map(async ([userId1, userId2]) => {
        const key = `${userId1}-${userId2}`;
        const mutuals = await this.findMutualConnections(userId1, userId2);
        return { key, mutuals };
      })
    );

    settled.forEach((outcome, index) => {
      const [userId1, userId2] = pairs[index];
      const key = `${userId1}-${userId2}`;
      if (outcome.status === 'fulfilled') {
        results.set(outcome.value.key, outcome.value.mutuals);
      } else {
        logger.warn('Skipping failed pair in bulk mutual query', {
          key,
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        });
        results.set(key, []);
      }
    });

    logger.info('Bulk mutual queries completed', {
      pairCount: pairs.length,
      succeeded: settled.filter((s) => s.status === 'fulfilled').length,
    });
    return results;
  }

  /**
   * Feature 12: Search mutual connections with filters
   */
  async findMutualConnectionsWithSearch(userId1: string, userId2: string, searchQuery: string): Promise<IMutualConnection[]> {
    try {
      let mutuals = await this.findMutualConnections(userId1, userId2);
      mutuals = mutualAlgorithms.filterBySearch(mutuals, searchQuery);
      return mutuals;
    } catch (error: any) {
      logger.error('Error searching mutual connections', {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2,
      } as unknown as PublicLogMetadata);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async close(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch {
        // ignore
      }
    }
  }
}

export const mutualService = new MutualService();
export default mutualService;

/* -----------------------------------------------------------------------
 * NEO4J LEGACY CODE (COMMENTED OUT — MongoDB pe shift ho gaya hai)
 * -----------------------------------------------------------------------
 *
 * import { getNeo4jDriver } from '@/config/neo4j/neo4j';
 *
 * interface Neo4jSession {
 *   run(query: string, params: any): Promise<any>;
 *   close(): Promise<void>;
 * }
 *
 * async function createNeo4jSession(): Promise<Neo4jSession> {
 *   const driver = await getNeo4jDriver();
 *   return driver.session();
 * }
 *
 * // Neo4j Cypher query jo pehle findMutualConnections me use hoti thi:
 * // MATCH (u1:Person {id: $userId1})-[:CONNECTED_TO {status:'accepted'}]->(mutual:Person)
 * //       <-[:CONNECTED_TO {status:'accepted'}]-(u2:Person {id: $userId2})
 * // RETURN mutual.id, mutual.name, count(mutual)
 *
 * -----------------------------------------------------------------------
 */