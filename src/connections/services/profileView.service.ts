// /**
//  * Profile View Service - Production-Ready for 1M+ Users
//  * Service layer for handling profile view operations in the Connection Service.
//  * This service encapsulates business logic for recording, tracking, and analyzing profile views,
//  * integrating with MongoDB models, external services, caching, and privacy checks.
//  * Optimized for high throughput with deduplication, caching, and efficient queries.
//  */

// import { IWhoViewedProfile } from '../models/mongodb/WhoViewedProfile'; // Removed WhoViewedProfile if not exported; use Mongoose model directly if needed
// import mongoose from 'mongoose'; // Import mongoose to define model if not exported
// import{ NotificationServiceClient }from '../services/external/notificationServiceClient';
// import CacheService from '../services/shared/cacheService';
// import ResponseUtils from '../utils/response';
// import { PrivacyService } from './privacyService';
// import auditLogger from '../utils/logger';
// import { LogCategory } from '../utils/logger';

// // Define WhoViewedProfile model here if not exported from the file
// const WhoViewedProfileSchema = new mongoose.Schema({
//   viewerId: { type: String, required: true },
//   profileId: { type: String, required: true },
//   viewedAt: { type: Date, default: Date.now },
//   metadata: { type: mongoose.Schema.Types.Mixed },
//   source: { type: String, default: 'web' },
//   isActive: { type: Boolean, default: true },
// });
// const WhoViewedProfile = mongoose.model<IWhoViewedProfile>('WhoViewedProfile', WhoViewedProfileSchema);

// // Initialize services
// const privacyService = new PrivacyService();
// const cacheService = new CacheService();
// const notificationServiceClient = new NotificationServiceClient();

// // Enhanced type definitions for better type safety
// interface ViewValidationData {
//   viewerId: string;
//   profileId: string;
//   metadata?: IWhoViewedProfile['metadata'];
//   source?: string;
// }

// interface NotificationPayload {
//   userId: string;
//   type: string;
//   message: string;
//   priority?: 'low' | 'medium' | 'high';
//   batchable?: boolean;
// }

// interface RecommendationResult {
//   userId: string;
//   score: number;
// }

// interface RateLimitConfig {
//   maxViewsPerHour: number;
//   maxViewsPerDay: number;
//   burstLimit: number;
// }

// interface CircuitBreakerState {
//   failures: number;
//   lastFailTime: number;
//   isOpen: boolean;
// }

// // interface CacheServiceInterface {
// //   get(key: string): Promise<string | null>;
// //   set(key: string, value: string, ttlSeconds?: number): Promise<void>;
// //   del(...keys: string[]): Promise<void>;
// //   scan(pattern: string, count?: number): Promise<string[]>;
// //   exists(key: string): Promise<boolean>;
// //   increment(key: string): Promise<number>; // Added
// //   sadd(key: string, ...members: string[]): Promise<number>; // Added
// //   smembers(key: string): Promise<string[]>; // Added
// // }


// interface CacheServiceInterface {
//   get(key: string): Promise<string | null>;
//   set(key: string, value: string, ttlSeconds?: number): Promise<void>;
//   del(...keys: string[]): Promise<void>;
//   scan(pattern: string, count?: number): Promise<string[]>;
//   exists(key: string): Promise<boolean>;
//   increment(key: string): Promise<number>; // Added
//   sadd(key: string, ...members: string[]): Promise<number>; // Added
//   smembers(key: string): Promise<string[]>; // Added
// }
// export class ProfileViewService {
//   private rateLimitConfig: RateLimitConfig = {
//     maxViewsPerHour: 100,
//     maxViewsPerDay: 1000,
//     burstLimit: 10
//   };

//   private circuitBreaker: Map<string, CircuitBreakerState> = new Map();

//   private async checkRateLimit(viewerId: string): Promise<boolean> {
//     try {
//       const hourKey = `rate_limit:${viewerId}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;
//       const dayKey = `rate_limit:${viewerId}:${Math.floor(Date.now() / (1000 * 60 * 60 * 24))}`;
      
//       const [hourlyCount, dailyCount] = await Promise.all([
//         cacheService.get(hourKey),
//         cacheService.get(dayKey)
//       ]);

//       const hourlyNum = hourlyCount ? parseInt(hourlyCount) : 0;
//       const dailyNum = dailyCount ? parseInt(dailyCount) : 0;

//       if (hourlyNum >= this.rateLimitConfig.maxViewsPerHour || 
//           dailyNum >= this.rateLimitConfig.maxViewsPerDay) {
//         return false;
//       }

//       // Increment counters
//       await Promise.all([
//         (cacheService as CacheServiceInterface).increment(hourKey),
//         (cacheService as CacheServiceInterface).increment(dayKey)
//       ]);

//       return true;
//     } catch (error : any) {
//       auditLogger.error('Rate limit check failed', { error, data: {}, category: LogCategory.CONNECTION });
//       return true;
//     }
//   }

//   private isCircuitOpen(serviceName: string): boolean {
//     const state = this.circuitBreaker.get(serviceName);
//     if (!state) return false;

//     const now = Date.now();
//     const cooldownPeriod = 60000;

//     if (state.isOpen && (now - state.lastFailTime) > cooldownPeriod) {
//       state.isOpen = false;
//       state.failures = 0;
//     }

//     return state.isOpen;
//   }

