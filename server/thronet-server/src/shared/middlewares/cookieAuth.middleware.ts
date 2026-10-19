// src/shared/middlewares/cookieAuth.middleware.ts
/**
 * Cookie-session support for the existing Bearer-based auth.
 *
 * createCookieAuthBridge(isOriginAllowed)
 *   - If the request has an explicit Authorization header, nothing changes
 *     (mobile / API clients, and the old localStorage clients, are unaffected).
 *   - Otherwise, if the browser sent our auth cookies, the access cookie is copied
 *     into `Authorization: Bearer ...`, so every existing reader (AuthMiddleware,
 *     resume `protect`, Mentorship controllers, logout) keeps working unchanged.
 *
 * CSRF protection (cookies are attached automatically by browsers, and every
 * *.throne8.com subdomain is "same-site", so SameSite alone is not enough):
 *   For state-changing methods the cookies are only honoured when the request
 *   proves it comes from our own frontend:
 *     1. custom header X-Requested-With (cross-site pages cannot add it without
 *        passing a CORS preflight, which only allowlisted origins pass)
 *     2. Origin (or Referer) is on the allowlist
 *   If the proof is missing the cookies are IGNORED (stripped from req.cookies),
 *   not rejected. A forged request therefore arrives unauthenticated, and public
 *   endpoints such as /auth/login keep working even if a stale cookie is present.
 */

import { Request, Response, NextFunction } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/shared/utils/authCookies.util';
import logger from '@/shared/logger.util';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const originFromReferer = (referer?: string): string | undefined => {
    if (!referer) return undefined;
    try {
        return new URL(referer).origin;
    } catch {
        return undefined;
    }
};

export const createCookieAuthBridge =
    (isOriginAllowed: (origin: string) => boolean) =>
    (req: Request, res: Response, next: NextFunction): void => {
        const cookies: Record<string, string> = (req as any).cookies || {};
        const accessCookie = cookies[ACCESS_COOKIE];
        const refreshCookie = cookies[REFRESH_COOKIE];

        (req as any).authViaCookie = false;

        // Explicit Authorization header always wins; no cookie auth involved.
        if (req.headers.authorization || (!accessCookie && !refreshCookie)) {
            return next();
        }

        if (!SAFE_METHODS.has(req.method)) {
            const origin =
                (req.headers.origin as string | undefined) ||
                originFromReferer(req.headers.referer as string | undefined);

            const hasCustomHeader = !!req.headers['x-requested-with'];
            // Browsers always send Origin/Referer on cross-origin writes. If both are
            // absent this is a non-browser client that already passed the header check.
            const originOk = !origin || isOriginAllowed(origin);

            if (!hasCustomHeader || !originOk) {
                // Do not trust the cookies on this request.
                delete cookies[ACCESS_COOKIE];
                delete cookies[REFRESH_COOKIE];
                res.setHeader('X-Auth-Cookie-Ignored', hasCustomHeader ? 'origin-not-allowed' : 'missing-x-requested-with');
                logger.warn('Auth cookies ignored (CSRF check)', {
                    method: req.method,
                    path: req.path,
                    origin,
                    hasCustomHeader,
                });
                return next();
            }
        }

        (req as any).authViaCookie = true;
        if (accessCookie) {
            req.headers.authorization = `Bearer ${accessCookie}`;
        }
        next();
    };
