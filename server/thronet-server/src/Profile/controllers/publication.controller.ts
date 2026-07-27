/**
 * Publication Controller - HTTP Request Handlers
 * 
 * @module controllers/publication.controller
 * @version 1.0.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PublicationService } from '@/shared/services/index.service';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
}

interface CreatePublicationBody {
    title: string;
    publisherName: string;
    publicationDate: {
        month: number;
        day?: number;
        year: number;
    };
    publicationUrl?: string;
    description?: string;
    authors?: Array<{
        authorId?: string;
        authorName: string;
        authorProfile?: string;
    }>;
    publicationType: 'article' | 'book' | 'paper' | 'conference_paper' | 'thesis';
}

interface UpdatePublicationBody {
    title?: string;
    publisherName?: string;
    publicationDate?: {
        month: number;
        day?: number;
        year: number;
    };
    publicationUrl?: string;
    description?: string;
    authors?: Array<{
        authorId?: string;
        authorName: string;
        authorProfile?: string;
    }>;
    publicationType?: 'article' | 'book' | 'paper' | 'conference_paper' | 'thesis';
}

// ==================== PUBLICATION CONTROLLER ====================

class PublicationController {

    /**
     * ✅ CREATE PUBLICATION
     */
    static async createPublication(
        req: Request<{}, any, CreatePublicationBody> & { user?: UserPayload },
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

            LoggerUtil.info('Create publication request received', {
                userId,
                title: req.body.title,
                correlationId,
            });

            const publication = await PublicationService.createPublication({
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
                        action: 'PUBLICATION_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            publicationId: publication.publicationId,
                            title: publication.title,
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
            LoggerUtil.info('Publication created successfully', {
                userId,
                publicationId: publication.publicationId,
                duration,
                correlationId,
            });

            ResponseUtil.created(res, { publication }, 'Publication created successfully');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Publication creation failed', {
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

            if (error.message === 'Maximum publication limit (50) reached') {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL PUBLICATIONS
     */
    static async getAllPublications(
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

            const result = await PublicationService.getAllPublications(userId, includeArchived);

            ResponseUtil.success(res, result, 'Publications fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all publications failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET PUBLICATION BY ID
     */
    static async getPublicationById(
        req: Request<{ publicationId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { publicationId } = req.params;

            if (!publicationId) {
                ResponseUtil.badRequest(res, 'Publication ID is required');
                return;
            }

            const publication = await PublicationService.getPublicationById(publicationId, req.user.userId);

            ResponseUtil.success(res, { publication }, 'Publication fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get publication by ID failed', {
                error: error.message,
                publicationId: req.params.publicationId,
                correlationId,
            });

            if (error.message === 'Publication not found') {
                ResponseUtil.notFound(res, 'Publication not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE PUBLICATION
     */
    static async updatePublication(
        req: Request<{ publicationId: string }, any, UpdatePublicationBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { publicationId } = req.params;

            if (!publicationId) {
                ResponseUtil.badRequest(res, 'Publication ID is required');
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

            const publication = await PublicationService.updatePublication(
                publicationId,
                req.user.userId,
                req.body
            );

            ResponseUtil.success(res, { publication }, 'Publication updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update publication failed', {
                error: error.message,
                publicationId: req.params.publicationId,
                correlationId,
            });

            if (error.message === 'Publication not found') {
                ResponseUtil.notFound(res, 'Publication not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE PUBLICATION
     */
    static async deletePublication(
        req: Request<{ publicationId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { publicationId } = req.params;
            const permanent = req.query.permanent === 'true';

            if (!publicationId) {
                ResponseUtil.badRequest(res, 'Publication ID is required');
                return;
            }

            const result = await PublicationService.deletePublication(
                publicationId,
                req.user.userId,
                permanent
            );

            ResponseUtil.success(res, result, 'Publication deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete publication failed', {
                error: error.message,
                publicationId: req.params.publicationId,
                correlationId,
            });

            if (error.message === 'Publication not found') {
                ResponseUtil.notFound(res, 'Publication not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE PUBLICATION
     */
    static async archivePublication(
        req: Request<{ publicationId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { publicationId } = req.params;

            const result = await PublicationService.archivePublication(publicationId, req.user.userId);

            ResponseUtil.success(res, result, 'Publication archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive publication failed', {
                error: error.message,
                publicationId: req.params.publicationId,
                correlationId,
            });

            if (error.message === 'Publication not found') {
                ResponseUtil.notFound(res, 'Publication not found');
                return;
            }

            if (error.message === 'Publication is already archived') {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE PUBLICATION
     */
    static async restorePublication(
        req: Request<{ publicationId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { publicationId } = req.params;

            const result = await PublicationService.restorePublication(publicationId, req.user.userId);

            ResponseUtil.success(res, result, 'Publication restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore publication failed', {
                error: error.message,
                publicationId: req.params.publicationId,
                correlationId,
            });

            if (error.message === 'Publication not found') {
                ResponseUtil.notFound(res, 'Publication not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ PIN PUBLICATION
     */
    static async pinPublication(
        req: Request<{ publicationId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { publicationId } = req.params;
            const { pinnedOrder } = req.body;

            if (!pinnedOrder) {
                ResponseUtil.validationError(res, ['Pinned order is required'], 'Missing required fields');
                return;
            }

            const result = await PublicationService.pinPublication(
                publicationId,
                req.user.userId,
                pinnedOrder
            );

            ResponseUtil.success(res, result, 'Publication pinned successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Pin publication failed', {
                error: error.message,
                publicationId: req.params.publicationId,
                correlationId,
            });

            if (error.message === 'Publication not found') {
                ResponseUtil.notFound(res, 'Publication not found');
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
     * ✅ UNPIN PUBLICATION
     */
    static async unpinPublication(
        req: Request<{ publicationId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { publicationId } = req.params;

            const result = await PublicationService.unpinPublication(publicationId, req.user.userId);

            ResponseUtil.success(res, result, 'Publication unpinned successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Unpin publication failed', {
                error: error.message,
                publicationId: req.params.publicationId,
                correlationId,
            });

            if (error.message === 'Publication not found') {
                ResponseUtil.notFound(res, 'Publication not found');
                return;
            }

            if (error.message === 'Publication is not pinned') {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REORDER PUBLICATIONS
     */
    static async reorderPublications(
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

            const result = await PublicationService.reorderPublications(req.user.userId, reorderData);

            ResponseUtil.success(res, result, 'Publications reordered successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Reorder publications failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE CITATION COUNT
     */
    static async updateCitationCount(
        req: Request<{ publicationId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { publicationId } = req.params;
            const citationData = req.body;

            const result = await PublicationService.updateCitationCount(
                publicationId,
                req.user.userId,
                citationData
            );

            ResponseUtil.success(res, result, 'Citation count updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update citation count failed', {
                error: error.message,
                publicationId: req.params.publicationId,
                correlationId,
            });

            if (error.message === 'Publication not found') {
                ResponseUtil.notFound(res, 'Publication not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPLOAD PUBLISHER LOGO
     */
    static async uploadPublisherLogo(
        req: Request<{ publicationId: string }> & { user?: UserPayload },
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

            const { publicationId } = req.params;

            const result = await PublicationService.uploadPublisherLogo(
                publicationId,
                req.user.userId,
                req.file
            );

            ResponseUtil.success(res, result, 'Publisher logo uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Upload publisher logo failed', {
                error: error.message,
                publicationId: req.params.publicationId,
                correlationId,
            });

            if (error.message === 'Publication not found') {
                ResponseUtil.notFound(res, 'Publication not found');
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
        req: Request<{ publicationId: string }> & { user?: UserPayload },
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

            const { publicationId } = req.params;
            const { mediaType } = req.body;

            if (!mediaType || !['pdf', 'image'].includes(mediaType)) {
                ResponseUtil.validationError(res, ['Media type must be pdf or image'], 'Validation failed');
                return;
            }

            const result = await PublicationService.uploadMediaAttachment(
                publicationId,
                req.user.userId,
                req.file,
                mediaType
            );

            ResponseUtil.created(res, result, 'Media attachment uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Upload media attachment failed', {
                error: error.message,
                publicationId: req.params.publicationId,
                correlationId,
            });

            if (error.message === 'Publication not found') {
                ResponseUtil.notFound(res, 'Publication not found');
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
        req: Request<{ publicationId: string; mediaId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { publicationId, mediaId } = req.params;

            const result = await PublicationService.deleteMediaAttachment(
                publicationId,
                req.user.userId,
                mediaId
            );

            ResponseUtil.success(res, result, 'Media attachment deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete media attachment failed', {
                error: error.message,
                publicationId: req.params.publicationId,
                mediaId: req.params.mediaId,
                correlationId,
            });

            if (error.message === 'Publication not found' || error.message === 'Media attachment not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default PublicationController;