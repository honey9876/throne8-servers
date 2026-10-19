/**
 * masterCache.ts
 * Item M: Master / Reference Data Cache Layer
 * Caches skills, industries, degrees, categories, and tags with a 24h TTL.
 * Invalidates on admin edits. Supports non-blocking startup warm-up.
 */

import { buildKey, applyJitter, isCacheEnabled, CacheHelper } from './cacheHelper';
import MasterData, { MasterDataType, MASTER_DATA_TYPES, IMasterDataDoc } from '@/shared/models/MasterData.model';
import { LoggerUtil } from '@/shared/logger.util';

const MASTER_DOMAIN = 'master';
const MASTER_DATA_TTL_SECONDS = parseInt(process.env['MASTER_DATA_CACHE_TTL_SECONDS'] || '86400', 10); // 24 hours

// Default fallback seed data from constants if DB collection is initially empty
const DEFAULT_SEEDS: Record<MasterDataType, Array<{ code: string; name: string; category?: string }>> = {
  skills: [
    { code: 'javascript', name: 'JavaScript', category: 'Programming' },
    { code: 'typescript', name: 'TypeScript', category: 'Programming' },
    { code: 'react', name: 'React', category: 'Frontend' },
    { code: 'nodejs', name: 'Node.js', category: 'Backend' },
    { code: 'python', name: 'Python', category: 'Programming' },
    { code: 'mongodb', name: 'MongoDB', category: 'Database' },
    { code: 'redis', name: 'Redis', category: 'Database' },
  ],
  industries: [
    { code: 'technology', name: 'Technology' },
    { code: 'healthcare', name: 'Healthcare' },
    { code: 'finance', name: 'Finance' },
    { code: 'education', name: 'Education' },
    { code: 'manufacturing', name: 'Manufacturing' },
    { code: 'retail', name: 'Retail' },
  ],
  degrees: [
    { code: 'high_school', name: 'High School' },
    { code: 'diploma', name: 'Diploma' },
    { code: 'bachelors', name: "Bachelor's" },
    { code: 'masters', name: "Master's" },
    { code: 'doctorate', name: 'Doctorate' },
    { code: 'certificate', name: 'Certificate' },
  ],
  categories: [
    { code: 'engineering', name: 'Engineering' },
    { code: 'product', name: 'Product Management' },
    { code: 'design', name: 'Design' },
    { code: 'data_science', name: 'Data Science' },
    { code: 'marketing', name: 'Marketing' },
  ],
  tags: [
    { code: 'algorithms', name: 'Algorithms' },
    { code: 'system_design', name: 'System Design' },
    { code: 'career', name: 'Career' },
    { code: 'interviews', name: 'Interviews' },
    { code: 'architecture', name: 'Architecture' },
  ],
};

export class MasterDataCacheRepository {
  static getKey(type: MasterDataType): string {
    return buildKey(MASTER_DOMAIN, type);
  }

  static async getCachedMasterData(type: MasterDataType): Promise<any[] | null> {
    if (!isCacheEnabled(MASTER_DOMAIN) || !type) return null;
    const key = this.getKey(type);
    return CacheHelper.get<any[]>(key, MASTER_DOMAIN);
  }

  static async setCachedMasterData(type: MasterDataType, data: any[]): Promise<void> {
    if (!isCacheEnabled(MASTER_DOMAIN) || !type || !data) return;
    const key = this.getKey(type);
    await CacheHelper.set(key, data, {
      ttlSeconds: MASTER_DATA_TTL_SECONDS,
      domain: MASTER_DOMAIN,
    });
  }

  static async invalidateMasterData(type: MasterDataType): Promise<void> {
    if (!type) return;
    try {
      const key = this.getKey(type);
      await CacheHelper.del(key, MASTER_DOMAIN);
      LoggerUtil.info(`MasterCache: invalidated cache for type "${type}"`);
    } catch (err: any) {
      LoggerUtil.warn('MasterCache: failed to invalidate master cache', { type, error: err.message });
    }
  }

