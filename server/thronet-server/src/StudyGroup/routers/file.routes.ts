/**
 * ====================================
 * FILE ROUTES
 * ====================================
 */

import express from 'express';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { isMember } from '../middleware/groupAccess.middleware';
import { uploadSingle, validateUploadedFile } from '@/shared/upload/upload';
import  fileController from '../controllers/file.controller';

const router = express.Router();

/**
 * @route   POST /api/files/:groupId/upload
 * @desc    Upload file to group
 * @access  Private (Group Members)
 */
router.post(
  '/:groupId/upload',
  AuthMiddleware.authenticate as any,
  isMember,
  uploadSingle,
  validateUploadedFile as any,
  fileController.uploadFile
);

/**
 * @route   GET /api/files/:groupId/all
 * @desc    Get all files in a group
 * @access  Private (Group Members)
 */
router.get(
  '/:groupId/all',
  AuthMiddleware.authenticate as any,
  isMember,
  fileController.getGroupFiles
);

/**
 * @route   GET /api/files/:groupId/pinned
 * @desc    Get pinned files in a group
 * @access  Private (Group Members)
 */
router.get(
  '/:groupId/pinned',
  AuthMiddleware.authenticate as any,
  isMember,
  fileController.getPinnedFiles
);

/**
 * @route   GET /api/files/:fileId
 * @desc    Get file by ID
 * @access  Private
 */
router.get(
  '/:fileId',
  AuthMiddleware.authenticate as any,
  fileController.getFileById
);

/**
 * @route   GET /api/files/:fileId/download
 * @desc    Download file
 * @access  Private
 */
router.get(
  '/:fileId/download',
  AuthMiddleware.authenticate as any,
  fileController.downloadFile
);

/**
 * @route   DELETE /api/files/:fileId
 * @desc    Delete file
 * @access  Private (Owner or Leader)
 */
router.delete(
  '/:fileId',
  AuthMiddleware.authenticate as any,
  fileController.deleteFile
);

/**
 * @route   PATCH /api/files/:fileId/pin
 * @desc    Pin/Unpin file
 * @access  Private (Leader/Moderator)
 */
router.patch(
  '/:fileId/pin',
  AuthMiddleware.authenticate as any,
  fileController.togglePinFile
);

export default router;