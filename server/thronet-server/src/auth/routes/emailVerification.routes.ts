import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import EmailVerificationController from '../controllers/emailVerification.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = Router();

const sendOTPLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 3,
    message: { status: 'error', message: 'Too many OTP requests. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
});

const verifyOTPLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, max: 5,
    message: { status: 'error', message: 'Too many verification attempts.', code: 'RATE_LIMIT_EXCEEDED' },
});

const resendOTPLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 2,
    message: { status: 'error', message: 'Too many resend requests.', code: 'RATE_LIMIT_EXCEEDED' },
});

router.use(AuthMiddleware.authenticate as any);

// POST /api/v1/verify/email/send-otp
router.post(
    '/send-otp',
    sendOTPLimiter,
    EmailVerificationController.sendEmailOTP
);

// POST /api/v1/verify/email/otp/verify
router.post(
    '/otp/verify',
    verifyOTPLimiter,
    EmailVerificationController.verifyEmailOTP
);

// POST /api/v1/verify/email/otp/resend-otp
router.post(
    '/otp/resend-otp',
    resendOTPLimiter,
    EmailVerificationController.resendEmailOTP
);

// GET /api/v1/verify/email/status-check (auth required)
router.get(
    '/status-check',
    EmailVerificationController.getEmailVerificationStatus
);

// ==================== DEVICE VERIFICATION ROUTES ====================

router.post(
    '/device/otp/send-otp',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 3, message: { status: 'error', message: 'Too many device verification requests.', code: 'RATE_LIMIT_EXCEEDED' } }),
    EmailVerificationController.sendDeviceOTP
);

router.post(
    '/device/otp/verify-otp',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { status: 'error', message: 'Too many verification attempts.', code: 'RATE_LIMIT_EXCEEDED' } }),
    EmailVerificationController.verifyDeviceOTP
);

// ==================== STEP-UP AUTH ROUTES ====================

router.post(
    '/step-up/otp/send-otp',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 3, message: { status: 'error', message: 'Too many authentication requests.', code: 'RATE_LIMIT_EXCEEDED' } }),
    EmailVerificationController.sendStepUpOTP
);

router.post(
    '/step-up/otp/verify-otp',
    rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: { status: 'error', message: 'Too many verification attempts.', code: 'RATE_LIMIT_EXCEEDED' } }),
    EmailVerificationController.verifyStepUpOTP
);

// ==================== COMPLIANCE ROUTES ====================

router.get(
    '/compliance/password-90day/status',
    EmailVerificationController.check90DayPasswordStatus
);
router.post('/compliance/password-90day/verify',
    EmailVerificationController.verify90DayPassword);

router.get(
    '/compliance/identity-annual/status',
    EmailVerificationController.checkAnnualIdentityStatus
);
router.post(
    '/compliance/identity-annual/send-otp',
    EmailVerificationController.sendAnnualIdentityOTP
);

router.post(
    '/compliance/identity-annual/verify-otp',
    EmailVerificationController.verifyAnnualIdentityOTP
);

router.post(
    '/compliance/unusual-activity/check',
    EmailVerificationController.checkUnusualActivity
);
router.post(
    '/compliance/unusual-activity/verify-otp',
    EmailVerificationController.verifyUnusualActivityOTP
);

router.post(
    '/compliance/suspicious-location/check',
    EmailVerificationController.checkSuspiciousLocation
);

router.get(
    '/compliance/suspicious-location/verify/:token',
    EmailVerificationController.verifySuspiciousLocation
);

// ==================== COMPANY EMAIL VERIFICATION ROUTES ====================

router.get(
    '/company-email/status',
    EmailVerificationController.getCompanyEmailVerificationStatus
);

router.post(
    '/company-email/send-otp',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 3, message: { status: 'error', message: 'Too many company email OTP requests.', code: 'RATE_LIMIT_EXCEEDED' } }),
    EmailVerificationController.sendCompanyEmailOTP
);

router.post(
    '/company-email/verify-otp',
    rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: { status: 'error', message: 'Too many verification attempts.', code: 'RATE_LIMIT_EXCEEDED' } }),
    EmailVerificationController.verifyCompanyEmailOTP
);

// Health check
router.get(
    '/health', (req, res) => {
        res.status(200).json({ status: 'success', message: 'Email Verification Service running', timestamp: new Date().toISOString() });
    });

export default router;