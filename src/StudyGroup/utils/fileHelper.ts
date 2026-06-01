/**
 * ====================================
 * FILE HELPER UTILITIES
 * ====================================
 */

import path from 'path';
import { FileType } from '../enums/FileType.enum';
import { FILE_UPLOAD_CONSTANTS } from './constants';

/**
 * Get file type from MIME type
 */
export const getFileType = (mimeType: string): FileType => {
  if (mimeType.startsWith('image/')) {
    return FileType.IMAGE;
  }
  if (mimeType.startsWith('video/')) {
    return FileType.VIDEO;
  }
  if (mimeType.startsWith('audio/')) {
    return FileType.AUDIO;
  }
  if (mimeType === 'application/pdf') {
    return FileType.PDF;
  }
  if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return mimeType.includes('openxmlformats') ? FileType.DOCX : FileType.DOC;
  }
  if (
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return mimeType.includes('openxmlformats') ? FileType.PPTX : FileType.PPT;
  }
  if (
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return mimeType.includes('openxmlformats') ? FileType.XLSX : FileType.XLS;
  }

  return FileType.OTHER;
};

/**
 * Validate file type
 */
export const isValidFileType = (mimeType: string): boolean => {
  return FILE_UPLOAD_CONSTANTS.ALLOWED_ALL_TYPES.includes(mimeType);
};

/**
 * Validate file size
 */
export const isValidFileSize = (size: number): boolean => {
  return size <= FILE_UPLOAD_CONSTANTS.MAX_FILE_SIZE;
};

/**
 * Format file size
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * Generate unique file name
 */
export const generateUniqueFileName = (originalName: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = path.extname(originalName);
  const name = path.basename(originalName, ext).replace(/[^a-zA-Z0-9]/g, '-');
  return `${name}-${timestamp}-${random}${ext}`;
};

/**
 * Get file extension
 */
export const getFileExtension = (fileName: string): string => {
  return path.extname(fileName).toLowerCase();
};

/**
 * Sanitize file name
 */
export const sanitizeFileName = (fileName: string): string => {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/--+/g, '-')
    .toLowerCase();
};

export default {
  getFileType,
  isValidFileType,
  isValidFileSize,
  formatFileSize,
  generateUniqueFileName,
  getFileExtension,
  sanitizeFileName,
};