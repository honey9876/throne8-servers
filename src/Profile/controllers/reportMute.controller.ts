import { Request, Response } from 'express';
import ReportMuteService from '@/Profile/services/reportMute.service';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';

interface UserPayload {
    userId: string;
    role: string;
    email: string;
}

class ReportMuteController {
    static async reportComment(
        req: Request<{ commentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }
            const { commentId } = req.params;
            const { reason } = req.body;

            const result = await ReportMuteService.reportComment(commentId, req.user.userId, reason);
            ResponseUtil.success(res, result, 'Comment reported successfully');
        } catch (error: any) {
            LoggerUtil.error('Report comment failed', { error: error.message });
            if (error.message === 'Comment not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }
            if (
                error.message === 'You cannot report your own comment' ||
                error.message === 'You have already reported this comment'
            ) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async muteThread(
        req: Request<{ commentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }
            const { commentId } = req.params;

            const result = await ReportMuteService.muteThread(commentId, req.user.userId);
            ResponseUtil.success(res, result, 'Thread muted successfully');
        } catch (error: any) {
            LoggerUtil.error('Mute thread failed', { error: error.message });
            if (error.message === 'Comment not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async unmuteThread(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }
            const { postId } = req.params;
            const result = await ReportMuteService.unmuteThread(postId, req.user.userId);
            ResponseUtil.success(res, result, 'Thread unmuted successfully');
        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async getMutedThreads(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }
            const mutedPostIds = await ReportMuteService.getMutedThreads(req.user.userId);
            ResponseUtil.success(res, { mutedPostIds }, 'Muted threads fetched successfully');
        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
        }
    }
}

export default ReportMuteController;