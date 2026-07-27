import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { asyncHandler } from '@/shared/utils/helpers.util';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import { logger } from '@/shared/logger.util';
import followController from '../controllers/compnayfollow.controller';
import environmentConfig from '@/config/environment/environment';

const router = Router();

const followLimiter = rateLimit({
    windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS,
    max: environmentConfig.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json(new ErrorResponse('Too many requests', HttpStatus.TOO_MANY_REQUESTS));
    },
});

router.use(AuthMiddleware.authenticate as any);

// Follow a company
router.post('/company/:companyId', followLimiter, asyncHandler(followController.followCompany));

// Unfollow a company
router.delete('/company/:companyId', followLimiter, asyncHandler(followController.unfollowCompany));

// Get follower count (public)
router.get('/company/:companyId/count', followLimiter, asyncHandler(followController.getFollowerCount));

// Get follow status for current user
router.get('/company/:companyId/status', followLimiter, asyncHandler(followController.getFollowStatus));

// Get company followers (admin or company only)
router.get('/company/:companyId/followers', followLimiter, asyncHandler(followController.getCompanyFollowers));

// Get companies a user follows
router.get('/user/:userId/companies', followLimiter, asyncHandler(followController.getUserFollowedCompanies));

export const comapanyfollowRouter = router;