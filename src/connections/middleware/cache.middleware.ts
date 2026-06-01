// src/middleware/cache.middleware.ts
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

interface CacheOptions {
  ttl: number; // Time to live in seconds
  prefix?: string;
  varyBy?: string[];
  skipCache?: (req: Request) => boolean;
}

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  // retryDelayOnFailover: 100,
  // maxRetriesPerRequest: 3,
});

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

      // Try to get cached data
      const cachedData = await redis.get(cacheKey);
      
      if (cachedData) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cachedData));
      }

      // Store original json method
      const originalJson = res.json;
      
      // Override json method to cache response
      res.json = function(data: any) {
        // Cache the response
        redis.setex(cacheKey, options.ttl, JSON.stringify(data));
        res.setHeader('X-Cache', 'MISS');
        return originalJson.call(this, data);
      };

      next();
    } catch (error : any) {
      console.error('Cache middleware error:', error);
      next(); // Continue without caching on error
    }
  };
};