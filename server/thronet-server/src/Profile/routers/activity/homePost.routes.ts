/**
 * HomePost Routes
 * Base: /api/v1/home-post
 */

import express from 'express';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import upload from '@/shared/upload/upload';
import { validateCreateHomePost } from '@/Profile/middlewares/validation.middleware';
import HomePostController from '@/Profile/controllers/activity/homePost.controller';

const router = express.Router();

/**
 * POST /api/v1/home-post/create
 * Create a post from home feed
 */
router.post(
    '/create',
    AuthMiddleware.authenticate as any,
    upload.uploadFields([
        { name: 'images', maxCount: 10 },
        { name: 'videos', maxCount: 5 },
        { name: 'documents', maxCount: 5 },
    ]),
    validateCreateHomePost,
    // rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    HomePostController.createHomePost as any
);

/**
 * GET /api/v1/home-post/feed
 * Get home feed posts (public only, paginated)
 */
router.get(
    '/feed',
    AuthMiddleware.authenticate as any,
    // rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    HomePostController.getHomeFeed as any
);

export default router;