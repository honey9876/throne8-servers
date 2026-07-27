/**
 * Cover Photo Controller - Handles HTTP Requests for Cover/Banner Pictures
 * Supports UPLOAD, GET, DELETE, ARCHIVE, RESTORE operations
 * 
 * @module controllers/coverPhoto.controller
 * @version 1.0.0
 */

import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CoverPhotoService } from '@/shared/services/index.service';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
    sessionId?: string;
    deviceId?: string;
}

// ==================== COVER PHOTO CONTROLLER ====================

class CoverPhotoController {

    /**
     * ✅ UPLOAD COVER PHOTO
     * POST /api/v1/cover-photo/upload-cover
     * 
     * @access Private
     */
    static async uploadCover(
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

            if (!req.file) {
                ResponseUtil.badRequest(res, 'No file uploaded');
                return;
            }

            const userId = req.user.userId;
            const ipAddress = req.ip || 'unknown';
            const setAsActive = req.body.setAsActive !== 'false';

            LoggerUtil.info('Upload cover request', {
                userId,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                setAsActive,
                correlationId,
            });

            const result = await CoverPhotoService.uploadCoverPhoto(
                userId,
                req.file,
                setAsActive
            );

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'COVER_PHOTO_UPLOADED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            coverId: result.coverId,
                            fileSize: result.fileSize,
                            dimensions: `${result.width}x${result.height}`,
                            isActive: result.isActive,
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
            LoggerUtil.info('Cover uploaded successfully', {
                userId,
                coverId: result.coverId,
                duration,
                correlationId,
            });

            ResponseUtil.created(
                res,
                { cover: result },
                'Cover photo uploaded successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Cover upload failed', {
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
                        action: 'COVER_PHOTO_UPLOAD_FAILED',
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
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            if (error.message.includes('Maximum') || error.message.includes('dimensions')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Cover upload failed'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ GET ALL COVERS
     * GET /api/v1/cover-photo/get-all-covers
     */
    static async getAllCovers(
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

            const result = await CoverPhotoService.getAllCovers(userId, includeArchived);

            LoggerUtil.info('All covers fetched', {
                userId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Covers fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all covers failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET SINGLE COVER
     * GET /api/v1/cover-photo/get-cover/:coverId
     */
    static async getCoverById(
        req: Request<{ coverId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { coverId } = req.params;

            if (!coverId) {
                ResponseUtil.badRequest(res, 'Cover ID is required');
                return;
            }

            const cover = await CoverPhotoService.getCoverById(coverId, userId);

            ResponseUtil.success(
                res,
                { cover },
                'Cover fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get cover failed', {
                error: error.message,
                coverId: req.params.coverId,
                correlationId,
            });

            if (error.message === 'Cover not found') {
                ResponseUtil.notFound(res, 'Cover not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ SET ACTIVE COVER
     * PUT /api/v1/cover-photo/set-active-cover/:coverId/set-active
     */
    static async setActiveCover(
        req: Request<{ coverId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { coverId } = req.params;

            const cover = await CoverPhotoService.setActiveCover(coverId, userId);

            LoggerUtil.info('Active cover set', {
                userId,
                coverId,
                correlationId,
            });

            ResponseUtil.success(
                res,
                { cover },
                'Active cover set successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Set active cover failed', {
                error: error.message,
                coverId: req.params.coverId,
                correlationId,
            });

            if (error.message === 'Cover not found') {
                ResponseUtil.notFound(res, 'Cover not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE COVER PHOTO
     * PUT /api/v1/cover-photo/update-cover/:coverId
     * 
     * @access Private
     */
    static async updateCover(
        req: Request<{ coverId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
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

            const userId = req.user.userId;
            const { coverId } = req.params;
            const ipAddress = req.ip || 'unknown';

            if (!coverId) {
                ResponseUtil.badRequest(res, 'Cover ID is required');
                return;
            }

            LoggerUtil.info('Update cover request', {
                userId,
                coverId,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                correlationId,
            });

            const result = await CoverPhotoService.updateCoverPhoto(
                coverId,
                userId,
                req.file
            );

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'COVER_PHOTO_UPDATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            coverId: result.coverId,
                            fileSize: result.fileSize,
                            dimensions: `${result.width}x${result.height}`,
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
            LoggerUtil.info('Cover updated successfully', {
                userId,
                coverId: result.coverId,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                { cover: result },
                'Cover photo updated successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Cover update failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                coverId: req.params.coverId,
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
                        action: 'COVER_PHOTO_UPDATE_FAILED',
                        ipAddress: req.ip || 'unknown',
                        status: 'FAILURE',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            error: error.message,
                            coverId: req.params.coverId,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            if (error.message === 'Cover not found') {
                ResponseUtil.notFound(res, 'Cover not found');
                return;
            }

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            if (error.message.includes('Maximum') || error.message.includes('dimensions')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Cover update failed'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ DELETE COVER
     * DELETE /api/v1/cover-photo/delete-cover/:coverId
     */
    static async deleteCover(
        req: Request<{ coverId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { coverId } = req.params;
            const ipAddress = req.ip || 'unknown';

            const result = await CoverPhotoService.deleteCover(coverId, userId);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'COVER_PHOTO_DELETED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: { coverId, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            ResponseUtil.success(res, result, 'Cover deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete cover failed', {
                error: error.message,
                coverId: req.params.coverId,
                correlationId,
            });

            if (error.message === 'Cover not found') {
                ResponseUtil.notFound(res, 'Cover not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE COVER
     * POST /api/v1/cover-photo/archive-cover/:coverId
     */
    static async archiveCover(
        req: Request<{ coverId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { coverId } = req.params;

            const result = await CoverPhotoService.archiveCover(coverId, userId);

            ResponseUtil.success(res, result, 'Cover archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive cover failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Cover not found') {
                ResponseUtil.notFound(res, 'Cover not found');
                return;
            }

            if (error.message === 'Cover is already archived') {
                ResponseUtil.badRequest(res, 'Cover is already archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE COVER
     * POST /api/v1/cover-photo/restore-cover/:coverId
     */
    static async restoreCover(
        req: Request<{ coverId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { coverId } = req.params;

            const result = await CoverPhotoService.restoreCover(coverId, userId);

            ResponseUtil.success(res, result, 'Cover restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore cover failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Cover not found') {
                ResponseUtil.notFound(res, 'Cover not found');
                return;
            }

            if (error.message === 'Cover is not archived') {
                ResponseUtil.badRequest(res, 'Cover is not archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default CoverPhotoController;