/**
 * About Controller - HTTP Request Handlers with Video & Media Upload
 * 
 * @module controllers/about.controller
 * @version 2.0.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AboutService } from '@/shared/services/index.service';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
}

interface CreateAboutBody {
    aboutText: string;
    textFormatting?: string; // JSON string
}

interface UpdateAboutBody {
    aboutText?: string;
    isExpanded?: boolean;
    textFormatting?: string; // JSON string
}

// ==================== ABOUT CONTROLLER ====================

class AboutController {

    /**
     * ✅ CREATE ABOUT
     */
    static async createAbout(
        req: Request<{}, any, CreateAboutBody> & { user?: UserPayload },
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

            const { aboutText, textFormatting } = req.body;

            if (!aboutText) {
                ResponseUtil.validationError(res, ['About text is required'], 'Missing required fields');
                return;
            }

            // Parse text formatting if provided
            let parsedFormatting;
            if (textFormatting) {
                try {
                    parsedFormatting = JSON.parse(textFormatting);
                } catch (err) {
                    ResponseUtil.validationError(res, ['Invalid text formatting JSON'], 'Validation failed');
                    return;
                }
            }

            const about = await AboutService.createAbout({
                userId,
                aboutText,
                textFormatting: parsedFormatting,
            });

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'ABOUT_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: { aboutId: about.aboutId, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('About created successfully', {
                userId,
                aboutId: about.aboutId,
                duration,
                correlationId,
            });

            ResponseUtil.created(res, { about }, 'About created successfully');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('About creation failed', {
                error: error.message,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            if (error.message === 'About already exists. Use update instead.') {
                ResponseUtil.conflict(res, error.message);
                return;
            }

            if (error.message.includes('capital letter')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPLOAD COVER STORY VIDEO
     */
    static async uploadCoverStory(
        req: Request<{ aboutId: string }> & { user?: UserPayload },
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
                ResponseUtil.badRequest(res, 'No video file uploaded');
                return;
            }

            const { aboutId } = req.params;

            const result = await AboutService.uploadCoverStory(aboutId, req.user.userId, req.file);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Cover story uploaded successfully', {
                aboutId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Cover story uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Cover story upload failed', {
                error: error.message,
                aboutId: req.params.aboutId,
                correlationId,
            });

            if (error.message === 'About not found') {
                ResponseUtil.notFound(res, 'About not found');
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
        req: Request<{ aboutId: string }> & { user?: UserPayload },
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

            const { aboutId } = req.params;
            const { mediaType, caption } = req.body;

            if (!mediaType || !['image', 'document'].includes(mediaType)) {
                ResponseUtil.validationError(res, ['Media type must be image or document'], 'Validation failed');
                return;
            }

            const result = await AboutService.uploadMediaAttachment(
                aboutId,
                req.user.userId,
                req.file,
                { mediaType, caption }
            );

            const duration = Date.now() - startTime;
            LoggerUtil.info('Media attachment uploaded successfully', {
                aboutId,
                mediaType,
                duration,
                correlationId,
            });

            ResponseUtil.created(res, result, 'Media attachment uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Media attachment upload failed', {
                error: error.message,
                aboutId: req.params.aboutId,
                correlationId,
            });

            if (error.message === 'About not found') {
                ResponseUtil.notFound(res, 'About not found');
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
        req: Request<{ aboutId: string; mediaId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { aboutId, mediaId } = req.params;

            const result = await AboutService.deleteMediaAttachment(aboutId, req.user.userId, mediaId);

            ResponseUtil.success(res, result, 'Media attachment deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete media attachment failed', {
                error: error.message,
                aboutId: req.params.aboutId,
                mediaId: req.params.mediaId,
                correlationId,
            });

            if (error.message === 'About not found' || error.message === 'Media attachment not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL ABOUT
     */
    static async getAllAbout(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const result = await AboutService.getAllAbout(req.user.userId);

            ResponseUtil.success(res, result, 'About fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all about failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ABOUT BY ID
     */
    static async getAboutById(
        req: Request<{ aboutId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { aboutId } = req.params;

            if (!aboutId) {
                ResponseUtil.badRequest(res, 'About ID is required');
                return;
            }

            const about = await AboutService.getAboutById(aboutId, req.user.userId);

            ResponseUtil.success(res, { about }, 'About fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get about by ID failed', {
                error: error.message,
                aboutId: req.params.aboutId,
                correlationId,
            });

            if (error.message === 'About not found') {
                ResponseUtil.notFound(res, 'About not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE ABOUT
     */
    static async updateAbout(
        req: Request<{ aboutId: string }, any, UpdateAboutBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { aboutId } = req.params;

            if (!aboutId) {
                ResponseUtil.badRequest(res, 'About ID is required');
                return;
            }

            if (Object.keys(req.body).length === 0) {
                ResponseUtil.validationError(res, ['At least one field must be provided'], 'No fields to update');
                return;
            }

            // Parse text formatting if provided
            let parsedFormatting;
            if (req.body.textFormatting) {
                try {
                    parsedFormatting = JSON.parse(req.body.textFormatting);
                } catch (err) {
                    ResponseUtil.validationError(res, ['Invalid text formatting JSON'], 'Validation failed');
                    return;
                }
            }

            const updates: any = {
                aboutText: req.body.aboutText,
                isExpanded: req.body.isExpanded,
                textFormatting: parsedFormatting,
            };

            // Remove undefined values
            Object.keys(updates).forEach(key => {
                if (updates[key] === undefined) {
                    delete updates[key];
                }
            });

            const about = await AboutService.updateAbout(aboutId, req.user.userId, updates);

            const duration = Date.now() - startTime;
            LoggerUtil.info('About updated successfully', {
                aboutId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { about }, 'About updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update about failed', {
                error: error.message,
                aboutId: req.params.aboutId,
                correlationId,
            });

            if (error.message === 'About not found') {
                ResponseUtil.notFound(res, 'About not found');
                return;
            }

            if (error.message.includes('capital letter')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE ABOUT
     */
    static async deleteAbout(
        req: Request<{ aboutId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { aboutId } = req.params;
            const permanent = req.query.permanent === 'true';

            const result = await AboutService.deleteAbout(aboutId, req.user.userId, permanent);

            ResponseUtil.success(res, result, 'About deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete about failed', {
                error: error.message,
                aboutId: req.params.aboutId,
                correlationId,
            });

            if (error.message === 'About not found') {
                ResponseUtil.notFound(res, 'About not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE ABOUT
     */
    static async archiveAbout(
        req: Request<{ aboutId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { aboutId } = req.params;

            const result = await AboutService.archiveAbout(aboutId, req.user.userId);

            ResponseUtil.success(res, result, 'About archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive about failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'About not found') {
                ResponseUtil.notFound(res, 'About not found');
                return;
            }

            if (error.message === 'About is already archived') {
                ResponseUtil.badRequest(res, 'About is already archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE ABOUT
     */
    static async restoreAbout(
        req: Request<{ aboutId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { aboutId } = req.params;

            const result = await AboutService.restoreAbout(aboutId, req.user.userId);

            ResponseUtil.success(res, result, 'About restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore about failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'About not found') {
                ResponseUtil.notFound(res, 'About not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default AboutController;