/**
 * ====================================
 * FILE INTERFACE
 * ====================================
 */

import { Document, Types } from 'mongoose';
import { FileType } from '../enums/FileType.enum';

export interface IFile extends Document {
  _id: Types.ObjectId;
  fileId: string;        // ADD — UUID external identifier
  groupId: string;       // was: Types.ObjectId
  uploadedBy: string;    // was: Types.ObjectId
  fileName: string;
  originalName: string;
  fileType: FileType;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  cloudinaryPublicId: string;
  isPinned: boolean;
  downloadCount: number;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export default IFile;