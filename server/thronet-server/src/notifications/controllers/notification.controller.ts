import { Request, Response, NextFunction } from 'express';
import NotificationService from '../services/notification.service';
import { SuccessResponse, ErrorResponse, HttpStatus } from '@/shared/response.util';
import { asyncHandler } from '@/shared/utils/helpers.util';

interface AuthRequest extends Request {
    user?: { id: string; userId?: string; role: string; email: string };
}

export default class NotificationController {

    static getNotifications = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) return next(new ErrorResponse('Auth required', HttpStatus.UNAUTHORIZED));

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const result = await NotificationService.getNotifications(userId, page, limit);
        const hasNewPost = result.notifications.some(n => n.type === 'post_created');
        console.log(`--- NOTIF TRACE: Notification API returning ${result.notifications.length} notifications (post_created present: ${hasNewPost}) ---`);
        res.json(SuccessResponse(result, 'Notifications fetched'));
    });

    static markAsRead = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) return next(new ErrorResponse('Auth required', HttpStatus.UNAUTHORIZED));

        await NotificationService.markAsRead(req.params.notificationId, userId);
        res.json(SuccessResponse(null, 'Marked as read'));
    });

    static markAllAsRead = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) return next(new ErrorResponse('Auth required', HttpStatus.UNAUTHORIZED));

        await NotificationService.markAllAsRead(userId);

        // Emit updated count via socket
        try {
            const { getIO } = await import('@/socket');
            getIO().to(`user:${userId}`).emit('notification:unread:count', { count: 0 });
        } catch (_) { }

        res.json(SuccessResponse(null, 'All marked as read'));
    });

    static deleteNotification = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) return next(new ErrorResponse('Auth required', HttpStatus.UNAUTHORIZED));

        await NotificationService.deleteNotification(req.params.notificationId, userId);
        res.json(SuccessResponse(null, 'Deleted'));
    });
}