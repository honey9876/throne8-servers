// Path: src/auth/controllers/password.controller.ts
// ================================================================

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import PasswordService from '../services/password.service';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import Constants from '@/shared/constants.util';
import ValidatorUtil from '@/shared/utils/validator.util';

class PasswordController {

    static async sendPasswordChangeOTP(req: Request, res: Response): Promise<Response> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { currentPassword } = req.body;
            const userId = (req as any).user?.userId;
            const email = (req as any).user?.email;
            const ipAddress = req.ip || '0.0.0.0';

            if (!currentPassword) {
                return ResponseUtil.validationError(res, ['Current password is required'], 'Validation failed');
            }

            const result = await PasswordService.sendPasswordChangeOTP(userId, email, currentPassword, ipAddress);

            LoggerUtil.performance('send_password_change_otp', Date.now() - startTime, { userId, correlationId });
            return ResponseUtil.success(res, result, 'Verification code sent to your email', 200);

        } catch (error: unknown) {
            const msg = (error as Error).message;

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId: (req as any).user?.userId || null,
                action: 'PASSWORD_CHANGE_OTP_FAILED', ipAddress: req.ip || '0.0.0.0',
                status: Constants.AUDIT_STATUS.ERROR as 'ERROR', severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                timestamp: new Date().toISOString(), metadata: { error: msg, correlationId },
            });

            if (msg.includes('Invalid current password')) return ResponseUtil.unauthorized(res, 'Current password is incorrect');
            if (msg.includes('rate limit') || msg.includes('Too many')) return ResponseUtil.tooManyRequests(res, msg, { retryAfter: 900 });

            return ResponseUtil.internalError(res, process.env.NODE_ENV === 'production' ? 'Failed to send verification code. Please try again.' : msg, error as Error);
        }
    }

    static async verifyPasswordChangeOTP(req: Request, res: Response): Promise<Response> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { otp, newPassword } = req.body;
            const userId = (req as any).user?.userId;
            const email = (req as any).user?.email;
            const ipAddress = req.ip || '0.0.0.0';
            const userAgent = req.headers['user-agent'] || 'Unknown';

            const validation = await ValidatorUtil.validatePasswordChange({ otp, newPassword });
            if (!validation.isValid) return ResponseUtil.validationError(res, validation.errors, 'Validation failed');

            const result = await PasswordService.verifyPasswordChangeOTP(
                userId, email, validation.data.otp, validation.data.newPassword, ipAddress, userAgent
            );

            LoggerUtil.performance('verify_password_change', Date.now() - startTime, { userId, correlationId });
            return ResponseUtil.success(res, result, 'Password changed successfully', 200);

        } catch (error: unknown) {
            const msg = (error as Error).message;

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId: (req as any).user?.userId || null,
                action: 'PASSWORD_CHANGE_FAILED', ipAddress: req.ip || '0.0.0.0',
                status: Constants.AUDIT_STATUS.ERROR as 'ERROR', 
                severity: Constants.AUDIT_SEVERITIES.HIGH as 'HIGH',
                timestamp: new Date().toISOString(), metadata: { error: msg, correlationId },
            });

            if (msg.includes('Invalid or expired OTP')) return ResponseUtil.unauthorized(res, 'Invalid or expired verification code');
            if (msg.includes('password strength')) return ResponseUtil.validationError(res, [msg], 'Password too weak');
            if (msg.includes('recently used')) return ResponseUtil.validationError(res, ['Cannot reuse recent passwords'], 'Password policy violation');

            return ResponseUtil.internalError(res, process.env.NODE_ENV === 'production' ? 'Failed to change password. Please try again.' : msg, error as Error);
        }
    }

    static async requestPasswordReset(req: Request, res: Response): Promise<Response> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { email } = req.body;
            const ipAddress = req.ip || '0.0.0.0';

            const validation = await ValidatorUtil.validateEmail(email);
            if (!validation.isValid) return ResponseUtil.validationError(res, validation.errors, 'Invalid email');

            const result = await PasswordService.requestPasswordReset(validation.data.email, ipAddress);

            LoggerUtil.performance('request_password_reset', Date.now() - startTime, { email: validation.data.email, correlationId });
            return ResponseUtil.success(res, result, 'Password reset code sent to your email', 200);

        } catch (error: unknown) {
            const msg = (error as Error).message;

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId: null,
                action: 'PASSWORD_RESET_REQUEST_FAILED', ipAddress: req.ip || '0.0.0.0',
                status: Constants.AUDIT_STATUS.ERROR as 'ERROR', severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                timestamp: new Date().toISOString(), metadata: { email: req.body.email, error: msg, correlationId },
            });

            if (msg.includes('rate limit') || msg.includes('Too many')) return ResponseUtil.tooManyRequests(res, msg, { retryAfter: 900 });

            // Security: always return success even on error
            return ResponseUtil.success(res, { success: true, message: 'If an account exists with this email, a reset code has been sent' }, 'Password reset code sent', 200);
        }
    }

    static async verifyPasswordReset(req: Request, res: Response): Promise<Response> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { email, resetCode, newPassword } = req.body;
            const ipAddress = req.ip || '0.0.0.0';
            const userAgent = req.headers['user-agent'] || 'Unknown';

            const validation = await ValidatorUtil.validatePasswordReset({ email, resetCode, newPassword });
            if (!validation.isValid) return ResponseUtil.validationError(res, validation.errors, 'Validation failed');

            const result = await PasswordService.verifyPasswordReset(
                validation.data.email, validation.data.resetCode, validation.data.newPassword, ipAddress, userAgent
            );

            LoggerUtil.performance('verify_password_reset', Date.now() - startTime, { email: validation.data.email, correlationId });
            return ResponseUtil.success(res, result, 'Password reset successful. You can now login with your new password.', 200);

        } catch (error: unknown) {
            const msg = (error as Error).message;

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId: null,
                action: 'PASSWORD_RESET_FAILED', ipAddress: req.ip || '0.0.0.0',
                status: Constants.AUDIT_STATUS.ERROR as 'ERROR', severity: Constants.AUDIT_SEVERITIES.HIGH as 'HIGH',
                timestamp: new Date().toISOString(), metadata: { email: req.body.email, error: msg, correlationId },
            });

            if (msg.includes('Invalid or expired')) return ResponseUtil.unauthorized(res, 'Invalid or expired reset code');
            if (msg.includes('password strength')) return ResponseUtil.validationError(res, [msg], 'Password too weak');
            if (msg.includes('recently used')) return ResponseUtil.validationError(res, ['Cannot reuse recent passwords'], 'Password policy violation');

            return ResponseUtil.internalError(res, process.env.NODE_ENV === 'production' ? 'Failed to reset password. Please try again.' : msg, error as Error);
        }
    }
}

export default PasswordController;
