/**
 * security.middleware.ts
 * FINAL PRODUCTION READY VERSION - Nov 22, 2025
 * CSRF token generation + protection + Postman friendly
 */

import csrf from 'csurf';
import type { Request, Response, NextFunction } from 'express';
import LoggerUtil from '../logger.util';
import ResponseUtil from '../response.util';
// import securityConfig from '@/config/security/';
import securityConfig from '@/config/security/rateLimit.config';

// ==================== SECURITY MIDDLEWARE ====================

const securityMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const ipAddress = req.ip;

    // Set basic security headers har request pe
    res.set({
        'Strict-Transport-Security': `max-age=31536000; includeSubDomains; preload`,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
    });

    // Public endpoints jahan CSRF validation nahi chahiye
    const publicPaths: string[] = [
        '/api/health',
        '/metrics',
        '/api/v1/auth/login',
        '/api/v1/auth/register',
        '/api/v1/auth/forgot-password',
        '/api/v1/auth/refresh-token',
    ];

    const isPublicPath = publicPaths.includes(req.path) || req.path.startsWith('/api/v1/auth/refresh');

    // Special case: /csrf-token pe CSRF middleware chalana hai (token generate karne ke liye)
    // lekin validation nahi karni — isliye sirf initialize karenge
    if (req.path === '/api/v1/auth/csrf-token') {
        LoggerUtil.info('Generating CSRF token - middleware applied for token creation', { path: req.path });

        if (securityConfig.csrf.enabled) {
            const csrfProtection = csrf({ cookie: securityConfig.csrf.cookie });
            // Sirf middleware chalao, validation error nahi handle karna yahan
            csrfProtection(req, res, () => {
                // csrfToken() ab available hai
                next();
            });
            return;
        } else {
            return next(); // CSRF disabled hai toh direct next
        }
    }

    // Baaki public paths pe CSRF validation bilkul mat lagao
    if (isPublicPath) {
        LoggerUtil.info('CSRF protection skipped for public endpoint', { path: req.path });
        return next();
    }

    // Protected routes pe full CSRF validation
    if (securityConfig.csrf.enabled) {
        const csrfProtection = csrf({ cookie: securityConfig.csrf.cookie });
        csrfProtection(req, res, (err: any) => {
            if (err) {
                LoggerUtil.error('CSRF validation failed', { error: err.message, ipAddress });
                res.status(403).json(ResponseUtil.forbidden('Invalid or missing CSRF token'));
            } else {
                LoggerUtil.info('CSRF token validated successfully', { path: req.path });
                next();
            }
        });
        return;
    }

    next();
};

export default securityMiddleware;