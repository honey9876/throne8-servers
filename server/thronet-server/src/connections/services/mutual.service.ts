// // src/services/mutualService.ts
// /**
//  * Mutual Service
//  * Handles business logic for mutual connections (12 features as per plan).
//  * Uses Neo4j for efficient graph queries (e.g., common neighbors), MongoDB for persistence,
//  * Redis for caching mutual counts/lists, and external user service for profiles.
//  * Integrates algorithms for advanced calculations like similarity scores.
//  * 
//  * Features (12 total):
//  * 1. findMutualConnections - Core mutual finder between two users
//  * 2. calculateMutualCount - Count mutuals (cached)
//  * 3. getMutualSuggestions - Suggest mutuals based on degree/strength
//  * 4. getExtendedMutuals - 2nd/3rd degree mutuals
//  * 5. cacheMutualData - Cache results in Redis
//  * 6. invalidateMutualCache - Clear cache on connection changes
//  * 7. enrichWithUserProfiles - Fetch and add user details to mutuals
//  * 8. calculateMutualStrength - Algorithmic strength score
//  * 9. findCommonConnections - Set intersection for mutuals
//  * 10. getMutualNetworkMetrics - Aggregated metrics (e.g., avg connections)
//  * 11. handleBulkMutualQueries - Batch processing for multiple pairs
//  * 12. integrateWithSearch - Filter mutuals by search criteria
//  * 
//  * Dependencies:
//  * - logger: For audit/performance logs
//  * - Neo4j session: For graph traversal
//  * - cacheService: Redis operations
//  * - userServiceClient: External API for user profiles
//  * - mutualAlgorithms: Math/logic for intersections, scores
//  * - environmentConfig: TTL, limits
//  * - types: IMutualConnection for responses
//  * 
//  * Scalability: Async, batched queries, caching (TTL from env), pagination support.
//  * Error Handling: Throws custom errors with status codes.
//  * Integration: Called from mutualController.ts; updates cache on connection events.
//  */

import logger from '@/shared/logger.util';
import { IMutualConnection, MutualQueryParams } from '../types/network.types';
import { getNeo4jDriver } from '@/config/neo4j/neo4j';
import environmentConfig from '@/config/environment/environment';
import { mutualAlgorithms } from '../algorithms/mutualAlgorithms';
import { getRedisClient } from '@/services/redis.service';
import {User} from '@/shared/models/index.models';

// Extended PublicLogMetadata to include missing properties
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

// Extended EnvironmentConfig to include missing property
interface EnvironmentConfig {
  MUTUAL_CONNECTIONS_CACHE_TTL: number;
  [key: string]: any;
}

// Cast environmentConfig to extended type
const config = environmentConfig as EnvironmentConfig;

// Neo4j types
interface Neo4jSession {
  run(query: string, params: any): Promise<any>;
  close(): Promise<void>;
}

interface Neo4jRecord {
  get(key: string): any;
}

interface Neo4jResult {
  records: Neo4jRecord[];
}

/**
 * Create Neo4j session from app driver
 */
async function createNeo4jSession(): Promise<Neo4jSession> {
  if (!getNeo4jDriver) {
    throw new Error('Neo4j driver not initialized');
  }
  const driver = await getNeo4jDriver();
  return driver.session();
}

export class MutualService {
  private neo4jSession: Neo4jSession | null;
  private redisClient: any;
  private mockMode: boolean = false;

  constructor() {
    this.neo4jSession = null;
    this.redisClient = null;
    this.mockMode = false;

    // Initialize mock mode immediately
    this.initializeMockMode();
  }

  /**
   * Initialize mock mode for testing when real services aren't available
   */
  private initializeMockMode(): void {
    this.mockMode = true;

    // Mock Neo4j session for testing
    this.neo4jSession = {
      run: async (query: string, _params: any) => {
        logger.debug('Mock Neo4j query executed', { query: query.substring(0, 50) });
        return { records: [] };
      },
      close: async () => {
        logger.debug('Mock Neo4j session closed');
      }
    } as Neo4jSession;

    // Mock Redis client for testing  
    this.redisClient = {
      get: async (key: string) => {
        logger.debug('Mock Redis GET', { key });
        return null;
      },
      setex: async (key: string, ttl: number, _value: string) => {
        logger.debug('Mock Redis SETEX', { key, ttl });
        return 'OK';
      },
      del: async (keys: string[]) => {
        logger.debug('Mock Redis DEL', { keys });
        return keys.length;
      },
      keys: async (pattern: string) => {
        logger.debug('Mock Redis KEYS', { pattern });
        return [];
      },
      quit: async () => {
        logger.debug('Mock Redis quit');
      }
    };

    logger.info('MutualService initialized in mock mode for testing');
  }

