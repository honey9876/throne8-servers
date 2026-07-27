// src/services/stats-flush.service.ts
import CacheUtil from '@/shared/cache.util.js';
import { Job } from '../models';
// Add other models jahan stats hain
import logger from '@/shared/logger.util';

export class StatsFlushService {
  /**
   * Flush all job stats from Redis → MongoDB
   * Pattern: job:stats:*:views / applications etc.
   */
  static async flushJobStats(): Promise<void> {
    try {
      const pattern = 'job:stats:*:*'; // views, applications etc.
      const keys = await CacheUtil.get(pattern);

      if (keys.length === 0) {
        logger.info('No job stats keys found to flush');
        return;
      }

      const bulkOps: any[] = [];

      for (const key of keys) {
        const parts = key.split(':');
        const jobId = parts[2];
        const field = parts[3]; // views, applications etc.

        const count = await CacheUtil.get(key);
        if (!count || isNaN(Number(count))) continue;

        bulkOps.push({
          updateOne: {
            filter: { jobId },
            update: { $inc: { [`stats.${field}`]: Number(count) } },
            upsert: true
          }
        });

        // Delete after successful queue (transactional safety)
        await CacheUtil.del(key);
      }

      if (bulkOps.length > 0) {
        await Job.bulkWrite(bulkOps, { ordered: false });
        logger.info(`Flushed ${bulkOps.length} job stats updates`);
      }
    } catch (error : any) {
      logger.error('Job stats flush failed', { error });
      // Optional: alert system (Sentry, Slack etc.)
    }
  }

  // Company ke liye similar method bana sakta hai
  // static async flushCompanyStats() { ... }

  /**
   * Call this from cron job
   */
  static async flushAll(): Promise<void> {
    await Promise.allSettled([
      this.flushJobStats(),
      // Add flushCompanyStats(), flushApplicationStats() etc.
    ]);
  }
}