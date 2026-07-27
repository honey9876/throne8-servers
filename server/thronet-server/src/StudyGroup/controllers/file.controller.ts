/**
 * ====================================
 * FILE CONTROLLER
 * ====================================
 */

import { Request, Response } from 'express';
import { asyncHandler } from '@/shared/utils/helpers.util';
import ResponseUtil from '@/shared/response.util';
import * as fileService from '../services/file.service';
import { FileListQuery } from '../types/file.types';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';

/**
 * Upload file
 * POST /api/files/:groupId/upload
 */
export const uploadFile = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const userId = (req as AuthRequest).user?.id;
  const file = req.file!;

  // Validate groupId exists
  if (!groupId) {
    throw new Error('Group ID is required');
  }

  const uploadedFile = await fileService.uploadFile(groupId, userId!, file);

  return ResponseUtil.success(res, uploadedFile, 'File uploaded successfully', 201);
});

/**
 * Get group files
 * GET /api/files/:groupId/all
 */
export const getGroupFiles = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const query: FileListQuery = req.query;

  // Validate groupId exists
  if (!groupId) {
    throw new Error('Group ID is required');
  }

  const result = await fileService.getGroupFiles(groupId, query);

  return ResponseUtil.success(res, result, 'Files retrieved successfully');
});

/**
 * Get file by ID
 * GET /api/files/:fileId
 */
export const getFileById = asyncHandler(async (req: Request, res: Response) => {
  const { fileId } = req.params;

  // Validate fileId exists
  if (!fileId) {
    throw new Error('File ID is required');
  }

  const file = await fileService.getFileById(fileId);

  return ResponseUtil.success(res, file, 'File retrieved successfully');
});

/**
 * Download file
 * GET /api/files/:fileId/download
 */
export const downloadFile = asyncHandler(async (req: Request, res: Response) => {
  const { fileId } = req.params;

  // Validate fileId exists
  if (!fileId) {
    throw new Error('File ID is required');
  }

  const file = await fileService.getFileById(fileId);
  
  // Increment download count
  await fileService.incrementDownloadCount(fileId);

  // Redirect to Cloudinary URL
  res.redirect(file.fileUrl);
});

/**
 * Delete file
 * DELETE /api/files/:fileId
 */
export const deleteFile = asyncHandler(async (req: Request, res: Response) => {
  const { fileId } = req.params;
  const userId = (req as AuthRequest).user?.id;

  // Validate fileId exists
  if (!fileId) {
    throw new Error('File ID is required');
  }

  await fileService.deleteFile(fileId, userId!);

  return ResponseUtil.success(res, null, 'File deleted successfully');
});

/**
 * Pin/Unpin file
 * PATCH /api/files/:fileId/pin
 */
export const togglePinFile = asyncHandler(async (req: Request, res: Response) => {
  const { fileId } = req.params;
  const userId = (req as AuthRequest).user?.id;

  // Validate fileId exists
  if (!fileId) {
    throw new Error('File ID is required');
  }

  const result = await fileService.togglePinFile(fileId, userId!);

  return ResponseUtil.success(
    res,
    result,
    result.isPinned ? 'File pinned successfully' : 'File unpinned successfully'
  );
});

/**
 * Get pinned files
 * GET /api/files/:groupId/pinned
 */
export const getPinnedFiles = asyncHandler(async (req: Request, res: Response) => {
  const { groupId } = req.params;

  // Validate groupId exists
  if (!groupId) {
    throw new Error('Group ID is required');
  }

  const result = await fileService.getGroupFiles(groupId, { pinnedOnly: true });

  return ResponseUtil.success(res, result, 'Pinned files retrieved successfully');
});

export default {
  uploadFile,
  getGroupFiles,
  getFileById,
  downloadFile,
  deleteFile,
  togglePinFile,
  getPinnedFiles,
};