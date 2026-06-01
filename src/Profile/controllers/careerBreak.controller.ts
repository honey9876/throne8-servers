/**
 * Career Break Controller - HTTP Request Handlers
 * Complete CRUD operations for career breaks
 * 
 * @module controllers/careerBreak.controller
 * @version 1.0.0
 */

import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { CareerBreakService } from '@/shared/services/index.service';
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

interface CreateCareerBreakBody {
    breakType: 'Caregiving' | 'Personal travel' | 'Career transition' | 'Layoff' |
    'Full-time parenting' | 'Sabbatical' | 'Health & well-being' |
    'Bereavement' | 'Gap year' | 'Relocation' | 'Retirement' |
    'Volunteer work' | 'Other';
    startDate: string;
    endDate?: string | null;
    description?: string;
    displayOnProfile?: boolean;
    notifyNetwork?: boolean;
    visibility?: 'public' | 'connections' | 'private' | 'me_only';
}

interface UpdateCareerBreakBody {
    breakType?: 'Caregiving' | 'Personal travel' | 'Career transition' | 'Layoff' |
    'Full-time parenting' | 'Sabbatical' | 'Health & well-being' |
    'Bereavement' | 'Gap year' | 'Relocation' | 'Retirement' |
    'Volunteer work' | 'Other';
    startDate?: string;
    endDate?: string | null;
    description?: string;
    displayOnProfile?: boolean;
    notifyNetwork?: boolean;
    visibility?: 'public' | 'connections' | 'private' | 'me_only';
}

// ==================== CAREER BREAK CONTROLLER CLASS ====================

class CareerBreakController {

