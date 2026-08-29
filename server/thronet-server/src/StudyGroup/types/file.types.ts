/**
 * ====================================
 * FILE TYPES
 * ====================================
 */

import { FileType } from '../enums/FileType.enum';

/**
 * Upload File Data
 */
export interface UploadFileData {
  groupId: string;
  file: Express.Multer.File;
}

/**
 * File Response
 */
export interface FileResponse {
  _id: string;
  groupId: string;
  uploadedBy: {
    _id: string;
    name: string;
    avatar?: string;
  };
  fileName: string;
  originalName: string;
  fileType: FileType;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  isPinned: boolean;
  downloadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * File List Query
 */
export interface FileListQuery {
  page?: number;
  limit?: number;
  fileType?: FileType;
  search?: string;
  sortBy?: 'createdAt' | 'fileName' | 'fileSize' | 'downloadCount';
  sortOrder?: 'asc' | 'desc';
  pinnedOnly?: boolean;
}

/**
 * Cloudinary Upload Response
 */
export interface CloudinaryUploadResponse {
  public_id: string;
  secure_url: string;
  resource_type: string;
  format: string;
  bytes: number;
}