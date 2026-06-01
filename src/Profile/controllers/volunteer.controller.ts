/**
 * Volunteer Controller - HTTP Request Handlers for Volunteer Experience Management
 * 
 * @module controllers/volunteer.controller
 * @version 1.0.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { VolunteerService } from '@/shared/services/index.service';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
}

interface CreateVolunteerBody {
    organizationName: string;
    role: string;
    cause: string;
    startDate: {
        month: number;
        year: number;
    };
    endDate?: {
        month: number;
        year: number;
    };
    currentlyVolunteering: boolean;
    description?: string;
    skillsUsed?: string[];
    notifyNetwork?: boolean;
}

interface UpdateVolunteerBody {
    organizationName?: string;
    role?: string;
    cause?: string;
    startDate?: {
        month: number;
        year: number;
    };
    endDate?: {
        month: number;
        year: number;
    };
    currentlyVolunteering?: boolean;
    description?: string;
    skillsUsed?: string[];
    notifyNetwork?: boolean;
}

interface ReorderVolunteersBody {
    volunteerIds: string[];
}

interface ToggleNotifyNetworkBody {
    notifyNetwork: boolean;
}

interface UploadMediaBody {
    mediaType: 'photo' | 'certificate';
    caption?: string;
}

// ==================== VOLUNTEER CONTROLLER CLASS ====================

class VolunteerController {

    /**
     * ✅ CREATE VOLUNTEER EXPERIENCE
     */
    static async createVolunteer(
        req: Request<{}, any, CreateVolunteerBody> & { user?: UserPayload },
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

            LoggerUtil.info('Create volunteer experience request received', {
                userId,
                organizationName: req.body.organizationName,
                correlationId,
            });

            const {
                organizationName,
                role,
                cause,
                startDate,
                endDate,
                currentlyVolunteering,
                description,
                skillsUsed,
                notifyNetwork,
            } = req.body;

            if (!organizationName || !role || !cause || !startDate) {
                ResponseUtil.validationError(
                    res,
                    ['Organization name, role, cause, and start date are required'],
                    'Missing required fields'
                );
                return;
            }

            const volunteer = await VolunteerService.createVolunteer({
                userId,
                organizationName,
                role,
                cause,
                startDate,
                endDate,
                currentlyVolunteering,
                description,
                skillsUsed,
                notifyNetwork,
            });

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'VOLUNTEER_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            volunteerId: volunteer.volunteerId,
                            organizationName: volunteer.organizationName,
                            correlationId,
                            duration: Date.now() - startTime,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed (non-critical)', {
                        error: err.message,
                        userId,
                    });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Volunteer experience created successfully', {
                userId,
                volunteerId: volunteer.volunteerId,
                duration,
                correlationId,
            });

            ResponseUtil.created(res, { volunteer }, 'Volunteer experience created successfully');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Volunteer experience creation failed', {
                error: error.message,
                stack: error.stack,
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

            if (error.message === 'Maximum volunteer experience limit (50) reached') {
                ResponseUtil.badRequest(res, 'Maximum volunteer experience limit (50) reached');
                return;
            }

            if (error.message.includes('skill IDs are invalid')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Volunteer experience creation failed. Please try again.'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ UPLOAD ORGANIZATION LOGO
     */
    static async uploadOrganizationLogo(
        req: Request<{ volunteerId: string }> & { user?: UserPayload },
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
                ResponseUtil.badRequest(res, 'No logo file uploaded');
                return;
            }

            const { volunteerId } = req.params;

            const result = await VolunteerService.uploadOrganizationLogo(volunteerId, req.user.userId, req.file);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Organization logo uploaded successfully', {
                volunteerId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Organization logo uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Organization logo upload failed', {
                error: error.message,
                volunteerId: req.params.volunteerId,
                correlationId,
            });

            if (error.message === 'Volunteer experience not found') {
                ResponseUtil.notFound(res, 'Volunteer experience not found');
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
        req: Request<{ volunteerId: string }, any, UploadMediaBody> & { user?: UserPayload },
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

            const { volunteerId } = req.params;
            const { mediaType, caption } = req.body;

            if (!mediaType || !['photo', 'certificate'].includes(mediaType)) {
                ResponseUtil.validationError(res, ['Media type must be photo or certificate'], 'Validation failed');
                return;
            }

            const result = await VolunteerService.uploadMediaAttachment(
                volunteerId,
                req.user.userId,
                req.file,
                { mediaType, caption }
            );

            const duration = Date.now() - startTime;
            LoggerUtil.info('Media attachment uploaded successfully', {
                volunteerId,
                mediaType,
                duration,
                correlationId,
            });

            ResponseUtil.created(res, result, 'Media attachment uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Media attachment upload failed', {
                error: error.message,
                volunteerId: req.params.volunteerId,
                correlationId,
            });

            if (error.message === 'Volunteer experience not found') {
                ResponseUtil.notFound(res, 'Volunteer experience not found');
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
        req: Request<{ volunteerId: string; mediaId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { volunteerId, mediaId } = req.params;

            const result = await VolunteerService.deleteMediaAttachment(volunteerId, req.user.userId, mediaId);

            ResponseUtil.success(res, result, 'Media attachment deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete media attachment failed', {
                error: error.message,
                volunteerId: req.params.volunteerId,
                mediaId: req.params.mediaId,
                correlationId,
            });

            if (error.message === 'Volunteer experience not found' || error.message === 'Media attachment not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL VOLUNTEERS
     */
    static async getAllVolunteers(
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

            LoggerUtil.info('Get all volunteer experiences request', {
                userId,
                includeArchived,
                correlationId,
            });

            const result = await VolunteerService.getAllVolunteers(userId, includeArchived);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Volunteer experiences fetched successfully', {
                userId,
                count: result.total,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Volunteer experiences fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all volunteers failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET VOLUNTEER BY ID
     */
    static async getVolunteerById(
        req: Request<{ volunteerId: string }> & { user?: UserPayload },
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
            const { volunteerId } = req.params;

            if (!volunteerId) {
                ResponseUtil.badRequest(res, 'Volunteer ID is required');
                return;
            }

            LoggerUtil.info('Get volunteer by ID request', {
                userId,
                volunteerId,
                correlationId,
            });

            const volunteer = await VolunteerService.getVolunteerById(volunteerId, userId);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Volunteer fetched successfully', {
                userId,
                volunteerId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { volunteer }, 'Volunteer experience fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get volunteer by ID failed', {
                error: error.message,
                volunteerId: req.params.volunteerId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Volunteer experience not found') {
                ResponseUtil.notFound(res, 'Volunteer experience not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE VOLUNTEER
     */
    static async updateVolunteer(
        req: Request<{ volunteerId: string }, any, UpdateVolunteerBody> & { user?: UserPayload },
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
            const { volunteerId } = req.params;

            if (!volunteerId) {
                ResponseUtil.badRequest(res, 'Volunteer ID is required');
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

            LoggerUtil.info('Update volunteer request', {
                userId,
                volunteerId,
                updates: Object.keys(req.body),
                correlationId,
            });

            const volunteer = await VolunteerService.updateVolunteer(volunteerId, userId, req.body);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'VOLUNTEER_UPDATED',
                        ipAddress: req.ip || 'unknown',
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            volunteerId,
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
            LoggerUtil.info('Volunteer updated successfully', {
                userId,
                volunteerId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { volunteer }, 'Volunteer experience updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update volunteer failed', {
                error: error.message,
                volunteerId: req.params.volunteerId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Volunteer experience not found') {
                ResponseUtil.notFound(res, 'Volunteer experience not found');
                return;
            }

            if (error.message.includes('skill IDs are invalid')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE VOLUNTEER
     */
    static async deleteVolunteer(
        req: Request<{ volunteerId: string }> & { user?: UserPayload },
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
            const { volunteerId } = req.params;
            const permanent = req.query.permanent === 'true';

            if (!volunteerId) {
                ResponseUtil.badRequest(res, 'Volunteer ID is required');
                return;
            }

            LoggerUtil.info('Delete volunteer request', {
                userId,
                volunteerId,
                permanent,
                correlationId,
            });

            const result = await VolunteerService.deleteVolunteer(volunteerId, userId, permanent);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: permanent ? 'VOLUNTEER_DELETED_PERMANENT' : 'VOLUNTEER_DELETED',
                        ipAddress: req.ip || 'unknown',
                        status: 'SUCCESS',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: { volunteerId, permanent, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Volunteer deleted successfully', {
                userId,
                volunteerId,
                permanent,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Volunteer experience deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete volunteer failed', {
                error: error.message,
                volunteerId: req.params.volunteerId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Volunteer experience not found') {
                ResponseUtil.notFound(res, 'Volunteer experience not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE VOLUNTEER
     */
    static async archiveVolunteer(
        req: Request<{ volunteerId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { volunteerId } = req.params;

            const result = await VolunteerService.archiveVolunteer(volunteerId, userId);

            LoggerUtil.info('Volunteer archived successfully', {
                userId,
                volunteerId,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Volunteer experience archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive volunteer failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Volunteer experience not found') {
                ResponseUtil.notFound(res, 'Volunteer experience not found');
                return;
            }

            if (error.message === 'Volunteer experience is already archived') {
                ResponseUtil.badRequest(res, 'Volunteer experience is already archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE VOLUNTEER
     */
    static async restoreVolunteer(
        req: Request<{ volunteerId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { volunteerId } = req.params;

            const result = await VolunteerService.restoreVolunteer(volunteerId, userId);

            LoggerUtil.info('Volunteer restored successfully', {
                userId,
                volunteerId,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Volunteer experience restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore volunteer failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Volunteer experience not found') {
                ResponseUtil.notFound(res, 'Volunteer experience not found');
                return;
            }

            if (error.message === 'Volunteer experience is not archived or deleted') {
                ResponseUtil.badRequest(res, 'Volunteer experience is not archived or deleted');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ TOGGLE NOTIFY NETWORK
     */
    static async toggleNotifyNetwork(
        req: Request<{ volunteerId: string }, any, ToggleNotifyNetworkBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { volunteerId } = req.params;
            const { notifyNetwork } = req.body;

            if (typeof notifyNetwork !== 'boolean') {
                ResponseUtil.validationError(res, ['notifyNetwork must be a boolean'], 'Validation failed');
                return;
            }

            const result = await VolunteerService.toggleNotifyNetwork(volunteerId, userId, notifyNetwork);

            LoggerUtil.info('Notify network toggled successfully', {
                userId,
                volunteerId,
                notifyNetwork,
                correlationId,
            });

            ResponseUtil.success(res, result, result.message);
            return;

        } catch (error: any) {
            LoggerUtil.error('Toggle notify network failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Volunteer experience not found') {
                ResponseUtil.notFound(res, 'Volunteer experience not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REORDER VOLUNTEERS
     */
    static async reorderVolunteers(
        req: Request<{}, any, ReorderVolunteersBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { volunteerIds } = req.body;

            if (!volunteerIds || !Array.isArray(volunteerIds) || volunteerIds.length === 0) {
                ResponseUtil.validationError(
                    res,
                    ['Volunteer IDs array is required'],
                    'Validation failed'
                );
                return;
            }

            const result = await VolunteerService.reorderVolunteers(userId, volunteerIds);

            LoggerUtil.info('Volunteers reordered successfully', {
                userId,
                count: volunteerIds.length,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Volunteer experiences reordered successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Reorder volunteers failed', {
                error: error.message,
                correlationId,
            });

            if (error.message.includes('volunteer IDs are invalid')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default VolunteerController;