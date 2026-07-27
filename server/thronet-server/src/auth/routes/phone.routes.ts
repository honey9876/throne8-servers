// Path: src/auth/routes/v1/phone.routes.ts
// ================================================================

import { Router } from 'express';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import PhoneOTPController from '../controllers/phone.otp.controller';

const router = Router();

router.post(
    '/otp/send',
    AuthMiddleware.authenticate as any,
    PhoneOTPController.sendOTP as any
);
router.post(
    '/otp/verify',
    AuthMiddleware.authenticate as any,
    PhoneOTPController.verifyOTP as any
);
router.post(
    '/otp/resend',
    AuthMiddleware.authenticate as any,
    PhoneOTPController.resendOTP as any
);
router.get(
    '/otp/status',
    AuthMiddleware.authenticate as any,
    PhoneOTPController.getVerificationStatus as any
);

export default router;