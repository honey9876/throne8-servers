
// // src/services/privacyService.ts - Production-Ready for 1M+ Users

// import logger, { LogCategory } from '../utils/logger';
// import Connection from '../models/mongodb/Connection';
// import ConnectionBlock from '../models/mongodb/ConnectionBlock';
// import WhoViewedProfile from '../models/mongodb/WhoViewedProfile';
// import { createNeo4jSession } from '../config/neo4j';
// import { redisManager } from '../config/redis';
// import environmentConfig from '../config/environment';
// import { ErrorResponse, HttpStatus } from '../utils/response';
// import { ERROR_CODES } from '../utils/constants';
// import { Session } from 'neo4j-driver';

// /**
//  * Production-Grade Privacy Service for 1M+ Users
//  * 
//  * Features:
//  * - Redis caching with TTL for high-frequency reads
//  * - Batch operations with transaction support
//  * - Circuit breaker pattern for Neo4j
//  * - Connection pooling optimization
//  * - Distributed locking for race conditions
//  * - Comprehensive error handling
//  * - Performance monitoring
//  * - Audit logging for compliance (GDPR)
//  */

// export interface IPrivacySettings {
//   visibility?: 'public' | 'private' | 'connections';
//   profileVisibility?: 'public' | 'private' | 'connections';
//   viewersVisible?: boolean;
//   allowMessagesFrom?: 'everyone' | 'connections' | 'nobody';
//   showActivityStatus?: boolean;
//   showConnectionList?: boolean;
//   searchable?: boolean;
//   allowTagging?: boolean;
//   dataSharing?: boolean;
//   [key: string]: any;
// }

// export interface PrivacyQueryParams {
//   page?: number;
//   limit?: number;
//   sortBy?: string;
//   order?: 'asc' | 'desc';
//   [key: string]: any;
// }

// interface CacheMetrics {
//   hits: number;
//   misses: number;
//   errors: number;
// }

// export class PrivacyService {
//   private neo4jSession: Session | null = null;
//   private redisClient: any = null;
//   private circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
//   private failureCount: number = 0;
//   private lastFailureTime: number = 0;
//   private readonly MAX_FAILURES = 5;
//   private readonly CIRCUIT_TIMEOUT = 60000; // 1 minute
//   private cacheMetrics: CacheMetrics = { hits: 0, misses: 0, errors: 0 };

//   constructor() {
//     // Don't call initialize in constructor
//   }

//   /**
//    * Initialize connections with retry logic
//    */
//   // async initialize(): Promise<void> {
//   //   try {
//   //     // Wait for Redis connection properly
//   //     const isRedisConnected = await redisManager.isConnected();
//   //     if (!isRedisConnected) {
//   //       await redisManager.connect();
//   //     }
      
//   //     this.redisClient = await redisManager.getRedisClient();
      
//   //     // Create Neo4j session directly without setTimeout
//   //     this.neo4jSession = await createNeo4jSession();
      
//   //     logger.info('PrivacyService initialized successfully', {
//   //       category: LogCategory.SECURITY,
//   //       timestamp: new Date().toISOString()
//   //     });

//   //     // Start cache metrics reporting
//   //     this.startMetricsReporting();
//   //   } catch (error : any) {
//   //     logger.error('Failed to initialize PrivacyService', {
//   //       error: error instanceof Error ? error.message : String(error),
//   //       category: LogCategory.SECURITY
//   //     });
//   //     throw new ErrorResponse(
//   //       'Privacy service initialization failed',
//   //       HttpStatus.SERVICE_UNAVAILABLE,
//   //       ERROR_CODES.SERVICE_UNAVAILABLE
//   //     );
//   //   }
//   // }
//  async initialize(): Promise<void> {
//   try {
//     // Simply try to get Redis client - it will connect if needed
//     this.redisClient = await redisManager.getRedisClient();
    
//     // Create Neo4j session directly
//     this.neo4jSession = await createNeo4jSession();
     
//     logger.info('PrivacyService initialized successfully', {
//       category: LogCategory.SECURITY,
//       timestamp: new Date().toISOString()
//     });

//     // Start cache metrics reporting
//     this.startMetricsReporting();
//   } catch (error : any) {
//     logger.error('Failed to initialize PrivacyService', {
//       error: error instanceof Error ? error.message : String(error),
//       category: LogCategory.SECURITY
//     });
//     throw new ErrorResponse(
//       'Privacy service initialization failed',
//       HttpStatus.SERVICE_UNAVAILABLE,
//       ERROR_CODES.SERVICE_UNAVAILABLE
//     );
//   }
// }
//   /**
//    * Circuit breaker check
//    */
//   private isCircuitOpen(): boolean {
//     if (this.circuitBreakerState === 'OPEN') {
//       const timeSinceLastFailure = Date.now() - this.lastFailureTime;
//       if (timeSinceLastFailure > this.CIRCUIT_TIMEOUT) {
//         this.circuitBreakerState = 'HALF_OPEN';
//         logger.info('Circuit breaker moving to HALF_OPEN', { category: LogCategory.SECURITY });
//         return false;
//       }
//       return true;
//     }
//     return false;
//   }

//   /**
//    * Record circuit breaker failure
//    */
//   private recordFailure(): void {
//     this.failureCount++;
//     this.lastFailureTime = Date.now();
    
//     if (this.failureCount >= this.MAX_FAILURES) {
//       this.circuitBreakerState = 'OPEN';
//       logger.error('Circuit breaker OPEN - too many failures', {
//         category: LogCategory.SECURITY,
//         failureCount: this.failureCount
//       });
//     }
//   }

//   /**
//    * Record circuit breaker success
//    */
//   private recordSuccess(): void {
//     this.failureCount = 0;
//     this.circuitBreakerState = 'CLOSED';
//   }

//   /**
//    * Get from cache with metrics
//    */
//   private async getFromCache(key: string): Promise<any> {
//     try {
//       if (!this.redisClient) {
//         this.cacheMetrics.errors++;
//         return null;
//       }
      
//       const cached = await this.redisClient.get(key);
//       if (cached) {
//         this.cacheMetrics.hits++;
//         return JSON.parse(cached);
//       }
//       this.cacheMetrics.misses++;
//       return null;
//     } catch (error : any) {
//       this.cacheMetrics.errors++;
//       logger.error('Cache read error', {
//         error: error instanceof Error ? error.message : String(error),
//         key,
//         category: LogCategory.REDIS
//       });
//       return null;
//     }
//   }

//   /**
//    * Set to cache with TTL
//    */
//   private async setCache(key: string, value: any, ttl?: number): Promise<void> {
//     try {
//       if (!this.redisClient) return;
      
