/**
 * ====================================
 * FILE MODEL (PRODUCTION READY)
 * ====================================
 */

import mongoose, { Schema } from 'mongoose';
import { IFile } from '../interfaces/IFile';
import { FileType } from '../enums/FileType.enum';
import { validId } from '@/shared/security';

const fileSchema = new Schema<IFile>(
  {
    // ADD: fileId UUID — external identifier ke liye
fileId: {
  type: String,
  required: true,
  unique: true,
  validate: (v: any) => validId(v),
},
    groupId: {
      type: String,
      ref: 'StudyGroup_Group',
      required: [true, 'Group ID is required'],
      validate: (v: any) => validId(v),
      // ✅ REMOVED: 
    },
    uploadedBy: {
      type: String,
      ref: 'User',
      required: [true, 'Uploader is required'],
      validate: (v: any) => validId(v),
      // ✅ REMOVED: 
    },
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true,
    },
    originalName: {
      type: String,
      required: [true, 'Original file name is required'],
      trim: true,
    },
    fileType: {
      type: String,
      enum: Object.values(FileType),
      required: [true, 'File type is required'],
      // ✅ REMOVED: 
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
    },
    fileSize: {
      type: Number,
      required: [true, 'File size is required'],
    },
    fileUrl: {
      type: String,
      required: [true, 'File URL is required'],
    },
    cloudinaryPublicId: {
      type: String,
      required: [true, 'Cloudinary public ID is required'],
    },
    isPinned: {
      type: Boolean,
      default: false,
      // ✅ REMOVED: 
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      // ✅ REMOVED: 
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: String,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    // ADD: toJSON transform
toJSON: {
  virtuals: true,
  transform: function(_doc, ret) {
    ret.id = ret.fileId;
    delete (ret as any)._id;
    delete (ret as any).__v;
    return ret;
  }},
    toObject: { virtuals: true },
  }
);

/**
 * ============================================
 * INDEXES (Optimized for file queries)
 * ============================================
 */
// ✅ Primary indexes
fileSchema.index({ groupId: 1, createdAt: -1 }); // Recent files
fileSchema.index({ uploadedBy: 1 });
fileSchema.index({ fileType: 1 });

// ✅ Query optimization indexes
fileSchema.index({ isPinned: 1 });
fileSchema.index({ isDeleted: 1 });

// ✅ Compound indexes
fileSchema.index({ groupId: 1, isPinned: 1 }); // Pinned files
fileSchema.index({ groupId: 1, fileType: 1 }); // Filter by type
fileSchema.index({ groupId: 1, isDeleted: 1, createdAt: -1 }); // Active files

/**
 * Virtual: File size in MB
 */
fileSchema.virtual('fileSizeMB').get(function () {
  return (this.fileSize / (1024 * 1024)).toFixed(2);
});

const File = mongoose.model<IFile>('StudyGroup_File', fileSchema);

export default File;