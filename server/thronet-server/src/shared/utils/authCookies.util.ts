// src/shared/utils/authCookies.util.ts
/**
 * Auth cookie helper — single place that sets / clears / reads the
 * session cookies shared across throne8.com, api.throne8.com and
 * resume.throne8.com.
 *
 * Cookies
 *   t8_access   short-lived access JWT   (path "/")
 *   t8_refresh  refresh JWT              (path limited to the auth routes)
 *
 * Env (all optional)
 *   COOKIE_DOMAIN            e.g. ".throne8.com"  (leave empty in local dev)
 *   COOKIE_SECURE            "true" | "false"     (default: NODE_ENV === production)
 *   COOKIE_SAMESITE          "lax" | "strict" | "none" (default: lax)
 *   AUTH_REFRESH_COOKIE_PATH default "/api/v1/auth"
 *   AUTH_TOKEN_BODY_MODE     "legacy" | "native-only" | "never"  (default: legacy)
 *       legacy       tokens are still returned in JSON (current behaviour)
 *       native-only  tokens are returned only to non-browser clients
 *                    (requests without an Origin header, e.g. the mobile app)
 *       never        tokens are never returned in JSON
 */

import type { CookieOptions, Request, Response } from 'express';

export const ACCESS_COOKIE = 't8_access';
export const REFRESH_COOKIE = 't8_refresh';

// Names used by the previous implementation. We only ever *clear* these.
const LEGACY_ACCESS_COOKIE = 'accessToken';
const LEGACY_REFRESH_COOKIE = 'refreshToken';

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // matches JWT_CONFIG.accessToken.expiresIn (15m)
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // matches JWT_CONFIG.refreshToken.expiresIn (30d)

type SameSite = 'lax' | 'strict' | 'none';

const isProduction = (): boolean => process.env['NODE_ENV'] === 'production';

const isSecure = (): boolean => {
    const explicit = process.env['COOKIE_SECURE'];
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return isProduction();
};

const getSameSite = (): SameSite => {
    const value = (process.env['COOKIE_SAMESITE'] || 'lax').toLowerCase();
    return value === 'strict' || value === 'none' ? value : 'lax';
};

const getRefreshPath = (): string => process.env['AUTH_REFRESH_COOKIE_PATH'] || '/api/v1/auth';

/** Attributes that must be identical when setting AND clearing a cookie. */
const baseOptions = (path: string): CookieOptions => {
    const options: CookieOptions = {
        httpOnly: true,
        secure: isSecure(),
        sameSite: getSameSite(),
        path,
    };
    const domain = process.env['COOKIE_DOMAIN'];
    if (domain) options.domain = domain;
    return options;
};

export interface AuthCookieTokens {
    accessToken?: string;
    refreshToken?: string;
    /** Refresh cookie lifetime in seconds (clamped to the 30d JWT lifetime). */
    refreshMaxAgeSeconds?: number;
}

/** Set the access and/or refresh cookie. */
export const setAuthCookies = (res: Response, tokens: AuthCookieTokens): void => {
    if (tokens.accessToken) {
        res.cookie(ACCESS_COOKIE, tokens.accessToken, {
            ...baseOptions('/'),
            maxAge: ACCESS_MAX_AGE_MS,
        });
    }

    if (tokens.refreshToken) {
        const requested = tokens.refreshMaxAgeSeconds
            ? tokens.refreshMaxAgeSeconds * 1000
            : REFRESH_MAX_AGE_MS;

        res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
            ...baseOptions(getRefreshPath()),
            maxAge: Math.min(requested, REFRESH_MAX_AGE_MS),
        });
    }
};

/** Clear both auth cookies (and the old host-only ones from the previous implementation). */
export const clearAuthCookies = (res: Response): void => {
    res.clearCookie(ACCESS_COOKIE, baseOptions('/'));
    res.clearCookie(REFRESH_COOKIE, baseOptions(getRefreshPath()));

    // Legacy cookies were host-only with sameSite=strict and no path/domain.
    const legacy: CookieOptions = {
        httpOnly: true,
        secure: isProduction(),
        sameSite: 'strict',
    };
    res.clearCookie(LEGACY_ACCESS_COOKIE, legacy);
    res.clearCookie(LEGACY_REFRESH_COOKIE, legacy);
};

/** Refresh token from an explicit body value first (legacy clients), then the cookie. */
export const getRefreshTokenFromRequest = (req: Request): string | undefined => {
    const fromBody = (req.body as any)?.refreshToken;
    if (typeof fromBody === 'string' && fromBody) return fromBody;

    const fromCookie = (req as any).cookies?.[REFRESH_COOKIE];
    return typeof fromCookie === 'string' && fromCookie ? fromCookie : undefined;
};

/** Minimal Cookie header parser (used for Socket.IO handshakes, which skip cookie-parser). */
export const parseCookieHeader = (header?: string): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!header) return out;

    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx < 0) continue;
        const key = part.slice(0, idx).trim();
        let value = part.slice(idx + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        try {
            out[key] = decodeURIComponent(value);
        } catch {
            out[key] = value;
        }
    }
    return out;
};

export const getAccessTokenFromCookieHeader = (header?: string): string | undefined =>
    parseCookieHeader(header)[ACCESS_COOKIE] || undefined;

/**
 * Should this response still carry raw tokens in the JSON body?
 * See AUTH_TOKEN_BODY_MODE at the top of this file.
 */
export const shouldExposeTokensInBody = (req: Request): boolean => {
    const mode = (process.env['AUTH_TOKEN_BODY_MODE'] || 'legacy').toLowerCase();
    if (mode === 'never') return false;
    if (mode === 'native-only') return !req.headers['origin'];
    return true;
};

/** Returns the tokens object for a JSON response, minus the raw JWTs when policy says so. */
export const tokensForResponse = <T extends { accessToken?: string; refreshToken?: string }>(
    req: Request,
    tokens: T
): Partial<T> => {
    if (shouldExposeTokensInBody(req)) return tokens;
    const { accessToken: _a, refreshToken: _r, ...rest } = tokens;
    return rest as Partial<T>;
};