//       const cacheValue = JSON.stringify(value);
//       const cacheTTL = ttl || environmentConfig.CACHE_TTL_SECONDS;
//       await this.redisClient.setex(key, cacheTTL, cacheValue);
//     } catch (error : any) {
//       logger.error('Cache write error', {
//         error: error instanceof Error ? error.message : String(error),
//         key,
//         category: LogCategory.REDIS
//       });
//     }
//   }

//   /**
//    * Delete from cache with pattern support
//    */
//   private async deleteCache(pattern: string): Promise<void> {
//     try {
//       if (!this.redisClient) return;
      
//       if (pattern.includes('*')) {
//         const keys = await this.redisClient.keys(pattern);
//         if (keys.length > 0) {
//           await this.redisClient.del(...keys);
//         }
//       } else {
//         await this.redisClient.del(pattern);
//       }
//     } catch (error : any) {
//       logger.error('Cache delete error', {
//         error: error instanceof Error ? error.message : String(error),
//         pattern,
//         category: LogCategory.REDIS
//       });
//     }
//   }

//   /**
//    * Feature 1: Get privacy settings with caching
//    */
//   async getPrivacySettings(userId: string): Promise<IPrivacySettings> {
//     const startTime = Date.now();
    
//     try {
//       // Check cache first
//       const cacheKey = `privacy:settings:${userId}`;
//       const cached = await this.getFromCache(cacheKey);
//       if (cached) {
//         logger.debug('Privacy settings cache hit', {
//           userId,
//           duration: Date.now() - startTime,
//           category: LogCategory.SECURITY
//         });
//         return cached;
//       }

//       // Circuit breaker check
//       if (this.isCircuitOpen()) {
//         throw new ErrorResponse(
//           'Service temporarily unavailable',
//           HttpStatus.SERVICE_UNAVAILABLE,
//           ERROR_CODES.SERVICE_UNAVAILABLE
//         );
//       }

//       // Check if Neo4j session is available
//       if (!this.neo4jSession) {
//         logger.warn('Neo4j session not available, returning default settings', {
//           userId,
//           category: LogCategory.SECURITY
//         });
//         return this.getDefaultSettings();
//       }

//       // Fetch from Neo4j
//       const query = `
//         MATCH (p:Person {id: $userId})
//         RETURN p.privacySettings as settings
//       `;
      
//       const result = await this.neo4jSession.run(query, { userId });
//       const settings = result.records[0]?.get('settings') || this.getDefaultSettings();

//       this.recordSuccess();

//       // Cache the result
//       await this.setCache(cacheKey, settings, environmentConfig.USER_PROFILE_CACHE_TTL);

//       logger.info('Privacy settings retrieved from database', {
//         userId,
//         duration: Date.now() - startTime,
//         category: LogCategory.SECURITY
//       });

//       return settings;
//     } catch (error : any) {
//       this.recordFailure();
//       logger.error('Error getting privacy settings', {
//         error: error instanceof Error ? error.message : String(error),
//         userId,
//         duration: Date.now() - startTime,
//         category: LogCategory.SECURITY
//       });
      
//       // Return default settings on error
//       return this.getDefaultSettings();
//     }
//   }

//   /**
//    * Default privacy settings
//    */
//   private getDefaultSettings(): IPrivacySettings {
//     return {
//       visibility: 'public',
//       profileVisibility: environmentConfig.DEFAULT_PROFILE_VISIBILITY as any || 'public',
//       viewersVisible: true,
//       allowMessagesFrom: 'everyone',
//       showActivityStatus: true,
//       showConnectionList: true,
//       searchable: true,
//       allowTagging: true,
//       dataSharing: false
//     };
//   }

//   /**
//    * Feature 2: Update privacy settings with transaction
//    */
//   async updatePrivacySettings(userId: string, settings: IPrivacySettings): Promise<IPrivacySettings> {
//     const startTime = Date.now();
    
//     try {
//       if (this.isCircuitOpen()) {
//         throw new ErrorResponse(
//           'Service temporarily unavailable',
//           HttpStatus.SERVICE_UNAVAILABLE,
//           ERROR_CODES.SERVICE_UNAVAILABLE
//         );
//       }

//       // Validate settings
//       this.validateSettings(settings);

//       if (!this.neo4jSession) {
//         throw new ErrorResponse(
//           'Database not connected',
//           HttpStatus.SERVICE_UNAVAILABLE,
//           ERROR_CODES.SERVICE_UNAVAILABLE
//         );
//       }

//       // Update in Neo4j with transaction
//       const query = `
//         MATCH (p:Person {id: $userId})
//         SET p.privacySettings = $settings,
//             p.updatedAt = datetime()
//         RETURN p.privacySettings as settings
//       `;

//       const result = await this.neo4jSession.run(query, { userId, settings });
//       const updated = result.records[0].get('settings');

//       this.recordSuccess();

//       // Invalidate cache
//       await this.deleteCache(`privacy:*:${userId}`);

//       // Audit log for compliance
//       logger.auditLog('privacy_settings_updated', userId, {
//         settings,
//         timestamp: new Date().toISOString()
//       });

//       logger.info('Privacy settings updated', {
//         userId,
//         duration: Date.now() - startTime,
//         category: LogCategory.SECURITY
//       });

//       return updated;
//     } catch (error : any) {
//       this.recordFailure();
//       logger.error('Error updating privacy settings', {
//         error: error instanceof Error ? error.message : String(error),
//         userId,
//         duration: Date.now() - startTime,
//         category: LogCategory.SECURITY
//       });
//       throw error;
//     }
//   }

//   /**
//    * Validate privacy settings
//    */
//   private validateSettings(settings: IPrivacySettings): void {
//     const validVisibilities = ['public', 'private', 'connections'];
//     const validMessageSettings = ['everyone', 'connections', 'nobody'];

//     if (settings.visibility && !validVisibilities.includes(settings.visibility)) {
//       throw new ErrorResponse('Invalid visibility setting', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
//     }

//     if (settings.profileVisibility && !validVisibilities.includes(settings.profileVisibility)) {
//       throw new ErrorResponse('Invalid profile visibility', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
//     }

//     if (settings.allowMessagesFrom && !validMessageSettings.includes(settings.allowMessagesFrom)) {
//       throw new ErrorResponse('Invalid message setting', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
//     }
//   }

//   /**
//    * Feature 5: Block user with distributed lock
//    */
//   async blockUser(blockerId: string, blockedId: string): Promise<void> {
//     const startTime = Date.now();
//     const lockKey = `lock:block:${blockerId}:${blockedId}`;
    
//     try {
//       // Prevent self-blocking
//       if (blockerId === blockedId) {
//         throw new ErrorResponse('Cannot block yourself', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
//       }

//       if (!this.redisClient) {
//         throw new ErrorResponse(
//           'Cache service unavailable',
//           HttpStatus.SERVICE_UNAVAILABLE,
//           ERROR_CODES.SERVICE_UNAVAILABLE
//         );
//       }

