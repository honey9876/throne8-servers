import { Request, Response } from 'express';
import { getAuthToken } from '@/shared/middlewares/auth.middleware';
import { searchService } from '../services';
import { logger } from '@/shared/logger.util';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import SearchHelper from '@/Mentorship/utils/searchHelper';

class SearchController {
  /**
   * Search mentors with filters
   * GET /api/search/mentors
   */
  async searchMentors(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Search mentors request:', req.query);

      // Parse filters from query params
      const filters = SearchHelper.parseQueryParams(req.query);

      // Parse sort params
      const sort = SearchHelper.parseSortParams(req.query);

      // Parse pagination
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      // Get auth token
      const authToken = getAuthToken(req);

      // Search mentors
      const result = await searchService.searchMentors({
        filters,
        sort,
        page,
        limit,
        authToken: authToken || undefined,
      });

      console.log("result", result)

      // Return response
      ResponseHandler.success(
        res,
        'Mentors fetched successfully',
        result.mentors,
        200,
        {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        }
      );
    } catch (error: any) {
      logger.error('Search mentors error:', error);
      ResponseHandler.error(
        res,
        error.message || 'Failed to search mentors',
        error.statusCode || 500
      );
    }
  }

  /**
   * Get domain categories with mentor counts
   * GET /api/search/domains
   */
  async getDomainCategories(_req: Request, res: Response): Promise<void> { // ✅ FIX: Add underscore
    try {
      logger.info('Get domain categories request');

      // Fetch domain categories
      const domains = await searchService.getDomainCategories();

      // Return response
      ResponseHandler.success(
        res,
        'Domain categories fetched successfully',
        domains
      );
    } catch (error: any) {
      logger.error('Get domain categories error:', error);
      ResponseHandler.error(
        res,
        error.message || 'Failed to fetch domain categories',
        error.statusCode || 500
      );
    }
  }

  /**
   * Get companies with mentor counts
   * GET /api/search/companies
   */
  async getCompaniesWithMentorCount(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Get companies with mentor count request');

      // Get auth token
      const authToken = getAuthToken(req);

      // Fetch companies
      const companies = await searchService.getCompaniesWithMentorCount(
        authToken || undefined
      );

      // Return response
      ResponseHandler.success(
        res,
        'Companies fetched successfully',
        companies
      );
    } catch (error: any) {
      logger.error('Get companies error:', error);
      ResponseHandler.error(
        res,
        error.message || 'Failed to fetch companies',
        error.statusCode || 500
      );
    }
  }

  /**
   * Get search suggestions (autocomplete)
   * GET /api/search/suggestions
   */
  async getSearchSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const keyword = req.query.keyword as string;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!keyword || keyword.trim().length < 2) {
        ResponseHandler.success(res, 'No suggestions available', []);
        return;
      }

      logger.info(`Get search suggestions for: ${keyword}`);

      // Fetch suggestions
      const suggestions = await searchService.getSearchSuggestions(keyword, limit);

      // Return response
      ResponseHandler.success(
        res,
        'Search suggestions fetched successfully',
        suggestions
      );
    } catch (error: any) {
      logger.error('Get search suggestions error:', error);
      ResponseHandler.error(
        res,
        error.message || 'Failed to fetch search suggestions',
        error.statusCode || 500
      );
    }
  }

  /**
   * Get popular searches
   * GET /api/search/popular
   */
  async getPopularSearches(_req: Request, res: Response): Promise<void> { // ✅ FIX: Add underscore
    try {
      logger.info('Get popular searches request');

      // For now, return static popular searches
      // TODO: Implement analytics to track actual popular searches
      const popularSearches = [
        'Career Change',
        'Software Engineering Interview',
        'Resume Review',
        'Product Management',
        'Data Science',
        'MBA Preparation',
        'UI/UX Design',
        'Tech Interview',
      ];

      ResponseHandler.success(
        res,
        'Popular searches fetched successfully',
        popularSearches
      );
    } catch (error: any) {
      logger.error('Get popular searches error:', error);
      ResponseHandler.error(
        res,
        error.message || 'Failed to fetch popular searches',
        error.statusCode || 500
      );
    }
  }

  /**
   * Clear search filters
   * POST /api/search/clear-filters
   */
  async clearFilters(_req: Request, res: Response): Promise<void> { // ✅ FIX: Add underscore
    try {
      logger.info('Clear filters request');

      // This is a client-side action, just acknowledge
      ResponseHandler.success(res, 'Filters cleared successfully', {
        cleared: true,
      });
    } catch (error: any) {
      logger.error('Clear filters error:', error);
      ResponseHandler.error(
        res,
        error.message || 'Failed to clear filters',
        error.statusCode || 500
      );
    }
  }
}

export default new SearchController();