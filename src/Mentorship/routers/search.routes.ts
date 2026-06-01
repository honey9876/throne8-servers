import { Router } from 'express';
import { searchController } from '@/shared/controllers/index.controllers';
import { rateLimitSearch } from '@/Mentorship/middlewares/rateLimit.middleware';

const router = Router();

/**
 * @route   GET /api/search/mentors
 * @desc    Search mentors with filters
 * @access  Public (optional auth for personalized results)
 * @query   keyword, domains, companyIds, minPrice, maxPrice, minRating, maxRating,
 *          minExperience, maxExperience, experienceLevel, languages, skills,
 *          featured, verified, sortBy, sortOrder, page, limit
 */
router.get(
  '/mentors',
  rateLimitSearch,
  searchController.searchMentors
);

/**
 * @route   GET /api/search/domains
 * @desc    Get all domain categories with mentor counts
 * @access  Public
 */
router.get(
  '/domains',
  rateLimitSearch,
  searchController.getDomainCategories
);

/**
 * @route   GET /api/search/companies
 * @desc    Get companies with mentor counts
 * @access  Public
 */
router.get(
  '/companies',
  rateLimitSearch,
  searchController.getCompaniesWithMentorCount
);

/**
 * @route   GET /api/search/suggestions
 * @desc    Get autocomplete suggestions for search
 * @access  Public
 * @query   keyword, limit
 */
router.get(
  '/suggestions',
  rateLimitSearch,
  searchController.getSearchSuggestions
);

/**
 * @route   GET /api/search/popular
 * @desc    Get popular search terms
 * @access  Public
 */
router.get(
  '/popular',
  rateLimitSearch,
  searchController.getPopularSearches
);

/**
 * @route   POST /api/search/clear-filters
 * @desc    Clear search filters (client-side action acknowledgment)
 * @access  Public
 */
router.post(
  '/clear-filters',
  rateLimitSearch,
  searchController.clearFilters
);

export default router;