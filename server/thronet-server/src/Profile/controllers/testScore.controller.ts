/**
 * Test Score Controller - HTTP Request Handlers
 * Complete CRUD operations for test scores with reordering
 * 
 * @module controllers/testScore.controller
 * @version 1.0.0
 */

import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { TestScoreService } from '@/shared/services/index.service';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
    sessionId?: string;
    deviceId?: string;
}

interface CreateTestScoreBody {
    testName: 'GRE' | 'GMAT' | 'TOEFL' | 'IELTS' | 'SAT' | 'ACT' | 'LSAT' | 'MCAT' |
    'CAT' | 'JEE' | 'NEET' | 'GATE' | 'UPSC' | 'PTE' | 'Duolingo English Test' | 'Other';
    score: string;
    testDate: string;
    description?: string;
    associatedSchool?: string;
    validityYears?: number;
}

interface UpdateTestScoreBody {
    testName?: 'GRE' | 'GMAT' | 'TOEFL' | 'IELTS' | 'SAT' | 'ACT' | 'LSAT' | 'MCAT' |
    'CAT' | 'JEE' | 'NEET' | 'GATE' | 'UPSC' | 'PTE' | 'Duolingo English Test' | 'Other';
    score?: string;
    testDate?: string;
    description?: string;
    associatedSchool?: string;
    validityYears?: number;
}

interface ReorderTestScoresBody {
    orderedIds: string[];
}

// ==================== TEST SCORE CONTROLLER CLASS ====================

class TestScoreController {

