/**
 * Honor Controller - HTTP Request Handlers for Honors & Awards
 * 
 * @module controllers/honor.controller
 * @version 1.0.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { HonorService } from '@/shared/services/index.service';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
}

interface CreateHonorBody {
    title: string;
    issuer: string;
    dateReceived: {
        month: number;
        year: number;
    };
    description?: string;
    category: 'academic' | 'professional' | 'sports' | 'community_service' | 'cultural' | 'research' | 'leadership' | 'other';
    associatedWith?: {
        associationType: 'school' | 'company';
        associationId?: string;
        associationName: string;
    };
    visibility?: 'public' | 'connections';
}

interface UpdateHonorBody {
    title?: string;
    issuer?: string;
    dateReceived?: {
        month: number;
        year: number;
    };
    description?: string;
    category?: 'academic' | 'professional' | 'sports' | 'community_service' | 'cultural' | 'research' | 'leadership' | 'other';
    associatedWith?: {
        associationType: 'school' | 'company';
        associationId?: string;
        associationName: string;
    };
    visibility?: 'public' | 'connections';
}

// ==================== HONOR CONTROLLER ====================

class HonorController {

    /**
     * ✅ CREATE HONOR
     */
    static async createHonor(
        req: Request<{}, any, CreateHonorBody> & { user?: UserPayload },
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

            LoggerUtil.info('Create honor request received', {
                userId,
                title: req.body.title,
                correlationId,
            });

            const honor = await HonorService.createHonor({
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
                        action: 'HONOR_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            honorId: honor.honorId,
                            title: honor.title,
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
            LoggerUtil.info('Honor created successfully', {
                userId,
                honorId: honor.honorId,
                duration,
                correlationId,
            });

            ResponseUtil.created(res, { honor }, 'Honor created successfully');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Honor creation failed', {
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

            if (error.message === 'Maximum honor limit (100) reached') {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL HONORS
     */
    static async getAllHonors(
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

            const result = await HonorService.getAllHonors(userId, includeArchived);

            ResponseUtil.success(res, result, 'Honors fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all honors failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET HONOR BY ID
     */
    static async getHonorById(
        req: Request<{ honorId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { honorId } = req.params;

            if (!honorId) {
                ResponseUtil.badRequest(res, 'Honor ID is required');
                return;
            }

            const honor = await HonorService.getHonorById(honorId, req.user.userId);

            ResponseUtil.success(res, { honor }, 'Honor fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get honor by ID failed', {
                error: error.message,
                honorId: req.params.honorId,
                correlationId,
            });

            if (error.message === 'Honor not found') {
                ResponseUtil.notFound(res, 'Honor not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE HONOR
     */
    static async updateHonor(
        req: Request<{ honorId: string }, any, UpdateHonorBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { honorId } = req.params;

            if (!honorId) {
                ResponseUtil.badRequest(res, 'Honor ID is required');
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

            const honor = await HonorService.updateHonor(
                honorId,
                req.user.userId,
                req.body
            );

            ResponseUtil.success(res, { honor }, 'Honor updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update honor failed', {
                error: error.message,
                honorId: req.params.honorId,
                correlationId,
            });

            if (error.message === 'Honor not found') {
                ResponseUtil.notFound(res, 'Honor not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE HONOR
     */
    static async deleteHonor(
        req: Request<{ honorId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { honorId } = req.params;
            const permanent = req.query.permanent === 'true';

            if (!honorId) {
                ResponseUtil.badRequest(res, 'Honor ID is required');
                return;
            }

            const result = await HonorService.deleteHonor(
                honorId,
                req.user.userId,
                permanent
            );

            ResponseUtil.success(res, result, 'Honor deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete honor failed', {
                error: error.message,
                honorId: req.params.honorId,
                correlationId,
            });

            if (error.message === 'Honor not found') {
                ResponseUtil.notFound(res, 'Honor not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE HONOR
     */
    static async archiveHonor(
        req: Request<{ honorId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { honorId } = req.params;

            const result = await HonorService.archiveHonor(honorId, req.user.userId);

            ResponseUtil.success(res, result, 'Honor archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive honor failed', {
                error: error.message,
                honorId: req.params.honorId,
                correlationId,
            });

            if (error.message === 'Honor not found') {
                ResponseUtil.notFound(res, 'Honor not found');
                return;
            }

            if (error.message === 'Honor is already archived') {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE HONOR
     */
    static async restoreHonor(
        req: Request<{ honorId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { honorId } = req.params;

            const result = await HonorService.restoreHonor(honorId, req.user.userId);

            ResponseUtil.success(res, result, 'Honor restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore honor failed', {
                error: error.message,
                honorId: req.params.honorId,
                correlationId,
            });

            if (error.message === 'Honor not found') {
                ResponseUtil.notFound(res, 'Honor not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ PIN HONOR
     */
    static async pinHonor(
        req: Request<{ honorId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { honorId } = req.params;
            const { pinnedOrder } = req.body;

            if (!pinnedOrder) {
                ResponseUtil.validationError(res, ['Pinned order is required'], 'Missing required fields');
                return;
            }

            const result = await HonorService.pinHonor(
                honorId,
                req.user.userId,
                pinnedOrder
            );

            ResponseUtil.success(res, result, 'Honor pinned successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Pin honor failed', {
                error: error.message,
                honorId: req.params.honorId,
                correlationId,
            });

            if (error.message === 'Honor not found') {
                ResponseUtil.notFound(res, 'Honor not found');
                return;
            }

            if (error.message.includes('Pinned order')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UNPIN HONOR
     */
    static async unpinHonor(
        req: Request<{ honorId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { honorId } = req.params;

            const result = await HonorService.unpinHonor(honorId, req.user.userId);

            ResponseUtil.success(res, result, 'Honor unpinned successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Unpin honor failed', {
                error: error.message,
                honorId: req.params.honorId,
                correlationId,
            });

            if (error.message === 'Honor not found') {
                ResponseUtil.notFound(res, 'Honor not found');
                return;
            }

            if (error.message === 'Honor is not pinned') {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REORDER HONORS
     */
    static async reorderHonors(
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

            const result = await HonorService.reorderHonors(req.user.userId, reorderData);

            ResponseUtil.success(res, result, 'Honors reordered successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Reorder honors failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ VERIFY HONOR
     */
    static async verifyHonor(
        req: Request<{ honorId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { honorId } = req.params;
            const { verifiedBy, verificationProof } = req.body;

            if (!verifiedBy) {
                ResponseUtil.validationError(res, ['Verified by is required'], 'Missing required fields');
                return;
            }

            const result = await HonorService.verifyHonor(
                honorId,
                req.user.userId,
                { verifiedBy, verificationProof }
            );

            ResponseUtil.success(res, result, 'Honor verified successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Verify honor failed', {
                error: error.message,
                honorId: req.params.honorId,
                correlationId,
            });

            if (error.message === 'Honor not found') {
                ResponseUtil.notFound(res, 'Honor not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPLOAD ORGANIZATION LOGO
     */
    static async uploadOrganizationLogo(
        req: Request<{ honorId: string }> & { user?: UserPayload },
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

            const { honorId } = req.params;

            const result = await HonorService.uploadOrganizationLogo(
                honorId,
                req.user.userId,
                req.file
            );

            ResponseUtil.success(res, result, 'Organization logo uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Upload organization logo failed', {
                error: error.message,
                honorId: req.params.honorId,
                correlationId,
            });

            if (error.message === 'Honor not found') {
                ResponseUtil.notFound(res, 'Honor not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPLOAD MEDIA ATTACHMENT
     */
    static async uploadMediaAttachment(
        req: Request<{ honorId: string }> & { user?: UserPayload },
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

            const { honorId } = req.params;
            const { mediaType } = req.body;

            if (!mediaType || !['certificate', 'photo'].includes(mediaType)) {
                ResponseUtil.validationError(res, ['Media type must be certificate or photo'], 'Validation failed');
                return;
            }

            const result = await HonorService.uploadMediaAttachment(
                honorId,
                req.user.userId,
                req.file,
                mediaType
            );

            ResponseUtil.created(res, result, 'Media attachment uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Upload media attachment failed', {
                error: error.message,
                honorId: req.params.honorId,
                correlationId,
            });

            if (error.message === 'Honor not found') {
                ResponseUtil.notFound(res, 'Honor not found');
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
     * ✅ DELETE MEDIA ATTACHMENT
     */
    static async deleteMediaAttachment(
        req: Request<{ honorId: string; mediaId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { honorId, mediaId } = req.params;

            const result = await HonorService.deleteMediaAttachment(
                honorId,
                req.user.userId,
                mediaId
            );

            ResponseUtil.success(res, result, 'Media attachment deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete media attachment failed', {
                error: error.message,
                honorId: req.params.honorId,
                mediaId: req.params.mediaId,
                correlationId,
            });

            if (error.message === 'Honor not found' || error.message === 'Media attachment not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default HonorController;