import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import OTPVerification from '../models/OTPVerification.model';
import PasswordController from '../controllers/password.controller';
import PasswordService from '../services/password.service';
import User from '../models/User.model';
import PasswordHistory from '../models/PasswordHistory.model';

describe('Password Reset OTP Verification Flow', () => {

    describe('OTPVerification.model unit tests', () => {
        const testUserId = 'test-user-uuid-12345';
        const testEmail = 'reset.user@example.com';
        const salt = process.env.OTP_SALT || 'default-otp-salt-change-in-production';

        it('should verify a valid pending OTP successfully', async () => {
            const rawCode = '123456';
            const hash = crypto.createHash('sha256').update(rawCode + salt).digest('hex');

            const mockRecord: any = {
                otpId: 'otp-uuid-1',
                userId: testUserId,
                email: testEmail,
                otpType: 'password_reset',
                otpHash: hash,
                status: 'pending',
                attempts: 0,
                maxAttempts: 5,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                generateOTPHash(val: string) {
                    return crypto.createHash('sha256').update(val + salt).digest('hex');
                },
                async save() {
                    return this;
                },
            };
            mockRecord.verifyOTP = OTPVerification.schema.methods.verifyOTP.bind(mockRecord);

            const origFindOne = OTPVerification.findOne;
            (OTPVerification as any).findOne = (query: any) => {
                return {
                    sort: () => ({
                        select: async () => mockRecord,
                        exec: async () => mockRecord,
                    }),
                };
            };

            try {
                const res = await OTPVerification.verifyOTPByType(testUserId, rawCode, 'password_reset', testEmail);
                assert.equal(res.success, true);
                assert.equal(res.otpId, 'otp-uuid-1');
                assert.equal(mockRecord.status, 'verified');
                assert.ok(mockRecord.verifiedAt);
            } finally {
                OTPVerification.findOne = origFindOne;
            }
        });

        it('should throw Invalid OTP when incorrect code is submitted', async () => {
            const rawCode = '123456';
            const hash = crypto.createHash('sha256').update(rawCode + salt).digest('hex');

            const mockRecord: any = {
                otpId: 'otp-uuid-2',
                userId: testUserId,
                email: testEmail,
                otpType: 'password_reset',
                otpHash: hash,
                status: 'pending',
                attempts: 0,
                maxAttempts: 3,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                generateOTPHash(val: string) {
                    return crypto.createHash('sha256').update(val + salt).digest('hex');
                },
                async save() {
                    return this;
                },
            };
            mockRecord.verifyOTP = OTPVerification.schema.methods.verifyOTP.bind(mockRecord);

            const origFindOne = OTPVerification.findOne;
            (OTPVerification as any).findOne = () => ({
                sort: () => ({
                    select: async () => mockRecord,
                }),
            });

            try {
                await assert.rejects(
                    async () => {
                        await OTPVerification.verifyOTPByType(testUserId, '999999', 'password_reset');
                    },
                    (err: Error) => {
                        assert.equal(err.message, 'Invalid OTP');
                        assert.equal(mockRecord.attempts, 1);
                        return true;
                    }
                );
            } finally {
                OTPVerification.findOne = origFindOne;
            }
        });

        it('should throw OTP expired when code is past expiration date', async () => {
            const rawCode = '123456';
            const hash = crypto.createHash('sha256').update(rawCode + salt).digest('hex');

            const mockRecord: any = {
                otpId: 'otp-uuid-3',
                userId: testUserId,
                email: testEmail,
                otpType: 'password_reset',
                otpHash: hash,
                status: 'pending',
                attempts: 0,
                maxAttempts: 3,
                expiresAt: new Date(Date.now() - 60 * 1000), // Expired 1 minute ago
                generateOTPHash(val: string) {
                    return crypto.createHash('sha256').update(val + salt).digest('hex');
                },
                async save() {
                    return this;
                },
            };
            mockRecord.verifyOTP = OTPVerification.schema.methods.verifyOTP.bind(mockRecord);

            const origFindOne = OTPVerification.findOne;
            (OTPVerification as any).findOne = () => ({
                sort: () => ({
                    select: async () => mockRecord,
                }),
            });

            try {
                await assert.rejects(
                    async () => {
                        await OTPVerification.verifyOTPByType(testUserId, rawCode, 'password_reset');
                    },
                    (err: Error) => {
                        assert.equal(err.message, 'OTP expired');
                        assert.equal(mockRecord.status, 'expired');
                        return true;
                    }
                );
            } finally {
                OTPVerification.findOne = origFindOne;
            }
        });

        it('should throw informative error when OTP was revoked by newer request', async () => {
            const origFindOne = OTPVerification.findOne;
            (OTPVerification as any).findOne = (query: any) => ({
                sort: () => ({
                    select: async () => (query.status === 'pending' ? null : { status: 'revoked' }),
                    then: (resolve: any) => resolve(query.status === 'pending' ? null : { status: 'revoked' }),
                }),
            });

            try {
                await assert.rejects(
                    async () => {
                        await OTPVerification.verifyOTPByType(testUserId, '123456', 'password_reset');
                    },
                    (err: Error) => {
                        assert.equal(err.message, 'This OTP has been revoked. Please request a new one.');
                        return true;
                    }
                );
            } finally {
                OTPVerification.findOne = origFindOne;
            }
        });

        it('should throw No pending OTP found when no record exists at all', async () => {
            const origFindOne = OTPVerification.findOne;
            (OTPVerification as any).findOne = () => ({
                sort: () => ({
                    select: async () => null,
                    then: (resolve: any) => resolve(null),
                }),
            });

            try {
                await assert.rejects(
                    async () => {
                        await OTPVerification.verifyOTPByType(testUserId, '123456', 'password_reset');
                    },
                    (err: Error) => {
                        assert.equal(err.message, 'No pending OTP found. Please request a new one.');
                        return true;
                    }
                );
            } finally {
                OTPVerification.findOne = origFindOne;
            }
        });

        it('should throw Maximum verification attempts exceeded when limit reached', async () => {
            const rawCode = '123456';
            const hash = crypto.createHash('sha256').update(rawCode + salt).digest('hex');

            const mockRecord: any = {
                otpId: 'otp-uuid-4',
                userId: testUserId,
                email: testEmail,
                otpType: 'password_reset',
                otpHash: hash,
                status: 'pending',
                attempts: 3,
                maxAttempts: 3,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                generateOTPHash(val: string) {
                    return crypto.createHash('sha256').update(val + salt).digest('hex');
                },
                async save() {
                    return this;
                },
            };
            mockRecord.verifyOTP = OTPVerification.schema.methods.verifyOTP.bind(mockRecord);

            const origFindOne = OTPVerification.findOne;
            (OTPVerification as any).findOne = () => ({
                sort: () => ({
                    select: async () => mockRecord,
                }),
            });

            try {
                await assert.rejects(
                    async () => {
                        await OTPVerification.verifyOTPByType(testUserId, rawCode, 'password_reset');
                    },
                    (err: Error) => {
                        assert.equal(err.message, 'Maximum verification attempts exceeded');
                        assert.equal(mockRecord.status, 'failed');
                        return true;
                    }
                );
            } finally {
                OTPVerification.findOne = origFindOne;
            }
        });
    });

    describe('PasswordController error status code mapping', () => {
        function createMockResponse() {
            const headers: Record<string, string> = {};
            const res: any = {
                statusCode: 200,
                responseData: null,
                req: { path: '/api/v1/verify/password/reset/verify', method: 'POST', ip: '127.0.0.1' },
                setHeader(name: string, value: string) {
                    headers[name] = value;
                    return this;
                },
                status(code: number) {
                    this.statusCode = code;
                    return this;
                },
                json(data: any) {
                    this.responseData = data;
                    return this;
                },
            };
            return res;
        }

        it('should return HTTP 400 for "Cannot reuse any of your last 5 passwords"', async () => {
            const req: any = {
                body: { email: 'user@example.com', resetCode: '123456', newPassword: 'ValidPassword!123' },
                headers: {},
            };
            const res = createMockResponse();

            const origVerify = PasswordService.verifyPasswordReset;
            PasswordService.verifyPasswordReset = async () => {
                throw new Error('Cannot reuse any of your last 5 passwords');
            };

            try {
                await PasswordController.verifyPasswordReset(req, res);
                assert.equal(res.statusCode, 400);
                assert.equal(res.responseData.status, 'error');
                assert.equal(res.responseData.message, 'Cannot reuse any of your last 5 passwords');
            } finally {
                PasswordService.verifyPasswordReset = origVerify;
            }
        });

        it('should return HTTP 400 for "No pending OTP found. Please request a new one."', async () => {
            const req: any = {
                body: { email: 'user@example.com', resetCode: '123456', newPassword: 'ValidPassword!123' },
                headers: {},
            };
            const res = createMockResponse();

            const origVerify = PasswordService.verifyPasswordReset;
            PasswordService.verifyPasswordReset = async () => {
                throw new Error('No pending OTP found. Please request a new one.');
            };

            try {
                await PasswordController.verifyPasswordReset(req, res);
                assert.equal(res.statusCode, 400);
                assert.equal(res.responseData.status, 'error');
                assert.ok(res.responseData.message.includes('No pending OTP found'));
            } finally {
                PasswordService.verifyPasswordReset = origVerify;
            }
        });

        it('should return HTTP 400 for revoked OTP', async () => {
            const req: any = {
                body: { email: 'user@example.com', resetCode: '123456', newPassword: 'ValidPassword!123' },
                headers: {},
            };
            const res = createMockResponse();

            const origVerify = PasswordService.verifyPasswordReset;
            PasswordService.verifyPasswordReset = async () => {
                throw new Error('This OTP has been revoked. Please request a new one.');
            };

            try {
                await PasswordController.verifyPasswordReset(req, res);
                assert.equal(res.statusCode, 400);
                assert.ok(res.responseData.message.includes('revoked'));
            } finally {
                PasswordService.verifyPasswordReset = origVerify;
            }
        });

        it('should return HTTP 400 for expired OTP', async () => {
            const req: any = {
                body: { email: 'user@example.com', resetCode: '123456', newPassword: 'ValidPassword!123' },
                headers: {},
            };
            const res = createMockResponse();

            const origVerify = PasswordService.verifyPasswordReset;
            PasswordService.verifyPasswordReset = async () => {
                throw new Error('OTP expired');
            };

            try {
                await PasswordController.verifyPasswordReset(req, res);
                assert.equal(res.statusCode, 400);
                assert.ok(res.responseData.message.includes('expired'));
            } finally {
                PasswordService.verifyPasswordReset = origVerify;
            }
        });

        it('should return HTTP 401 for Invalid OTP', async () => {
            const req: any = {
                body: { email: 'user@example.com', resetCode: '123456', newPassword: 'ValidPassword!123' },
                headers: {},
            };
            const res = createMockResponse();

            const origVerify = PasswordService.verifyPasswordReset;
            PasswordService.verifyPasswordReset = async () => {
                throw new Error('Invalid OTP');
            };

            try {
                await PasswordController.verifyPasswordReset(req, res);
                assert.equal(res.statusCode, 401);
                assert.ok(res.responseData.message.includes('Invalid reset code'));
            } finally {
                PasswordService.verifyPasswordReset = origVerify;
            }
        });

        it('should return HTTP 429 for Maximum verification attempts exceeded', async () => {
            const req: any = {
                body: { email: 'user@example.com', resetCode: '123456', newPassword: 'ValidPassword!123' },
                headers: {},
            };
            const res = createMockResponse();

            const origVerify = PasswordService.verifyPasswordReset;
            PasswordService.verifyPasswordReset = async () => {
                throw new Error('Maximum verification attempts exceeded');
            };

            try {
                await PasswordController.verifyPasswordReset(req, res);
                assert.equal(res.statusCode, 429);
                assert.ok(res.responseData.message.includes('Maximum verification attempts exceeded'));
            } finally {
                PasswordService.verifyPasswordReset = origVerify;
            }
        });

        it('should return HTTP 400 (not 500) when password strength fails with zxcvbn feedback', async () => {
            const req: any = {
                body: { email: 'user@example.com', resetCode: '123456', newPassword: 'Welcome@123!' },
                headers: {},
            };
            const res = createMockResponse();

            const origVerify = PasswordService.verifyPasswordReset;
            PasswordService.verifyPasswordReset = async () => {
                throw new Error('Password is too weak: This is similar to a commonly used password Add another word or two.');
            };

            try {
                await PasswordController.verifyPasswordReset(req, res);
                assert.equal(res.statusCode, 400, 'Password validation errors must return HTTP 400, never 500');
                assert.equal(res.responseData.status, 'error');
                assert.ok(res.responseData.message.includes('too weak') || res.responseData.message.includes('commonly used'));
            } finally {
                PasswordService.verifyPasswordReset = origVerify;
            }
        });
    });

    describe('Password update and OTP consumption safety', () => {
        const testUserId = 'user-xyz';
        const testEmail = 'test@example.com';
        const salt = process.env.OTP_SALT || 'default-otp-salt-change-in-production';
        const validOTP = '654321';
        const validOTPHash = crypto.createHash('sha256').update(validOTP + salt).digest('hex');

        it('should keep OTP pending on password-history rejection, allowing successful retry with new password and the same OTP', async () => {
            const mockUser = {
                userId: testUserId,
                email: testEmail,
                passwordHash: '$2b$12$someOldHashPlaceholderForBcryptTest',
                firstName: 'Test',
            };

            const mockOtpRecord: any = {
                otpId: 'otp-retry-test-1',
                userId: testUserId,
                email: testEmail,
                otpType: 'password_reset',
                otpHash: validOTPHash,
                status: 'pending',
                attempts: 0,
                maxAttempts: 5,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                generateOTPHash(val: string) {
                    return crypto.createHash('sha256').update(val + salt).digest('hex');
                },
                async save() {
                    return this;
                },
            };
            mockOtpRecord.verifyOTP = OTPVerification.schema.methods.verifyOTP.bind(mockOtpRecord);

            let userPasswordUpdated = false;
            let recentlyUsedMock = true; // First attempt: password was recently used

            const origUserFindOne = User.findOne;
            const origUserFindOneAndUpdate = User.findOneAndUpdate;
            const origOTPFindOne = OTPVerification.findOne;
            const origRecentPassword = PasswordHistory.isPasswordRecentlyUsed;
            const origAddPasswordToHistory = PasswordHistory.addPasswordToHistory;

            (User as any).findOne = () => ({
                select: () => ({
                    lean: () => ({
                        exec: async () => mockUser,
                    }),
                }),
            });

            (User as any).findOneAndUpdate = () => ({
                select: () => ({
                    exec: async () => {
                        userPasswordUpdated = true;
                        return mockUser;
                    },
                }),
            });

            (OTPVerification as any).findOne = (query: any) => ({
                sort: () => ({
                    select: async () => (mockOtpRecord.status === 'pending' ? mockOtpRecord : null),
                }),
            });

            PasswordHistory.isPasswordRecentlyUsed = async () => recentlyUsedMock;
            PasswordHistory.addPasswordToHistory = async () => ({} as any);

            try {
                // ATTEMPT 1: User submits a password that is in their recent history
                await assert.rejects(
                    async () => {
                        await PasswordService.verifyPasswordReset(
                            testEmail,
                            validOTP,
                            'ReusedPassword#2026',
                            '127.0.0.1',
                            'test-agent'
                        );
                    },
                    (err: Error) => {
                        assert.equal(err.message, 'Cannot reuse any of your last 5 passwords');
                        return true;
                    }
                );

                // VERIFICATION: OTP must STILL be pending and NOT consumed!
                assert.equal(mockOtpRecord.status, 'pending', 'OTP must remain pending after password history rejection');
                assert.equal(mockOtpRecord.attempts, 0, 'OTP attempts should not increment for password policy failure');
                assert.equal(userPasswordUpdated, false, 'User password must NOT be updated');

                // ATTEMPT 2: User retries with the SAME valid OTP and a brand new password
                recentlyUsedMock = false; // Brand new password, not recently used
                const result = await PasswordService.verifyPasswordReset(
                    testEmail,
                    validOTP,
                    'BrandNewUniquePassword#2026',
                    '127.0.0.1',
                    'test-agent'
                );

                // VERIFICATION: Second attempt succeeds with the same OTP!
                assert.equal(result.success, true);
                assert.equal(mockOtpRecord.status, 'verified', 'OTP must be marked verified after successful reset');
                assert.equal(userPasswordUpdated, true, 'User password must be updated');
            } finally {
                User.findOne = origUserFindOne;
                User.findOneAndUpdate = origUserFindOneAndUpdate;
                OTPVerification.findOne = origOTPFindOne;
                PasswordHistory.isPasswordRecentlyUsed = origRecentPassword;
                PasswordHistory.addPasswordToHistory = origAddPasswordToHistory;
            }
        });

        it('should not update user password if OTP verification fails', async () => {
            const mockUser = {
                userId: 'user-xyz',
                email: 'test@example.com',
                passwordHash: 'old-hash',
                firstName: 'Test',
            };

            let userPasswordUpdated = false;

            const origUserFindOne = User.findOne;
            const origUserFindOneAndUpdate = User.findOneAndUpdate;
            const origVerifyOTP = OTPVerification.verifyOTPByType;
            const origRecentPassword = PasswordHistory.isPasswordRecentlyUsed;

            (User as any).findOne = () => ({
                select: () => ({
                    lean: () => ({
                        exec: async () => mockUser,
                    }),
                }),
            });

            (User as any).findOneAndUpdate = () => ({
                select: () => ({
                    exec: async () => {
                        userPasswordUpdated = true;
                        return mockUser;
                    },
                }),
            });

            PasswordHistory.isPasswordRecentlyUsed = async () => false;

            OTPVerification.verifyOTPByType = async () => {
                throw new Error('Invalid OTP');
            };

            try {
                await assert.rejects(
                    async () => {
                        await PasswordService.verifyPasswordReset(
                            'test@example.com',
                            '123456',
                            'ComplexStrongPwd#2026',
                            '127.0.0.1',
                            'test-agent'
                        );
                    },
                    (err: Error) => {
                        assert.equal(err.message, 'Invalid OTP');
                        return true;
                    }
                );

                assert.equal(userPasswordUpdated, false, 'User password MUST NOT be updated when OTP verification fails');
            } finally {
                User.findOne = origUserFindOne;
                User.findOneAndUpdate = origUserFindOneAndUpdate;
                OTPVerification.verifyOTPByType = origVerifyOTP;
                PasswordHistory.isPasswordRecentlyUsed = origRecentPassword;
            }
        });

        it('should reject weak password before verifying OTP, leaving OTP pending and user password unchanged', async () => {
            const mockUser = {
                userId: 'user-xyz',
                email: 'test@example.com',
                passwordHash: 'old-hash',
                firstName: 'Test',
            };

            let otpVerifyCalled = false;
            let userPasswordUpdated = false;

            const origUserFindOne = User.findOne;
            const origUserFindOneAndUpdate = User.findOneAndUpdate;
            const origVerifyOTP = OTPVerification.verifyOTPByType;

            (User as any).findOne = () => ({
                select: () => ({
                    lean: () => ({
                        exec: async () => mockUser,
                    }),
                }),
            });

            (User as any).findOneAndUpdate = () => ({
                select: () => ({
                    exec: async () => {
                        userPasswordUpdated = true;
                        return mockUser;
                    },
                }),
            });

            OTPVerification.verifyOTPByType = async () => {
                otpVerifyCalled = true;
                return { success: true, otpId: 'otp-id', verifiedAt: new Date() };
            };

            try {
                await assert.rejects(
                    async () => {
                        // 'Password123!' has zxcvbn score 1 (< 3)
                        await PasswordService.verifyPasswordReset(
                            'test@example.com',
                            '123456',
                            'Password123!',
                            '127.0.0.1',
                            'test-agent'
                        );
                    },
                    (err: Error) => {
                        assert.ok(err.message.includes('too weak'), 'Error should indicate password is too weak');
                        return true;
                    }
                );

                assert.equal(otpVerifyCalled, false, 'OTP verify MUST NOT be called when password strength fails');
                assert.equal(userPasswordUpdated, false, 'User password MUST NOT be updated on weak password');
            } finally {
                User.findOne = origUserFindOne;
                User.findOneAndUpdate = origUserFindOneAndUpdate;
                OTPVerification.verifyOTPByType = origVerifyOTP;
            }
        });
    });
});
