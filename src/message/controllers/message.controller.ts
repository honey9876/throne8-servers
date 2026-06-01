/**
 * message.controller.ts
 * HTTP layer only — validates input, calls service, returns response.
 * No business logic here.
 */

import { Response } from 'express';
import { validationResult } from 'express-validator';
import messageService from '../services/messaging.service';
import ResponseUtil from '../../shared/response.util';
import {
    MessageType,
    MessageStatus,
} from '../types/message.types';
import { AuthRequest } from '@/Mentorship/interface/express';

console.log('🔍 message.controller.ts LOADING START');

// ==================== HELPER ====================

function handleValidation(req: AuthRequest, res: Response): boolean {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        ResponseUtil.validationError(res, errors.array().map(e => e.msg));
        return false;
    }
    return true;
}

function userId(req: AuthRequest): string {
    return req.user!.userId;
}

// ==================== CONTROLLER ====================

class MessageController {

    /**
     * POST /conversations/direct
     * Get or create a direct conversation with another user
     */
    async getOrCreateDirect(req: AuthRequest, res: Response) {
        if (!handleValidation(req, res)) return;

        try {
            const conversation = await messageService.getOrCreateDirectConversation(
                userId(req),
                req.body.targetUserId
            );
            return ResponseUtil.success(res, conversation, 'Conversation ready', 200);
        } catch (err: any) {
            return ResponseUtil.error(res, err.message, err.status || 500);
        }
    }

    /**
     * GET /conversations
     * All conversations for current user
     */
    async getConversations(req: AuthRequest, res: Response) {
        try {
            const conversations = await messageService.getConversations(userId(req));
            return ResponseUtil.success(res, conversations, 'Conversations fetched');
        } catch (err: any) {
            return ResponseUtil.error(res, err.message, err.status || 500);
        }
    }

    /**
     * POST /messages
     * Send a message
     */
    async sendMessage(req: AuthRequest, res: Response) {
        if (!handleValidation(req, res)) return;

        try {
            const message = await messageService.sendMessage(userId(req), {
                conversationId: req.body.conversationId,
                text: req.body.text,
                type: req.body.type ?? MessageType.TEXT,
                mediaUrl: req.body.mediaUrl,
                mediaDuration: req.body.mediaDuration,
                metadata: req.body.metadata,
            });
            return ResponseUtil.success(res, message, 'Message sent', 201);
        } catch (err: any) {
            return ResponseUtil.error(res, err.message, err.status || 500);
        }
    }

    /**
     * GET /conversations/:conversationId/messages
     * Paginated message history (cursor-based)
     */
    async getHistory(req: AuthRequest, res: Response) {
        if (!handleValidation(req, res)) return;

        try {
            const result = await messageService.getHistory(userId(req), {
                conversationId: req.params.conversationId,
                cursor: req.query.cursor as string | undefined,
                limit: req.query.limit ? Number(req.query.limit) : undefined,
            });
            return ResponseUtil.success(res, result, 'Messages fetched');
        } catch (err: any) {
            return ResponseUtil.error(res, err.message, err.status || 500);
        }
    }

    /**
     * GET /conversations/:conversationId/messages/search
     * Full-text search inside a conversation
     */
    async searchMessages(req: AuthRequest, res: Response) {
        if (!handleValidation(req, res)) return;

        try {
            const result = await messageService.searchMessages(userId(req), {
                conversationId: req.params.conversationId,
                keyword: req.query.keyword as string,
                limit: req.query.limit ? Number(req.query.limit) : undefined,
                page: req.query.page ? Number(req.query.page) : undefined,
            });
            return ResponseUtil.success(res, result, 'Search complete');
        } catch (err: any) {
            return ResponseUtil.error(res, err.message, err.status || 500);
        }
    }

    /**
     * PATCH /conversations/:conversationId/seen
     * Mark all messages in a conversation as seen
     */
    async markSeen(req: AuthRequest, res: Response) {
        if (!handleValidation(req, res)) return;

        try {
            await messageService.markConversationSeen(
                req.params.conversationId,
                userId(req)
            );
            return ResponseUtil.success(res, null, 'Marked as seen');
        } catch (err: any) {
            return ResponseUtil.error(res, err.message, err.status || 500);
        }
    }

    /**
     * GET /conversations/:conversationId/messages/pinned
     * Get all pinned messages
     */
    async getPinned(req: AuthRequest, res: Response) {
        try {
            const messages = await messageService.getPinnedMessages(
                userId(req),
                req.params.conversationId
            );
            return ResponseUtil.success(res, messages, 'Pinned messages fetched');
        } catch (err: any) {
            return ResponseUtil.error(res, err.message, err.status || 500);
        }
    }

    /**
     * PATCH /messages/:messageId/pin
     * Toggle pin on a message
     */
    async togglePin(req: AuthRequest, res: Response) {
        if (!handleValidation(req, res)) return;

        try {
            const message = await messageService.togglePin(
                userId(req),
                req.params.messageId
            );
            return ResponseUtil.success(res, message, 'Pin toggled');
        } catch (err: any) {
            return ResponseUtil.error(res, err.message, err.status || 500);
        }
    }

    /**
     * POST /messages/react
     * Add or remove emoji reaction
     */
    async toggleReaction(req: AuthRequest, res: Response) {
        if (!handleValidation(req, res)) return;

        try {
            const message = await messageService.toggleReaction(userId(req), {
                messageId: req.body.messageId,
                emoji: req.body.emoji,
            });
            return ResponseUtil.success(res, message, 'Reaction updated');
        } catch (err: any) {
            return ResponseUtil.error(res, err.message, err.status || 500);
        }
    }

    /**
     * DELETE /messages/:messageId
     * Soft delete own message
     */
    async deleteMessage(req: AuthRequest, res: Response) {
        if (!handleValidation(req, res)) return;

        try {
            await messageService.deleteMessage(userId(req), req.params.messageId);
            return ResponseUtil.success(res, null, 'Message deleted');
        } catch (err: any) {
            return ResponseUtil.error(res, err.message, err.status || 500);
        }
    }
}

export default new MessageController();
console.log('🔍 message.controller.ts LOADING END');