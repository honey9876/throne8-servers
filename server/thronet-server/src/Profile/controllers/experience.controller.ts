/**
 * Experience Controller - HTTP Request Handlers
 * Manages professional experience endpoints
 * 
 * @module controllers/experience.controller
 * @version 1.0.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ExperienceService } from '@/shared/services/index.service';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import Constants from '@/shared/constants.util';

const logger = LoggerUtil;

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
    sessionId?: string;
    deviceId?: string;
}

interface CreateExperienceBody {
    currentPosition: string;
    companyName: string;
    description: string;
    startDate: string;
    endDate?: string;
    currentlyWorking: boolean;
    keyAchievements?: string[];
}

interface UpdateExperienceBody {
    currentPosition?: string;
    companyName?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    currentlyWorking?: boolean;
    keyAchievements?: string[];
}

// ==================== EXPERIENCE CONTROLLER ====================

class ExperienceController {

    /**
     * ✅ CREATE EXPERIENCE
     * POST /api/v1/experience
     * @access Private
     */
    static async createExperience(
        req: Request<{}, any, CreateExperienceBody> & { user?: UserPayload },
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
            const ipAddress = req.ip || 'unknown';

            logger.info('Create experience request', {
                userId,
                position: req.body.currentPosition,
                company: req.body.companyName,
                correlationId,
            });

            const experience = await ExperienceService.createExperience(userId, req.body);

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: Constants.AUDIT_ACTIONS.EXPERIENCE_CREATED,
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            experienceId: experience.experienceId,
                            position: experience.currentPosition,
                            company: experience.companyName,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    logger.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            logger.info('Experience created successfully', {
                experienceId: experience.experienceId,
                userId,
                duration,
                correlationId,
            });

            ResponseUtil.created(
                res,
                { experience },
                'Experience created successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            logger.error('Create experience failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId: req.user?.userId || null,
                        action: Constants.AUDIT_ACTIONS.EXPERIENCE_CREATE_FAILED,
                        ipAddress: req.ip || 'unknown',
                        status: 'FAILURE',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            error: error.message,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    logger.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            if (error.message.includes('Maximum') || error.message.includes('required')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Experience creation failed'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ GET ALL EXPERIENCES
     * GET /api/v1/experience
     * @access Private
     */
    static async getAllExperiences(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const includeArchived = req.query.includeArchived === 'true';

            const result = await ExperienceService.getAllExperiences(userId, includeArchived);

            logger.info('All experiences fetched', {
                userId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Experiences fetched successfully'
            );
            return;

        } catch (error: any) {
            logger.error('Get all experiences failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL EXPERIENCES BY USER ID (PUBLIC)
     * GET /api/v1/experience/get-all-experiences/:userId
     * @access Public
     */
    static async getAllExperiencesByUserId(
        req: Request<{ userId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { userId } = req.params;

            if (!userId) {
                ResponseUtil.badRequest(res, 'User ID is required');
                return;
            }

            const includeArchived = req.query.includeArchived === 'true';

            const result = await ExperienceService.getAllExperiences(userId, includeArchived);

            logger.info('All experiences fetched (public)', {
                userId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Experiences fetched successfully'
            );
            return;

        } catch (error: any) {
            logger.error('Get all experiences by userId failed', {
                error: error.message,
                userId: req.params.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET EXPERIENCE BY ID
     * GET /api/v1/experience/:experienceId
     * @access Private
     */
    static async getExperienceById(
        req: Request<{ experienceId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { experienceId } = req.params;

            if (!experienceId) {
                ResponseUtil.badRequest(res, 'Experience ID is required');
                return;
            }

            const experience = await ExperienceService.getExperienceById(experienceId, userId);

            ResponseUtil.success(
                res,
                { experience },
                'Experience fetched successfully'
            );
            return;

        } catch (error: any) {
            logger.error('Get experience failed', {
                error: error.message,
                experienceId: req.params.experienceId,
                correlationId,
            });

            if (error.message === 'Experience not found') {
                ResponseUtil.notFound(res, 'Experience not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE EXPERIENCE
     * PUT /api/v1/experience/:experienceId
     * @access Private
     */
    static async updateExperience(
        req: Request<{ experienceId: string }, any, UpdateExperienceBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { experienceId } = req.params;
            const ipAddress = req.ip || 'unknown';

            if (!experienceId) {
                ResponseUtil.badRequest(res, 'Experience ID is required');
                return;
            }

            const experience = await ExperienceService.updateExperience(
                experienceId,
                userId,
                req.body
            );

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'EXPERIENCE_UPDATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            experienceId,
                            updatedFields: Object.keys(req.body),
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    logger.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            ResponseUtil.success(
                res,
                { experience },
                'Experience updated successfully'
            );
            return;

        } catch (error: any) {
            logger.error('Update experience failed', {
                error: error.message,
                experienceId: req.params.experienceId,
                correlationId,
            });

            if (error.message === 'Experience not found') {
                ResponseUtil.notFound(res, 'Experience not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE EXPERIENCE
     * DELETE /api/v1/experience/:experienceId
     * @access Private
     */
    static async deleteExperience(
        req: Request<{ experienceId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { experienceId } = req.params;
            const permanent = req.query.permanent === 'true';
            const ipAddress = req.ip || 'unknown';

            const result = await ExperienceService.deleteExperience(
                experienceId,
                userId,
                permanent
            );

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: permanent ? 'EXPERIENCE_DELETED_PERMANENT' : 'EXPERIENCE_DELETED_SOFT',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: permanent ? 'HIGH' : 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            experienceId,
                            permanent,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    logger.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            ResponseUtil.success(
                res,
                result,
                `Experience ${permanent ? 'permanently ' : ''}deleted successfully`
            );
            return;

        } catch (error: any) {
            logger.error('Delete experience failed', {
                error: error.message,
                experienceId: req.params.experienceId,
                correlationId,
            });

            if (error.message === 'Experience not found') {
                ResponseUtil.notFound(res, 'Experience not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE EXPERIENCE
     * POST /api/v1/experience/:experienceId/archive
     * @access Private
     */
    static async archiveExperience(
        req: Request<{ experienceId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { experienceId } = req.params;

            const experience = await ExperienceService.archiveExperience(experienceId, userId);

            ResponseUtil.success(
                res,
                { experience },
                'Experience archived successfully'
            );
            return;

        } catch (error: any) {
            logger.error('Archive experience failed', {
                error: error.message,
                correlationId,
            });

            if (error.message.includes('not found')) {
                ResponseUtil.notFound(res, error.message);
                return;
            }

            if (error.message.includes('already archived')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE EXPERIENCE
     * POST /api/v1/experience/:experienceId/restore
     * @access Private
     */
    static async restoreExperience(
        req: Request<{ experienceId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { experienceId } = req.params;

            const experience = await ExperienceService.restoreExperience(experienceId, userId);

            ResponseUtil.success(
                res,
                { experience },
                'Experience restored successfully'
            );
            return;

        } catch (error: any) {
            logger.error('Restore experience failed', {
                error: error.message,
                correlationId,
            });

            if (error.message.includes('not found')) {
                ResponseUtil.notFound(res, error.message);
                return;
            }

            if (error.message.includes('not archived')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default ExperienceController;