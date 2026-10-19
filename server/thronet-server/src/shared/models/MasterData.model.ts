/**
 * MasterData.model.ts
 * Master / Reference Data Model for Skills, Industries, Degrees, Categories, Tags
 * Item M: Master / Reference Data Architecture
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { LoggerUtil } from '@/shared/logger.util';

export type MasterDataType = 'skills' | 'industries' | 'degrees' | 'categories' | 'tags';

export const MASTER_DATA_TYPES: MasterDataType[] = [
  'skills',
  'industries',
  'degrees',
  'categories',
  'tags',
];

export interface IMasterDataDoc extends Document {
  type: MasterDataType;
  code: string;
  name: string;
  category?: string;
  description?: string;
  isActive: boolean;
  order: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const masterDataSchema = new Schema<IMasterDataDoc>(
  {
    type: {
      type: String,
      required: true,
      enum: MASTER_DATA_TYPES,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'master_data',
  }
);

// Compound unique index on type + code
masterDataSchema.index({ type: 1, code: 1 }, { unique: true });
masterDataSchema.index({ type: 1, isActive: 1, order: 1 });

// Automatic cache invalidation hooks
masterDataSchema.post('save', async function (doc) {
  if (doc?.type) {
    try {
      const { MasterDataCacheRepository } = await import('@/shared/cache/masterCache');
      await MasterDataCacheRepository.invalidateMasterData(doc.type);
    } catch (err: any) {
      LoggerUtil.warn('MasterData post-save cache invalidation failed', { error: err.message, type: doc.type });
    }
  }
});

masterDataSchema.post(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as any,
  async function (this: any, res: any) {
    try {
      const filter = this.getFilter ? this.getFilter() : {};
      const type = filter.type || (res && res.type);
      const { MasterDataCacheRepository } = await import('@/shared/cache/masterCache');
      if (type) {
        await MasterDataCacheRepository.invalidateMasterData(type);
      } else {
        await MasterDataCacheRepository.invalidateAll();
      }
    } catch (err: any) {
      LoggerUtil.warn('MasterData mutation cache invalidation failed', { error: err.message });
    }
  }
);

masterDataSchema.post('insertMany', async function (docs: any) {
  try {
    const { MasterDataCacheRepository } = await import('@/shared/cache/masterCache');
    if (Array.isArray(docs)) {
      const types = new Set(docs.map((d: any) => d.type).filter(Boolean));
      for (const t of types) {
        await MasterDataCacheRepository.invalidateMasterData(t as any);
      }
    } else {
      await MasterDataCacheRepository.invalidateAll();
    }
  } catch (err: any) {
    LoggerUtil.warn('MasterData insertMany cache invalidation failed', { error: err.message });
  }
});

masterDataSchema.post('bulkWrite' as any, async function () {
  try {
    const { MasterDataCacheRepository } = await import('@/shared/cache/masterCache');
    await MasterDataCacheRepository.invalidateAll();
  } catch (err: any) {
    LoggerUtil.warn('MasterData bulkWrite cache invalidation failed', { error: err.message });
  }
});

const MasterData = mongoose.model<IMasterDataDoc>('MasterData', masterDataSchema);

export default MasterData;
