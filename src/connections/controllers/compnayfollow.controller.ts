import { Response, NextFunction, Request } from 'express';
import followService from '../services/Compnayfollow.service';
import { ErrorResponse, HttpStatus, SuccessResponse } from '@/shared/response.util';
import { asyncHandler } from '@/shared/utils/helpers.util';

interface AuthRequest extends Request {
    user?: {
        id: string;
        userId?: string;
        isAdmin: boolean;
        email: string;
        role: 'user' | 'admin';
    };
}

class companyfollowController {

    // POST /api/v1/follows/company/:companyId
    static followCompany = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId || req.user?.id;
        if (!authUserId) return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));

        const { companyId } = req.params;

        await followService.followCompany(authUserId, companyId);

        res.status(HttpStatus.CREATED).json(SuccessResponse(null, 'Company followed successfully', HttpStatus.CREATED));
    });

    // DELETE /api/v1/follows/company/:companyId
    static unfollowCompany = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId || req.user?.id;
        if (!authUserId) return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));

        const { companyId } = req.params;

        await followService.unfollowCompany(authUserId, companyId);

        res.status(HttpStatus.OK).json(SuccessResponse(null, 'Company unfollowed successfully', HttpStatus.OK));
    });

    // GET /api/v1/follows/company/:companyId/followers
    // Only admin or the company itself can see full follower list
    static getCompanyFollowers = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId || req.user?.id;
        if (!authUserId) return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));

        const { companyId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        // Authorization: only admin or the company account itself
        if (authUserId !== companyId && req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        const result = await followService.getFollowers(companyId, page, limit);

        res.status(HttpStatus.OK).json(SuccessResponse(result, 'Followers retrieved', HttpStatus.OK));
    });

    // GET /api/v1/follows/company/:companyId/count  (public)
    static getFollowerCount = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const { companyId } = req.params;
        const count = await followService.getFollowerCount(companyId);
        res.status(HttpStatus.OK).json(SuccessResponse({ count }, 'Follower count retrieved', HttpStatus.OK));
    });

    // GET /api/v1/follows/user/:userId/companies  — what companies does this user follow?
    static getUserFollowedCompanies = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId || req.user?.id;
        if (!authUserId) return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));

        const { userId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        // Users can only view their own followed companies (or admin)
        if (userId !== authUserId && req.user?.role !== 'admin') {
            return next(new ErrorResponse('Not authorized', HttpStatus.FORBIDDEN, 'AUTH_ERROR'));
        }

        const result = await followService.getFollowedCompanies(userId, page, limit);

        res.status(HttpStatus.OK).json(SuccessResponse(result, 'Followed companies retrieved', HttpStatus.OK));
    });

    // GET /api/v1/follows/company/:companyId/status  — is current user following this company?
    static getFollowStatus = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const authUserId = req.user?.userId || req.user?.id;
        if (!authUserId) return next(new ErrorResponse('Authentication required', HttpStatus.UNAUTHORIZED, 'AUTH_ERROR'));

        const { companyId } = req.params;
        const isFollowing = await followService.isFollowing(authUserId, companyId);

        res.status(HttpStatus.OK).json(SuccessResponse({ isFollowing }, 'Follow status retrieved', HttpStatus.OK));
    });
}

export default companyfollowController;