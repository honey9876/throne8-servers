// controllers/search.controller.ts

import { Request, Response } from 'express';
import ResponseUtil from '@/shared/response.util';
import { asyncHandler } from '@/shared/utils/helpers.util';
import searchService from '../services/search.service';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';

// export const searchGroups = asyncHandler(async (req: Request, res: Response): Promise<void> => {
//   const result = await searchService.searchGroups(req.query);
//   ResponseUtil.success(res, result, 'Groups retrieved successfully');
// });
export const searchGroups = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user?.id;
  const result = await searchService.searchGroups(req.query, userId);
  ResponseUtil.success(res, result, 'Groups retrieved successfully');
});

export const getPopularGroups = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user?.id;
  const result = await searchService.getPopularGroups(req.query.limit as string, userId);
  ResponseUtil.success(res, result, 'Popular groups retrieved successfully');
});

export const getTrendingGroups = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user?.id;
  const result = await searchService.getTrendingGroups(req.query.limit as string, userId);
  ResponseUtil.success(res, result, 'Trending groups retrieved successfully');
});

export const getRecommendedGroups = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).user?.id;
  const result = await searchService.getRecommendedGroups(
    req.query.category as string,
    req.query.limit as string,
    userId
  );
  ResponseUtil.success(res, result, 'Recommended groups retrieved successfully');
});

// export const getPopularGroups = asyncHandler(async (req: Request, res: Response): Promise<void> => {
//   const result = await searchService.getPopularGroups(req.query.limit as string);
//   ResponseUtil.success(res, result, 'Popular groups retrieved successfully');
// });

// export const getTrendingGroups = asyncHandler(async (req: Request, res: Response): Promise<void> => {
//   const result = await searchService.getTrendingGroups(req.query.limit as string);
//   ResponseUtil.success(res, result, 'Trending groups retrieved successfully');
// });

// export const getRecommendedGroups = asyncHandler(async (req: Request, res: Response): Promise<void> => {
//   const result = await searchService.getRecommendedGroups(
//     req.query.category as string,
//     req.query.limit as string
//   );
//   ResponseUtil.success(res, result, 'Recommended groups retrieved successfully');
// });

export const getGroupsByCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {

  const userId = (req as AuthRequest).user?.id;  // ← get userId from JWT
  const result = await searchService.getGroupsByCategory(req.params.category, req.query, userId);
  ResponseUtil.success(res, result, `${result.category} groups retrieved successfully`);
});

export const getAvailableGroups = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await searchService.getAvailableGroups(req.query);
  ResponseUtil.success(res, result, 'Available groups retrieved successfully');
});

export const searchGroupsByTags = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await searchService.searchGroupsByTags(req.query);
  ResponseUtil.success(res, result, 'Groups retrieved successfully');
});

export default {
  searchGroups,
  getPopularGroups,
  getTrendingGroups,
  getRecommendedGroups,
  getGroupsByCategory,
  getAvailableGroups,
  searchGroupsByTags,
};
