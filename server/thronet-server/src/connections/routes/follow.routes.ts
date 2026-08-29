// src/connections/routes/follow.routes.ts

import { Router } from 'express';
import { followController } from '../controllers/index';
import rateLimit from 'express-rate-limit';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import constants from '@/shared/constants.util';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const ERROR_CODES = constants.ERROR_CODES;


/**
 * FOLLOW ROUTES - COMPLETE API ENDPOINT MAPPING
 * 
 * Routes: 15 endpoints
 * - Core operations: follow, unfollow, update status
 * - Bulk operations: bulk follow/unfollow
 * - List operations: get followers/following with pagination
 * - Count operations: get follower/following counts
 * - Status operations: single & batch status checks
 * 
 * Features:
 * - Rate limiting per endpoint
 * - Authentication middleware ready
 * - Validation middleware integration
 * - RESTful API design
 * - Error handling
 * - Comprehensive endpoint coverage
 * 
 * Rate Limits:
 * - Follow operations: 50/hour
 * - List operations: 100/hour  
 * - Status checks: 200/hour
 * - Bulk operations: 10/hour
 */


const followRouter = Router();

followRouter.use(AuthMiddleware.authenticate as any);

// Rate limiters for different operations
const followRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
    handler: (_req, res) => {
        res.status(HttpStatus.TOO_MANY_REQUESTS).json(
            new ErrorResponse('Too many follow requests', HttpStatus.TOO_MANY_REQUESTS, ERROR_CODES.RATE_LIMIT_EXCEEDED)
        );
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const listRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100,
    handler: (_req, res) => {
        res.status(HttpStatus.TOO_MANY_REQUESTS).json(
            new ErrorResponse('Too many list requests', HttpStatus.TOO_MANY_REQUESTS, ERROR_CODES.RATE_LIMIT_EXCEEDED)
        );
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const statusRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 200,
    handler: (_req, res) => {
        res.status(HttpStatus.TOO_MANY_REQUESTS).json(
            new ErrorResponse('Too many status requests', HttpStatus.TOO_MANY_REQUESTS, ERROR_CODES.RATE_LIMIT_EXCEEDED)
        );
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const bulkRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    handler: (_req, res) => {
        res.status(HttpStatus.TOO_MANY_REQUESTS).json(
            new ErrorResponse('Too many bulk requests', HttpStatus.TOO_MANY_REQUESTS, ERROR_CODES.RATE_LIMIT_EXCEEDED)
        );
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * CORE FOLLOW OPERATIONS
 */

// Follow a user
// POST /api/v1/follow
followRouter.post('/', followRateLimit, followController.followUser.bind(followController));

// Unfollow a user  
// DELETE /api/v1/follow/:userId
followRouter.delete('/:userId', followRateLimit, followController.unfollowUser.bind(followController));

// Update follow status (accept/decline/pending)
// PUT /api/v1/follow/:userId/status
followRouter.put('/:userId/status', followRateLimit, followController.updateFollowStatus.bind(followController));

/**
 * BULK OPERATIONS
 */

// Bulk follow multiple users
// POST /api/v1/follow/bulk
followRouter.post('/bulk', bulkRateLimit, followController.bulkFollow.bind(followController));

// Bulk unfollow multiple users
// DELETE /api/v1/follow/bulk
followRouter.delete('/bulk', bulkRateLimit, followController.bulkUnfollow.bind(followController));

/**
 * LIST OPERATIONS
 */

// Get user's followers
// GET /api/v1/follow/followers/:userId
followRouter.get('/followers/:userId', listRateLimit, followController.getFollowers.bind(followController));

// Get user's following
// GET /api/v1/follow/following/:userId
followRouter.get('/following/:userId', listRateLimit, followController.getFollowing.bind(followController));

/**
 * COUNT OPERATIONS
 */

// Get follow counts for a user
// GET /api/v1/follow/counts/:userId
followRouter.get('/counts/:userId', statusRateLimit, followController.getFollowCounts.bind(followController));

/**
 * STATUS CHECK OPERATIONS
 */

// Check follow status between current user and target user
// GET /api/v1/follow/status/:userId
followRouter.get('/status/:userId', statusRateLimit, followController.checkFollowStatus.bind(followController));

// Batch check follow status for multiple users
// POST /api/v1/follow/status/batch
followRouter.post('/status/batch', statusRateLimit, followController.batchCheckFollowStatus.bind(followController));

// FILE KE END MEIN, export se pehle, YE ROUTES ADD KARO:

/**
 * COMPANY FOLLOW OPERATIONS (User → Company)
 */

// Follow a company
// POST /api/v1/follow/company/:companyId
followRouter.post('/company/:companyId', followRateLimit, followController.followCompany.bind(followController));

// Unfollow a company
// DELETE /api/v1/follow/company/:companyId
followRouter.delete('/company/:companyId', followRateLimit, followController.unfollowCompany.bind(followController));

// Get company followers list
// GET /api/v1/follow/company/:companyId/followers
followRouter.get('/company/:companyId/followers', listRateLimit, followController.getCompanyFollowers.bind(followController));

// Get company followers count
// GET /api/v1/follow/company/:companyId/followers/count
followRouter.get('/company/:companyId/followers/count', statusRateLimit, followController.getCompanyFollowersCount.bind(followController));

// Check if user follows a company
// GET /api/v1/follow/company/:companyId/status
followRouter.get('/company/:companyId/status', statusRateLimit, followController.checkCompanyFollowStatus.bind(followController));

// Get companies followed by a user
// GET /api/v1/follow/user/:userId/companies
followRouter.get('/user/:userId/companies', listRateLimit, followController.getUserFollowingCompanies.bind(followController));

/**
 * ADDITIONAL ENDPOINTS (Ready for implementation)
 */

// Search followers/following (when user service available)
// GET /api/v1/follow/search
// followRouter.get('/search', listRateLimit, followController.searchFollows.bind(followController));

// Get mutual follows between users
// GET /api/v1/follow/mutual/:userId
// followRouter.get('/mutual/:userId', statusRateLimit, followController.getMutualFollows.bind(followController));

// Get trending users (most followed recently)
// GET /api/v1/follow/trending
// followRouter.get('/trending', listRateLimit, followController.getTrendingUsers.bind(followController));

// Block a user
// POST /api/v1/follow/block/:userId
// followRouter.post('/block/:userId', followRateLimit, followController.blockUser.bind(followController));

// Unblock a user
// DELETE /api/v1/follow/block/:userId
// followRouter.delete('/block/:userId', followRateLimit, followController.unblockUser.bind(followController));

// Get follow analytics
// GET /api/v1/follow/analytics
// followRouter.get('/analytics', listRateLimit, followController.getFollowAnalytics.bind(followController));

// Export follow data
// GET /api/v1/follow/export
// followRouter.get('/export', rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), followController.exportFollowData.bind(followController));

// Import follow data
// POST /api/v1/follow/import
// followRouter.post('/import', rateLimit({ windowMs: 60 * 60 * 1000, max: 3 }), followController.importFollowData.bind(followController));

/**
 * ROUTE DOCUMENTATION
 */
followRouter.get('/docs', (_req, res) => {
    res.json({
        message: 'Follow API Documentation',
        version: '1.0.0',
        endpoints: {
            core: {
                'POST /': 'Follow a user',
                'DELETE /:userId': 'Unfollow a user',
                'PUT /:userId/status': 'Update follow status'
            },
            bulk: {
                'POST /bulk': 'Bulk follow users (max 100)',
                'DELETE /bulk': 'Bulk unfollow users (max 100)'
            },
            lists: {
                'GET /followers/:userId': 'Get user followers with pagination',
                'GET /following/:userId': 'Get user following with pagination'
            },
            counts: {
                'GET /counts/:userId': 'Get follower/following counts'
            },
            status: {
                'GET /status/:userId': 'Check follow status',
                'POST /status/batch': 'Batch check follow status (max 50)'
            }
        },
        rateLimits: {
            follow: '50 requests/hour',
            list: '100 requests/hour',
            status: '200 requests/hour',
            bulk: '10 requests/hour'
        },
        authentication: 'Required for all endpoints except GET operations',
        pagination: {
            defaultLimit: 50,
            maxLimit: 100,
            parameters: ['page', 'limit', 'sortBy', 'sortOrder']
        }
    });
});

export { followRouter };
export default followRouter;