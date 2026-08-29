// src/middleware/cache.middleware.ts
import { Request, Response, NextFunction } from 'express';
import redisManager from '@/config/cache/redis.config';

interface CacheOptions {
  ttl: number; // Time to live in seconds
  prefix?: string;
  varyBy?: string[];
  skipCache?: (req: Request) => boolean;
}

export const cacheMiddleware = (options: CacheOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip cache if specified condition is met
      if (options.skipCache && options.skipCache(req)) {
        return next();
      }

      // Generate cache key
      const keyParts = [options.prefix || 'cache'];

      if (options.varyBy) {
        options.varyBy.forEach(key => {
          if (key === 'userId' && req.user?.id) {
            keyParts.push(`user:${req.user.id}`);
          } else if (req.query[key]) {
            keyParts.push(`${key}:${req.query[key]}`);
          }
        });
      }

      const cacheKey = keyParts.join(':');

      // ✅ FIXED — use the shared, properly-authenticated Redis client
      // (was: a raw `new Redis({ host, port })` with NO password, which
      // caused NOAUTH errors on every request through this middleware)
      const redis = await redisManager.getRedisClient();

      // Try to get cached data
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cachedData));
      }

      // Store original json method
      const originalJson = res.json;

      // Override json method to cache response
      res.json = function (data: any) {
        // Cache the response (fire-and-forget — don't block the response
        // on a cache write; log if it fails)
        redis.setex(cacheKey, options.ttl, JSON.stringify(data)).catch((err: Error) => {
          console.error('Cache middleware: failed to write cache', err.message);
        });
        res.setHeader('X-Cache', 'MISS');
        return originalJson.call(this, data);
      };

      next();
    } catch (error: any) {
      console.error('Cache middleware error:', error);
      next(); // Continue without caching on error
    }
  };
};