// controller/searchHistory.controller.ts
import { Request, Response, NextFunction } from 'express';

import { Search } from '../models';
import {
  createSearchHistorySchema,
  updateSearchHistorySchema,
} from '@/Job-Service/validations/searchHistory.validations';
import { generateSecureId, sanitizeInput } from '@/shared/security';
import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  } from '@/shared/errors/app.error';
// import { SearchEventService, SearchStatsService } from '@/services';
import CacheUtil from '@/shared/cache.util';
import { SearchEventService, SearchStatsService } from '../services';

// Request context helper (consistent across controllers)
const withSearchHistoryContext = (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 500) {
        logger.warn(`[${requestId}] Slow search history operation`, { duration });
      }
    }
  };

// POST - Create Search History
export const createSearchHistoryController = withSearchHistoryContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new AuthorizationError('Authentication required');

  const sanitizedInput = sanitizeInput(req.body);
  const { error, value } = createSearchHistorySchema.validate(sanitizedInput);
  if (error) throw new ValidationError('Invalid search history input', error.details);

  const searchId = generateSecureId();

  const searchHistory = new Search({
    searchId,
    userId,
    query: value.query,
    metadata: {
      type: value.type,
      filters: value.filters || {},
      ip: value.ip || req.ip,
      userAgent: value.userAgent || req.headers['user-agent'],
    },
    stats: {
      resultCount: value.resultCount || 0,
      executionTime: value.executionTime || 0,
    },
    createdBy: userId,
    updatedBy: userId,
  });

  await searchHistory.save();

  // Redis recent searches (keep last 10)
  await CacheUtil.lpush(
    `recent:searches:${userId}`,
    JSON.stringify({
      searchId,
      query: value.query,
      type: value.type,
      timestamp: new Date().toISOString(),
    })
  );
  await CacheUtil.ltrim(`recent:searches:${userId}`, 0, 9);
  await CacheUtil.expire(`recent:searches:${userId}`, 60 * 60 * 24 * 30); // 30 days

  // Update trending
  await CacheUtil.incr('trending:searches', value.query);

  // Async analytics event
  SearchEventService.emit('analytics:search_created', {
    searchId,
    userId,
    query: value.query,
    type: value.type,
    filters: value.filters,
    metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  }).catch((err: any) => logger.error('Search created event failed', { err }));

  ResponseUtil.created(res, { searchHistory }, 'Search history created successfully');
});

// GET - Single Search History by ID
export const getSearchHistoryByIdController = withSearchHistoryContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new AuthorizationError('Authentication required');

  const { searchId } = req.params;

  const searchHistory = await Search.findOne({
    searchId,
    userId,
    isDeleted: false,
  }).lean();

  if (!searchHistory) throw new NotFoundError('Search history');

  // Increment click count
  // await SearchStatsService.incrementStats(searchId, 'clickCount');

  await SearchStatsService.incrementStats({ 
  type: 'recently_viewed', 
  userId: searchId,
  metric: 'clickCount'
});

  ResponseUtil.success(res, { searchHistory }, 'Search history retrieved successfully');
});

// GET - All Search History for User (with pagination + recent from Redis)
export const getUserSearchHistoryController = withSearchHistoryContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new AuthorizationError('Authentication required');

  const { page = '1', limit = '20' } = req.query;

  const searches = await Search.findUserSearches(userId, {
    page: parseInt(page as string),
    limit: parseInt(limit as string),
  });

  // Recent searches from Redis (last 10)
  const recentSearchesRaw = await CacheUtil.lRange(`recent:searches:${userId}`, 0, 9);
  const recentSearches = recentSearchesRaw.map(s => JSON.parse(s));

  ResponseUtil.success(res, {
    searches,
    recentSearches,
  }, 'User search history retrieved successfully');
});

// PUT - Update Search History
export const updateSearchHistoryController = withSearchHistoryContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new AuthorizationError('Authentication required');

  const { searchId } = req.params;

  const sanitizedInput = sanitizeInput(req.body);
  const { error, value } = updateSearchHistorySchema.validate(sanitizedInput);
  if (error) throw new ValidationError('Invalid update input', error.details);

  const updateData = {
    ...value,
    updatedBy: userId,
    updatedAt: new Date(),
  };

  const updated = await Search.findOneAndUpdate(
    { searchId, userId, isDeleted: false },
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!updated) throw new NotFoundError('Search history');

  // Async event
  SearchEventService.emit('analytics:search_updated', {
    searchId,
    userId,
    changes: Object.keys(value),
    metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  }).catch((err: any) => logger.error('Search updated event failed', { err }));

  ResponseUtil.success(res, { searchHistory: updated }, 'Search history updated successfully');
});

// DELETE (soft) - Soft Delete Search History
export const softDeleteSearchHistoryController = withSearchHistoryContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new AuthorizationError('Authentication required');

  const { searchId } = req.params;

  const updated = await Search.findOneAndUpdate(
    { searchId, userId, isDeleted: false },
    { $set: { isDeleted: true, updatedBy: userId, updatedAt: new Date() } },
    { new: true }
  );

  if (!updated) throw new NotFoundError('Search history');

  // Async event
  SearchEventService.emit('analytics:search_deleted', {
    searchId,
    userId,
    metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  }).catch(err => logger.error('Search deleted event failed', { err }));

  ResponseUtil.success(res, {}, 'Search history soft deleted successfully');
});

// DELETE (hard) - Hard Delete (admin only - add check if needed)
export const hardDeleteSearchHistoryController = withSearchHistoryContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new AuthorizationError('Authentication required');

  // Optional: add admin check
  // if (!req.user?.isAdmin) throw new ForbiddenError('Admin access required');

  const { searchId } = req.params;

  const deleted = await Search.findOneAndDelete({ searchId, userId });

  if (!deleted) throw new NotFoundError('Search history');

  // Clean up Redis
  await CacheUtil.del(`search:stats:${searchId}:*`);
  await CacheUtil.remove('search:stats:flush:queue', searchId);

  // Async event
  SearchEventService.emit('analytics:search_hard_deleted', {
    searchId,
    userId,
    metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  }).catch(err => logger.error('Hard delete event failed', { err }));

  ResponseUtil.noContent(res);
});