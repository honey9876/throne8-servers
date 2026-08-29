import { Request, Response, NextFunction } from 'express';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import { logger } from '@/shared/logger.util';
import rateLimit from 'express-rate-limit';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

/**
 * Simple in-memory rate limiter
 * For production, use Redis-based rate limiter
 */
class RateLimiter {
  private store: RateLimitStore = {};
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request is allowed
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const record = this.store[key];

    if (!record) {
      this.store[key] = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      return true;
    }

    if (now > record.resetTime) {
      this.store[key] = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      return true;
    }

    if (record.count < this.maxRequests) {
      record.count++;
      return true;
    }

    return false;
  }

  /**
   * Get remaining requests
   */
  getRemaining(key: string): number {
    const record = this.store[key];
    if (!record) return this.maxRequests;

    const now = Date.now();
    if (now > record.resetTime) return this.maxRequests;

    return Math.max(0, this.maxRequests - record.count);
  }

  /**
   * Get reset time
   */
  getResetTime(key: string): number {
    const record = this.store[key];
    if (!record) return Date.now() + this.windowMs;

    return record.resetTime;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const key in this.store) {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Rate limiter: Cleaned ${cleaned} expired entries`);
    }
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    delete this.store[key];
  }

  /**
   * Get current count
   */
  getCount(key: string): number {
    const record = this.store[key];
    if (!record) return 0;

    const now = Date.now();
    if (now > record.resetTime) return 0;

    return record.count;
  }
}

// Create rate limiter instances
const searchLimiter = new RateLimiter(60000, 30); // 30 requests per minute
const generalLimiter = new RateLimiter(60000, 100); // 100 requests per minute
const strictLimiter = new RateLimiter(60000, 10); // 10 requests per minute
const notificationLimiter = new RateLimiter(60000, 50); // 50 requests per minute
const filterLimiter = new RateLimiter(60000, 20); // 20 requests per minute
/**
 * Rate limit middleware factory
 */
export const createRateLimiter = (
  limiter: RateLimiter,
  keyGenerator?: (req: Request) => string
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Generate rate limit key
      const key = keyGenerator
        ? keyGenerator(req)
        : req.ip || req.socket.remoteAddress || 'unknown';

      // Check if request is allowed
      if (!limiter.isAllowed(key)) {
        const resetTime = limiter.getResetTime(key);
        const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', String(limiter['maxRequests']));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', String(resetTime));
        res.setHeader('Retry-After', String(retryAfter));

        logger.warn(`Rate limit exceeded for key: ${key}`);

        ResponseHandler.error(
          res,
          'Too many requests. Please try again later.',
          429,
          {
            retryAfter,
            resetTime: new Date(resetTime).toISOString(),
          }
        );
        return;
      }

      // Set rate limit headers
      const remaining = limiter.getRemaining(key);
      const resetTime = limiter.getResetTime(key);

      res.setHeader('X-RateLimit-Limit', String(limiter['maxRequests']));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(resetTime));

      next();
    } catch (error: any) {
      logger.error('Rate limiter error:', error);
      next(); // Don't block request on rate limiter error
    }
  };
};

/**
 * Search API rate limiter (30 requests per minute)
 */
export const rateLimitSearch = createRateLimiter(searchLimiter);

/**
 * General API rate limiter (100 requests per minute)
 */
export const rateLimitGeneral = createRateLimiter(generalLimiter);
export const rateLimitFilter = createRateLimiter(filterLimiter);
/**
 * Strict rate limiter (10 requests per minute)
 */
export const rateLimitStrict = createRateLimiter(strictLimiter);

export const rateLimitNotification = createRateLimiter(notificationLimiter);
/**
 * Rate limiter with user-based key
 */
export const rateLimitByUser = createRateLimiter(
  generalLimiter,
  (req: Request) => req.user?.id || req.ip || 'unknown'
);

/**
 * Rate limiter with IP-based key
 */
export const rateLimitByIP = createRateLimiter(
  generalLimiter,
  (req: Request) => req.ip || req.socket.remoteAddress || 'unknown'
);

export default {
  rateLimitSearch,
  rateLimitGeneral,
  rateLimitStrict,
  rateLimitByUser,
  rateLimitByIP,
  createRateLimiter,
  rateLimitNotification,
  rateLimitFilter
};