//       // Acquire distributed lock
//       const lockAcquired = await this.redisClient.set(lockKey, '1', 'NX', 'EX', 10);
//       if (!lockAcquired) {
//         throw new ErrorResponse('Block operation in progress', HttpStatus.CONFLICT, ERROR_CODES.CONFLICT);
//       }

//       try {
//         // Check if already blocked
//         const existing = await ConnectionBlock.findOne({ blockerId, blockedId });
//         if (existing) {
//           throw new ErrorResponse('User already blocked', HttpStatus.CONFLICT, ERROR_CODES.CONFLICT);
//         }

//         // Create block record in MongoDB
//         const block = new ConnectionBlock({
//           blockerId,
//           blockedId,
//           blockedAt: new Date(),
//           reason: 'User initiated'
//         });
//         await block.save();

//         // Update Neo4j graph
//         if (!this.isCircuitOpen() && this.neo4jSession) {
//           const query = `
//             MATCH (blocker:Person {id: $blockerId}), (blocked:Person {id: $blockedId})
//             MERGE (blocker)-[r:BLOCKED {blockedAt: datetime(), active: true}]->(blocked)
//             RETURN r
//           `;
//           await this.neo4jSession.run(query, { blockerId, blockedId });
//         }

//         // Delete existing connection if any
//         await Connection.deleteOne({
//           $or: [
//             { fromUserId: blockerId, toUserId: blockedId },
//             { fromUserId: blockedId, toUserId: blockerId }
//           ]
//         });

//         // Invalidate caches
//         await this.deleteCache(`connections:${blockerId}*`);
//         await this.deleteCache(`connections:${blockedId}*`);
//         await this.deleteCache(`privacy:blocked:${blockerId}`);

//         logger.auditLog('user_blocked', blockerId, {
//           blockedId,
//           timestamp: new Date().toISOString()
//         });

//         logger.info('User blocked successfully', {
//           blockerId,
//           blockedId,
//           duration: Date.now() - startTime,
//           category: LogCategory.SECURITY
//         });
//       } finally {
//         // Release lock
//         await this.redisClient.del(lockKey);
//       }
//     } catch (error : any) {
//       logger.error('Error blocking user', {
//         error: error instanceof Error ? error.message : String(error),
//         blockerId,
//         blockedId,
//         duration: Date.now() - startTime,
//         category: LogCategory.SECURITY
//       });
//       throw error;
//     }
//   }

//   /**
//    * Feature 7: Get blocked users with pagination
//    */
//   async getBlockedUsers(userId: string, params: PrivacyQueryParams = {}): Promise<any> {
//     const startTime = Date.now();
    
//     try {
//       const page = Math.max(1, params.page || 1);
//       const limit = Math.min(100, params.limit || 20);
//       const skip = (page - 1) * limit;

//       // Check cache
//       const cacheKey = `privacy:blocked:${userId}:${page}:${limit}`;
//       const cached = await this.getFromCache(cacheKey);
//       if (cached) {
//         return cached;
//       }

//       // Query with pagination
//       const [blocked, total] = await Promise.all([
//         ConnectionBlock.find({ blockerId: userId })
//           .sort({ blockedAt: -1 })
//           .skip(skip)
//           .limit(limit)
//           .select('blockedId blockedAt reason')
//           .lean(),
//         ConnectionBlock.countDocuments({ blockerId: userId })
//       ]);

//       const result = {
//         blockedUsers: blocked,
//         pagination: {
//           page,
//           limit,
//           total,
//           totalPages: Math.ceil(total / limit),
//           hasNext: page * limit < total,
//           hasPrev: page > 1
//         }
//       };

//       // Cache result
//       await this.setCache(cacheKey, result, 300); // 5 minutes TTL

//       logger.info('Blocked users retrieved', {
//         userId,
//         count: blocked.length,
//         duration: Date.now() - startTime,
//         category: LogCategory.SECURITY
//       });

//       return result;
//     } catch (error : any) {
//       logger.error('Error getting blocked users', {
//         error: error instanceof Error ? error.message : String(error),
//         userId,
//         duration: Date.now() - startTime,
//         category: LogCategory.SECURITY
//       });
//       throw error;
//     }
//   }

//   /**
//    * Feature 18: Batch update with transaction
//    */
//   async batchUpdatePrivacy(userIds: string[], settings: Partial<IPrivacySettings>): Promise<void> {
//     const startTime = Date.now();
//     const batchSize = 100;
    
//     try {
//       if (userIds.length > 1000) {
//         throw new ErrorResponse('Batch size exceeds limit', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
//       }

//       this.validateSettings(settings as IPrivacySettings);

//       // Process in batches
//       for (let i = 0; i < userIds.length; i += batchSize) {
//         const batch = userIds.slice(i, i + batchSize);
        
//         await Promise.all(
//           batch.map(userId => this.updatePrivacySettings(userId, settings as IPrivacySettings))
//         );

//         logger.debug(`Batch privacy update progress: ${Math.min(i + batchSize, userIds.length)}/${userIds.length}`, {
//           category: LogCategory.SECURITY
//         });
//       }

//       logger.auditLog('batch_privacy_update', 'system', {
//         userCount: userIds.length,
//         settings,
//         duration: Date.now() - startTime
//       });

//       logger.info('Batch privacy update completed', {
//         userCount: userIds.length,
//         duration: Date.now() - startTime,
//         category: LogCategory.SECURITY
//       });
//     } catch (error : any) {
//       logger.error('Error in batch privacy update', {
//         error: error instanceof Error ? error.message : String(error),
//         userCount: userIds.length,
//         duration: Date.now() - startTime,
//         category: LogCategory.SECURITY
//       });
//       throw error;
//     }
//   }

//   /**
//    * Start metrics reporting
//    */
//   private startMetricsReporting(): void {
//     setInterval(() => {
//       if (this.cacheMetrics.hits + this.cacheMetrics.misses > 0) {
//         const hitRate = (this.cacheMetrics.hits / (this.cacheMetrics.hits + this.cacheMetrics.misses)) * 100;
        
//         logger.info('Privacy cache metrics', {
//           hits: this.cacheMetrics.hits,
//           misses: this.cacheMetrics.misses,
//           errors: this.cacheMetrics.errors,
//           hitRate: hitRate.toFixed(2) + '%',
//           category: LogCategory.PERFORMANCE
//         });
//       }
//     }, 60000); // Every minute
//   }

//   // Additional methods from original service...
//   async setProfileVisibility(userId: string, visibility: 'public' | 'private' | 'connections'): Promise<void> {
//     const settings = await this.getPrivacySettings(userId);
//     await this.updatePrivacySettings(userId, { ...settings, profileVisibility: visibility });
//   }

//   async getProfileVisibility(userId: string): Promise<string> {
//     const settings = await this.getPrivacySettings(userId);
//     return settings.profileVisibility || 'public';
//   }

