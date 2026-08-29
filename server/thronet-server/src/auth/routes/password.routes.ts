import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import PasswordController from '../controllers/password.controller';

const router = Router();

const
    passwordChangeLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3,
        message: { status: 'error', message: 'Too many password change attempts. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
        standardHeaders: true,
        legacyHeaders: false,
    });

const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { status: 'error', message: 'Too many password reset attempts. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
    standardHeaders: true,
    legacyHeaders: false,
});

// PASSWORD CHANGE (AUTHENTICATED)
router.post(
    '/change/send-otp',
    AuthMiddleware.authenticate as any,
    passwordChangeLimiter,
    PasswordController.sendPasswordChangeOTP as any
);
router.post(
    '/change/verify',
    AuthMiddleware.authenticate as any,
    passwordChangeLimiter,
    PasswordController.verifyPasswordChangeOTP as any
);

// PASSWORD RESET (PUBLIC)
router.post(
    '/reset/request',
    // passwordResetLimiter,
    PasswordController.requestPasswordReset as any
);
router.post(
    '/reset/verify',
    // passwordResetLimiter,
    PasswordController.verifyPasswordReset as any
);

export default router;
