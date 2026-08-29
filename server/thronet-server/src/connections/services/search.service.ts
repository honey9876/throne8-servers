// src/connections/services/search.service.ts
import redisManager from '@/config/cache/redis.config';
import logger from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';
import User from '@/auth/models/User.model';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';

/**
 * Search Service
 * Handles business logic for search-related operations in the Connection Service.
 * Optimized for 100M+ users with text indexing, caching, and efficient query processing.
 * 
 * Features (Complete 2 of 12, aligned with searchController.ts):
 * 1. processSearchQueries - Processes search queries for users (Feature 40)
 * 2. handleSearchIndexing - Manages search index updates (Feature 41)
 * 3. manageSearchRanking (placeholder)
 * 4. processSearchSuggestions (placeholder)
 * 5. handleSearchFilters (placeholder)
 * 6. manageSearchCaching (placeholder)
 * 7. processSearchAnalytics (placeholder)
 * 8. handleSearchOptimization (placeholder)
 * 9. manageSearchHistory (placeholder)
 * 10. processSearchRecommendations (placeholder)
 * 11. handleSearchValidation (placeholder)
 * 12. manageSearchAudit (placeholder)
 * 
 * Dependencies:
 * - mongoose: For MongoDB operations (User model)
 * - ioredis: For caching search results (via redisManager.getRedisClient())
 * - winston: For logging (logger)
 * - environmentConfig: For validated environment variables (PAGINATION_*, CACHE_*)
 * - response: For ErrorResponse, HttpStatus
 * 
 * Scalability Considerations:
 * - Text index for efficient search
 * - Redis caching for frequent queries
 * - Pagination for large result sets
 * - Batch processing for index updates
 * - Async operations for performance
 * - Audit logging for search actions
 * 
 * Integration:
 * - Uses User.model.ts for data operations (findUsersPaginated, findByUserId)
 * - Aligns with .env (PAGINATION_*, CACHE_*), package.json, tsconfig.json
 * - Logs to LOG_FILE_PATH and LOG_ERROR_FILE_PATH
 * - Supports searchController.ts endpoints
 */

interface ISearchResult {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  location?: string;
  profilePhotoId?: string | null;
  company?: string;
}

