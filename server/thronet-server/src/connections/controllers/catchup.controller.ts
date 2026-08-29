// src/connections/controllers/catchup.controller.ts
import { Request, Response } from 'express';
import CatchUpService from '../services/catchup.service';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';

/**
 * GET /catchup/:userId
 * Returns real job-change, work-anniversary, and birthday events
 * from the user's active connections.
 */
export const getCatchUpFeed = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    try {
        if (!userId) {
            ResponseUtil.badRequest(res, 'User ID is required');
            return;
        }

        const items = await CatchUpService.getCatchUpFeed(userId);

        LoggerUtil.info('Catch up feed fetched', { userId, count: items.length });
        ResponseUtil.success(res, { items }, 'Catch up feed fetched successfully');
        return;
    } catch (error: any) {
        LoggerUtil.error('getCatchUpFeed controller failed', {
            error: error.message,
            userId,
        });
        ResponseUtil.error(res, error.message || 'Failed to fetch catch up feed', 500);
        return;
    }
};

export default { getCatchUpFeed };