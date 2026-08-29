// src/connections/controllers/search.controller.ts

import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyns.middleware';
import { ErrorResponse, SuccessResponse, HttpStatus } from '@/shared/response.util';
import logger from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';
import {
  processSearchQueries,
  handleSearchIndexing,
  processSearchSuggestions,
  handleSearchFilters,
  manageSearchCaching,
  processSearchAnalytics,
  handleSearchOptimization,
  manageSearchHistory,
  processSearchRecommendations,
  handleSearchValidation,
  manageSearchAudit
} from '../services/search.service';

/**
 * Search Controller
 * Handles HTTP requests for search-related operations in the Connection Service.
 * Optimized for 100M+ users with efficient routing and response handling.
 *
 * Features (Complete 1 of 12, aligned with search.service.ts):
 * 1. searchUsersByName - Search users by name (Feature 36) ✓
 * 2. searchUsersByCompany - Search users by company (Feature 37)
 * 3. searchUsersBySkills - Search users by skills (Feature 38)
 * 4. getSearchSuggestions - Get search suggestions (Feature 39)
 * 5. updateSearchIndex - Update search index (Feature 41)
 * 6. getSearchFilters - Get available search filters
 * 7. manageSearchCache - Manage search caching
 * 8. getSearchAnalytics - Get search analytics
 * 9. optimizeSearch - Handle search optimization
 * 10. getSearchHistory - Get user search history
 * 11. getSearchRecommendations - Get search recommendations
 * 12. validateSearch - Validate search parameters
 *
 * Routes:
 * - GET /api/v1/search/users - Search users by name
 * - GET /api/v1/search/company - Search users by company
 * - GET /api/v1/search/skills - Search users by skills
 * - GET /api/v1/search/suggestions - Get search suggestions
 * - POST /api/v1/search/index/:userId - Update search index
 * - Additional routes for other features
 */

/**
 * Search users by name
 * Implements Feature 36
 * HTTP: GET /api/v1/search/users?name=query&page=1&limit=20
 */
const searchUsersByName = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { name, page = '1', limit = environmentConfig.PAGINATION_DEFAULT_LIMIT } = req.query;
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  if (!name || typeof name !== 'string') {
    return next(new ErrorResponse('Name query parameter is required', HttpStatus.BAD_REQUEST));
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  if (isNaN(pageNum) || pageNum < 1) {
    return next(new ErrorResponse('Invalid page number', HttpStatus.BAD_REQUEST));
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > environmentConfig.PAGINATION_MAX_LIMIT) {
    return next(new ErrorResponse(`Invalid limit. Must be between 1 and ${environmentConfig.PAGINATION_MAX_LIMIT}`, HttpStatus.BAD_REQUEST));
  }

  try {
    const result = await processSearchQueries(name, {
      page: pageNum,
      limit: limitNum,
      region: req.user?.region || 'global',
      useEstimatedCount: true,
      projection: 'userId username firstName lastName',
    });

    await logger.auditLog('search_users_by_name', authUserId, {
      query: name,
      resultCount: result.data.length,
      additionalData: { page: pageNum, limit: limitNum },
      timestamp: new Date().toISOString(),
    });

    logger.info('User search executed', {
      authUserId,
      query: name,
      results: result.data.length,
      region: req.user?.region || 'global',
    });

    res.status(HttpStatus.OK).json(SuccessResponse(result, 'Users found successfully'));
  } catch (error: any) {
    logger.error('Search users by name failed', {
      authUserId,
      query: name,
      error: error.message,
      stack: error.stack,
    });
    return next(new ErrorResponse('Failed to search users', HttpStatus.INTERNAL_SERVER_ERROR));
  }
});

/**
 * Search users by company
 * Implements Feature 37
 * HTTP: GET /api/v1/search/company?company=query&page=1&limit=20
 */
