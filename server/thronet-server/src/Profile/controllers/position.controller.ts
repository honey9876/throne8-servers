/**
 * Position Controller
 * 
 * @module controllers/position.controller
 * @version 1.0.0
 */

import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { PositionService } from '@/shared/services/index.service';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
}

interface CreatePositionBody {
    jobTitle: string;
    employmentType: 'full-time' | 'part-time' | 'contract' | 'freelance' | 'internship' | 'self-employed' | 'seasonal' | 'temporary';
    companyName: string;
    location?: string;
    locationType: 'on-site' | 'remote' | 'hybrid';
    startDate: string;
    endDate?: string | null;
    currentlyWorking?: boolean;
    industry?: string;
    description?: string;
    updateProfileHeadline?: boolean;
    notifyNetwork?: boolean;
    skillIds?: string[];
}

// ==================== POSITION CONTROLLER ====================

class PositionController {

    /**
     * ✅ CREATE POSITION
     */
    static async createPosition(
        req: Request<{}, any, CreatePositionBody> & { user?: UserPayload },
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

            const position = await PositionService.createPosition({
                userId,
                ...req.body,
            });

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'POSITION_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            positionId: position.positionId,
                            jobTitle: position.jobTitle,
                            companyName: position.companyName,
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
            LoggerUtil.performance('position_creation', duration, {
                userId,
                positionId: position.positionId,
                correlationId,
            });

            ResponseUtil.created(res, { position }, 'Position created successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Position creation failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL POSITIONS
     */
    static async getAllPositions(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const includeArchived = req.query.includeArchived === 'true';

            const result = await PositionService.getAllPositions(userId, includeArchived);

            ResponseUtil.success(res, result, 'Positions fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all positions failed', {
                error: error.message,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET POSITION BY ID
     */
    static async getPositionById(
        req: Request<{ positionId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { positionId } = req.params;

            const position = await PositionService.getPositionById(positionId, userId);

            ResponseUtil.success(res, { position }, 'Position fetched successfully');
            return;

        } catch (error: any) {
            if (error.message === 'Position not found') {
                ResponseUtil.notFound(res, 'Position not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE POSITION
     */
    static async updatePosition(
        req: Request<{ positionId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { positionId } = req.params;

            const position = await PositionService.updatePosition(
                positionId,
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
                        action: 'POSITION_UPDATED',
                        ipAddress: req.ip || 'unknown',
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            positionId,
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

            ResponseUtil.success(res, { position }, 'Position updated successfully');
            return;

        } catch (error: any) {
            if (error.message === 'Position not found') {
                ResponseUtil.notFound(res, 'Position not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE POSITION (SOFT)
     */
    static async deletePosition(
        req: Request<{ positionId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { positionId } = req.params;

            const result = await PositionService.deletePosition(positionId, userId);

            ResponseUtil.success(res, result, 'Position deleted successfully');
            return;

        } catch (error: any) {
            if (error.message === 'Position not found') {
                ResponseUtil.notFound(res, 'Position not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE POSITION (PERMANENT)
     */
    static async deletePositionPermanently(
        req: Request<{ positionId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { positionId } = req.params;

            const result = await PositionService.deletePositionPermanently(positionId, userId);

            ResponseUtil.success(res, result, 'Position permanently deleted');
            return;

        } catch (error: any) {
            if (error.message === 'Position not found') {
                ResponseUtil.notFound(res, 'Position not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE POSITION
     */
    static async archivePosition(
        req: Request<{ positionId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const result = await PositionService.archivePosition(
                req.params.positionId,
                req.user.userId
            );

            ResponseUtil.success(res, result, 'Position archived successfully');
            return;

        } catch (error: any) {
            if (error.message === 'Position not found') {
                ResponseUtil.notFound(res, 'Position not found');
                return;
            }

            if (error.message === 'Position is already archived') {
                ResponseUtil.badRequest(res, 'Position is already archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE POSITION
     */
    static async restorePosition(
        req: Request<{ positionId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const result = await PositionService.restorePosition(
                req.params.positionId,
                req.user.userId
            );

            ResponseUtil.success(res, result, 'Position restored successfully');
            return;

        } catch (error: any) {
            if (error.message === 'Position not found') {
                ResponseUtil.notFound(res, 'Position not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REORDER POSITIONS
     */
    static async reorderPositions(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { positionIds } = req.body;

            if (!positionIds || !Array.isArray(positionIds)) {
                ResponseUtil.badRequest(res, 'positionIds array is required');
                return;
            }

            const result = await PositionService.reorderPositions(
                req.user.userId,
                positionIds
            );

            ResponseUtil.success(res, result, 'Positions reordered successfully');
            return;

        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ADD MEDIA ATTACHMENT
     */
    static async addMediaAttachment(
        req: Request<{ positionId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const position = await PositionService.addMediaAttachment(
                req.params.positionId,
                req.user.userId,
                req.body
            );

            ResponseUtil.success(res, { position }, 'Media attachment added successfully');
            return;

        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REMOVE MEDIA ATTACHMENT
     */
    static async removeMediaAttachment(
        req: Request<{ positionId: string; attachmentIndex: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const attachmentIndex = parseInt(req.params.attachmentIndex);

            if (isNaN(attachmentIndex)) {
                ResponseUtil.badRequest(res, 'Invalid attachment index');
                return;
            }

            const position = await PositionService.removeMediaAttachment(
                req.params.positionId,
                req.user.userId,
                attachmentIndex
            );

            ResponseUtil.success(res, { position }, 'Media attachment removed successfully');
            return;

        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET TOTAL EXPERIENCE
     */
    static async getTotalExperience(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const totalExperience = await PositionService.getTotalExperience(req.user.userId);

            ResponseUtil.success(res, { totalExperience }, 'Total experience calculated successfully');
            return;

        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET EMPLOYMENT GAPS
     */
    static async getEmploymentGaps(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const gaps = await PositionService.getEmploymentGaps(req.user.userId);

            ResponseUtil.success(res, gaps, 'Employment gaps detected successfully');
            return;

        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET CURRENT POSITION
     */
    static async getCurrentPosition(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const position = await PositionService.getCurrentPosition(req.user.userId);

            ResponseUtil.success(res, { position }, 'Current position fetched successfully');
            return;

        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ SHARE POSITION UPDATE
     */
    static async sharePositionUpdate(
        req: Request<{ positionId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { message } = req.body;

            const shareData = await PositionService.sharePositionUpdate(
                req.params.positionId,
                req.user.userId,
                message
            );

            ResponseUtil.success(res, { shareData }, 'Position update shared successfully');
            return;

        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default PositionController;