//   async unblockUser(blockerId: string, blockedId: string): Promise<void> {
//     await ConnectionBlock.deleteOne({ blockerId, blockedId });
//     await this.deleteCache(`privacy:blocked:${blockerId}*`);
//     logger.auditLog('user_unblocked', blockerId, { blockedId });
//   }

//   async checkIsBlocked(blockerId: string, blockedId: string): Promise<boolean> {
//     const exists = await ConnectionBlock.exists({ blockerId, blockedId });
//     return !!exists;
//   }

//   async setConnectionVisibility(connectionId: string, visibility: string): Promise<void> {
//     await Connection.findByIdAndUpdate(connectionId, { visibility });
//   }

//   async getConnectionVisibility(connectionId: string): Promise<string> {
//     const connection = await Connection.findById(connectionId);
//     return connection?.visibility || 'public';
//   }

//   async setViewersVisibility(userId: string, visible: boolean): Promise<void> {
//     const settings = await this.getPrivacySettings(userId);
//     await this.updatePrivacySettings(userId, { ...settings, viewersVisible: visible });
//   }

//   async getViewersVisibility(userId: string): Promise<boolean> {
//     const settings = await this.getPrivacySettings(userId);
//     return settings.viewersVisible ?? true;
//   }

//   async anonymizeView(viewId: string): Promise<void> {
//     await WhoViewedProfile.findByIdAndUpdate(viewId, { viewerId: 'anonymous' });
//   }

//   async getPrivacyAnalytics(userId: string): Promise<any> {
//     const [blockedCount, viewsCount, settings] = await Promise.all([
//       ConnectionBlock.countDocuments({ blockerId: userId }),
//       WhoViewedProfile.countDocuments({ viewedId: userId }),
//       this.getPrivacySettings(userId)
//     ]);
    
//     return { blockedCount, viewsCount, settings };
//   }

//   async applyPrivacyRules(userId: string, queryResults: any[]): Promise<any[]> {
//     return queryResults.filter(result => result.visibility !== 'private' || result.owner === userId);
//   }

//   async cachePrivacySettings(userId: string, settings: IPrivacySettings): Promise<void> {
//     await this.setCache(`privacy:settings:${userId}`, settings);
//   }

//   async invalidatePrivacyCache(userId: string): Promise<void> {
//     await this.deleteCache(`privacy:*:${userId}`);
//   }

//   async exportPrivacyData(userId: string): Promise<string> {
//     const data = await this.getPrivacySettings(userId);
//     return JSON.stringify(data, null, 2);
//   }

//   async importPrivacyData(userId: string, data: string): Promise<void> {
//     const parsedSettings = JSON.parse(data);
//     await this.updatePrivacySettings(userId, parsedSettings);
//   }

//   async isNotificationEnabled(userId: string, notificationType: string): Promise<boolean> {
//     const settings = await this.getPrivacySettings(userId);
//     return settings[`notify_${notificationType}`] !== false;
//   }

//   async getProfileViewPrivacy(profileId: string): Promise<string | null> {
//     const visibility = await this.getProfileVisibility(profileId);
//     return visibility;
//   }

//   /**
//    * Cleanup resources
//    */
//   async close(): Promise<void> {
//     if (this.neo4jSession) {
//       await this.neo4jSession.close();
//     }
//     logger.info('PrivacyService closed', { category: LogCategory.SECURITY });
//   }
// }

// // Export singleton instance but don't initialize in constructor
// export const privacyService = new PrivacyService();
// export default privacyService;


// src/services/privacyService.ts - Production-Ready for 1M+ Users

import logger, { LogCategory } from '../utils/logger';
import Connection from '../models/mongodb/Connection';
import ConnectionBlock from '../models/mongodb/ConnectionBlock';
import WhoViewedProfile from '../models/mongodb/WhoViewedProfile';
import { createNeo4jSession } from '../config/neo4j';
import { redisManager } from '../config/redis';
import environmentConfig from '../config/environment';
import { ErrorResponse, HttpStatus } from '../utils/response';
import { ERROR_CODES } from '../utils/constants';
import { Session } from 'neo4j-driver';

export interface IPrivacySettings {
  visibility?: 'public' | 'private' | 'connections';
  profileVisibility?: 'public' | 'private' | 'connections';
  viewersVisible?: boolean;
  allowMessagesFrom?: 'everyone' | 'connections' | 'nobody';
  showActivityStatus?: boolean;
  showConnectionList?: boolean;
  searchable?: boolean;
  allowTagging?: boolean;
  dataSharing?: boolean;
  [key: string]: any;
}



export interface PrivacyQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  [key: string]: any;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number;
}

export class PrivacyService {
  private neo4jSession: Session | null = null;
  private redisClient: any = null;
  private circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly MAX_FAILURES = 5;
  private readonly CIRCUIT_TIMEOUT = 60000;
  private cacheMetrics: CacheMetrics = { hits: 0, misses: 0, errors: 0 };

  constructor() {
    // Don't initialize in constructor
  }

  async initialize(): Promise<void> {
    try {
      this.redisClient = await redisManager.getRedisClient();
      this.neo4jSession = await createNeo4jSession();
      
      logger.info('PrivacyService initialized successfully', {
        category: LogCategory.SECURITY,
        timestamp: new Date().toISOString()
      });

      this.startMetricsReporting();
    } catch (error : any) {
      logger.error('Failed to initialize PrivacyService', {
        error: error instanceof Error ? error.message : String(error),
        category: LogCategory.SECURITY
      });
      throw new ErrorResponse(
        'Privacy service initialization failed',
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.SERVICE_UNAVAILABLE
      );
    }
  }

