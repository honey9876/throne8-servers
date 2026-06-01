/**
 * ====================================
 * FILE SERVICE
 * ====================================
 */

import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import fileRepository from '../repositories/file.repository';
import groupRepository from '../repositories/group.repository';
import groupMemberRepository from '../repositories/groupMember.repository';
import { NotFoundError, BadRequestError, ForbiddenError } from '@/shared/errors/app.error';
import { getFileType } from '../utils/fileHelper';
import { GROUP_CONSTANTS } from '../utils/constants';
import { FileResponse, FileListQuery, CloudinaryUploadResponse } from '../types/file.types';
import { LoggerUtil } from '@/shared/logger.util';

/**
 * Upload file to Cloudinary
 */
export const uploadToCloudinary = async (
  file: Express.Multer.File,
  folder: string = 'study-group-uploads'
): Promise<CloudinaryUploadResponse> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          LoggerUtil.error('❌ Cloudinary upload error:', error);
          reject(error);
        } else {
          resolve(result as CloudinaryUploadResponse);
        }
      }
    );

    uploadStream.end(file.buffer);
  });
};

/**
 * Upload file
 */
export const uploadFile = async (
  groupId: string,
  userId: string,
  file: Express.Multer.File
): Promise<FileResponse> => {
  // Verify group exists
  const group = await groupRepository.findByGroupId(groupId);
  if (!group) {
    throw new NotFoundError('Group not found');
  }

  // Verify user is a member
  const membership = await groupMemberRepository.findActiveOne(groupId, userId);
  if (!membership) {
    throw new ForbiddenError('You are not a member of this group');
  }

  // Upload to Cloudinary
  const uploadResult = await uploadToCloudinary(file, `groups/${groupId}`);

  // Determine file type
  const fileType = getFileType(file.mimetype);

  // Create file record
  const fileRecord = await fileRepository.create({
    groupId,
    uploadedBy: userId,
    fileName: file.originalname,
    originalName: file.originalname,
    fileType,
    mimeType: file.mimetype,
    fileSize: file.size,
    fileUrl: uploadResult.secure_url,
    cloudinaryPublicId: uploadResult.public_id,
  });

  // Populate uploader details
  const populated = await fileRepository.findByFileId(fileRecord.fileId);

  LoggerUtil.info(`✅ File uploaded: ${fileRecord._id} by user ${userId}`);

  return {
    _id: fileRecord._id.toString(),
    groupId: fileRecord.groupId.toString(),
    uploadedBy: {
      _id: (fileRecord.uploadedBy as any)._id.toString(),
      name: (fileRecord.uploadedBy as any).name,
      avatar: (fileRecord.uploadedBy as any).avatar,
    },
    fileName: fileRecord.fileName,
    originalName: fileRecord.originalName,
    fileType: fileRecord.fileType,
    mimeType: fileRecord.mimeType,
    fileSize: fileRecord.fileSize,
    fileUrl: fileRecord.fileUrl,
    isPinned: fileRecord.isPinned,
    downloadCount: fileRecord.downloadCount,
    createdAt: fileRecord.createdAt,
    updatedAt: fileRecord.updatedAt,
  };
};

/**
 * Get group files
 */