const searchUsersByCompany = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { company, page = '1', limit = environmentConfig.PAGINATION_DEFAULT_LIMIT } = req.query;
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  if (!company || typeof company !== 'string') {
    return next(new ErrorResponse('Company query parameter is required', HttpStatus.BAD_REQUEST));
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  if (isNaN(pageNum) || pageNum < 1) {
    return next(new ErrorResponse('Invalid page number', HttpStatus.BAD_REQUEST));
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > environmentConfig.PAGINATION_MAX_LIMIT) {
    return next(new ErrorResponse(`Invalid limit. Must be between 1 and ${environmentConfig.PAGINATION_MAX_LIMIT}`, HttpStatus.BAD_REQUEST));
  }

  try {
    const result = await processSearchQueries(company, {
      page: pageNum,
      limit: limitNum,
      region: req.user?.region || 'global',
      useEstimatedCount: true,
      projection: 'userId username firstName lastName company',
    });

    await logger.auditLog('search_users_by_company', authUserId, {
      query: company,
      resultCount: result.data.length,
      additionalData: { page: pageNum, limit: limitNum },
      timestamp: new Date().toISOString(),
    });

    logger.info('Company search executed', {
      authUserId,
      query: company,
      results: result.data.length,
      region: req.user?.region || 'global',
    });

    res.status(HttpStatus.OK).json(SuccessResponse(result, 'Users found by company successfully'));
  } catch (error: any) {
    logger.error('Search users by company failed', {
      authUserId,
      query: company,
      error: error.message,
      stack: error.stack,
    });
    return next(new ErrorResponse('Failed to search users by company', HttpStatus.INTERNAL_SERVER_ERROR));
  }
});

/**
 * Search users by skills
 * Implements Feature 38
 * HTTP: GET /api/v1/search/skills?skills=query&page=1&limit=20
 */
const searchUsersBySkills = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { skills, page = '1', limit = environmentConfig.PAGINATION_DEFAULT_LIMIT } = req.query;
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  if (!skills || typeof skills !== 'string') {
    return next(new ErrorResponse('Skills query parameter is required', HttpStatus.BAD_REQUEST));
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  if (isNaN(pageNum) || pageNum < 1) {
    return next(new ErrorResponse('Invalid page number', HttpStatus.BAD_REQUEST));
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > environmentConfig.PAGINATION_MAX_LIMIT) {
    return next(new ErrorResponse(`Invalid limit. Must be between 1 and ${environmentConfig.PAGINATION_MAX_LIMIT}`, HttpStatus.BAD_REQUEST));
  }

  try {
    const result = await processSearchQueries(skills, {
      page: pageNum,
      limit: limitNum,
      region: req.user?.region || 'global',
      useEstimatedCount: true,
      projection: 'userId username firstName lastName skills',
    });

    await logger.auditLog('search_users_by_skills', authUserId, {
      query: skills,
      resultCount: result.data.length,
      additionalData: { page: pageNum, limit: limitNum },
      timestamp: new Date().toISOString(),
    });

    logger.info('Skills search executed', {
      authUserId,
      query: skills,
      results: result.data.length,
      region: req.user?.region || 'global',
    });

    res.status(HttpStatus.OK).json(SuccessResponse(result, 'Users found by skills successfully'));
  } catch (error: any) {
    logger.error('Search users by skills failed', {
      authUserId,
      query: skills,
      error: error.message,
      stack: error.stack,
    });
    return next(new ErrorResponse('Failed to search users by skills', HttpStatus.INTERNAL_SERVER_ERROR));
  }
});

/**
 * Get search suggestions
 * Implements Feature 39
 * HTTP: GET /api/v1/search/suggestions?query=partial&limit=10
 */