  private isCircuitOpen(): boolean {
    if (this.circuitBreakerState === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.CIRCUIT_TIMEOUT) {
        this.circuitBreakerState = 'HALF_OPEN';
        logger.info('Circuit breaker moving to HALF_OPEN', { category: LogCategory.SECURITY });
        return false;
      }
      return true;
    }
    return false;
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.MAX_FAILURES) {
      this.circuitBreakerState = 'OPEN';
      logger.error('Circuit breaker OPEN - too many failures', {
        category: LogCategory.SECURITY,
        failureCount: this.failureCount
      });
    }
  }

  private recordSuccess(): void {
    this.failureCount = 0;
    this.circuitBreakerState = 'CLOSED';
  }

  private async getFromCache(key: string): Promise<any> {
    try {
      if (!this.redisClient) {
        this.cacheMetrics.errors++;
        return null;
      }
      
      const cached = await this.redisClient.get(key);
      if (cached) {
        this.cacheMetrics.hits++;
        return JSON.parse(cached);
      }
      this.cacheMetrics.misses++;
      return null;
    } catch (error : any) {
      this.cacheMetrics.errors++;
      logger.error('Cache read error', {
        error: error instanceof Error ? error.message : String(error),
        key,
        category: LogCategory.REDIS
      });
      return null;
    }
  }

  private async setCache(key: string, value: any, ttl?: number): Promise<void> {
    try {
      if (!this.redisClient) return;
      
      const cacheValue = JSON.stringify(value);
      const cacheTTL = ttl || environmentConfig.CACHE_TTL_SECONDS;
      await this.redisClient.setex(key, cacheTTL, cacheValue);
    } catch (error : any) {
      logger.error('Cache write error', {
        error: error instanceof Error ? error.message : String(error),
        key,
        category: LogCategory.REDIS
      });
    }
  }

  private async deleteCache(pattern: string): Promise<void> {
    try {
      if (!this.redisClient) return;
      
      if (pattern.includes('*')) {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      } else {
        await this.redisClient.del(pattern);
      }
    } catch (error : any) {
      logger.error('Cache delete error', {
        error: error instanceof Error ? error.message : String(error),
        pattern,
        category: LogCategory.REDIS
      });
    }
  }

  // async getPrivacySettings(userId: string): Promise<IPrivacySettings> {
  //   const startTime = Date.now();
    
  //   try {
  //     const cacheKey = `privacy:settings:${userId}`;
  //     const cached = await this.getFromCache(cacheKey);
  //     if (cached) {
  //       logger.debug('Privacy settings cache hit', {
  //         userId,
  //         duration: Date.now() - startTime,
  //         category: LogCategory.SECURITY
  //       });
  //       return cached;
  //     }

  //     if (this.isCircuitOpen()) {
  //       throw new ErrorResponse(
  //         'Service temporarily unavailable',
  //         HttpStatus.SERVICE_UNAVAILABLE,
  //         ERROR_CODES.SERVICE_UNAVAILABLE
  //       );
  //     }

  //     if (!this.neo4jSession) {
  //       logger.warn('Neo4j session not available, returning default settings', {
  //         userId,
  //         category: LogCategory.SECURITY
  //       });
  //       return this.getDefaultSettings();
  //     }

  //     const query = `
  //       MATCH (p:Person {id: $userId})
  //       RETURN p.privacySettings as settings
  //     `;
      
  //     const result = await this.neo4jSession.run(query, { userId });
  //     const settings = result.records[0]?.get('settings') || this.getDefaultSettings();

  //     this.recordSuccess();
  //     await this.setCache(cacheKey, settings, environmentConfig.USER_PROFILE_CACHE_TTL);

  //     logger.info('Privacy settings retrieved from database', {
  //       userId,
  //       duration: Date.now() - startTime,
  //       category: LogCategory.SECURITY
  //     });

  //     return settings;
  //   } catch (error : any) {
  //     this.recordFailure();
  //     logger.error('Error getting privacy settings', {
  //       error: error instanceof Error ? error.message : String(error),
  //       userId,
  //       duration: Date.now() - startTime,
  //       category: LogCategory.SECURITY
  //     });
      
  //     return this.getDefaultSettings();
  //   }
  // }
  async getPrivacySettings(userId: string): Promise<IPrivacySettings> {
  const startTime = Date.now();
  
  try {
    const cacheKey = `privacy:settings:${userId}`;
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      logger.debug('Privacy settings cache hit', {
        userId,
        duration: Date.now() - startTime,
        category: LogCategory.SECURITY
      });
      return cached;
    }

    if (this.isCircuitOpen()) {
      throw new ErrorResponse(
        'Service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.SERVICE_UNAVAILABLE
      );
    }

    if (!this.neo4jSession) {
      logger.warn('Neo4j session not available, returning default settings', {
        userId,
        category: LogCategory.SECURITY
      });
      return this.getDefaultSettings();
    }

    const query = `
      MATCH (p:Person {id: $userId})
      RETURN {
        visibility: p.visibility,
        profileVisibility: p.profileVisibility,
        viewersVisible: p.viewersVisible,
        allowMessagesFrom: p.allowMessagesFrom,
        showActivityStatus: p.showActivityStatus,
        showConnectionList: p.showConnectionList,
        searchable: p.searchable,
        allowTagging: p.allowTagging,
        dataSharing: p.dataSharing
      } as settings
    `;
    
    const result = await this.neo4jSession.run(query, { userId });
    
    let settings: IPrivacySettings;
    
    if (!result.records || result.records.length === 0) {
      // User doesn't exist in Neo4j yet, return defaults
      settings = this.getDefaultSettings();
    } else {
      const record = result.records[0].get('settings');
      // Merge with defaults in case some properties are missing
      settings = {
        ...this.getDefaultSettings(),
        ...record
      };
    }

    this.recordSuccess();
    await this.setCache(cacheKey, settings, environmentConfig.USER_PROFILE_CACHE_TTL);

    logger.info('Privacy settings retrieved', {
      userId,
      duration: Date.now() - startTime,
      category: LogCategory.SECURITY
    });

    return settings;
  } catch (error : any) {
    this.recordFailure();
    logger.error('Error getting privacy settings', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      duration: Date.now() - startTime,
      category: LogCategory.SECURITY
    });
    
    return this.getDefaultSettings();
  }
}

  private getDefaultSettings(): IPrivacySettings {
    return {
      visibility: 'public',
      profileVisibility: environmentConfig.DEFAULT_PROFILE_VISIBILITY as any || 'public',
      viewersVisible: true,
      allowMessagesFrom: 'everyone',
      showActivityStatus: true,
      showConnectionList: true,
      searchable: true,
      allowTagging: true,
      dataSharing: false
    };
  }

  // async updatePrivacySettings(userId: string, settings: IPrivacySettings): Promise<IPrivacySettings> {
  //   const startTime = Date.now();
    
  //   try {
  //     if (this.isCircuitOpen()) {
  //       throw new ErrorResponse(
  //         'Service temporarily unavailable',
  //         HttpStatus.SERVICE_UNAVAILABLE,
  //         ERROR_CODES.SERVICE_UNAVAILABLE
  //       );
  //     }

  //     this.validateSettings(settings);

  //     if (!this.neo4jSession) {
  //       throw new ErrorResponse(
  //         'Database not connected',
  //         HttpStatus.SERVICE_UNAVAILABLE,
  //         ERROR_CODES.SERVICE_UNAVAILABLE
  //       );
  //     }

  //     const query = `
  //       MATCH (p:Person {id: $userId})
  //       SET p.privacySettings = $settings,
  //           p.updatedAt = datetime()
  //       RETURN p.privacySettings as settings
  //     `;

  //     const result = await this.neo4jSession.run(query, { userId, settings });
  //     const updated = result.records[0].get('settings');

  //     this.recordSuccess();
  //     await this.deleteCache(`privacy:*:${userId}`);

  //     logger.auditLog('privacy_settings_updated', userId, {
  //       settings,
  //       timestamp: new Date().toISOString()
  //     });

  //     logger.info('Privacy settings updated', {
  //       userId,
  //       duration: Date.now() - startTime,
  //       category: LogCategory.SECURITY
  //     });

  //     return updated;
  //   } catch (error : any) {
  //     this.recordFailure();
  //     logger.error('Error updating privacy settings', {
  //       error: error instanceof Error ? error.message : String(error),
  //       userId,
  //       duration: Date.now() - startTime,
  //       category: LogCategory.SECURITY
  //     });
  //     throw error;
  //   }
  // }

