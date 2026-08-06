// thronet-server/src/connections/controllers/block.controller.ts
import { Request, Response } from 'express';
import BlockService from '../services/block.service';
import { BlockReason } from '../models/ConnectionBlock';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';

class BlockController {
    static async blockUser(req: Request, res: Response) {
        try {
            const blockerId = (req as any).user.id;
            const { blockedId, reason, customReason } = req.body;

            if (!blockedId) {
                return ResponseUtil.badRequest(res, 'blockedId is required');
            }

            const validReason: BlockReason = Object.values(BlockReason).includes(reason)
                ? reason
                : BlockReason.OTHER;

            const result = await BlockService.blockUser(blockerId, blockedId, validReason, customReason);
            return ResponseUtil.success(res, result, 'User blocked successfully', 201);
        } catch (error: any) {
            LoggerUtil.error('Block user failed', { error: error.message });
            if (error.message === 'Cannot block yourself' || error.message === 'User already blocked') {
                return ResponseUtil.badRequest(res, error.message);
            }
            return ResponseUtil.error(res, error.message || 'Failed to block user', 500);
        }
    }

    static async unblockUser(req: Request, res: Response) {
        try {
            const blockerId = (req as any).user.id;
            const { blockedId } = req.params;

            const result = await BlockService.unblockUser(blockerId, blockedId);
            return ResponseUtil.success(res, result, 'User unblocked successfully');
        } catch (error: any) {
            LoggerUtil.error('Unblock user failed', { error: error.message });
            if (error.message === 'Block not found') {
                return ResponseUtil.notFound(res, error.message);
            }
            return ResponseUtil.error(res, error.message || 'Failed to unblock user', 500);
        }
    }

    static async isUserBlocked(req: Request, res: Response) {
        try {
            const currentUserId = (req as any).user.id;
            const { userId } = req.params;

            const status = await BlockService.isUserBlocked(currentUserId, userId);
            return ResponseUtil.success(res, status, 'Block status retrieved successfully');
        } catch (error: any) {
            LoggerUtil.error('Check block status failed', { error: error.message });
            return ResponseUtil.error(res, error.message || 'Failed to check block status', 500);
        }
    }

    static async getBlockedUsers(req: Request, res: Response) {
        try {
            const blockerId = (req as any).user.id;
            const blocks = await BlockService.getBlockedUsers(blockerId);
            return ResponseUtil.success(res, { blocks }, 'Blocked users retrieved successfully');
        } catch (error: any) {
            LoggerUtil.error('Get blocked users failed', { error: error.message });
            return ResponseUtil.error(res, error.message || 'Failed to get blocked users', 500);
        }
    }
}

export default BlockController;