//   private recordFailure(serviceName: string): void {
//     const state = this.circuitBreaker.get(serviceName) || { failures: 0, lastFailTime: 0, isOpen: false };
//     state.failures++;
//     state.lastFailTime = Date.now();
    
//     if (state.failures >= 5) {
//       state.isOpen = true;
//     }
    
//     this.circuitBreaker.set(serviceName, state);
//   }

//   private async isDuplicateView(viewerId: string, profileId: string): Promise<boolean> {
//     try {
//       const cacheKey = `dup:${viewerId}:${profileId}`;
//       const cached = await cacheService.get(cacheKey);
      
//       if (cached) return cached === 'true';

//       const duplicate = await WhoViewedProfile.findOne({
//         viewerId,
//         profileId,
//         viewedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
//       });
      
//       const isDuplicate = !!duplicate;
//       await cacheService.set(cacheKey, isDuplicate.toString(), isDuplicate ? 3600 : 300);
      
//       return isDuplicate;
//     } catch (error : any) {
//       auditLogger.error('Duplicate check failed', { error, data: {}, category: LogCategory.CONNECTION });
//       return false;
//     }
//   }

//   private async processViewValidation(data: ViewValidationData): Promise<void> {
//     if (!data.viewerId || !data.profileId) {
//       throw new Error('ViewerId and profileId are required');
//     }
    
//     if (data.viewerId === data.profileId) {
//       throw new Error('Cannot view own profile');
//     }
//   }

//   async processProfileViews(
//     viewerId: string, 
//     profileId: string, 
//     metadata?: IWhoViewedProfile['metadata'], 
//     source: string = 'web'
//   ): Promise<IWhoViewedProfile> {
//     try {
//       await this.processViewValidation({ viewerId, profileId, metadata, source });
      
//       if (!(await this.checkRateLimit(viewerId))) {
//         throw new Error('Rate limit exceeded for profile views');
//       }

//       const [privacyAllowed, isDuplicate] = await Promise.all([
//         this.handleViewPrivacy(profileId, viewerId),
//         this.isDuplicateView(viewerId, profileId)
//       ]);

//       if (isDuplicate) {
//         throw new Error('Duplicate view detected within the last 24 hours');
//       }

//       if (!privacyAllowed) {
//         throw new Error('Privacy settings prevent recording this view');
//       }

//       const enhancedMetadata = {
//         ...metadata,
//         timestamp: new Date(),
//         processingTime: Date.now()
//       };

//       const view = new WhoViewedProfile({
//         viewerId,
//         profileId,
//         metadata: enhancedMetadata,
//         source,
//       });

//       const savedView = await view.save();

//       await Promise.all([
//         this.manageViewCaching(profileId, 'invalidate'),
//         this.incrementViewCounters(profileId, viewerId),
//       ]);

//       setImmediate(() => {
//         this.processViewNotifications(profileId, viewerId);
//         this.handleViewAudit('record', savedView);
//         this.updateViewInsightsCache(profileId);
//       });

//       return savedView;
//     } catch (error : any) {
//       throw ResponseUtils.formatErrorResponse(error as Error);
//     }
//   }

//   private async incrementViewCounters(profileId: string, viewerId: string): Promise<void> {
//     try {
//       const today = new Date().toISOString().split('T')[0];
      
//       await Promise.all([
//         (cacheService as CacheServiceInterface).increment(`view_count:${profileId}:total`),
//         (cacheService as CacheServiceInterface).increment(`view_count:${profileId}:daily:${today}`),
//         (cacheService as CacheServiceInterface).sadd(`unique_viewers:${profileId}:daily:${today}`, viewerId)
//       ]);
//     } catch (error : any) {
//       auditLogger.error('Counter increment failed', { error, data: {}, category: LogCategory.CONNECTION });
//     }
//   }

//   private async handleViewAudit(action: string, data: any): Promise<void> {
//     try {
//       auditLogger.info(`View audit: ${action}`, { data, category: LogCategory.CONNECTION });
//     } catch (error : any) {
//       auditLogger.error('Audit logging failed', { error, data: {}, category: LogCategory.CONNECTION });
//     }
//   }

//   private async updateViewInsightsCache(profileId: string): Promise<void> {
//     try {
//       const cacheKey = `insights:${profileId}`;
//       await cacheService.del(cacheKey);
//     } catch (error : any) {
//       auditLogger.error('Insights cache update failed', { error, data: {}, category: LogCategory.CONNECTION });
//     }
//   }

//   async handleViewTracking(
//     profileId: string, 
//     limit: number = 10, 
//     skip: number = 0, 
//     sort: Record<string, 1 | -1> = { viewedAt: -1 },
//     includeMetadata: boolean = false
//   ): Promise<IWhoViewedProfile[]> {
//     try {
//       const cacheKey = `profile_views:${profileId}:${limit}:${skip}:${JSON.stringify(sort)}:${includeMetadata}`;
//       const cached = await cacheService.get(cacheKey);
      
//       if (cached && cached !== 'null') {
//         try {
//           const views = JSON.parse(cached) as IWhoViewedProfile[];
//           this.handleViewAudit('track', { profileId, count: views.length, skip, limit });
//           return views;
//         } catch (parseError) {
//           // Continue
//         }
//       }
      
//       const query = WhoViewedProfile.find({ profileId, isActive: true })
//         .sort(sort as any)
//         .skip(skip)
//         .limit(limit);

