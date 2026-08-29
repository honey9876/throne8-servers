// src/connections/controllers/profileView.controller.ts
//
// Rewritten from scratch — the previous file (1585 lines) was entirely commented
// out and imported paths that don't exist in this repo (../services/profileViewService,
// ../utils/response, ../utils/logger). See profileView.service.ts for details.
//
// Exports match exactly what connections/routes/profileviews.routes.ts already
// expects: ProfileViewController, healthCheck, batchProfileViewOperations.

import { Request, Response, NextFunction } from 'express';
import { SuccessResponse, ErrorResponse, HttpStatus } from '@/shared/response.util';
import logger from '@/shared/logger.util';
import { profileViewService } from '../services/profileView.service';

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

function getUserId(req: AuthenticatedRequest): string {
  const userId = req.user?.id;
  if (!userId) {
    throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, 'AUTH_001');
  }
  return userId;
}

export const healthCheck = (_req: Request, res: Response): void => {
  res.status(HttpStatus.OK).json(SuccessResponse({ status: 'ok' }, 'Profile view service healthy'));
};

export const ProfileViewController = {
  /** Feature 1: POST /record */
  async recordProfileView(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      console.log('--- ENTERING recordProfileView ---');
      const viewerId = getUserId(req);
      const { viewedUserId, metadata, anonymous } = req.body;
      console.log('Payload received:', { viewerId, viewedUserId, metadata, anonymous });
      const result = await profileViewService.recordProfileView(viewerId, { viewedUserId, metadata, anonymous });
      res.status(HttpStatus.CREATED).json(SuccessResponse(result, 'Profile view recorded'));
    } catch (error) {
      console.error('🔥🔥🔥 ERROR IN recordProfileView 🔥🔥🔥');
      console.error(error);
      next(error);
    }
  },

  /** Feature 2: GET /viewers */
  async getWhoViewedProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserId(req);
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const result = await profileViewService.getWhoViewedProfile(userId, { page, limit });
      res.status(HttpStatus.OK).json(SuccessResponse(result, 'Profile viewers retrieved'));
    } catch (error) {
      next(error);
    }
  },

  /** Feature 3: GET /count */
  async getProfileViewCount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserId(req);
      const result = await profileViewService.getProfileViewCount(userId);
      res.status(HttpStatus.OK).json(SuccessResponse(result, 'Profile view count retrieved'));
    } catch (error) {
      next(error);
    }
  },

  /** Feature 4: GET /analytics */
  async getProfileViewAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserId(req);
      const days = req.query.days ? Number(req.query.days) : 30;
      const result = await profileViewService.getProfileViewAnalytics(userId, days);
      res.status(HttpStatus.OK).json(SuccessResponse(result, 'Profile view analytics retrieved'));
    } catch (error) {
      next(error);
    }
  },

  /** Feature 5: PUT /privacy */
  async setProfileViewPrivacy(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserId(req);
      const { viewVisibility } = req.body;
      await profileViewService.setProfileViewPrivacy(userId, viewVisibility);
      res.status(HttpStatus.OK).json(SuccessResponse(null, 'Profile view privacy updated'));
    } catch (error) {
      next(error);
    }
  },

  /** Feature 6: DELETE /history */
  async deleteProfileViewHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserId(req);
      const daysOld = req.query.daysOld ? Number(req.query.daysOld) : undefined;
      const result = await profileViewService.deleteProfileViewHistory(userId, daysOld);
      res.status(HttpStatus.OK).json(SuccessResponse(result, 'Profile view history deleted'));
    } catch (error) {
      next(error);
    }
  },

  /** Feature 7: GET /insights */
  async getProfileViewInsights(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserId(req);
      const result = await profileViewService.getProfileViewInsights(userId);
      res.status(HttpStatus.OK).json(SuccessResponse(result, 'Profile view insights retrieved'));
    } catch (error) {
      next(error);
    }
  },

  /** Feature 8: GET /export */
  async exportProfileViewData(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserId(req);
      const format = (req.query.format as string) || 'json';
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const data = await profileViewService.exportProfileViewData(userId, startDate, endDate);

      if (format === 'csv') {
        const header = 'viewId,viewerId,timestamp,visibility\n';
        const rows = data
          .map((d: any) => `${d.viewId},${d.viewerId},${d.timestamp.toISOString()},${d.visibility}`)
          .join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=profile-views.csv');
        res.status(HttpStatus.OK).send(header + rows);
        return;
      }

      res.status(HttpStatus.OK).json(SuccessResponse(data, 'Profile view data exported'));
    } catch (error) {
      next(error);
    }
  },
};

/** Bonus: POST /batch — sequential execution; kept simple, not a transaction */
export const batchProfileViewOperations = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { operations } = req.body as { operations: Array<{ type: string; data: any }> };

    const results = [];
    for (const op of operations) {
      try {
        if (op.type === 'record') {
          results.push(await profileViewService.recordProfileView(userId, op.data));
        } else if (op.type === 'delete') {
          results.push(await profileViewService.deleteProfileViewHistory(userId, op.data?.daysOld));
        } else if (op.type === 'update_privacy') {
          await profileViewService.setProfileViewPrivacy(userId, op.data?.viewVisibility);
          results.push({ success: true });
        }
      } catch (opError) {
        logger.warn('Batch operation item failed', {
          error: opError instanceof Error ? opError.message : 'Unknown error',
          operation: op.type,
        });
        results.push({ success: false, error: 'Operation failed' });
      }
    }

    res.status(HttpStatus.OK).json(SuccessResponse({ results }, 'Batch operations completed'));
  } catch (error) {
    next(error);
  }
};
