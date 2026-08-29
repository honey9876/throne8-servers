// src/controllers/mutualController.ts (Production Ready - Fixed)

import { Request, Response, NextFunction } from 'express';
import logger from '@/shared/logger.util';
import { mutualService } from '../services/index';
import { SuccessResponse, ErrorResponse, HttpStatus } from '@/shared/response.util';
import { IMutualConnection, MutualQueryParams } from '../types/network.types';
import environmentConfig from '@/config/environment/environment';
import { asyncHandler } from '@/shared/utils/helpers.util';

/**
 * Mutual Controller
 * Handles HTTP requests for mutual connections, integrating with mutualService for business logic.
 * Includes comprehensive error handling, validation, rate limiting integration, and response formatting.
 * 
 * Features (12 total, aligned with service):
 * 1. getMutualConnections - GET /mutuals/:userId1/:userId2
 * 2. getMutualCount - GET /mutuals/:userId1/:userId2/count
 * 3. getMutualSuggestions - GET /mutuals/:userId/suggestions
 * 4. getExtendedMutuals - GET /mutuals/:userId1/:userId2/extended?degree=2|3
 * 5. getMutualStrength - GET /mutuals/:userId1/:userId2/strength
 * 6. findCommonConnections - POST /mutuals/common
 * 7. getMutualNetworkMetrics - GET /mutuals/:userId1/:userId2/metrics
 * 8. bulkMutualQueries - POST /mutuals/bulk
 * 9. searchMutualConnections - GET /mutuals/:userId1/:userId2/search?q=query&company=...&location=...
 * 10. getMutualInsights - GET /mutuals/:userId1/:userId2/insights
 * 11. getTrendingMutuals - GET /mutuals/:userId/trending
 * 12. invalidateUserCache - POST /mutuals/:userId/invalidate-cache (admin only)
 * 
 * Dependencies:
 * - express: For Request/Response/NextFunction
 * - logger: For request/response logging
 * - mutualService: For core business logic
 * - response: For standardized SuccessResponse/ErrorResponse
 * - environmentConfig: For limits (e.g., MAX_BATCH_SIZE)
 * - types: For request/response types
 * 
 * Error Handling: Catches service errors, maps to HTTP status, logs details
 * Validation: Relies on service validation; adds param checks
 * Scalability: Pagination via query params, async operations
 * Integration: Called from mutualRoutes.ts; auth via middleware
 * Monitoring: Logs response times, errors with context
 */

interface AuthRequest extends Request {
  user?: {
    id: string;
    userId?: string;
    isAdmin: boolean;
    email: string;
    role: 'user' | 'admin';
    deviceId?: string | null;
    sessionId?: string | null;
  };
}

class mutualController {

  static getMutualConnections = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { userId1, userId2 } = req.params;

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      // ✅ AUTHORIZATION CHECK (user can only query their own mutuals)
      if (userId1 !== authUserId && req.user?.role !== 'admin') {
        throw new ErrorResponse(
          'You can only view your own mutual connections',
          HttpStatus.FORBIDDEN
        );
      }

      const params: MutualQueryParams = {
        limit: parseInt(req.query.limit as string) || environmentConfig.PAGINATION_DEFAULT_LIMIT,
        offset: parseInt(req.query.offset as string) || 0,
      };

      // Basic param validation
      if (!userId1 || !userId2) {
        throw new ErrorResponse('User IDs are required', HttpStatus.BAD_REQUEST);
      }

      const mutuals = await mutualService.findMutualConnections(userId1, userId2, params);