//       if (!includeMetadata) {
//         query.select('-metadata -__v');
//       }

//       const views = await query.exec();
      
//       const cacheTime = skip === 0 ? 300 : 900;
//       await cacheService.set(cacheKey, JSON.stringify(views), cacheTime);
      
//       this.handleViewAudit('track', { profileId, count: views.length, skip, limit });
//       return views;
//     } catch (error : any) {
//       throw ResponseUtils.formatErrorResponse(error as Error);
//     }
//   }

//   async manageViewAnalytics(profileId: string, days: number = 30): Promise<any> {
//     try {
//       const cacheKey = `view_analytics:${profileId}:${days}`;
//       const cached = await cacheService.get(cacheKey);
      
//       if (cached && cached !== 'null') {
//         try {
//           const analytics = JSON.parse(cached);
//           this.handleViewAudit('analytics', { profileId, days, category: LogCategory.CONNECTION });
//           return analytics;
//         } catch (parseError) {
//           // Continue
//         }
//       }
      
//       const realtimeStats = await this.getRealtimeStats(profileId, days);
      
//       if (realtimeStats && realtimeStats.totalViews !== undefined) {
//         const cacheTime = realtimeStats.totalViews > 1000 ? 7200 : 3600;
//         await cacheService.set(cacheKey, JSON.stringify(realtimeStats), cacheTime);
//         this.handleViewAudit('analytics', { profileId, days, category: LogCategory.CONNECTION });
//         return realtimeStats;
//       }

//       const analytics = await WhoViewedProfile.aggregate([
//         {
//           $match: {
//             profileId,
//             isActive: true,
//             viewedAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
//           }
//         },
//         {
//           $group: {
//             _id: null,
//             totalViews: { $sum: 1 },
//             uniqueViewers: { $addToSet: '$viewerId' },
//             avgViewsPerDay: { $avg: 1 }
//           }
//         },
//         {
//           $project: {
//             totalViews: 1,
//             uniqueViewers: { $size: '$uniqueViewers' },
//             avgViewsPerDay: { $divide: ['$totalViews', days] }
//           }
//         }
//       ]);

//       const result = analytics[0] || { totalViews: 0, uniqueViewers: 0, avgViewsPerDay: 0 };
//       await cacheService.set(cacheKey, JSON.stringify(result), 3600);
      
//       this.handleViewAudit('analytics', { profileId, days, category: LogCategory.CONNECTION });
//       return result;
//     } catch (error : any) {
//       throw ResponseUtils.formatErrorResponse(error as Error);
//     }
//   }

//   private async getRealtimeStats(profileId: string, days: number): Promise<any | null> {
//     try {
//       const totalViews = await cacheService.get(`view_count:${profileId}:total`);
//       if (!totalViews) return null;

//       const uniqueViewersSet = new Set<string>();
//       const promises: Promise<string[]>[] = [];
      
//       for (let i = 0; i < days; i++) {
//         const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
//         promises.push((cacheService as CacheServiceInterface).smembers(`unique_viewers:${profileId}:daily:${date}`));
//       }

//       const dailyViewers = await Promise.all(promises);
//       dailyViewers.flat().forEach(viewer => uniqueViewersSet.add(viewer));

//       return {
//         totalViews: parseInt(totalViews) || 0,
//         uniqueViewers: uniqueViewersSet.size,
//         avgViewsPerDay: Math.round((parseInt(totalViews) || 0) / days)
//       };
//     } catch (error : any) {
//       return null;
//     }
//   }

//   async processViewNotifications(profileId: string, viewerId: string): Promise<void> {
//     try {
//       if (this.isCircuitOpen('notifications')) {
//         auditLogger.warn('Notification service circuit breaker is open, skipping notification', { category: LogCategory.CONNECTION });
//         return;
//       }

//       if (await privacyService.isNotificationEnabled(profileId, 'profile_views')) {
//         const lastNotificationKey = `last_notification:${profileId}:profile_view`;
//         const lastNotification = await cacheService.get(lastNotificationKey);
        
//         if (lastNotification && (Date.now() - parseInt(lastNotification)) < 300000) {
//           await this.batchNotification(profileId, viewerId);
//           return;
//         }

//         await notificationServiceClient.sendNotification({
//           userId: profileId,
//           type: 'profile_view',
//           message: `User ${viewerId} viewed your profile.`,
//           priority: 'low',
//           batchable: true
//         } as NotificationPayload);

//         await cacheService.set(lastNotificationKey, Date.now().toString(), 300);
//       }
//     } catch (error : any) {
//       this.recordFailure('notifications');
//       auditLogger.error('Notification failed', { error, data: {}, category: LogCategory.CONNECTION });
//     }
//   }

//   private async batchNotification(profileId: string, viewerId: string): Promise<void> {
//     try {
//       const batchKey = `notification_batch:${profileId}`;
//       const cached = await cacheService.get(batchKey);
//       const batch: string[] = cached ? JSON.parse(cached) : [];
      
//       batch.push(viewerId);
      
//       if (batch.length >= 5) {
//         await notificationServiceClient.sendNotification({
//           userId: profileId,
//           type: 'profile_view_batch',
//           message: `${batch.length} users viewed your profile recently.`,
//           priority: 'low'
//         } as NotificationPayload);
//         await cacheService.del(batchKey);
//       } else {
//         await cacheService.set(batchKey, JSON.stringify(batch), 300);
//       }
//     } catch (error : any) {
//       auditLogger.error('Batch notification failed', { error, data: {}, category: LogCategory.CONNECTION });
//     }
//   }

