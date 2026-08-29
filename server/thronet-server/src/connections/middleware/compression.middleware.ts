// src/connections/middleware/compression.middleware.ts
import { Request, Response, RequestHandler } from 'express';
import compression from 'compression';
import logger, { LogCategory } from '@/shared/logger.util'; // PublicLogMetadata not needed — metadata param is Record<string, any>

// Configure compression middleware
export const compressionMiddleware: RequestHandler = compression({
  level: 6, // Compression level (1-9)
  threshold: 1024, // Only compress if response is larger than 1KB
  filter: (req: Request, res: Response) => {
    // Log compression decision
    const startTime = Date.now();
    if (req.headers['x-no-compression']) {
      logger.debug('Compression skipped due to x-no-compression header', {
        category: LogCategory.HTTP,
        data: { url: req.originalUrl, duration: Date.now() - startTime }
      });
      return false;
    }

    // Don't compress images, videos, etc.
    const contentType = res.getHeader('content-type') as string | undefined;
    if (contentType) {
      const nonCompressible = [
        'image/',
        'video/',
        'audio/',
        'application/zip',
        'application/gzip',
        'application/pdf'
      ];

      if (nonCompressible.some(type => contentType.includes(type))) {
        logger.debug('Compression skipped due to non-compressible content type', {
          category: LogCategory.HTTP,
          data: { url: req.originalUrl, contentType, duration: Date.now() - startTime }
        });
        return false;
      }
    }

    // Compress everything else
    const shouldCompress = compression.filter(req, res);
    logger.debug('Compression applied', {
      category: LogCategory.HTTP,
      data: { url: req.originalUrl, shouldCompress, duration: Date.now() - startTime }
    });
    return shouldCompress;
  }
});

// Custom compression wrapper for specific routes
export const customCompression = (options?: compression.CompressionOptions): RequestHandler => {
  return compression({
    level: options?.level || 6,
    threshold: options?.threshold || 1024,
    ...options
  });
};