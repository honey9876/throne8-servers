/**
 * ====================================
 * FILE REPOSITORY
 * ====================================
 */

import { BaseRepository } from './base.repository';
import File from '../models/File.model';
import { IFile } from '../interfaces/IFile';
import { FileType } from '../enums/FileType.enum';
import mongoose from 'mongoose';
import { $ZodUnknownInternals } from 'zod/v4/core';

export class FileRepository extends BaseRepository<IFile> {
  constructor() {
    super(File);
  }

  // ADD: findByFileId — external UUID se fetch
  async findByFileId(fileId: string): Promise<IFile | null> {
    try {
      return await this.model.findOne({ fileId, isDeleted: false }).lean().exec();
    } catch (error: any) {
      throw new Error(`Error finding file by fileId: ${error}`);
    }
  }

  // ADD: findRawByFileId — save() ke liye
  async findRawByFileId(fileId: string): Promise<IFile | null> {
    try {
      return await this.model.findOne({ fileId, isDeleted: false }).exec();
    } catch (error: any) {
      throw new Error(`Error finding raw file: ${error}`);
    }
  }

  /**
   * Find files by group
   */
  // UPDATE: findByGroup — 'group' → 'groupId', pagination add karo
  async findByGroup(
    groupId: string,
    filter: any = {},
    sort: any = { createdAt: -1 },
    skip: number = 0,
    limit: number = 10
  ): Promise<IFile[]> {
    try {
      const result = await this.model
        .find({ groupId, isDeleted: false, ...filter })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('uploadedBy', 'name avatar')
        .lean()
        .exec();
      return result as unknown as IFile[];
    } catch (error: any) {
      throw new Error(`Error finding files by group: ${error}`);
    }
  }

  // ADD: countByGroup
  async countByGroup(groupId: string, filter: any = {}): Promise<number> {
    try {
      return await this.model.countDocuments({ groupId, isDeleted: false, ...filter }).exec();
    } catch (error: any) {
      throw new Error(`Error counting files: ${error}`);
    }
  }

  /**
   * Find files by type
   */

  // UPDATE: findByType — 'group' → 'groupId'
  async findByType(groupId: string, fileType: FileType): Promise<IFile[]> {
    try {
      const result = await this.model
        .find({ groupId, fileType, isDeleted: false })  // was: group
        .sort({ createdAt: -1 })
        .populate('uploadedBy', 'name avatar')
        .lean()
        .exec();
      return result as unknown as IFile[];
    } catch (error: any) {
      throw new Error(`Error finding files by type: ${error}`);
    }
  }

  /**
   * Find pinned files
   */

  async findPinnedFiles(groupId: string): Promise<IFile[]> {
    try {
      const result = await this.model
        .find({ groupId, isPinned: true, isDeleted: false })  // was: group
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('uploadedBy', 'name avatar')
        .lean()
        .exec();
      return result as unknown as IFile[];
    } catch (error: any) {
      throw new Error(`Error finding pinned files: ${error}`);
    }
  }

  // ADD: countPinnedFiles
  async countPinnedFiles(groupId: string): Promise<number> {
    try {
      return await this.model
        .countDocuments({ groupId, isPinned: true, isDeleted: false })
        .exec();
    } catch (error: any) {
      throw new Error(`Error counting pinned files: ${error}`);
    }
  }

  /**
   * Find files by uploader
   */
  async findByUploader(userId: string, limit: number = 50): Promise<IFile[]> {
    try {
      const result = await this.model
        .find({ uploadedBy: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('group', 'title')
        .exec();

      return result as IFile[];
    } catch (error: any) {
      throw new Error(`Error finding files by uploader: ${error}`);
    }
  }

  /**
   * Search files by name
   */
  async searchFiles(groupId: string, query: string): Promise<IFile[]> {
    try {
      const regex = new RegExp(query, 'i');
      const result = await this.model
        .find({
          group: groupId,
          fileName: regex,
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('uploadedBy', 'name email avatar')
        .exec();

      return result as IFile[];
    } catch (error: any) {
      throw new Error(`Error searching files: ${error}`);
    }
  }

  /**
   * Increment download count
   */
  async incrementDownloadByFileId(fileId: string): Promise<void> {
    try {
      await this.model
        .findOneAndUpdate({ fileId }, { $inc: { downloadCount: 1 } })
        .exec();
    } catch (error: any) {
      throw new Error(`Error incrementing download count: ${error}`);
    }
  }

  /**
   * Toggle pin status
   */
  // UPDATE: togglePin — fileId UUID se
  async togglePinByFileId(fileId: string): Promise<IFile | null> {
    try {
      const file = await this.model.findOne({ fileId, isDeleted: false }).exec();
      if (!file) return null;
      file.isPinned = !file.isPinned;
      return await file.save();
    } catch (error: any) {
      throw new Error(`Error toggling pin: ${error}`);
    }
  }

  /**
   * Get total file size for group
   */
  async getTotalGroupFileSize(groupId: string): Promise<number> {
    try {
      const result = await this.model.aggregate([
        { $match: { groupId, isDeleted: false } },  // was: new Types.ObjectId, group field
        { $group: { _id: null, totalSize: { $sum: '$fileSize' } } },
      ]);
      return result[0]?.totalSize || 0;
    } catch (error: any) {
      throw new Error(`Error getting total file size: ${error}`);
    }
  }

  /**
   * Get file statistics for group
   */
  async getGroupFileStats(groupId: string): Promise<any> {
    try {
      const stats = await this.model.aggregate([
        { $match: { groupId, isDeleted: false } },  // was: new Types.ObjectId, group field
        {
          $group: {
            _id: null,
            totalFiles: { $sum: 1 },
            totalSize: { $sum: '$fileSize' },
            totalDownloads: { $sum: '$downloadCount' },
            pdfCount: { $sum: { $cond: [{ $eq: ['$fileType', FileType.PDF] }, 1, 0] } },
            docCount: { $sum: { $cond: [{ $eq: ['$fileType', FileType.DOC] }, 1, 0] } },
            imageCount: { $sum: { $cond: [{ $eq: ['$fileType', FileType.IMAGE] }, 1, 0] } },
            pinnedCount: { $sum: { $cond: [{ $eq: ['$isPinned', true] }, 1, 0] } },
          },
        },
      ]);
      return stats[0] || {};
    } catch (error: any) {
      throw new Error(`Error getting file stats: ${error}`);
    }
  }

  // UPDATE: softDelete — new method
  async softDeleteByFileId(fileId: string, deletedBy: string): Promise<boolean> {
    try {
      const file = await this.model.findOne({ fileId, isDeleted: false }).exec();
      if (!file) return false;
      file.isDeleted = true;
      file.deletedAt = new Date();
      (file as any).deletedBy = deletedBy;
      await file.save();
      return true;
    } catch (error: any) {
      throw new Error(`Error soft deleting file: ${error}`);
    }
  }

  /**
   * Delete files by group (cleanup)
   */
  async deleteGroupFiles(groupId: string): Promise<number> {
    try {
      const result = await this.model.deleteMany({ groupId }).exec();
      return result.deletedCount;
    } catch (error: any) {
      throw new Error(`Error deleting group files: ${error}`);
    }
  }
}

export default new FileRepository();