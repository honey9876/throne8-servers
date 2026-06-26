/**
 * message.routes.ts
 * All messaging REST routes.
 * Auth middleware is applied to every route.
 * 
 * Mount in app.ts as:
 *   app.use('/api/v1/messaging', messageRoutes);
 */

import { Router, Response } from 'express';
import messageController from '../controllers/message.controller';
import {
    sendMessageValidator,
    getHistoryValidator,
    searchMessagesValidator,
    messageIdValidator,
    reactionValidator,
    createDirectConversationValidator,
    markSeenValidator,
} from '../validations/message.validator';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { uploadSingle } from '@/shared/upload/upload';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import { AuthRequest } from '@/Mentorship/interface/express';

console.log('🔍 message.routes.ts LOADING START');

const router = Router();

// All routes require authentication
router.use(AuthMiddleware.authenticate as any);
// ── CONVERSATIONS ────────────────────────────────────────────────────────────

/**
 * GET /conversations
 * List all conversations for current user
 */
router.get('/conversations', messageController.getConversations.bind(messageController) as any);

/**
 * POST /conversations/direct
 * Get or create a direct conversation with targetUserId
 * Body: { targetUserId: UUID }
 */
router.post(
    '/conversations/direct',
    createDirectConversationValidator,
    messageController.getOrCreateDirect.bind(messageController) as any
);

/**
 * PATCH /conversations/:conversationId/seen
 * Mark all messages in conversation as seen by current user
 */
router.patch(
    '/conversations/:conversationId/seen',
    markSeenValidator,
    messageController.markSeen.bind(messageController) as any
);

/**
 * POST /upload
 * Upload a media file for use in a message
 * Form-data: file (image, video, pdf, doc)
 */
router.post(
    '/upload',
    uploadSingle('file'),
    async (req: AuthRequest, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }
            const result = await new Promise<any>((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'message-media', resource_type: 'auto' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                stream.end(req.file!.buffer);
            });
            return res.status(200).json({
                success: true,
                data: {
                    mediaUrl: result.secure_url,
                    publicId: result.public_id,
                    resourceType: result.resource_type,
                    format: result.format,
                    width: result.width,
                    height: result.height,
                },
            });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ── MESSAGES ─────────────────────────────────────────────────────────────────

/**
 * POST /messages
 * Send a new message
 * Body: { conversationId, text, type?, mediaUrl?, mediaDuration? }
 */
router.post(
    '/messages',
    sendMessageValidator,
    messageController.sendMessage.bind(messageController) as any
);

/**
 * GET /conversations/:conversationId/messages
 * Paginated history (cursor-based)
 * Query: ?cursor=ISO_TIMESTAMP&limit=30
 */
router.get(
    '/conversations/:conversationId/messages',
    getHistoryValidator,
    messageController.getHistory.bind(messageController) as any
);

/**
 * GET /conversations/:conversationId/messages/search
 * Full-text search
 * Query: ?keyword=hello&limit=20&page=1
 */
router.get(
    '/conversations/:conversationId/messages/search',
    searchMessagesValidator,
    messageController.searchMessages.bind(messageController) as any
);

/**
 * GET /conversations/:conversationId/messages/pinned
 * All pinned messages in a conversation
 */
router.get(
    '/conversations/:conversationId/messages/pinned',
    messageController.getPinned.bind(messageController) as any
);

/**
 * PATCH /messages/:messageId/pin
 * Toggle pin on a message
 */
router.patch(
    '/messages/:messageId/pin',
    messageIdValidator,
    messageController.togglePin.bind(messageController) as any
);

/**
 * POST /messages/react
 * Toggle emoji reaction
 * Body: { messageId: UUID, emoji: string }
 */
router.post(
    '/messages/react',
    reactionValidator,
    messageController.toggleReaction.bind(messageController) as any
);

/**
 * DELETE /messages/:messageId
 * Soft delete own message
 */
router.delete(
    '/messages/:messageId',
    messageIdValidator,
    messageController.deleteMessage.bind(messageController) as any
);

export default router;


console.log('🔍 message.routes.ts LOADING END');