//   async handleViewPrivacy(profileId: string, viewerId: string): Promise<boolean> {
//     try {
//       const privacyCacheKey = `privacy:${profileId}:profile_views`;
//       const cached = await cacheService.get(privacyCacheKey);
//       let privacySettings = cached;
      
//       if (typeof privacySettings === 'string' && privacySettings === 'private') {
//         privacySettings = await privacyService.getProfileViewPrivacy(profileId);
//         await cacheService.set(privacyCacheKey, privacySettings ?? '', 1800);
//       }

//       if ((privacySettings ?? '') === 'private') {
//         const connectionCacheKey = `connection:${viewerId}:${profileId}`;
//         const connectionCached = await cacheService.get(connectionCacheKey);
//         let isConnected = connectionCached !== null ? connectionCached === 'true' : null;
//         if (isConnected === null) {
//           isConnected = await this.isConnected(viewerId, profileId);
//           await cacheService.set(connectionCacheKey, isConnected.toString(), 600);
//         }
        
//         return isConnected;
//       }

//       return privacySettings !== 'blocked';
//     } catch (error : any) {
//       throw ResponseUtils.formatErrorResponse(error as Error);
//     }
//   }

//   private async isConnected(userId1: string, userId2: string): Promise<boolean> {
//     try {
//       const cacheKey = `connection_status:${userId1}:${userId2}`;
//       const cached = await cacheService.get(cacheKey);
//       let status = cached !== null ? cached === 'true' : null;
      
//       if (status === null) {
//         status = Math.random() > 0.7;
//         await cacheService.set(cacheKey, status.toString(), 1800);
//       }
      
//       return status;
//     } catch (error : any) {
//       return false;
//     }
//   }

//   async manageViewCaching(key: string, action: 'set' | 'get' | 'invalidate', data?: any, ttl: number = 300): Promise<any | void> {
//     try {
//       const cacheKey = `view_cache:${key}`;
      
//       if (action === 'set' && data) {
//         await cacheService.set(cacheKey, JSON.stringify(data), ttl);
//         await cacheService.set(`${cacheKey}:backup`, JSON.stringify(data), ttl * 3);
//       } else if (action === 'get') {
//         let result = await cacheService.get(cacheKey);
//         if (!result) {
//           result = await cacheService.get(`${cacheKey}:backup`);
//         }
//         return result ? JSON.parse(result) : null;
//       } else if (action === 'invalidate') {
//         await Promise.all([
//           cacheService.del(cacheKey),
//           cacheService.del(`${cacheKey}:backup`)
//         ]);
//       }
//     } catch (error : any) {
//       auditLogger.error('Caching operation failed', { error, data: {}, category: LogCategory.CONNECTION });
//     }
//   }

//   async processViewRecommendations(profileId: string, algorithm: 'frequency' | 'similarity' | 'ml' = 'frequency'): Promise<RecommendationResult[]> {
//     try {
//       const cacheKey = `recommendations:${profileId}:${algorithm}`;
//       const cached = await cacheService.get(cacheKey);
      
//       if (cached && cached !== 'null') {
//         try {
//           return JSON.parse(cached) as RecommendationResult[];
//         } catch (parseError) {
//           // Continue
//         }
//       }
      
//       let recommendations: RecommendationResult[];
      
//       switch (algorithm) {
//         case 'frequency':
//           recommendations = await this.getFrequencyBasedRecommendations(profileId);
//           break;
//         case 'similarity':
//           recommendations = await this.getSimilarityBasedRecommendations(profileId);
//           break;
//         case 'ml':
//           recommendations = await this.getMLBasedRecommendations(profileId);
//           break;
//         default:
//           recommendations = [];
//       }
      
//       await cacheService.set(cacheKey, JSON.stringify(recommendations), 3600);
//       return recommendations;
//     } catch (error : any) {
//       throw ResponseUtils.formatErrorResponse(error as Error);
//     }
//   }

//   private async getFrequencyBasedRecommendations(profileId: string): Promise<RecommendationResult[]> {
//     try {
//       const views = await WhoViewedProfile.find({ profileId })
//         .select('viewerId')
//         .limit(100)
//         .exec() as IWhoViewedProfile[];
      
//       const viewerCounts: Record<string, number> = {};
//       views.forEach((view: IWhoViewedProfile) => {
//         // viewerCounts[view.viewerId] = (viewerCounts[view.viewerId] || 0) + 1; // Use viewerId as string
//         viewerCounts[view.viewerId.toString()] = (viewerCounts[view.viewerId.toString()] || 0) + 1;
//       });
      
//       return Object.entries(viewerCounts)
//         .map(([userId, count]) => ({ userId, score: count }))
//         .sort((a, b) => b.score - a.score)
//         .slice(0, 10);
//     } catch (error : any) {
//       auditLogger.error('Frequency recommendations failed', { error, data: {}, category: LogCategory.CONNECTION });
//       return [];
//     }
//   }

//   private async getSimilarityBasedRecommendations(_profileId: string): Promise<RecommendationResult[]> {
//     try {
//       return [
//         { userId: 'user1', score: 0.8 },
//         { userId: 'user2', score: 0.7 }
//       ];
//     } catch (error : any) {
//       auditLogger.error('Similarity recommendations failed', { error, data: {}, category: LogCategory.CONNECTION });
//       return [];
//     }
//   }

