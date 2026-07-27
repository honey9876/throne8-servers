/**
 * ====================================
 * CHAT ROUTES
 * ====================================
 * Routes for group chat functionality
 */

import { Router } from 'express';
import {
  sendMessage,
  getMessages,
  editMessage,
  deleteMessage,
  reactToMessage,
  togglePinMessage,
  getPinnedMessages,
  markAsRead,
  getReadStatus,
  searchMessages,
} from '../controllers/chat.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { isMember } from '../middleware/groupAccess.middleware';

const router = Router();

/**
 * @route   POST /api/v1/chat/:groupId/send
 * @desc    Send message in group
 * @access  Private (Group Members Only)
 */
router.post(
  '/:groupId/send',
  AuthMiddleware.authenticate as any,
  isMember,
  sendMessage
);

/**
 * @route   GET /api/v1/chat/:groupId/messages
 * @desc    Get chat history
 * @access  Private (Group Members Only)
 * @params  ?page=1&limit=50&before=messageId&after=messageId
 */
router.get('/:groupId/messages', AuthMiddleware.authenticate as any,
  isMember, getMessages);

/**
 * @route   GET /api/v1/chat/:groupId/pinned
 * @desc    Get pinned messages
 * @access  Private (Group Members Only)
 */
router.get('/:groupId/pinned', AuthMiddleware.authenticate as any,
  isMember, getPinnedMessages);

/**
 * @route   GET /api/v1/chat/:groupId/search
 * @desc    Search messages in group
 * @access  Private (Group Members Only)
 * @params  ?query=text&page=1&limit=20
 */
router.get('/:groupId/search', AuthMiddleware.authenticate as any,
  isMember, searchMessages);

/**
 * @route   PUT /api/v1/chat/message/:messageId
 * @desc    Edit message (within 15 minutes)
 * @access  Private (Message Owner Only)
 */
router.put('/message/:messageId', AuthMiddleware.authenticate as any,
  editMessage);

/**
 * @route   DELETE /api/v1/chat/message/:messageId
 * @desc    Delete message
 * @access  Private (Message Owner or Group Leader)
 */
router.delete('/message/:messageId', AuthMiddleware.authenticate as any,
  deleteMessage);

/**
 * @route   POST /api/v1/chat/message/:messageId/react
 * @desc    React to message (toggle)
 * @access  Private (Group Members Only)
 */
router.post('/message/:messageId/react', AuthMiddleware.authenticate as any,
  reactToMessage);

/**
 * @route   PATCH /api/v1/chat/message/:messageId/pin
 * @desc    Pin/Unpin message
 * @access  Private (Group Leader Only)
 */
router.patch('/message/:messageId/pin', AuthMiddleware.authenticate as any,
  togglePinMessage);

/**
 * @route   PATCH /api/v1/chat/message/:messageId/read
 * @desc    Mark message as read
 * @access  Private (Group Members Only)
 */
router.patch('/message/:messageId/read', AuthMiddleware.authenticate as any,
  markAsRead);

/**
 * @route   GET /api/v1/chat/message/:messageId/read-status
 * @desc    Get message read status
 * @access  Private (Group Members Only)
 */
router.get('/message/:messageId/read-status', AuthMiddleware.authenticate as any,
  getReadStatus);

export default router;