// src/middleware/rateLimiter.middleware.ts
import { Request, Response, NextFunction } from 'express';
import rateLimit, { Options } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import logger, { LogCategory } from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';
import  redisManager  from '@/config/cache/redis.config';

/**
 * Creates a Redis store for rate limiting using the shared Redis connection
 */
const createRedisStore = async (prefix: string): Promise<RedisStore> => {
  try {
    const sharedRedisClient = await redisManager.getRedisClient();
    
    return new RedisStore({
      sendCommand: (...args: string[]): Promise<any> => {
        // For ioredis, use the direct method call instead of .call()
        const [command, ...commandArgs] = args;
        return (sharedRedisClient as any)[command.toLowerCase()](...commandArgs);
      },
      prefix: `rl:${prefix}:`, // Unique prefix for each store
    });
  } catch (error : any) {
    logger.error('Failed to create Redis store for rate limiting', {
      error: error instanceof Error ? error.message : String(error),
      prefix,
      category: LogCategory.REDIS,
    });
    throw new ErrorResponse(
      'Rate limiter Redis store initialization failed', 
      HttpStatus.SERVICE_UNAVAILABLE, 
      'REDIS_STORE_ERROR'
    );
  }
};

/**
 * Enhanced rate limiter configuration for production
 */
export const rateLimiterMiddleware = (options: {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  storePrefix: string; // Required unique prefix for store
}) => {
  // Create the store asynchronously and cache it
  let storePromise: Promise<RedisStore> | null = null;
  
  const getStore = async (): Promise<RedisStore> => {
    if (!storePromise) {
      storePromise = createRedisStore(options.storePrefix);
    }
    return storePromise;
  };

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = await getStore();
      
      const limiter = rateLimit({
        store,
        windowMs: options.windowMs,
        max: options.max,
        message: async (req: Request) => {
          const error = new ErrorResponse(
            options.message || 'Too many requests, please try again later', 
            HttpStatus.TOO_MANY_REQUESTS
          );
          
          logger.warn('Rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            method: req.method,
            userId: (req.user as any)?.id || 'anonymous',
            userAgent: req.get('User-Agent'),
            origin: req.get('Origin'),
            windowMs: options.windowMs,
            maxRequests: options.max,
            category: LogCategory.RATE_LIMIT,
          });
          
          if (environmentConfig.AUDIT_LOG_ENABLED) {
            logger.auditLog('rate_limit_exceeded', (req.user as any)?.id || 'unknown', {
              ip: req.ip,
              path: req.path,
              method: req.method,
              timestamp: new Date().toISOString(),
            });
          }
          
          return error;
        },
        keyGenerator: options.keyGenerator || ((req: Request) => {
          return (req.user as any)?.id || req.get('X-API-Key') || req.ip || 'anonymous';
        }),
        skip: options.skip || (() => false),
        standardHeaders: true,
        legacyHeaders: false,
        
        handler: (req: Request, res: Response, _next: NextFunction, _optionsUsed: Options) => {
          logger.warn('Rate limit threshold reached', {
            ip: req.ip,
            userId: (req.user as any)?.id,
            path: req.path,
            method: req.method,
            category: LogCategory.RATE_LIMIT,
          });
          res.status(HttpStatus.TOO_MANY_REQUESTS).json(
            new ErrorResponse(
              options.message || 'Too many requests, please try again later', 
              HttpStatus.TOO_MANY_REQUESTS
            )
          );
        },
        
        skipSuccessfulRequests: false,
        skipFailedRequests: true,
      });

      return limiter(req, res, next);
    } catch (error : any) {
      logger.error('Rate limiter middleware error', {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        method: req.method,
        category: LogCategory.RATE_LIMIT,
      });
      
      // Fallback: allow request but log the issue
      next();
    }
  };
};

// Synchronous wrapper for backward compatibility (creates async middleware)
export const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  storePrefix: string;
}) => {
  return rateLimiterMiddleware(options);
};

// All rate limiters now use shared Redis connection with async initialization
export const defaultRateLimiter = createRateLimiter({
  storePrefix: 'default',
  windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS,
  max: Math.max(environmentConfig.RATE_LIMIT_MAX_REQUESTS, 1000),
  message: 'Too many requests, please try again later',
});

export const createConnectionLimiter = createRateLimiter({
  storePrefix: 'connection',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: environmentConfig.CONNECTION_REQUEST_RATE_LIMIT || 
       environmentConfig.MAX_CONNECTION_REQUESTS_PER_DAY || 50,
  message: 'Too many connection requests, please try again in an hour',
});

export const bulkOperationLimiter = createRateLimiter({
  storePrefix: 'bulk',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Math.max(Math.floor(environmentConfig.RATE_LIMIT_MAX_REQUESTS / 10), 10),
  message: 'Too many bulk requests, please try again later',
});

export const searchLimiter = createRateLimiter({
  storePrefix: 'search',
  windowMs: 60 * 1000, // 1 minute
  max: Math.max(Math.floor(environmentConfig.RATE_LIMIT_MAX_REQUESTS / 5), 200),
  message: 'Too many search requests, please slow down',
});

export const authLimiter = createRateLimiter({
  storePrefix: 'auth',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again later',
  keyGenerator: (req: Request) => req.ip || 'anonymous',
});

export const healthCheckLimiter = createRateLimiter({
  storePrefix: 'health',
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: 'Health check rate limit exceeded',
  skip: (req: Request) => {
    const userAgent = req.get('User-Agent') || '';
    return userAgent.includes('ELB-HealthChecker') || 
           userAgent.includes('kube-probe') || 
           req.path === '/health';
  },
});

export const vipRateLimiter = createRateLimiter({
  storePrefix: 'vip',
  windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS,
  max: environmentConfig.RATE_LIMIT_MAX_REQUESTS * 5,
  message: 'VIP rate limit exceeded',
  keyGenerator: (req: Request) => (req.user as any)?.id || req.ip || 'anonymous',
});

/**
 * Redis health check using the shared Redis manager
 */
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const health = await redisManager.checkHealth();
    return health.connected && health.healthyConnections > 0;
  } catch (error : any) {
    logger.error('Redis health check failed', { 
      error: error instanceof Error ? error.message : String(error),
      category: LogCategory.REDIS 
    });
    return false;
  }
};

/**
 * Alternative health check with direct ping
 */
export const checkRedisHealthDirect = async (): Promise<boolean> => {
  try {
    const redisClient = await redisManager.getRedisClient();
    
    // Use ping method directly for ioredis
    const result = await (redisClient as any).ping();
    
    return result === 'PONG';
  } catch (error : any) {
    logger.error('Redis direct health check failed', { 
      error: error instanceof Error ? error.message : String(error),
      category: LogCategory.REDIS 
    });
    return false;
  }
};

export default rateLimiterMiddleware;