  static async invalidateAll(): Promise<void> {
    try {
      const keys = MASTER_DATA_TYPES.map((t) => this.getKey(t));
      await CacheHelper.del(keys, MASTER_DOMAIN);
      LoggerUtil.info('MasterCache: invalidated all master data caches');
    } catch (err: any) {
      LoggerUtil.warn('MasterCache: failed to invalidate all master caches', { error: err.message });
    }
  }

  /**
   * Warm up master data cache on startup without blocking the server boot sequence.
   */
  static async warmUp(): Promise<void> {
    try {
      LoggerUtil.info('MasterCache: warming up master reference data in background...');
      await Promise.allSettled(
        MASTER_DATA_TYPES.map(async (type) => {
          await MasterDataService.getMasterData(type);
        })
      );
      LoggerUtil.info('MasterCache: warm-up complete for all reference domains');
    } catch (err: any) {
      LoggerUtil.warn('MasterCache: background warm-up encountered an error (non-fatal)', { error: err.message });
    }
  }
}

export class MasterDataService {
  /**
   * Fetch master data for a specific domain.
   * Checks Redis 24h cache first; on miss, loads from MongoDB (or seeds defaults) and populates cache.
   */
  static async getMasterData(type: MasterDataType): Promise<any[]> {
    // 1. Read from Redis Cache
    const cached = await MasterDataCacheRepository.getCachedMasterData(type);
    if (cached) {
      return cached;
    }

    // 2. Fallback to MongoDB
    let docs = await MasterData.find({ type, isActive: true })
      .sort({ order: 1, name: 1 })
      .lean();

    // 3. Seed defaults if empty
    if (!docs || docs.length === 0) {
      const seeds = DEFAULT_SEEDS[type] || [];
      if (seeds.length > 0) {
        try {
          await MasterData.insertMany(
            seeds.map((s, idx) => ({
              type,
              code: s.code,
              name: s.name,
              category: s.category,
              isActive: true,
              order: idx,
            })),
            { ordered: false }
          );
          docs = await MasterData.find({ type, isActive: true })
            .sort({ order: 1, name: 1 })
            .lean();
        } catch {
          // If already inserted concurrently, re-read
          docs = await MasterData.find({ type, isActive: true })
            .sort({ order: 1, name: 1 })
            .lean();
        }
      }
    }

    const payload = docs.map((d: any) => ({
      code: d.code,
      name: d.name,
      category: d.category,
      order: d.order,
      description: d.description,
      isActive: d.isActive,
    }));

    // 4. Populate 24h Cache
    await MasterDataCacheRepository.setCachedMasterData(type, payload);

    return payload;
  }

  /**
   * Admin write: Create a new master data entry.
   * Immediately invalidates Redis cache so change is visible right away.
   */
  static async createItem(data: {
    type: MasterDataType;
    code: string;
    name: string;
    category?: string;
    description?: string;
    order?: number;
  }): Promise<IMasterDataDoc> {
    const doc = await MasterData.create({
      ...data,
      code: data.code.toLowerCase().trim(),
      isActive: true,
    });

    await MasterDataCacheRepository.invalidateMasterData(data.type);
    return doc;
  }

  /**
   * Admin write: Update an existing master data entry.
   * Immediately invalidates Redis cache so change is visible right away.
   */
  static async updateItem(
    type: MasterDataType,
    code: string,
    updates: Partial<{ name: string; category?: string; description?: string; order?: number; isActive?: boolean }>
  ): Promise<IMasterDataDoc | null> {
    const doc = await MasterData.findOneAndUpdate(
      { type, code: code.toLowerCase().trim() },
      { $set: updates },
      { new: true }
    );

    await MasterDataCacheRepository.invalidateMasterData(type);
    return doc;
  }

  /**
   * Admin write: Delete or deactivate an existing master data entry.
   * Immediately invalidates Redis cache so change is visible right away.
   */
  static async deleteItem(type: MasterDataType, code: string): Promise<boolean> {
    const res = await MasterData.deleteOne({ type, code: code.toLowerCase().trim() });
    await MasterDataCacheRepository.invalidateMasterData(type);
    return res.deletedCount > 0;
  }
}