export const getGroupFiles = async (
  groupId: string,
  query: FileListQuery
): Promise<{
  files: FileResponse[];
  total: number;
  page: number;
  pages: number;
}> => {
  const {
    page = 1,
    limit = 10,
    fileType,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    pinnedOnly = false,
  } = query;

  // // Build filter
  // const filter: any = {
  //   groupId,
  //   isDeleted: false,
  // };

  // if (fileType) {
  //   filter.fileType = fileType;
  // }

  // if (search) {
  //   filter.$or = [
  //     { fileName: { $regex: search, $options: 'i' } },
  //     { originalName: { $regex: search, $options: 'i' } },
  //   ];
  // }

  // if (pinnedOnly) {
  //   filter.isPinned = true;
  // }

  // // Build sort
  // const sort: any = {};
  // sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  // // Execute query
  const skip = (page - 1) * limit;
  // const { fileType, search, sortBy = 'createdAt', sortOrder = 'desc', pinnedOnly = false } = query;

  const repoFilter: any = {};
  if (fileType) repoFilter.fileType = fileType;
  if (search) repoFilter.$or = [
    { fileName: { $regex: search, $options: 'i' } },
    { originalName: { $regex: search, $options: 'i' } },
  ];
  if (pinnedOnly) repoFilter.isPinned = true;

  const sort: any = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  const [files, total] = await Promise.all([
    fileRepository.findByGroup(groupId, repoFilter, sort, skip, limit),
    fileRepository.countByGroup(groupId, repoFilter),
  ]);

  const fileResponses: FileResponse[] = files.map((file: any) => ({
    _id: file._id.toString(),
    groupId: file.groupId.toString(),
    uploadedBy: {
      _id: file.uploadedBy._id.toString(),
      name: file.uploadedBy.name,
      avatar: file.uploadedBy.avatar,
    },
    fileName: file.fileName,
    originalName: file.originalName,
    fileType: file.fileType,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    fileUrl: file.fileUrl,
    isPinned: file.isPinned,
    downloadCount: file.downloadCount,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  }));

  return {
    files: fileResponses,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
};

/**
 * Get file by ID
 */
export const getFileById = async (fileId: string): Promise<FileResponse> => {
  const file = await fileRepository.findByFileId(fileId);  // already filters isDeleted: false
  if (!file) throw new NotFoundError('File not found');

  return {
    _id: file._id.toString(),
    groupId: file.groupId.toString(),
    uploadedBy: {
      _id: (file.uploadedBy as any)._id.toString(),
      name: (file.uploadedBy as any).name,
      avatar: (file.uploadedBy as any).avatar,
    },
    fileName: file.fileName,
    originalName: file.originalName,
    fileType: file.fileType,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    fileUrl: file.fileUrl,
    isPinned: file.isPinned,
    downloadCount: file.downloadCount,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
};

/**
 * Delete file
 */
export const deleteFile = async (
  fileId: string,
  userId: string
): Promise<void> => {
  const file = await fileRepository.findByFileId(fileId);

  if (!file || file.isDeleted) {
    throw new NotFoundError('File not found');
  }

  // Check if user is uploader or group leader
  const isUploader = file.uploadedBy === userId;
  const membership = await groupMemberRepository.findOne(file.groupId, userId);
  const isLeader = membership?.role === 'leader';

  if (!isUploader && !isLeader) {
    throw new ForbiddenError('You can only delete your own files or you must be group leader');
  }

  // Delete from Cloudinary
  try {
    await cloudinary.uploader.destroy(file.cloudinaryPublicId);
    LoggerUtil.info(`✅ File deleted from Cloudinary: ${file.cloudinaryPublicId}`);
  } catch (error: any) {
    LoggerUtil.error('❌ Error deleting from Cloudinary:', error);
  }

  // Soft delete
  await fileRepository.softDeleteByFileId(fileId, userId);

  LoggerUtil.info(`✅ File deleted: ${fileId}`);
};

/**
 * Pin/Unpin file
 */
export const togglePinFile = async (
  fileId: string,
  userId: string
): Promise<{ isPinned: boolean }> => {
  const file = await fileRepository.findByFileId(fileId);

  if (!file || file.isDeleted) {
    throw new NotFoundError('File not found');
  }

  // Check if user is group leader or moderator
  const membership = await groupMemberRepository.findOne(file.groupId, userId);
  if (!membership || !['leader', 'admin'].includes(membership.role)) {
    throw new ForbiddenError('Only leaders and admins can pin files');
  }


  // Check pinned files limit
  if (!file.isPinned) {
    const pinnedCount = await fileRepository.countPinnedFiles(file.groupId);
    if (pinnedCount >= GROUP_CONSTANTS.MAX_PINNED_FILES) {
      throw new BadRequestError(`Maximum ${GROUP_CONSTANTS.MAX_PINNED_FILES} files can be pinned`);
    }
  }

  LoggerUtil.info(`✅ File pin status updated: ${fileId} -> ${file.isPinned}`);

  const updated = await fileRepository.togglePinByFileId(fileId);
  return { isPinned: updated!.isPinned };
};

/**
 * Increment download count
 */
export const incrementDownloadCount = async (fileId: string): Promise<void> => {
  await fileRepository.incrementDownloadByFileId(fileId);
};

export default {
  uploadFile,
  getGroupFiles,
  getFileById,
  deleteFile,
  togglePinFile,
  incrementDownloadCount,
};