//   async updatePrivacySettings(userId: string, settings: IPrivacySettings): Promise<IPrivacySettings> {
//   const startTime = Date.now();
  
//   try {
//     if (this.isCircuitOpen()) {
//       throw new ErrorResponse(
//         'Service temporarily unavailable',
//         HttpStatus.SERVICE_UNAVAILABLE,
//         ERROR_CODES.SERVICE_UNAVAILABLE
//       );
//     }

//     this.validateSettings(settings);

//     if (!this.neo4jSession) {
//       throw new ErrorResponse(
//         'Database not connected',
//         HttpStatus.SERVICE_UNAVAILABLE,
//         ERROR_CODES.SERVICE_UNAVAILABLE
//       );
//     }

//     // Flatten settings object for Neo4j - each property set individually
//     const query = `
//       MERGE (p:Person {id: $userId})
//       ON CREATE SET 
//         p.createdAt = datetime()
//       SET 
//         p.visibility = $visibility,
//         p.profileVisibility = $profileVisibility,
//         p.viewersVisible = $viewersVisible,
//         p.allowMessagesFrom = $allowMessagesFrom,
//         p.showActivityStatus = $showActivityStatus,
//         p.showConnectionList = $showConnectionList,
//         p.searchable = $searchable,
//         p.allowTagging = $allowTagging,
//         p.dataSharing = $dataSharing,
//         p.updatedAt = datetime()
//       RETURN {
//         visibility: p.visibility,
//         profileVisibility: p.profileVisibility,
//         viewersVisible: p.viewersVisible,
//         allowMessagesFrom: p.allowMessagesFrom,
//         showActivityStatus: p.showActivityStatus,
//         showConnectionList: p.showConnectionList,
//         searchable: p.searchable,
//         allowTagging: p.allowTagging,
//         dataSharing: p.dataSharing
//       } as settings
//     `;

//     const params = {
//       userId,
//       visibility: settings.visibility || 'public',
//       profileVisibility: settings.profileVisibility || 'public',
//       viewersVisible: settings.viewersVisible !== undefined ? settings.viewersVisible : true,
//       allowMessagesFrom: settings.allowMessagesFrom || 'everyone',
//       showActivityStatus: settings.showActivityStatus !== undefined ? settings.showActivityStatus : true,
//       showConnectionList: settings.showConnectionList !== undefined ? settings.showConnectionList : true,
//       searchable: settings.searchable !== undefined ? settings.searchable : true,
//       allowTagging: settings.allowTagging !== undefined ? settings.allowTagging : true,
//       dataSharing: settings.dataSharing !== undefined ? settings.dataSharing : false
//     };

//     const result = await this.neo4jSession.run(query, params);
    
//     if (!result.records || result.records.length === 0) {
//       logger.error('Neo4j query returned no records', {
//         userId,
//         category: LogCategory.DATABASE
//       });
//       throw new ErrorResponse(
//         'Failed to update privacy settings',
//         HttpStatus.INTERNAL_SERVER_ERROR,
//         ERROR_CODES.DATABASE_ERROR
//       );
//     }
    
//     const updated = result.records[0].get('settings');

//     this.recordSuccess();
//     await this.deleteCache(`privacy:*:${userId}`);

//     logger.auditLog('privacy_settings_updated', userId, {
//       settings: updated,
//       timestamp: new Date().toISOString()
//     });

//     logger.info('Privacy settings updated', {
//       userId,
//       duration: Date.now() - startTime,
//       category: LogCategory.SECURITY
//     });

//     return updated;
//   } catch (error : any) {
//     this.recordFailure();
//     logger.error('Error updating privacy settings', {
//       error: error instanceof Error ? error.message : String(error),
//       userId,
//       duration: Date.now() - startTime,
//       category: LogCategory.SECURITY
//     });
//     throw error;
//   }
// }


// async updatePrivacySettings(userId: string, settings: IPrivacySettings): Promise<IPrivacySettings> {
//   const startTime = Date.now();
  
//   try {
//     if (this.isCircuitOpen()) {
//       throw new ErrorResponse(
//         'Service temporarily unavailable',
//         HttpStatus.SERVICE_UNAVAILABLE,
//         ERROR_CODES.SERVICE_UNAVAILABLE
//       );
//     }

//     this.validateSettings(settings);

//     if (!this.neo4jSession) {
//       throw new ErrorResponse(
//         'Database not connected',
//         HttpStatus.SERVICE_UNAVAILABLE,
//         ERROR_CODES.SERVICE_UNAVAILABLE
//       );
//     }

//     // Build dynamic SET clause
//     const setFields: string[] = [];
//     const params: any = { userId };
    
//     // Standard fields
//     const standardFields = {
//       visibility: settings.visibility,
//       profileVisibility: settings.profileVisibility,
//       viewersVisible: settings.viewersVisible,
//       allowMessagesFrom: settings.allowMessagesFrom,
//       showActivityStatus: settings.showActivityStatus,
//       showConnectionList: settings.showConnectionList,
//       searchable: settings.searchable,
//       allowTagging: settings.allowTagging,
//       dataSharing: settings.dataSharing
//     };
    
//     Object.entries(standardFields).forEach(([key, value]) => {
//       if (value !== undefined) {
//         setFields.push(`p.${key} = $${key}`);
//         params[key] = value;
//       }
//     });
    
//     // Dynamic fields (any additional fields like dataRetentionDays)
//     Object.entries(settings).forEach(([key, value]) => {
//       if (!standardFields.hasOwnProperty(key) && value !== undefined) {
//         setFields.push(`p.${key} = $${key}`);
//         params[key] = value;
//       }
//     });
    
//     setFields.push('p.updatedAt = datetime()');
    
//     const query = `
//       MERGE (p:Person {id: $userId})
//       ON CREATE SET p.createdAt = datetime()
//       SET ${setFields.join(', ')}
//       RETURN p as person
//     `;

//     const result = await this.neo4jSession.run(query, params);
    
//     if (!result.records || result.records.length === 0) {
//       logger.error('Neo4j query returned no records', {
//         userId,
//         category: LogCategory.DATABASE
//       });
//       throw new ErrorResponse(
//         'Failed to update privacy settings',
//         HttpStatus.INTERNAL_SERVER_ERROR,
//         ERROR_CODES.DATABASE_ERROR
//       );
//     }
    
