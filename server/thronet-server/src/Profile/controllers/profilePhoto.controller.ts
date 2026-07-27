/**
 * Profile Photo Controller - Handles HTTP Requests for Profile Pictures
 * Supports UPLOAD, GET, DELETE, ARCHIVE, RESTORE operations
 * 
 * @module controllers/profilePhoto.controller
 * @version 1.0.0
 */

import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { ProfilePhotoService } from '@/shared/services/index.service';
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

// ==================== PROFILE PHOTO CONTROLLER ====================

class ProfilePhotoController {

    /**
     * ✅ UPLOAD PROFILE PHOTO
     * POST /api/v1/profile-photo
     * 
     * @access Private
     */
    static async uploadPhoto(
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
            const setAsActive = req.body.setAsActive !== 'false'; // Default true

            LoggerUtil.info('Upload photo request', {
                userId,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                setAsActive,
                correlationId,
            });

            const result = await ProfilePhotoService.uploadProfilePhoto(
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
                        action: 'PROFILE_PHOTO_UPLOADED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            photoId: result.photoId,
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
            LoggerUtil.info('Photo uploaded successfully', {
                userId,
                photoId: result.photoId,
                duration,
                correlationId,
            });

            ResponseUtil.created(
                res,
                { photo: result },
                'Profile photo uploaded successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Photo upload failed', {
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
                        action: 'PROFILE_PHOTO_UPLOAD_FAILED',
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
                    ? 'Photo upload failed'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ GET ALL PHOTOS
     * GET /api/v1/profile-photo
     */
    static async getAllPhotos(
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

            const result = await ProfilePhotoService.getAllPhotos(userId, includeArchived);

            LoggerUtil.info('All photos fetched', {
                userId,
                count: result.total,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Photos fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all photos failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET SINGLE PHOTO
     * GET /api/v1/profile-photo/:photoId
     */
    static async getPhotoById(
        req: Request<{ photoId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { photoId } = req.params;

            if (!photoId) {
                ResponseUtil.badRequest(res, 'Photo ID is required');
                return;
            }

            const photo = await ProfilePhotoService.getPhotoById(photoId, userId);

            ResponseUtil.success(
                res,
                { photo },
                'Photo fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get photo failed', {
                error: error.message,
                photoId: req.params.photoId,
                correlationId,
            });

            if (error.message === 'Photo not found') {
                ResponseUtil.notFound(res, 'Photo not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
 * ✅ GET MULTIPLE PHOTOS BY PHOTO IDs ARRAY
 * POST /api/v1/profile-photo/get-multiple-photos
 */
    static async getMultiplePhotos(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { photoIds } = req.body;

            // Validation: Check if photoIds array is provided
            if (!photoIds || !Array.isArray(photoIds)) {
                ResponseUtil.badRequest(res, 'photoIds array is required');
                return;
            }

            // Validation: Check if array is not empty
            if (photoIds.length === 0) {
                ResponseUtil.badRequest(res, 'photoIds array cannot be empty');
                return;
            }

            // Validation: Check maximum limit (prevent abuse)
            if (photoIds.length > 100) {
                ResponseUtil.badRequest(res, 'Maximum 100 photo IDs allowed per request');
                return;
            }

            // Validation: Check all IDs are valid UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            const invalidIds = photoIds.filter((id: string) => !uuidRegex.test(id));

            if (invalidIds.length > 0) {
                ResponseUtil.badRequest(res, `Invalid photo ID format: ${invalidIds.join(', ')}`);
                return;
            }

            LoggerUtil.info('Fetching multiple photos', {
                userId: req.user.userId,
                photoIdsCount: photoIds.length,
                correlationId,
            });

            const result = await ProfilePhotoService.getMultiplePhotosByIds(photoIds);

            LoggerUtil.info('Multiple photos fetched successfully', {
                userId: req.user.userId,
                requested: photoIds.length,
                found: result.photos.length,
                notFound: result.notFoundIds.length,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                `Successfully fetched ${result.photos.length} photos`
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get multiple photos failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
 * ✅ GET ALL USERS' ACTIVE PROFILE PHOTOS
 * GET /api/v1/profile-photo/get-all-users-photos
 */
    static async getAllUsersPhotos(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const limit = parseInt(req.query.limit as string) || 50;

            if (limit > 500) {
                ResponseUtil.badRequest(res, 'Maximum limit is 500');
                return;
            }

            const result = await ProfilePhotoService.getAllUsersActivePhotos(limit);

            ResponseUtil.success(
                res,
                result,
                'All users photos fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all users photos failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ SET ACTIVE PHOTO
     * PUT /api/v1/profile-photo/:photoId/set-active
     */
    static async setActivePhoto(
        req: Request<{ photoId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { photoId } = req.params;

            const photo = await ProfilePhotoService.setActivePhoto(photoId, userId);

            LoggerUtil.info('Active photo set', {
                userId,
                photoId,
                correlationId,
            });

            ResponseUtil.success(
                res,
                { photo },
                'Active photo set successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Set active photo failed', {
                error: error.message,
                photoId: req.params.photoId,
                correlationId,
            });

            if (error.message === 'Photo not found') {
                ResponseUtil.notFound(res, 'Photo not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE PROFILE PHOTO
     * PUT /api/v1/profile-photo/:photoId
     * 
     * @access Private
     */
    static async updatePhoto(
        req: Request<{ photoId: string }> & { user?: UserPayload },
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
            const { photoId } = req.params;
            const ipAddress = req.ip || 'unknown';

            if (!photoId) {
                ResponseUtil.badRequest(res, 'Photo ID is required');
                return;
            }

            LoggerUtil.info('Update photo request', {
                userId,
                photoId,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                correlationId,
            });

            const result = await ProfilePhotoService.updateProfilePhoto(
                photoId,
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
                        action: 'PROFILE_PHOTO_UPDATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            photoId: result.photoId,
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
            LoggerUtil.info('Photo updated successfully', {
                userId,
                photoId: result.photoId,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                { photo: result },
                'Profile photo updated successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Photo update failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                photoId: req.params.photoId,
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
                        action: 'PROFILE_PHOTO_UPDATE_FAILED',
                        ipAddress: req.ip || 'unknown',
                        status: 'FAILURE',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            error: error.message,
                            photoId: req.params.photoId,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            if (error.message === 'Photo not found') {
                ResponseUtil.notFound(res, 'Photo not found');
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
                    ? 'Photo update failed'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ DELETE PHOTO
     * DELETE /api/v1/profile-photo/:photoId
     */
    static async deletePhoto(
        req: Request<{ photoId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { photoId } = req.params;
            const ipAddress = req.ip || 'unknown';

            const result = await ProfilePhotoService.deletePhoto(photoId, userId);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'PROFILE_PHOTO_DELETED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: { photoId, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            ResponseUtil.success(res, result, 'Photo deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete photo failed', {
                error: error.message,
                photoId: req.params.photoId,
                correlationId,
            });

            if (error.message === 'Photo not found') {
                ResponseUtil.notFound(res, 'Photo not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE PHOTO
     * POST /api/v1/profile-photo/:photoId/archive
     */
    static async archivePhoto(
        req: Request<{ photoId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { photoId } = req.params;

            const result = await ProfilePhotoService.archivePhoto(photoId, userId);

            ResponseUtil.success(res, result, 'Photo archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive photo failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Photo not found') {
                ResponseUtil.notFound(res, 'Photo not found');
                return;
            }

            if (error.message === 'Photo is already archived') {
                ResponseUtil.badRequest(res, 'Photo is already archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE PHOTO
     * POST /api/v1/profile-photo/:photoId/restore
     */
    static async restorePhoto(
        req: Request<{ photoId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { photoId } = req.params;

            const result = await ProfilePhotoService.restorePhoto(photoId, userId);

            ResponseUtil.success(res, result, 'Photo restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore photo failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Photo not found') {
                ResponseUtil.notFound(res, 'Photo not found');
                return;
            }

            if (error.message === 'Photo is not archived') {
                ResponseUtil.badRequest(res, 'Photo is not archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default ProfilePhotoController;