// src/middleware/cors.middleware.ts

import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import environmentConfig from '@/config/environment/environment';
import logger, { LogCategory, PublicLogMetadata } from '@/shared/logger.util';
import { ErrorResponse } from '@/shared/response.util';

/**
 * CORS Middleware
 * Configures Cross-Origin Resource Sharing for the Connection Service.
 * Optimized for security with dynamic origin validation and credential support.
 * 
 * Features:
 * - Dynamic origin whitelist validation
 * - Supports credentials (cookies, auth headers)
 * - Preflight OPTIONS handling
 * - Structured logging for invalid origins
 * - Performance monitoring for CORS checks
 * - Production-ready with strict mode
 * 
 * Dependencies:
 * - cors: For CORS handling
 * - express: For types
 * - environment.ts: For CORS_ALLOWED_ORIGINS, ENABLE_CORS_LOGGING
 * - logger.ts: For logging invalid requests
 * - response.ts: For standardized error responses
 * 
 * Scalability Considerations:
 * - Efficient origin check (Set for O(1) lookup)
 * - Minimal performance impact on allowed requests
 * - Configurable via environment variables
 * 
 * Integration:
 * - Used by app.ts/server.ts: app.use(corsMiddleware)
 * - Supports all routes (connectionRoutes.ts, healthRoutes.ts, etc.)
 * - Aligns with .env (CORS_ALLOWED_ORIGINS comma-separated), package.json, tsconfig.json
 */

const allowedOrigins = new Set(
  (environmentConfig.CORS_ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean)
);

/**
 * CORS middleware configuration
 */
export const corsMiddleware = cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const startTime = Date.now();
    if (!origin || allowedOrigins.has('*') || allowedOrigins.has(origin)) {
      logger.debug('CORS origin allowed', {
        category: LogCategory.SECURITY,
        data: { origin: origin || 'none', duration: Date.now() - startTime }
      } as PublicLogMetadata);
      return callback(null, true);
    }
    
    logger.warn('Invalid CORS origin', {
      category: LogCategory.SECURITY,
      data: { origin, duration: Date.now() - startTime }
    } as PublicLogMetadata);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 86400, // 24 hours preflight cache
  preflightContinue: false,
});

/**
 * CORS error handler
 */
export const corsErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  if (err.message === 'Not allowed by CORS') {
    logger.error('CORS policy violation', {
      category: LogCategory.SECURITY,
      data: { origin: req.get('origin'), url: req.originalUrl }
    } as PublicLogMetadata);
    res.status(403).json(
      new ErrorResponse('CORS policy violation', 403, 'CORS_VIOLATION', {
        origin: req.get('origin'),
        timestamp: new Date().toISOString()
      })
    );
    return;
  }
  next(err);
};

/**
 * Check if an origin is allowed
 */
export const isOriginAllowed = (origin: string | undefined): boolean => {
  return !origin || allowedOrigins.has('*') || allowedOrigins.has(origin);
};

// Export for easy use
export default { corsMiddleware, corsErrorHandler, isOriginAllowed };