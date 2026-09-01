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
 * DELETE /conversations/:conversationId
 * Delete a conversation (soft delete for the current user)
 */
router.delete(
    '/conversations/:conversationId',
    messageController.deleteConversation.bind(messageController) as any
);

/**
 * PATCH /conversations/:conversationId/unread
 * Mark a conversation as unread manually
 */
router.patch(
    '/conversations/:conversationId/unread',
    messageController.markUnread.bind(messageController) as any
);

/**
 * PATCH /conversations/:conversationId/archive
 * Archive or unarchive a conversation
 */
router.patch(
    '/conversations/:conversationId/archive',
    messageController.archiveConversation.bind(messageController) as any
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
            // Try to extract extension safely
            const origName = req.file.originalname || '';
            const extension = origName.includes('.') ? origName.split('.').pop()?.toLowerCase() : null;
            
            // Hardcode common document types to ALWAYS be raw
            const isDocExt = extension && ['pdf', 'doc', 'docx', 'txt', 'rtf', 'csv', 'xls', 'xlsx', 'ppt', 'pptx', 'zip'].includes(extension);
            const isDocMime = req.file.mimetype.startsWith('application/') || req.file.mimetype.startsWith('text/');
            
            const rType = (isDocExt || isDocMime) ? 'raw' : 'auto';
            
            const options: any = { 
                folder: 'message-media', 
                resource_type: rType 
            };
            
            // For raw documents (like PDFs, DOCX), Cloudinary needs the extension 
            // to serve the file correctly on downloads. The 'format' option does not 
            // work for raw buffers, the extension must be part of the public_id.
            if (rType === 'raw') {
                const extToUse = extension || 'pdf'; // Fallback to pdf if completely missing
                const uniqueId = Date.now().toString() + '-' + Math.round(Math.random() * 1e5).toString();
                options.public_id = `${uniqueId}.${extToUse}`;
            }

            const result = await new Promise<any>((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    options,
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