      const responseTime = Date.now() - startTime;
      logger.info('Mutual connections retrieved', {
        users: `${userId1}-${userId2}`,
        mutualCount: mutuals.length,
        responseTimeMs: responseTime,
        clientIp: req.ip,
        userAgent: req.get('User-Agent'),
        authUserId,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          {
            mutuals,
            pagination: {
              limit: params.limit,
              offset: params.offset,
              total: mutuals.length,
            },
          },
          'Mutual connections retrieved successfully'
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in getMutualConnections', {
        errorMessage: error.message,
        users: `${req.params.userId1}-${req.params.userId2}`,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };

  static getMutualCount = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { userId1, userId2 } = req.params;

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      // ✅ AUTHORIZATION CHECK
      if (userId1 !== authUserId && req.user?.role !== 'admin') {
        throw new ErrorResponse('Unauthorized access', HttpStatus.FORBIDDEN);
      }

      if (!userId1 || !userId2) {
        throw new ErrorResponse('User IDs are required', HttpStatus.BAD_REQUEST);
      }

      const count = await mutualService.calculateMutualCount(userId1, userId2);

      const responseTime = Date.now() - startTime;
      logger.info('Mutual count retrieved', {
        users: `${userId1}-${userId2}`,
        mutualCount: count,
        responseTimeMs: responseTime,
        authUserId,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          { count },
          `Found ${count} mutual connections`
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in getMutualCount', {
        errorMessage: error.message,
        users: `${req.params.userId1}-${req.params.userId2}`,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };

  static getMutualSuggestions = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      // ✅ AUTHORIZATION CHECK
      if (userId !== authUserId && req.user?.role !== 'admin') {
        throw new ErrorResponse('You can only view your own suggestions', HttpStatus.FORBIDDEN);
      }

      if (!userId) {
        throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
      }

      const suggestions = await mutualService.getMutualSuggestions(userId, limit);

      const responseTime = Date.now() - startTime;
      logger.info('Mutual suggestions retrieved', {
        userId,
        suggestionCount: suggestions.length,
        requestedLimit: limit,
        responseTimeMs: responseTime,
        authUserId,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          { suggestions },
          'Mutual suggestions retrieved successfully'
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in getMutualSuggestions', {
        errorMessage: error.message,
        userId: req.params.userId,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };

  static getExtendedMutuals = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { userId1, userId2 } = req.params;
      const degree = (parseInt(req.query.degree as string) || 2) as 2 | 3;

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      // ✅ AUTHORIZATION CHECK
      if (userId1 !== authUserId && req.user?.role !== 'admin') {
        throw new ErrorResponse('Unauthorized access', HttpStatus.FORBIDDEN);
      }

      if (!userId1 || !userId2) {
        throw new ErrorResponse('User IDs are required', HttpStatus.BAD_REQUEST);
      }

      const mutuals = await mutualService.getExtendedMutuals(userId1, userId2, degree);

      const responseTime = Date.now() - startTime;
      logger.info('Extended mutuals retrieved', {
        users: `${userId1}-${userId2}`,
        searchDegree: degree,
        resultCount: mutuals.length,
        responseTimeMs: responseTime,
        authUserId,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          { mutuals, degree },
          'Extended mutuals retrieved successfully'
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in getExtendedMutuals', {
        errorMessage: error.message,
        users: `${req.params.userId1}-${req.params.userId2}`,
        requestedDegree: req.query.degree,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };

  static getMutualStrength = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { userId1, userId2 } = req.params;
      const mutualIds = req.body.mutualIds || [];

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      // ✅ AUTHORIZATION CHECK
      if (userId1 !== authUserId && req.user?.role !== 'admin') {
        throw new ErrorResponse('Unauthorized access', HttpStatus.FORBIDDEN);
      }

      if (!userId1 || !userId2) {
        throw new ErrorResponse('User IDs are required', HttpStatus.BAD_REQUEST);
      }

      // Fetch mutuals if IDs not provided
      let mutuals: IMutualConnection[] = [];
      if (mutualIds.length === 0) {
        mutuals = await mutualService.findMutualConnections(userId1, userId2, { limit: 50 });
      } else {
        mutuals = mutualIds.map((id: string) => ({ userId: id } as IMutualConnection));
      }

      const strength = await mutualService.calculateMutualStrength(userId1, userId2, mutuals);

      const responseTime = Date.now() - startTime;
      logger.info('Mutual strength calculated', {
        users: `${userId1}-${userId2}`,
        strengthScore: strength,
        mutualsAnalyzed: mutuals.length,
        responseTimeMs: responseTime,
        authUserId,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          { strength },
          'Mutual strength calculated successfully'
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in getMutualStrength', {
        errorMessage: error.message,
        users: `${req.params.userId1}-${req.params.userId2}`,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };

  static findCommonConnections = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { userConnections1, userConnections2 } = req.body;

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      if (!Array.isArray(userConnections1) || !Array.isArray(userConnections2)) {
        throw new ErrorResponse('Connection arrays are required', HttpStatus.BAD_REQUEST);
      }

      const common = await mutualService.findCommonConnections(userConnections1, userConnections2);

      const responseTime = Date.now() - startTime;
      logger.info('Common connections found', {
        commonCount: common.length,
        inputSize1: userConnections1.length,
        inputSize2: userConnections2.length,
        responseTimeMs: responseTime,
        authUserId,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          { commonConnections: common },
          'Common connections found successfully'
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in findCommonConnections', {
        errorMessage: error.message,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };

  static getMutualNetworkMetrics = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { userId1, userId2 } = req.params;

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      // ✅ AUTHORIZATION CHECK
      if (userId1 !== authUserId && req.user?.role !== 'admin') {
        throw new ErrorResponse('Unauthorized access', HttpStatus.FORBIDDEN);
      }

      if (!userId1 || !userId2) {
        throw new ErrorResponse('User IDs are required', HttpStatus.BAD_REQUEST);
      }

      const metrics = await mutualService.getMutualNetworkMetrics(userId1, userId2);

      const responseTime = Date.now() - startTime;
      logger.info('Mutual network metrics retrieved', {
        users: `${userId1}-${userId2}`,
        metricsCalculated: Object.keys(metrics).length,
        responseTimeMs: responseTime,
        authUserId,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          { metrics },
          'Mutual network metrics retrieved successfully'
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in getMutualNetworkMetrics', {
        errorMessage: error.message,
        users: `${req.params.userId1}-${req.params.userId2}`,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };

  static bulkMutualQueries = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { pairs } = req.body;

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      if (!Array.isArray(pairs)) {
        throw new ErrorResponse('Pairs array is required', HttpStatus.BAD_REQUEST);
      }

      // ✅ AUTHORIZATION CHECK - user can only query pairs involving themselves
      const authorizedPairs = pairs.filter(([userId1, userId2]) =>
        userId1 === authUserId || userId2 === authUserId || req.user?.role === 'admin'
      );

      if (authorizedPairs.length === 0) {
        throw new ErrorResponse('No authorized pairs found', HttpStatus.FORBIDDEN);
      }

      const results = await mutualService.handleBulkMutualQueries(authorizedPairs);

      const responseTime = Date.now() - startTime;
      logger.info('Bulk mutual queries completed', {
        requestedPairs: pairs.length,
        authorizedPairs: authorizedPairs.length,
        processedPairs: results.size,
        responseTimeMs: responseTime,
        authUserId,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          { results: Array.from(results.entries()) },
          'Bulk mutual queries completed successfully'
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in bulkMutualQueries', {
        errorMessage: error.message,
        requestedPairs: req.body.pairs?.length || 0,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };

  static searchMutualConnections = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { userId1, userId2 } = req.params;
      const { q: searchQuery, company, location, industry } = req.query;

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      // ✅ AUTHORIZATION CHECK
      if (userId1 !== authUserId && req.user?.role !== 'admin') {
        throw new ErrorResponse('Unauthorized access', HttpStatus.FORBIDDEN);
      }

      if (!userId1 || !userId2) {
        throw new ErrorResponse('User IDs are required', HttpStatus.BAD_REQUEST);
      }

      if (!searchQuery || typeof searchQuery !== 'string') {
        throw new ErrorResponse('Search query is required', HttpStatus.BAD_REQUEST);
      }

      const filters = {
        company: company as string,
        location: location as string,
        industry: industry as string,
      };

      const mutuals = await mutualService.findMutualConnectionsWithSearch(
        userId1,
        userId2,
        searchQuery as string
      );

      const responseTime = Date.now() - startTime;
      logger.info('Mutual search completed', {
        users: `${userId1}-${userId2}`,
        searchQuery,
        filtersApplied: Object.keys(filters).filter(key => filters[key as keyof typeof filters]).length,
        resultCount: mutuals.length,
        responseTimeMs: responseTime,
        authUserId,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          { mutuals },
          'Mutual connections search completed successfully'
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in searchMutualConnections', {
        errorMessage: error.message,
        users: `${req.params.userId1}-${req.params.userId2}`,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };

  static getMutualInsights = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { userId1, userId2 } = req.params;

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      // ✅ AUTHORIZATION CHECK
      if (userId1 !== authUserId && req.user?.role !== 'admin') {
        throw new ErrorResponse('Unauthorized access', HttpStatus.FORBIDDEN);
      }

      if (!userId1 || !userId2) {
        throw new ErrorResponse('User IDs are required', HttpStatus.BAD_REQUEST);
      }

      const insights = await mutualService.getMutualNetworkMetrics(userId1, userId2);

      const responseTime = Date.now() - startTime;
      logger.info('Mutual insights retrieved', {
        users: `${userId1}-${userId2}`,
        insightsGenerated: Object.keys(insights).length,
        responseTimeMs: responseTime,
        authUserId,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          { insights },
          'Mutual insights retrieved successfully'
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in getMutualInsights', {
        errorMessage: error.message,
        users: `${req.params.userId1}-${req.params.userId2}`,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };

  static getTrendingMutuals = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      // ✅ AUTHORIZATION CHECK
      if (userId !== authUserId && req.user?.role !== 'admin') {
        throw new ErrorResponse('You can only view your own trending mutuals', HttpStatus.FORBIDDEN);
      }

      if (!userId) {
        throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
      }

      const trending = await mutualService.getMutualSuggestions(userId, limit);

      const responseTime = Date.now() - startTime;
      logger.info('Trending mutuals retrieved', {
        userId,
        trendingCount: trending.length,
        requestedLimit: limit,
        responseTimeMs: responseTime,
        authUserId,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          { trending },
          'Trending mutuals retrieved successfully'
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in getTrendingMutuals', {
        errorMessage: error.message,
        userId: req.params.userId,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };




  static invalidateUserCache = async (
    req: AuthRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    try {
      const { userId } = req.params;

      // ✅ AUTHENTICATION CHECK
      const authUserId = req.user?.userId || req.user?.id;
      if (!authUserId) {
        throw new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      // ✅ ADMIN ONLY CHECK
      if (req.user?.role !== 'admin') {
        throw new ErrorResponse('Admin access required', HttpStatus.FORBIDDEN);
      }

      if (!userId) {
        throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
      }

      await mutualService.invalidateMutualCache(userId);

      const responseTime = Date.now() - startTime;
      logger.info('User cache invalidated', {
        userId,
        adminAction: true,
        responseTimeMs: responseTime,
        authUserId,
        adminEmail: req.user?.email,
      });

      res.status(HttpStatus.OK).json(
        SuccessResponse(
          { message: 'Cache invalidated successfully' },
          'User cache invalidated'
        )
      );
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logger.error('Error in invalidateUserCache', {
        errorMessage: error.message,
        userId: req.params.userId,
        responseTimeMs: responseTime,
      });

      if (error instanceof ErrorResponse) {
        res.status(error.statusCode).json(error);
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      }
    }
  };
}

export const getBulkMutualConnections = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
      const { userId, targetUserIds, limit } = req.body;
      const authUserId = (req.user as any)?.userId || (req.user as any)?.id;

      if (!authUserId) {
          return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED));
      }
      if (!userId || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
          return next(new ErrorResponse('userId and non-empty targetUserIds[] are required', HttpStatus.BAD_REQUEST));
      }
      if (targetUserIds.length > 100) {
          return next(new ErrorResponse('Max 100 targetUserIds allowed per bulk request', HttpStatus.BAD_REQUEST));
      }

      const pairs: [string, string][] = targetUserIds.map((tid: string) => [userId, tid]);
      const resultsMap = await mutualService.handleBulkMutualQueries(pairs);

      const results: Record<string, { mutuals: any[]; count: number }> = {};
      for (const [key, mutuals] of resultsMap.entries()) {
          const trimmed = limit ? mutuals.slice(0, limit) : mutuals;
          results[key] = { mutuals: trimmed, count: mutuals.length };
      }

      res.status(HttpStatus.OK).json(SuccessResponse(results, 'Bulk mutual connections retrieved'));
  }
);


export { mutualController };