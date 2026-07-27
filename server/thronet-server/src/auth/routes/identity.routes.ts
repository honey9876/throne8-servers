// Path: src/auth/routes/v1/phone.routes.ts
// ================================================================

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import EmailVerificationController from '../controllers/emailVerification.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = Router();

router.use(AuthMiddleware.authenticate as any);

// ==================== AADHAAR VERIFICATION ROUTES ====================

router.get(
    '/aadhaar/status',
    EmailVerificationController.getAadhaarVerificationStatus
);

router.post(    
    '/aadhaar/send-otp',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 3, message: { status: 'error', message: 'Too many Aadhaar OTP requests.', code: 'RATE_LIMIT_EXCEEDED' } }),
    EmailVerificationController.sendAadhaarOTP
);

router.post(
    '/aadhaar/verify-otp',
    rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: { status: 'error', message: 'Too many verification attempts.', code: 'RATE_LIMIT_EXCEEDED' } }),
    EmailVerificationController.verifyAadhaarOTP
);

export default router;