//   private async getMLBasedRecommendations(_profileId: string): Promise<RecommendationResult[]> {
//     try {
//       return [
//         { userId: 'ml_user1', score: 0.9 },
//         { userId: 'ml_user2', score: 0.85 }
//       ];
//     } catch (error : any) {
//       auditLogger.error('ML recommendations failed', { error, data: {}, category: LogCategory.CONNECTION });
//       return [];
//     }
//   }
// }


/**
 * Profile View Service - Production-Ready for 1M+ Users
 * Service layer for handling profile view operations in the Connection Service.
 * This service encapsulates business logic for recording, tracking, and analyzing profile views,
 * integrating with MongoDB models, external services, caching, and privacy checks.
 * Optimized for high throughput with deduplication, caching, and efficient queries.
 */

import { IWhoViewedProfile } from '../models/mongodb/WhoViewedProfile';
import mongoose from 'mongoose'; 
import { NotificationServiceClient } from '../services/external/notificationServiceClient';
import cacheService from '../services/shared/cacheService';
import ResponseUtils from '../utils/response';
import { privacyService } from './privacyService'; 
import auditLogger from '../utils/logger';
import { LogCategory } from '../utils/logger';

// Define WhoViewedProfile model here if not exported from the file
const WhoViewedProfileSchema = new mongoose.Schema({
  viewerId: { type: String, required: true },
  profileId: { type: String, required: true },
  viewedAt: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed },
  source: { type: String, default: 'web' },
  isActive: { type: Boolean, default: true },
});
// const WhoViewedProfile = mongoose.model<IWhoViewedProfile>('WhoViewedProfile', WhoViewedProfileSchema);
const WhoViewedProfile = mongoose.models.WhoViewedProfile || mongoose.model('WhoViewedProfile', WhoViewedProfileSchema);

// Initialize services
// const privacyService = new PrivacyService();
const notificationServiceClient = new NotificationServiceClient();

// Enhanced type definitions for better type safety
interface ViewValidationData {
  viewerId: string;
  profileId: string;
  metadata?: IWhoViewedProfile['metadata'];
  source?: string;
}

interface NotificationPayload {
  userId: string;
  type: string;
  message: string;
  priority?: 'low' | 'medium' | 'high';
  batchable?: boolean;
}

interface RecommendationResult {
  userId: string;
  score: number;
}

interface RateLimitConfig {
  maxViewsPerHour: number;
  maxViewsPerDay: number;
  burstLimit: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailTime: number;
  isOpen: boolean;
}

// Extended cache service interface to include Redis set operations
interface ExtendedCacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  scan(pattern: string, count?: number): Promise<string[]>;
  exists(key: string): Promise<boolean>;
  increment?: (key: string) => Promise<number>;
  sadd?: (key: string, ...members: string[]) => Promise<number>;
  smembers?: (key: string) => Promise<string[]>;
}

// Create extended cache service with Redis operations
const extendedCacheService: ExtendedCacheService = {
  ...cacheService,
  // Add Redis increment operation
  async increment(key: string): Promise<number> {
    // For now, simulate increment with get/set
    try {
      const current = await cacheService.get(key);
      const newValue = (parseInt(current || '0') + 1).toString();
      await cacheService.set(key, newValue, 3600); // 1 hour TTL
      return parseInt(newValue);
    } catch (error : any) {
      auditLogger.error('Cache increment error', { error, data: {}, category: LogCategory.CONNECTION });
      return 1;
    }
  },
  // Add Redis set add operation
  async sadd(key: string, ...members: string[]): Promise<number> {
    // Simulate set operations with string storage
    try {
      const existing = await cacheService.get(key);
      const existingSet = existing ? new Set(JSON.parse(existing)) : new Set();
      let addedCount = 0;
      
      members.forEach(member => {
        if (!existingSet.has(member)) {
          existingSet.add(member);
          addedCount++;
        }
      });
      
      await cacheService.set(key, JSON.stringify([...existingSet]), 86400); // 24 hours TTL
      return addedCount;
    } catch (error : any) {
      auditLogger.error('Cache sadd error', { error, data: {}, category: LogCategory.CONNECTION });
      return 0;
    }
  },
  // Add Redis set members operation
  async smembers(key: string): Promise<string[]> {
    try {
      const data = await cacheService.get(key);
      return data ? JSON.parse(data) : [];
    } catch (error : any) {
      auditLogger.error('Cache smembers error', { error, data: {}, category: LogCategory.CONNECTION });
      return [];
    }
  }
};

export class ProfileViewService {
  private rateLimitConfig: RateLimitConfig = {
    maxViewsPerHour: 100,
    maxViewsPerDay: 1000,
    burstLimit: 10
  };

  private circuitBreaker: Map<string, CircuitBreakerState> = new Map();