    /**
     * ✅ CREATE NEW CAREER BREAK
     * POST /api/v1/career-break
     */
    static async createCareerBreak(
        req: Request<{}, any, CreateCareerBreakBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                LoggerUtil.warn('Create career break failed - No userId', { correlationId });
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const ipAddress = req.ip || 'unknown';

            LoggerUtil.info('Create career break request received', {
                userId,
                breakType: req.body.breakType,
                correlationId,
            });

            const { breakType, startDate, endDate, description, displayOnProfile, notifyNetwork, visibility } = req.body;

            if (!breakType) {
                ResponseUtil.validationError(res, ['Break type is required'], 'Missing required fields');
                return;
            }

            if (!startDate) {
                ResponseUtil.validationError(res, ['Start date is required'], 'Missing required fields');
                return;
            }

            const careerBreak = await CareerBreakService.createCareerBreak({
                userId,
                breakType,
                startDate,
                endDate: endDate || null,
                description,
                displayOnProfile,
                notifyNetwork,
                visibility,
            });

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'CAREER_BREAK_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            careerBreakId: careerBreak.careerBreakId,
                            breakType: careerBreak.breakType,
                            isOngoing: careerBreak.isOngoing,
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
            LoggerUtil.performance('career_break_creation', duration, {
                userId,
                careerBreakId: careerBreak.careerBreakId,
                correlationId,
            });

            ResponseUtil.created(res, { careerBreak }, 'Career break created successfully');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Career break creation failed', {
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
                        action: 'CAREER_BREAK_CREATE_FAILED',
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
                    ? 'Career break creation failed. Please try again.'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ GET ALL CAREER BREAKS
     * GET /api/v1/career-break
     */
    static async getAllCareerBreaks(
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

            LoggerUtil.info('Get all career breaks request', {
                userId,
                includeArchived,
                correlationId,
            });

            const result = await CareerBreakService.getAllCareerBreaks(userId, includeArchived);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Career breaks fetched', {
                userId,
                count: result.total,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Career breaks fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all career breaks failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET SINGLE CAREER BREAK
     * GET /api/v1/career-break/:careerBreakId
     */
    static async getCareerBreakById(
        req: Request<{ careerBreakId: string }> & { user?: UserPayload },
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
            const { careerBreakId } = req.params;

            if (!careerBreakId) {
                ResponseUtil.badRequest(res, 'Career break ID is required');
                return;
            }

            LoggerUtil.info('Get career break by ID request', {
                userId,
                careerBreakId,
                correlationId,
            });

            const careerBreak = await CareerBreakService.getCareerBreakById(careerBreakId, userId);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Career break fetched', {
                userId,
                careerBreakId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { careerBreak }, 'Career break fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get career break by ID failed', {
                error: error.message,
                careerBreakId: req.params.careerBreakId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Career break not found') {
                ResponseUtil.notFound(res, 'Career break not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE CAREER BREAK
     * PUT /api/v1/career-break/:careerBreakId
     */
    static async updateCareerBreak(
        req: Request<{ careerBreakId: string }, any, UpdateCareerBreakBody> & { user?: UserPayload },
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
            const { careerBreakId } = req.params;
            const ipAddress = req.ip || 'unknown';

            if (!careerBreakId) {
                ResponseUtil.badRequest(res, 'Career break ID is required');
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

            LoggerUtil.info('Update career break request', {
                userId,
                careerBreakId,
                updates: Object.keys(req.body),
                correlationId,
            });

            const careerBreak = await CareerBreakService.updateCareerBreak(
                careerBreakId,
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
                        action: 'CAREER_BREAK_UPDATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            careerBreakId,
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
            LoggerUtil.info('Career break updated', {
                userId,
                careerBreakId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { careerBreak }, 'Career break updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update career break failed', {
                error: error.message,
                careerBreakId: req.params.careerBreakId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Career break not found') {
                ResponseUtil.notFound(res, 'Career break not found');
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
     * ✅ DELETE CAREER BREAK
     * DELETE /api/v1/career-break/:careerBreakId
     */
    static async deleteCareerBreak(
        req: Request<{ careerBreakId: string }> & { user?: UserPayload },
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
            const { careerBreakId } = req.params;
            const permanent = req.query.permanent === 'true';
            const ipAddress = req.ip || 'unknown';

            if (!careerBreakId) {
                ResponseUtil.badRequest(res, 'Career break ID is required');
                return;
            }

            LoggerUtil.info('Delete career break request', {
                userId,
                careerBreakId,
                permanent,
                correlationId,
            });

            const result = await CareerBreakService.deleteCareerBreak(careerBreakId, userId, permanent);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'CAREER_BREAK_DELETED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: permanent ? 'HIGH' : 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: { careerBreakId, permanent, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Career break deleted', {
                userId,
                careerBreakId,
                permanent,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Career break deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete career break failed', {
                error: error.message,
                careerBreakId: req.params.careerBreakId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Career break not found') {
                ResponseUtil.notFound(res, 'Career break not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE CAREER BREAK
     * POST /api/v1/career-break/:careerBreakId/archive
     */
    static async archiveCareerBreak(
        req: Request<{ careerBreakId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { careerBreakId } = req.params;

            const result = await CareerBreakService.archiveCareerBreak(careerBreakId, userId);

            LoggerUtil.info('Career break archived', { userId, careerBreakId, correlationId });

            ResponseUtil.success(res, result, 'Career break archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive career break failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Career break not found') {
                ResponseUtil.notFound(res, 'Career break not found');
                return;
            }

            if (error.message === 'Career break is already archived') {
                ResponseUtil.badRequest(res, 'Career break is already archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE CAREER BREAK
     * POST /api/v1/career-break/:careerBreakId/restore
     */
    static async restoreCareerBreak(
        req: Request<{ careerBreakId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { careerBreakId } = req.params;

            const result = await CareerBreakService.restoreCareerBreak(careerBreakId, userId);

            LoggerUtil.info('Career break restored', { userId, careerBreakId, correlationId });

            ResponseUtil.success(res, result, 'Career break restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore career break failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Career break not found') {
                ResponseUtil.notFound(res, 'Career break not found');
                return;
            }

            if (error.message === 'Career break is not archived') {
                ResponseUtil.badRequest(res, 'Career break is not archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default CareerBreakController;