// thronet-server/src/connections/routes/block.routes.ts
import { Router, RequestHandler } from 'express';
import BlockController from '../controllers/block.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = Router();

const authenticate = AuthMiddleware.authenticate as unknown as RequestHandler;

router.post('/', authenticate, BlockController.blockUser);
router.delete('/:blockedId', authenticate, BlockController.unblockUser);
router.get('/status/:userId', authenticate, BlockController.isUserBlocked);
router.get('/', authenticate, BlockController.getBlockedUsers);

export default router;