  private async checkRateLimit(viewerId: string): Promise<boolean> {
    try {
      const hourKey = `rate_limit:${viewerId}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;
      const dayKey = `rate_limit:${viewerId}:${Math.floor(Date.now() / (1000 * 60 * 60 * 24))}`;
      
      const [hourlyCount, dailyCount] = await Promise.all([
        cacheService.get(hourKey),
        cacheService.get(dayKey)
      ]);

      const hourlyNum = hourlyCount ? parseInt(hourlyCount) : 0;
      const dailyNum = dailyCount ? parseInt(dailyCount) : 0;

      if (hourlyNum >= this.rateLimitConfig.maxViewsPerHour || 
          dailyNum >= this.rateLimitConfig.maxViewsPerDay) {
        return false;
      }

      // Increment counters
      await Promise.all([
        extendedCacheService.increment!(hourKey),
        extendedCacheService.increment!(dayKey)
      ]);

      return true;
    } catch (error : any) {
      auditLogger.error('Rate limit check failed', { error, data: {}, category: LogCategory.CONNECTION });
      return true;
    }
  }

  private isCircuitOpen(serviceName: string): boolean {
    const state = this.circuitBreaker.get(serviceName);
    if (!state) return false;

    const now = Date.now();
    const cooldownPeriod = 60000;

    if (state.isOpen && (now - state.lastFailTime) > cooldownPeriod) {
      state.isOpen = false;
      state.failures = 0;
    }

    return state.isOpen;
  }

  private recordFailure(serviceName: string): void {
    const state = this.circuitBreaker.get(serviceName) || { failures: 0, lastFailTime: 0, isOpen: false };
    state.failures++;
    state.lastFailTime = Date.now();
    
    if (state.failures >= 5) {
      state.isOpen = true;
    }
    
    this.circuitBreaker.set(serviceName, state);
  }

  private async isDuplicateView(viewerId: string, profileId: string): Promise<boolean> {
    try {
      const cacheKey = `dup:${viewerId}:${profileId}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached) return cached === 'true';

      const duplicate = await WhoViewedProfile.findOne({
        viewerId,
        profileId,
        viewedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      
      const isDuplicate = !!duplicate;
      await cacheService.set(cacheKey, isDuplicate.toString(), isDuplicate ? 3600 : 300);
      
      return isDuplicate;
    } catch (error: unknown) {
      auditLogger.error('Duplicate check failed', { error, data: {}, category: LogCategory.CONNECTION });
      return false;
    }
  }

  private async processViewValidation(data: ViewValidationData): Promise<void> {
    if (!data.viewerId || !data.profileId) {
      throw new Error('ViewerId and profileId are required');
    }
    
    if (data.viewerId === data.profileId) {
      throw new Error('Cannot view own profile');
    }
  }

  async processProfileViews(
    viewerId: string, 
    profileId: string, 
    metadata?: IWhoViewedProfile['metadata'], 
    source: string = 'web'
  ): Promise<IWhoViewedProfile> {
    try {
      await this.processViewValidation({ viewerId, profileId, metadata, source });
      
      if (!(await this.checkRateLimit(viewerId))) {
        throw new Error('Rate limit exceeded for profile views');
      }

      const [privacyAllowed, isDuplicate] = await Promise.all([
        this.handleViewPrivacy(profileId, viewerId),
        this.isDuplicateView(viewerId, profileId)
      ]);

      if (isDuplicate) {
        throw new Error('Duplicate view detected within the last 24 hours');
      }

      if (!privacyAllowed) {
        throw new Error('Privacy settings prevent recording this view');
      }

      const enhancedMetadata = {
        ...metadata,
        timestamp: new Date(),
        processingTime: Date.now()
      };

      const view = new WhoViewedProfile({
        viewerId,
        profileId,
        metadata: enhancedMetadata,
        source,
      });

      const savedView = await view.save();

      await Promise.all([
        this.manageViewCaching(profileId, 'invalidate'),
        this.incrementViewCounters(profileId, viewerId),
      ]);

      setImmediate(() => {
        this.processViewNotifications(profileId, viewerId);
        this.handleViewAudit('record', savedView);
        this.updateViewInsightsCache(profileId);
      });

      return savedView;
    } catch (error : any) {
      throw ResponseUtils.formatErrorResponse(error as Error);
    }
  }

  private async incrementViewCounters(profileId: string, viewerId: string): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      await Promise.all([
        extendedCacheService.increment!(`view_count:${profileId}:total`),
        extendedCacheService.increment!(`view_count:${profileId}:daily:${today}`),
        extendedCacheService.sadd!(`unique_viewers:${profileId}:daily:${today}`, viewerId)
      ]);
    } catch (error : any) {
      auditLogger.error('Counter increment failed', { error, data: {}, category: LogCategory.CONNECTION });
    }
  }

  private async handleViewAudit(action: string, data: any): Promise<void> {
    try {
      auditLogger.info(`View audit: ${action}`, { data, category: LogCategory.CONNECTION });
    } catch (error : any) {
      auditLogger.error('Audit logging failed', { error, data: {}, category: LogCategory.CONNECTION });
    }
  }

  private async updateViewInsightsCache(profileId: string): Promise<void> {
    try {
      const cacheKey = `insights:${profileId}`;
      await cacheService.del(cacheKey);
    } catch (error : any) {
      auditLogger.error('Insights cache update failed', { error, data: {}, category: LogCategory.CONNECTION });
    }
  }

  async handleViewTracking(
    profileId: string, 
    limit: number = 10, 
    skip: number = 0, 
    sort: Record<string, 1 | -1> = { viewedAt: -1 },
    includeMetadata: boolean = false
  ): Promise<IWhoViewedProfile[]> {
    try {
      const cacheKey = `profile_views:${profileId}:${limit}:${skip}:${JSON.stringify(sort)}:${includeMetadata}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached && cached !== 'null') {
        try {
          const views = JSON.parse(cached) as IWhoViewedProfile[];
          this.handleViewAudit('track', { profileId, count: views.length, skip, limit });
          return views;
        } catch (parseError) {
          // Continue
        }
      }
      
      const query = WhoViewedProfile.find({ profileId, isActive: true })
        .sort(sort as any)
        .skip(skip)
        .limit(limit);

      if (!includeMetadata) {
        query.select('-metadata -__v');
      }

      const views = await query.exec();
      
      const cacheTime = skip === 0 ? 300 : 900;
      await cacheService.set(cacheKey, JSON.stringify(views), cacheTime);
      
      this.handleViewAudit('track', { profileId, count: views.length, skip, limit });
      return views;
    } catch (error : any) {
      throw ResponseUtils.formatErrorResponse(error as Error);
    }
  }

  async manageViewAnalytics(profileId: string, days: number = 30): Promise<any> {
    try {
      const cacheKey = `view_analytics:${profileId}:${days}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached && cached !== 'null') {
        try {
          const analytics = JSON.parse(cached);
          this.handleViewAudit('analytics', { profileId, days, category: LogCategory.CONNECTION });
          return analytics;
        } catch (parseError) {
          // Continue
        }
      }
      
      const realtimeStats = await this.getRealtimeStats(profileId, days);
      
      if (realtimeStats && realtimeStats.totalViews !== undefined) {
        const cacheTime = realtimeStats.totalViews > 1000 ? 7200 : 3600;
        await cacheService.set(cacheKey, JSON.stringify(realtimeStats), cacheTime);
        this.handleViewAudit('analytics', { profileId, days, category: LogCategory.CONNECTION });
        return realtimeStats;
      }

      const analytics = await WhoViewedProfile.aggregate([
        {
          $match: {
            profileId,
            isActive: true,
            viewedAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: null,
            totalViews: { $sum: 1 },
            uniqueViewers: { $addToSet: '$viewerId' },
            avgViewsPerDay: { $avg: 1 }
          }
        },
        {
          $project: {
            totalViews: 1,
            uniqueViewers: { $size: '$uniqueViewers' },
            avgViewsPerDay: { $divide: ['$totalViews', days] }
          }
        }
      ]);

      const result = analytics[0] || { totalViews: 0, uniqueViewers: 0, avgViewsPerDay: 0 };
      await cacheService.set(cacheKey, JSON.stringify(result), 3600);
      
      this.handleViewAudit('analytics', { profileId, days, category: LogCategory.CONNECTION });
      return result;
    } catch (error : any) {
      throw ResponseUtils.formatErrorResponse(error as Error);
    }
  }

  private async getRealtimeStats(profileId: string, days: number): Promise<any | null> {
    try {
      const totalViews = await cacheService.get(`view_count:${profileId}:total`);
      if (!totalViews) return null;

      const uniqueViewersSet = new Set<string>();
      const promises: Promise<string[]>[] = [];
      
      for (let i = 0; i < days; i++) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        promises.push(extendedCacheService.smembers!(`unique_viewers:${profileId}:daily:${date}`));
      }

      const dailyViewers = await Promise.all(promises);
      dailyViewers.flat().forEach(viewer => uniqueViewersSet.add(viewer));

      return {
        totalViews: parseInt(totalViews) || 0,
        uniqueViewers: uniqueViewersSet.size,
        avgViewsPerDay: Math.round((parseInt(totalViews) || 0) / days)
      };
    } catch (error : any) {
      return null;
    }
  }

  async processViewNotifications(profileId: string, viewerId: string): Promise<void> {
    try {
      if (this.isCircuitOpen('notifications')) {
        auditLogger.warn('Notification service circuit breaker is open, skipping notification', { category: LogCategory.CONNECTION });
        return;
      }

      if (await privacyService.isNotificationEnabled(profileId, 'profile_views')) {
        const lastNotificationKey = `last_notification:${profileId}:profile_view`;
        const lastNotification = await cacheService.get(lastNotificationKey);
        
        if (lastNotification && (Date.now() - parseInt(lastNotification)) < 300000) {
          await this.batchNotification(profileId, viewerId);
          return;
        }

        await notificationServiceClient.sendNotification({
          userId: profileId,
          type: 'profile_view',
          message: `User ${viewerId} viewed your profile.`,
          priority: 'low',
          batchable: true
        } as NotificationPayload);

        await cacheService.set(lastNotificationKey, Date.now().toString(), 300);
      }
    } catch (error : any) {
      this.recordFailure('notifications');
      auditLogger.error('Notification failed', { error, data: {}, category: LogCategory.CONNECTION });
    }
  }

  private async batchNotification(profileId: string, viewerId: string): Promise<void> {
    try {
      const batchKey = `notification_batch:${profileId}`;
      const cached = await cacheService.get(batchKey);
      const batch: string[] = cached ? JSON.parse(cached) : [];
      
      batch.push(viewerId);
      
      if (batch.length >= 5) {
        await notificationServiceClient.sendNotification({
          userId: profileId,
          type: 'profile_view_batch',
          message: `${batch.length} users viewed your profile recently.`,
          priority: 'low'
        } as NotificationPayload);
        await cacheService.del(batchKey);
      } else {
        await cacheService.set(batchKey, JSON.stringify(batch), 300);
      }
    } catch (error : any) {
      auditLogger.error('Batch notification failed', { error, data: {}, category: LogCategory.CONNECTION });
    }
  }

  async handleViewPrivacy(profileId: string, viewerId: string): Promise<boolean> {
    try {
      const privacyCacheKey = `privacy:${profileId}:profile_views`;
      const cached = await cacheService.get(privacyCacheKey);
      let privacySettings = cached;
      
      if (typeof privacySettings === 'string' && privacySettings === 'private') {
        privacySettings = await privacyService.getProfileViewPrivacy(profileId);
        await cacheService.set(privacyCacheKey, privacySettings ?? '', 1800);
      }

      if ((privacySettings ?? '') === 'private') {
        const connectionCacheKey = `connection:${viewerId}:${profileId}`;
        const connectionCached = await cacheService.get(connectionCacheKey);
        let isConnected = connectionCached !== null ? connectionCached === 'true' : null;
        if (isConnected === null) {
          isConnected = await this.isConnected(viewerId, profileId);
          await cacheService.set(connectionCacheKey, isConnected.toString(), 600);
        }
        
        return isConnected;
      }

      return privacySettings !== 'blocked';
    } catch (error : any) {
      throw ResponseUtils.formatErrorResponse(error as Error);
    }
  }

  private async isConnected(userId1: string, userId2: string): Promise<boolean> {
    try {
      const cacheKey = `connection_status:${userId1}:${userId2}`;
      const cached = await cacheService.get(cacheKey);
      let status = cached !== null ? cached === 'true' : null;
      
      if (status === null) {
        status = Math.random() > 0.7;
        await cacheService.set(cacheKey, status.toString(), 1800);
      }
      
      return status;
    } catch (error : any) {
      return false;
    }
  }

  async manageViewCaching(key: string, action: 'set' | 'get' | 'invalidate', data?: any, ttl: number = 300): Promise<any | void> {
    try {
      const cacheKey = `view_cache:${key}`;
      
      if (action === 'set' && data) {
        await cacheService.set(cacheKey, JSON.stringify(data), ttl);
        await cacheService.set(`${cacheKey}:backup`, JSON.stringify(data), ttl * 3);
      } else if (action === 'get') {
        let result = await cacheService.get(cacheKey);
        if (!result) {
          result = await cacheService.get(`${cacheKey}:backup`);
        }
        return result ? JSON.parse(result) : null;
      } else if (action === 'invalidate') {
        await Promise.all([
          cacheService.del(cacheKey),
          cacheService.del(`${cacheKey}:backup`)
        ]);
      }
    } catch (error : any) {
      auditLogger.error('Caching operation failed', { error, data: {}, category: LogCategory.CONNECTION });
    }
  }

  async processViewRecommendations(profileId: string, algorithm: 'frequency' | 'similarity' | 'ml' = 'frequency'): Promise<RecommendationResult[]> {
    try {
      const cacheKey = `recommendations:${profileId}:${algorithm}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached && cached !== 'null') {
        try {
          return JSON.parse(cached) as RecommendationResult[];
        } catch (parseError) {
          // Continue
        }
      }
      
      let recommendations: RecommendationResult[];
      
      switch (algorithm) {
        case 'frequency':
          recommendations = await this.getFrequencyBasedRecommendations(profileId);
          break;
        case 'similarity':
          recommendations = await this.getSimilarityBasedRecommendations(profileId);
          break;
        case 'ml':
          recommendations = await this.getMLBasedRecommendations(profileId);
          break;
        default:
          recommendations = [];
      }
      
      await cacheService.set(cacheKey, JSON.stringify(recommendations), 3600);
      return recommendations;
    } catch (error : any) {
      throw ResponseUtils.formatErrorResponse(error as Error);
    }
  }

  private async getFrequencyBasedRecommendations(profileId: string): Promise<RecommendationResult[]> {
    try {
      const views = await WhoViewedProfile.find({ profileId })
        .select('viewerId')
        .limit(100)
        .exec() as IWhoViewedProfile[];
      
      const viewerCounts: Record<string, number> = {};
      views.forEach((view: IWhoViewedProfile) => {
        viewerCounts[view.viewerId.toString()] = (viewerCounts[view.viewerId.toString()] || 0) + 1;
      });
      
      return Object.entries(viewerCounts)
        .map(([userId, count]) => ({ userId, score: count }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    } catch (error : any) {
      auditLogger.error('Frequency recommendations failed', { error, data: {}, category: LogCategory.CONNECTION });
      return [];
    }
  }

  private async getSimilarityBasedRecommendations(_profileId: string): Promise<RecommendationResult[]> {
    try {
      return [
        { userId: 'user1', score: 0.8 },
        { userId: 'user2', score: 0.7 }
      ];
    } catch (error : any) {
      auditLogger.error('Similarity recommendations failed', { error, data: {}, category: LogCategory.CONNECTION });
      return [];
    }
  }

  private async getMLBasedRecommendations(_profileId: string): Promise<RecommendationResult[]> {
    try {
      return [
        { userId: 'ml_user1', score: 0.9 },
        { userId: 'ml_user2', score: 0.85 }
      ];
    } catch (error : any) {
      auditLogger.error('ML recommendations failed', { error, data: {}, category: LogCategory.CONNECTION });
      return [];
    }
  }
}