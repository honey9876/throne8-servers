/**
 * ====================================
 * FILE VALIDATORS
 * ====================================
 */

import Joi from 'joi';
import { FileType } from '../enums/FileType.enum';

/**
 * Validate file list query
 */
export const fileListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  fileType: Joi.string()
    .valid(...Object.values(FileType))
    .optional(),
  search: Joi.string().min(1).max(100).optional(),
  sortBy: Joi.string()
    .valid('createdAt', 'fileName', 'fileSize', 'downloadCount')
    .optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional(),
  pinnedOnly: Joi.boolean().optional(),
});

/**
 * Validate pin/unpin file
 */
export const pinFileSchema = Joi.object({
  fileId: Joi.string().required(),
});

export default {
  fileListQuerySchema,
  pinFileSchema,
};