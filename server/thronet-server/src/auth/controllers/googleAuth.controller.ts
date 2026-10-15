import { Request, Response } from 'express';
import GoogleAuthService from '../services/googleAuth.service';
import LoggerUtil from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import {
    duplicateKeyConflict,
    RegistrationConflictError,
} from '../utils/registrationIdentity';

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
            data: result,
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
            data: result,
        });
    } catch (error: any) {
        const conflict = error instanceof RegistrationConflictError
            ? error
            : duplicateKeyConflict(error);
        if (conflict) {
            ResponseUtil.conflict(
                res,
                'Registration conflicts with an existing account',
                conflict.fieldErrors.map((fieldError) => fieldError.message),
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
