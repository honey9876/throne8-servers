/**
 * Contact Controller - Handles HTTP Requests for Contact Information
 * Complete CRUD operations with privacy controls
 * 
 * @module controllers/contact.controller
 * @version 1.0.0
 */

import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { ContactService } from '@/shared/services/index.service';
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

interface CreateContactBody {
    profileUrl?: string;
    phones?: Array<{
        phoneNumber: string;
        type: 'mobile' | 'home' | 'work';
        isPrimary: boolean;
        countryCode?: string;
    }>;
    birthday?: {
        day: number;
        month: number;
        year?: number;
        hideYear: boolean;
    };
    address?: {
        street?: string;
        city?: string;
        state?: string;
        country?: string;
        postalCode?: string;
        fullAddress?: string;
    };
    websites?: Array<{
        url: string;
        type: 'personal' | 'company' | 'portfolio' | 'blog' | 'social' | 'other';
        label?: string;
    }>;
    privacy?: {
        phoneVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        birthdayVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        addressVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        phoneDiscovery?: 'anyone' | 'connections_only' | 'no_one';
        contactButtonVisibility?: 'public' | 'connections' | 'private' | 'me_only';
    };
}

interface UpdateContactBody {
    profileUrl?: string;
    phones?: Array<{
        phoneNumber: string;
        type: 'mobile' | 'home' | 'work';
        isPrimary: boolean;
        countryCode?: string;
    }>;
    birthday?: {
        day: number;
        month: number;
        year?: number;
        hideYear: boolean;
    };
    address?: {
        street?: string;
        city?: string;
        state?: string;
        country?: string;
        postalCode?: string;
        fullAddress?: string;
    };
    websites?: Array<{
        url: string;
        type: 'personal' | 'company' | 'portfolio' | 'blog' | 'social' | 'other';
        label?: string;
    }>;
    privacy?: {
        phoneVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        birthdayVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        addressVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        phoneDiscovery?: 'anyone' | 'connections_only' | 'no_one';
        contactButtonVisibility?: 'public' | 'connections' | 'private' | 'me_only';
    };
}

// ==================== CONTACT CONTROLLER CLASS ====================

class ContactController {

    /**
     * ✅ CREATE NEW CONTACT
     * POST /api/v1/contact
     */
    static async createContact(
        req: Request<{}, any, CreateContactBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                LoggerUtil.warn('Create contact failed - No userId', { correlationId });
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const ipAddress = req.ip || 'unknown';

            LoggerUtil.info('Create contact request received', {
                userId,
                profileUrl: req.body.profileUrl,
                correlationId,
            });

            const contact = await ContactService.createContact({
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
                        action: 'CONTACT_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            contactId: contact.contactId,
                            profileUrl: contact.profileUrl,
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
            LoggerUtil.performance('contact_creation', duration, {
                userId,
                contactId: contact.contactId,
                correlationId,
            });

            ResponseUtil.created(res, { contact }, 'Contact created successfully');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Contact creation failed', {
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
                        action: 'CONTACT_CREATE_FAILED',
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

            if (error.message === 'Contact information already exists for this user') {
                ResponseUtil.conflict(res, 'Contact information already exists');
                return;
            }

            if (error.message.includes('Profile URL')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Contact creation failed. Please try again.'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ GET CONTACT BY USER ID
     * GET /api/v1/contact
     */
    static async getContact(
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

            LoggerUtil.info('Get contact request', { userId, correlationId });

            const contact = await ContactService.getContactByUserId(userId);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Contact fetched', {
                userId,
                contactId: contact.contactId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { contact }, 'Contact fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get contact failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Contact information not found') {
                ResponseUtil.notFound(res, 'Contact information not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET CONTACT BY ID
     * GET /api/v1/contact/:contactId
     */
    static async getContactById(
        req: Request<{ contactId: string }> & { user?: UserPayload },
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
            const { contactId } = req.params;

            if (!contactId) {
                ResponseUtil.badRequest(res, 'Contact ID is required');
                return;
            }

            LoggerUtil.info('Get contact by ID request', {
                userId,
                contactId,
                correlationId,
            });

            const contact = await ContactService.getContactById(contactId, userId);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Contact fetched', {
                userId,
                contactId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { contact }, 'Contact fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get contact by ID failed', {
                error: error.message,
                contactId: req.params.contactId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Contact not found') {
                ResponseUtil.notFound(res, 'Contact not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE CONTACT
     * PUT /api/v1/contact/:contactId
     */
    static async updateContact(
        req: Request<{ contactId: string }, any, UpdateContactBody> & { user?: UserPayload },
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
            const { contactId } = req.params;
            const ipAddress = req.ip || 'unknown';

            if (!contactId) {
                ResponseUtil.badRequest(res, 'Contact ID is required');
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

            LoggerUtil.info('Update contact request', {
                userId,
                contactId,
                updates: Object.keys(req.body),
                correlationId,
            });

            const contact = await ContactService.updateContact(
                contactId,
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
                        action: 'CONTACT_UPDATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            contactId,
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
            LoggerUtil.info('Contact updated', {
                userId,
                contactId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { contact }, 'Contact updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update contact failed', {
                error: error.message,
                contactId: req.params.contactId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Contact not found') {
                ResponseUtil.notFound(res, 'Contact not found');
                return;
            }

            if (error.message.includes('Profile URL')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE CONTACT
     * DELETE /api/v1/contact/:contactId
     */
    static async deleteContact(
        req: Request<{ contactId: string }> & { user?: UserPayload },
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
            const { contactId } = req.params;
            const permanent = req.query.permanent === 'true';
            const ipAddress = req.ip || 'unknown';

            if (!contactId) {
                ResponseUtil.badRequest(res, 'Contact ID is required');
                return;
            }

            LoggerUtil.info('Delete contact request', {
                userId,
                contactId,
                permanent,
                correlationId,
            });

            const result = await ContactService.deleteContact(contactId, userId, permanent);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'CONTACT_DELETED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: permanent ? 'HIGH' : 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: { contactId, permanent, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Contact deleted', {
                userId,
                contactId,
                permanent,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Contact deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete contact failed', {
                error: error.message,
                contactId: req.params.contactId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Contact not found') {
                ResponseUtil.notFound(res, 'Contact not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE CONTACT
     * POST /api/v1/contact/:contactId/archive
     */
    static async archiveContact(
        req: Request<{ contactId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { contactId } = req.params;

            const result = await ContactService.archiveContact(contactId, userId);

            LoggerUtil.info('Contact archived', { userId, contactId, correlationId });

            ResponseUtil.success(res, result, 'Contact archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive contact failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Contact not found') {
                ResponseUtil.notFound(res, 'Contact not found');
                return;
            }

            if (error.message === 'Contact is already archived') {
                ResponseUtil.badRequest(res, 'Contact is already archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE CONTACT
     * POST /api/v1/contact/:contactId/restore
     */
    static async restoreContact(
        req: Request<{ contactId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { contactId } = req.params;

            const result = await ContactService.restoreContact(contactId, userId);

            LoggerUtil.info('Contact restored', { userId, contactId, correlationId });

            ResponseUtil.success(res, result, 'Contact restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore contact failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Contact not found') {
                ResponseUtil.notFound(res, 'Contact not found');
                return;
            }

            if (error.message === 'Contact is not archived') {
                ResponseUtil.badRequest(res, 'Contact is not archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default ContactController;