  /**
   * Initialize Neo4j and Redis for the service
   */
  async initialize(): Promise<void> {
    try {
      // Try to get real services
      const realNeo4jSession = await createNeo4jSession();
      const realRedisClient = await getRedisClient();

      // If we reach here, real services are available
      this.neo4jSession = realNeo4jSession;
      this.redisClient = realRedisClient;
      this.mockMode = false;

      logger.info('MutualService initialized with real Neo4j + Redis');
    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error)
      };
      logger.warn('Failed to initialize real services, using mock mode', logMetadata);
      // Keep mock mode if real services fail
    }
  }

  /**
   * Check if service is properly initialized
   */
  private isInitialized(): boolean {
    return this.neo4jSession !== null && this.redisClient !== null;
  }

  /**
   * Feature 1: Find mutual connections between two users
   */
  async findMutualConnections(userId1: string, userId2: string, params: MutualQueryParams = {}): Promise<IMutualConnection[]> {
    try {
      if (!this.isInitialized()) {
        throw new Error('Service not initialized properly');
      }

      // ✅ VALIDATE BOTH USERS EXIST AND ARE ACTIVE (same as connectionService)
      const [user1, user2] = await Promise.all([
        User.findOne({ userId: userId1 }).lean().select('_id status accountStatus'),
        User.findOne({ userId: userId2 }).lean().select('_id status accountStatus'),
      ]);

      // ✅ CHECK USER1
      if (!user1) {
        throw new Error('User 1 not found');
      }
      if (user1.status !== 'active') {
        throw new Error('User 1 is not active');
      }
      if (user1.accountStatus && user1.accountStatus !== 'active') {
        throw new Error('User 1 account is locked or suspended');
      }

      // ✅ CHECK USER2
      if (!user2) {
        throw new Error('User 2 not found');
      }
      if (user2.status !== 'active') {
        throw new Error('User 2 is not active');
      }
      if (user2.accountStatus && user2.accountStatus !== 'active') {
        throw new Error('User 2 account is locked or suspended');
      }

      const cacheKey = `mutuals:${userId1}:${userId2}:${JSON.stringify(params)}`;

      // Check cache first
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        const logMetadata: PublicLogMetadata = { cacheKey };
        logger.debug('Mutual connections from cache', logMetadata);
        return JSON.parse(cached);
      }

      let mutuals: IMutualConnection[] = [];

      if (this.mockMode) {
        // In mock mode, return some sample data for testing
        mutuals = [
          {
            userId: 'mock-user-1',
            name: 'Mock User 1',
            headline: 'Software Engineer',
            mutualCount: 5,
            connectionStrength: 75,
            profileComplete: true,
            company: 'Tech Corp',
            avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=mock1'
          },
          {
            userId: 'mock-user-2',
            name: 'Mock User 2',
            headline: 'Product Manager',
            mutualCount: 3,
            connectionStrength: 60,
            profileComplete: true,
            company: 'StartupXYZ',
            avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=mock2'
          }
        ];
        logger.info('Mock mutual connections generated', { count: mutuals.length });
      } else {
        // Real Neo4j query
        const query = `
          MATCH (u1:Person {id: $userId1})-[:CONNECTED_TO {status: 'accepted'}]->(mutual:Person)<-[:CONNECTED_TO {status: 'accepted'}]-(u2:Person {id: $userId2})
          OPTIONAL MATCH (mutual)-[:HAS_PROFILE]->(p:Profile)
          RETURN mutual.id as userId, mutual.name as name, p.headline as headline, count(mutual) as mutualCount
          ORDER BY mutual.name
          LIMIT $limit OFFSET $offset
        `;
        const result: Neo4jResult = await this.neo4jSession!.run(query, {
          userId1,
          userId2,
          limit: params.limit || 20,
          offset: params.offset || 0
        });

        mutuals = result.records.map((record: Neo4jRecord) => ({
          userId: record.get('userId') as string,
          name: record.get('name') as string || '',
          headline: record.get('headline') as string || '',
          mutualCount: record.get('mutualCount') as number || 1,
          connectionStrength: 0,
          profileComplete: false
        }));

        // Enrich with external user profiles
        mutuals = await this.enrichWithUserProfiles(mutuals);
      }

      // Cache the result
      await this.cacheMutualData(cacheKey, mutuals, config.MUTUAL_CONNECTIONS_CACHE_TTL || 600);

      const logMetadata: PublicLogMetadata = {
        userId1,
        count: mutuals.length,
        mode: this.mockMode ? 'mock' : 'real'
      };
      logger.info('Mutual connections found', logMetadata);
      return mutuals;

    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2
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
      if (!this.isInitialized()) {
        throw new Error('Service not initialized properly');
      }

      // ✅ VALIDATE USERS (lightweight check for count operation)
      const [user1, user2] = await Promise.all([
        User.findOne({ userId: userId1 }).lean().select('status'),
        User.findOne({ userId: userId2 }).lean().select('status'),
      ]);

      if (!user1 || user1.status !== 'active') {
        throw new Error('User 1 not found or inactive');
      }
      if (!user2 || user2.status !== 'active') {
        throw new Error('User 2 not found or inactive');
      }

      const cacheKey = `mutual_count:${userId1}:${userId2}`;
      const cachedCount = await this.redisClient.get(cacheKey);
      if (cachedCount !== null) {
        return parseInt(cachedCount);
      }

      let count = 0;

      if (this.mockMode) {
        count = Math.floor(Math.random() * 10);
        logger.info('Mock mutual count generated', { count });
      } else {
        const query = `
          MATCH (u1:Person {id: $userId1})-[:CONNECTED_TO {status: 'accepted'}]->(mutual:Person)<-[:CONNECTED_TO {status: 'accepted'}]-(u2:Person {id: $userId2})
          RETURN count(DISTINCT mutual) as count
        `;
        const result: Neo4jResult = await this.neo4jSession!.run(query, { userId1, userId2 });
        count = result.records[0]?.get('count') as number || 0;
      }

      const ttl = (config.MUTUAL_CONNECTIONS_CACHE_TTL || 600) / 2;
      await this.redisClient.setex(cacheKey, ttl, count.toString());

      logger.debug('Mutual count calculated', { userId1, userId2, count, mode: this.mockMode ? 'mock' : 'real' });
      return count;

    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2
      };
      logger.error('Error calculating mutual count', logMetadata);
      return 0;
    }
  }

  /**
   * Feature 3: Get mutual suggestions
   */
  async getMutualSuggestions(userId: string, limit: number = 10): Promise<IMutualConnection[]> {
    try {
      // ✅ VALIDATE USER
      const user = await User.findOne({ userId }).lean().select('status');
      if (!user || user.status !== 'active') {
        throw new Error('User not found or inactive');
      }

      const suggestions = await mutualAlgorithms.getSuggestions(userId, limit);
      return await this.enrichWithUserProfiles(suggestions);
    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId
      };
      logger.error('Error getting mutual suggestions', logMetadata);
      throw error;
    }
  }

  /**
   * Feature 4: Get extended mutuals
   */
  async getExtendedMutuals(userId1: string, userId2: string, degree: 2 | 3 = 2): Promise<IMutualConnection[]> {
    try {
      if (!this.isInitialized()) {
        throw new Error('Service not initialized properly');
      }

      // ✅ VALIDATE USERS
      const [user1, user2] = await Promise.all([
        User.findOne({ userId: userId1 }).lean().select('status'),
        User.findOne({ userId: userId2 }).lean().select('status'),
      ]);

      if (!user1 || user1.status !== 'active') {
        throw new Error('User 1 not found or inactive');
      }
      if (!user2 || user2.status !== 'active') {
        throw new Error('User 2 not found or inactive');
      }

      if (this.mockMode) {
        const mockExtended: IMutualConnection[] = [
          {
            userId: 'extended-mock-1',
            name: 'Extended Mock User 1',
            headline: 'Senior Developer',
            mutualCount: 2,
            connectionStrength: 45,
            profileComplete: true
          }
        ];
        return await this.enrichWithUserProfiles(mockExtended);
      }

      const pathLength = degree * 2;
      const query = `
        MATCH path = shortestPath((u1:Person {id: $userId1})-[*${pathLength}]-(u2:Person {id: $userId2}))
        WHERE all(rel in relationships(path) WHERE type(rel) = 'CONNECTED_TO' AND rel.status = 'accepted')
        RETURN [node in nodes(path) | node.id] as pathIds
        LIMIT 50
      `;
      const result: Neo4jResult = await this.neo4jSession!.run(query, { userId1, userId2 });

      const mutuals = result.records.flatMap((record: Neo4jRecord) => {
        const pathIds = record.get('pathIds') as string[];
        return pathIds.slice(1, -1);
      });

      const uniqueMutuals: IMutualConnection[] = [...new Set(mutuals)].map((id: string) => ({
        userId: id,
        name: '',
        connectionStrength: 0,
        mutualCount: 0,
        profileComplete: false
      }));

      return await this.enrichWithUserProfiles(uniqueMutuals);
    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2
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
    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        cacheKey: key
      };
      logger.error('Error caching mutual data', logMetadata);
    }
  }

  /**
   * Feature 6: Invalidate mutual cache
   */
  async invalidateMutualCache(userId: string): Promise<void> {
    try {
      if (!this.redisClient) {
        return;
      }

      const keys = await this.redisClient.keys(`mutuals:${userId}:*`);
      if (keys.length > 0) {
        await this.redisClient.del(keys);
        const logMetadata: PublicLogMetadata = {
          userId,
          keysCount: keys.length
        };
        logger.info('Mutual cache invalidated', logMetadata);
      }
    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId
      };
      logger.error('Error invalidating mutual cache', logMetadata);
    }
  }

  /**
   * Feature 7: Enrich mutuals with user profiles
   */
  private async enrichWithUserProfiles(mutuals: IMutualConnection[]): Promise<IMutualConnection[]> {
    try {
      const userIds = mutuals.map(m => m.userId);
      const profiles = await userServiceClient.getUsersByIds(userIds);

      return mutuals.map(mutual => {
        const profile = profiles.find((p: any) => p.id === mutual.userId);
        return {
          ...mutual,
          name: profile?.name || mutual.name || '',
          headline: profile?.headline || mutual.headline || '',
          avatar: profile?.avatarUrl || '',
          company: profile?.company || '',
          profileComplete: Boolean(profile?.name && profile?.headline)
        };
      });
    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error)
      };
      logger.error('Error enriching user profiles', logMetadata);
      return mutuals;
    }
  }

  /**
   * Feature 8: Calculate mutual strength using algorithms
   */
  async calculateMutualStrength(userId1: string, userId2: string, mutuals: IMutualConnection[]): Promise<number> {
    try {
      return mutualAlgorithms.calculateStrength(userId1, userId2, mutuals);
    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2
      };
      logger.error('Error calculating mutual strength', logMetadata);
      return 0;
    }
  }

  /**
   * Feature 9: Find common connections using set intersection
   */
  async findCommonConnections(userConnections1: string[], userConnections2: string[]): Promise<string[]> {
    try {
      return mutualAlgorithms.findIntersection(userConnections1, userConnections2);
    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error)
      };
      logger.error('Error finding common connections', logMetadata);
      return [];
    }
  }

  /**
   * Feature 10: Get mutual network metrics
   */
  async getMutualNetworkMetrics(userId1: string, userId2: string): Promise<{
    mutualCount: number;
    avgDegree: number;
    totalNetworkSize: number;
  }> {
    try {
      const mutualCount = await this.calculateMutualCount(userId1, userId2);
      const mutuals = await this.findMutualConnections(userId1, userId2, { limit: 100 });
      const avgDegree = mutuals.reduce((sum, m) => sum + (m.mutualCount || 0), 0) / mutuals.length || 0;

      return { mutualCount, avgDegree, totalNetworkSize: mutualCount * 2 };
    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2
      };
      logger.error('Error getting mutual network metrics', logMetadata);
      return { mutualCount: 0, avgDegree: 0, totalNetworkSize: 0 };
    }
  }

  /**
   * Feature 11: Handle bulk mutual queries
   */
  async handleBulkMutualQueries(pairs: [string, string][]): Promise<Map<string, IMutualConnection[]>> {
    try {
      const results = new Map<string, IMutualConnection[]>();
      for (const [userId1, userId2] of pairs) {
        const key = `${userId1}-${userId2}`;
        results.set(key, await this.findMutualConnections(userId1, userId2));
      }
      const logMetadata: PublicLogMetadata = { pairCount: pairs.length };
      logger.info('Bulk mutual queries completed', logMetadata);
      return results;
    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error)
      };
      logger.error('Error in bulk mutual queries', logMetadata);
      throw error;
    }
  }

  /**
   * Feature 12: Search mutual connections with filters
   */
  async findMutualConnectionsWithSearch(userId1: string, userId2: string, searchQuery: string): Promise<IMutualConnection[]> {
    try {
      let mutuals = await this.findMutualConnections(userId1, userId2);
      mutuals = mutualAlgorithms.filterBySearch(mutuals, searchQuery);
      return mutuals;
    } catch (error : any) {
      const logMetadata: PublicLogMetadata = {
        error: error instanceof Error ? error.message : String(error),
        userId1,
        userId2
      };
      logger.error('Error searching mutual connections', logMetadata);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async close(): Promise<void> {
    if (this.neo4jSession && !this.mockMode) {
      await this.neo4jSession.close();
    }
    if (this.redisClient && !this.mockMode) {
      await this.redisClient.quit();
    }
  }
}

// Export singleton instance
export const mutualService = new MutualService();
export default mutualService;