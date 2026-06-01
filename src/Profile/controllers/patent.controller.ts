/**
 * Patent Controller - HTTP Request Handlers
 * 
 * @module controllers/patent.controller
 * @version 1.0.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PatentService } from '@/shared/services/index.service';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
}

interface CreatePatentBody {
    title: string;
    patentNumber: string;
    patentOffice: string;
    issueDate: {
        month: number;
        day?: number;
        year: number;
    };
    inventors: Array<{
        inventorId?: string;
        inventorName: string;
        inventorProfile?: string;
    }>;
    patentStatus: 'pending' | 'granted' | 'expired' | 'abandoned';
    description?: string;
    patentUrl?: string;
}

interface UpdatePatentBody {
    title?: string;
    patentNumber?: string;
    patentOffice?: string;
    issueDate?: {
        month: number;
        day?: number;
        year: number;
    };
    inventors?: Array<{
        inventorId?: string;
        inventorName: string;
        inventorProfile?: string;
    }>;
    patentStatus?: 'pending' | 'granted' | 'expired' | 'abandoned';
    description?: string;
    patentUrl?: string;
}

// ==================== PATENT CONTROLLER ====================

class PatentController {

    /**
     * ✅ CREATE PATENT
     */
    static async createPatent(
        req: Request<{}, any, CreatePatentBody> & { user?: UserPayload },
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

            LoggerUtil.info('Create patent request received', {
                userId,
                title: req.body.title,
                patentNumber: req.body.patentNumber,
                correlationId,
            });

            const patent = await PatentService.createPatent({
                userId,
                ...req.body,
            });

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'PATENT_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            patentId: patent.patentId,
                            patentNumber: patent.patentNumber,
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
            LoggerUtil.info('Patent created successfully', {
                userId,
                patentId: patent.patentId,
                duration,
                correlationId,
            });

            ResponseUtil.created(res, { patent }, 'Patent created successfully');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Patent creation failed', {
                error: error.message,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            if (error.message === 'User account is not active') {
                ResponseUtil.forbidden(res, 'User account is not active');
                return;
            }

            if (error.message === 'Maximum patent limit (30) reached') {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            if (error.message === 'Patent number already exists') {
                ResponseUtil.conflict(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL PATENTS
     */
    static async getAllPatents(
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

            const result = await PatentService.getAllPatents(userId, includeArchived);

            ResponseUtil.success(res, result, 'Patents fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all patents failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET PATENT BY ID
     */
    static async getPatentById(
        req: Request<{ patentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { patentId } = req.params;

            if (!patentId) {
                ResponseUtil.badRequest(res, 'Patent ID is required');
                return;
            }

            const patent = await PatentService.getPatentById(patentId, req.user.userId);

            ResponseUtil.success(res, { patent }, 'Patent fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get patent by ID failed', {
                error: error.message,
                patentId: req.params.patentId,
                correlationId,
            });

            if (error.message === 'Patent not found') {
                ResponseUtil.notFound(res, 'Patent not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE PATENT
     */
    static async updatePatent(
        req: Request<{ patentId: string }, any, UpdatePatentBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { patentId } = req.params;

            if (!patentId) {
                ResponseUtil.badRequest(res, 'Patent ID is required');
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

            const patent = await PatentService.updatePatent(
                patentId,
                req.user.userId,
                req.body
            );

            ResponseUtil.success(res, { patent }, 'Patent updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update patent failed', {
                error: error.message,
                patentId: req.params.patentId,
                correlationId,
            });

            if (error.message === 'Patent not found') {
                ResponseUtil.notFound(res, 'Patent not found');
                return;
            }

            if (error.message === 'Patent number already exists') {
                ResponseUtil.conflict(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE PATENT
     */
    static async deletePatent(
        req: Request<{ patentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { patentId } = req.params;
            const permanent = req.query.permanent === 'true';

            if (!patentId) {
                ResponseUtil.badRequest(res, 'Patent ID is required');
                return;
            }

            const result = await PatentService.deletePatent(
                patentId,
                req.user.userId,
                permanent
            );

            ResponseUtil.success(res, result, 'Patent deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete patent failed', {
                error: error.message,
                patentId: req.params.patentId,
                correlationId,
            });

            if (error.message === 'Patent not found') {
                ResponseUtil.notFound(res, 'Patent not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE PATENT
     */
    static async archivePatent(
        req: Request<{ patentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { patentId } = req.params;

            const result = await PatentService.archivePatent(patentId, req.user.userId);

            ResponseUtil.success(res, result, 'Patent archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive patent failed', {
                error: error.message,
                patentId: req.params.patentId,
                correlationId,
            });

            if (error.message === 'Patent not found') {
                ResponseUtil.notFound(res, 'Patent not found');
                return;
            }

            if (error.message === 'Patent is already archived') {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE PATENT
     */
    static async restorePatent(
        req: Request<{ patentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { patentId } = req.params;

            const result = await PatentService.restorePatent(patentId, req.user.userId);

            ResponseUtil.success(res, result, 'Patent restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore patent failed', {
                error: error.message,
                patentId: req.params.patentId,
                correlationId,
            });

            if (error.message === 'Patent not found') {
                ResponseUtil.notFound(res, 'Patent not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REORDER PATENTS
     */
    static async reorderPatents(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { reorderData } = req.body;

            if (!reorderData || !Array.isArray(reorderData)) {
                ResponseUtil.validationError(res, ['Reorder data is required'], 'Missing required fields');
                return;
            }

            const result = await PatentService.reorderPatents(req.user.userId, reorderData);

            ResponseUtil.success(res, result, 'Patents reordered successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Reorder patents failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPLOAD PATENT DOCUMENT
     */
    static async uploadPatentDocument(
        req: Request<{ patentId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            if (!req.file) {
                ResponseUtil.badRequest(res, 'No file uploaded');
                return;
            }

            const { patentId } = req.params;

            const result = await PatentService.uploadPatentDocument(
                patentId,
                req.user.userId,
                req.file
            );

            ResponseUtil.created(res, result, 'Patent document uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Upload patent document failed', {
                error: error.message,
                patentId: req.params.patentId,
                correlationId,
            });

            if (error.message === 'Patent not found') {
                ResponseUtil.notFound(res, 'Patent not found');
                return;
            }

            if (error.message.includes('Maximum')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE PATENT DOCUMENT
     */
    static async deletePatentDocument(
        req: Request<{ patentId: string; mediaId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { patentId, mediaId } = req.params;

            const result = await PatentService.deletePatentDocument(
                patentId,
                req.user.userId,
                mediaId
            );

            ResponseUtil.success(res, result, 'Patent document deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete patent document failed', {
                error: error.message,
                patentId: req.params.patentId,
                mediaId: req.params.mediaId,
                correlationId,
            });

            if (error.message === 'Patent not found' || error.message === 'Patent document not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default PatentController;