//     const personNode = result.records[0].get('person');
//     const updated = personNode.properties;

//     this.recordSuccess();
//     await this.deleteCache(`privacy:*:${userId}`);

//     logger.auditLog('privacy_settings_updated', userId, {
//       settings: updated,
//       timestamp: new Date().toISOString()
//     });

//     logger.info('Privacy settings updated', {
//       userId,
//       duration: Date.now() - startTime,
//       category: LogCategory.SECURITY
//     });

//     return updated;
//   } catch (error : any) {
//     this.recordFailure();
//     logger.error('Error updating privacy settings', {
//       error: error instanceof Error ? error.message : String(error),
//       userId,
//       duration: Date.now() - startTime,
//       category: LogCategory.SECURITY
//     });
//     throw error;
//   }
// }


async updatePrivacySettings(userId: string, settings: IPrivacySettings): Promise<IPrivacySettings> {
  const startTime = Date.now();
  
  try {
    if (this.isCircuitOpen()) {
      throw new ErrorResponse(
        'Service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.SERVICE_UNAVAILABLE
      );
    }

    this.validateSettings(settings);

    if (!this.neo4jSession) {
      throw new ErrorResponse(
        'Database not connected',
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.SERVICE_UNAVAILABLE
      );
    }

    // ✅ FIX: Create NEW session for each request
    const session = await createNeo4jSession(); // New session
    
    try {
      // Build dynamic SET clause
      const setFields: string[] = [];
      const params: any = { userId };
      
      const standardFields = {
        visibility: settings.visibility,
        profileVisibility: settings.profileVisibility,
        viewersVisible: settings.viewersVisible,
        allowMessagesFrom: settings.allowMessagesFrom,
        showActivityStatus: settings.showActivityStatus,
        showConnectionList: settings.showConnectionList,
        searchable: settings.searchable,
        allowTagging: settings.allowTagging,
        dataSharing: settings.dataSharing
      };
      
      Object.entries(standardFields).forEach(([key, value]) => {
        if (value !== undefined) {
          setFields.push(`p.${key} = $${key}`);
          params[key] = value;
        }
      });
      
      Object.entries(settings).forEach(([key, value]) => {
        if (!standardFields.hasOwnProperty(key) && value !== undefined) {
          setFields.push(`p.${key} = $${key}`);
          params[key] = value;
        }
      });
      
      setFields.push('p.updatedAt = datetime()');
      
      const query = `
        MERGE (p:Person {id: $userId})
        ON CREATE SET p.createdAt = datetime()
        SET ${setFields.join(', ')}
        RETURN p as person
      `;

      const result = await session.run(query, params); // ✅ Use new session
      
      if (!result.records || result.records.length === 0) {
        throw new ErrorResponse(
          'Failed to update privacy settings',
          HttpStatus.INTERNAL_SERVER_ERROR,
          ERROR_CODES.DATABASE_ERROR
        );
      }
      
      const personNode = result.records[0].get('person');
      const updated = personNode.properties;

      this.recordSuccess();
      await this.deleteCache(`privacy:*:${userId}`);

      logger.auditLog('privacy_settings_updated', userId, {
        settings: updated,
        timestamp: new Date().toISOString()
      });

      logger.info('Privacy settings updated', {
        userId,
        duration: Date.now() - startTime,
        category: LogCategory.SECURITY
      });

      return updated;
    } finally {
      await session.close(); // ✅ Always close new session
    }
  } catch (error : any) {
    this.recordFailure();
    logger.error('Error updating privacy settings', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      duration: Date.now() - startTime,
      category: LogCategory.SECURITY
    });
    throw error;
  }
}

  private validateSettings(settings: IPrivacySettings): void {
    const validVisibilities = ['public', 'private', 'connections'];
    const validMessageSettings = ['everyone', 'connections', 'nobody'];

    if (settings.visibility && !validVisibilities.includes(settings.visibility)) {
      throw new ErrorResponse('Invalid visibility setting', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
    }

    if (settings.profileVisibility && !validVisibilities.includes(settings.profileVisibility)) {
      throw new ErrorResponse('Invalid profile visibility', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
    }

    if (settings.allowMessagesFrom && !validMessageSettings.includes(settings.allowMessagesFrom)) {
      throw new ErrorResponse('Invalid message setting', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
    }
  }

  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    const startTime = Date.now();
    const lockKey = `lock:block:${blockerId}:${blockedId}`;
    
    try {
      if (blockerId === blockedId) {
        throw new ErrorResponse('Cannot block yourself', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
      }

      if (!this.redisClient) {
        throw new ErrorResponse(
          'Cache service unavailable',
          HttpStatus.SERVICE_UNAVAILABLE,
          ERROR_CODES.SERVICE_UNAVAILABLE
        ); 
      }

      const lockAcquired = await this.redisClient.set(lockKey, '1', 'NX', 'EX', 10);
      if (!lockAcquired) {
        throw new ErrorResponse('Block operation in progress', HttpStatus.CONFLICT, ERROR_CODES.CONFLICT);
      }

      try {
        const existing = await ConnectionBlock.findOne({ blockerId, blockedId });
        if (existing) {
          throw new ErrorResponse('User already blocked', HttpStatus.CONFLICT, ERROR_CODES.CONFLICT);
        }
        const block = new ConnectionBlock({
          blockerId,
          blockedId,
          blockedAt: new Date(),
          reason: 'other'
        });
        await block.save();

        if (!this.isCircuitOpen() && this.neo4jSession) {
          const query = `
            MATCH (blocker:Person {id: $blockerId}), (blocked:Person {id: $blockedId})
            MERGE (blocker)-[r:BLOCKED {blockedAt: datetime(), active: true}]->(blocked)
            RETURN r
          `;
          await this.neo4jSession.run(query, { blockerId, blockedId });
        }

        await Connection.deleteOne({
          $or: [
            { fromUserId: blockerId, toUserId: blockedId },
            { fromUserId: blockedId, toUserId: blockerId }
          ]
        });

        await this.deleteCache(`connections:${blockerId}*`);
        await this.deleteCache(`connections:${blockedId}*`);
        await this.deleteCache(`privacy:blocked:${blockerId}`);

        logger.auditLog('user_blocked', blockerId, {
          blockedId,
          timestamp: new Date().toISOString()
        });

        logger.info('User blocked successfully', {
          blockerId,
          blockedId,
          duration: Date.now() - startTime,
          category: LogCategory.SECURITY
        });
      } finally {
        await this.redisClient.del(lockKey);
      }
    } catch (error : any) {
      logger.error('Error blocking user', {
        error: error instanceof Error ? error.message : String(error),
        blockerId,
        blockedId,
        duration: Date.now() - startTime,
        category: LogCategory.SECURITY
      });
      throw error;
    }
  }

  async getBlockedUsers(userId: string, params: PrivacyQueryParams = {}): Promise<any> {
    const startTime = Date.now();
    
    try {
      const page = Math.max(1, params.page || 1);
      const limit = Math.min(100, params.limit || 20);
      const skip = (page - 1) * limit;

      const cacheKey = `privacy:blocked:${userId}:${page}:${limit}`;
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      const [blocked, total] = await Promise.all([
        ConnectionBlock.find({ blockerId: userId })
          .sort({ blockedAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('blockedId blockedAt reason')
          .lean(),
        ConnectionBlock.countDocuments({ blockerId: userId })
      ]);

      const result = {
        blockedUsers: blocked,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      };

      await this.setCache(cacheKey, result, 300);

      logger.info('Blocked users retrieved', {
        userId,
        count: blocked.length,
        duration: Date.now() - startTime,
        category: LogCategory.SECURITY
      });

      return result;
    } catch (error : any) {
      logger.error('Error getting blocked users', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        duration: Date.now() - startTime,
        category: LogCategory.SECURITY
      });
      throw error;
    }
  }

  async batchUpdatePrivacy(userIds: string[], settings: Partial<IPrivacySettings>): Promise<void> {
    const startTime = Date.now();
    const batchSize = 100;
    
    try {
      if (userIds.length > 1000) {
        throw new ErrorResponse('Batch size exceeds limit', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
      }

      this.validateSettings(settings as IPrivacySettings);

      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(userId => this.updatePrivacySettings(userId, settings as IPrivacySettings))
        );

        logger.debug(`Batch privacy update progress: ${Math.min(i + batchSize, userIds.length)}/${userIds.length}`, {
          category: LogCategory.SECURITY
        });
      }

      logger.auditLog('batch_privacy_update', 'system', {
        userCount: userIds.length,
        settings,
        duration: Date.now() - startTime
      });

      logger.info('Batch privacy update completed', {
        userCount: userIds.length,
        duration: Date.now() - startTime,
        category: LogCategory.SECURITY
      });
    } catch (error : any) {
      logger.error('Error in batch privacy update', {
        error: error instanceof Error ? error.message : String(error),
        userCount: userIds.length,
        duration: Date.now() - startTime,
        category: LogCategory.SECURITY
      });
      throw error;
    }
  }

  private startMetricsReporting(): void {
    setInterval(() => {
      if (this.cacheMetrics.hits + this.cacheMetrics.misses > 0) {
        const hitRate = (this.cacheMetrics.hits / (this.cacheMetrics.hits + this.cacheMetrics.misses)) * 100;
        
        logger.info('Privacy cache metrics', {
          hits: this.cacheMetrics.hits,
          misses: this.cacheMetrics.misses,
          errors: this.cacheMetrics.errors,
          hitRate: hitRate.toFixed(2) + '%',
          category: LogCategory.PERFORMANCE
        });
      }
    }, 60000);
  }

  async setProfileVisibility(userId: string, visibility: 'public' | 'private' | 'connections'): Promise<void> {
    const settings = await this.getPrivacySettings(userId);
    await this.updatePrivacySettings(userId, { ...settings, profileVisibility: visibility });
  }

  async getProfileVisibility(userId: string): Promise<string> {
    const settings = await this.getPrivacySettings(userId);
    return settings.profileVisibility || 'public';
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await ConnectionBlock.deleteOne({ blockerId, blockedId });
    await this.deleteCache(`privacy:blocked:${blockerId}*`);
    logger.auditLog('user_unblocked', blockerId, { blockedId });
  }

  async checkIsBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const exists = await ConnectionBlock.exists({ blockerId, blockedId });
    return !!exists;
  }

  async setConnectionVisibility(connectionId: string, visibility: string): Promise<void> {
    await Connection.findByIdAndUpdate(connectionId, { visibility });
  }

  async getConnectionVisibility(connectionId: string): Promise<string> {
    const connection = await Connection.findById(connectionId);
    return connection?.visibility || 'public';
  }

  async setViewersVisibility(userId: string, visible: boolean): Promise<void> {
    const settings = await this.getPrivacySettings(userId);
    await this.updatePrivacySettings(userId, { ...settings, viewersVisible: visible });
  }

  async getViewersVisibility(userId: string): Promise<boolean> {
    const settings = await this.getPrivacySettings(userId);
    return settings.viewersVisible ?? true;
  }

  async anonymizeView(viewId: string): Promise<void> {
    await WhoViewedProfile.findByIdAndUpdate(viewId, { viewerId: 'anonymous' });
  }

  async getPrivacyAnalytics(userId: string): Promise<any> {
    const [blockedCount, viewsCount, settings] = await Promise.all([
      ConnectionBlock.countDocuments({ blockerId: userId }),
      WhoViewedProfile.countDocuments({ viewedId: userId }),
      this.getPrivacySettings(userId)
    ]);
    
    return { blockedCount, viewsCount, settings };
  }

  async applyPrivacyRules(userId: string, queryResults: any[]): Promise<any[]> {
    return queryResults.filter(result => result.visibility !== 'private' || result.owner === userId);
  }

  async cachePrivacySettings(userId: string, settings: IPrivacySettings): Promise<void> {
    await this.setCache(`privacy:settings:${userId}`, settings);
  }

  async invalidatePrivacyCache(userId: string): Promise<void> {
    await this.deleteCache(`privacy:*:${userId}`);
  }

  async exportPrivacyData(userId: string): Promise<string> {
    const data = await this.getPrivacySettings(userId);
    return JSON.stringify(data, null, 2);
  }

  async importPrivacyData(userId: string, data: string): Promise<void> {
    const parsedSettings = JSON.parse(data);
    await this.updatePrivacySettings(userId, parsedSettings);
  }

  async isNotificationEnabled(userId: string, notificationType: string): Promise<boolean> {
    try {
      const settings = await this.getPrivacySettings(userId);
      return settings[`notify_${notificationType}`] !== false;
    } catch (error : any) {
      logger.error('Failed to check notification settings', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        notificationType,
        category: LogCategory.SECURITY
      });
      return true;
    }
  }

  async getProfileViewPrivacy(profileId: string): Promise<string | null> {
    try {
      const settings = await this.getPrivacySettings(profileId);
      return settings.profileVisibility || 'public';
    } catch (error : any) {
      logger.error('Failed to get profile view privacy', {
        error: error instanceof Error ? error.message : String(error),
        profileId,
        category: LogCategory.SECURITY
      });
      return 'public';
    }
  }

  async close(): Promise<void> {
    if (this.neo4jSession) {
      await this.neo4jSession.close();
    }
    logger.info('PrivacyService closed', { category: LogCategory.SECURITY });
  }
}

export const privacyService = new PrivacyService();
export default privacyService;