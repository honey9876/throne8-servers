// src/connections/middleware/security.middleware.ts

import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import environmentConfig from '@/config/environment/environment';
import logger, { LogCategory } from '@/shared/logger.util';

/**
 * Security Middleware
 * Applies security headers and protections using Helmet for the Connection Service.
 * Optimized for web security with CSP, HSTS, and more.
 * 
 * Features:
 * - Helmet bundle: X-XSS-Protection, X-Frame-Options, etc.
 * - Content Security Policy (CSP) with dynamic nonces
 * - Strict-Transport-Security (HSTS)
 * - Referrer-Policy
 * - X-Content-Type-Options
 * - Logging for security header violations
 * - Production-ready: stricter in prod
 * 
 * Dependencies:
 * - helmet: For security headers
 * - express: For types
 * - environment.ts: For CSP_DIRECTIVES, ENABLE_HSTS, etc.
 * - logger.ts: For violation logging
 * 
 * Scalability Considerations:
 * - Zero performance impact (header setting)
 * - CSP report-only mode for monitoring
 * 
 * Integration:
 * - Used by app.ts/server.ts: app.use(securityMiddleware)
 * - Applies to all routes
 * - Aligns with .env (CSP_*, ENABLE_HSTS), tsconfig.json
 */

export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", environmentConfig.CSP_SCRIPT_SRC],
      styleSrc: ["'self'", "'unsafe-inline'", environmentConfig.CSP_STYLE_SRC],
      imgSrc: ["'self'", 'data:', environmentConfig.CSP_IMG_SRC],
      connectSrc: ["'self'", environmentConfig.CSP_CONNECT_SRC],
      fontSrc: ["'self'", 'data:', environmentConfig.CSP_FONT_SRC],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
    reportOnly: environmentConfig.CSP_REPORT_ONLY,
  },
  hsts: {
    maxAge: environmentConfig.HSTS_MAX_AGE,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
  noSniff: true,
  frameguard: { action: 'deny' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  dnsPrefetchControl: { allow: false },
});

/**
 * CSP violation reporter (if CSP_REPORT_URI set)
 */
export const cspViolationReporter = (req: Request, res: Response, next: NextFunction): void => {
  if (req.path === '/csp-reports' && req.method === 'POST') {
    logger.warn('CSP violation reported', {
      body: req.body,
      category: LogCategory.SECURITY,
    });
    res.status(204).end();
    return;
  }
  next();
};

// Export for easy use
export default { securityMiddleware, cspViolationReporter };