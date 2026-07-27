console.log('🔍 notification/routers/index.ts LOADING START');


import { Router } from 'express';
import NotificationController from '../controllers/notification.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = Router();

router.use(AuthMiddleware.authenticate as any);

router.get('/', NotificationController.getNotifications);
router.patch('/:notificationId/read', NotificationController.markAsRead);
router.patch('/mark-all-read', NotificationController.markAllAsRead);
router.delete('/:notificationId', NotificationController.deleteNotification);



export default router;
console.log('🔍 notification/routers/index.ts LOADING END');