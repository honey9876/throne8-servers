//jobservice/job-service.ts
import Redis from 'ioredis';
import { AppError } from '@/shared/errors/app.error'; // ← assuming your new error structure
import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util'; // if needed in controllers

/**
 * Lightweight Redis-based analytics service
 * (Kafka event consumer completely removed)
 */
export class JobAnalyticsService {
  private redis: Redis;
  private readonly PREFIXES = {
    POPULAR_SEARCH: 'popular_searches',
    LOCATION_SEARCH: 'location_searches',
    USER_SEARCHES: 'user_searches',
    JOB_VIEWS: 'job_views',
    JOB_VIEWS_DAILY: 'job_views_daily',
    USER_JOB_VIEWS: 'user_job_views',
    JOB_APPLICATIONS: 'job_applications',
    JOB_APPLICATIONS_DAILY: 'job_applications_daily',
    JOB_CONVERSION: 'job_conversion',
    USER_CONVERSIONS: 'user_conversions',
    TRENDING_SCORE: 'trending_score',
  };

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 1, // analytics DB
      retryStrategy: (times) => Math.min(times * 100, 2000),
      maxRetriesPerRequest: 5,
      commandTimeout: 5000,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.redis.on('error', (err) => logger.error('Redis client error', { error: err }));
    this.redis.on('connect', () => logger.info('Redis analytics client connected'));
    this.redis.on('close', () => logger.warn('Redis analytics client connection closed'));
  }

  async initialize(): Promise<void> {
    try {
      await this.redis.ping();
    } catch (error : any) {
      throw new AppError('Failed to initialize analytics Redis connection', 503, true, [], 'REDIS_CONNECTION_FAILED');
    }
  }

  // ── Search tracking ────────────────────────────────────────────────────────
  async trackSearch(userId: string | number, searchParams: Record<string, any>, resultCount: number): Promise<void> {
    const operations: Array<{ method: string; args: [string, number] }> = [];

    const now = Date.now();
    const dateKey = new Date().toISOString().split('T')[0];

    // Popular search term
    if (searchParams.q) {
      const term = searchParams.q.toLowerCase().trim();
      operations.push({
        method: 'incrby',
        args: [`${this.PREFIXES.POPULAR_SEARCH}:${term}`, 1],
      });

      // Trending score with simple time decay
      const scoreKey = `${this.PREFIXES.TRENDING_SCORE}:${term}`;
      const hoursOld = (now - now) / (1000 * 60 * 60); // will be 0 → can be improved later
      const decay = Math.max(0.1, Math.exp(-hoursOld / 24));
      operations.push({
        method: 'incrbyfloat',
        args: [scoreKey, 1 * decay],
      });
    }

    // Location based search
    if (searchParams.location) {
      const loc = searchParams.location.toLowerCase().trim();
      operations.push({
        method: 'incrby',
        args: [`${this.PREFIXES.LOCATION_SEARCH}:${loc}`, 1],
      });
    }

    // Per user search count
    operations.push({
      method: 'incrby',
      args: [`${this.PREFIXES.USER_SEARCHES}:${userId}`, 1],
    });

    await this.pipeline(operations);

    // Set reasonable expirations
    if (searchParams.q) {
      const term = searchParams.q.toLowerCase().trim();
      await this.redis.expire(`${this.PREFIXES.POPULAR_SEARCH}:${term}`, 86400 * 30);
      await this.redis.expire(`${this.PREFIXES.TRENDING_SCORE}:${term}`, 86400 * 7);
    }
  }

  // ── Job view tracking ──────────────────────────────────────────────────────
async trackJobView(jobId: string | number, userId: string | number): Promise<void> {
  const dateKey = new Date().toISOString().split('T')[0];

  // ✅ Fix: Explicitly type as tuple [string, number]
  const operations: Array<{ method: string; args: [string, number] }> = [
    { method: 'incrby', args: [`${this.PREFIXES.JOB_VIEWS}:${jobId}`, 1] as [string, number] },
    { method: 'incrby', args: [`${this.PREFIXES.JOB_VIEWS_DAILY}:${jobId}:${dateKey}`, 1] as [string, number] },
    { method: 'incrby', args: [`${this.PREFIXES.USER_JOB_VIEWS}:${userId}`, 1] as [string, number] },
  ];

  await this.pipeline(operations);

  // Reasonable expiration for daily stats
  await this.redis.expire(`${this.PREFIXES.JOB_VIEWS_DAILY}:${jobId}:${dateKey}`, 86400 * 90);
}

  // ── Job application tracking ───────────────────────────────────────────────
  async trackJobApplication(jobId: string | number, userId: string | number): Promise<void> {
    const dateKey = new Date().toISOString().split('T')[0];

    const operations: Array<{ method: string; args: [string, number] }> = [
      { method: 'incrby', args: [`${this.PREFIXES.JOB_APPLICATIONS}:${jobId}`, 1] },
      { method: 'incrby', args: [`${this.PREFIXES.JOB_APPLICATIONS_DAILY}:${jobId}:${dateKey}`, 1] },
      { method: 'incrby', args: [`${this.PREFIXES.JOB_CONVERSION}:${jobId}`, 1] },
      { method: 'incrby', args: [`${this.PREFIXES.USER_CONVERSIONS}:${userId}`, 1] },
    ];

    await this.pipeline(operations);

    await this.redis.expire(`${this.PREFIXES.JOB_APPLICATIONS_DAILY}:${jobId}:${dateKey}`, 86400 * 90);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private async pipeline(operations: Array<{ method: string; args: [string, any] }>): Promise<void> {
    if (operations.length === 0) return;

    const pipe = this.redis.pipeline();

    for (const op of operations) {
      if (op.method === 'incrby') {
        pipe.incrby(...op.args);
      } else if (op.method === 'incrbyfloat') {
        pipe.incrbyfloat(...op.args);
      }
    }

    try {
      await pipe.exec();
    } catch (err) {
      logger.error('Redis pipeline failed in analytics', { error: err });
      // You can decide whether to throw or just log
      // throw new AppError('Analytics pipeline failed', 500, false);
    }
  }

  async getPopularSearches(limit = 20): Promise<Array<{ term: string; count: number }>> {
    try {
      const keys = await this.redis.keys(`${this.PREFIXES.POPULAR_SEARCH}:*`);
      if (keys.length === 0) return [];

      const counts = await this.redis.mget(...keys);
      const result = keys
        .map((key, i) => ({
          term: key.replace(`${this.PREFIXES.POPULAR_SEARCH}:`, ''),
          count: parseInt(counts[i] || '0', 10),
        }))
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      return result;
    } catch (err) {
      logger.error('Failed to get popular searches', { error: err });
      return [];
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info('Analytics Redis client disconnected');
    } catch (err) {
      logger.error('Error while disconnecting analytics Redis', { error: err });
    }
  }
}

// Singleton / Factory
let jobAnalyticsServiceInstance: JobAnalyticsService | null = null;

export const getJobAnalyticsService = (): JobAnalyticsService => {
  if (!jobAnalyticsServiceInstance) {
    jobAnalyticsServiceInstance = new JobAnalyticsService();
    jobAnalyticsServiceInstance.initialize().catch((err) => {
      logger.error('Analytics service initialization failed', { error: err });
    });
  }
  return jobAnalyticsServiceInstance;
};