const getSearchSuggestions = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { query, limit = '10' } = req.query;
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  if (!query || typeof query !== 'string') {
    return next(new ErrorResponse('Query parameter is required', HttpStatus.BAD_REQUEST));
  }

  const limitNum = parseInt(limit as string);

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
    return next(new ErrorResponse('Invalid limit. Must be between 1 and 50', HttpStatus.BAD_REQUEST));
  }

  try {
    const suggestions = await processSearchSuggestions();

    await logger.auditLog('get_search_suggestions', authUserId, {
      query,
      additionalData: { suggestionsCount: suggestions.length },
      timestamp: new Date().toISOString(),
    });

    logger.info('Search suggestions generated', {
      authUserId,
      query,
      suggestionsCount: suggestions.length,
    });

    res.status(HttpStatus.OK).json(SuccessResponse(suggestions, 'Search suggestions retrieved successfully'));
  } catch (error: any) {
    logger.error('Get search suggestions failed', {
      authUserId,
      query,
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
});

/**
 * Update search index
 * Implements Feature 41
 * HTTP: POST /api/v1/search/index/:userId
 */
const updateSearchIndex = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.params;
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  if (!userId) {
    return next(new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST));
  }

  try {
    await handleSearchIndexing(userId);

    await logger.auditLog('update_search_index', authUserId, {
      additionalData: { targetUserId: userId },
      timestamp: new Date().toISOString(),
    });

    logger.info('Search index updated', {
      authUserId,
      targetUserId: userId,
    });

    res.status(HttpStatus.OK).json(SuccessResponse(null, 'Search index updated successfully'));
  } catch (error: any) {
    logger.error('Update search index failed', {
      authUserId,
      targetUserId: userId,
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
});

/**
 * Get search filters
 * HTTP: GET /api/v1/search/filters
 */
const getSearchFilters = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  try {
    await handleSearchFilters();
    res.status(HttpStatus.OK).json(SuccessResponse(null, 'Search filters retrieved successfully'));
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Manage search cache
 * HTTP: POST /api/v1/search/cache/manage
 */
const manageSearchCache = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  try {
    await manageSearchCaching();
    res.status(HttpStatus.OK).json(SuccessResponse(null, 'Search cache managed successfully'));
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Get search analytics
 * HTTP: GET /api/v1/search/analytics
 */
const getSearchAnalytics = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  try {
    await processSearchAnalytics();
    res.status(HttpStatus.OK).json(SuccessResponse(null, 'Search analytics retrieved successfully'));
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Handle search optimization
 * HTTP: POST /api/v1/search/optimize
 */
const optimizeSearch = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  try {
    await handleSearchOptimization();
    res.status(HttpStatus.OK).json(SuccessResponse(null, 'Search optimization completed successfully'));
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Get search history
 * HTTP: GET /api/v1/search/history
 */
const getSearchHistory = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  try {
    await manageSearchHistory();
    res.status(HttpStatus.OK).json(SuccessResponse(null, 'Search history retrieved successfully'));
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Get search recommendations
 * HTTP: GET /api/v1/search/recommendations
 */
const getSearchRecommendations = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  try {
    await processSearchRecommendations();
    res.status(HttpStatus.OK).json(SuccessResponse(null, 'Search recommendations retrieved successfully'));
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Validate search parameters
 * HTTP: POST /api/v1/search/validate
 */
const validateSearch = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  try {
    await handleSearchValidation();
    res.status(HttpStatus.OK).json(SuccessResponse(null, 'Search validation completed successfully'));
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Manage search audit
 * HTTP: GET /api/v1/search/audit
 */
const manageSearchAuditEndpoint = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authUserId = req.user?.id;

  if (!authUserId) {
    return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
  }

  try {
    await manageSearchAudit();
    res.status(HttpStatus.OK).json(SuccessResponse(null, 'Search audit managed successfully'));
  } catch (error: any) {
    return next(error);
  }
});

// 🔧 FIX: ab saare handlers ek hi object ke andar bundled hain,
// isliye `searchController.searchUsersByName` jaisa access route file me kaam karega
export const searchController = {
  searchUsersByName,
  searchUsersByCompany,
  searchUsersBySkills,
  getSearchSuggestions,
  updateSearchIndex,
  getSearchFilters,
  manageSearchCache,
  getSearchAnalytics,
  optimizeSearch,
  getSearchHistory,
  getSearchRecommendations,
  validateSearch,
  manageSearchAuditEndpoint,
};