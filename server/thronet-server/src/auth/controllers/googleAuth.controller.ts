import { Request, Response } from 'express';
import GoogleAuthService from '../services/googleAuth.service';
import LoggerUtil from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { setAuthCookies, tokensForResponse } from '@/shared/utils/authCookies.util';
import {
    duplicateKeyConflict,
    RegistrationConflictError,
} from '../utils/registrationIdentity';

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

/**
 * Controller for Google ID Token verification (Mobile App Native Auth Flow)
 * POST /api/v1/auth/google/verify
 */
export async function googleVerifyController(req: Request, res: Response): Promise<void> {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            res.status(400).json({
                success: false,
                message: 'idToken is required',
            });
            return;
        }

        const result = await GoogleAuthService.verifyOrAuthenticate(idToken);

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
 * Controller for Google Registration / Onboarding completion (Mobile App Flow)
 * POST /api/v1/auth/google/register
 */
export async function googleRegisterController(req: Request, res: Response): Promise<void> {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            res.status(400).json({
                success: false,
                message: 'idToken is required for Google registration',
            });
            return;
        }

        const result = await GoogleAuthService.registerGoogleUser(req.body);

        res.status(200).json({
            success: true,
            data: withSessionCookies(req, res, result),
        });
    } catch (error: any) {
        const conflict = error instanceof RegistrationConflictError
            ? error
            : duplicateKeyConflict(error);
        if (conflict) {
            ResponseUtil.conflict(
                res,
                'Registration conflicts with an existing account',
                conflict.fieldErrors.map((fieldError: { message: string }) => fieldError.message),
                conflict.fieldErrors
            );
            return;
        }
        LoggerUtil.error('Google register controller failed', { error: error.message });
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