import { Request, Response } from 'express';
import GoogleAuthService from '../services/googleAuth.service';
import LoggerUtil from '@/shared/logger.util';
import { setAuthCookies, tokensForResponse } from '@/shared/utils/authCookies.util';
import { DeviceData } from '../interfaces/auth.interfaces';

/**
 * Web clients use these endpoints too (Google One Tap), so set the httpOnly session
 * cookies here as well. Raw tokens stay in the JSON only as AUTH_TOKEN_BODY_MODE allows
 * (the mobile app sends no Origin header, so `native-only` keeps it working).
 */
const withSessionCookies = (req: Request, res: Response, result: any): any => {
    if (!result?.tokens?.accessToken || !result?.tokens?.refreshToken) return result;

    setAuthCookies(res, {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
    });

    return { ...result, tokens: tokensForResponse(req, result.tokens) };
};

/** Request se device info (IP, browser) nikalo, service ko pass karne ke liye. */
const buildContext = (req: Request): DeviceData => {
    const userAgent = (req.headers['user-agent'] as string) || 'Unknown';
    return {
        ipAddress: req.ip || '0.0.0.0',
        userAgent,
        deviceType: /mobile|android|iphone/i.test(userAgent) ? 'mobile' : 'desktop',
        deviceName: 'Google Login Device',
    } as DeviceData;
};

/**
 * POST /api/v1/auth/google/verify
 */
export async function googleVerifyController(req: Request, res: Response): Promise<void> {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            res.status(400).json({ success: false, message: 'idToken is required' });
            return;
        }

        const result = await GoogleAuthService.verifyOrAuthenticate(idToken, buildContext(req));

        res.status(200).json({
            success: true,
            data: withSessionCookies(req, res, result),
        });
    } catch (error: any) {
        LoggerUtil.error('Google verify controller failed', { error: error.message });
        res.status(400).json({
            success: false,
            message: error.message || 'Google token verification failed',
        });
    }
}

/**
 * POST /api/v1/auth/google/register
 */
export async function googleRegisterController(req: Request, res: Response): Promise<void> {
    const startedAt = Date.now();
    try {
        const { idToken } = req.body;
        if (!idToken) {
            res.status(400).json({
                success: false,
                message: 'idToken is required for Google registration',
            });
            return;
        }

        const result = await GoogleAuthService.registerGoogleUser(req.body, buildContext(req));

        // Referral bonus (optional). Runs in the background: a referral problem
        // must never slow down or break a signup. registerGoogleUser throws for
        // existing accounts, so a returned user here is always brand new.
        const { referralCode } = req.body;
        const newUserId = result?.user?.userId;
        if (referralCode && newUserId) {
            // Loaded on demand so auth never depends on the optional resume module at startup
            import('@/resume/services/referral.service')
                .then(({ applyReferral }) => applyReferral(newUserId, referralCode, { ip: req.ip }))
                .catch((referralErr: any) =>
                    LoggerUtil.warn('Referral could not be applied (non-critical)', {
                        userId: newUserId,
                        error: referralErr?.message,
                    })
                );
        }

        LoggerUtil.info('Google register completed', { ms: Date.now() - startedAt });

        res.status(200).json({
            success: true,
            data: withSessionCookies(req, res, result),
        });
    } catch (error: any) {
        LoggerUtil.error('Google register controller failed', {
            error: error.message,
            ms: Date.now() - startedAt,
        });
        res.status(400).json({
            success: false,
            message: error.message || 'Google user registration failed',
        });
    }
}

export default {
    googleVerifyController,
    googleRegisterController,
};