interface IPaginationResult<T> {
  data: T[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  estimatedTotal?: number;
}

/**
 * Process search queries for users
 * Implements Feature 40
 * Handles search logic for finding users by name, company, etc.
 * @param query Search query string
 * @param options Pagination and filtering options
 * @returns Paginated search results
 */
export async function processSearchQueries(
  query: string,
  options: {
    page?: number;
    limit?: number;
    region?: string;
    useEstimatedCount?: boolean;
    projection?: string;
  } = {}
): Promise<IPaginationResult<ISearchResult>> {
  const {
    page = 1,
    limit = environmentConfig.PAGINATION_DEFAULT_LIMIT,
    region = 'global',
    useEstimatedCount = true,
    projection,
  } = options;

  // Validate query
  if (!query || typeof query !== 'string') {
    logger.warn('Invalid search query', { query });
    throw new ErrorResponse('Search query is required', HttpStatus.BAD_REQUEST);
  }

  // Check cache first
  const cacheKey = `search:${query}:${region}:${page}:${limit}:${environmentConfig.CACHE_VERSION || 1}`;

  try {
    const redisClient = await redisManager.getRedisClient();
    const cachedResult = await redisClient.get(cacheKey);
    if (cachedResult) {
      logger.debug('Serving search results from cache', { cacheKey, query, region });
      return JSON.parse(cachedResult);
    }
  } catch (cacheError) {
    logger.warn('Failed to check cache, proceeding without cache', {
      error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      cacheKey,
    });
  }

  try {
    // Use User model's paginated search with text/regex index
    const result = await User.findUsersPaginated({
      page,
      limit,
      query,
      region,
      useEstimatedCount,
      projection: projection || 'userId username firstName lastName location company profilePhotoId',
    });

    const response: IPaginationResult<ISearchResult> = {
      data: result.data.map((user: any) => ({
        userId: user.userId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        location: user.location || '',
        profilePhotoId: user.profilePhotoId || null,
        company: user.company || '',
        // Create fullName from firstName and lastName if not available
        fullName: `${user.firstName} ${user.lastName || ''}`.trim(),
      })),
      totalCount: result.totalCount,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPreviousPage: result.hasPreviousPage,
      estimatedTotal: result.estimatedTotal,
    };

    // Cache results asynchronously
    try {
      const redisClient = await redisManager.getRedisClient();
      await redisClient.setex(
        cacheKey,
        environmentConfig.SEARCH_RESULTS_CACHE_TTL,
        JSON.stringify(response)
      );
    } catch (cacheError) {
      logger.warn('Failed to cache search results', {
        cacheKey,
        query,
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }

    logger.info('Search query processed', { query, region, resultCount: response.data.length });
    await logger.auditLog('process_search_queries', 'system', {
      query,
      region,
      resultCount: response.data.length,
      timestamp: new Date().toISOString(),
    });

    return response;
  } catch (error: any) {
    logger.error('Search query processing failed', { query, region, error: error.message, stack: error.stack });
    throw new ErrorResponse('Failed to process search query', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Handle search indexing updates
 * Implements Feature 41
 * Ensures user data is properly indexed for search
 * @param userId User ID to update index for
 */
export async function handleSearchIndexing(userId: string): Promise<void> {
  try {
    // ✅ FIX: `syncUserData` doesn't exist on IUserModel (there's no external
    // microservice sync method defined on the User model). We just need the
    // fresh user doc to know its region / bump cacheVersion, so use the
    // existing `findByUserId` static instead.
    const user = await User.findByUserId(userId);
    if (!user) {
      logger.warn('User not found for indexing', { userId });
      throw new ErrorResponse('User not found', HttpStatus.NOT_FOUND);
    }

    // Bump a version-ish field so downstream consumers know this doc changed.
    // NOTE: `cacheVersion` isn't part of the IUser schema shown — if you don't
    // actually have that field on the User schema, remove this update call;
    // the cache-clearing below is what actually matters for search freshness.
    await User.findOneAndUpdate(
      { userId },
      { $set: { updatedAt: new Date() } },
      { new: true }
    );

    // Clear relevant search caches using SCAN pattern
    try {
      const redisClient = await redisManager.getRedisClient();
      const keys: string[] = [];
      let cursor = '0';
      const region = (user as any).region || 'global';
      const pattern = `search:*:${region}:*:*`;

      do {
        // ioredis scan signature: scan(cursor, 'MATCH', pattern, 'COUNT', count)
        const result: [string, string[]] = (await redisClient.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        )) as any;
        cursor = result[0];
        const foundKeys = result[1];
        keys.push(...foundKeys);
      } while (cursor !== '0');

      if (keys.length > 0) {
        await redisClient.del(...keys);
        logger.debug('Search caches cleared for indexing', { userId, clearedKeys: keys.length });
      }
    } catch (cacheError) {
      logger.warn('Failed to clear search caches during indexing', {
        userId,
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }

    logger.info('Search index updated for user', { userId, region: (user as any).region });
    await logger.auditLog('handle_search_indexing', 'system', {
      userId,
      region: (user as any).region,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Search indexing failed', { userId, error: error.message, stack: error.stack });
    throw new ErrorResponse('Failed to update search index', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Manage search ranking (placeholder for future feature)
 */
export async function manageSearchRanking(): Promise<void> {
  logger.warn('manageSearchRanking not implemented');
  throw new ErrorResponse('manageSearchRanking not implemented', HttpStatus.NOT_IMPLEMENTED);
}

/**
 * Process search suggestions (placeholder for Feature 39 support)
 */
export async function processSearchSuggestions(): Promise<string[]> {
  logger.warn('processSearchSuggestions not implemented');
  throw new ErrorResponse('processSearchSuggestions not implemented', HttpStatus.NOT_IMPLEMENTED);
}

/**
 * Handle search filters (placeholder)
 */
export async function handleSearchFilters(): Promise<void> {
  logger.warn('handleSearchFilters not implemented');
  throw new ErrorResponse('handleSearchFilters not implemented', HttpStatus.NOT_IMPLEMENTED);
}

/**
 * Manage search caching (placeholder)
 */
export async function manageSearchCaching(): Promise<void> {
  logger.warn('manageSearchCaching not implemented');
  throw new ErrorResponse('manageSearchCaching not implemented', HttpStatus.NOT_IMPLEMENTED);
}

/**
 * Process search analytics (placeholder)
 */
export async function processSearchAnalytics(): Promise<void> {
  logger.warn('processSearchAnalytics not implemented');
  throw new ErrorResponse('processSearchAnalytics not implemented', HttpStatus.NOT_IMPLEMENTED);
}

/**
 * Handle search optimization (placeholder)
 */
export async function handleSearchOptimization(): Promise<void> {
  logger.warn('handleSearchOptimization not implemented');
  throw new ErrorResponse('handleSearchOptimization not implemented', HttpStatus.NOT_IMPLEMENTED);
}

/**
 * Manage search history (placeholder)
 */
export async function manageSearchHistory(): Promise<void> {
  logger.warn('manageSearchHistory not implemented');
  throw new ErrorResponse('manageSearchHistory not implemented', HttpStatus.NOT_IMPLEMENTED);
}

/**
 * Process search recommendations (placeholder)
 */
export async function processSearchRecommendations(): Promise<void> {
  logger.warn('processSearchRecommendations not implemented');
  throw new ErrorResponse('processSearchRecommendations not implemented', HttpStatus.NOT_IMPLEMENTED);
}

/**
 * Handle search validation (placeholder)
 */
export async function handleSearchValidation(): Promise<void> {
  logger.warn('handleSearchValidation not implemented');
  throw new ErrorResponse('handleSearchValidation not implemented', HttpStatus.NOT_IMPLEMENTED);
}

/**
 * Manage search audit logging (placeholder)
 */
export async function manageSearchAudit(): Promise<void> {
  logger.warn('manageSearchAudit not implemented');
  throw new ErrorResponse('manageSearchAudit not implemented', HttpStatus.NOT_IMPLEMENTED);
}