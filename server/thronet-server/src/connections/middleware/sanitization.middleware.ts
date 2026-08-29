// src/connections/middleware/sanitization.middleware.ts
import { Request, Response, NextFunction } from 'express';
import purify from 'isomorphic-dompurify';
// ✅ isomorphic-dompurify already server-safe hai — koi manual JSDOM window
// setup ki zaroorat nahi. Ye undici/jsdom transitive dependency resolution
// errors (jaise 'Cannot find module undici/lib/handler/wrap-handler.js')
// se bhi bachata hai jo raw dompurify + jsdom combo ke saath aa rahe the.

export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize body parameters
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize params
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error : any) {
    console.error('Sanitization error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid input data',
      code: 'INVALID_INPUT'
    });
  }
};

const sanitizeObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
};

const sanitizeString = (str: string): string => {
  if (typeof str !== 'string') return str;

  // Remove HTML tags and scripts
  let sanitized = purify.sanitize(str, { ALLOWED_TAGS: [] });

  // Remove SQL injection patterns
  sanitized = sanitized.replace(/('|(\\)|;|--|\/\*|\*\/)/gi, '');

  // Remove XSS patterns
  sanitized = sanitized.replace(/(javascript:|vbscript:|onload=|onerror=)/gi, '');

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
};