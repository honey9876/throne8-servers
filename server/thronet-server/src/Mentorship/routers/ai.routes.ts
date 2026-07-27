// src/routes/ai.routes.ts
import { Router } from 'express';
import {aiController} from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { rateLimitSearch } from '@/Mentorship/middlewares/rateLimit.middleware';


const router = Router();

/**
 * @route   GET /api/v1/ai/match
 * @desc    Get AI-powered mentor matches (personalized)
 * @access  Private
 */
router.get('/match',AuthMiddleware.authenticate as any, rateLimitSearch, aiController.getMatchedMentors);

/**
 * @route   GET /api/v1/ai/match/:mentorId
 * @desc    Get match explanation for specific mentor
 * @access  Private
 */
router.get('/match/:mentorId',AuthMiddleware.authenticate as any, rateLimitSearch, aiController.getMatchExplanation);

/**
 * @route   POST /api/v1/ai/refresh
 * @desc    Refresh AI matches (clear cache and recalculate)
 * @access  Private
 */
router.post('/refresh',AuthMiddleware.authenticate as any, aiController.refreshMatches);

/**
 * @route   GET /api/v1/ai/featured
 * @desc    Get featured mentors
 * @access  Public
 */
router.get('/featured', rateLimitSearch, aiController.getFeaturedMentors);

/**
 * @route   GET /api/v1/ai/top-rated
 * @desc    Get top rated mentors
 * @access  Public
 */
router.get('/top-rated', rateLimitSearch, aiController.getTopRatedMentors);

/**
 * @route   GET /api/v1/ai/trending
 * @desc    Get trending mentors (most booked recently)
 * @access  Public
 */
router.get('/trending', rateLimitSearch, aiController.getTrendingMentors);

/**
 * @route   GET /api/v1/ai/new
 * @desc    Get new mentors (recently joined)
 * @access  Public
 */
router.get('/new', rateLimitSearch, aiController.getNewMentors);

/**
 * @route   GET /api/v1/ai/recommended
 * @desc    Get personalized recommendations
 * @access  Private
 */
router.get('/recommended',AuthMiddleware.authenticate as any, rateLimitSearch, aiController.getRecommendedMentors);

/**
 * @route   GET /api/v1/ai/similar/:mentorId
 * @desc    Get similar mentors
 * @access  Public
 */
router.get('/similar/:mentorId', rateLimitSearch, aiController.getSimilarMentors);

/**
 * @route   GET /api/v1/ai/domain/:domain
 * @desc    Get mentors by domain
 * @access  Public
 */
router.get('/domain/:domain', rateLimitSearch, aiController.getMentorsByDomain);

/**
 * @route   GET /api/v1/ai/company/:companyId
 * @desc    Get mentors by company
 * @access  Public
 */
router.get('/company/:companyId', rateLimitSearch, aiController.getMentorsByCompany);

export default router;





// ## 🎯 **Testing Checklist**
// ```
// [ ] TEST 1: Search All Mentors
// [ ] TEST 2: Search by Keyword (google)
// [ ] TEST 3: Filter by Domain (interview_prep)
// [ ] TEST 4: Filter by Multiple Domains
// [ ] TEST 5: Filter by Price Range
// [ ] TEST 6: Filter by Rating
// [ ] TEST 7: Filter by Experience
// [ ] TEST 8: Sort by Rating
// [ ] TEST 9: Sort by Experience
// [ ] TEST 10: Sort by Price
// [ ] TEST 11: Pagination
// [ ] TEST 12: Combined Filters
// [ ] TEST 13: Domain Categories
// [ ] TEST 14: Companies List
// [ ] TEST 15: Search Suggestions
// [ ] TEST 16: Popular Searches