    /**
     * ✅ CREATE NEW TEST SCORE
     * POST /api/v1/test-score
     */
    static async createTestScore(
        req: Request<{}, any, CreateTestScoreBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                LoggerUtil.warn('Create test score failed - No userId', { correlationId });
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const ipAddress = req.ip || 'unknown';

            LoggerUtil.info('Create test score request received', {
                userId,
                testName: req.body.testName,
                correlationId,
            });

            const { testName, score, testDate, description, associatedSchool, validityYears } = req.body;

            if (!testName) {
                ResponseUtil.validationError(res, ['Test name is required'], 'Missing required fields');
                return;
            }

            if (!score) {
                ResponseUtil.validationError(res, ['Score is required'], 'Missing required fields');
                return;
            }

            if (!testDate) {
                ResponseUtil.validationError(res, ['Test date is required'], 'Missing required fields');
                return;
            }

            const testScore = await TestScoreService.createTestScore({
                userId,
                testName,
                score,
                testDate,
                description,
                associatedSchool,
                validityYears,
            });

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'TEST_SCORE_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            testScoreId: testScore.testScoreId,
                            testName: testScore.testName,
                            correlationId,
                            duration: Date.now() - startTime,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.performance('test_score_creation', duration, {
                userId,
                testScoreId: testScore.testScoreId,
                correlationId,
            });

            ResponseUtil.created(res, { testScore }, 'Test score created successfully');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Test score creation failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            // Audit log for error
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId: req.user?.userId || null,
                        action: 'TEST_SCORE_CREATE_FAILED',
                        ipAddress: req.ip || 'unknown',
                        status: 'FAILURE',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: { error: error.message, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            if (error.message === 'User account is not active') {
                ResponseUtil.forbidden(res, 'User account is not active');
                return;
            }

            if (error.message.includes('required') || error.message.includes('must be') || error.message.includes('cannot')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Test score creation failed. Please try again.'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ GET ALL TEST SCORES
     * GET /api/v1/test-score
     */
    static async getAllTestScores(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const includeArchived = req.query.includeArchived === 'true';

            LoggerUtil.info('Get all test scores request', {
                userId,
                includeArchived,
                correlationId,
            });

            const result = await TestScoreService.getAllTestScores(userId, includeArchived);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Test scores fetched', {
                userId,
                count: result.total,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Test scores fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all test scores failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET SINGLE TEST SCORE
     * GET /api/v1/test-score/:testScoreId
     */
    static async getTestScoreById(
        req: Request<{ testScoreId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { testScoreId } = req.params;

            if (!testScoreId) {
                ResponseUtil.badRequest(res, 'Test score ID is required');
                return;
            }

            LoggerUtil.info('Get test score by ID request', {
                userId,
                testScoreId,
                correlationId,
            });

            const testScore = await TestScoreService.getTestScoreById(testScoreId, userId);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Test score fetched', {
                userId,
                testScoreId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { testScore }, 'Test score fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get test score by ID failed', {
                error: error.message,
                testScoreId: req.params.testScoreId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Test score not found') {
                ResponseUtil.notFound(res, 'Test score not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE TEST SCORE
     * PUT /api/v1/test-score/:testScoreId
     */
    static async updateTestScore(
        req: Request<{ testScoreId: string }, any, UpdateTestScoreBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { testScoreId } = req.params;
            const ipAddress = req.ip || 'unknown';

            if (!testScoreId) {
                ResponseUtil.badRequest(res, 'Test score ID is required');
                return;
            }

            if (Object.keys(req.body).length === 0) {
                ResponseUtil.validationError(
                    res,
                    ['At least one field must be provided'],
                    'No fields to update'
                );
                return;
            }

            LoggerUtil.info('Update test score request', {
                userId,
                testScoreId,
                updates: Object.keys(req.body),
                correlationId,
            });

            const testScore = await TestScoreService.updateTestScore(
                testScoreId,
                userId,
                req.body
            );

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'TEST_SCORE_UPDATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            testScoreId,
                            updatedFields: Object.keys(req.body),
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Test score updated', {
                userId,
                testScoreId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { testScore }, 'Test score updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update test score failed', {
                error: error.message,
                testScoreId: req.params.testScoreId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Test score not found') {
                ResponseUtil.notFound(res, 'Test score not found');
                return;
            }

            if (error.message.includes('required') || error.message.includes('must be')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE TEST SCORE
     * DELETE /api/v1/test-score/:testScoreId
     */
    static async deleteTestScore(
        req: Request<{ testScoreId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { testScoreId } = req.params;
            const permanent = req.query.permanent === 'true';
            const ipAddress = req.ip || 'unknown';

            if (!testScoreId) {
                ResponseUtil.badRequest(res, 'Test score ID is required');
                return;
            }

            LoggerUtil.info('Delete test score request', {
                userId,
                testScoreId,
                permanent,
                correlationId,
            });

            const result = await TestScoreService.deleteTestScore(testScoreId, userId, permanent);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'TEST_SCORE_DELETED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: permanent ? 'HIGH' : 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: { testScoreId, permanent, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Test score deleted', {
                userId,
                testScoreId,
                permanent,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Test score deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete test score failed', {
                error: error.message,
                testScoreId: req.params.testScoreId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Test score not found') {
                ResponseUtil.notFound(res, 'Test score not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE TEST SCORE
     * POST /api/v1/test-score/:testScoreId/archive
     */
    static async archiveTestScore(
        req: Request<{ testScoreId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { testScoreId } = req.params;

            const result = await TestScoreService.archiveTestScore(testScoreId, userId);

            LoggerUtil.info('Test score archived', { userId, testScoreId, correlationId });

            ResponseUtil.success(res, result, 'Test score archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive test score failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Test score not found') {
                ResponseUtil.notFound(res, 'Test score not found');
                return;
            }

            if (error.message === 'Test score is already archived') {
                ResponseUtil.badRequest(res, 'Test score is already archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE TEST SCORE
     * POST /api/v1/test-score/:testScoreId/restore
     */
    static async restoreTestScore(
        req: Request<{ testScoreId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { testScoreId } = req.params;

            const result = await TestScoreService.restoreTestScore(testScoreId, userId);

            LoggerUtil.info('Test score restored', { userId, testScoreId, correlationId });

            ResponseUtil.success(res, result, 'Test score restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore test score failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Test score not found') {
                ResponseUtil.notFound(res, 'Test score not found');
                return;
            }

            if (error.message === 'Test score is not archived') {
                ResponseUtil.badRequest(res, 'Test score is not archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REORDER TEST SCORES
     * POST /api/v1/test-score/reorder
     */
    static async reorderTestScores(
        req: Request<{}, any, ReorderTestScoresBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { orderedIds } = req.body;
            const ipAddress = req.ip || 'unknown';

            if (!orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0) {
                ResponseUtil.validationError(
                    res,
                    ['orderedIds must be a non-empty array'],
                    'Invalid request body'
                );
                return;
            }

            LoggerUtil.info('Reorder test scores request', {
                userId,
                count: orderedIds.length,
                correlationId,
            });

            const result = await TestScoreService.reorderTestScores(userId, orderedIds);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'TEST_SCORE_REORDERED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            reorderedCount: orderedIds.length,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Test scores reordered', {
                userId,
                count: orderedIds.length,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Test scores reordered successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Reorder test scores failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message.includes('Invalid')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default TestScoreController;