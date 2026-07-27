import { Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import followerService from '../services/follower.service';
import ResponseUtil from '@/shared/response.util';
import logger from '@/shared/logger.util';
import { asyncHandler } from '@/shared/errors/app.error';

class FollowerController {

  // POST /follow — body me companyId UUID
  followCompany = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { companyId } = req.body;             // ← company UUID
    const employeeId = req.user?.id;            // ← employee UUID (JWT se)

    if (!employeeId) { ResponseUtil.unauthorized(res, 'Authentication required'); return; }

    const result = await followerService.followCompany(employeeId, companyId);

    if (!result.success) {
      if (result.alreadyFollowing) { ResponseUtil.conflict(res, result.message); return; }
      ResponseUtil.badRequest(res, result.message);
      return;
    }

    ResponseUtil.created(res, result.follower, result.message);
  });

  // DELETE /unfollow/:companyId — ✅ resolvedObjectId use karo
  unfollowCompany = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const companyObjectId = (req as any).resolvedObjectId;  // ✅ middleware se
    const employeeId = req.user?.id;                        // ← employee UUID

    if (!employeeId) { ResponseUtil.unauthorized(res, 'Authentication required'); return; }

    const result = await followerService.unfollowCompany(employeeId, companyObjectId);

    if (!result.success) { ResponseUtil.notFound(res, result.message); return; }
    ResponseUtil.success(res, { unfollowed: true }, result.message);
  });

  // GET /company/:companyId — ✅ resolvedObjectId use karo
  getCompanyFollowers = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const companyObjectId = (req as any).resolvedObjectId;  // ✅ middleware se
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = await followerService.getCompanyFollowers(companyObjectId, page, pageSize);

    ResponseUtil.success(res, {
      followers: result.followers,
      metaData: result.meta,
    }, 'Company followers retrieved successfully');
  });

  // GET /user/:userId — ✅ resolvedObjectId use karo (employee UUID)
  getUserFollowing = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const employeeObjectId = (req as any).resolvedObjectId;  // ✅ middleware se
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = await followerService.getUserFollowing(employeeObjectId, page, pageSize);

    ResponseUtil.success(res, {
      following: result.following,
      metaData: result.meta,
    }, 'Following companies retrieved successfully');
  });

  // GET /check/:companyId — ✅ resolvedObjectId use karo
  checkFollowingStatus = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const companyObjectId = (req as any).resolvedObjectId;  // ✅ middleware se
    const employeeId = req.user?.id;                        // ← employee UUID

    if (!employeeId) { ResponseUtil.unauthorized(res, 'Authentication required'); return; }

    const result = await followerService.checkFollowingStatus(employeeId, companyObjectId);
    ResponseUtil.success(res, result, 'Following status retrieved successfully');
  });

  // GET /stats/:companyId — ✅ resolvedObjectId use karo
  getFollowerStats = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const companyObjectId = (req as any).resolvedObjectId;  // ✅ middleware se

    const stats = await followerService.getFollowerStats(companyObjectId);
    ResponseUtil.success(res, stats, 'Follower statistics retrieved successfully');
  });

  // PATCH /preferences — body me companyId UUID
  updateNotificationPreferences = asyncHandler(
    async (req: AuthRequest, res: Response): Promise<void> => {
      const { companyId, preferences } = req.body;  // ← company UUID
      const employeeId = req.user?.id;              // ← employee UUID

      if (!employeeId) { ResponseUtil.unauthorized(res, 'Authentication required'); return; }

      const follower = await followerService.updateNotificationPreferences(
        employeeId, companyId, preferences
      );
      ResponseUtil.success(res, follower, 'Notification preferences updated successfully');
    }
  );

  // GET /suggestions — NO params (auth user se)
  getFollowSuggestions = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const employeeId = req.user?.id;  // ← employee UUID
    const limit = parseInt(req.query.limit as string) || 10;

    if (!employeeId) { ResponseUtil.unauthorized(res, 'Authentication required'); return; }

    const suggestions = await followerService.getFollowSuggestions(employeeId, limit);
    ResponseUtil.success(res, suggestions, 'Follow suggestions retrieved successfully');
  });

  // GET /mutual/:companyId — ✅ resolvedObjectId use karo
  getMutualFollowers = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const companyObjectId = (req as any).resolvedObjectId;  // ✅ middleware se
    const employeeId = req.user?.id;                        // ← employee UUID

    if (!employeeId) { ResponseUtil.unauthorized(res, 'Authentication required'); return; }

    const mutualFollowers = await followerService.getMutualFollowers(employeeId, companyObjectId);
    ResponseUtil.success(res, mutualFollowers, 'Mutual followers retrieved successfully');
  });

  // GET /recent/:companyId — ✅ resolvedObjectId use karo
  getRecentFollowers = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const companyObjectId = (req as any).resolvedObjectId;  // ✅ middleware se
    const days = parseInt(req.query.days as string) || 7;

    const recentFollowers = await followerService.getRecentFollowers(companyObjectId, days);
    ResponseUtil.success(res, recentFollowers, `Recent followers (last ${days} days) retrieved successfully`);
  });
}

export const followerController = new FollowerController();