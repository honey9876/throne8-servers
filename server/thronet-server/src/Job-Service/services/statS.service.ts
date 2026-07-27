// src/services/stats.service.ts
import { Job } from '../models';
import { Company } from '@/company/models';
import CacheUtil from '@/shared/cache.util';
import logger from '@/shared/logger.util';

export class StatsService {
  static async increment(
    type: 'job' | 'company',
    id: string,
    field: string,
    incrementBy = 1
  ): Promise<boolean> {
    const key = `${type}:stats:${id}:${field}`;

    try {
      await CacheUtil.incr(key, incrementBy);
      await CacheUtil.expire(key, 30 * 24 * 60 * 60); // 30 days
      return true;
    } catch (err) {
      logger.error('Redis stats increment failed', { key, err });

      // Fallback: direct DB
      try {
        if (type === 'job') {
          await Job.updateOne({ jobId: id }, { $inc: { [`stats.${field}`]: incrementBy } });
        } else if (type === 'company') {
          await Company.updateOne({ companyId: id }, { $inc: { [`stats.${field}`]: incrementBy } });
        }
        return true;
      } catch (dbErr) {
        logger.error('DB fallback failed', { id, field, dbErr });
        return false;
      }
    }
  }
}